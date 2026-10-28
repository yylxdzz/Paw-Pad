/**
 * A 层回归：玻璃质感 / 浅色模式洗白（冒烟 1/2/3 轮的修复固化为自动断言）。
 * 用 wdio 原生 browser.execute 在 app 内跑 getComputedStyle——纯确定性，零视觉模型。
 * （2026-10-28 改道：tauri-service 1.5.0 peer 锁 wdio9、项目实装 wdio10 触发其
 * patchBrowserExecute 兼容 bug 致 tauri 通道注入失败，改走不经 patch 的原生
 * execute；详见 isolation.ts 顶部「执行通道」说明。）
 *
 * 2026-10-28 对齐方案 A（src-tauri 原生 vibrancy / liquid glass 已全删，主窗毛玻璃
 * 改由 CSS backdrop-filter 提供，细节见 MEMORY.md「方案 A」）：
 *   - .app-shell 底色 = var(--bg-main)：深色 rgba(24,24,27,.75) / 浅色
 *     rgba(250,250,250,.75)（app.css 二轮调参 0.80 → 0.75），不再写死 0.80；
 *   - 主/正文色跟随 prefers-color-scheme（--text-primary / --text-body 语义变量，
 *     深色 #f4f4f5/#d4d4d8、浅色 #18181b/#3f3f46）——故对比度断言改为读取【实际
 *     计算值】而非写死深色值，深浅两套系统配色下都应成立。
 *
 * 移植说明：本 spec 源自 mvp/test/e2e/glass.spec.ts（2026-10-28 移植进 Paw Pad，
 * 对齐 Paw Pad 当前实现；mvp 原件不动）。
 */

import { waitForAppShell } from "./helpers";

/** WCAG 对比度：解析 rgba() 字符串，按最亮混合底（白色桌面）合成后算对比度 */
function contrastOnLight(fg: string, bg: string): number {
  const parse = (c: string): [number, number, number, number] => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return [0, 0, 0, 0];
    const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  };
  const composite = (fgC: number[], bgC: number[]) =>
    fgC.map((v, i) => v * fgC[3] + bgC[i] * (1 - fgC[3]));
  const lum = (rgb: number[]) => {
    const [r, g, b] = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const bgRGB = composite(parse(bg), [255, 255, 255]); // 最亮混合底
  const fgRGB = parse(fg).slice(0, 3);
  const l1 = lum(fgRGB);
  const l2 = lum(bgRGB);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** 十六进制色（#rgb / #rrggbb）→ "rgb(r, g, b)"，喂给 contrastOnLight。
 *  getComputedStyle 对自定义属性（--text-*）返回的是声明值（十六进制），需转 rgb。 */
function hexToRgbStr(hex: string): string {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h
    .split("")
    .map((c) => c + c)
    .join("");
  const n = parseInt(h, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

/** 从 rgb()/rgba() 字符串取 alpha 通道（无 alpha 记 1） */
function alphaOf(color: string): number {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return 1;
  const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
  return parts[3] ?? 1;
}

describe("玻璃质感与洗白回归（冒烟 1/2/3 轮 → 方案 A 对齐）", () => {
  // 冷启动竞态修复：vite 200 ≠ 前端就绪，先等 .app-shell 出现再跑 execute
  // （干净环境 onPrepare 冷拉 vite 后白屏窗口期数秒，不等则 querySelector 返 null）
  before(async () => {
    await waitForAppShell();
  });

  it("app-shell 半透明底 + backdrop-filter 毛玻璃，主/正文对比度 > 4.5（深浅两套配色）", async () => {
    const r = await browser.execute(() => {
      const el = document.querySelector(".app-shell") as HTMLElement;
      const cs = getComputedStyle(el);
      const wk = cs as unknown as { webkitBackdropFilter?: string };
      return {
        bg: cs.backgroundColor,
        // 自定义属性返回声明值（十六进制），Node 侧再转 rgb
        primary: cs.getPropertyValue("--text-primary"),
        body: cs.getPropertyValue("--text-body"),
        backdrop: cs.backdropFilter || wk.webkitBackdropFilter || "",
      };
    });
    // 有底色（非全透明 / 非 transparent），且是半透明玻璃（0 < alpha < 1）
    expect(r.bg).not.toBe("rgba(0, 0, 0, 0)");
    expect(r.bg).not.toBe("transparent");
    expect(alphaOf(r.bg)).toBeGreaterThan(0);
    expect(alphaOf(r.bg)).toBeLessThan(1);
    // 方案 A：毛玻璃由 CSS backdrop-filter 提供（原生 vibrancy 已删）
    expect(r.backdrop).toContain("blur");
    // 主/正文对比度：读实际计算色（随系统深浅色），白桌面合成后 > 4.5
    expect(contrastOnLight(hexToRgbStr(r.primary), r.bg)).toBeGreaterThan(4.5);
    expect(contrastOnLight(hexToRgbStr(r.body), r.bg)).toBeGreaterThan(4.5);
  });

  it("fill alpha 对齐二轮调参 0.75（0.80 → 0.75，透出更多桌面）", async () => {
    const r = await browser.execute(() => {
      const cs = getComputedStyle(document.querySelector(".app-shell") as HTMLElement);
      return cs.backgroundColor;
    });
    // 深色 rgba(24,24,27,0.75) / 浅色 rgba(250,250,250,0.75)——alpha 均 0.75
    expect(alphaOf(r)).toBeCloseTo(0.75, 5);
  });

  it("圆角 20px（方案 A 起由 CSS 负责，防玻璃/内容边缘错位）", async () => {
    const r = await browser.execute(() => {
      const cs = getComputedStyle(document.querySelector(".app-shell") as HTMLElement);
      return { radius: cs.borderRadius };
    });
    expect(r.radius).toBe("20px");
  });
});
