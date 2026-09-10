# -*- coding: utf-8 -*-
"""智能任务管理系统 · Python AI 桥（FastAPI，仅本机 127.0.0.1）。

职责（契约 §1 / §3.8、概要设计 3.4）：
- `GET  /health`  各能力可用性：`{"status":"ok","llm":bool,"stt":bool,"tts":bool}`
- `POST /chat`    `{missionId?, scene, prompt, context?}` → `{text, provider:"llm"|"rule", intent, plan?, plans?}`
- `POST /stt`     音频字节（multipart 或裸字节）→ `{text, provider}`
- `POST /tts`     `{text}` → 音频字节（在线 `audio/mpeg`；离线本地合成 WAV/MP3）

硬性行为：
1. 仅监听 `127.0.0.1:8090`（`config.json` 可改；改成对外地址会打警告日志）。
2. **LLM 优先、规则兜底**：有 Key 且网络可用时走 OpenAI 兼容 API；超时/报错/无 Key
   **静默降级**到 `rules.py`，由 `provider` 字段体现，**任何外网异常都不返回 5xx**。
3. `/stt` 无 Key 返回 `{"text":"","provider":"unavailable"}` + HTTP 200；
   `/tts` 无 Key 返回本地合成音频（有 ffmpeg 转 mp3，否则 WAV），HTTP 200。
4. 配置来源：`config.json` → 环境变量覆盖（`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `AI_BRIDGE_*`）。
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import contextlib
import json
import logging
import math
import os
import shutil
import struct
import subprocess
import tempfile
import time
import wave
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from typing import Any, Final

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from starlette.datastructures import UploadFile as StarletteUploadFile

import rules

BASE_DIR: Final[Path] = Path(__file__).resolve().parent
CONFIG_FILE: Final[Path] = BASE_DIR / "config.json"

LOG = logging.getLogger("ai.bridge")

LOCAL_HOSTS: Final[frozenset[str]] = frozenset({"127.0.0.1", "localhost", "::1"})
PLAN_NAME_KEYS: Final[tuple[str, ...]] = ("name", "method", "groups", "successRate", "effect", "reason", "recommended")


# ======================================================================================
# 配置
# ======================================================================================


@dataclass
class TtsFallbackConfig:
    """离线 TTS 兜底参数（本地合成占位音频）。"""

    mode: str = "tone"  # tone=简单音调 | silence=静音
    min_seconds: float = 0.3
    seconds_per_char: float = 0.05
    max_seconds: float = 4.0
    sample_rate: int = 16000
    frequency: float = 660.0
    amplitude: float = 0.25
    prefer_mp3: bool = True  # 有 ffmpeg 时把 WAV 转 mp3，满足 audio/mpeg


@dataclass
class BridgeConfig:
    host: str = "127.0.0.1"
    port: int = 8090
    api_key: str = ""
    base_url: str = "https://api.openai.com/v1"
    chat_model: str = "gpt-4o-mini"
    stt_model: str = "whisper-1"
    tts_model: str = "tts-1"
    tts_voice: str = "alloy"
    enable_llm: bool = True
    enable_stt: bool = True
    enable_tts: bool = True
    llm_timeout_sec: float = 12.0
    speech_timeout_sec: float = 20.0
    llm_json_mode: bool = True
    rule_first_for_demo: bool = False  # True=演示意图即使有 Key 也走规则（保证逐字口径）
    health_probe: bool = True
    health_probe_interval_sec: float = 60.0
    connect_timeout_sec: float = 5.0
    max_tts_chars: int = 4000
    ffmpeg_path: str = ""
    log_level: str = "INFO"
    scene_default: str = rules.DEFAULT_SCENE
    tts_fallback: TtsFallbackConfig = field(default_factory=TtsFallbackConfig)

    @property
    def has_key(self) -> bool:
        return bool(self.api_key.strip())

    def endpoint(self, path: str) -> str:
        return f"{self.base_url.rstrip('/')}/{path.lstrip('/')}"

    def summary(self) -> str:
        return (
            f"host={self.host} port={self.port} baseUrl={self.base_url} "
            f"chatModel={self.chat_model} sttModel={self.stt_model} ttsModel={self.tts_model} "
            f"apiKey={'set' if self.has_key else 'absent'} "
            f"enableLlm={self.enable_llm} enableStt={self.enable_stt} enableTts={self.enable_tts} "
            f"ruleFirstForDemo={self.rule_first_for_demo} jsonMode={self.llm_json_mode}"
        )


def _as_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    text = str(value).strip().lower()
    if text in ("1", "true", "yes", "on", "y"):
        return True
    if text in ("0", "false", "no", "off", "n", ""):
        return False
    return default


def _as_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_int(value: Any, default: int) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _pick(data: dict[str, Any], *names: str, default: Any = None) -> Any:
    for name in names:
        if name in data and data[name] not in (None, ""):
            return data[name]
    return default


def load_config(path: Path = CONFIG_FILE) -> BridgeConfig:
    """读取 config.json（缺失/损坏则用默认值）并应用环境变量覆盖。"""
    data: dict[str, Any] = {}
    try:
        with path.open("r", encoding="utf-8") as handle:
            loaded = json.load(handle)
        if isinstance(loaded, dict):
            data = loaded
        else:
            LOG.warning("config.json 顶层不是对象，已忽略：%s", path)
    except FileNotFoundError:
        LOG.warning("未找到 %s，使用内置默认配置（127.0.0.1:8090）", path)
    except (OSError, ValueError) as exc:
        LOG.warning("读取 %s 失败（%s），使用内置默认配置", path, exc)

    fallback_raw = data.get("ttsFallback")
    fallback_raw = fallback_raw if isinstance(fallback_raw, dict) else {}
    default_fallback = TtsFallbackConfig()

    cfg = BridgeConfig(
        host=str(os.environ.get("AI_BRIDGE_HOST") or _pick(data, "host", "listenHost", default=BridgeConfig.host)),
        port=_as_int(os.environ.get("AI_BRIDGE_PORT") or _pick(data, "port", "listenPort", default=BridgeConfig.port), BridgeConfig.port),
        api_key=str(os.environ.get("OPENAI_API_KEY") or _pick(data, "apiKey", "api_key", default="")),
        base_url=str(os.environ.get("OPENAI_BASE_URL") or _pick(data, "baseUrl", "base_url", default=BridgeConfig.base_url)),
        chat_model=str(os.environ.get("OPENAI_CHAT_MODEL") or os.environ.get("OPENAI_MODEL") or _pick(data, "chatModel", default=BridgeConfig.chat_model)),
        stt_model=str(os.environ.get("OPENAI_STT_MODEL") or _pick(data, "sttModel", default=BridgeConfig.stt_model)),
        tts_model=str(os.environ.get("OPENAI_TTS_MODEL") or _pick(data, "ttsModel", default=BridgeConfig.tts_model)),
        tts_voice=str(os.environ.get("OPENAI_TTS_VOICE") or _pick(data, "ttsVoice", default=BridgeConfig.tts_voice)),
        enable_llm=_as_bool(os.environ.get("AI_ENABLE_LLM") or _pick(data, "enableLlm", default=True), True),
        enable_stt=_as_bool(os.environ.get("AI_ENABLE_STT") or _pick(data, "enableStt", default=True), True),
        enable_tts=_as_bool(os.environ.get("AI_ENABLE_TTS") or _pick(data, "enableTts", default=True), True),
        llm_timeout_sec=_as_float(_pick(data, "llmTimeoutSec", default=BridgeConfig.llm_timeout_sec), BridgeConfig.llm_timeout_sec),
        speech_timeout_sec=_as_float(_pick(data, "speechTimeoutSec", default=BridgeConfig.speech_timeout_sec), BridgeConfig.speech_timeout_sec),
        llm_json_mode=_as_bool(_pick(data, "llmJsonMode", default=True), True),
        rule_first_for_demo=_as_bool(
            os.environ.get("AI_RULE_FIRST") or _pick(data, "ruleFirstForDemoIntents", default=False), False
        ),
        health_probe=_as_bool(_pick(data, "healthProbe", default=True), True),
        health_probe_interval_sec=_as_float(_pick(data, "healthProbeIntervalSec", default=60.0), 60.0),
        connect_timeout_sec=_as_float(_pick(data, "connectTimeoutSec", default=5.0), 5.0),
        max_tts_chars=_as_int(_pick(data, "maxTtsChars", default=4000), 4000),
        ffmpeg_path=str(_pick(data, "ffmpegPath", default="")),
        log_level=str(os.environ.get("AI_LOG_LEVEL") or _pick(data, "logLevel", default="INFO")),
        scene_default=rules.normalize_scene(_pick(data, "sceneDefault", default=rules.DEFAULT_SCENE)),
        tts_fallback=TtsFallbackConfig(
            mode=str(_pick(fallback_raw, "mode", default=default_fallback.mode)),
            min_seconds=_as_float(_pick(fallback_raw, "minSeconds", default=default_fallback.min_seconds), default_fallback.min_seconds),
            seconds_per_char=_as_float(_pick(fallback_raw, "secondsPerChar", default=default_fallback.seconds_per_char), default_fallback.seconds_per_char),
            max_seconds=_as_float(_pick(fallback_raw, "maxSeconds", default=default_fallback.max_seconds), default_fallback.max_seconds),
            sample_rate=_as_int(_pick(fallback_raw, "sampleRate", default=default_fallback.sample_rate), default_fallback.sample_rate),
            frequency=_as_float(_pick(fallback_raw, "frequency", default=default_fallback.frequency), default_fallback.frequency),
            amplitude=_as_float(_pick(fallback_raw, "amplitude", default=default_fallback.amplitude), default_fallback.amplitude),
            prefer_mp3=_as_bool(_pick(fallback_raw, "preferMp3", default=True), True),
        ),
    )

    if cfg.host not in LOCAL_HOSTS:
        LOG.warning(
            "config.json 中 host=%s 不是本机地址；契约 §1 要求 AI 桥仅监听 127.0.0.1（对外暴露风险自负）",
            cfg.host,
        )
    if not cfg.has_key:
        LOG.info("未检测到 OPENAI_API_KEY / config.json apiKey：/chat、/stt、/tts 将全部走本地兜底")
    return cfg


CONFIG: BridgeConfig = load_config()


# ======================================================================================
# 远端可用性状态（/health 的 llm/stt/tts 依据；失败即降级，不阻塞请求）
# ======================================================================================


@dataclass
class RemoteState:
    reachable: bool | None = None  # None=未探测（有 Key 时先按可用处理）
    detail: str = "not-probed"
    checked_at: float = 0.0


REMOTE: Final[RemoteState] = RemoteState()


def _remote_ok(kind: str) -> bool:
    """在线能力是否可用：需有 Key、该能力启用、且最近一次探测未判定不可达。"""
    enabled = {"llm": CONFIG.enable_llm, "stt": CONFIG.enable_stt, "tts": CONFIG.enable_tts}.get(kind, False)
    if not CONFIG.has_key or not enabled:
        return False
    return REMOTE.reachable is not False


def _mark_remote(ok: bool, detail: str) -> None:
    if REMOTE.reachable is not ok or REMOTE.detail != detail:
        LOG.info("在线 AI 能力状态：%s（%s）", "可用" if ok else "不可用，已降级规则兜底", detail)
    REMOTE.reachable = ok
    REMOTE.detail = detail
    REMOTE.checked_at = time.time()


async def _probe_remote(client: httpx.AsyncClient) -> None:
    """轻量探活：GET {base}/models。连接失败/401/5xx 视为不可用；404/405 视为端点存在即可用。"""
    if not CONFIG.has_key:
        return
    try:
        resp = await client.get(
            CONFIG.endpoint("models"),
            headers={"Authorization": f"Bearer {CONFIG.api_key}"},
            timeout=CONFIG.connect_timeout_sec,
        )
        if resp.status_code in (401, 403):
            _mark_remote(False, f"probe-http-{resp.status_code}")
        elif resp.status_code >= 500:
            _mark_remote(False, f"probe-http-{resp.status_code}")
        else:
            _mark_remote(True, f"probe-http-{resp.status_code}")
    except Exception as exc:  # noqa: BLE001 —— 探活失败一律降级
        _mark_remote(False, f"probe-error:{type(exc).__name__}")


async def _probe_loop(client: httpx.AsyncClient) -> None:
    while True:
        try:
            if CONFIG.health_probe and CONFIG.has_key:
                await _probe_remote(client)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            LOG.debug("探活循环异常：%s", exc)
        await asyncio.sleep(max(10.0, CONFIG.health_probe_interval_sec))


# ======================================================================================
# 应用生命周期
# ======================================================================================


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    logging.basicConfig(
        level=getattr(logging, CONFIG.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )
    LOG.info("Python AI 桥启动：%s", CONFIG.summary())
    LOG.info("规则兜底引擎：%d 条意图规则 / %d 句逐字文案 / %d 套方案", len(rules.INTENT_RULES), sum(1 for _ in rules.iter_voice_lines()), sum(len(v) for t in rules.PLANS.values() for v in t.values()))
    # trust_env=False：本进程只连本机 C++ 反代与（可选）上游 API，不读取
    # HTTP_PROXY/HTTPS_PROXY/NO_PROXY。否则环境里的 no_proxy 若含 httpx 无法解析的写法
    # （如 "[::1]"），会在建客户端时抛 InvalidURL 直接导致启动失败。
    client = httpx.AsyncClient(follow_redirects=True, trust_env=False)
    app.state.http = client
    probe_task: asyncio.Task[None] | None = None
    if CONFIG.has_key and CONFIG.health_probe:
        probe_task = asyncio.create_task(_probe_loop(client), name="ai-probe")
    try:
        yield
    finally:
        if probe_task is not None:
            probe_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await probe_task
        await client.aclose()
        LOG.info("Python AI 桥已停止")


app = FastAPI(
    title="智能任务管理系统 · Python AI 桥",
    version="1.0.0",
    description="契约 §3.8 AI 与语音接口：/health、/chat、/stt、/tts（离线规则兜底可独立跑通全部演示）",
    lifespan=lifespan,
)


@app.middleware("http")
async def log_requests(request: Request, call_next: Any) -> Response:
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:  # noqa: BLE001 —— 交给异常处理器，这里只记日志
        LOG.exception("请求处理异常：%s %s", request.method, request.url.path)
        raise
    elapsed_ms = (time.perf_counter() - started) * 1000.0
    LOG.info("%s %s -> %d (%.0f ms)", request.method, request.url.path, response.status_code, elapsed_ms)
    return response


def _http_client(request: Request) -> httpx.AsyncClient:
    client = getattr(request.app.state, "http", None)
    if client is None:  # 理论上 lifespan 已建；兜底避免 AttributeError 冒泡成 5xx
        client = httpx.AsyncClient(follow_redirects=True, trust_env=False)
        request.app.state.http = client
    return client


# ======================================================================================
# 请求模型（宽松校验：字段缺失/类型异常一律降级，不因 422 打断前端链路）
# ======================================================================================


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    missionId: str | None = Field(default=None, description="任务 ID（可选，透传）")
    scene: str | None = Field(default=None, description="场景：scenario-1 / scenario-2（亦接受 场景一/场景二）")
    prompt: str = Field(default="", description="用户提问或待播报关键词")
    context: dict[str, Any] | None = Field(default=None, description="上下文：{phase:'T5', side:'strike'|'group'} 等")

    @field_validator("missionId", "scene", mode="before")
    @classmethod
    def _coerce_optional_str(cls, value: Any) -> Any:
        if value is None or isinstance(value, str):
            return value
        return str(value)

    @field_validator("prompt", mode="before")
    @classmethod
    def _coerce_prompt(cls, value: Any) -> str:
        return "" if value is None else str(value)

    @field_validator("context", mode="before")
    @classmethod
    def _coerce_context(cls, value: Any) -> Any:
        if value is None or isinstance(value, dict):
            return value
        LOG.warning("context 不是对象（%s），已忽略", type(value).__name__)
        return None


class TtsRequest(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    text: str = Field(default="", description="待合成文本")
    voice: str | None = Field(default=None, description="音色（默认取 config.json ttsVoice）")
    format: str | None = Field(default=None, description="期望格式：mp3 / wav（离线兜底可忽略）")
    scene: str | None = Field(default=None, description="场景（可选，仅用于日志）")
    missionId: str | None = Field(default=None)

    @field_validator("text", mode="before")
    @classmethod
    def _coerce_text(cls, value: Any) -> str:
        return "" if value is None else str(value)

    @field_validator("voice", "format", "scene", "missionId", mode="before")
    @classmethod
    def _coerce_optional_str(cls, value: Any) -> Any:
        if value is None or isinstance(value, str):
            return value
        return str(value)


# ======================================================================================
# /health
# ======================================================================================


@app.get("/health", summary="能力自检（llm/stt/tts 是否可用）")
async def health() -> JSONResponse:
    return JSONResponse(
        {
            "status": "ok",
            "llm": _remote_ok("llm"),
            "stt": _remote_ok("stt"),
            "tts": _remote_ok("tts"),
        }
    )


# ======================================================================================
# /chat
# ======================================================================================


def _system_prompt(scene: str, side: str, reference: str) -> str:
    vocab = rules.plan_vocabulary(scene)
    names = "；".join(f"{key}={ '、'.join(value) }" for key, value in vocab.items())
    lines = [
        f"你是「智能任务管理系统」的 AI 决策助手，当前场景：{rules.SCENE_NAMES.get(scene, scene)}（{scene}）。",
        "只输出一个 JSON 对象，不要输出 Markdown 代码块或多余解释，格式：",
        '{"text": "面向指挥员的中文答复", "plan": {方案对象} 或 null}',
        "plan 结构："
        '{"name": 方案名, "method": 打击/编组方式, "groups": [参与集群名...], '
        '"successRate": 整数百分比, "effect": 效果, "reason": 推荐理由, "recommended": true/false}',
        f"方案名必须逐字取自下列清单，不得改写：{names}",
        f"本轮方案侧别默认：{side}（group=编组侧 T1，strike=打击侧 T5）。",
        "答复保持简洁专业（1-3 句），术语与口径与系统一致；不需要方案时 plan 返回 null。",
    ]
    if reference:
        lines.append(f"本次提问已命中系统既定口径，text 必须逐字采用该口径：{reference}")
    return "\n".join(lines)


def _extract_json_object(text: str) -> dict[str, Any] | None:
    raw = text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:]
    for candidate in (raw, raw[raw.find("{") : raw.rfind("}") + 1] if "{" in raw and "}" in raw else ""):
        if not candidate:
            continue
        try:
            parsed = json.loads(candidate)
        except (ValueError, TypeError):
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def _snap_plan_name(name: str, scene: str, side: str) -> str:
    """把 LLM 产出的方案名对齐到契约逐字清单（含"方案一/二/三"序号匹配）。"""
    if name in rules.all_plan_names():
        return name
    candidates = rules.build_plans(scene, side)
    for index, marker in enumerate(("方案一", "方案二", "方案三")):
        if marker in name and index < len(candidates):
            return str(candidates[index]["name"])
    return name


def _coerce_plan(raw: Any, scene: str, side: str) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    name = str(raw.get("name") or "").strip()
    if not name:
        return None
    groups_raw = raw.get("groups")
    if isinstance(groups_raw, (list, tuple)):
        groups = [str(item).strip() for item in groups_raw if str(item).strip()]
    elif groups_raw:
        groups = [str(groups_raw).strip()]
    else:
        groups = []
    try:
        success_rate: int | None = int(round(float(raw.get("successRate"))))
    except (TypeError, ValueError):
        success_rate = None
    return {
        "name": _snap_plan_name(name, scene, side),
        "method": str(raw.get("method") or "").strip(),
        "groups": groups,
        "successRate": success_rate,
        "effect": str(raw.get("effect") or "").strip(),
        "reason": str(raw.get("reason") or "").strip(),
        "recommended": bool(raw.get("recommended")),
    }


async def _try_llm(
    client: httpx.AsyncClient,
    scene: str,
    side: str,
    prompt: str,
    context: dict[str, Any] | None,
    reference: str,
) -> dict[str, Any] | None:
    """调用 OpenAI 兼容 /chat/completions；任何失败返回 None（由调用方降级规则）。"""
    messages: list[dict[str, str]] = [{"role": "system", "content": _system_prompt(scene, side, reference)}]
    user_content = prompt
    if context:
        try:
            user_content = f"{prompt}\n\n[上下文] {json.dumps(context, ensure_ascii=False)}"
        except (TypeError, ValueError):
            user_content = prompt
    messages.append({"role": "user", "content": user_content})

    payload: dict[str, Any] = {"model": CONFIG.chat_model, "messages": messages, "temperature": 0.3}
    if CONFIG.llm_json_mode:
        payload["response_format"] = {"type": "json_object"}

    try:
        resp = await client.post(
            CONFIG.endpoint("chat/completions"),
            headers={"Authorization": f"Bearer {CONFIG.api_key}", "Content-Type": "application/json"},
            json=payload,
            timeout=httpx.Timeout(CONFIG.llm_timeout_sec, connect=CONFIG.connect_timeout_sec),
        )
        if resp.status_code == 400 and CONFIG.llm_json_mode:
            # 部分兼容端点不支持 response_format，去掉后重试一次
            payload.pop("response_format", None)
            resp = await client.post(
                CONFIG.endpoint("chat/completions"),
                headers={"Authorization": f"Bearer {CONFIG.api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=httpx.Timeout(CONFIG.llm_timeout_sec, connect=CONFIG.connect_timeout_sec),
            )
        resp.raise_for_status()
        data = resp.json()
        content = str(data["choices"][0]["message"]["content"])
    except Exception as exc:  # noqa: BLE001 —— 外网任何异常都只降级
        LOG.warning("LLM 调用失败，降级规则兜底：%s: %s", type(exc).__name__, exc)
        _mark_remote(False, f"chat-error:{type(exc).__name__}")
        return None

    _mark_remote(True, "chat-ok")
    parsed = _extract_json_object(content)
    if parsed is None:
        text = content.strip()
        return {"text": text, "plan": None, "plans": None} if text else None

    plans_raw = parsed.get("plans")
    plans = [_coerce_plan(item, scene, side) for item in plans_raw] if isinstance(plans_raw, list) else []
    plans = [plan for plan in plans if plan]
    plan = _coerce_plan(parsed.get("plan"), scene, side)
    text = str(parsed.get("text") or "").strip() or content.strip()
    return {"text": text, "plan": plan, "plans": plans or None}


async def _chat_payload(req: ChatRequest, request: Request) -> dict[str, Any]:
    """生成 /chat 响应体：LLM 优先、规则兜底，两条路都不会抛异常。"""
    scene = rules.normalize_scene(req.scene or CONFIG.scene_default)
    context = req.context or {}
    rule_answer = rules.answer(req.prompt, scene, context)
    side = rules.plan_side(context, default=("strike" if rule_answer.side == "strike" else "group"))

    use_llm = (
        _remote_ok("llm")
        and bool(req.prompt.strip())
        and not (CONFIG.rule_first_for_demo and rule_answer.matched)
    )
    if use_llm:
        llm_result = await _try_llm(_http_client(request), scene, side, req.prompt, req.context, rule_answer.text if rule_answer.matched else "")
        if llm_result is not None:
            payload: dict[str, Any] = {
                "text": llm_result["text"],
                "provider": "llm",
                "intent": rule_answer.intent,
                "scene": scene,
            }
            plan = llm_result.get("plan") or (rule_answer.plan if rule_answer.plan else None)
            plans = llm_result.get("plans") or rule_answer.plans
            if plan:
                payload["plan"] = plan
            if plans:
                payload["plans"] = plans
            return payload

    payload = rule_answer.to_dict()
    payload["provider"] = "rule"
    return payload


@app.post("/chat", summary="LLM 对话 / 方案推荐（失败自动规则兜底）")
async def chat(req: ChatRequest, request: Request) -> JSONResponse:
    started = time.perf_counter()
    try:
        payload = await _chat_payload(req, request)
    except Exception:  # noqa: BLE001 —— 绝不让 /chat 返回 5xx
        LOG.exception("/chat 未预期异常，返回规则兜底")
        payload = rules.answer(req.prompt, req.scene or CONFIG.scene_default, req.context).to_dict()
        payload["provider"] = "rule"
    LOG.info(
        "/chat scene=%s provider=%s intent=%s prompt=%r %.0fms",
        payload.get("scene"),
        payload.get("provider"),
        payload.get("intent"),
        req.prompt[:40],
        (time.perf_counter() - started) * 1000.0,
    )
    return JSONResponse(payload)


# ======================================================================================
# /stt
# ======================================================================================


async def _extract_audio(request: Request) -> tuple[bytes, str, str]:
    """从 multipart 或裸字节体中取出音频（返回 音频/文件名/内容类型）。"""
    content_type = (request.headers.get("content-type") or "").lower()
    if content_type.startswith("multipart/form-data") or content_type.startswith("application/x-www-form-urlencoded"):
        form = await request.form()
        for key in ("file", "audio", "audioFile", "data", "upload"):
            item = form.get(key)
            if isinstance(item, StarletteUploadFile):
                return await item.read(), str(item.filename or ""), str(item.content_type or "")
        for _, item in form.multi_items():
            if isinstance(item, StarletteUploadFile):
                return await item.read(), str(item.filename or ""), str(item.content_type or "")
        return b"", "", ""

    body = await request.body()
    if not body:
        return b"", "", content_type
    if content_type.startswith("application/json"):
        try:
            parsed = json.loads(body.decode("utf-8", "ignore"))
        except (ValueError, TypeError):
            return b"", "", content_type
        if isinstance(parsed, dict):
            for key in ("audioBase64", "audio_base64", "audio", "data", "file"):
                value = parsed.get(key)
                if isinstance(value, str) and value:
                    try:
                        return base64.b64decode(value, validate=False), "", "audio/wav"
                    except (ValueError, TypeError):
                        return b"", "", content_type
        return b"", "", content_type
    return body, "", content_type


async def _transcribe(client: httpx.AsyncClient, audio: bytes, filename: str, content_type: str) -> str:
    files = {"file": (filename or "audio.wav", audio, content_type or "audio/wav")}
    data = {"model": CONFIG.stt_model}
    resp = await client.post(
        CONFIG.endpoint("audio/transcriptions"),
        headers={"Authorization": f"Bearer {CONFIG.api_key}"},
        files=files,
        data=data,
        timeout=httpx.Timeout(CONFIG.speech_timeout_sec, connect=CONFIG.connect_timeout_sec),
    )
    resp.raise_for_status()
    parsed = resp.json()
    return str(parsed.get("text") or "").strip() if isinstance(parsed, dict) else ""


async def _stt_payload(request: Request) -> dict[str, Any]:
    try:
        audio, filename, content_type = await _extract_audio(request)
    except Exception as exc:  # noqa: BLE001
        LOG.warning("读取音频失败：%s: %s", type(exc).__name__, exc)
        return {"text": "", "provider": "unavailable", "reason": "audio-read-error"}

    if not audio:
        return {"text": "", "provider": "unavailable", "reason": "empty-audio"}
    if not _remote_ok("stt"):
        if not CONFIG.has_key:
            reason = "no-api-key"
        elif not CONFIG.enable_stt:
            reason = "disabled"
        else:
            reason = "upstream-unreachable"
        LOG.info("/stt 无在线能力（%s），返回空文本占位", REMOTE.detail if CONFIG.has_key else "no-api-key")
        return {"text": "", "provider": "unavailable", "reason": reason}

    try:
        text = await _transcribe(_http_client(request), audio, filename, content_type)
        _mark_remote(True, "stt-ok")
    except Exception as exc:  # noqa: BLE001 —— 外网异常降级，不返回 5xx
        LOG.warning("STT 调用失败，降级返回空文本：%s: %s", type(exc).__name__, exc)
        _mark_remote(False, f"stt-error:{type(exc).__name__}")
        return {"text": "", "provider": "unavailable", "reason": "upstream-error"}
    return {"text": text, "provider": "llm", "reason": "ok"}


@app.post("/stt", summary="语音识别（无 Key 返回空文本占位，HTTP 200）")
async def stt(request: Request) -> JSONResponse:
    try:
        payload = await _stt_payload(request)
    except Exception:  # noqa: BLE001
        LOG.exception("/stt 未预期异常，返回占位")
        payload = {"text": "", "provider": "unavailable", "reason": "internal-error"}
    return JSONResponse(payload)


# ======================================================================================
# /tts
# ======================================================================================


def _render_wav(pcm: bytes, sample_rate: int) -> bytes:
    buffer = BytesIO()
    with wave.open(buffer, "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(sample_rate)
        writer.writeframes(pcm)
    return buffer.getvalue()


def _fallback_wav(text: str) -> tuple[bytes, int]:
    """本地合成占位音频（纯标准库），返回 (wav 字节, 毫秒)。"""
    cfg = CONFIG.tts_fallback
    seconds = min(cfg.max_seconds, max(cfg.min_seconds, cfg.min_seconds + cfg.seconds_per_char * len(text)))
    frames = max(1, int(seconds * cfg.sample_rate))
    if cfg.mode == "silence":
        pcm = b"\x00\x00" * frames
    else:
        fade = max(1, int(0.01 * cfg.sample_rate))
        amp = max(0.0, min(1.0, cfg.amplitude)) * 32767.0
        samples = bytearray()
        for index in range(frames):
            envelope = min(1.0, index / fade, (frames - index - 1) / fade)
            value = int(amp * envelope * math.sin(2.0 * math.pi * cfg.frequency * index / cfg.sample_rate))
            samples += struct.pack("<h", max(-32768, min(32767, value)))
        pcm = bytes(samples)
    return _render_wav(pcm, cfg.sample_rate), int(seconds * 1000)


_FFMPEG_CACHE: dict[str, str | None] = {}


def _ffmpeg_exe() -> str | None:
    if "path" not in _FFMPEG_CACHE:
        candidate = CONFIG.ffmpeg_path.strip()
        if candidate and Path(candidate).exists():
            _FFMPEG_CACHE["path"] = candidate
        else:
            _FFMPEG_CACHE["path"] = shutil.which("ffmpeg")
        LOG.info("ffmpeg：%s", _FFMPEG_CACHE["path"] or "未找到（离线兜底返回 WAV）")
    return _FFMPEG_CACHE["path"]


def _wav_to_mp3(wav_bytes: bytes) -> bytes | None:
    """用 ffmpeg 把兜底 WAV 转 mp3（契约要求 audio/mpeg）；无 ffmpeg 或失败返回 None。"""
    if not CONFIG.tts_fallback.prefer_mp3:
        return None
    exe = _ffmpeg_exe()
    if not exe:
        return None
    try:
        with tempfile.TemporaryDirectory(prefix="ai-tts-") as tmp:
            src = Path(tmp) / "fallback.wav"
            dst = Path(tmp) / "fallback.mp3"
            src.write_bytes(wav_bytes)
            proc = subprocess.run(  # noqa: S603 —— 固定参数、无 shell
                [exe, "-y", "-hide_banner", "-loglevel", "error", "-i", str(src), "-codec:a", "libmp3lame", "-b:a", "64k", str(dst)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=8,
                check=False,
            )
            if proc.returncode == 0 and dst.exists() and dst.stat().st_size > 0:
                return dst.read_bytes()
            LOG.warning("ffmpeg 转 mp3 失败（exit=%s），改用 WAV", proc.returncode)
    except Exception as exc:  # noqa: BLE001
        LOG.warning("ffmpeg 转 mp3 异常（%s: %s），改用 WAV", type(exc).__name__, exc)
    return None


async def _synthesize(client: httpx.AsyncClient, text: str, voice: str | None) -> tuple[bytes, str] | None:
    payload = {
        "model": CONFIG.tts_model,
        "input": text,
        "voice": voice or CONFIG.tts_voice,
        "response_format": "mp3",
    }
    resp = await client.post(
        CONFIG.endpoint("audio/speech"),
        headers={"Authorization": f"Bearer {CONFIG.api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=httpx.Timeout(CONFIG.speech_timeout_sec, connect=CONFIG.connect_timeout_sec),
    )
    resp.raise_for_status()
    if not resp.content:
        return None
    return resp.content, "audio/mpeg"


async def _tts_response(request: Request, req: TtsRequest) -> Response:
    text = req.text.strip()
    wanted = (req.format or "").strip().lower()

    if text and _remote_ok("tts"):
        if len(text) > CONFIG.max_tts_chars:
            LOG.warning("/tts 文本过长（%d 字），截断至 %d 字", len(text), CONFIG.max_tts_chars)
            text = text[: CONFIG.max_tts_chars]
        try:
            result = await _synthesize(_http_client(request), text, req.voice)
            if result is not None:
                audio, media_type = result
                _mark_remote(True, "tts-ok")
                return Response(
                    content=audio,
                    media_type=media_type,
                    headers={"X-TTS-Provider": "llm", "X-TTS-Fallback": "0", "Cache-Control": "no-store"},
                )
        except Exception as exc:  # noqa: BLE001 —— 外网异常降级本地合成，不返回 5xx
            LOG.warning("在线 TTS 失败，改用本地合成：%s: %s", type(exc).__name__, exc)
            _mark_remote(False, f"tts-error:{type(exc).__name__}")

    wav_bytes, duration_ms = _fallback_wav(req.text)
    note = "local-wav-fallback"
    if wanted != "wav":
        mp3 = _wav_to_mp3(wav_bytes)
        if mp3:
            return Response(
                content=mp3,
                media_type="audio/mpeg",
                headers={
                    "X-TTS-Provider": "rule",
                    "X-TTS-Fallback": "1",
                    "X-TTS-Note": "local-tone-mp3-fallback",
                    "X-TTS-Duration-Ms": str(duration_ms),
                    "Cache-Control": "no-store",
                },
            )
        note = "local-wav-fallback-no-mp3-encoder"
    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "X-TTS-Provider": "rule",
            "X-TTS-Fallback": "1",
            "X-TTS-Note": note,
            "X-TTS-Duration-Ms": str(duration_ms),
            "Cache-Control": "no-store",
        },
    )


@app.post("/tts", summary="语音合成（无 Key 返回本地占位音频，HTTP 200）")
async def tts(req: TtsRequest, request: Request) -> Response:
    try:
        return await _tts_response(request, req)
    except Exception:  # noqa: BLE001 —— 绝不让 /tts 返回 5xx
        LOG.exception("/tts 未预期异常，返回本地静音占位")
        try:
            wav_bytes, duration_ms = _fallback_wav(req.text)
        except Exception:  # noqa: BLE001
            wav_bytes, duration_ms = _render_wav(b"\x00\x00" * 4800, 16000), 300
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "X-TTS-Provider": "rule",
                "X-TTS-Fallback": "1",
                "X-TTS-Note": "local-silence-fallback",
                "X-TTS-Duration-Ms": str(duration_ms),
                "Cache-Control": "no-store",
            },
        )


# ======================================================================================
# 异常兜底（保证 /chat /stt /tts 永不 5xx）
# ======================================================================================


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    path = request.url.path
    LOG.warning("请求校验失败 %s：%s", path, exc.errors()[:3])
    if path.endswith("/chat"):
        payload = rules.answer("", CONFIG.scene_default, None).to_dict()
        payload["provider"] = "rule"
        payload["intent"] = "invalid-request"
        return JSONResponse(payload)
    if path.endswith("/tts"):
        wav_bytes, duration_ms = _fallback_wav("")
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "X-TTS-Provider": "rule",
                "X-TTS-Fallback": "1",
                "X-TTS-Note": "invalid-request",
                "X-TTS-Duration-Ms": str(duration_ms),
            },
        )
    if path.endswith("/stt"):
        return JSONResponse({"text": "", "provider": "unavailable", "reason": "invalid-request"})
    return JSONResponse(status_code=400, content={"code": 400, "message": "请求参数不合法", "data": None})


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception) -> Response:
    path = request.url.path
    LOG.exception("未处理异常 %s：%s", path, exc)
    if path.endswith("/chat"):
        payload = rules.answer("", CONFIG.scene_default, None).to_dict()
        payload["provider"] = "rule"
        payload["intent"] = "internal-error"
        return JSONResponse(payload)
    if path.endswith("/tts"):
        wav_bytes, duration_ms = _fallback_wav("")
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={"X-TTS-Provider": "rule", "X-TTS-Fallback": "1", "X-TTS-Note": "internal-error", "X-TTS-Duration-Ms": str(duration_ms)},
        )
    if path.endswith("/stt"):
        return JSONResponse({"text": "", "provider": "unavailable", "reason": "internal-error"})
    return JSONResponse(status_code=500, content={"code": 500, "message": "AI 桥内部错误", "data": None})


# ======================================================================================
# 入口
# ======================================================================================


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="智能任务管理系统 · Python AI 桥（FastAPI）")
    parser.add_argument("--host", default=CONFIG.host, help="监听地址（默认 127.0.0.1，仅本机）")
    parser.add_argument("--port", type=int, default=CONFIG.port, help="监听端口（默认 8090）")
    parser.add_argument("--log-level", default=CONFIG.log_level, help="日志级别：DEBUG/INFO/WARNING/ERROR")
    parser.add_argument("--print-config", action="store_true", help="打印生效配置后退出")
    args = parser.parse_args(argv)

    if args.print_config:
        print(CONFIG.summary())
        return 0

    logging.basicConfig(
        level=getattr(logging, str(args.log_level).upper(), logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )
    import uvicorn  # 延迟导入：便于 --print-config 与规则自检在无依赖环境下运行

    uvicorn.run(app, host=args.host, port=args.port, log_level=str(args.log_level).lower(), access_log=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
