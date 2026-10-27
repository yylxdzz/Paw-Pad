/**
 * 模块 5：连接体系。
 *
 * 职责（plan 模块 5）：
 * - 5.1 端口发现：启动先试 localhost:8088，连不上扫描常见端口（3000/8000/5000），找到即用
 * - 5.2 地址持久化：解析出的 base 写 localStorage.pawpad_api_base；api.ts 经 getApiBase() 读取
 * - 5.3 状态灯数据源：isOnline / isSettled / onConnectionChange / retryConnection 供 StatusLight 订阅
 * - 5.4 自动重连：连接断开后每 5s 定时重试，找到可连地址即恢复并翻转状态
 * - onboarding 一次性标志：pawpad_onboarded（连上即视为已引导，之后不再弹）
 *
 * 兼容 MVP：保留 OFFLINE_MESSAGE / checkOnline / watchConnection（OfflineBanner 仍在消费）。
 * 本文件自包含——直接用 @tauri-apps/plugin-http 探测，不 import api.ts，
 * 以免与 api.ts（反向 import getApiBase）形成循环依赖。
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
// 模块 6（6.3）：连接事件记日志（在线/离线翻转，无内容）
import { logInfo } from "./logger";

/** T3 验收提示文案（OfflineBanner 消费，保持不变） */
export const OFFLINE_MESSAGE = "QwenPaw 未运行";

/** 默认 base：QwenPaw 默认跑 8088 */
export const DEFAULT_API_BASE = "http://localhost:8088";

/** 端口扫描候选：先 8088，再常见备选；串行探测，找到即停 */
export const SCAN_PORTS = [8088, 3000, 8000, 5000] as const;

/** 单点探测超时 */
const PROBE_TIMEOUT_MS = 3000;
/** 自动重连间隔（5s） */
export const RECONNECT_INTERVAL_MS = 5000;

const API_BASE_KEY = "pawpad_api_base";
const ONBOARDED_KEY = "pawpad_onboarded";

/* ================= base 地址持久化 ================= */

/** 内存缓存（避免每次读 localStorage） */
let memoryBase: string | null = null;

/** 当前 API base：内存缓存 > localStorage > 默认 8088。api.ts 发请求时调用。 */
export function getApiBase(): string {
  if (memoryBase) return memoryBase;
  try {
    return localStorage.getItem(API_BASE_KEY) ?? DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
}

/** 写入解析出的 base（端口发现 / onboarding 成功后调用） */
export function setApiBase(base: string): void {
  memoryBase = base;
  try {
    localStorage.setItem(API_BASE_KEY, base);
  } catch {
    // 存储失败不阻塞（内存态已生效）
  }
}

function readPersistedBase(): string | null {
  try {
    return localStorage.getItem(API_BASE_KEY);
  } catch {
    return null;
  }
}

/* ================= onboarding 一次性标志 ================= */

/** 是否已引导（连上过一次即视为已引导，之后不再弹 onboarding） */
export function getOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, "1");
  } catch {
    // ignore
  }
}

/* ================= 单点探测 ================= */

/**
 * 探测单个 base 是否可达：GET {base}/api/agents 返回 2xx 即在线。
 * 带超时（Promise.race + setTimeout），连接拒绝 / 超时都视为不可达。
 */
export async function probeBase(base: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const res = await Promise.race([
      tauriFetch(`${base}/api/agents`, {
        method: "GET",
        headers: { "X-Agent-Id": "default" },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("probe timeout")), timeoutMs);
      }),
    ]);
    return res.ok;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ================= 端口发现 ================= */

/** 候选 base 顺序：持久化地址优先，再 8088→3000→8000→5000（去重） */
export function candidateBases(): string[] {
  const persisted = readPersistedBase();
  const list = [
    ...(persisted ? [persisted] : []),
    ...SCAN_PORTS.map((p) => `http://localhost:${p}`),
  ];
  return Array.from(new Set(list));
}

/**
 * 5.1 端口发现：按候选顺序串行探测，找到第一个可达 base 即写入并返回；
 * 全部不可达返回 null（上层据此决定弹 onboarding）。
 */
export async function discoverBase(): Promise<string | null> {
  for (const base of candidateBases()) {
    if (await probeBase(base)) {
      setApiBase(base);
      return base;
    }
  }
  return null;
}

/* ================= 在线探测（兼容 MVP） ================= */

/** 单次在线探测：当前 base 可达即在线（OfflineBanner 消费） */
export async function checkOnline(): Promise<boolean> {
  return probeBase(getApiBase());
}

/* ================= 连接状态管理 + 自动重连 ================= */

type ConnectionListener = (online: boolean, base: string | null) => void;

const listeners = new Set<ConnectionListener>();
/** null = 尚未判定；true/false = 已知 */
let currentOnline: boolean | null = null;
let currentBase: string | null = null;
/** 首次探测是否已完成（用于区分「搜索中」与「确认离线」） */
let settled = false;

/** 当前是否在线 */
export function isOnline(): boolean {
  return currentOnline === true;
}

/** 连接状态是否已判定完成（false = 仍在首次搜索中） */
export function isSettled(): boolean {
  return settled;
}

/** 当前已解析的 base（未连上为 null） */
export function getCurrentBase(): string | null {
  return currentBase;
}

/** 订阅连接状态变化（StatusLight / watchConnection 用）；返回取消订阅函数 */
export function onConnectionChange(fn: ConnectionListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 应用一次探测结果：翻转状态 + 连上即标记已引导 + 通知订阅者 */
function applyState(online: boolean, base: string | null): void {
  const flipped = currentOnline !== online;
  const baseChanged = base !== currentBase;
  currentOnline = online;
  currentBase = base;
  settled = true;
  if (online && !getOnboarded()) setOnboarded(); // 连上即视为已引导（一次性）
  // 模块 6（6.3）：连接翻转记日志（只记状态 + base，无对话内容/token）
  if (flipped || baseChanged) {
    void logInfo("connection", `state=${online ? "online" : "offline"} base=${base ?? "-"}`);
    listeners.forEach((fn) => fn(online, base));
  }
}

/** 跑一次端口发现并应用结果（首次引导 / 重试按钮共用） */
async function runDiscoveryAndApply(): Promise<void> {
  const found = await discoverBase();
  applyState(found !== null, found);
}

/** 5.3 重试按钮：立即重新发现并刷新状态 */
export async function retryConnection(): Promise<void> {
  await runDiscoveryAndApply();
}

let reconnectStop: (() => void) | null = null;
let loopBusy = false;

/**
 * 5.4 自动重连循环：每 5s（setInterval）一次——
 * - 在线：健康检查当前 base
 * - 掉线：重新 discoverBase（端口可能变了），找到可连地址即恢复
 * busy 守卫防重叠 tick；stop 后不再跑（显式退出条件，杜绝无限循环）。
 */
function startReconnectLoop(): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped || loopBusy) return;
    loopBusy = true;
    try {
      const base = getApiBase();
      let online = await probeBase(base);
      let resolved: string | null = online ? base : null;
      if (!online) {
        const found = await discoverBase();
        online = found !== null;
        resolved = found;
      }
      if (!stopped) applyState(online, resolved);
    } finally {
      loopBusy = false;
    }
  };
  const timer = setInterval(tick, RECONNECT_INTERVAL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/**
 * 启动连接体系：跑一次端口发现 + 开启 5s 自动重连。幂等——
 * 已启动则直接返回停止函数（重复调用不重复开循环）。
 */
export function bootstrapConnection(): () => void {
  if (reconnectStop) return reconnectStop;
  void runDiscoveryAndApply();
  reconnectStop = startReconnectLoop();
  return reconnectStop;
}

/** 停止自动重连（测试 / 卸载用） */
export function stopConnection(): void {
  reconnectStop?.();
  reconnectStop = null;
}

/* ================= 兼容 MVP：周期性监控 ================= */

/**
 * 兼容保留：周期性监控在线状态，仅在翻转时回调。
 * 现在复用共享连接状态（确保循环在跑后订阅即可）。
 */
export function watchConnection(
  onChange: (online: boolean) => void,
  _intervalMs = RECONNECT_INTERVAL_MS,
): () => void {
  bootstrapConnection(); // 确保重连循环在跑
  let current: boolean | null = null;
  return onConnectionChange((online) => {
    if (online !== current) {
      current = online;
      onChange(online);
    }
  });
}
