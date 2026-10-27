// 模块 4（4.2）：主窗口状态持久化。
//
// 职责：
// - localStorage 记住主窗口上次的位置/大小（key: "pawpad-window-state"）；
// - 启动时恢复位置/大小（无记录时默认落在当前显示器右下角，边距 MARGIN）；
// - 窗口 move/resize 后实时写回，下次启动 setPosition/setSize 恢复。
//
// 联动：tauri.conf.json 里 width=400/height=520、minWidth/minHeight=320×320
// （4.1）兜底，恢复值最小不得小于最小值——本层恢复只存实际观测值，不越权放大。

import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";

/** localStorage 存储 key（模块 4 规范指定）。 */
const STORAGE_KEY = "pawpad-window-state";

/** 无历史记录时，窗口落在显示器右下角的边距（逻辑像素）。 */
const DEFAULT_MARGIN = 24;

export interface WindowState {
  /** 窗口左上角 X（逻辑坐标，相对显示器）。 */
  x: number;
  /** 窗口左上角 Y（逻辑坐标，相对显示器）。 */
  y: number;
  /** 窗口宽度（逻辑像素）。 */
  width: number;
  /** 窗口高度（逻辑像素）。 */
  height: number;
}

/**
 * 从 localStorage 读取上次保存的窗口状态。
 * 不存在、JSON 损坏或字段类型不符时返回 null（调用方走默认右下角落位）。
 */
export function readWindowState(): WindowState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WindowState>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number"
    ) {
      return null;
    }
    return { x: parsed.x, y: parsed.y, width: parsed.width, height: parsed.height };
  } catch {
    // 隐私模式 / localStorage 不可用：静默降级为「不恢复」
    return null;
  }
}

/** 写入窗口状态到 localStorage；失败（配额/隐私模式）静默降级，不影响窗口使用。 */
export function writeWindowState(state: WindowState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

/**
 * 启动时恢复窗口位置/大小。
 * - 有历史状态：setSize + setPosition 恢复上次几何；
 * - 无历史状态：落到当前显示器右下角（MARGIN 边距），满足「右下角区域默认出现」。
 */
export async function restoreWindowState(): Promise<void> {
  const window = getCurrentWindow();
  const saved = readWindowState();
  if (saved) {
    await window.setSize(new LogicalSize(saved.width, saved.height));
    await window.setPosition(new LogicalPosition(saved.x, saved.y));
    return;
  }
  try {
    const monitor = await currentMonitor();
    if (!monitor) return;
    const size = await window.outerSize();
    const x = monitor.position.x + monitor.size.width - size.width - DEFAULT_MARGIN;
    const y = monitor.position.y + monitor.size.height - size.height - DEFAULT_MARGIN;
    await window.setPosition(new LogicalPosition(x, y));
  } catch {
    // 拿不到显示器信息（极端环境）：保持 tauri.conf.json 默认位置
  }
}

/**
 * 监听窗口移动/缩放，实时写回状态，保证下次启动可恢复。
 * 幂等：重复调用会重复挂监听，请在应用入口调用一次。
 */
export function startWindowStateTracking(): void {
  const window = getCurrentWindow();
  window.onMoved(async ({ payload }) => {
    try {
      const size = await window.outerSize();
      writeWindowState({
        x: payload.x,
        y: payload.y,
        width: size.width,
        height: size.height,
      });
    } catch {
      // ignore
    }
  });
  window.onResized(async ({ payload }) => {
    try {
      const pos = await window.outerPosition();
      writeWindowState({
        x: pos.x,
        y: pos.y,
        width: payload.width,
        height: payload.height,
      });
    } catch {
      // ignore
    }
  });
}

/**
 * 模块 4（4.4）：主窗口置顶切换（供模块 1 弧形菜单调用）。
 * 底层经 Tauri 命令 invoke("set_main_window_always_on_top")（window.rs），
 * 开 = 全屏 App 下可见 / 关 = 正常层级。默认不置顶；浮球置顶归模块 1。
 */
export async function setMainWindowAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_main_window_always_on_top", { alwaysOnTop });
}
