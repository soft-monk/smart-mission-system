# ============================================================================
#  stop_all.ps1 - safe shutdown for mapApp runtime processes
#
#  Why PowerShell: on Windows a venv's python.exe is a launcher that re-executes
#  the base interpreter as a CHILD process, so the process actually LISTENING on
#  a port often has a command line without our repo path (e.g. bridge.py started
#  from .venv shows the base Python path). A plain command-line test therefore
#  misses it. This script verifies ownership by walking the PARENT CHAIN and
#  then kills the whole tree - which also closes the launcher console windows.
#
#  Modes:
#     services  -> C++ backend + AI bridge (default)
#     tiles     -> tile fetcher only
#     all       -> services + tile fetcher
#
#  Safety:
#     * a process is targeted only when a marker (mapapp.exe / bridge.py /
#       run_bridge.bat / run_server.bat / fetch_tiles.py) matches AND the process
#       or one of its ancestors was launched from this repository root
#     * this script's own process chain is always excluded
#     * node.exe and anything unrelated is never touched
# ============================================================================
param(
  [ValidateSet('services', 'tiles', 'all')]
  [string]$Mode = 'services',
  [string]$Repo = $env:MAPAPP_ROOT
)

$ErrorActionPreference = 'SilentlyContinue'

if (-not $Repo) { $Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path }
$Repo = $Repo.TrimEnd('\')

$serviceMarkers = @('mapapp.exe', 'bridge.py', 'run_bridge.bat', 'run_server.bat')
$tileMarkers    = @('fetch_tiles.py')

switch ($Mode) {
  'services' { $markers = $serviceMarkers }
  'tiles'    { $markers = $tileMarkers }
  default    { $markers = $serviceMarkers + $tileMarkers }
}

# ---- snapshot all processes once ------------------------------------------
$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine
$byId = @{}
foreach ($p in $all) { $byId[[int]$p.ProcessId] = $p }

# ---- exclude ourselves and our ancestors (batch -> powershell -> ...) ------
$selfChain = New-Object System.Collections.Generic.HashSet[int]
$cur = $byId[[int]$PID]
while ($cur) {
  [void]$selfChain.Add([int]$cur.ProcessId)
  if (-not $cur.ParentProcessId) { break }
  $cur = $byId[[int]$cur.ParentProcessId]
}

function Test-OwnedByRepo {
  param($proc)
  $node = $proc
  for ($i = 0; $i -lt 6 -and $node; $i++) {
    if ($node.CommandLine -and $node.CommandLine -like "*$Repo*") { return $true }
    if (-not $node.ParentProcessId) { return $false }
    $node = $byId[[int]$node.ParentProcessId]
  }
  return $false
}

# ---- candidates -----------------------------------------------------------
$candidates = @()
foreach ($p in $all) {
  if (-not $p.CommandLine) { continue }
  if ($selfChain.Contains([int]$p.ProcessId)) { continue }
  $matched = $false
  foreach ($m in $markers) { if ($p.CommandLine -like "*$m*") { $matched = $true; break } }
  if (-not $matched) { continue }
  if (-not (Test-OwnedByRepo $p)) { continue }
  $candidates += $p
}

if (-not $candidates) {
  Write-Host "nothing running for mode '$Mode'."
  exit 0
}

# ---- keep only tree roots (parents inside the candidate set are killed with them)
$candIds = New-Object System.Collections.Generic.HashSet[int]
foreach ($c in $candidates) { [void]$candIds.Add([int]$c.ProcessId) }
$roots = @()
foreach ($c in $candidates) {
  if (-not $candIds.Contains([int]$c.ParentProcessId)) { $roots += $c }
}

# ---- kill trees -----------------------------------------------------------
foreach ($r in $roots) {
  $label = if ($r.CommandLine.Length -gt 90) { $r.CommandLine.Substring(0, 90) + '...' } else { $r.CommandLine }
  Write-Host ("killing {0} PID {1}" -f $r.Name, $r.ProcessId)
  Write-Host ("        {0}" -f $label)
  & taskkill /PID $r.ProcessId /T /F 2>&1 | Out-Null
}

Start-Sleep -Milliseconds 400

# ---- verify ---------------------------------------------------------------
$left = @()
foreach ($p in (Get-CimInstance Win32_Process)) {
  if (-not $p.CommandLine) { continue }
  foreach ($m in $markers) {
    if ($p.CommandLine -like "*$m*" -and $p.CommandLine -like "*$Repo*") { $left += $p; break }
  }
}
if ($left.Count -gt 0) {
  Write-Host ("[warn] {0} process(es) still matching - inspect manually:" -f $left.Count)
  $left | ForEach-Object { Write-Host ("   PID {0} {1}" -f $_.ProcessId, $_.Name) }
  exit 1
}
Write-Host "stopped."
exit 0
