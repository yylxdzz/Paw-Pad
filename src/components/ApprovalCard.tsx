/**
 * 模块 8（8.1）：审批卡片。
 *
 * 三层设计（plan 8.1 硬约束）：
 * - 默认层：tool_display_name + severity + findings_summary + reasoning（空则隐藏）+ 批准/拒绝按钮
 * - 展开层：tool_params + exact/similar scope（is_generalized 为 true 时显示二选一）
 * - 完整详情：跳 Console（Web Console 地址）
 *
 * 卡片在消息流里（非模态弹窗，统一对话流）——由 MessageList 以 approval 消息种渲染。
 * 组件只负责展示与决策交互：决策请求（POST /api/approval/*）由上层 MessageList 编排，
 * 成功 / 对端已决（409）/ 已消失（404）时上层 prune 收起本卡片。
 */

import { useCallback, useState } from "react";

import type { PendingApproval, ApprovalDecision, DecideApprovalResult } from "../lib/approval-poll";
import { consoleDetailUrl } from "../lib/approval-poll";

import "./ApprovalCard.css";

export interface ApprovalCardProps {
  approval: PendingApproval;
  /** 决策回调（MessageList 编排 decideApproval + prune）；返回结果用于失败重试提示 */
  onDecide?: (
    decision: ApprovalDecision,
    scope?: "exact" | "similar",
  ) => Promise<DecideApprovalResult> | DecideApprovalResult | void;
}

/** severity → 徽标（中文标签 + 色值，色板对齐浮球状态色） */
const SEVERITY_META: Record<string, { label: string; color: string }> = {
  CRITICAL: { label: "严重", color: "var(--sev-critical)" },
  HIGH: { label: "高危", color: "var(--sev-high)" },
  MEDIUM: { label: "中危", color: "var(--sev-medium)" },
  LOW: { label: "低危", color: "var(--sev-low)" },
  INFO: { label: "提示", color: "var(--sev-info)" },
  SAFE: { label: "安全", color: "var(--sev-safe)" },
};

function severityMeta(severity: string): { label: string; color: string } {
  return SEVERITY_META[severity.toUpperCase()] ?? { label: severity || "审批", color: "var(--text-body)" };
}

/** tool_params 美化 JSON（对象/数组缩进 2；其他类型原样展示） */
function formatParams(params: unknown): string {
  if (params === null || params === undefined) return "{}";
  if (typeof params === "string") return params;
  try {
    return JSON.stringify(params, null, 2);
  } catch {
    return String(params);
  }
}

export default function ApprovalCard({ approval, onDecide }: ApprovalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [scope, setScope] = useState<"exact" | "similar">("exact");
  const [submitting, setSubmitting] = useState<ApprovalDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sev = severityMeta(approval.severity);
  const showScope = approval.isGeneralized; // 展开层 scope 仅 is_generalized 时显示

  const decide = useCallback(
    async (decision: ApprovalDecision, decisionScope?: "exact" | "similar") => {
      if (submitting) return;
      setSubmitting(decision);
      setError(null);
      try {
        const result = await onDecide?.(decision, decisionScope);
        // 只有网络失败（status 0）保留卡片等重试；ok / 409（对端已决）/ 404（已消失）
        // 都由上层 prune 收起，无需本地处理
        if (result && !result.ok && result.status === 0) {
          setError("操作失败，请重试");
        }
      } catch {
        setError("操作失败，请重试");
      } finally {
        setSubmitting(null);
      }
    },
    [onDecide, submitting],
  );

  const openDetails = useCallback(async () => {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(consoleDetailUrl());
    } catch {
      // 打不开浏览器时静默（Console 地址可由用户自行访问）
    }
  }, []);

  return (
    <div className="approval-card" data-severity={approval.severity.toLowerCase()}>
      {/* ── 默认层：名称 + severity + findings + reasoning + 决策按钮 ── */}
      <div className="approval-card__head">
        <span className="approval-card__icon" aria-hidden>
          ⚠
        </span>
        <span className="approval-card__title">{approval.toolDisplayName}</span>
        <span className="approval-card__severity" style={{ color: sev.color }}>
          {sev.label}
        </span>
      </div>

      {approval.findingsSummary && (
        <div className="approval-card__findings">{approval.findingsSummary}</div>
      )}
      {/* reasoning 空则隐藏（8.1 约束） */}
      {approval.reasoning && (
        <div className="approval-card__reasoning">{approval.reasoning}</div>
      )}

      <div className="approval-card__actions">
        <button
          type="button"
          className="approval-card__btn approval-card__btn--approve"
          disabled={submitting !== null}
          onClick={() => void decide("approve", showScope ? scope : "exact")}
        >
          {submitting === "approve" ? "批准中…" : "批准"}
        </button>
        <button
          type="button"
          className="approval-card__btn approval-card__btn--deny"
          disabled={submitting !== null}
          onClick={() => void decide("deny")}
        >
          {submitting === "deny" ? "拒绝中…" : "拒绝"}
        </button>
        <button
          type="button"
          className="approval-card__expand"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "收起 ▾" : "展开 ▸"}
        </button>
        <button type="button" className="approval-card__details" onClick={() => void openDetails()}>
          详情 ↗
        </button>
      </div>

      {error && <div className="approval-card__error">{error}</div>}

      {/* ── 展开层：tool_params + exact/similar scope（is_generalized 时） ── */}
      {expanded && (
        <div className="approval-card__body">
          <div className="approval-card__label">调用参数</div>
          <pre className="approval-card__params">{formatParams(approval.toolParams)}</pre>

          {showScope && (
            <div className="approval-card__scope">
              <div className="approval-card__label">批准范围</div>
              <label className="approval-card__scope-option">
                <input
                  type="radio"
                  name={`approval-scope-${approval.id}`}
                  checked={scope === "exact"}
                  onChange={() => setScope("exact")}
                />
                <span>仅本次（exact）</span>
                {approval.exactTarget && (
                  <em className="approval-card__scope-target">{approval.exactTarget}</em>
                )}
              </label>
              <label className="approval-card__scope-option">
                <input
                  type="radio"
                  name={`approval-scope-${approval.id}`}
                  checked={scope === "similar"}
                  onChange={() => setScope("similar")}
                />
                <span>同类模式（similar）</span>
                {approval.similarTarget && (
                  <em className="approval-card__scope-target">{approval.similarTarget}</em>
                )}
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
