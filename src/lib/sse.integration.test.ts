/**
 * T6 流式链路集成测试（vitest + vi.mock plugin-http）。
 *
 * 目的：把 streamChat 全链路从"静态审核"升级为"运行证据"——
 * token 顺序 / 跨 chunk 恢复 / error 中断（N3 回归）/ cancel 收场，
 * 全部用假 Response 的 ReadableStream 喂真实 SSE 文本，产品代码零改动。
 *
 * mock 点：api.ts 经 @tauri-apps/plugin-http 的 fetch 发请求——
 * vi.mock 掉它，返回 { ok, status, body: ReadableStream }，流内容与分块节奏可控。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type {
  SSEMessageEvent,
  StreamChatHandlers,
  ToolCallInfo,
  ToolResultInfo,
} from "../types";
import { cancelActiveStream, streamChat } from "./sse";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

const mockFetch = vi.mocked(tauriFetch);
const enc = new TextEncoder();

/** 固定分块大小的 SSE 流（立即吐块，用于跨 chunk 边界用例） */
function chunkedStream(text: string, size: number): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= text.length) {
        controller.close();
        return;
      }
      controller.enqueue(enc.encode(text.slice(i, i + size)));
      i += size;
    },
  });
}

/** 每个事件之间延迟的流（延迟 > 16ms 节流窗口，用于验证 token 按序独立回调） */
function delayedStream(events: string[], delayMs: number): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      if (i >= events.length) {
        controller.close();
        return;
      }
      await new Promise((r) => setTimeout(r, delayMs));
      controller.enqueue(enc.encode(events[i]));
      i += 1;
    },
  });
}

/** 喂完 chunks 后挂起（pull 永不 resolve）——用例 4 的取消对象 */
function hangingStream(chunks: string[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(enc.encode(chunks[i]));
        i += 1;
        return;
      }
      return new Promise<void>(() => {}); // 永不 resolve：模拟后端断流不吐数据
    },
  });
}

function fakeResponse(body: ReadableStream<Uint8Array>): Response {
  return { ok: true, status: 200, body } as unknown as Response;
}

interface Collected {
  tokens: string[];
  toolCalls: ToolCallInfo[];
  toolResults: ToolResultInfo[];
  messages: SSEMessageEvent[];
  turns: number;
  errors: Error[];
}

function collect(): { c: Collected; handlers: StreamChatHandlers } {
  const c: Collected = {
    tokens: [],
    toolCalls: [],
    toolResults: [],
    messages: [],
    turns: 0,
    errors: [],
  };
  return {
    c,
    handlers: {
      onToken: (t) => c.tokens.push(t),
      onToolCall: (i) => c.toolCalls.push(i),
      onToolResult: (r) => c.toolResults.push(r),
      onMessage: (m) => c.messages.push(m),
      onTurnComplete: () => {
        c.turns += 1;
      },
      onError: (e) => c.errors.push(e),
    },
  };
}

/** 完整链路事件序列（created → token×3 → reasoning → tool_call → tool_result → completed → response） */
const FULL_CHAIN = [
  'data: {"object":"message","type":"message","status":"created","role":"assistant"}\n\n',
  'data: {"object":"content","type":"text","delta":true,"text":"你"}\n\n',
  'data: {"object":"content","type":"text","delta":true,"text":"好"}\n\n',
  'data: {"object":"content","type":"text","delta":true,"text":"！"}\n\n',
  'data: {"object":"message","type":"reasoning","status":"in_progress"}\n\n',
  'data: {"object":"message","type":"plugin_call","content":[{"type":"data","data":{"call_id":"c1","name":"read_file","arguments":"{}"}}]}\n\n',
  'data: {"object":"message","type":"plugin_call_output","content":[{"type":"data","data":{"call_id":"c1","output":"142 行"}}]}\n\n',
  'data: {"object":"message","type":"message","status":"completed","role":"assistant"}\n\n',
  'data: {"object":"response","status":"completed"}\n\n',
];

beforeEach(() => {
  mockFetch.mockReset();
});

describe("T6 streamChat 全链路集成", () => {
  it("用例1 完整链路：token 按序拼接 / 工具回调各一次 / reasoning 零派发", async () => {
    mockFetch.mockResolvedValue(fakeResponse(delayedStream(FULL_CHAIN, 20)));
    const { c, handlers } = collect();

    await streamChat("hi", "default", "s1", handlers);

    // token：20ms 间隔 > 16ms 节流窗口 → 三条独立回调且按序
    expect(c.tokens).toEqual(["你", "好", "！"]);
    expect(c.tokens.join("")).toBe("你好！");

    // 工具：call 与 result 各一次，callId 对应
    expect(c.toolCalls).toHaveLength(1);
    expect(c.toolCalls[0].callId).toBe("c1");
    expect(c.toolCalls[0].name).toBe("read_file");
    expect(c.toolResults).toHaveLength(1);
    expect(c.toolResults[0].callId).toBe("c1");
    expect(c.toolResults[0].output).toBe("142 行");

    // reasoning 零派发；两条 message 信封（created + completed）正常派发
    expect(c.messages.some((m) => m.type === "reasoning")).toBe(false);
    expect(c.messages.filter((m) => m.type === "message")).toHaveLength(2);

    // onTurnComplete 恰好一次：三条完成路径（message completed / response / 流结束）
    // 经 turnFinished 标志去重，首次到达派发、后续跳过（集成测试批裁定收紧）
    expect(c.turns).toBe(1);
    expect(c.errors).toHaveLength(0);
  });

  it("用例2 error 中断（N3 回归）：error 后零派发、错误路径无双信号", async () => {
    const chain = [
      'data: {"object":"content","type":"text","delta":true,"text":"前半"}\n\n',
      'data: {"error":"boom"}\n\n',
      'data: {"object":"content","type":"text","delta":true,"text":"残余"}\n\n',
      'data: {"object":"response","status":"completed"}\n\n',
    ];
    mockFetch.mockResolvedValue(fakeResponse(delayedStream(chain, 20)));
    const { c, handlers } = collect();

    await streamChat("hi", "default", "s1", handlers);

    expect(c.errors).toHaveLength(1);
    expect(c.errors[0].message).toBe("boom");
    // error 之后的"残余"token 与 response 零派发（N3：read 循环中断）
    expect(c.tokens.join("")).toBe("前半");
    expect(c.toolCalls).toHaveLength(0);
    // 错误路径不触发 onTurnComplete（不双信号；由 onError 收尾）
    expect(c.turns).toBe(0);
  });

  it("用例3 跨 chunk 边界：7 字符分块喂入，事件完整恢复", async () => {
    const text = FULL_CHAIN.join("");
    mockFetch.mockResolvedValue(fakeResponse(chunkedStream(text, 7)));
    const { c, handlers } = collect();

    await streamChat("hi", "default", "s1", handlers);

    // 与整块喂入一致：token 内容/工具回调/message 信封全部恢复
    expect(c.tokens.join("")).toBe("你好！");
    expect(c.toolCalls).toHaveLength(1);
    expect(c.toolCalls[0].callId).toBe("c1");
    expect(c.toolResults).toHaveLength(1);
    expect(c.messages.some((m) => m.type === "reasoning")).toBe(false);
    expect(c.messages.filter((m) => m.type === "message")).toHaveLength(2);
    expect(c.turns).toBe(1);
    expect(c.errors).toHaveLength(0);
  });

  it("用例4 cancelActiveStream：挂起流取消后循环收场、无后续回调", async () => {
    mockFetch.mockResolvedValue(
      fakeResponse(
        hangingStream([
          'data: {"object":"content","type":"text","delta":true,"text":"你"}\n\n',
          'data: {"object":"content","type":"text","delta":true,"text":"好"}\n\n',
        ]),
      ),
    );
    const { c, handlers } = collect();

    const done = streamChat("hi", "default", "s1", handlers);
    await new Promise((r) => setTimeout(r, 60)); // 两条 token 读完并 flush
    const tokensBefore = c.tokens.length;

    cancelActiveStream();
    await done; // 必须 resolve（read 循环结束）；若 cancel 无效则挂起，测试超时失败

    expect(c.tokens.join("")).toBe("你好");
    expect(c.tokens.length).toBe(tokensBefore); // cancel 后无新 token
    expect(c.toolCalls).toHaveLength(0);
    expect(c.turns).toBe(1); // 仅流结束路径一次
    expect(c.errors).toHaveLength(0);
  });
});
