/**
 * 模块 6（6.3）：前端日志通道。
 *
 * UI 事件（SSE 消费 / 用户操作 / 连接状态）经 invoke("log_frontend")
 * 写入 Rust 侧同一日志文件 ~/Library/Logs/QwenPaw轻量助手/QwenPaw-YYYY-MM-DD.log。
 *
 * 隐私红线（plan 6.3）：只传模块名 + 事件元数据（错误摘要），
 * 绝不传对话内容 / token / 密码。
 */

import { invoke } from "@tauri-apps/api/core";

export type LogLevel = "ERROR" | "WARN" | "INFO";

/**
 * 写一条前端日志。日志通道不可用时静默失败——不阻塞 UI 主流程。
 */
export async function logEvent(level: LogLevel, module: string, message: string): Promise<void> {
  try {
    await invoke("log_frontend", { level, module, message });
  } catch {
    // Rust 侧 logger 未接线 / 非 Tauri 环境：静默降级
  }
}

export function logInfo(module: string, message: string): Promise<void> {
  return logEvent("INFO", module, message);
}

export function logWarn(module: string, message: string): Promise<void> {
  return logEvent("WARN", module, message);
}

export function logError(module: string, message: string): Promise<void> {
  return logEvent("ERROR", module, message);
}
