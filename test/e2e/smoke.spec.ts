/**
 * S2/S5 回归：启动后 agent 下拉存在；点「＋ 新建」→ 消息区清空 + 「新对话」提示留存。
 *
 * 缺陷 1 回归断言（已修）：提示曾被 loadHistory 整表覆盖吞掉——旧机制用
 * `m.ts >= loadStartedAt` 保留，但 appendSystemMessage 的 ts（点击时刻）早于
 * load effect 的 loadStartedAt 快照（effect 提交后才跑）必被滤掉；现改为按
 * sessionId 归属保留（MessageList.appendSystemMessage 打标 + load 过滤）。
 *
 * 2026-10-28 自 mvp/test/e2e/smoke.spec.ts 移植进 Paw Pad。选择器核对：
 * .topbar__select / .topbar__new（TopBar.tsx）、.onboarding__item（TopBar.tsx
 * agent 引导列表）、.system-hint（MessageList.tsx:302）均存；.message-item--user /
 * .message-item--assistant 由 MessageList.tsx:324 的 `message-item--${kind}` 模板
 * 运行时生成（源码无字面量，grep 易漏）——与 Paw Pad 当前实现一致，断言原样保留。
 */

import { ensureAgentSelected, waitForAppShell, waitForStreamEnd } from "./helpers";
import { isolateSession, restoreSession, type SessionBackup } from "./isolation";

describe("启动与新建 Session（S2/S5 回归）", () => {
  // spec 级 hook：isolateSession/restoreSession 走 wdio 原生 browser.execute，
  // 不经 tauri-service 的 patch，不受其兼容 bug 影响（见 isolation.ts 执行通道说明）
  let backup: SessionBackup;
  before(async () => {
    // 冷启动竞态修复：vite 200 ≠ 前端就绪，先等 .app-shell 出现（白屏窗口期数秒）
    await waitForAppShell();
    backup = await isolateSession();
  });
  after(async () => {
    await restoreSession(backup);
  });

  it("agent 下拉存在，点＋新建后消息区清空", async () => {
    //  spawned 实例与用户窗口共享 app 容器 localStorage：可能直接带出已选 agent
    // （正常分支 .topbar__select），也可能是全新状态（onboarding 分支）——两分支都接。
    await ensureAgentSelected();
    const select = await $(".topbar__select");
    await select.waitForDisplayed({ timeout: 15000 });

    // 等首屏历史加载稳定
    await browser.pause(2500);

    // 在途流可能跨 worker 边界仍在跑（共享 app 实例）——先等它结束再切换
    await waitForStreamEnd();

    // 点「＋ 新建」
    const newBtn = await $(".topbar__new");
    await newBtn.waitForDisplayed({ timeout: 5000 });
    await newBtn.click();

    // 断言：新会话无历史 → user 消息清零（S5 消息区清空）
    await browser.waitUntil(
      async () => (await $$(".message-item--user")).length === 0,
      { timeout: 10000, timeoutMsg: "＋新建后用户消息未清空" },
    );
    const assistants = await $$(".message-item--assistant");
    expect(assistants.length).toBe(0);

    // 「＋ 新建」的「新对话」系统提示必须留存（缺陷 1 回归：曾被 loadHistory
    // 的整表覆盖吞掉——appendSystemMessage 的 ts 早于 load effect 的
    // loadStartedAt 快照；现改为按 sessionId 归属保留）
    const hints = await $$(".system-hint");
    expect(hints.length).toBe(1);
    expect(await hints[0].getText()).toContain("新对话");
  });
});
