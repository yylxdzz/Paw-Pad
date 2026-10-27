/**
 * T9：消息流容器——按 kind 分发到 UserBubble / AssistantBlock / ToolRow / 系统提示。
 * T7 骨架升级：历史加载逻辑保留（loadHistory），新增实时消息能力（T14 接 streamChat 用）。
 *
 * 实时能力接口（T14 用法）：
 *   const listRef = useRef<MessageListHandle>(null);
 *   streamChat(text, agentId, sessionId, {
 *     onToken: (t) => listRef.current?.appendToken(t),          // 流式追加当前 agent 消息
 *     onToolCall: (c) => listRef.current?.upsertToolCall(c),    // running 工具行
 *     onToolResult: (r) => listRef.current?.completeToolResult(r), // → completed
 *     onTurnComplete: () => listRef.current?.finishTurn(),      // 收光标
 *   });
 *   发送前：listRef.current?.appendUserMessage(text);
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import AssistantBlock from "./AssistantBlock";
import ApprovalCard from "./ApprovalCard";
import ToolRow from "./ToolRow";
import UserBubble from "./UserBubble";
import { loadHistory, type DisplayMessage } from "../lib/history";
import { getCurrentSessionId } from "../lib/session";
import {
  decideApproval,
  refreshApprovals,
  type ApprovalDecision,
  type PendingApproval,
} from "../lib/approval-poll";

/** 运行时消息（在 DisplayMessage 基础上增加流式态与工具参数） */
export type LiveMessage =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string; streaming?: boolean }
  | {
      kind: "tool";
      id: string;
      callId?: string;
      name?: string;
      arguments?: string;
      output?: string;
      status: "running" | "completed";
    }
  // sessionId：系统提示产生时所属 session——loadHistory 整表覆盖时按归属保留
  // 当前 session 的提示（如「＋新建」的「新对话」），不因历史加载被冲掉
  | { kind: "system"; id: string; text: string; ts: number; sessionId?: string }
  // 模块 8：审批卡片（消息流内嵌，非模态弹窗）——approval-poll diff 到新 pending 时插入，
  // resolved（对端决策 / 本地决策 / 300s 超时）时 prune 移除
  | { kind: "approval"; id: string; approval: PendingApproval };

/** T14 通过 ref 调用的实时消息接口 */
export interface MessageListHandle {
  /** 追加用户消息（发送时调用） */
  appendUserMessage(text: string): void;
  /** 流式 token：追加到最后一条生成中的 agent 消息；没有则新建一条 */
  appendToken(text: string): void;
  /** 工具调用：建/更新一条 running 工具行（按 callId 幂等） */
  upsertToolCall(call: { callId?: string; name?: string; arguments?: string }): void;
  /** 工具结果：对应工具行 running→completed 并写入 output */
  completeToolResult(result: { callId?: string; name?: string; output?: string }): void;
  /** 系统提示（居中淡色，如"新对话"分隔） */
  appendSystemMessage(text: string): void;
  /** 模块 8：新 pending 审批 → 插入审批卡片（同 id 幂等，不重复插） */
  insertApproval(approval: PendingApproval): void;
  /** 模块 8：resolved（对端决策 / 本地决策 / 300s 超时）→ 卡片自动收起（移除） */
  pruneApproval(id: string): void;
  /** 本轮生成结束：收起生成中光标 */
  finishTurn(): void;
  /** 清空全部消息 */
  clear(): void;
}

interface MessageListProps {
  agentId: string | null;
  /** null = 无 session / 切换中：清空界面 */
  sessionId: string | null;
}

/** DisplayMessage（T7 历史）→ LiveMessage */
function toLive(d: DisplayMessage): LiveMessage {
  switch (d.kind) {
    case "user":
      return { kind: "user", id: d.id, text: d.text };
    case "assistant":
      return { kind: "assistant", id: d.id, text: d.text, streaming: false };
    case "tool":
      return {
        kind: "tool",
        id: d.id,
        callId: d.callId,
        name: d.name,
        output: d.output,
        status: "completed",
      };
  }
}

const MessageList = forwardRef<MessageListHandle, MessageListProps>(
  ({ agentId, sessionId }, ref) => {
    const [messages, setMessages] = useState<LiveMessage[]>([]);

    // N2：始终持有最新 props.sessionId——历史加载结果落地前用它校验，
    // 期间若 session 已切换（旧加载慢于新切换）则丢弃旧结果，避免错配覆盖
    const sessionIdRef = useRef(sessionId);
    sessionIdRef.current = sessionId;

    // T7：agent/session 变化时拉历史（失败降级空列表）
    useEffect(() => {
      if (!agentId || !sessionId) {
        setMessages([]);
        return;
      }
      let cancelled = false;
      const loadSessionId = sessionId;
      void loadHistory(agentId, sessionId).then((list) => {
        // N2：本次加载发起时的 sessionId 与当前不一致 → 丢弃（旧加载不覆盖新状态）
        if (cancelled || sessionIdRef.current !== loadSessionId) return;
        setMessages((prev) => {
          const loaded = list.map(toLive);
          // B1 + 缺陷 1 修复：保留归属本 session 的系统提示（如新建的"新对话"分隔）——
          // loadHistory 的整表覆盖不该吞掉它。旧机制按 `m.ts >= loadStartedAt`
          // 时间戳保留，但提示追加（点击时刻）必早于 effect 的 loadStartedAt 快照，
          // 恒被滤掉；改为按 appendSystemMessage 打标的 sessionId 归属保留——
          // 新 session 的提示留存，旧 session 的提示不跨会话残留。
          const pendingSystems = prev.filter(
            (m) => m.kind === "system" && m.sessionId === loadSessionId,
          );
          // 模块 8：审批卡片是跨会话的实时态（后端 pending 全量返回），
          // 历史整表覆盖不该冲掉仍在等待决策的卡片
          const pendingCards = prev.filter((m) => m.kind === "approval");
          return [...pendingSystems, ...pendingCards, ...loaded];
        });
      });
      return () => {
        cancelled = true;
      };
    }, [agentId, sessionId]);

    // B5：消息流自动滚底。messages 变化时：
    // - 末条是新用户消息 → 无视距底强制滚底（用户刚发出，必须看到）
    // - 否则仅当用户在看最新（距底 <80px）才跟随；已上翻（≥80px）不强制拖回
    const scrollRef = useRef<HTMLDivElement>(null);
    const distanceFromBottom = useRef(0);
    const handleScroll = useCallback(() => {
      const el = scrollRef.current;
      if (!el) return;
      distanceFromBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight;
    }, []);
    useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      const last = messages[messages.length - 1];
      const isNewUserMessage = last?.kind === "user";
      if (isNewUserMessage || distanceFromBottom.current < 80) {
        el.scrollTo({ top: el.scrollHeight });
      }
    }, [messages]);

    // 模块 8：审批决策编排——POST /api/approval/* 后本地 prune + 立即同步轮询
    // （成功 / 对端已决 409 / 已消失 404 都收起卡片；仅网络失败 status 0 保留等重试）
    const decideAndPrune = useCallback(
      async (
        approval: PendingApproval,
        decision: ApprovalDecision,
        scope?: "exact" | "similar",
      ) => {
        const result = await decideApproval(approval, decision, { scope });
        if (result.ok || result.status === 409 || result.status === 404) {
          setMessages((prev) =>
            prev.filter((m) => !(m.kind === "approval" && m.id === approval.id)),
          );
          void refreshApprovals(); // 立即同步：下一轮 diff 触发浮球审批态清除
        }
        return result;
      },
      [],
    );

    // 实时消息能力（全部用函数式 setState，方法身份稳定）
    useImperativeHandle(
      ref,
      () => ({
        appendUserMessage: (text) =>
          setMessages((prev) => [
            ...prev,
            { kind: "user", id: `u-${Date.now()}-${prev.length}`, text },
          ]),

        appendToken: (text) =>
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.kind === "assistant" && last.streaming) {
              return [...prev.slice(0, -1), { ...last, text: last.text + text }];
            }
            // 工具行之后的新文本 → 新建一条 agent 消息
            return [
              ...prev,
              { kind: "assistant", id: `a-${Date.now()}`, text, streaming: true },
            ];
          }),

        upsertToolCall: ({ callId, name, arguments: args }) =>
          setMessages((prev) => {
            const id = callId ?? `tool-${Date.now()}`;
            const idx = prev.findIndex((m) => m.kind === "tool" && m.id === id);
            if (idx >= 0) {
              const old = prev[idx];
              if (old.kind !== "tool") return prev;
              const updated = {
                ...old,
                name: name ?? old.name,
                arguments: args ?? old.arguments,
                status: "running" as const,
              };
              return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
            }
            return [
              ...prev,
              { kind: "tool", id, callId, name, arguments: args, status: "running" },
            ];
          }),

        completeToolResult: ({ callId, output }) =>
          setMessages((prev) => {
            let idx = -1;
            if (callId) {
              idx = prev.findIndex((m) => m.kind === "tool" && m.callId === callId);
            } else {
              for (let i = prev.length - 1; i >= 0; i--) {
                const m = prev[i];
                if (m.kind === "tool" && m.status === "running") {
                  idx = i;
                  break;
                }
              }
            }
            if (idx < 0) return prev;
            const m = prev[idx];
            if (m.kind !== "tool") return prev;
            const updated = {
              ...m,
              status: "completed" as const,
              output: output ?? m.output,
            };
            return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
          }),

        appendSystemMessage: (text) =>
          setMessages((prev) => [
            ...prev,
            {
              kind: "system",
              id: `s-${Date.now()}-${prev.length}`,
              text,
              ts: Date.now(),
              // 归属打标：newSession() 已同步写持久化，此处读到的是新 session id——
              // loadHistory 覆盖时凭此保留本 session 的提示（缺陷 1 修复）
              sessionId: getCurrentSessionId() ?? undefined,
            },
          ]),

        // 模块 8：新 pending 插卡片（同 id 幂等）；resolved 移除卡片（自动收起）
        insertApproval: (approval) =>
          setMessages((prev) => {
            if (prev.some((m) => m.kind === "approval" && m.id === approval.id)) return prev;
            return [...prev, { kind: "approval", id: approval.id, approval }];
          }),

        pruneApproval: (id) =>
          setMessages((prev) => prev.filter((m) => !(m.kind === "approval" && m.id === id))),

        finishTurn: () =>
          setMessages((prev) =>
            prev.map((m) =>
              m.kind === "assistant" && m.streaming ? { ...m, streaming: false } : m,
            ),
          ),

        clear: () => setMessages([]),
      }),
      [],
    );

    const renderItem = useCallback((m: LiveMessage) => {
      switch (m.kind) {
        case "user":
          return <UserBubble text={m.text} />;
        case "assistant":
          return <AssistantBlock text={m.text} streaming={m.streaming} />;
        case "tool":
          return (
            <ToolRow
              name={m.name}
              status={m.status}
              arguments={m.arguments}
              output={m.output}
              callId={m.callId}
            />
          );
        case "system":
          return <div className="system-hint">{m.text}</div>;
        case "approval":
          return (
            <ApprovalCard
              approval={m.approval}
              onDecide={(decision, scope) => decideAndPrune(m.approval, decision, scope)}
            />
          );
      }
    }, []);

    return (
      <div className="message-list" ref={scrollRef} onScroll={handleScroll}>
        {messages.map((m) => (
          <div key={m.id} className={`message-item message-item--${m.kind}`}>
            {renderItem(m)}
          </div>
        ))}
      </div>
    );
  },
);

MessageList.displayName = "MessageList";

export default MessageList;
