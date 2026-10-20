/**
 * T3 连接层：离线检测。
 * MVP 口径（plan T3）：连不上 localhost:8088 时提示"QwenPaw 未运行"，不崩溃、不自动重连。
 * 周期性监控只负责把在线/离线状态变化通知 UI（T13 的 OfflineBanner 与 T4 的 TopBar 消费），
 * 不对失败请求做后台重试。
 */

import { listAgents } from "./api";

/** T3 验收要求的提示文案 */
export const OFFLINE_MESSAGE = "QwenPaw 未运行";

const PROBE_TIMEOUT_MS = 3000;

/** 单次在线探测：能拉到 agent 列表即在线 */
export async function checkOnline(): Promise<boolean> {
  try {
    await listAgents();
    return true;
  } catch {
    return false;
  }
}

/**
 * 周期性监控在线状态，仅在状态翻转时回调。
 * 返回停止函数（useEffect cleanup 用）。
 */
export function watchConnection(
  onChange: (online: boolean) => void,
  intervalMs = 5000,
): () => void {
  let stopped = false;
  let current: boolean | null = null;

  const tick = async () => {
    if (stopped) return;
    const online = await checkOnline();
    if (stopped) return;
    if (online !== current) {
      current = online;
      onChange(online);
    }
  };

  void tick();
  const timer = setInterval(tick, intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/** 探测超时常量（供测试/调试引用） */
export const PROBE_TIMEOUT = PROBE_TIMEOUT_MS;
