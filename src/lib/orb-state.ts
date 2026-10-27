/**
 * 模块 1（1.3）：浮球 7 态通知体系 + 状态色板（1.2）+ 动画时序（1.4）。
 *
 * 7 态（OrbStatus）：
 *   idle        常态
 *   generating  生成中（蓝 + 整球呼吸 1.6s scale 1→1.08）
 *   approval    审批待审（黄）
 *   done        任务完成（绿，hover 清除）
 *   error       错误（红，hover 清除）
 *   dragging    拖动中
 *   dragOver    拖入态（scale 1.15 + 📥）
 *
 * 优先级覆盖链（1.3 硬约束）：
 *   拖入 > 拖动 > 审批 > 错误 > 完成 > 生成中 > 常态
 * 同一时刻多个信号并存时，高优先级态覆盖低优先级态展示。
 *
 * 审批态不自动消失（300s 超时兜底）；完成/错误态 hover 浮球即清除。
 */

/** 5 色状态态（1.2 硬约束色值，不可改）。 */
export const ORB_COLORS = {
  /** 蓝 / 生成中 */
  generating: "#93c5fd",
  /** 绿 / 完成 */
  done: "#86efac",
  /** 黄 / 审批 */
  approval: "#fcd34d",
  /** 红 / 错误 */
  error: "#fca5a5",
  /** 灰 / 常态 */
  idle: "#71717a",
} as const;

/** 拖动 / 拖入态复用常态灰作基色（拖入态主视觉由 scale + 📥 承担）。 */
export const ORB_TRANSIENT_COLORS = {
  dragging: ORB_COLORS.idle,
  dragOver: ORB_COLORS.approval,
} as const;

/** 浮球 7 态枚举（1.3 验收锚点）。 */
export type OrbStatus =
  | "idle"
  | "generating"
  | "approval"
  | "done"
  | "error"
  | "dragging"
  | "dragOver";

/**
 * 优先级覆盖链：拖入 > 拖动 > 审批 > 错误 > 完成 > 生成中 > 常态。
 * 数组下标即优先级（下标小 = 优先级高）。
 */
export const ORB_PRIORITY: OrbStatus[] = [
  "dragOver",
  "dragging",
  "approval",
  "error",
  "done",
  "generating",
  "idle",
];

/** 各态色值（全 7 态查表）。 */
export function orbColor(status: OrbStatus): string {
  if (status === "dragging") return ORB_TRANSIENT_COLORS.dragging;
  if (status === "dragOver") return ORB_TRANSIENT_COLORS.dragOver;
  return ORB_COLORS[status as keyof typeof ORB_COLORS];
}

/**
 * 优先级裁决：从当前并存的状态集合中取最高优先级态。
 * 传入 Map（键为状态、值为是否激活）或普通 record。
 */
export function resolveStatus(active: Partial<Record<OrbStatus, boolean>>): OrbStatus {
  for (const status of ORB_PRIORITY) {
    if (active[status]) return status;
  }
  return "idle";
}

/** 审批态超时兜底（300s）：审批不自动消失，仅超时后回常态。 */
export const APPROVAL_TIMEOUT_MS = 300_000;

/** 呼吸动画参数（生成中）：1.6s、scale 1 → 1.08。 */
export const BREATH_DURATION_MS = 1600;
export const BREATH_SCALE_PEAK = 1.08;

/** 拖入态放大系数（1.6 约束：scale 1.15）。 */
export const DRAG_OVER_SCALE = 1.15;

/**
 * Dock 式三段接力动画时序（1.4 硬约束，单位 ms）：
 *   呼出：浮球收缩 120 → 主窗 scale .35→1 280（origin 动态朝浮球）→ 浮球淡出让位 150
 *   缩回：主窗收缩 280 → 浮球 spring 弹回 200
 * 全程不动窗口尺寸（避开 set_size 每帧重排性能坑）——只用 transform。
 */
export const ORB_ANIMATION = {
  /** 呼出第一段：浮球收缩时长 */
  summonOrbShrinkMs: 120,
  /** 呼出第二段：主窗 scale .35→1 时长 */
  summonMainGrowMs: 280,
  /** 呼出第三段：浮球淡出让位时长 */
  summonOrbFadeMs: 150,
  /** 缩回第一段：主窗收缩时长 */
  recallMainShrinkMs: 280,
  /** 缩回第二段：浮球 spring 弹回时长 */
  recallOrbSpringMs: 200,
  /** 主窗出现动画起始缩放 */
  summonMainScaleFrom: 0.35,
} as const;

/** 透明命中区目标尺寸（1.6 约束：~60px，实际命中区 = 60px 窗口）。 */
export const ORB_HIT_ZONE = 60;

/** 浮球视觉直径（1.1 约束：50px）。 */
export const ORB_SIZE = 50;

/** 右键弧形菜单 4 项（1.5 硬约束）。 */
export const ORB_MENU_ITEMS = [
  { id: "pin", label: "置顶" },
  { id: "new", label: "新建" },
  { id: "hide", label: "隐藏" },
  { id: "exit", label: "退出" },
] as const;

export type OrbMenuItemId = (typeof ORB_MENU_ITEMS)[number]["id"];

/** hover 弧段高亮时图标放大系数（1.5 约束：1.12）。 */
export const MENU_HOVER_SCALE = 1.12;

/** 浮球位置持久化 key（localStorage，1.7；磁盘权威副本由 Rust 侧维护）。 */
export const ORB_POSITION_KEY = "pawpad-orb-position";
