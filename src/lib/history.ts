/**
 * T7：历史消息加载（D19 加载方案 + D8 过滤规则）。
 *
 * API 实证（2026-10-18）：`GET /api/agents/{id}/chats/{chat_id}` 只认 chat UUID——
 * 用 session_id（T5 持久化的时间戳）当路径参数会 404 "Chat not found"。
 * 故 loadHistory 接收 session_id，先经 listChats 映射到 chat.id 再拉历史；
 * 新 session 还没落成 chat（没聊过）时映射不到 → 空历史（正确语义）。
 *
 * D8 过滤（filterHistoryForDisplay 纯函数）：
 * - 保留：用户消息（role=user）/ agent 最终答案（type=message 且 status=completed）/ 工具摘要行
 * - 丢弃：thinking（type=reasoning）/ 未完成消息（status≠completed）/ 工具详情参数
 * - 工具摘要行：plugin_call(function_call) 与 plugin_call_output(function_call_output)
 *   按 call_id 合并成一行；历史里的工具都是已完成的 → status=completed（T10 显对勾）
 */

import { getChatHistory, listChats, type RawMessage } from "./api";

/** D19：打开/切 agent 拉最近 20 条 */
export const HISTORY_LIMIT = 20;

/** 渲染用消息（四类信息分区的数据基础；T9 升级视觉，T10 接工具行） */
export type DisplayMessage =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string }
  | {
      kind: "tool";
      id: string;
      callId?: string;
      name?: string;
      output?: string;
      /** 运行态推断：历史工具均已完成 */
      status: "completed";
    };

/* ================= 纯函数：D8 过滤 ================= */

function joinText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (part && typeof part === "object") {
        const p = part as Record<string, unknown>;
        if (p.type === "text" && typeof p.text === "string") return p.text as string;
      }
      return "";
    })
    .join("");
}

/** 取消息内第一个 data 内容分片的 data 载荷（工具调用参数/输出） */
function firstToolData(msg: RawMessage): Record<string, unknown> | null {
  if (!Array.isArray(msg.content)) return null;
  for (const part of msg.content) {
    if (part && typeof part === "object") {
      const p = part as Record<string, unknown>;
      if (p.type === "data" && p.data && typeof p.data === "object") {
        return p.data as Record<string, unknown>;
      }
    }
  }
  return null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

const TOOL_CALL_TYPES = new Set(["plugin_call", "function_call"]);
const TOOL_OUTPUT_TYPES = new Set(["plugin_call_output", "function_call_output"]);

/**
 * D8 过滤：RawMessage[] → DisplayMessage[]。纯函数，不碰网络/DOM/存储。
 *
 * 规则：
 * 1. type=reasoning → 丢弃（thinking 不渲染）
 * 2. role=user → 用户消息（content 文本拼接）
 * 3. type=message 且 status=completed → agent 最终答案；status≠completed → 丢弃
 * 4. plugin_call/function_call 与 plugin_call_output/function_call_output →
 *    按 call_id 合并成一条工具摘要行（name 取先到先得，output 后到覆盖），status=completed
 * 5. 其他形状 → 丢弃
 */
export function filterHistoryForDisplay(messages: RawMessage[]): DisplayMessage[] {
  const out: DisplayMessage[] = [];
  const toolRows = new Map<string, Extract<DisplayMessage, { kind: "tool" }>>();

  for (const msg of messages) {
    if (msg.type === "reasoning") continue; // D8：thinking 丢弃

    if (TOOL_CALL_TYPES.has(msg.type) || TOOL_OUTPUT_TYPES.has(msg.type)) {
      const data = firstToolData(msg);
      const callId = str(data?.call_id) ?? msg.id;
      let row = toolRows.get(callId);
      if (!row) {
        row = {
          kind: "tool",
          id: `tool-${callId}`,
          callId,
          name: str(data?.name),
          output: undefined,
          status: "completed", // 运行态推断：历史中的工具均已完成
        };
        toolRows.set(callId, row);
        out.push(row);
      }
      if (!row.name) row.name = str(data?.name);
      const output = str(data?.output);
      if (output !== undefined) row.output = output;
      continue;
    }

    if (msg.role === "user") {
      out.push({ kind: "user", id: msg.id, text: joinText(msg.content) });
      continue;
    }

    if (msg.type === "message" && msg.status === "completed") {
      out.push({ kind: "assistant", id: msg.id, text: joinText(msg.content) });
      continue;
    }

    // in_progress 等未完成消息：丢弃（只保留最终答案）
  }

  return out;
}

/* ================= 加载 ================= */

/** session_id → chat.id 映射（API 只认 chat UUID，见文件头实证） */
export async function resolveChatId(agentId: string, sessionId: string): Promise<string | null> {
  const chats = await listChats(agentId);
  return chats.find((c) => c.session_id === sessionId)?.id ?? null;
}

/**
 * 拉当前 session 的最近 20 条历史并过滤。
 * 失败（session 不存在 / 网络错误 / 超时）→ 降级空列表，console 记错误，不崩溃不阻塞。
 */
export async function loadHistory(agentId: string, sessionId: string): Promise<DisplayMessage[]> {
  try {
    const chatId = await resolveChatId(agentId, sessionId);
    if (!chatId) return []; // 新 session 未落成 chat：空历史
    const history = await getChatHistory(agentId, chatId);
    const recent = history.messages.slice(-HISTORY_LIMIT);
    return filterHistoryForDisplay(recent);
  } catch (e) {
    console.error("[T7] loadHistory 失败，降级空列表:", e);
    return [];
  }
}
