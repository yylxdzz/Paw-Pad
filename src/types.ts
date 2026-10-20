/**
 * T6：QwenPaw SSE 事件类型定义。
 *
 * 事件结构经 2026-10-18 对 QwenPaw 源码实证（schemas.py + app/channels/base.py）：
 * - `object: "message"`：消息信封。type ∈ message / reasoning / plugin_call / plugin_call_output /
 *   function_call / function_call_output；status ∈ created → in_progress → completed（RunStatus）
 * - `object: "content"`：内容分片。type ∈ text / data / image / ...；delta=true 为流式增量；
 *   text 分片带 text 字段，data 分片带 data（FunctionCall / FunctionCallOutput）
 * - `object: "response"`：整轮响应结束
 * - `{ "error": "..." }`：流内错误（console.py 的 except 分支）
 *
 * pydantic 模型 extra="allow"，事件可能带额外字段，故用索引签名兜底。
 */

/** RunStatus：created → in_progress → completed（failed/cancelled 为异常态） */
export type SSERunStatus = "created" | "in_progress" | "completed" | "failed" | "cancelled";

/** 消息信封事件（object: "message"） */
export interface SSEMessageEvent {
  object: "message";
  id?: string;
  msg_id?: string;
  /** message / reasoning / plugin_call / plugin_call_output / ... */
  type?: string;
  /** user / assistant / system / tool */
  role?: string;
  status?: SSERunStatus;
  content?: unknown[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/** 内容分片事件（object: "content"） */
export interface SSEContentEvent {
  object: "content";
  /** text / data / image / audio / video / file / refusal */
  type?: string;
  /** true = 流式增量分片 */
  delta?: boolean;
  index?: number | null;
  status?: SSERunStatus | null;
  msg_id?: string | null;
  /** text 分片的增量文本 */
  text?: string;
  /** data 分片的载荷（工具调用参数/输出） */
  data?: unknown;
  [key: string]: unknown;
}

/** 整轮响应事件（object: "response"） */
export interface SSEResponseEvent {
  object: "response";
  status?: SSERunStatus;
  [key: string]: unknown;
}

/** 流内错误事件 */
export interface SSEErrorEvent {
  error: string;
  [key: string]: unknown;
}

/** 解析出的单条 SSE 事件（未识别形状按 record 兜底） */
export type SSEEvent =
  | SSEMessageEvent
  | SSEContentEvent
  | SSEResponseEvent
  | SSEErrorEvent
  | Record<string, unknown>;

/** 事件分类（classifySSEEvent 的返回值） */
export type SSEEventKind =
  | "token" // content text delta：流式 token 增量
  | "tool-call" // plugin_call / function_call：工具调用
  | "tool-result" // plugin_call_output / function_call_output：工具结果
  | "message" // message 信封（生命周期，非 reasoning）
  | "reasoning" // thinking 事件（D8：不渲染）
  | "response" // 整轮响应结束
  | "error" // 流内错误
  | "ignore"; // 无需处理的形状

/** 工具调用信息（T10 工具行消费） */
export interface ToolCallInfo {
  callId?: string;
  name?: string;
  arguments?: string;
  msgId?: string;
  raw: unknown;
}

/** 工具结果信息（T10 工具行消费） */
export interface ToolResultInfo {
  callId?: string;
  name?: string;
  output?: string;
  msgId?: string;
  raw: unknown;
}

/** streamChat 的回调集（T7/T9/T10/T12 按需接） */
export interface StreamChatHandlers {
  /** 流式 token 增量（已节流 16ms；T9 追加到当前答案） */
  onToken?: (text: string) => void;
  /** 工具调用（T10 建工具行） */
  onToolCall?: (info: ToolCallInfo) => void;
  /** 工具结果（T10 更新工具行） */
  onToolResult?: (info: ToolResultInfo) => void;
  /** message 生命周期事件（status created/in_progress/completed；reasoning 已滤除） */
  onMessage?: (event: SSEMessageEvent) => void;
  /** 整轮完成（status: completed / response / 流正常结束） */
  onTurnComplete?: () => void;
  /** 流内错误或断流（上层显示"连接中断"，不卡死） */
  onError?: (error: Error) => void;
}
