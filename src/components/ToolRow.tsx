/**
 * T10：工具行 + 展开参数卡片（D16）。
 *
 * - 完成态：淡绿 ✓（var(--accent)）；运行态：shimmer 流光块（CSS @keyframes，无 JS 动画库）
 * - 单行：✓/shimmer + 动词 + 文件 chip（淡底圆角等宽）+ 尾部数据 + 行尾箭头 ▸/▾
 * - 整行三成灰 var(--text-faded)；点击行展开/收起参数卡片（本地 state，多行各自独立）
 * - 运行中行也能点开（条件 6）：running 时 footer 显示"运行中…"
 *
 * 纯函数（node 可测）：summaryForTool / verbForTool / fileChipFor。
 */

import { useState } from "react";

export interface ToolRowProps {
  name?: string;
  status: "running" | "completed";
  /** 工具调用参数（JSON 字符串，卡片 body 展示） */
  arguments?: string;
  /** 工具输出（footer 摘要来源） */
  output?: string;
  callId?: string;
}

/* ================= 纯函数：尾部数据映射（条件 9，映射表写死） ================= */

export interface ToolSummaryInput {
  name?: string;
  arguments?: string;
  output?: string;
}

/**
 * read → "N 行"（output 里的 "N 行" 模式优先，否则按输出行数）
 * run/exec/bash → "N passed, M failed"（输出里抓 passed/failed 计数）
 * edit/write → "+N −M"（输出里抓 diff 统计，− 为 U+2212）
 * 其他 → 空串
 */
export function summaryForTool(tool: ToolSummaryInput): string {
  const name = (tool.name ?? "").toLowerCase();
  const out = tool.output ?? "";

  if (name.includes("read")) {
    const m = out.match(/(\d+)\s*行/);
    if (m) return `${m[1]} 行`;
    if (out.length > 0) return `${out.split("\n").length} 行`;
    return "";
  }

  if (name.includes("run") || name.includes("exec") || name.includes("bash") || name.includes("shell")) {
    const m = out.match(/(\d+)\s*passed(?:\s*,\s*(\d+)\s*failed)?/i);
    if (m) return m[2] !== undefined ? `${m[1]} passed, ${m[2]} failed` : `${m[1]} passed`;
    return "";
  }

  if (name.includes("edit") || name.includes("write") || name.includes("patch")) {
    const m = out.match(/\+(\d+)\s*[−-]\s*(\d+)/);
    if (m) return `+${m[1]} −${m[2]}`;
    return "";
  }

  return "";
}

/* ================= 纯函数：动词映射 ================= */

const VERB_MAP: Record<string, string> = {
  read_file: "读取",
  read: "读取",
  run: "运行",
  exec: "运行",
  bash: "运行",
  shell: "运行",
  edit: "编辑",
  write: "编辑",
  write_file: "编辑",
  patch: "编辑",
};

export function verbForTool(name?: string): string {
  // N15：未知名工具回落原始工具名（list_files / web_search…），不再显示光秃的"工具"；
  // 仅当工具名缺失/为空（极端情况）才回落"工具调用"
  return name ? VERB_MAP[name] ?? name : "工具调用";
}

/* ================= 纯函数：文件 chip（参数里的路径取 basename） ================= */

export function fileChipFor(args?: string): string | null {
  if (!args) return null;
  try {
    const o = JSON.parse(args) as Record<string, unknown> | null;
    const p =
      typeof o?.file_path === "string"
        ? o.file_path
        : typeof o?.path === "string"
          ? o.path
          : null;
    if (!p) return null;
    return p.split("/").pop() || p;
  } catch {
    return null;
  }
}

/* ================= 组件 ================= */

export default function ToolRow({ name, status, arguments: args, output }: ToolRowProps) {
  const [expanded, setExpanded] = useState(false);
  const running = status === "running";
  const chip = fileChipFor(args);
  const summary = summaryForTool({ name, arguments: args, output });

  return (
    <div className="tool-row-wrap">
      <button
        type="button"
        className="tool-row"
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
        <span className="tool-verb">{verbForTool(name)}</span>
        {chip && <span className="file-chip">{chip}</span>}
        {summary && <span className="tool-summary">{summary}</span>}
        <span className="tool-arrow" aria-hidden>
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded && (
        <div className="tool-card">
          <div className="tool-card__header">
            <span className="tool-card__name">{name ?? "工具调用"}</span>
            <span className="tool-card__copy" title="复制参数（占位）">
              ⧉
            </span>
          </div>
          <pre className="tool-card__body">{args && args.length > 0 ? args : "{}"}</pre>
          <div className="tool-card__footer">
            {running ? "运行中…" : output && output.length > 0 ? output : "无输出"}
          </div>
        </div>
      )}
    </div>
  );
}
