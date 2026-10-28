/**
 * S8 回归：slash 双 Enter（冒烟第二轮用户复现 bug 的固化断言）。
 * 流程：＋新建（干净会话）→ 输入 /compact → 命令浮层出现 → 第一次 Enter 选中
 * （值变 "/compact "）→ 第二次 Enter 发送 → 用户消息出现在消息区。
 *
 * 2026-10-28 自 mvp/test/e2e/slash.spec.ts 移植进 Paw Pad。选择器 textarea /
 * .cmd-palette（InputBar.tsx）/ .user-bubble（UserBubble.tsx）均与 Paw Pad 当前
 * 实现一致，断言原样保留。（此路径与 InputBar.interaction.test.tsx 的组件层/接线层
 * 用例同源，e2e 侧由真实异步 stream 驱动，不受同步 mock 的发送锁时序影响。）
 */

import { startFreshSession, lastOf, waitForAppShell } from "./helpers";
import { isolateSession, restoreSession, type SessionBackup } from "./isolation";

describe("slash 命令双 Enter（S8 回归）", () => {
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

  it("选中 /compact 后第二次 Enter 应发送且用户消息入区", async () => {
    await startFreshSession();

    const ta = await $("textarea");
    await ta.waitForDisplayed({ timeout: 15000 });

    // 1. 输入 /compact → 命令浮层出现
    await ta.setValue("/compact");
    const palette = await $(".cmd-palette");
    await palette.waitForDisplayed({ timeout: 5000 });

    // 2. 第一次 Enter → 选中填入（含尾随空格）、浮层关闭
    await browser.keys("Enter");
    await browser.pause(300);
    expect(await ta.getValue()).toBe("/compact ");
    expect(await palette.isDisplayed()).toBe(false);

    // 3. 第二次 Enter → 发送：用户消息出现在消息区（干净会话下应为第 1 条）
    await browser.keys("Enter");
    await browser.waitUntil(async () => (await $$(".user-bubble")).length === 1, {
      timeout: 10000,
      timeoutMsg: "第二次 Enter 后用户消息未入区",
    });
    const bubble = await lastOf(".user-bubble");
    expect(await bubble.getText()).toContain("/compact");

    // 4. 输入框清空
    expect(await ta.getValue()).toBe("");
  });

  it("普通消息 Enter 直发（无浮层路径）", async () => {
    await startFreshSession();

    const ta = await $("textarea");
    await ta.waitForDisplayed({ timeout: 15000 }); // 隔离后新会话 UI 重建中，先等再操作（与上例对齐）
    await ta.setValue("回归测试普通消息");
    await browser.keys("Enter");
    await browser.waitUntil(async () => (await $$(".user-bubble")).length === 1, {
      timeout: 10000,
      timeoutMsg: "普通消息未入区",
    });
    const bubble = await lastOf(".user-bubble");
    expect(await bubble.getText()).toContain("回归测试普通消息");
  });
});
