/**
 * 模块 2（2.2）：文件 chip（展示在输入框上方）。
 *
 * 约束（不可商量）：
 * - 图标 + 文件名 + ×删除；不用缩略图
 * - 统一所有来源：@ 搜索 / 主窗拖拽 / ⌘V 粘贴 / 浮球投放——
 *   四者最终都落到 App 持有的同一个 attachments 数组（均经模块 2.4
 *   统一 upload 链路 POST /api/console/upload），chip 只负责展示与删除。
 *
 * 自包含样式（inline style）：chip 无独立 CSS 文件，避免扩散到 app.css。
 */

import type { CSSProperties } from "react";

/** 附件状态（App 持有的统一 chip 数据；与 lib/upload.ts 的 UploadResult 衔接）。 */
export interface AttachedFile {
  /** 唯一 id（chip key / 删除用） */
  id: string;
  /** 展示文件名 */
  name: string;
  /** 上传成功后的可访问 url（后端返回） */
  url?: string;
  /** 是否图片（决定 image_url / file_url content part） */
  isImage?: boolean;
  /** 上传中 */
  uploading?: boolean;
  /** 上传失败 */
  failed?: boolean;
}

/** 扩展名 → 图标（不用缩略图，只用图标）。 */
const EXT_ICONS: Array<[RegExp, string]> = [
  [/\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|avif|tiff?)$/i, "🖼️"],
  [/\.pdf$/i, "📕"],
  [/\.(zip|tar|gz|bz2|xz|7z|rar)$/i, "🗜️"],
  [/\.(mp3|wav|aac|flac|m4a)$/i, "🎵"],
  [/\.(mp4|mov|mkv|avi|webm)$/i, "🎬"],
  [/\.(ts|tsx|js|jsx|py|rs|go|java|c|cc|cpp|h|json|ya?ml|toml|md|txt|csv|sh)$/i, "📄"],
];

/** 按文件名取图标（默认回退 📎）。 */
export function fileIcon(name: string): string {
  for (const [re, icon] of EXT_ICONS) {
    if (re.test(name)) return icon;
  }
  return "📎";
}

export interface FileChipProps {
  /** 附件数据 */
  file: AttachedFile;
  /** 点击 × 删除（传 id 由上层从统一数组移除） */
  onRemove: (id: string) => void;
}

export default function FileChip({ file, onRemove }: FileChipProps) {
  const chipStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 6px 3px 8px",
    borderRadius: 10,
    border: file.failed ? "1px solid var(--chip-danger-border)" : "1px solid var(--chip-border)",
    background: file.failed ? "var(--chip-danger-bg)" : "var(--chip-bg)",
    /* chip 是浅色 pill，文字显式用深色变量（不继承 body 默认色） */
    color: "var(--chip-text)",
    fontSize: 12,
    lineHeight: 1.4,
    maxWidth: 240,
  };
  const nameStyle: CSSProperties = {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
  const removeStyle: CSSProperties = {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    padding: "0 2px",
    fontSize: 13,
    lineHeight: 1,
    color: "var(--chip-remove)",
  };

  return (
    <span className="file-chip" data-state={file.failed ? "failed" : file.uploading ? "uploading" : "ready"} style={chipStyle}>
      <span aria-hidden>{fileIcon(file.name)}</span>
      <span className="file-chip__name" style={nameStyle} title={file.name}>
        {file.name}
      </span>
      {file.uploading && <em style={{ fontStyle: "normal", color: "var(--chip-remove)" }}>上传中</em>}
      {file.failed && <em style={{ fontStyle: "normal", color: "var(--chip-danger-text)" }}>失败</em>}
      <button
        type="button"
        className="file-chip__remove"
        aria-label={`移除 ${file.name}`}
        title="移除"
        style={removeStyle}
        onClick={() => onRemove(file.id)}
      >
        ×
      </button>
    </span>
  );
}
