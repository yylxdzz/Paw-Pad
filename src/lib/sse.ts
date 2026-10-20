/**
 * T6：自写 SSE 客户端（D13 零包依赖——不用浏览器原生 SSE 设施，不引第三方解析库）。
 *
 * 数据通路（T3 实证基础）：
 *   api.sendChatMessage() → @tauri-apps/plugin-http 的 fetch（Rust 侧 reqwest，绕开 WebView CORS）
 *   → 返回标准 DOM Response，`.body` 是标准 ReadableStream<Uint8Array>
 *   （pull → invoke plugin:http|fetch_read_body 逐块喂数据）
 *   → getReader() 循环读 → TextDecoder 增量解码 → parseSSEChunk 切事件 → 分发
 *
 * 事件结构实证（QwenPaw schemas.py + app/channels/base.py）：
 *   object=message（type: message/reasoning/plugin_call/...，status: created→in_progress→completed）
 *   object=content（text delta 增量 / data 工具调用）
 *   object=response（整轮结束）/ {error}（流内错误）
 */

import { sendChatMessage } from "./api";
import type {
  SSEEvent,
  SSEEventKind,
  SSEMessageEvent,
  StreamChatHandlers,
  ToolCallInfo,
  ToolResultInfo,
} from "../types";

/* ================= 纯函数：SSE 协议切分 ================= */

export interface ParsedSSE {
  /** 本次切出的完整事件（已 JSON.parse；非 JSON 的 data 行被跳过） */
  events: SSEEvent[];
  /** 末尾不完整事件的残余（调用方拼上下个 chunk 再喂进来） */
  rest: string;
}

/**
 * 从 SSE 文本缓冲切出完整事件。纯函数，不碰网络/DOM。
 *
 * 协议处理：
 * - 事件间以空行分隔（`\n\n`）；末尾不足一个完整事件的部分进 rest
 * - 每条事件按行切字段；只收 `data:` 字段（可多行，按 `\n` 拼接）
 * - `data:` 值去掉冒号后单个可选空格（SSE 规范）
 * - 注释行（`:` 开头）与 event:/id:/retry: 等其他字段忽略
 * - data 内容 JSON.parse 失败（保活/非 JSON）跳过，不抛
 */
export function parseSSEChunk(buffer: string): ParsedSSE {
  const events: SSEEvent[] = [];
  let rest = buffer;

  for (;;) {
    const sep = rest.indexOf("\n\n");
    if (sep === -1) break;
    const rawEvent = rest.slice(0, sep);
    rest = rest.slice(sep + 2);

    const data = extractDataField(rawEvent);
    if (data === null) continue;
    try {
      events.push(JSON.parse(data) as SSEEvent);
    } catch {
      // 非 JSON data（keep-alive 等）：按协议忽略
    }
  }

  return { events, rest };
}

/** 从单条原始事件文本提取 data 字段（多行拼接）；无 data 返回 null */
function extractDataField(rawEvent: string): string | null {
  const dataLines: string[] = [];
  for (const line of rawEvent.split("\n")) {
    if (line === "" || line.startsWith(":")) continue; // 空行 / 注释行
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    if (field !== "data") continue; // event:/id:/retry: 等忽略
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1); // 单空格前缀
    dataLines.push(value);
  }
  return dataLines.length > 0 ? dataLines.join("\n") : null;
}

/* ================= 纯函数：事件分类与提取 ================= */

function asRecord(ev: SSEEvent): Record<string, unknown> {
  return ev as Record<string, unknown>;
}

/**
 * 事件分类（纯函数）。reasoning 单独分类——D8：thinking 默认不渲染。
 */
export function classifySSEEvent(ev: SSEEvent): SSEEventKind {
  const r = asRecord(ev);

  if (typeof r.error === "string") return "error";

  if (r.object === "content") {
    if (r.type === "text" && r.delta === true && typeof r.text === "string") {
      return "token";
    }
    if (r.type === "data") {
      const data = r.data;
      if (data && typeof data === "object") {
        const d = data as Record<string, unknown>;
        if ("output" in d) return "tool-result";
        if ("arguments" in d || "name" in d || "call_id" in d) return "tool-call";
      }
    }
    return "ignore";
  }

  if (r.object === "message") {
    if (r.type === "reasoning") return "reasoning";
    if (r.type === "plugin_call" || r.type === "function_call") return "tool-call";
    if (r.type === "plugin_call_output" || r.type === "function_call_output") {
      return "tool-result";
    }
    if (r.type === "message" || r.type === undefined) return "message";
    return "ignore";
  }

  if (r.object === "response") return "response";

  return "ignore";
}

/** 从事件提取 token 增量文本（仅 content text delta 有） */
export function extractToken(ev: SSEEvent): string | null {
  const r = asRecord(ev);
  return r.object === "content" && r.type === "text" && typeof r.text === "string"
    ? (r.text as string)
    : null;
}

/** 取事件内嵌的工具 data 载荷：content 事件取 ev.data，message 事件取 content[0].data */
function extractToolData(ev: SSEEvent): Record<string, unknown> | null {
  const r = asRecord(ev);
  if (r.object === "content") {
    return r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : null;
  }
  if (r.object === "message" && Array.isArray(r.content)) {
    for (const part of r.content) {
      if (part && typeof part === "object") {
        const p = part as Record<string, unknown>;
        if (p.type === "data" && p.data && typeof p.data === "object") {
          return p.data as Record<string, unknown>;
        }
      }
    }
  }
  return null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** 提取工具调用信息 */
export function extractToolCall(ev: SSEEvent): ToolCallInfo | null {
  const d = extractToolData(ev);
  if (!d) return null;
  const r = asRecord(ev);
  return {
    callId: str(d.call_id),
    name: str(d.name),
    arguments: str(d.arguments),
    msgId: str(r.msg_id) ?? str(r.id),
    raw: d,
  };
}

/** 提取工具结果信息 */
export function extractToolResult(ev: SSEEvent): ToolResultInfo | null {
  const d = extractToolData(ev);
  if (!d) return null;
  const r = asRecord(ev);
  return {
    callId: str(d.call_id),
    name: str(d.name),
    output: str(d.output),
    msgId: str(r.msg_id) ?? str(r.id),
    raw: d,
  };
}

/* ================= 流读取与分发 ================= */

/** token 节流窗口（plan T6 条件 5：16ms，避免每 token 重渲染） */
const TOKEN_FLUSH_MS = 16;

/** 模块级当前流 reader（单流假设：MVP 同时只有一个进行中的回合；T12 停止入口） */
let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

/**
 * T12 的停止入口：取消当前流的读取（插件会收到 cancel → fetch_cancel_body 释放 Rust 侧）。
 * 之后 read 循环按 spec 以 done 收场，streamChat 走 flush + onTurnComplete。
 */
export function cancelActiveStream(): void {
  const reader = activeReader;
  activeReader = null;
  if (reader) {
    void reader.cancel().catch(() => {});
  }
}

/**
 * 发起一轮对话并消费 SSE 流。
 *
 * @param message  用户输入文本
 * @param agentId  当前 agent id（undefined 时 api.ts 回退 session/default）
 * @param sessionId 当前 session id（T5 的 getCurrentSessionId() 传入；null 时 api.ts 不带 session_id）
 * @param handlers 回调集（T7/T9/T10/T12 按需接）
 *
 * 行为约定：
 * - 全程不 throw：网络错误 / 断流 / 解析外的异常都走 handlers.onError（上层显示"连接中断"）
 * - 流正常结束或收到 response/completed → flush 残余 token → onTurnComplete
 * - reasoning 事件只分类不派发（D8 不渲染）
 * - N3：流内 error 事件 → onError 后主动断流（cancel + break），不再派发残余事件，
 *   也不再触发 onTurnComplete（错误路径由 onError 收尾）
 */
export async function streamChat(
  message: string,
  agentId: string | undefined,
  sessionId: string | null,
  handlers: StreamChatHandlers,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  // token 节流：累积 16ms 内的增量，一次吐出
  let pendingToken = "";
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const flushToken = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (pendingToken) {
      const text = pendingToken;
      pendingToken = "";
      handlers.onToken?.(text);
    }
  };
  const pushToken = (text: string) => {
    pendingToken += text;
    if (!flushTimer) {
      flushTimer = setTimeout(flushToken, TOKEN_FLUSH_MS);
    }
  };

  // N3：流内 error 后中断读取（不再派发残余事件）
  let streamErrored = false;
  // 完成信号一次语义（测试批裁定）：三条完成路径——message 事件 status=completed /
  // object=response / 流自然结束收尾——共用本标志，首次到达置 true 并派发，后续跳过。
  // onError 路径不置标志（错误即本轮终态，不应再 complete）。
  let turnFinished = false;
  const emitTurnComplete = () => {
    if (!turnFinished) {
      turnFinished = true;
      handlers.onTurnComplete?.();
    }
  };

  const dispatch = (events: SSEEvent[]) => {
    for (const ev of events) {
      switch (classifySSEEvent(ev)) {
        case "token": {
          const t = extractToken(ev);
          if (t) pushToken(t);
          break;
        }
        case "tool-call": {
          const info = extractToolCall(ev);
          if (info) handlers.onToolCall?.(info);
          break;
        }
        case "tool-result": {
          const info = extractToolResult(ev);
          if (info) handlers.onToolResult?.(info);
          break;
        }
        case "message": {
          const r = ev as SSEMessageEvent;
          if (r.status === "completed") {
            flushToken();
            handlers.onMessage?.(r);
            emitTurnComplete();
          } else {
            handlers.onMessage?.(r);
          }
          break;
        }
        case "response":
          flushToken();
          emitTurnComplete();
          break;
        case "reasoning":
          break; // D8：thinking 不渲染
        case "error": {
          flushToken();
          const msg =
            typeof (ev as Record<string, unknown>).error === "string"
              ? ((ev as Record<string, unknown>).error as string)
              : "流内错误";
          handlers.onError?.(new Error(msg));
          streamErrored = true; // N3：置标志，read 循环随后中断
          return;
        }
        case "ignore":
          break;
      }
    }
  };

  try {
    const res = await sendChatMessage({ text: message, agentId, sessionId });
    if (!res.body) {
      throw new Error("SSE 响应无 body");
    }
    const reader = res.body.getReader();
    activeReader = reader;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        // value 为 Uint8Array 分片；stream:true 保留跨 chunk 的多字节字符
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSSEChunk(buffer);
        buffer = parsed.rest;
        dispatch(parsed.events);
        if (streamErrored) {
          // N3：流内 error 后主动取消读取（插件 cancel → 释放 Rust 侧 body），不再读后续分片
          cancelActiveStream();
          break;
        }
      }
    } finally {
      if (activeReader === reader) {
        activeReader = null;
      }
    }

    // 流结束：decoder 收尾（可能补全被截断的多字节字符），再跑一遍切分
    buffer += decoder.decode();
    if (!streamErrored && buffer) {
      const parsed = parseSSEChunk(buffer);
      buffer = "";
      dispatch(parsed.events);
    }

    flushToken();
    if (!streamErrored) {
      emitTurnComplete();
    }
  } catch (e) {
    // 断流 / 连接失败 / 后端异常：优雅降级，不卡死上层
    flushToken();
    handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
  }
}
