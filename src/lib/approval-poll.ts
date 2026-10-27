/**
 * 模块 8（8.2 / 8.3 / 8.4）：审批感知轮询。
 *
 * 数据通路（2026-10-21 对 localhost:8088 实证）：
 * - GET  /api/console/push-messages → { messages, pending_approvals: [...] }
 *   每项：request_id（唯一标识，diff 主键）/ session_id / root_session_id /
 *   tool_display_name / severity / findings_summary(= result_summary) /
 *   reasoning / tool_params / is_generalized / exact_target / similar_target /
 *   created_at（Unix 秒，time.time()）/ timeout_seconds（300，后端超时兜底）
 * - POST /api/approval/approve | /deny —— body: { request_id, session_id, scope? }
 *   后端按 root_session_id 校验归属（跨 session 树），session_id 必须传 root；
 *   scope: "exact"（字面目标）/ "similar"（泛化模式），省略按 exact 处理。
 *
 * 设计约束（plan 模块 8）：
 * - diff 已知 id：只有新出现的 pending 才触发浮球审批态（8.2）
 * - resolved 自动 prune：对端 Console 决策 / 本地决策 / 300s 超时后，卡片收起（8.3）
 * - 双入口同显：App 与 Console 都消费同一端点，一边决策另一边下一轮 diff 即 prune（8.3）
 * - 频率：对话流结束后补拉一次（App 侧 onTurnComplete → refreshApprovals）+ 5s 定时轮询（8.2）
 * - 浮球审批态联动（8.4）：新 pending → 黄 #fcd34d；全部 resolved → 清除（Orb 侧 orb-state.approval）
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import { resolveAgentId } from "./api";
import { getApiBase } from "./connection";
import { APPROVAL_TIMEOUT_MS } from "./orb-state";

/** 5s 定时轮询间隔（8.2 硬约束） */
export const APPROVAL_POLL_INTERVAL_MS = 5000;

/** App 侧消费的 pending 审批（字段已按 push-messages 实测归一化） */
export interface PendingApproval {
  /** 唯一标识（后端 request_id），diff 与决策都用它 */
  id: string;
  /** 产生审批的会话（展示用） */
  sessionId: string;
  /** 根会话：决策接口按它校验归属，必须随 approve/deny 传回 */
  rootSessionId: string;
  agentId: string;
  toolName: string;
  toolDisplayName: string;
  toolSource: string;
  /** CRITICAL / HIGH / MEDIUM / LOW / INFO / SAFE */
  severity: string;
  findingsSummary: string;
  findingsCount: number;
  reasoning: string;
  toolParams: unknown;
  /** true = 泛化目标与字面目标不同，展开层给出 exact/similar 二选一 */
  isGeneralized: boolean;
  exactTarget: string;
  similarTarget: string;
  /** Unix 秒（后端 time.time()） */
  createdAt: number;
  /** 后端超时秒数（默认 300） */
  timeoutSeconds: number;
}

export type ApprovalDecision = "approve" | "deny";

export interface DecideApprovalResult {
  ok: boolean;
  /** HTTP status；0 = 网络失败；409 = 对端已决；404 = 已消失（后两者同样按已处理收起） */
  status: number;
}

/* ================= 拉取 + 归一化 ================= */

type RawApproval = Record<string, unknown>;

interface PushMessagesResponse {
  messages?: unknown[];
  pending_approvals?: RawApproval[];
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/** push-messages 原始项 → PendingApproval（主键实证为 request_id，id 兜底） */
export function normalizeApproval(raw: RawApproval): PendingApproval {
  return {
    id: str(raw.request_id) || str(raw.id),
    sessionId: str(raw.session_id),
    rootSessionId: str(raw.root_session_id) || str(raw.session_id),
    agentId: str(raw.agent_id),
    toolName: str(raw.tool_name),
    toolDisplayName: str(raw.tool_display_name) || str(raw.tool_name) || "工具调用",
    toolSource: str(raw.tool_source),
    severity: str(raw.severity, "MEDIUM"),
    findingsSummary: str(raw.findings_summary) || str(raw.result_summary),
    findingsCount: typeof raw.findings_count === "number" ? raw.findings_count : 0,
    reasoning: str(raw.reasoning),
    toolParams: raw.tool_params ?? {},
    isGeneralized: raw.is_generalized === true,
    exactTarget: str(raw.exact_target),
    similarTarget: str(raw.similar_target),
    createdAt: typeof raw.created_at === "number" ? raw.created_at : 0,
    timeoutSeconds:
      typeof raw.timeout_seconds === "number" && raw.timeout_seconds > 0
        ? raw.timeout_seconds
        : APPROVAL_TIMEOUT_MS / 1000,
  };
}

/** GET /api/console/push-messages：返回全部 pending 审批（跨会话，不做前端过滤） */
export async function fetchPendingApprovals(): Promise<PendingApproval[]> {
  const res = await tauriFetch(`${getApiBase()}/api/console/push-messages`, {
    method: "GET",
    headers: { "X-Agent-Id": resolveAgentId() },
  });
  if (!res.ok) throw new Error(`push-messages 请求失败：HTTP ${res.status}`);
  const data = (await res.json()) as PushMessagesResponse;
  const list = Array.isArray(data.pending_approvals) ? data.pending_approvals : [];
  return list.map(normalizeApproval).filter((a) => a.id !== "");
}

/** 完整详情跳 Console：Web Console 地址（base 由模块 5 解析） */
export function consoleDetailUrl(): string {
  return getApiBase();
}

/* ================= diff（纯函数） ================= */

export interface ApprovalDiff {
  /** 新出现的 pending（diff 到未知 id）：插卡片 + 浮球审批态 */
  added: PendingApproval[];
  /** 消失的 pending（resolved / 本地过期）：卡片自动收起 + 清浮球态 */
  resolved: PendingApproval[];
}

/** 已知 id 集合 vs 新一轮 pending：新增与 resolved 两侧 diff */
export function diffApprovals(
  known: ReadonlyMap<string, PendingApproval>,
  incoming: PendingApproval[],
): ApprovalDiff {
  const incomingIds = new Set(incoming.map((a) => a.id));
  return {
    added: incoming.filter((a) => !known.has(a.id)),
    resolved: [...known.values()].filter((a) => !incomingIds.has(a.id)),
  };
}

/* ================= 300s 后端超时兜底（本地镜像） ================= */

/**
 * 后端 timeout_seconds=300 到期自动 resolve（审批从 pending 列表消失）。
 * 本地镜像同一兜底：created_at + timeout 到期即视为 resolved，
 * 即使后端尚未 GC 掉该项，本地也先收起卡片并清除浮球审批态。
 */
export function isApprovalExpired(approval: PendingApproval, nowMs: number): boolean {
  const timeoutMs =
    (approval.timeoutSeconds > 0 ? approval.timeoutSeconds : APPROVAL_TIMEOUT_MS / 1000) * 1000;
  // created_at 缺失时按「刚产生」处理，不误判过期
  const createdAtMs = approval.createdAt > 0 ? approval.createdAt * 1000 : nowMs;
  return nowMs >= createdAtMs + timeoutMs;
}

/* ================= 决策（本地入口） ================= */

/**
 * 本地决策：POST /api/approval/approve | /deny。
 * session_id 传 root_session_id（后端按 root 校验归属，跨 session 树）。
 * 返回 { ok, status }：409/404 说明对端已决或已消失，调用方同样按已处理收起卡片。
 */
export async function decideApproval(
  approval: PendingApproval,
  decision: ApprovalDecision,
  opts: { scope?: "exact" | "similar"; reason?: string } = {},
): Promise<DecideApprovalResult> {
  const path = decision === "approve" ? "/api/approval/approve" : "/api/approval/deny";
  const body: Record<string, unknown> = {
    request_id: approval.id,
    session_id: approval.rootSessionId || approval.sessionId,
  };
  if (decision === "approve" && opts.scope) body.scope = opts.scope;
  if (decision === "deny" && opts.reason) body.reason = opts.reason;
  try {
    const res = await tauriFetch(`${getApiBase()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Id": resolveAgentId(),
      },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/* ================= 轮询管理（单例） ================= */

export interface ApprovalPollCallbacks {
  /** 新 pending（diff 到未知 id）：插入审批卡片 + 浮球审批态（黄 #fcd34d） */
  onNewApproval?: (approval: PendingApproval) => void;
  /** resolved：卡片收起；pendingCount = prune 后剩余 pending 数（0 → 浮球审批态清除） */
  onResolved?: (approval: PendingApproval, pendingCount: number) => void;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
const knownApprovals = new Map<string, PendingApproval>();
let callbacks: ApprovalPollCallbacks = {};

/**
 * 单次轮询 tick：拉取 → 本地 300s 过期过滤 → diff 已知 id → 派发新增/resolved。
 * 离线 / 后端不可达时静默跳过（连接层另有离线提示），下个 tick 再试。
 */
export async function refreshApprovals(): Promise<void> {
  if (inFlight) return; // busy 守卫：上一轮未回不重入
  inFlight = true;
  try {
    let incoming: PendingApproval[];
    try {
      incoming = await fetchPendingApprovals();
    } catch {
      return;
    }
    const nowMs = Date.now();
    const live = incoming.filter((a) => !isApprovalExpired(a, nowMs));
    const { added, resolved } = diffApprovals(knownApprovals, live);
    for (const a of added) {
      knownApprovals.set(a.id, a);
      callbacks.onNewApproval?.(a);
    }
    for (const r of resolved) {
      knownApprovals.delete(r.id);
      callbacks.onResolved?.(r, knownApprovals.size);
    }
  } finally {
    inFlight = false;
  }
}

/** 当前已知 pending（只读快照，调试 / 测试用） */
export function getKnownApprovals(): PendingApproval[] {
  return [...knownApprovals.values()];
}

/**
 * 启动 5s 定时轮询（幂等：已在跑则仅更新回调）。
 * 返回停止函数（显式退出条件，杜绝无限循环）。
 */
export function startApprovalPoll(cbs: ApprovalPollCallbacks = {}): () => void {
  callbacks = cbs;
  if (!pollTimer) {
    void refreshApprovals(); // 启动即补拉一次，兜住轮询开启前已存在的 pending
    pollTimer = setInterval(() => void refreshApprovals(), APPROVAL_POLL_INTERVAL_MS);
  }
  return stopApprovalPoll;
}

/** 停止轮询（清理 setInterval） */
export function stopApprovalPoll(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
