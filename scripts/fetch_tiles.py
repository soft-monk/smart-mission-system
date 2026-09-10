"""下载底图瓦片到 tiles/ 目录（本地托管，离线可用）

数据源：Esri ArcGIS World Imagery（全球卫星影像，真实地形纹理，无需 API Key）
  https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
  署名：Esri, Maxar, Earthstar Geographics, and the GIS User Community
  说明：前端会用暗色滤镜压暗，做成指挥中心深色风格。

曾试过但不可用：
  - CARTO dark_all：现要求 API Key，返回带 "API KEY REQUIRED" 水印的图，勿再使用。
  - OSM 官方瓦片：直连超时（其 usage policy 也不允许批量抓取）。
  - OpenTopoMap：直连超时。

覆盖策略（够用即可，控制体积）：
  全球   z0–z6   概览
  北京   z7–z14  场景一（默认地图中心 116.3974, 39.9093）
  上海   z7–z13  场景二（121.4737, 31.2304）
"""
from __future__ import annotations

import math
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tiles" / "raster"
# ArcGIS 的瓦片顺序是 {z}/{y}/{x}
TPL = ("https://server.arcgisonline.com/ArcGIS/rest/services/"
       "World_Imagery/MapServer/tile/{z}/{y}/{x}")
UA = "mapapp-tile-cache/1.0 (local demo cache)"
# 直连（不读环境代理）。实测：ArcGIS 直连可用；若你的网络必须走代理，
# 设 MAPAPP_TILE_PROXY=http://127.0.0.1:7897 显式启用。
PROXY = os.environ.get("MAPAPP_TILE_PROXY", "")


def make_opener():
    """显式构造 opener：PROXY 为空时忽略所有环境代理变量。"""
    if PROXY:
        return urllib.request.build_opener(
            urllib.request.ProxyHandler({"http": PROXY, "https": PROXY})
        )
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))  # 直连


OPENER = make_opener()

REGIONS = [
    # (名称, 南纬/西经, 北纬/东经, 最小z, 最大z)
    ("world",   -85.0, -180.0,  85.0,  180.0, 0, 6),
    ("beijing",  39.4,  115.6,  40.6,  117.2, 7, 14),
    ("shanghai", 30.6,  120.8,  31.9,  122.1, 7, 13),
]


def lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[int, int]:
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    lat_r = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(lat_r)) / math.pi) / 2.0 * n)
    return max(0, min(n - 1, x)), max(0, min(n - 1, y))


def build_list() -> list[tuple[int, int, int]]:
    tiles: set[tuple[int, int, int]] = set()
    for _name, s, w, n_, e, zmin, zmax in REGIONS:
        for z in range(zmin, zmax + 1):
            x0, y0 = lonlat_to_tile(w, n_, z)   # 西北角
            x1, y1 = lonlat_to_tile(e, s, z)    # 东南角
            for x in range(min(x0, x1), max(x0, x1) + 1):
                for y in range(min(y0, y1), max(y0, y1) + 1):
                    tiles.add((z, x, y))
    return sorted(tiles)


def fetch(z: int, x: int, y: int) -> tuple[int, int, int, str]:
    dst = OUT / str(z) / str(x) / f"{y}.jpg"
    if dst.exists() and dst.stat().st_size > 0:
        return z, x, y, "skip"
    dst.parent.mkdir(parents=True, exist_ok=True)
    url = TPL.format(z=z, x=x, y=y)
    last = ""
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with OPENER.open(req, timeout=25) as r:
                data = r.read()
            if not data:
                last = "empty"
                continue
            tmp = dst.with_suffix(".part")
            tmp.write_bytes(data)
            tmp.replace(dst)
            return z, x, y, "ok"
        except Exception as exc:  # noqa: BLE001
            last = f"{type(exc).__name__}{getattr(exc, 'code', '')}"
            time.sleep(0.4 * (attempt + 1))
    return z, x, y, f"fail:{last}"


def main() -> int:
    tiles = build_list()
    print(f"待下载瓦片: {len(tiles)} 张")
    print(f"输出目录  : {OUT}")
    print(f"代理      : {PROXY or '(直连)'}")

    ok = skip = fail = 0
    fails: list[str] = []
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = [pool.submit(fetch, z, x, y) for z, x, y in tiles]
        for i, fut in enumerate(as_completed(futures), 1):
            z, x, y, status = fut.result()
            if status == "ok":
                ok += 1
            elif status == "skip":
                skip += 1
            else:
                fail += 1
                if len(fails) < 15:
                    fails.append(f"{z}/{x}/{y} {status}")
            if i % 200 == 0 or i == len(tiles):
                el = time.time() - t0
                print(f"  进度 {i}/{len(tiles)}  ok={ok} skip={skip} fail={fail}  {el:.0f}s")

    total_bytes = sum(f.stat().st_size for f in OUT.rglob("*.png"))
    print(f"\n完成：新增 {ok}，已存在 {skip}，失败 {fail}")
    print(f"目录体积：{total_bytes / 1024 / 1024:.1f} MB")
    if fails:
        print("失败样例：")
        for f in fails:
            print("  " + f)
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
