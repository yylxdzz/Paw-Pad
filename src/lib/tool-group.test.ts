/**
 * D8（2026-10-27 修订）：回合内工具分组纯函数测试（vitest，node 环境）。
 *
 * 覆盖：
 * 1. 连续 3 个 tool + 1 个 assistant → toolGroup(3) + message(assistant)
 * 2. tool/assistant/tool/tool → toolGroup(1) + message + toolGroup(2)（跨回合断组）
 * 3. 单个 tool → toolGroup(1)（ToolGroup 内部退化单行）
 * 4. 空数组 → 空
 * 5. toolGroupStatus：混 running/completed → running；全 completed → completed
 */

import { describe, expect, it } from "vitest";
import { groupConsecutiveTools, toolGroupStatus } from "./tool-group";
import type { LiveMessage } from "../components/MessageList";

/** 最小 tool 消息（Message/LiveMessage 工具变体的必填字段 = kind/id/status） */
function tool(id: string, status: "running" | "completed" = "completed"): LiveMessage {
  return { kind: "tool", id, callId: `call-${id}`, name: "read_file", status };
}

function assistant(id: string): LiveMessage {
  return { kind: "assistant", id, text: "答案" };
}

describe("groupConsecutiveTools", () => {
  it("连续 3 个 tool + 1 个 assistant → toolGroup(3) + message(assistant)", () => {
    const items = groupConsecutiveTools([tool("t1"), tool("t2"), tool("t3"), assistant("a1")]);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      kind: "toolGroup",
      key: "t1",
      tools: [tool("t1"), tool("t2"), tool("t3")],
    });
    expect(items[1].kind).toBe("message");
    if (items[1].kind === "message") {
      expect(items[1].message.kind).toBe("assistant");
      expect(items[1].message.id).toBe("a1");
    }
  });

  it("tool/assistant/tool/tool → toolGroup(1) + message + toolGroup(2)（跨回合断组）", () => {
    const items = groupConsecutiveTools([tool("t1"), assistant("a1"), tool("t2"), tool("t3")]);
    expect(items.map((i) => i.kind)).toEqual(["toolGroup", "message", "toolGroup"]);
    if (items[0].kind === "toolGroup") expect(items[0].tools).toHaveLength(1);
    if (items[2].kind === "toolGroup") {
      expect(items[2].key).toBe("t2");
      expect(items[2].tools).toHaveLength(2);
    }
  });

  it("单个 tool → toolGroup(1)（ToolGroup 内部退化单行）", () => {
    const items = groupConsecutiveTools([tool("t1")]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("toolGroup");
    if (items[0].kind === "toolGroup") {
      expect(items[0].tools).toHaveLength(1);
      expect(items[0].key).toBe("t1");
    }
  });

  it("空数组 → 空", () => {
    expect(groupConsecutiveTools([])).toEqual([]);
  });

  it("非 tool 消息不进入 toolGroup（原样输出为 message 项）", () => {
    const items = groupConsecutiveTools([assistant("a1"), assistant("a2")]);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.kind === "message")).toBe(true);
  });
});

describe("toolGroupStatus", () => {
  it("组内任一 running → running", () => {
    expect(toolGroupStatus([tool("t1", "completed"), tool("t2", "running")])).toBe("running");
  });

  it("全 completed → completed", () => {
    expect(toolGroupStatus([tool("t1"), tool("t2")])).toBe("completed");
  });
});
