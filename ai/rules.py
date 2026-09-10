# -*- coding: utf-8 -*-
"""规则兜底引擎（离线可独立跑通全部演示）。

设计约束（来源：`docs/05-开发/开发接口契约规格书.md`，下称"契约"）：
- 契约 §7.6 的**每一句演示语音文案**在此表中逐字登记，用户提问用关键词/意图匹配命中后逐字返回；
  场景区分由 `scene`（`scenario-1` / `scenario-2`）承担，命中不了意图时回退 `fallback_text()`。
- 契约 §7.3 / §7.4 的**方案名逐字登记**于 `PLANS`，`plan` 结构见 `PlanSpec`：
  `{name, method, groups, successRate, effect, reason, recommended}`。
- 本模块只依赖 Python 标准库，**不依赖 fastapi / 网络**，可单独执行自检：
  `python rules.py` 打印全部逐字文案与方案清单。

数值口径说明（避免误用）：
- `successRate` 场景一沿用契约 §7.5「方案成功率：场景一 68%/82%/61%」，推荐评分 93%；
  场景二契约未给成功率，取**演示占位值** 74%/88%/70%（已在 README「存疑项」标注，可自行改）。
- `effect` 中出现的四型资源数（光电 22 / 雷达 12 / 电子 10 / 通信 8）来自契约 §7.5 场景二资源口径。
"""

from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Final, Iterator

LOG = logging.getLogger("ai.rules")

# --------------------------------------------------------------------------------------
# 场景
# --------------------------------------------------------------------------------------

SCENARIO_1: Final[str] = "scenario-1"
SCENARIO_2: Final[str] = "scenario-2"
SCENARIOS: Final[tuple[str, ...]] = (SCENARIO_1, SCENARIO_2)
DEFAULT_SCENE: Final[str] = SCENARIO_1

SCENE_NAMES: Final[dict[str, str]] = {
    SCENARIO_1: "敏捷拒止布控",
    SCENARIO_2: "集群协同攻击",
}

_SCENE_ALIASES: Final[dict[str, str]] = {
    "scenario-1": SCENARIO_1,
    "scenario1": SCENARIO_1,
    "scenario 1": SCENARIO_1,
    "scene-1": SCENARIO_1,
    "scene1": SCENARIO_1,
    "scn-1": SCENARIO_1,
    "s1": SCENARIO_1,
    "场景一": SCENARIO_1,
    "场景1": SCENARIO_1,
    "敏捷拒止布控": SCENARIO_1,
    "拒止布控": SCENARIO_1,
    "scenario-2": SCENARIO_2,
    "scenario2": SCENARIO_2,
    "scenario 2": SCENARIO_2,
    "scene-2": SCENARIO_2,
    "scene2": SCENARIO_2,
    "scn-2": SCENARIO_2,
    "s2": SCENARIO_2,
    "场景二": SCENARIO_2,
    "场景2": SCENARIO_2,
    "集群协同攻击": SCENARIO_2,
    "集群协同": SCENARIO_2,
}

# 较长的别名优先做包含匹配，避免 "s1"/"1" 之类短别名误判
_ALIAS_BY_LENGTH: Final[tuple[tuple[str, str], ...]] = tuple(
    sorted(_SCENE_ALIASES.items(), key=lambda kv: len(kv[0]), reverse=True)
)

_KEEP_RE: Final[re.Pattern[str]] = re.compile(r"[0-9a-z\u4e00-\u9fff]+")


def normalize_scene(scene: Any) -> str:
    """把任意场景写法归一为 `scenario-1` / `scenario-2`；识别不了回退默认场景。"""
    if scene is None:
        return DEFAULT_SCENE
    raw = unicodedata.normalize("NFKC", str(scene)).strip().lower()
    if not raw:
        return DEFAULT_SCENE
    if raw in _SCENE_ALIASES:
        return _SCENE_ALIASES[raw]
    for alias, target in _ALIAS_BY_LENGTH:
        if len(alias) >= 3 and alias in raw:
            return target
    LOG.warning("未知场景标识 %r，回退默认场景 %s", scene, DEFAULT_SCENE)
    return DEFAULT_SCENE


def normalize_text(text: Any) -> str:
    """提问归一化：NFKC + 小写 + 仅保留数字/字母/汉字，去掉空白与标点，便于关键词命中。"""
    flat = unicodedata.normalize("NFKC", str(text or "")).lower()
    return "".join(_KEEP_RE.findall(flat))


# --------------------------------------------------------------------------------------
# 契约 §7.6 语音文案（逐字，不得改写）
# --------------------------------------------------------------------------------------

VOICE: Final[dict[str, dict[str, str]]] = {
    SCENARIO_1: {
        # T0
        "t0_system": "已完成战场态势建模，当前区域存在三类任务模式匹配结果。检测到固定通信受限、敌方纵深防御明显，建议构建前沿局部任务体系。",
        "t0_user": "推荐一个任务模式",
        "t0_reply": "当前态势下，敌方呈分散防御结构，通信节点暴露度较高，且前沿区域通信链路不稳定，建议优先选择【敏捷拒止布控】模式。",
        # T2
        "t2_system": "通信链路已完成自组网，当前链路质量达到任务标准。前沿节点已具备独立通信与感知支撑能力。",
        "t2_user": "链路是否支持多集群协同？",
        "t2_reply": "当前链路支持三集群并行数据回传与协同控制，通信延迟满足实时控制要求。在固定通信受限条件下，可支撑前沿节点自主运行。",
        # T3
        "t3_system": "检测到异常电磁信号聚集区域，已标记为潜在目标区。疑似敌方通信保障节点或机动指挥活动区域。",
        # T4
        "t4_system": "已识别三处高置信目标，其中一处为指挥通信节点。系统已完成多源目标关联与威胁初评。",
        "t4_user": "哪个目标优先级最高？",
        "t4_reply": "目标003为高价值节点，具备指挥与通信双重功能，建议优先纳入打击序列。该目标对敌方区域协同和防御组织具有关键支撑作用。",
        # T5
        "t5_system": "基于目标价值、暴露时间窗口与链路稳定性，已生成三种打击方案。系统可同步生成目标信息包并推送至后方远程火力与空中支援力量。",
        "t5_user": "选择最优方案",
        "t5_reply": "已为你选择方案二：多集群协同压制，该方案在当前环境下综合成功率最高。建议由无人集群持续跟踪目标，并为远程火力提供实时修正信息。",
        # T6
        "t6_system": "目标区域出现移动迹象，建议调整光电集群观察角度。雷达与电子侦察数据正在持续校正目标位置。",
        # T7
        "t7_system": "任务完成，目标打击成功率92%，主要威胁节点已清除，建议保持区域持续监视。前沿节点可执行资源撤收、链路释放并转入下一部署地域。",
        # 无契约回复文案的意图：用同场景已登记文案作答，保证不出现编造口径
        "link_multicluster_reply": "当前链路支持三集群并行数据回传与协同控制，通信延迟满足实时控制要求。在固定通信受限条件下，可支撑前沿节点自主运行。",
        "edge_autonomy_reply": "在固定通信受限条件下，可支撑前沿节点自主运行。",
        "strike_plan_system": "基于目标价值、暴露时间窗口与链路稳定性，已生成三种打击方案。系统可同步生成目标信息包并推送至后方远程火力与空中支援力量。",
    },
    SCENARIO_2: {
        # T0
        "t0_system": "已完成战场态势建模，当前区域具备多节点协同执行条件，云边端链路已建立，具备自主任务执行基础。",
        "t0_user": "推荐任务模式",
        "t0_reply": "当前任务环境下，多源信息已在边缘节点完成融合处理，后方算力可实时参与决策优化，建议采用【集群协同攻击】模式，实现云边端一体化自主执行。",
        # T2
        "t2_notice": "云端策略模型已下发，边缘节点完成本地模型加载，具备自主决策能力。",
        "t2_system": "当前系统支持云端全局优化 + 边缘实时决策 + 前端自主执行协同模式。",
        "t2_user": "是否具备断链自主运行能力？",
        "t2_reply": "边缘节点已具备局部闭环运行能力，在通信波动条件下可维持任务连续执行。",
        # T3
        "t3_notice": "边缘节点已完成第一轮态势融合，目标活动区域已完成初筛标记。",
        "t3_system": "多源信息已在边缘侧完成初步关联处理，并回传云端进行全局一致性校核。",
        # T4
        "t4_user": "优先处理哪个目标？",
        "t4_system": "目标003为关键协同节点，具备通信与指挥双重功能，建议优先纳入集群协同攻击序列。",
        # T5
        "t5_system": "基于云边端协同分析结果，系统已生成多种任务执行方案，可由边缘节点自主执行并实时回传云端优化结果。",
        "t5_user": "选择最优方案",
        "t5_reply": "已选择方案二：集群协同攻击。该方案支持边缘自主决策与动态优化，适配高动态目标环境。",
        # T7（横幅副文字）
        "t7_banner": "集群协同攻击闭环已完成",
        # 同场景替代口径
        "link_multicluster_reply": "当前系统支持云端全局优化 + 边缘实时决策 + 前端自主执行协同模式。",
        "edge_autonomy_reply": "边缘节点已具备局部闭环运行能力，在通信波动条件下可维持任务连续执行。",
        "strike_plan_system": "基于云边端协同分析结果，系统已生成多种任务执行方案，可由边缘节点自主执行并实时回传云端优化结果。",
    },
}

# 语音行说话人（供前端 voice.state / 播报角色使用）
VOICE_SPEAKER: Final[dict[str, str]] = {
    "user": "user",
    "_notice": "system",
    "_banner": "system",
    "_reply": "assistant",
    "_system": "system",
}


def voice_line(scene: str, key: str) -> str:
    """按场景取逐字文案；该场景缺该键时回退到其它场景的同名文案（并记日志）。"""
    resolved = normalize_scene(scene)
    table = VOICE.get(resolved, {})
    if key in table:
        return table[key]
    for other in SCENARIOS:
        if key in VOICE.get(other, {}):
            LOG.warning("场景 %s 缺语音键 %s，回退使用 %s 文案", resolved, key, other)
            return VOICE[other][key]
    raise KeyError(f"未登记的语音键：{key}")


def speaker_of(key: str) -> str:
    for suffix, speaker in VOICE_SPEAKER.items():
        if key.endswith(suffix):
            return speaker
    return "system"


def iter_voice_lines() -> Iterator[tuple[str, str, str, str]]:
    """遍历全部逐字文案：(scene, key, speaker, text)。供自检/逐字校验使用。"""
    for scene in SCENARIOS:
        for key, text in VOICE[scene].items():
            yield scene, key, speaker_of(key), text


# --------------------------------------------------------------------------------------
# 方案（契约 §7.3 / §7.4 方案名逐字；§7.5 成功率为场景一口径）
# --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class PlanSpec:
    """契约要求的 plan 结构。`successRate` 为整数百分比。"""

    name: str
    method: str
    groups: tuple[str, ...]
    success_rate: int
    effect: str
    reason: str
    recommended: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "method": self.method,
            "groups": list(self.groups),
            "successRate": self.success_rate,
            "effect": self.effect,
            "reason": self.reason,
            "recommended": self.recommended,
        }


PLANS: Final[dict[str, dict[str, tuple[PlanSpec, ...]]]] = {
    SCENARIO_1: {
        # §7.3 编组方案（方案名为契约逐字）
        "group": (
            PlanSpec(
                name="方案一｜稳态侦察覆盖方案",
                method="稳定侦察覆盖",
                groups=(
                    "侦察集群 1",
                    "侦察集群 2",
                    "通信中继集群",
                    "电子侦察集群",
                    "预备支援集群",
                ),
                success_rate=68,
                effect="区域覆盖率与资源利用率较优，链路稳定度良好；电子压制能力与目标发现效率一般。",
                reason="以稳态侦察覆盖为主，编组简单、链路压力小，适合长时区域监视；但电子压制与突击能力不足，面对纵深防御时突破效率偏低。",
            ),
            PlanSpec(
                name="方案二｜多域协同压制方案",
                method="多域协同压制",
                groups=(
                    "前出侦察集群",
                    "侧翼侦察集群",
                    "雷达探测集群",
                    "通信中继集群",
                    "电子压制集群",
                    "机动预备集群",
                ),
                success_rate=82,
                effect="区域覆盖率、链路稳定度、目标发现效率、电子压制能力、任务成功率、资源利用率六项综合最优。",
                reason="前出与侧翼侦察形成交叉覆盖，雷达探测与电子压制互补，通信中继保障链路稳定，机动预备集群提供弹性补充；推荐评分 93%，综合成功率最高。",
                recommended=True,
            ),
            PlanSpec(
                name="方案三｜重点区域突破方案",
                method="重点区域突破",
                groups=(
                    "重点侦察集群",
                    "目标跟踪集群",
                    "通信保障集群",
                    "电子干扰集群",
                ),
                success_rate=61,
                effect="重点区域目标发现效率与突破效果突出；区域覆盖率与资源利用率偏低，侧翼保障薄弱。",
                reason="集中资源于重点区域，突破能力强、见效快；但覆盖范围窄，纵深与侧翼保障不足，风险与资源消耗偏高。",
            ),
        ),
        # §7.3 打击方案（方案名逐字，成功率/打击效果取 §7.5 与需求初稿 T5 表）
        "strike": (
            PlanSpec(
                name="方案一 光电精确打击",
                method="精确打击",
                groups=("集群 2（光电）",),
                success_rate=68,
                effect="精准摧毁",
                reason="以光电侦察引导精确打击，附带损伤小；单集群执行，面对分散防御结构时覆盖不足。",
            ),
            PlanSpec(
                name="方案二 多集群协同压制",
                method="协同压制",
                groups=("集群 1/2/3/4/5/6",),
                success_rate=82,
                effect="压制摧毁",
                reason="多集群协同压制，可同步覆盖多个高价值节点，在当前环境下综合成功率最高。",
                recommended=True,
            ),
            PlanSpec(
                name="方案三 电子干扰配合",
                method="电子干扰+打击",
                groups=("集群 4（电子）+集群 5（通信）",),
                success_rate=61,
                effect="干扰瘫痪后打击",
                reason="先干扰瘫痪敌方通信与防空系统再行打击，适合高防护目标；协同链路要求高，链路不稳时成功率下降。",
            ),
        ),
    },
    SCENARIO_2: {
        # §7.4 编组方案（方案名逐字）
        "group": (
            PlanSpec(
                name="方案一｜分布式稳态感知",
                method="持续态势回传 / 稳定侦察覆盖",
                groups=(
                    "前出侦察集群",
                    "侧向感知集群",
                    "雷达探测集群",
                    "边缘协同处理集群",
                ),
                success_rate=74,
                effect="态势更新时效与协同稳定性良好；决策响应速度与资源调度效率一般。",
                reason="以分布式稳态感知为主，节点分散、抗毁性好，适合长时间态势回传；但集中打击能力弱，快速压制效果有限。",
            ),
            PlanSpec(
                name="方案二｜云边协同自适应攻击",
                method="云边协同自适应攻击",
                groups=(
                    "前出侦察集群",
                    "侧向感知集群",
                    "雷达探测集群",
                    "边缘协同处理集群",
                    "电子对抗集群",
                    "机动执行集群",
                ),
                success_rate=88,
                effect="态势更新时效、决策响应速度、资源调度效率、协同稳定性四项综合最优（资源四型合计：光电 22 / 雷达 12 / 电子 10 / 通信 8）。",
                reason="边缘节点支持实时融合；云端提供全局优化；前沿集群可自主执行；适配多目标动态变化。云边协同（已联动）。",
                recommended=True,
            ),
            PlanSpec(
                name="方案三｜集中式快速压制",
                method="局部集中调度 / 快速压制目标",
                groups=(
                    "雷达探测集群",
                    "电子对抗集群",
                    "机动执行集群",
                ),
                success_rate=70,
                effect="快速压制效果与决策响应速度突出；态势更新时效与协同稳定性偏低。",
                reason="局部集中调度、快速压制目标，见效快；但依赖集中指挥，链路波动时自主性不足。",
            ),
        ),
        # §7.4 打击/执行方案（方案名逐字，括号内为契约标注的定位）
        "strike": (
            PlanSpec(
                name="方案一｜光电精确打击",
                method="局部执行",
                groups=("光电侦察单元 + 机动执行集群",),
                success_rate=74,
                effect="精准锁定单一高价值目标",
                reason="以光电侦察引导精确打击，适用于局部小规模目标打击；覆盖面小，多目标场景需多次执行。",
            ),
            PlanSpec(
                name="方案二｜集群协同攻击",
                method="集群协同",
                groups=(
                    "前出侦察集群",
                    "侧向感知集群",
                    "雷达探测集群",
                    "边缘协同处理集群",
                    "电子对抗集群",
                    "机动执行集群",
                ),
                success_rate=88,
                effect="多集群协同、分布式自主执行",
                reason="边缘自主决策、云端优化支撑，动态适配多目标与复杂战场环境；支持边缘自主决策与动态优化，推荐采用。",
                recommended=True,
            ),
            PlanSpec(
                name="方案三｜电子压制协同",
                method="电子压制",
                groups=("电子对抗集群 + 机动执行集群",),
                success_rate=70,
                effect="干扰敌方通信与防空系统",
                reason="电子压制与打击协同配合，适用于高防护目标区域；对电磁环境与干扰时机要求高。",
            ),
        ),
    },
}


def plan_side(context: Any, default: str = "group") -> str:
    """从 context 推断方案侧别（group=编组/T1、strike=打击/T5）。"""
    phase = ""
    side = ""
    if isinstance(context, dict):
        phase = str(context.get("phase") or "").strip().upper()
        side = str(context.get("side") or "").strip().lower()
    if side in ("group", "groups", "编组"):
        return "group"
    if side in ("strike", "打击", "execute", "execution"):
        return "strike"
    if phase in ("T1", "T2"):
        return "group"
    if phase in ("T5", "T6"):
        return "strike"
    return default


def build_plans(scene: Any, side: str = "group") -> list[dict[str, Any]]:
    """返回某场景某侧别的三套方案（契约要求的 plan 结构列表）。"""
    resolved = normalize_scene(scene)
    table = PLANS.get(resolved) or PLANS[DEFAULT_SCENE]
    specs = table.get(side) or table["group"]
    return [spec.to_dict() for spec in specs]


def recommended_plan(scene: Any, side: str = "group") -> dict[str, Any]:
    plans = build_plans(scene, side)
    for plan in plans:
        if plan.get("recommended"):
            return plan
    return plans[1] if len(plans) > 1 else plans[0]


def plan_vocabulary(scene: Any) -> dict[str, list[str]]:
    """方案名清单（供 LLM 系统提示词约束用词，禁止改写方案名）。"""
    resolved = normalize_scene(scene)
    table = PLANS.get(resolved) or PLANS[DEFAULT_SCENE]
    return {side: [spec.name for spec in specs] for side, specs in table.items()}


def all_plan_names() -> tuple[str, ...]:
    names: list[str] = []
    for table in PLANS.values():
        for specs in table.values():
            names.extend(spec.name for spec in specs)
    return tuple(names)


# --------------------------------------------------------------------------------------
# 意图规则表
# --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class IntentRule:
    """关键词/意图规则。

    keywords：命中任一即算匹配（归一化后子串匹配），多条命中取**最长关键词**的那条规则。
    lines   ：scene → VOICE 键；缺场景时回退其它场景同名键。
    kind    ：qa=问答回复；announce=系统播报；plan=方案生成（附带 plan/plans 结构）。
    """

    intent: str
    keywords: tuple[str, ...]
    lines: dict[str, str] = field(default_factory=dict)
    kind: str = "qa"
    stage: str = ""
    side: str | None = None


INTENT_RULES: Final[tuple[IntentRule, ...]] = (
    # ---- 用户提问：推荐任务模式（§7.6 场景一/场景二 T0） ----
    IntentRule(
        intent="recommend_mode",
        keywords=(
            "推荐一个任务模式",
            "推荐任务模式",
            "推荐任务方向",
            "推荐模式",
            "任务模式推荐",
            "任务模式",
            "作战模式",
            "推荐哪个场景",
            "推荐场景",
        ),
        lines={SCENARIO_1: "t0_reply", SCENARIO_2: "t0_reply"},
        stage="T0",
    ),
    # ---- 用户提问：链路是否支持多集群协同（§7.6 场景一 T2） ----
    IntentRule(
        intent="link_multicluster",
        keywords=(
            "链路是否支持多集群协同",
            "链路是否支持多集群",
            "是否支持多集群协同",
            "支持多集群协同",
            "链路支持多集群",
            "多集群协同",
            "链路是否支持",
            "链路能否支持",
        ),
        lines={SCENARIO_1: "link_multicluster_reply", SCENARIO_2: "link_multicluster_reply"},
        stage="T2",
    ),
    # ---- 用户提问：是否具备断链自主运行能力（§7.6 场景二 T2） ----
    IntentRule(
        intent="edge_autonomy",
        keywords=(
            "是否具备断链自主运行能力",
            "断链自主运行能力",
            "断链自主运行",
            "自主运行能力",
            "断链",
            "自主运行",
            "边缘自治",
        ),
        lines={SCENARIO_2: "edge_autonomy_reply", SCENARIO_1: "edge_autonomy_reply"},
        stage="T2",
    ),
    # ---- 用户提问：目标优先级（§7.6 场景一 T4 / 场景二 T4） ----
    IntentRule(
        intent="target_priority",
        keywords=(
            "哪个目标优先级最高",
            "哪个目标优先",
            "哪个目标最重要",
            "目标优先级最高",
            "优先级最高",
            "优先处理哪个目标",
            "优先处理目标",
            "优先打击哪个目标",
            "先打哪个目标",
            "打击序列",
        ),
        lines={SCENARIO_1: "t4_reply", SCENARIO_2: "t4_system"},
        stage="T4",
    ),
    # ---- 用户提问：选择最优方案（§7.6 场景一 T5 / 场景二 T5） ----
    IntentRule(
        intent="choose_best_plan",
        keywords=(
            "选择最优方案",
            "选择最佳方案",
            "选最优方案",
            "最优方案",
            "最佳方案",
            "选择方案二",
            "推荐哪个方案",
            "哪个方案最好",
            "哪个成功率最高",
        ),
        lines={SCENARIO_1: "t5_reply", SCENARIO_2: "t5_reply"},
        kind="qa",
        stage="T5",
        side="strike",
    ),
    # ---- 用户提问：生成/推荐方案（返回结构化 plan + plans） ----
    IntentRule(
        intent="generate_plan",
        keywords=(
            "生成三套方案",
            "生成三套任务编组方案",
            "生成编组方案",
            "生成打击方案",
            "生成执行任务",
            "生成执行方案",
            "生成任务方案",
            "生成多种任务执行方案",
            "生成方案",
            "推荐方案",
            "方案推荐",
            "推荐一个方案",
            "有哪些方案",
            "给我方案",
            "三套方案",
        ),
        kind="plan",
        stage="T5",
        side=None,  # 侧别由 context.side / context.phase 决定，默认编组
    ),
    # ---- 系统播报（前端可按关键词取逐字播报稿） ----
    IntentRule(
        intent="situation_modeling",
        keywords=("战场态势建模", "态势建模", "任务加载", "进入任务", "场景选择"),
        lines={SCENARIO_1: "t0_system", SCENARIO_2: "t0_system"},
        kind="announce",
        stage="T0",
    ),
    IntentRule(
        intent="link_mesh_done",
        keywords=("链路已完成自组网", "自组网完成", "链路质量达到任务标准", "链路建立"),
        lines={SCENARIO_1: "t2_system", SCENARIO_2: "t2_notice"},
        kind="announce",
        stage="T2",
    ),
    IntentRule(
        intent="edge_model_loaded",
        keywords=("云端策略模型已下发", "模型已下发", "本地模型加载"),
        lines={SCENARIO_2: "t2_notice", SCENARIO_1: "t2_system"},
        kind="announce",
        stage="T2",
    ),
    IntentRule(
        intent="cloud_edge_mode",
        keywords=("云端全局优化", "云边端协同模式", "边缘实时决策"),
        lines={SCENARIO_2: "t2_system", SCENARIO_1: "t2_reply"},
        kind="announce",
        stage="T2",
    ),
    IntentRule(
        intent="abnormal_em_signal",
        keywords=("异常电磁信号", "电磁信号聚集", "潜在目标区"),
        lines={SCENARIO_1: "t3_system", SCENARIO_2: "t3_notice"},
        kind="announce",
        stage="T3",
    ),
    IntentRule(
        intent="edge_fusion_done",
        keywords=("第一轮态势融合", "态势融合", "初筛标记", "态势构建"),
        lines={SCENARIO_2: "t3_notice", SCENARIO_1: "t3_system"},
        kind="announce",
        stage="T3",
    ),
    IntentRule(
        intent="cloud_consistency_check",
        keywords=("全局一致性校核", "初步关联处理", "多源信息"),
        lines={SCENARIO_2: "t3_system", SCENARIO_1: "t4_system"},
        kind="announce",
        stage="T3",
    ),
    IntentRule(
        intent="targets_identified",
        keywords=("高置信目标", "目标识别", "威胁初评", "多源目标关联"),
        lines={SCENARIO_1: "t4_system", SCENARIO_2: "t4_system"},
        kind="announce",
        stage="T4",
    ),
    IntentRule(
        intent="strike_plan_ready",
        keywords=("已生成三种打击方案", "生成打击方案", "生成多种任务执行方案", "目标信息包"),
        lines={SCENARIO_1: "strike_plan_system", SCENARIO_2: "strike_plan_system"},
        kind="announce",
        stage="T5",
    ),
    IntentRule(
        intent="target_moving",
        keywords=("目标区域出现移动迹象", "移动迹象", "调整观察角度", "持续校正目标位置"),
        lines={SCENARIO_1: "t6_system", SCENARIO_2: "t4_system"},
        kind="announce",
        stage="T6",
    ),
    IntentRule(
        intent="mission_complete",
        keywords=("任务完成", "毁伤评估", "任务结束", "打击成功率92", "闭环已完成", "协同攻击闭环"),
        lines={SCENARIO_1: "t7_system", SCENARIO_2: "t7_banner"},
        kind="announce",
        stage="T7",
    ),
)

# 预归一化关键词，避免每次请求重复计算
_RULES_NORMALIZED: Final[tuple[tuple[IntentRule, tuple[str, ...]], ...]] = tuple(
    (rule, tuple(normalize_text(kw) for kw in rule.keywords)) for rule in INTENT_RULES
)

FALLBACK_TEXT: Final[dict[str, str]] = {
    SCENARIO_1: "已收到。当前区域态势与链路数据正常，建议按当前阶段任务方案继续执行，如需调整可随时下发指令。",
    SCENARIO_2: "已收到。云边端链路正常，边缘节点具备自主执行条件，建议按当前阶段任务方案继续执行。",
}

PLAN_TEXT: Final[dict[tuple[str, str], str]] = {
    (SCENARIO_1, "group"): "已完成资源注册与能力识别，生成三套任务编组方案，推荐方案二｜多域协同压制方案（推荐评分 93%，成功率 82%）。",
    (SCENARIO_1, "strike"): VOICE[SCENARIO_1]["strike_plan_system"],
    (SCENARIO_2, "group"): "云边端链路已建立，生成三套编组方案，推荐方案二｜云边协同自适应攻击（云边协同已联动）。",
    (SCENARIO_2, "strike"): VOICE[SCENARIO_2]["strike_plan_system"],
}

RECOMMEND_SCORE: Final[dict[str, int]] = {SCENARIO_1: 93, SCENARIO_2: 93}


# --------------------------------------------------------------------------------------
# 对外主入口
# --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class RuleAnswer:
    """规则引擎结果。`provider` 固定为 rule，由 bridge 层写入响应。"""

    text: str
    intent: str
    matched: bool
    scene: str
    plan: dict[str, Any] | None = None
    plans: list[dict[str, Any]] | None = None
    side: str | None = None
    stage: str = ""

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "text": self.text,
            "provider": "rule",
            "intent": self.intent,
            "scene": self.scene,
        }
        if self.plan:
            payload["plan"] = self.plan
        if self.plans:
            payload["plans"] = self.plans
        return payload


def match_rule(prompt: Any) -> IntentRule | None:
    """按最长关键词命中返回规则；无命中返回 None。"""
    normalized = normalize_text(prompt)
    if not normalized:
        return None
    best_rule: IntentRule | None = None
    best_score = 0
    for rule, keywords in _RULES_NORMALIZED:
        for kw in keywords:
            if kw and kw in normalized and len(kw) > best_score:
                best_rule, best_score = rule, len(kw)
    if best_rule is not None:
        LOG.debug("提问命中意图 %s（关键词长度 %d）", best_rule.intent, best_score)
    return best_rule


def answer(prompt: Any, scene: Any = None, context: Any = None) -> RuleAnswer:
    """规则回答：命中意图返回契约逐字文案；方案类问题附带结构化 plan/plans；否则回退兜底话术。"""
    resolved = normalize_scene(scene)
    rule = match_rule(prompt)

    if rule is None:
        return RuleAnswer(
            text=FALLBACK_TEXT.get(resolved, FALLBACK_TEXT[DEFAULT_SCENE]),
            intent="fallback",
            matched=False,
            scene=resolved,
            stage=_phase_of(context),
        )

    if rule.kind == "plan":
        side = plan_side(context, default=rule.side or "group")
        plans = build_plans(resolved, side)
        plan = next((p for p in plans if p.get("recommended")), plans[0])
        text = PLAN_TEXT.get((resolved, side), PLAN_TEXT[(DEFAULT_SCENE, side)])
        return RuleAnswer(
            text=text,
            intent=rule.intent,
            matched=True,
            scene=resolved,
            plan=plan,
            plans=plans,
            side=side,
            stage=rule.stage,
        )

    text = voice_line(resolved, rule.lines[resolved] if resolved in rule.lines else next(iter(rule.lines.values())))

    plan: dict[str, Any] | None = None
    plans: list[dict[str, Any]] | None = None
    side: str | None = None
    if rule.intent == "choose_best_plan":
        side = plan_side(context, default=rule.side or "strike")
        plans = build_plans(resolved, side)
        plan = next((p for p in plans if p.get("recommended")), plans[0])

    return RuleAnswer(
        text=text,
        intent=rule.intent,
        matched=True,
        scene=resolved,
        plan=plan,
        plans=plans,
        side=side,
        stage=rule.stage,
    )


def _phase_of(context: Any) -> str:
    if isinstance(context, dict):
        return str(context.get("phase") or "").strip().upper()
    return ""


# --------------------------------------------------------------------------------------
# 自检入口：python rules.py
# --------------------------------------------------------------------------------------


def _self_test() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    print("== 场景 ==")
    for scene in SCENARIOS:
        print(f"  {scene}  {SCENE_NAMES[scene]}")

    print("\n== 契约 §7.6 逐字语音文案（{scene} / {key} / {speaker}） ==")
    for scene, key, speaker, text in iter_voice_lines():
        print(f"  [{scene}][{key}][{speaker}] {text}")

    print("\n== 方案（§7.3 / §7.4） ==")
    for scene in SCENARIOS:
        for side in ("group", "strike"):
            for plan in build_plans(scene, side):
                flag = "推荐" if plan["recommended"] else "    "
                print(
                    f"  [{scene}][{side}][{flag}] {plan['name']} | {plan['method']} | "
                    f"{plan['successRate']}% | {'、'.join(plan['groups'])} | {plan['effect']}"
                )

    print("\n== 意图命中自检 ==")
    samples = [
        (SCENARIO_1, "推荐一个任务模式"),
        (SCENARIO_2, "推荐任务模式"),
        (SCENARIO_1, "链路是否支持多集群协同？"),
        (SCENARIO_2, "是否具备断链自主运行能力？"),
        (SCENARIO_1, "哪个目标优先级最高？"),
        (SCENARIO_2, "优先处理哪个目标？"),
        (SCENARIO_1, "选择最优方案"),
        (SCENARIO_2, "选择最优方案"),
        (SCENARIO_1, "生成方案"),
        (SCENARIO_1, "随便问点什么"),
    ]
    for scene, prompt in samples:
        result = answer(prompt, scene, {"phase": "T5"})
        plan_name = f" | plan={result.plan['name']}" if result.plan else ""
        print(
            f"  {scene} | {prompt} -> intent={result.intent} matched={result.matched}"
            f"{plan_name}\n      {result.text}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(_self_test())
