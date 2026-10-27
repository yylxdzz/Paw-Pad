/**
 * 模块 1：浮球 UI（Orb.tsx）。
 *
 * 承载于 Rust 侧 60px 原生浮球窗口（floating_orb.rs：transparent +
 * always_on_top + skip_taskbar），实现 1.2~1.8 全部前端行为：
 * - 1.2 五色态流光 + 角标（色值见 orb-state.ts，CSS 变量下发）
 * - 1.3 7 态通知（优先级覆盖链 + 审批 300s 兜底 + 完成/错误 hover 清除）
 * - 1.4 Dock 式三段接力动画（120/280/150/200ms，全程 transform 不动尺寸）
 * - 1.5 右键弧形菜单（v6 连续弧带；置顶/新建/隐藏/退出，开口方向自适应半屏）
 * - 1.6 拖文件投放（60px 透明命中区 → upload → chip）
 * - 1.7 拖动 + 角落吸附 + localStorage 位置持久化
 * - 1.8 位置自适应：移动后 emit("orb-position")，主窗口据此决定出现侧
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { ORB_POSITION_KEY } from "../lib/orb-state";
import { logInfo } from "../lib/logger";

import "./Orb.css";

import {
  APPROVAL_TIMEOUT_MS,
  DRAG_OVER_SCALE,
  MENU_HOVER_SCALE,
  ORB_ANIMATION,
  ORB_HIT_ZONE,
  ORB_SIZE,
  type OrbMenuItemId,
  type OrbStatus,
  orbColor,
  resolveStatus,
} from "../lib/orb-state";

/**
 * 1.2 五色状态态色值（在 orb-state.ts 定义，此处显式 re-export 供浮球样式与
 * 语义验收引用）：蓝 #93c5fd / 绿 #86efac / 黄 #fcd34d / 红 #fca5a5 / 灰 #71717a。
 */
export { ORB_COLORS as ORB_STATUS_COLORS } from "../lib/orb-state";

/**
 * 1.5 右键弧形菜单 4 项：置顶 / 新建 / 隐藏 / 退出（约束不可改）。
 *
 * 形态 = 弧形菜单 v6 定稿「连续弧带」（非扇形切片拼合，也非分离胶囊按钮）：
 * 300×300 统一坐标系（圆心 (150,150) = 浮球中心，v6 修正②治错位），底弧是一条
 * 完整 path（中线半径 70 / stroke-width 48 / linecap round），4 个透明热点段叠在
 * 上面做 hover 检测——hover 时段只做深浅变化（稍亮的深色，不整块变绿，v6 修正⑤），
 * 线性图标变亮绿 #4ade80 并微放大 1.12（--menu-hover-scale）。纯图标无文字，
 * 文字由开口正中气泡承担（v6 修正③）。
 */
const MENU_ITEMS: Array<{
  id: OrbMenuItemId;
  label: string;
  action: string;
  icon: ReactNode;
}> = [
  {
    id: "pin",
    label: "置顶",
    action: "置顶开关",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 4h6l-1 6 4 4H6l4-4-1-6z" />
        <path d="M12 14v7" />
      </svg>
    ),
  },
  {
    id: "new",
    label: "新建",
    action: "新建 Session",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M12 5v14M5 12h14" />
      </svg>
    ),
  },
  {
    id: "hide",
    label: "隐藏",
    action: "隐藏浮球（Dock 恢复）",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
        <circle cx="12" cy="12" r="2.6" />
        <path d="M4 20L20 4" />
      </svg>
    ),
  },
  {
    id: "exit",
    label: "退出",
    action: "退出 App",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    ),
  },
];

/*
 * 弧形菜单几何（v6 定稿 · 统一 300×300 坐标系，圆心 (150,150) = 浮球中心）：
 *   ARC_MID_R  70   中线半径（图标落在此半径上，与弧带同心）
 *   ARC_BAND_W 48   弧带宽度（stroke-width）→ 内 46 / 外 94
 *   ARC_TOTAL  180  弧总张角（半圆），4 项均分 → 每项 45°
 * 开口方向：弧带占浮球朝向屏幕中心的那半圆，开口（气泡侧）朝屏幕外——
 *   浮球在右半屏 → data-side="left"（弧带在左半、开口朝右）
 *   浮球在左半屏 → data-side="right"（弧带在右半、开口朝左，角度关于竖直轴镜像）
 * 两种朝向下 4 项顺序恒为「从上到下」：置顶 → 新建 → 隐藏 → 退出。
 */
const ARC_BOX = 300;
const ARC_CX = 150;
const ARC_CY = 150;
const ARC_MID_R = 70;
const ARC_BAND_W = 48;
const ARC_TOTAL = 180;
const ARC_PER = ARC_TOTAL / MENU_ITEMS.length;

const arcRad = (deg: number) => (deg * Math.PI) / 180;
const arcPoint = (deg: number, r = ARC_MID_R) =>
  [ARC_CX + r * Math.cos(arcRad(deg)), ARC_CY + r * Math.sin(arcRad(deg))] as const;

/** 中线弧 path（a1 → a2，角度递增方向） */
function arcPath(a1: number, a2: number): string {
  const [x1, y1] = arcPoint(a1);
  const [x2, y2] = arcPoint(a2);
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${ARC_MID_R} ${ARC_MID_R} 0 ${large} 1 ${x2} ${y2}`;
}

/** 第 i 项占的子弧 + 中点角（顺序恒为从上到下） */
function arcSegment(i: number, side: "left" | "right"): { a1: number; a2: number; mid: number } {
  if (side === "left") {
    // 弧带在左半（90°→270°）：第 i 项 = [270-(i+1)*per, 270-i*per]
    const a2 = 270 - i * ARC_PER;
    const a1 = a2 - ARC_PER;
    return { a1, a2, mid: (a1 + a2) / 2 };
  }
  // 弧带在右半（-90°→90°，关于竖直轴镜像）：第 i 项 = [-90+i*per, -90+(i+1)*per]
  const a1 = -90 + i * ARC_PER;
  const a2 = a1 + ARC_PER;
  return { a1, a2, mid: (a1 + a2) / 2 };
}

/** 角落吸附边距（px）：松手后距屏幕边缘小于该值即吸附角落。 */
const SNAP_MARGIN = 80;

/** dev-only 演示模式状态序列（PAWPAD_ORB_DEMO=1 激活）：顺序播放 7 态看效果。 */
const DEMO_SEQUENCE: Array<{ status: OrbStatus; ms: number }> = [
  { status: "idle", ms: 2000 },
  { status: "generating", ms: 3000 },
  { status: "approval", ms: 3000 },
  { status: "done", ms: 3000 },
  { status: "error", ms: 3000 },
  { status: "dragOver", ms: 2500 },
  { status: "dragging", ms: 2000 },
];

/**
 * 左键位移阈值（逻辑像素）：按下后移动超过它才判定为「拖动」并交系统原生拖动
 * （invoke("orb_begin_native_drag")）。低于它一律算点击。
 *
 * 为什么判定放在前端：透明 + always_on_top 窗口上 Rust 读 outer_position 不可靠
 * （曾出现拖动结束后读到的位置与拖动前一致 → 把拖动判成点击 → 误呼出主窗），
 * 而 pointermove 的位移是浏览器侧事实，与窗口坐标读取无关。于是：
 *   点击（无位移）→ 根本不发起原生拖动，onPointerUp 直接呼出主窗；
 *   拖动（有位移）→ 交系统原生拖动（窗口服务器合成移动，无 WebView 重绘残影），
 *                    松手由 Rust emit "orb-native-drag-end" → 前端角落吸附。
 */
const DRAG_START_THRESHOLD = 6;

/**
 * 左键收起弧形菜单后的防误触窗口（ms）。
 *
 * menuOpen 时左键点浮球 = 缩回菜单；若不做防护，「双击浮球缩回」会退化成
 * 「第一击收起菜单 + 第二击（菜单已关）呼出主窗」。故收起菜单后
 * MENU_CLOSE_GUARD_MS 内的那一击整次吞掉：不拖动、不呼出。
 */
const MENU_CLOSE_GUARD_MS = 400;

export default function Orb() {
  const [status, setStatus] = useState<OrbStatus>("idle");
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSide, setMenuSide] = useState<"left" | "right">("right");
  /** 弧形菜单当前预选项（null = 无）：驱动弧段高亮 + 图标变绿放大 + 气泡 */
  const [hovered, setHovered] = useState<number | null>(null);
  const [relayPhase, setRelayPhase] = useState<"idle" | "summon" | "recall">("idle");
  const [pinned, setPinned] = useState(false);

  const rightPressedRef = useRef(false);
  const approvalTimerRef = useRef<number | null>(null);

  /* ---------- 1.7 点击/拖动判定状态（前端主导，见 DRAG_START_THRESHOLD） ---------- */
  /** 左键按下时的指针位置；null = 当前没有待判定的左键按下 */
  const leftDownRef = useRef<{ x: number; y: number } | null>(null);
  /** 本次按下是否已交系统原生拖动（交过就不再重复 invoke） */
  const dragInvokedRef = useRef(false);
  /** 本次按下是否检测到超过 DRAG_START_THRESHOLD 的真实位移 */
  const pointerMovedRef = useRef(false);
  /** 菜单被左键收起后吞掉后续点击的截止时间戳（见 MENU_CLOSE_GUARD_MS） */
  const menuCloseGuardRef = useRef(0);

  /* ---------- 1.5 菜单开关 → Rust 浮球窗口尺寸联动（A1 修复：菜单被裁剪） ---------- */

  // 弧形菜单弧带外半径 94px、悬浮气泡右缘距浮球中心约 157px（实测最宽项
  // 「新建 · 新建 Session」141px + 16px 偏移），都超出 60×60 窗口被系统裁剪。
  // menuOpen 变化时 emit 给 Rust（floating_orb.rs 监听 "orb-menu-state"）：
  // 展开 → 窗口放大到 340×340 且浮球居中；收起 → 缩回 60×60 且浮球不跳位。
  useEffect(() => {
    void emit("orb-menu-state", { open: menuOpen }).catch(() => {});
  }, [menuOpen]);

  /* ---------- 1.5 图钉置顶态：启动时从 Rust 同步 ---------- */

  // toggle_orb_pin 真正 set_always_on_top 的是主窗口，状态存在 Rust 侧
  // （ORB_PINNED）。前端 useState 每次会话都从 false 起，若不回读就会出现
  // 「其实还置着顶、图钉却显示未置顶」。故挂载时回读一次。
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const state = await invoke<boolean>("orb_pin_state");
        if (alive) setPinned(state);
      } catch {
        // ignore：拿不到就沿用默认 false
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ---------- 1.3 状态管理：外部信号 → 优先级裁决 ---------- */

  const applySignals = useCallback((patch: Partial<Record<OrbStatus, boolean>>) => {
    setStatus((prev) => {
      const active: Partial<Record<OrbStatus, boolean>> = {};
      if (prev === "generating" || prev === "approval") active[prev] = true;
      Object.assign(active, patch);
      return resolveStatus(active);
    });
  }, []);

  // dev-only 演示模式：URL 带 ?demo=1 时循环播放 7 态（PAWPAD_ORB_DEMO=1 启动激活）。
  // 用户直观查看各态真实渲染（流光/呼吸/角标/拖入图标）；正常启动无此分支。
  // 立即显示 DEMO_SEQUENCE[0]，之后从 index 1 起按各态时长递归 setTimeout 推进，
  // 末态后取模循环（i 单索引，无双倍计数、无跳态）。
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("demo") !== "1") return;
    let i = 1;
    setStatus(DEMO_SEQUENCE[0].status);
    void logInfo("orb", `demo status: ${DEMO_SEQUENCE[0].status}`);
    let stopped = false;
    let timerId = 0;
    const schedule = () => {
      if (stopped) return;
      const step = DEMO_SEQUENCE[i % DEMO_SEQUENCE.length];
      i += 1;
      timerId = window.setTimeout(() => {
        setStatus(step.status);
        void logInfo("orb", `demo status: ${step.status}`);
        schedule();
      }, step.ms);
    };
    schedule();
    return () => {
      stopped = true;
      window.clearTimeout(timerId);
    };
  }, []);

  // 主窗口转发后端状态：generating / approval / done / error
  useEffect(() => {
    const off = listen<string>("orb-status", (event) => {
      const payload = event.payload;
      const next = payload as OrbStatus;
      void logInfo("orb", `status received: ${payload}`);
      if (payload === "approval-resolved") {
        // 模块 8（8.4）：审批 resolved → 清除浮球审批态（黄 #fcd34d），不等 300s 超时
        if (approvalTimerRef.current) window.clearTimeout(approvalTimerRef.current);
        approvalTimerRef.current = null;
        applySignals({ approval: false } as Partial<Record<OrbStatus, boolean>>);
        return;
      }
      if (next === "generating" || next === "approval") {
        applySignals({ [next]: true } as Partial<Record<OrbStatus, boolean>>);
        if (next === "approval") {
          // 审批不自动消失，仅 300s 超时兜底回常态
          if (approvalTimerRef.current) window.clearTimeout(approvalTimerRef.current);
          approvalTimerRef.current = window.setTimeout(() => {
            setStatus("idle");
          }, APPROVAL_TIMEOUT_MS);
        }
      } else if (next === "done" || next === "error") {
        // 完成/错误：展示 2.5s 后自动回常态，也可 hover 立即清除（1.3）
        applySignals({ [next]: true } as Partial<Record<OrbStatus, boolean>>);
        if (approvalTimerRef.current) window.clearTimeout(approvalTimerRef.current);
        approvalTimerRef.current = window.setTimeout(() => {
          setStatus("idle");
        }, 2500);
      } else {
        applySignals({} as Partial<Record<OrbStatus, boolean>>);
      }
    });
    return () => {
      off.then((f) => f());
    };
  }, [applySignals]);

  // 诊断 2026-10-27：观测浮球状态实际变更（排查光晕缺失——收到信号但 UI 未变的可能）
  useEffect(() => {
    if (status !== "idle") void logInfo("orb", `status active: ${status}`);
  }, [status]);

  // 拖放状态（Rust 侧 tauri://drag-enter/over/leave 转发）。
  // 2026-10-27：加 3s 兜底 timer——macOS 上 tauri://drag-leave 在文件拖出场景
  // 不可靠（wry 已知边缘，曾实测拖文件悬停后拖走 leave 丢失、dragOver 卡死成
  // 黄色放大态不恢复）。drag-over 拖动中持续到达天然刷新 timer；leave 正常
  // 到达走 false 分支清除；leave 丢失时 timer 到期强制清除。
  useEffect(() => {
    let dragOverTimer: number | null = null;
    const clearDragOverTimer = () => {
      if (dragOverTimer !== null) {
        window.clearTimeout(dragOverTimer);
        dragOverTimer = null;
      }
    };
    const off = listen<boolean>("orb-drag-state", (event) => {
      if (event.payload) {
        applySignals({ dragOver: true } as Partial<Record<OrbStatus, boolean>>);
        clearDragOverTimer();
        dragOverTimer = window.setTimeout(() => {
          dragOverTimer = null;
          applySignals({ dragOver: false } as Partial<Record<OrbStatus, boolean>>);
        }, 3000);
      } else {
        clearDragOverTimer();
        applySignals({ dragOver: false } as Partial<Record<OrbStatus, boolean>>);
      }
    });
    return () => {
      clearDragOverTimer();
      off.then((f) => f());
    };
  }, [applySignals]);

  /* ---------- 1.4 三段接力：呼出（orb 收缩 120ms → 淡出让位 150ms） ---------- */

  const playSummonRelay = useCallback(async () => {
    setRelayPhase("summon");
    const orb = getCurrentWindow();
    try {
      await orb.setFocus();
    } catch {
      // ignore
    }
    // 通知 Rust：计算出现侧（1.8）并广播 window-summon 给主窗播 280ms 放大
    try {
      await invoke("summon_main_window");
    } catch {
      // ignore
    }
    window.setTimeout(async () => {
      try {
        await orb.hide();
      } catch {
        // ignore
      }
      // D23：呼出让位只复位接力相位，不动通知状态——状态由 orb-status 信号驱动，
      // 隐藏期间 listen 照常更新，缩回即显示后台真实状态。
      setRelayPhase("idle");
    }, ORB_ANIMATION.summonOrbShrinkMs + ORB_ANIMATION.summonOrbFadeMs);
  }, []);

  /* ---------- 1.6 拖放投放：drop → 呼出主窗口 → 主窗 upload + chip ---------- */

  useEffect(() => {
    const off = listen<{ paths?: string[] }>("orb-drop", (event) => {
      applySignals({ dragOver: false } as Partial<Record<OrbStatus, boolean>>);
      const paths = event.payload?.paths ?? [];
      if (paths.length === 0) return;
      // 投放即呼出主窗口并让位；upload 完整链路归模块 2.4，
      // 此处先由主窗口（持有 fs/http 权限）读取文件并上传、展示 chip。
      void playSummonRelay();
      void emit("orb-dropped", { paths }).catch(() => {});
    });
    return () => {
      off.then((f) => f());
    };
  }, [applySignals, playSummonRelay]);

  /* ---------- 1.4 三段接力：缩回（浮球 spring 弹回 200ms） ---------- */

  useEffect(() => {
    const off = listen<null>("orb-recall", async () => {
      const orb = getCurrentWindow();
      // D23：缩回弹回时不强制清常态——浮球状态只由后端信号（orb-status）驱动，
      // 此处若清 idle，用户缩起主窗等结果时后台 generating/done 会被抹掉错显常态灰。
      try {
        await orb.show();
        await orb.setFocus();
      } catch {
        // ignore
      }
      setRelayPhase("recall");
      window.setTimeout(() => setRelayPhase("idle"), ORB_ANIMATION.recallOrbSpringMs);
    });
    return () => {
      off.then((f) => f());
    };
  }, []);

  /* ---------- 1.7 拖动 + 角落吸附 + localStorage 持久化 ---------- */

  const snapToCorner = useCallback(async (x: number, y: number) => {
    const orb = getCurrentWindow();
    try {
      const monitor = await currentMonitor();
      if (!monitor) return;
      const scale = monitor.scaleFactor;
      const mx = monitor.position.x / scale;
      const my = monitor.position.y / scale;
      const mw = monitor.size.width / scale;
      const mh = monitor.size.height / scale;
      const size = await orb.outerSize();
      const w = size.width / scale;
      const h = size.height / scale;
      const maxX = mx + mw - w;
      const maxY = my + mh - h;
      const cx = Math.min(Math.max(x, mx), Math.max(mx, maxX));
      const cy = Math.min(Math.max(y, my), Math.max(my, maxY));
      // 角落吸附：距边缘 < SNAP_MARGIN 即贴角
      let sx = cx;
      let sy = cy;
      if (cx - mx < SNAP_MARGIN) sx = mx;
      else if (maxX - cx < SNAP_MARGIN) sx = maxX;
      if (cy - my < SNAP_MARGIN) sy = my;
      else if (maxY - cy < SNAP_MARGIN) sy = maxY;
      await orb.setPosition(new LogicalPosition(sx, sy));
      localStorage.setItem(ORB_POSITION_KEY, JSON.stringify({ x: sx, y: sy }));
      void emit("orb-position", { x: sx, y: sy }).catch(() => {});
    } catch {
      // 拿不到显示器：就地停留，磁盘权威位置由 Rust onMoved 落盘
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
    if (e.button === 2) {
      rightPressedRef.current = true;
      // 右键立即显示菜单（不再等异步计算），避免快速右键时 await 慢/失败导致呼不出。
      // Tauri v2 transparent 窗口不转发 contextmenu 事件，右键菜单改在 pointerdown 分支显示。
      setMenuOpen(true);
      // 开口方向自适应（避超屏）异步计算，失败沿用上次方向，不阻塞菜单弹出。
      void (async () => {
        try {
          const monitor = await currentMonitor();
          if (monitor) {
            const pos = await getCurrentWindow().outerPosition();
            const scale = monitor.scaleFactor;
            const screenMid = monitor.position.x / scale + monitor.size.width / scale / 2;
            // 浮球在左半屏 → 菜单朝右开（data-side="right"，弧带占右半圆、开口朝左）；
            // 浮球在右半屏 → 菜单朝左开（data-side="left"，弧带占左半圆、开口朝右）。
            const side: "left" | "right" = pos.x / scale + ORB_HIT_ZONE / 2 < screenMid ? "right" : "left";
            setMenuSide(side);
          }
        } catch {
          // ignore：沿用上次方向
        }
      })();
      return;
    }
    if (e.button !== 0) return;
    // 点在弧形菜单内（菜单项）：不关菜单、不拖动、不呼出——直接 return，让菜单项
    // 的 onClick 正常触发（runMenuItem 内部已有 setMenuOpen(false)）。
    // 必须置于 menuOpen 检查之前：否则点菜单项时 menuOpen=true 先 setMenuOpen(false)
    // 关掉菜单，菜单项 DOM 随之消失，onClick 来不及触发 → 置顶/新建/隐藏/退出全无反应。
    if ((e.target as HTMLElement).closest?.(".orb-arc-menu")) {
      leftDownRef.current = null;
      return;
    }
    // 菜单展开态：左键点浮球本体（菜单外）= 缩回菜单（不拖动、不呼出主窗），并吞掉双击的第二击。
    if (menuOpen) {
      setMenuOpen(false);
      setHovered(null);
      menuCloseGuardRef.current = Date.now() + MENU_CLOSE_GUARD_MS;
      leftDownRef.current = null;
      return;
    }
    // 双击缩回的第二击（收起菜单后 MENU_CLOSE_GUARD_MS 内）：整次吞掉。
    if (Date.now() < menuCloseGuardRef.current) {
      leftDownRef.current = null;
      return;
    }
    // 只记录按下点：等 pointermove 超过 DRAG_START_THRESHOLD 才交系统原生拖动，
    // 点击/拖动判定由此完全留在前端（不依赖 Rust 读透明窗口坐标）。
    leftDownRef.current = { x: e.clientX, y: e.clientY };
    dragInvokedRef.current = false;
    pointerMovedRef.current = false;
    // 捕获指针：拖动中指针会移出 60×60 命中区，不捕获的话后续 pointermove/up
    // 会被重新定位到 document，本组件收不到 → 阈值判定漏掉、点击也收不到 up。
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore：拿不到捕获就退化为「窗口内移动才判定」，功能不中断
    }
  }, [menuOpen]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.buttons !== 1) return; // 只关心左键按住时的移动
    if (dragInvokedRef.current) return; // 已交系统原生拖动，后续移动由窗口服务器合成
    if (Date.now() < menuCloseGuardRef.current) return; // 双击第二击的移动也吞掉
    const down = leftDownRef.current;
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (dx * dx + dy * dy < DRAG_START_THRESHOLD * DRAG_START_THRESHOLD) return;
    // 超过阈值 = 真拖动 → 交系统原生拖动（Rust orb_begin_native_drag →
    // start_dragging → macOS performWindowDragWithEvent，阻塞至松手）。
    // 点击（无位移）走不到这里，所以「点击→呼出」永远不会被误判。
    pointerMovedRef.current = true;
    dragInvokedRef.current = true;
    void invoke("orb_begin_native_drag").catch(() => {});
  }, []);

  /** 读取浮球当前窗口位置并做角落吸附 + 持久化（拖动收尾用）。 */
  const snapToCornerCurrent = useCallback(async () => {
    try {
      const pos = await getCurrentWindow().outerPosition();
      const scale = window.devicePixelRatio || 1;
      await snapToCorner(pos.x / scale, pos.y / scale);
    } catch {
      // ignore：拿不到位置就地停留，磁盘权威位置由 Rust onMoved 落盘
    }
  }, [snapToCorner]);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 2) {
        // 右键松手仅复位标记——菜单已在 pointerdown 的 button===2 分支打开。
        rightPressedRef.current = false;
        return;
      }
      if (e.button !== 0) return;
      const down = leftDownRef.current;
      leftDownRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      if (dragInvokedRef.current) {
        // 已发起原生拖动：正常情况下 mouseup 被 performWindowDragWithEvent 的嵌套
        // 循环吞掉（走不到这里）；走到这里说明原生拖动没吃掉松手，按「拖动」收尾
        // （就地吸附），绝不能反手呼出主窗。
        dragInvokedRef.current = false;
        const moved = pointerMovedRef.current;
        pointerMovedRef.current = false;
        if (moved) void snapToCornerCurrent();
        return;
      }
      pointerMovedRef.current = false;
      // 纯点击（无位移、未发起原生拖动）→ 呼出主窗（三段接力 1.4）。
      if (down) void playSummonRelay();
    },
    [playSummonRelay, snapToCornerCurrent],
  );

  // 原生拖动结束（Rust orb_begin_native_drag 在 drag_window 返回、鼠标松开后 emit）。
  // 原生拖动只在前端检测到真实位移后才发起，故到这里一律按「拖动松手」收尾：
  // 角落吸附 + 持久化（1.7）。「点击→呼出主窗」的判定已前移到前端 onPointerUp，
  // 不再依赖 Rust 读透明窗口坐标——那条路曾把拖动误判成点击、误呼出主窗。
  // payload.dragged 仅作诊断（Rust 双证据：Moved 计数 / 位置位移，见日志）。
  useEffect(() => {
    const off = listen<{ dragged?: boolean }>("orb-native-drag-end", () => {
      void snapToCornerCurrent();
    });
    return () => {
      off.then((f) => f());
    };
  }, [snapToCornerCurrent]);

  /* ---------- 1.5 右键弧形菜单（开口方向自适应半屏） ---------- */

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    // 右键弧形菜单统一在 onPointerDown 的 button===2 分支里 setMenuOpen(true) 打开
    // （含 menuSide 开口方向自适应计算）。此处只负责抑制系统/浏览器默认右键菜单，
    // 绝不再 toggle menuOpen——否则 pointerdown 刚 setMenuOpen(true)，随后触发的
    // contextmenu 又 setMenuOpen((v) => !v) 把它 toggle 回 false，导致右键菜单闪退/呼不出。
    e.preventDefault();
  }, []);

  const runMenuItem = useCallback(
    async (id: string) => {
      setMenuOpen(false);
      setHovered(null);
      switch (id) {
        case "pin":
          // 置顶态以 Rust 返回值为准（Rust 侧持有 ORB_PINNED 并真正
          // set_always_on_top 主窗口），前端不乐观猜，避免重启后视觉漂移。
          setPinned(await invoke<boolean>("toggle_orb_pin"));
          break;
        case "new":
          await invoke("orb_new_session");
          await playSummonRelay();
          break;
        case "hide":
          // D36（2026-10-27 修订）：隐藏=隐藏浮球自身（从桌面消失），
          // 点 Dock 栏 App 图标恢复（Rust RunEvent::Reopen → show 浮球）
          await invoke("orb_hide_orb");
          break;
        case "exit":
          await invoke("orb_exit_app");
          break;
      }
    },
    [playSummonRelay],
  );

  /* ---------- 渲染 ---------- */

  // 1.2 五色下发为 CSS 变量；1.3/1.4 由 data-status + relay 类驱动动画
  const color = orbColor(status);
  const isDragOver = status === "dragOver";

  return (
    <div
      className={`orb-root${relayPhase === "summon" ? " orb-summon" : ""}${
        relayPhase === "recall" ? " orb-recall" : ""
      }`}
      data-status={status}
      data-menu-open={menuOpen ? "true" : "false"}
      style={
        {
          "--orb-color": color,
          "--orb-size": `${ORB_SIZE}px`,
          "--orb-hit": `${ORB_HIT_ZONE}px`,
          "--drag-over-scale": DRAG_OVER_SCALE,
          "--menu-hover-scale": MENU_HOVER_SCALE,
          "--summon-shrink-ms": `${ORB_ANIMATION.summonOrbShrinkMs}ms`,
          "--summon-fade-ms": `${ORB_ANIMATION.summonOrbFadeMs}ms`,
          "--recall-spring-ms": `${ORB_ANIMATION.recallOrbSpringMs}ms`,
          "--summon-main-grow-ms": `${ORB_ANIMATION.summonMainGrowMs}ms`,
          "--recall-main-shrink-ms": `${ORB_ANIMATION.recallMainShrinkMs}ms`,
          "--summon-main-scale-from": ORB_ANIMATION.summonMainScaleFrom,
        } as React.CSSProperties
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={onContextMenu}
    >
      {/* 浮球本体（50px 圆，白→浅灰渐变 + 多层柔和阴影 + 小爪图） */}
      <div
        className="orb-body"
        onMouseEnter={() => {
          // 完成/错误态 hover 清除（1.3）
          if (status === "done" || status === "error") setStatus("idle");
        }}
      >
        {/* draggable=false：macOS WKWebView 上 img 默认可拖——按住爪印挪浮球会被
            误解为 HTML5 拖图（录屏实证：图副本被拉出+放置指示），且拖拽会话触发
            tauri drag 事件导致 dragOver 黄残留。禁拖后 pointer 流归位原生拖动。 */}
        <img
          className="orb-paw"
          src="/paw.png"
          alt="paw"
          width={32}
          height={32}
          draggable={false}
        />
        {/* 1.2 细边框流光：头亮尾淡 + 粒子拖尾 + drop-shadow 氛围光（CSS conic 动画） */}
        <span className="orb-stream" aria-hidden>
          <i style={{ "--pa": "120deg", "--ps": "2.2px", "--po": "0.5" } as React.CSSProperties} />
          <i style={{ "--pa": "155deg", "--ps": "1.7px", "--po": "0.35" } as React.CSSProperties} />
          <i style={{ "--pa": "190deg", "--ps": "1.2px", "--po": "0.2" } as React.CSSProperties} />
        </span>
        {/* 1.2 苹果风角标：17px + 2px 白边 + 双层辉光（近 6px 实 + 远 14px 虚）。
            审批=黄 / 完成=绿 / 错误=红；常态与生成中不显示。 */}
        {(status === "approval" || status === "done" || status === "error") && (
          <span className={`orb-badge orb-badge--${status}`} aria-hidden />
        )}
      </div>

      {/* 拖入态图标：📥（1.6，浮球 scale 1.15 由 CSS 驱动） */}
      {isDragOver && (
        <span className="orb-drop-icon" role="img" aria-label="投放">
          📥
        </span>
      )}

      {/*
        1.5 右键弧形菜单：v6 连续弧带。
        容器常驻（不开时 opacity 0 + pointer-events none），靠 data-open 播放展开动画；
        300×300 容器圆心与浮球中心重合，SVG / 图标同一坐标系，不会错位。
        开口方向自适应：浮球在右半屏 → 弧带在左、开口朝右；左半屏 → 镜像。
      */}
      <div
        className="orb-arc-menu"
        data-open={menuOpen ? "true" : "false"}
        data-side={menuSide}
        role="menu"
        aria-label="浮球菜单"
        onMouseLeave={() => setHovered(null)}
      >
        <svg
          className="orb-arc-svg"
          width={ARC_BOX}
          height={ARC_BOX}
          viewBox={`0 0 ${ARC_BOX} ${ARC_BOX}`}
          aria-hidden
        >
          {/* 底弧：一条完整弧带（圆头端），不是扇形切片拼合 */}
          <path
            d={arcPath(menuSide === "left" ? 90 : -90, menuSide === "left" ? 270 : 90)}
            fill="none"
            stroke="rgba(38,46,40,0.78)"
            strokeWidth={ARC_BAND_W}
            strokeLinecap="round"
          />
          {/* 4 个透明热点段：hover 检测 + 段高亮 */}
          {MENU_ITEMS.map((item, i) => {
            const seg = arcSegment(i, menuSide);
            return (
              <path
                key={item.id}
                className="orb-arc-seg"
                data-active={hovered === i ? "true" : "false"}
                d={arcPath(seg.a1, seg.a2)}
                onMouseEnter={() => setHovered(i)}
                onClick={() => void runMenuItem(item.id)}
              />
            );
          })}
        </svg>

        {/* 图标：落在中线半径 70 的段中点角上，hover 变绿 + 放大 1.12 */}
        {MENU_ITEMS.map((item, i) => {
          const [ix, iy] = arcPoint(arcSegment(i, menuSide).mid);
          return (
            <div
              key={item.id}
              className="orb-arc-icon"
              data-active={hovered === i ? "true" : "false"}
              // 图钉项带置顶态（pinned=true 高亮填充 / false 灰色描边，见 Orb.css），
              // 让用户一眼看出主窗口此刻是否置顶。
              data-pinned={item.id === "pin" ? (pinned ? "true" : "false") : undefined}
              style={{ left: `${ix}px`, top: `${iy}px` }}
              role="menuitem"
              onMouseEnter={() => setHovered(i)}
              onClick={() => void runMenuItem(item.id)}
            >
              {item.icon}
            </div>
          );
        })}

        {/* 气泡：开口正中（弧带两个开口端之间），显示「标签 · 动作」 */}
        <div className={`orb-arc-bubble${hovered !== null ? " show" : ""}`}>
          {hovered !== null && (
            <>
              <b style={{ color: "#4ade80" }}>
                {MENU_ITEMS[hovered].label}
                {MENU_ITEMS[hovered].id === "pin" && pinned ? " ✓" : ""}
              </b>{" · "}
              {MENU_ITEMS[hovered].action}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
