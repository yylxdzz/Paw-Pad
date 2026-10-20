/**
 * T4 + T5 本地会话状态（D15）。
 *
 * 两个持久化字段：
 * - current_agent_id（T4）：当前选中的 agent
 * - current_session_id（T5，可空）：当前 session；为空 = 跟随态
 *   （打开 App / 切换 agent 时接该 agent「置顶优先 + 最近活跃」的 session）
 *
 * T5 边界由代码结构保证：
 * - 新建后没聊就关 App：current_session_id 已持久化 → 重开 resolveSession 直接用它（空 session 保留）
 * - 切回曾用过的 agent：不记 per-agent session，switchAgent 置空后重新接它「当前」最新活跃
 *
 * 历史消息的拉取与渲染归 T7：本文件只通过 onSessionChange 出口通知上层
 * （null = 清界面；有值 = 该去拉这个 session 的历史了）。
 */

import { listChats, type Chat } from "./api";

const AGENT_KEY = "current_agent_id";
const SESSION_KEY = "current_session_id";

/* ---------------- T4：current_agent_id ---------------- */

/** 读当前选中的 agent id；未选择过返回 null（首启引导的依据） */
export function getCurrentAgentId(): string | null {
  try {
    return localStorage.getItem(AGENT_KEY);
  } catch {
    return null; // 隐私模式 / 存储被禁时按未选择处理
  }
}

/** 写当前选中的 agent id */
export function setCurrentAgentId(agentId: string): void {
  try {
    localStorage.setItem(AGENT_KEY, agentId);
  } catch {
    // 存储失败不阻塞选择流程（内存态已由调用方持有）
  }
}

/* ---------------- T5：current_session_id ---------------- */

/** 读当前 session id；null = 跟随态（打开/切换时接最近活跃） */
export function getCurrentSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** 写当前 session id；传 null = 置空回到跟随态 */
export function setCurrentSessionId(sessionId: string | null): void {
  try {
    if (sessionId === null) {
      localStorage.removeItem(SESSION_KEY);
    } else {
      localStorage.setItem(SESSION_KEY, sessionId);
    }
  } catch {
    // 存储失败不阻塞流程
  }
}

/** 生成新 session id：String(Date.now())，与 Console 生成规则一致（D7） */
export function generateSessionId(): string {
  return String(Date.now());
}

/* ---------------- 纯函数：接最近活跃 ---------------- */

/**
 * 从 chats 列表挑「置顶优先 + 最近活跃」的 session_id。
 * 纯函数：不碰 localStorage/DOM/网络，可单测。
 *
 * 规则（plan T5 成功条件 2，写死不靠 agent 判断）：
 * 1. 过滤 archived === true 与 source !== "chat"（如 cron 等非对话来源）
 * 2. pinned === true 的排前面
 * 3. 同组内按 updated_at 新的排前面
 * 4. 取第一条的 session_id；无候选返回 null
 */
export function pickActiveSession(chats: Chat[]): string | null {
  const candidates = chats
    .filter((c) => !c.archived && c.source === "chat")
    .sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }
      const ta = Date.parse(a.updated_at) || 0;
      const tb = Date.parse(b.updated_at) || 0;
      return tb - ta;
    });
  return candidates.length > 0 ? candidates[0].session_id : null;
}

/* ---------------- 变更通知（T7 接住） ---------------- */

type SessionListener = (sessionId: string | null) => void;

const listeners = new Set<SessionListener>();

/**
 * 订阅 session 变更。返回值是取消订阅函数。
 * T7 的用法：null → 清空消息列表；有值 → 拉该 session 历史。
 */
export function onSessionChange(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitSessionChange(sessionId: string | null): void {
  listeners.forEach((fn) => fn(sessionId));
}

/* ---------------- 状态机 ---------------- */

/** switchAgent 单调序号（N1 修复）：快速连切时，过期调用的结果被丢弃，不写不 emit */
let switchSeq = 0;

/**
 * 打开 App / 任何需要「当前 session」的时机调用：
 * 1. current_session_id 有值 → 直接用它（含新建后没聊的空 session，边界 6）
 * 2. 为空 → listChats(current_agent_id) 接最近活跃
 * 3. 没 agent / 列表空 / 拉取失败 → 生成新时间戳 session（降级不阻塞）
 *
 * @param isStale 可选过期守卫（N1）：await 返回后为 true 说明期间又有新切换，放弃本次写入
 */
export async function resolveSession(agentId?: string, isStale?: () => boolean): Promise<string> {
  const existing = getCurrentSessionId();
  if (existing) {
    return existing;
  }

  const agent = agentId ?? getCurrentAgentId();
  if (agent) {
    try {
      const picked = pickActiveSession(await listChats(agent));
      if (picked) {
        if (isStale?.()) {
          // 过期：新切换已接管状态，本次不写不 emit
          return getCurrentSessionId() ?? picked;
        }
        setCurrentSessionId(picked);
        emitSessionChange(picked);
        return picked;
      }
    } catch {
      // 离线 / 拉取失败：降级为新 session，不崩溃不阻塞对话
    }
  }

  const fresh = generateSessionId();
  if (isStale?.()) {
    return getCurrentSessionId() ?? fresh;
  }
  setCurrentSessionId(fresh);
  emitSessionChange(fresh);
  return fresh;
}

/**
 * 切换 agent（成功条件 3 + 边界 7 + N1 防护）：
 * 1. 更新 current_agent_id
 * 2. current_session_id 置空（回到跟随态）
 * 3. emit null 让上层清界面
 * 4. 立即接新 agent 的最近活跃 session（不记旧 App 里那个）；
 *    await 期间若有更新的切换进来（seq 过期），本次结果丢弃
 */
export async function switchAgent(agentId: string): Promise<string> {
  const seq = ++switchSeq;
  setCurrentAgentId(agentId);
  setCurrentSessionId(null);
  emitSessionChange(null);
  return resolveSession(agentId, () => seq !== switchSeq);
}

/**
 * 新建 Session（顶栏「＋」/ ⌘N 的函数级入口，成功条件 4）：
 * 生成新时间戳 id 写入 current_session_id 持久化 + emit 让上层清界面。
 */
export function newSession(): string {
  const fresh = generateSessionId();
  setCurrentSessionId(fresh);
  emitSessionChange(fresh);
  return fresh;
}
