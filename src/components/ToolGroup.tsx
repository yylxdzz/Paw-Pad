/**
 * D8（2026-10-27 修订）：回合内工具组——组头单行摘要 + 展开明细。
 *
 * - 组头：⚙ N 个工具 + 聚合状态（running shimmer / completed ✓）+ ▸/▾
 * - 单工具（length===1）：直接渲染 ToolRow，不套组头（无意义套娃）
 * - 展开态：组内每个工具渲染 ToolRow（明细行参数仍各自收起，ToolRow 零改动）
 * - 默认收起（D8 摘要优先）
 */

import { useState } from "react";
import ToolRow from "./ToolRow";
import { toolGroupStatus } from "../lib/tool-group";
import type { LiveMessage as Message } from "./MessageList";

export default function ToolGroup({ tools }: { tools: Message[] }) {
  const [expanded, setExpanded] = useState(false);

  // 单工具不分组：直接渲染明细行
  if (tools.length === 1 && tools[0].kind === "tool") {
    const t = tools[0];
    return <ToolRow name={t.name} status={t.status} arguments={t.arguments} output={t.output} />;
  }

  const status = toolGroupStatus(tools);
  const running = status === "running";

  return (
    <div className="tool-group-wrap">
      <button
        type="button"
        className="tool-group"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {running ? (
          <span className="tool-shimmer" aria-hidden />
        ) : (
          <span className="tool-check" aria-hidden>
            ✓
          </span>
        )}
        <span className="tool-group__label">{tools.length} 个工具</span>
        {running && <span className="tool-group__running">运行中…</span>}
        <span className="tool-arrow" aria-hidden>
          {expanded ? "▾" : "▸"}
        </span>
      </button>
      {expanded && (
        <div className="tool-group__detail">
          {tools.map((t) =>
            t.kind === "tool" ? (
              <ToolRow
                key={t.id}
                name={t.name}
                status={t.status}
                arguments={t.arguments}
                output={t.output}
              />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
