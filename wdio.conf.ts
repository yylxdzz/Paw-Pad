import { spawn, type ChildProcess } from "node:child_process";
import type { Options } from "@wdio/types";

/**
 * wdio e2e 配置——@wdio/tauri-service embedded 模式。
 * 驱动 App 自己 spawn 的 debug 构建产物（src-tauri/target/debug/qwenpaw-lite，
 * 内含 #[cfg(debug_assertions)] 门内的 tauri-plugin-wdio-webdriver 内嵌 WebDriver
 * server），完全不碰用户 dev 窗口与用户的 vite dev server。
 * 依据：本机笔记《Tauri 桌面应用自动化自测方案（macOS）》五.5。
 *
 * 隔离 hook 已下沉到各 spec 的 mocha before/after（test/e2e/isolation.ts 的
 * isolateSession/restoreSession）——spec 级 hook 在 tauri-service 的
 * addTauriApi patchBrowserExecute 之后运行，browser.tauri 一定就绪；放在本文件
 * 的 root before 会因 browser.tauri 为 undefined 报错（上轮实证）。
 *
 * vite dev server 生命周期（本轮补）：src-tauri/tauri.conf.json 的
 * build.devUrl = http://localhost:1420——debug 构建实例固定从该地址加载前端。
 * 若 1420 没有服务在听，spawn 出来的实例前端白屏（window.__TAURI_INTERNALS__
 * 不可用），全部 spec 挂。故 onPrepare 负责把 vite 拉起来并等它就绪，onComplete
 * 负责回收；已有人在听则复用、不杀（避免误杀用户的 dev server）。
 */

/** 与 build.devUrl 对齐；用 127.0.0.1 探测，避开 localhost 的 IPv6/IPv4 家族选择问题 */
const VITE_PORT = 1420;
const VITE_PROBE_URL = `http://127.0.0.1:${VITE_PORT}`;
const VITE_START_TIMEOUT_MS = 30_000;

/** onPrepare 拉起的 vite 子进程；onComplete 回收（null = 复用已有服务或未启动） */
let viteProcess: ChildProcess | null = null;

/** vite dev server 是否已在 200 响应 */
async function isViteReady(): Promise<boolean> {
  try {
    const res = await fetch(VITE_PROBE_URL, { signal: AbortSignal.timeout(2000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * 起 vite dev server 并轮询等它返回 200；30s 没就绪就抛错，直接终止本次 run
 * （白屏实例会让后面每个 spec 都挂，早失败早定位）。
 * 已在听则复用，不动别人的进程。
 */
async function ensureViteDevServer(): Promise<void> {
  if (await isViteReady()) {
    console.log(`[wdio] vite dev server already listening on :${VITE_PORT} — reusing, not spawning`);
    return;
  }

  // PATH 前置 node_modules/.bin，让 npx 直接命中本地 vite（不触网、不下载）
  const child = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort"], {
    cwd: process.cwd(), // 约定从 mvp 根跑 `pnpm wdio run wdio.conf.ts`
    detached: true, // 独立进程组：onComplete 可整组 kill，防 vite 派的 esbuild 子进程残留
    env: {
      ...process.env,
      PATH: `${process.cwd()}/node_modules/.bin:${process.env.PATH ?? ""}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  viteProcess = child;

  // 缓存输出，只在失败时回显（成功路径不污染 wdio 原始输出）
  const chunks: string[] = [];
  const capture = (buf: Buffer): void => {
    chunks.push(buf.toString());
    if (chunks.length > 400) chunks.shift();
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);

  const deadline = Date.now() + VITE_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break; // vite 自己退了（如 strictPort 撞端口）
    if (await isViteReady()) {
      console.log(`[wdio] vite dev server ready on :${VITE_PORT} (pid ${String(child.pid)})`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const tail = chunks.join("").split("\n").slice(-15).join("\n");
  throw new Error(
    `vite dev server 未在 ${VITE_START_TIMEOUT_MS}ms 内就绪（:${VITE_PORT}）。` +
      `debug 构建实例经 build.devUrl 从该端口加载前端，起不来则实例白屏、全部 spec 必挂。` +
      (child.exitCode !== null ? `\nvite 已退出，exitCode=${String(child.exitCode)}\n${tail}` : `\n${tail}`),
  );
}

/** 回收 vite：杀整个进程组（vite 会派 esbuild service 子进程），失败不抛（onComplete 不能改退出码） */
function stopViteDevServer(): void {
  const child = viteProcess;
  viteProcess = null;
  if (!child || child.pid === undefined) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* 已退出，无需处理 */
    }
  }
}

export const config: Options.Testrunner = {
  runner: "local",
  framework: "mocha",
  mochaOpts: {
    // tools.spec 真实驱动 agent 工具调用，容忍 60s+
    timeout: 120000,
  },
  services: [
    [
      "tauri",
      {
        appBinaryPath: "./src-tauri/target/debug/qwenpaw-lite",
        driverProvider: "embedded",
        // embeddedPort：wdio spawn 的实例自己的 WebDriver 端口。默认 4445 会被
        // 用户 dev 窗口占用（debug 构建同样内嵌 wdio-webdriver server，dev 实例
        // 起手就 LISTEN 127.0.0.1:4445 且 /status 存活）——若用默认端口，新实例
        // 绑不上 4445，service 改连 dev 实例，测试就会驱动用户真实窗口，违背本文件
        // 头部「完全不碰用户 dev 窗口」的既定边界。插件按 env TAURI_WEBDRIVER_PORT
        // 取端口（tauri-plugin-wdio-webdriver PORT_ENV_VAR，优先级最高），service
        // spawn 时自动注入，故此处显式错开到 4446。
        embeddedPort: 4446,
      },
    ],
  ],
  capabilities: [
    {
      browserName: "tauri",
    },
  ],
  specs: ["./test/e2e/**/*.spec.ts"],
  maxInstances: 1,
  // strictSelectors: false —— wdio v9+ 默认开启 strict 模式，`$()` 匹配到多个元素
  // 直接抛 StrictSelectorError。helpers.ts 的 `$(".onboarding__item")` 本意是「点第一个
  // agent」（该 helper 成书于 strict 成为默认值之前）。独立实例每次都是全新状态，必走
  // onboarding 分支，而后端 agent 列表有 9 项 → 不关 strict 则 slash/smoke/tools 全挂。
  // 其余 `$()` 选择器（.topbar__new / textarea / .cmd-palette / .tool-card）语义均为
  // 「唯一元素」，关闭 strict 不改变其行为，只是不再因重复匹配中断。
  strictSelectors: false,
  reporters: ["spec"],
  logLevel: "info",

  // wdio 钩子顺序（@wdio/cli launcher）：config.onPrepare 先于 service.onPrepare
  // （后者才 spawn app 实例），config.onComplete 先于 service.onComplete（后者才停
  // app）——所以 vite 一定早于 app 实例就绪，收尾也一定在 app 停掉之前。
  onPrepare: ensureViteDevServer,
  onComplete: stopViteDevServer,
};
