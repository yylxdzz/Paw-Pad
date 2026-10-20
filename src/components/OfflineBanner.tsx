/**
 * T13：离线检测横幅（D10：只提示，不做安装引导/配置教程/诊断向导）。
 * 复用 T3 connection.ts 的 checkOnline()；5s 轮询，离线显示、可手动关闭、恢复在线自动重置。
 */

import { useEffect, useState } from "react";
import { checkOnline, OFFLINE_MESSAGE } from "../lib/connection";

const POLL_INTERVAL_MS = 5000;

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const online = await checkOnline();
      if (stopped) return;
      setOffline(!online);
      if (online) setDismissed(false); // 恢复在线：重置关闭状态，下次离线再提示
    };
    void tick();
    const timer = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  if (!offline || dismissed) return null;

  return (
    <div className="offline-banner" role="status">
      <span className="offline-banner__text">{OFFLINE_MESSAGE}</span>
      <button
        type="button"
        className="offline-banner__close"
        aria-label="关闭提示"
        onClick={() => setDismissed(true)}
      >
        ✕
      </button>
    </div>
  );
}
