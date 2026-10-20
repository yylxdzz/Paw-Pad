// @vitest-environment jsdom
/**
 * slash 双 Enter 交互复现测试（用户冒烟 bug：/compact → Enter 选中 → 再 Enter 无反应）。
 *
 * 两层：
 * 1) InputBar 隔离层——组件自身 keydown/palette 逻辑（首跑即绿，证明组件无罪）
 * 2) App 接线层——mock session/sse/api，驱动完整 App，断言双 Enter 后
 *    streamChat 真收到 ("/compact", agentId, sessionId, handlers) 且输入框清空、
 *    isStreaming 复位（排除 handleSend 陈旧闭包）
 */
import { describe, expect, it, vi, afterEach, beforeAll } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InputBar from "./InputBar";
import App from "../App";

// vitest 未开 globals，RTL 自动 cleanup 不注册——手动挂 afterEach
afterEach(cleanup);

// jsdom 不实现 Element.scrollTo（MessageList 自动滚动用）——测试侧打桩，非产品缺陷
beforeAll(() => {
  Element.prototype.scrollTo = vi.fn();
});

/* ---------- App 接线层的 mock（session/sse/api 三层） ---------- */

const { streamChatMock } = vi.hoisted(() => ({ streamChatMock: vi.fn() }));

vi.mock("../lib/session", () => ({
  getCurrentAgentId: () => "default",
  getCurrentSessionId: () => "s1",
  newSession: vi.fn(),
  onSessionChange: (_cb: (id: string | null) => void) => () => {},
  resolveSession: async () => "s1",
  switchAgent: async () => "s1",
}));

vi.mock("../lib/sse", () => ({
  streamChat: streamChatMock,
  cancelActiveStream: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-http", () => ({
  // listAgents/listChats 均期望数组（history.ts:132 对返回值调 .find）
  fetch: vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => [],
  })),
}));

describe("InputBar slash 双 Enter（组件层复现）", () => {
  it("选中命令后第二次 Enter 应发送 /compact", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();

    render(<InputBar onSend={onSend} onStop={vi.fn()} isStreaming={false} />);
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;

    await user.type(ta, "/compact");
    expect(screen.getByRole("listbox")).toBeTruthy();

    await user.type(ta, "{Enter}");
    expect(ta.value).toBe("/compact ");
    expect(screen.queryByRole("listbox")).toBeNull();

    await user.type(ta, "{Enter}");
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("/compact");
    expect(ta.value).toBe("");
  });

  it("普通消息 Enter 直发（无浮层路径回归）", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<InputBar onSend={onSend} onStop={vi.fn()} isStreaming={false} />);
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;

    await user.type(ta, "你好");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.type(ta, "{Enter}");
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("你好");
    expect(ta.value).toBe("");
  });
});

describe("App 接线层（完整链路）", () => {
  it("双 Enter 后 streamChat 收到 /compact 且输入框清空、isStreaming 复位", async () => {
    // 模拟空流：streamChat 被调后立即 onTurnComplete（isStreaming true→false）
    streamChatMock.mockImplementation(
      async (_msg: string, _agent: unknown, _session: unknown, handlers: { onTurnComplete?: () => void }) => {
        handlers?.onTurnComplete?.();
      },
    );
    const user = userEvent.setup();

    render(<App />);
    const ta = (await screen.findByRole("textbox")) as HTMLTextAreaElement;

    await user.type(ta, "/compact");
    await user.type(ta, "{Enter}");
    expect(ta.value).toBe("/compact ");
    await user.type(ta, "{Enter}");

    // 核心：真链路走到了 streamChat，参数三元组正确
    expect(streamChatMock).toHaveBeenCalledTimes(1);
    expect(streamChatMock).toHaveBeenCalledWith(
      "/compact",
      "default",
      "s1",
      expect.any(Object),
    );
    // 输入框清空
    expect(ta.value).toBe("");
    // isStreaming 复位：停止按钮消失、发送按钮回来（无陈旧闭包卡死）
    expect(screen.getByRole("button", { name: "发送" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "停止生成" })).toBeNull();
  });

  it("isStreaming 复位后第二次发送同样通畅（排除陈旧闭包）", async () => {
    streamChatMock.mockImplementation(
      async (_msg: string, _agent: unknown, _session: unknown, handlers: { onTurnComplete?: () => void }) => {
        handlers?.onTurnComplete?.();
      },
    );
    const user = userEvent.setup();
    render(<App />);
    const ta = (await screen.findByRole("textbox")) as HTMLTextAreaElement;

    await user.type(ta, "第一条");
    await user.type(ta, "{Enter}");
    expect(streamChatMock).toHaveBeenCalledTimes(1);

    await user.type(ta, "第二条");
    await user.type(ta, "{Enter}");
    expect(streamChatMock).toHaveBeenCalledTimes(2);
    expect(streamChatMock).toHaveBeenLastCalledWith("第二条", "default", "s1", expect.any(Object));
    expect(ta.value).toBe("");
  });
});
