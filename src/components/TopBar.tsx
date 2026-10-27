import { useCallback, useEffect, useState } from "react";
import { listAgents, type Agent } from "../lib/api";
import { getCurrentAgentId, setCurrentAgentId } from "../lib/session";
import StatusLight from "./StatusLight";
// 模块 6（6.1）：顶栏最右角落面板（⋯ 入口 + 更新红点角标 + 5 项子菜单）
import CornerPanel from "./CornerPanel";
import "./TopBar.css";

interface TopBarProps {
  /** 切换 agent 时触发（T5 接住做 session 切换） */
  onAgentChange?: (agentId: string) => void;
  /** B1：新建 Session（App 接线：session.newSession() + 系统提示） */
  onNewSession?: () => void;
}

/**
 * T4：顶部 agent 选择。
 * - 首启无 current_agent_id → 引导列表让用户选一个
 * - 选中后存 localStorage.current_agent_id，顶栏以下拉形式随时切换
 * - B1：下拉态右侧「＋ 新建」按钮（plan T5 成功条件 4 的 UI 入口；⌘N 在 App 层）
 * - N5：离线提示职责归 OfflineBanner（5s 轮询可关闭），TopBar 不再自带一次性快照
 * - 设计决议：顶栏只有 状态灯 + agent 下拉 + ＋ 新建 + ⋯（无 x 缩回按钮；
 *   缩回浮球走 Esc / 浮球单击 / ⌘⇧Space，见 App.tsx recallMain）
 */
export default function TopBar({
  onAgentChange,
  onNewSession,
}: TopBarProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(() => getCurrentAgentId());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await listAgents();
        if (!cancelled) setAgents(list);
      } catch {
        // 连不上 QwenPaw：保持空列表，引导区显示"未运行"提示，不崩溃
        if (!cancelled) setAgents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = useCallback(
    (id: string) => {
      setCurrentAgentId(id);
      setCurrentId(id);
      onAgentChange?.(id);
    },
    [onAgentChange],
  );

  // 首启引导：没有 current_agent_id，从列表选一个
  if (!currentId) {
    return (
      <header className="topbar topbar--onboarding">
        <div className="onboarding">
          <p className="onboarding__title">选择要对话的 Agent</p>
          {loading && <p className="onboarding__hint">正在连接 QwenPaw…</p>}
          {!loading && agents.length === 0 && (
            <p className="onboarding__hint">QwenPaw 未运行或无可用 Agent</p>
          )}
          <ul className="onboarding__list">
            {agents.map((a) => (
              <li key={a.id}>
                <button type="button" className="onboarding__item" onClick={() => choose(a.id)}>
                  <span className="onboarding__name">{a.name}</span>
                  <span className="onboarding__id">{a.id}</span>
                  {a.description && <span className="onboarding__desc">{a.description}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </header>
    );
  }

  const current = agents.find((a) => a.id === currentId) ?? null;

  return (
    <header className="topbar">
      <StatusLight />
      <select
        className="topbar__select"
        aria-label="选择 Agent"
        value={currentId}
        onChange={(e) => choose(e.target.value)}
      >
        {agents.map((a) => (
          <option key={a.id} value={a.id} title={a.description}>
            {a.name}（{a.id}）
          </option>
        ))}
        {currentId && !current && <option value={currentId}>{currentId}</option>}
      </select>
      {current?.description && <span className="topbar__desc">{current.description}</span>}
      {onNewSession && (
        <button
          type="button"
          className="topbar__new"
          onClick={onNewSession}
          title="新建 Session（⌘N）"
        >
          ＋ 新建
        </button>
      )}
      {/* 模块 6（6.1）：角落面板入口（⋯ + 新版本红点角标） */}
      <CornerPanel />
    </header>
  );
}
