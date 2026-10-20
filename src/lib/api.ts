/*
 * T3 连接层：QwenPaw REST 客户端。
 *
 * D15 / plan T3 硬约束：
 * - 每个请求带 `X-Agent-Id: <当前 agent_id>`（当前值取自 session.ts，默认回退 "default"）
 * - 请求体 `channel` 固定 "console"（共享 Console session）
 * - localhost 自动免认证，不写 Authorization
 * - 连不上 localhost:8088 时抛错，由调用方 / connection.ts 做提示，不自动重连
 *
 * 网络走 @tauri-apps/plugin-http（Rust 侧 reqwest）：QwenPaw API 不返 CORS 头
 * （实测 OPTIONS 预检 405），WebView 全局 fetch 跨域会被全挡，必须走插件绕开。
 *
 * API 形状均经 2026-10-18 对 localhost:8088 实测核对：
 * - GET  /api/agents                      → { agents: Agent[] }
 * - GET  /api/agents/{id}/chats           → Chat[]
 * - GET  /api/agents/{id}/chats/{chat_id} → { messages: RawMessage[] }
 * - POST /api/console/chat                → SSE 流（T6 消费；此处返回原始 Response）
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import { getCurrentAgentId } from "./session";

const API_BASE = "http://localhost:8088";
const DEFAULT_AGENT_ID = "default";

/** D15：channel 固定 console */
export const CONSOLE_CHANNEL = "console";

type HttpResponse = Awaited<ReturnType<typeof tauriFetch>>;
type HttpRequestInit = NonNullable<Parameters<typeof tauriFetch>[1]>;

export interface Agent {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  pinned: boolean;
  startup_status?: string;
  workspace_dir?: string;
}

export interface Chat {
  id: string;
  name: string;
  session_id: string;
  user_id: string;
  channel: string;
  created_at: string;
  updated_at: string;
  last_finished_at: string | null;
  status: string;
  pinned: boolean;
  archived: boolean;
  source: string;
}

/** ChatHistory 的原始消息（T7 负责按 D8 过滤渲染，这里只保证形状透传） */
export interface RawMessage {
  id: string;
  type: string;
  role: string;
  content: unknown[];
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatHistory {
  messages: RawMessage[];
}

export interface SendChatMessageParams {
  /** 用户输入的文本 */
  text: string;
  /** 显式指定 agent；缺省取 session 里的 current_agent_id，再回退 "default" */
  agentId?: string;
  /** session_id，可空（T5 生成/接续） */
  sessionId?: string | null;
  /** user_id，默认 console-user */
  userId?: string;
}

/** 带上下文的请求错误（HTTP 非 2xx 或网络不可达） */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** 当前 agent id：显式参数 > session 持久化值 > "default" */
export function resolveAgentId(explicit?: string): string {
  return explicit ?? getCurrentAgentId() ?? DEFAULT_AGENT_ID;
}

function buildHeaders(agentId: string, extra?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Agent-Id": agentId,
    ...extra,
  };
}

async function request<T>(path: string, agentId: string, init?: HttpRequestInit): Promise<T> {
  let res: HttpResponse;
  try {
    res = await tauriFetch(`${API_BASE}${path}`, {
      ...init,
      headers: buildHeaders(agentId, init?.headers as Record<string, string> | undefined),
    });
  } catch {
    // 网络层失败（连接拒绝 / QwenPaw 未启动）
    throw new ApiError("QwenPaw 未运行", 0, path);
  }
  if (!res.ok) {
    throw new ApiError(`请求失败：HTTP ${res.status}`, res.status, path);
  }
  return (await res.json()) as T;
}

/** GET /api/agents —— 启动时拉取，供 T4 首启引导与顶部下拉使用 */
export async function listAgents(): Promise<Agent[]> {
  const data = await request<{ agents: Agent[] }>("/api/agents", resolveAgentId());
  return (data.agents ?? []).filter((a) => a.enabled !== false);
}

/** GET /api/agents/{agentId}/chats —— T5 接最近活跃 session 用 */
export async function listChats(agentId: string): Promise<Chat[]> {
  return request<Chat[]>(`/api/agents/${encodeURIComponent(agentId)}/chats`, resolveAgentId(agentId));
}

/** GET /api/agents/{agentId}/chats/{chatId} —— T7 历史加载用（原样返回，过滤归 T7） */
export async function getChatHistory(agentId: string, chatId: string): Promise<ChatHistory> {
  const path = `/api/agents/${encodeURIComponent(agentId)}/chats/${encodeURIComponent(chatId)}`;
  return request<ChatHistory>(path, resolveAgentId(agentId));
}

/**
 * POST /api/console/chat —— 返回原始 Response，T6 的 SSE 消费（fetch + ReadableStream）在此基础上接手。
 * 请求体按官方 API 文档：input 数组 + session_id + user_id + channel: "console"。
 */
export async function sendChatMessage(params: SendChatMessageParams): Promise<HttpResponse> {
  const { text, agentId, sessionId, userId = "console-user" } = params;
  const body = {
    input: [
      {
        role: "user",
        content: [{ type: "text", text }],
      },
    ],
    ...(sessionId ? { session_id: sessionId } : {}),
    user_id: userId,
    channel: CONSOLE_CHANNEL,
  };
  let res: HttpResponse;
  try {
    res = await tauriFetch(`${API_BASE}/api/console/chat`, {
      method: "POST",
      headers: buildHeaders(resolveAgentId(agentId), { Accept: "text/event-stream" }),
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("QwenPaw 未运行", 0, "/api/console/chat");
  }
  if (!res.ok) {
    throw new ApiError(`请求失败：HTTP ${res.status}`, res.status, "/api/console/chat");
  }
  return res;
}
