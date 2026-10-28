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
  // jsdom 无 Tauri 运行时：App 树里若干 await import("@tauri-apps/api/event"/core)
  // 的动态 import 在 React 多消费者场景下会确定性地漏过上方 vi.mock、落到真实实现
  // （真实 listen→invoke→transformCallback 读 window.__TAURI_INTERNALS__ 抛错 →
  // Unhandled Rejection，且污染 React 状态刷新）。补一个最小 __TAURI_INTERNALS__
  // 令漏网的真实 invoke/transformCallback/listen 也能安全解析——与 vi.mock 双保险，
  // 静态 import 走 mock、动态 import 漏过时走此 shim。仅测试环境，非产品代码。
  let cbSeq = 0;
  (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
    transformCallback: (cb?: unknown) => (cb ? ++cbSeq : 0),
    unregisterCallback: () => {},
    // plugin:event|listen 需返回一个 eventId（listen 内部 .then 拿到后包成 unlisten）
    invoke: async (cmd: string) => (cmd === "plugin:event|listen" ? ++cbSeq : undefined),
    convertFileSrc: (p: string) => p,
    metadata: { currentWindow: { label: "main" } },
  };
  // event 插件的 unlisten（_unlisten）走这个独立全局——卸载 cleanup 时会触发
  (window as unknown as { __TAURI_EVENT_PLUGIN_INTERNALS__: unknown }).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: () => {},
  };
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

/* ---------- Tauri API mock（jsdom 无 window.__TAURI__ 环境） ----------
 * App 渲染树静态/动态 import 链用到的 @tauri-apps/api/* 模块（App.tsx、
 * Orb.tsx、connection.ts、logger.ts、approval-poll.ts、useFileSearch.ts
 * 等）：
 *   - window：App.tsx:29 模块级 getCurrentWindow().label + Orb.tsx currentMonitor
 *   - event ：emit/listen（静态于 Orb/connection/approval-poll，动态于 App.tsx）
 *   - core  ：invoke（静态于 logger/Orb，动态于 App.tsx recall/orb-dropped）
 *   - dpi   ：Orb.tsx 的 LogicalPosition（window-state 的 LogicalSize 一并占位）
 * 动态 import 的模块同样被 vi.mock 按 specifier 拦截。 */
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: "main", hide: vi.fn(), show: vi.fn(), setFocus: vi.fn() }),
  currentMonitor: async () => null,
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => {}),
  listen: vi.fn(async () => () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => {}),
}));

vi.mock("@tauri-apps/api/dpi", () => ({
  LogicalPosition: class {},
  LogicalSize: class {},
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
        // 真实 streamChat 是异步网络流：onTurnComplete 在后续 tick 到达，
        // isStreaming 会先渲染 true（停止按钮）再回落 false。若在此【同步】调用，
        // React 批处理会把 setIsStreaming(true)（handleSend）与
        // setIsStreaming(false)（onTurnComplete）合成一次渲染，isStreaming
        // 从未单独渲染成 true → InputBar 的发送锁 sending（InputBar.tsx 仅靠
        // isStreaming true→false 跳变复位，App 未传 turnDoneTick 故显式复位路径
        // 不生效）等不到跳变而卡死 → 第二次 Enter 被 `if (sending) return` 挡掉。
        // 延到一个微任务复现生产的异步时序（不改任何断言）。
        await Promise.resolve();
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
        // 真实 streamChat 是异步网络流：onTurnComplete 在后续 tick 到达，
        // isStreaming 会先渲染 true（停止按钮）再回落 false。若在此【同步】调用，
        // React 批处理会把 setIsStreaming(true)（handleSend）与
        // setIsStreaming(false)（onTurnComplete）合成一次渲染，isStreaming
        // 从未单独渲染成 true → InputBar 的发送锁 sending（InputBar.tsx 仅靠
        // isStreaming true→false 跳变复位，App 未传 turnDoneTick 故显式复位路径
        // 不生效）等不到跳变而卡死 → 第二次 Enter 被 `if (sending) return` 挡掉。
        // 延到一个微任务复现生产的异步时序（不改任何断言）。
        await Promise.resolve();
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
