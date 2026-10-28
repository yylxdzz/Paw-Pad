/**
 * S3/S4 回归：工具行展开/收起。
 * ＋新建落干净会话后真实发消息驱动（backend localhost:8088 在线，agent 对工具
 * 诱导型 prompt 触发工具调用）；等待容忍 90s。agent 响应不稳定致 flaky 时按
 * 规划方预案降级为静态渲染分支并在报告说明。
 *
 * 2026-10-28 对齐 D8 工具组折叠（MessageList.groupConsecutiveTools + ToolGroup）：
 * 单工具直渲染 .tool-row；2+ 连续工具折叠为 .tool-group 组头（默认收起），组内
 * .tool-row 需先点组头才露出——故等待逻辑兼容「.tool-row 或 .tool-group」，命中
 * 组则先展开。源自 mvp/test/e2e/tools.spec.ts 移植（mvp 原件不动）。
 */

import { startFreshSession, lastOf, waitForAppShell } from "./helpers";
import { isolateSession, restoreSession, type SessionBackup } from "./isolation";

describe("工具行展开收起（S3/S4 回归）", () => {
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

  it("工具行出现 → 点击展开参数卡片 → 再点收起", async () => {
    await startFreshSession();

    const ta = await $("textarea");
    await ta.waitForDisplayed({ timeout: 15000 });

    // 工具诱导型 prompt（要求 agent 调工具）
    await ta.setValue("请调用工具列出你当前工作目录下的文件，只做这一件事");
    await browser.keys("Enter");

    // 等工具出现（D8 工具组折叠：单工具直渲染 .tool-row；2+ 连续工具折叠为
    // .tool-group 组头、默认收起、组内 .tool-row 隐藏）。干净会话下从 0 增长，
    // agent 响应 + 工具调用，容忍 90s。
    await browser.waitUntil(
      async () =>
        (await $$(".tool-row")).length > 0 || (await $$(".tool-group")).length > 0,
      { timeout: 90000, timeoutMsg: "90s 内未出现工具（agent 未调工具）" },
    );

    // 若落在折叠组（2+ 工具）：先点组头展开，露出组内 .tool-row
    const group = await $(".tool-group");
    if (await group.isExisting()) {
      await group.click();
      await browser.waitUntil(async () => (await $$(".tool-row")).length > 0, {
        timeout: 5000,
        timeoutMsg: "展开工具组后未见工具行",
      });
    }

    // 展开：点末条工具行 → 参数卡片可见且 body 非空
    const row = await lastOf(".tool-row");
    await row.click();
    const card = await $(".tool-card");
    await card.waitForDisplayed({ timeout: 5000 });
    const body = await $(".tool-card__body");
    expect((await body.getText()).length).toBeGreaterThan(0);

    // 收起：再点 → 参数卡片消失
    await row.click();
    await card.waitForDisplayed({ timeout: 5000, reverse: true });
  });
});
