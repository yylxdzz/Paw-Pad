import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

/**
 * 模块 6（6.2）：快捷键重设。
 *
 * 视觉基准：「快捷键重设面板-20261020」定稿（玻璃底三行列表）：
 *   - 行：淡底 var(--fill-hint) + 细边 + 8px 圆角 + 间距 6px
 *   - 键帽：min-width 88px + 等宽字体 + 组合键拆成「键帽 + 灰色 + 分隔」
 *   - 录制态：行/框蓝 tint（var(--info)）+ 1.2s 蓝色脉冲；hover 淡底提亮
 *   - 冲突态：行/框红 tint（var(--danger)）+ 冲突对象说明
 *   - 恢复默认：定稿 footer reset 按钮（hover 提亮 / active scale(.97)）
 *
 * 行为（不变）：
 * - 点击快捷键框进入录制态，用户键盘按一下自动录入
 *   （组合键自动收集 ⌘⌃⇧⌥ + 主键；纯修饰键按下不录入，继续等待主键）
 * - 冲突检测：同一组合键被两项占用 → 红标提示
 * - 恢复默认按钮
 * - ESC 取消录制（capture 阶段拦下，不会触发 App 层 Esc 缩回）
 * - 点击外部关闭
 * - 快捷键框统一 min-width 88px
 *
 * 持久化：localStorage.pawpad_shortcuts。新键值的全局重注册（Rust 侧
 * global-shortcut 换绑）留待工程接线——本模块管 UI + 存储。
 */

type ShortcutId = "summon" | "screenshot" | "new";

interface ShortcutDef {
  id: ShortcutId;
  label: string;
  hint: string;
}

const DEFS: ShortcutDef[] = [
  { id: "summon", label: "呼出主窗口", hint: "全局" },
  { id: "screenshot", label: "截图", hint: "全局" },
  { id: "new", label: "新建对话", hint: "应用内" },
];

/** 默认快捷键（6.2 铁定的三键） */
const DEFAULTS: Record<ShortcutId, string> = {
  summon: "⌘⇧Space",
  screenshot: "⌘⇧X",
  new: "⌘N",
};

const STORAGE_KEY = "pawpad_shortcuts";

/** 快捷键框统一宽度下限（6.2 硬约束，同定稿 min-width 88px） */
const BOX_MIN_WIDTH = 88;

function loadShortcuts(): Record<ShortcutId, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Record<ShortcutId, string>>) };
  } catch {
    // 存储不可用 → 默认值
  }
  return { ...DEFAULTS };
}

function saveShortcuts(s: Record<ShortcutId, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // 存储失败不阻塞
  }
}

/** 从键盘事件收集组合键：⌘⌃⇧⌥ + 主键。无修饰键 / 纯修饰键按下 → null（不录入） */
function comboFromEvent(e: KeyboardEvent): string | null {
  let mods = "";
  if (e.metaKey) mods += "⌘";
  if (e.ctrlKey) mods += "⌃";
  if (e.shiftKey) mods += "⇧";
  if (e.altKey) mods += "⌥";
  if (!mods) return null;
  const key = e.key;
  if (key === "Meta" || key === "Control" || key === "Shift" || key === "Alt") return null;
  const main = key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key;
  return `${mods}${main}`;
}

/** 拆组合键为键帽序列：⌘⇧Space → ["⌘","⇧","Space"]（定稿按「键帽 + 灰色 +」渲染） */
function splitCombo(combo: string): string[] {
  const m = /^([⌘⌃⇧⌥]*)([\s\S]*)$/.exec(combo);
  if (!m) return [combo];
  const mods = m[1].split("");
  const main = m[2];
  return main ? [...mods, main] : mods;
}

/**
 * 快捷键行样式（对照定稿校准；注入式 <style> 保持单文件自包含，
 * 同时让 :hover / :active 生效——纯内联样式做不到伪类）。
 */
const KB_STYLE = `
.pawpad-kb-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
  padding: 10px 12px; border-radius: 8px; margin-bottom: 6px;
  background: var(--fill-hint); border: 1px solid var(--fill-weak);
  transition: all .15s;
}
.pawpad-kb-row.is-recording {
  background: var(--info-soft); border-color: var(--info-border);
  box-shadow: 0 0 0 1px var(--info-ring), 0 0 16px var(--info-glow);
}
.pawpad-kb-row.is-conflict { border-color: var(--danger-border); background: var(--danger-fill); }
.pawpad-kb-info { display: flex; flex-direction: column; gap: 2px; }
.pawpad-kb-fn { font-size: 13px; color: var(--text-body); font-weight: 500; line-height: 1.4; }
.pawpad-kb-desc { font-size: 10.5px; color: var(--text-tertiary); line-height: 1.4; }
.pawpad-kb-key {
  display: flex; align-items: center; justify-content: center; gap: 4px;
  min-width: ${BOX_MIN_WIDTH}px; padding: 5px 12px; border-radius: 6px;
  background: var(--fill-weak); border: 1px solid var(--fill-mid);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--text-body);
  cursor: pointer; user-select: none; transition: all .12s;
}
.pawpad-kb-key:hover { background: var(--fill-mid); border-color: var(--border-hover); }
.pawpad-kb-key.is-recording,
.pawpad-kb-key.is-recording:hover {
  background: var(--info-glow); border-color: var(--info); color: var(--info);
  animation: pawpad-rec-pulse 1.2s ease-in-out infinite; cursor: default;
}
.pawpad-kb-key.is-conflict { border-color: var(--danger-border); }
.pawpad-kb-cap { min-width: 14px; text-align: center; }
.pawpad-kb-plus { color: var(--text-tertiary); }
.pawpad-kb-rec-text { font-size: 11px; color: var(--info); }
.pawpad-kb-reset {
  font-family: -apple-system, "SF Pro Text", "PingFang SC", sans-serif; font-size: 12px;
  padding: 6px 14px; border-radius: 8px; cursor: pointer;
  background: var(--fill-weak); border: 1px solid var(--fill-mid); color: var(--text-secondary);
  transition: all .12s;
}
.pawpad-kb-reset:hover { background: var(--fill-mid); color: var(--text-body); }
.pawpad-kb-reset:active { transform: scale(.97); }
@keyframes pawpad-rec-pulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--info-pulse); }
  50% { box-shadow: 0 0 0 4px var(--info-pulse-weak); }
}`;

export default function ShortcutSettings({ onClose }: { onClose?: () => void }) {
  const [shortcuts, setShortcuts] = useState<Record<ShortcutId, string>>(loadShortcuts);
  const [recording, setRecording] = useState<ShortcutId | null>(null);

  // 录制态：window 级 capture keydown——先于 App 的 ⌘N / Esc 处理。
  // ESC 取消；主键按下自动录入并落盘；纯修饰键按下继续等待。
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(null);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return; // 仅修饰键 → 继续等主键
      const id = recording;
      setShortcuts((prev) => {
        const next = { ...prev, [id]: combo };
        saveShortcuts(next);
        return next;
      });
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording]);

  // 点击外部关闭（容器 ref 外的 pointerdown）
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose?.();
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [onClose]);

  // 冲突检测：同一组合键被两项（含以上）占用 → 全部标红
  const conflictingIds = useMemo(() => {
    const groups = new Map<string, ShortcutId[]>();
    (Object.keys(shortcuts) as ShortcutId[]).forEach((id) => {
      const k = shortcuts[id];
      groups.set(k, [...(groups.get(k) ?? []), id]);
    });
    const bad = new Set<ShortcutId>();
    groups.forEach((ids) => {
      if (ids.length > 1) ids.forEach((id) => bad.add(id));
    });
    return bad;
  }, [shortcuts]);

  /** 找到与该项冲突的另一项（提示文案用） */
  const conflictWith = useCallback(
    (id: ShortcutId): string | null => {
      const other = (Object.keys(shortcuts) as ShortcutId[]).find(
        (o) => o !== id && shortcuts[o] === shortcuts[id],
      );
      return other ? DEFS.find((d) => d.id === other)?.label ?? other : null;
    },
    [shortcuts],
  );

  const restoreDefaults = useCallback(() => {
    setShortcuts({ ...DEFAULTS });
    saveShortcuts(DEFAULTS);
    setRecording(null);
  }, []);

  return (
    <div ref={rootRef} style={panel}>
      <style>{KB_STYLE}</style>
      <div style={headerRow}>
        <span style={title}>快捷键</span>
        <button type="button" className="pawpad-kb-reset" onClick={restoreDefaults}>
          恢复默认
        </button>
      </div>

      {DEFS.map((def) => {
        const isRec = recording === def.id;
        const conflict = conflictingIds.has(def.id) ? conflictWith(def.id) : null;
        const caps = splitCombo(shortcuts[def.id]);
        return (
          <div
            key={def.id}
            className={`pawpad-kb-row${isRec ? " is-recording" : ""}${conflict ? " is-conflict" : ""}`}
            title={conflict ? `与「${conflict}」冲突` : undefined}
          >
            <div className="pawpad-kb-info">
              <span className="pawpad-kb-fn">{def.label}</span>
              <span className="pawpad-kb-desc">{def.hint}</span>
            </div>
            <button
              type="button"
              className={`pawpad-kb-key${isRec ? " is-recording" : ""}${conflict ? " is-conflict" : ""}`}
              onClick={() => setRecording(isRec ? null : def.id)}
              title={isRec ? "按一下要绑定的组合键（ESC 取消）" : "点击录制新快捷键"}
            >
              {isRec ? (
                <span className="pawpad-kb-rec-text">按下新键…</span>
              ) : (
                caps.map((part, idx) => (
                  <Fragment key={`${def.id}-${idx}`}>
                    {idx > 0 && <span className="pawpad-kb-plus">+</span>}
                    <span className="pawpad-kb-cap">{part}</span>
                  </Fragment>
                ))
              )}
            </button>
            {conflict && <span style={conflictText}>与「{conflict}」冲突</span>}
          </div>
        );
      })}

      <p style={hint}>点快捷键框 → 按一下组合键自动录入；ESC 取消录制；点击外部收起。</p>
    </div>
  );
}

const panel: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const headerRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 6,
};

const title: CSSProperties = {
  font: '600 13px/1.4 -apple-system, "SF Pro Text", "PingFang SC", sans-serif',
  color: "var(--text-secondary)",
  letterSpacing: "0.3px",
};

/** 冲突说明行（定稿红 var(--danger)；占满一行，避免与键帽抢行） */
const conflictText: CSSProperties = {
  width: "100%",
  font: '11px/1.4 -apple-system, "SF Pro Text", "PingFang SC", sans-serif',
  color: "var(--danger)",
};

const hint: CSSProperties = {
  margin: 0,
  font: '10.5px/1.5 -apple-system, "SF Pro Text", "PingFang SC", sans-serif',
  color: "var(--text-tertiary)",
};
