/**
 * e2e 共享辅助。
 *
 * ⚠️ 隔离边界（已知限制，见回报）：wdio spawn 的实例与用户 dev 窗口共享同一 app
 * 容器（localStorage/website data）——resolveSession 会落到该 agent 的「最近活跃
 * session」（即用户真实会话）。因此：
 *   1. 每个发送类用例先点「＋ 新建」落到干净会话，避免历史数据污染断言；
 *   2. 用户活跃会话不被注入消息（只在其 agent 下新建 session）；
 *   3. 彻底隔离需产品侧支持独立 data-dir，超出本轮授权，记入 TODO-wdio.md。
 */

/** 确保 App 真实选中了 agent（以 localStorage 实况为准——DOM 分支在 loading 态
 *  不可靠：agent 为空时 TopBar 也可能已渲染出 select 骨架）。无 agent → 走
 *  onboarding 选一个（switchAgent 会落 agent + session 并 emit）。 */
export async function ensureAgentSelected(): Promise<void> {
  const readAgent = () =>
    browser.execute(() => window.localStorage.getItem("current_agent_id"));
  if (await readAgent()) return;
  const firstItem = await $(".onboarding__item");
  await firstItem.waitForDisplayed({ timeout: 20000 });
  await firstItem.click();
  await browser.waitUntil(async () => !!(await readAgent()), {
    timeout: 15000,
    timeoutMsg: "onboarding 选择后 agent 仍未落盘",
  });
}

/** 等在途 SSE 流结束（共享 app 实例：上个用例的流可能跨 worker 边界仍在途，
 *  不等待的话＋新建后 onToken 会往新会话补消息，污染断言） */
export async function waitForStreamEnd(): Promise<void> {
  const stopBtn = await $('button[aria-label="停止生成"]');
  await stopBtn.waitForDisplayed({ timeout: 60000, reverse: true }).catch(() => {});
}

/** 点「＋ 新建」落到干净会话，等历史加载（新 session 空列表）落定 */
export async function startFreshSession(): Promise<void> {
  await ensureAgentSelected();
  await waitForStreamEnd();
  const newBtn = await $(".topbar__new");
  await newBtn.waitForDisplayed({ timeout: 10000 });
  await newBtn.click();
  await browser.pause(1500); // loadHistory（空列表）覆盖完成
}

/** 取最后一个匹配元素（历史可能有残留，末元素才是本轮新增） */
export async function lastOf(selector: string) {
  const all = await $$(selector);
  return all[all.length - 1];
}

/** 等 App 首屏就绪（.app-shell 出现 = React 已渲染出壳）。
 *  冷启动竞态修复：vite HTTP 200 不等于前端就绪——干净环境 onPrepare 冷拉 vite
 *  后，WebView 加载/模块 transform/首屏渲染还要数秒，不等会撞白屏窗口期
 *  （2026-10-28 实证：干净环境 0/4 全挂、共享热 dev 时全绿）。 */
export async function waitForAppShell(): Promise<void> {
  const shell = await $(".app-shell");
  await shell.waitForExist({ timeout: 30000, timeoutMsg: "App 首屏 .app-shell 未出现（白屏或加载失败）" });
}
