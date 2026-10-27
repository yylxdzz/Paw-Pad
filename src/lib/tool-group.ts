/**
 * D8（2026-10-27 修订）：回合内连续工具调用分组（渲染层纯函数，数据层零改动）。
 *
 * messages 里每个工具调用是平铺的 kind:"tool" 项——连调 N 个工具就 N 行并排
 * 挤占答案区。本函数把「连续的 tool 段」打包为 toolGroup render item，
 * 由 ToolGroup 组件渲染为单行摘要（展开才看明细）；单工具段与跨回合断组
 * 规则见 groupConsecutiveTools 注释。
 *
 * 类型说明：MessageList 里的运行时消息类型实为 LiveMessage（已 export），
 * 此处按实际类型名 import。
 */

import type { LiveMessage as Message } from "../components/MessageList";

/** 渲染项：原消息 或 连续工具段打包的组 */
export type RenderItem =
  | { kind: "message"; message: Message }
  | { kind: "toolGroup"; key: string; tools: Message[] };

/**
 * 把 messages 转为渲染项：
 * - 连续的 kind:"tool" 项打包成一个 toolGroup（key 取段内首项 id，稳定唯一）
 * - 非 tool 消息原样输出，并打断工具段（跨回合不合并）
 * - 单工具段也打包（ToolGroup 内部对 length===1 直接渲染 ToolRow 不套组头）
 */
export function groupConsecutiveTools(messages: Message[]): RenderItem[] {
  const items: RenderItem[] = [];
  let run: Message[] = [];
  const flush = () => {
    if (run.length > 0) {
      items.push({ kind: "toolGroup", key: run[0].id, tools: run });
      run = [];
    }
  };
  for (const m of messages) {
    if (m.kind === "tool") {
      run.push(m);
    } else {
      flush();
      items.push({ kind: "message", message: m });
    }
  }
  flush();
  return items;
}

/** 组聚合状态：任一 running → running（组头显示 shimmer + 运行中） */
export function toolGroupStatus(tools: Message[]): "running" | "completed" {
  return tools.some((t) => t.kind === "tool" && t.status === "running") ? "running" : "completed";
}
