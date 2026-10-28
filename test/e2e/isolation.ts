/**
 * wdio e2e 会话隔离——localStorage 指针级隔离。
 *
 * 背景：wdio spawn 的实例与用户 dev 窗口共享同一 app 容器（localStorage/website
 * data），resolveSession 会落到该 agent 的「最近活跃 session」（即用户真实会话）。
 *
 * 做法：读 localStorage 的 current_agent_id / current_session_id 备份 → 把
 * current_session_id 改指向独立测试 session（wdio-e2e-<ts>，agent 保持不变，
 * 新消息只落在该 agent 下的测试 session，用户真实 session 零增长）→ 返回备份；
 * 用后 restoreSession(backup) 写回原值（原值为 null 则 removeItem）。
 *
 * ⚠️ 执行通道（2026-10-28 改 wdio 原生 browser.execute）：
 * @wdio/tauri-service@1.5.0 的 peerDependencies 锁 `webdriverio: ^9.0.0`，项目实装
 * webdriverio 10.1.0（npm 最新 1.5.1 的 peer 同样锁 ^9，升级无路）——wdio10 的
 * browser 是 lazy proxy，tauri-service before 阶段 patchBrowserExecute 里
 * `browser.execute.bind(browser)` 读到 undefined → addTauriApi 中断 → 其注入的
 * tauri execute 通道不可用，凡依赖该通道的代码全挂（2026-10-28 规划方本机复跑
 * 实证：slash 挂、glass/smoke/tools 过的根因）。故本文件（及 helpers.ts /
 * glass.spec.ts）的页面内 JS 读写一律改走 wdio 原生 browser.execute——WebDriver
 * 标准命令，不经 tauri patch，不受该 bug 影响。原生 execute 无 tauri wrapper，
 * 函数形参从第一个就是用户参数，不再需要 `_tauri` 占位形参。
 *
 * 注：spec 级 before/after 调用结构保留（原生 execute 不存在「root before 时尚未
 * 就绪」的时序问题，spec 级 hook 仅沿用既有结构，不影响正确性）。
 */

export interface SessionBackup {
  agentId: string | null;
  sessionId: string | null;
}

/**
 * 备份当前 localStorage 会话指针，并把 current_session_id 改指向独立测试 session。
 * 返回值交给 restoreSession 复原。
 */
export async function isolateSession(): Promise<SessionBackup> {
  const cur = (await browser.execute(() => ({
    agent: window.localStorage.getItem("current_agent_id"),
    session: window.localStorage.getItem("current_session_id"),
  }))) as { agent: string | null; session: string | null };

  const backup: SessionBackup = { agentId: cur.agent, sessionId: cur.session };

  await browser.execute((sid: string) => {
    window.localStorage.setItem("current_session_id", sid);
  }, `wdio-e2e-${Date.now()}`);

  return backup;
}

/** 写回备份的会话指针；原值为 null/undefined 时 removeItem（保持原状）。 */
export async function restoreSession(backup: SessionBackup): Promise<void> {
  await browser.execute(
    (a: string | null | undefined, s: string | null | undefined) => {
      if (a === null || a === undefined) window.localStorage.removeItem("current_agent_id");
      else window.localStorage.setItem("current_agent_id", a);
      if (s === null || s === undefined) window.localStorage.removeItem("current_session_id");
      else window.localStorage.setItem("current_session_id", s);
    },
    backup.agentId,
    backup.sessionId,
  );
}
