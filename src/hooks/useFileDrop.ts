/**
 * 模块 2（2.3）：主窗口拖拽 + ⌘V 粘贴（hook）。
 *
 * 约束（不可商量）：
 * - 主窗口 tauri.conf.json 已设 `dragDropEnabled: false`——关闭 wry 原生
 *   拖放拦截（否则 WebView 会导航到被拖入的文件），让 HTML5 drag 事件直达前端；
 * - dragenter / dragover / drop 一律 preventDefault（阻止 WebView 导航）；
 * - 拖入时返回 isDragOver，由上层渲染「投放给 agent」覆盖层；
 * - ⌘V / Ctrl+V 粘贴：clipboard 内的图片 / 文件 → 交给上层转 chip
 *   （纯文本粘贴不受影响，不拦截）。
 */

import { useEffect, useRef, useState } from "react";

export interface FileDropHandlers {
  /** 拖入 / 粘贴产生的文件（File 对象，字节可直接进 FormData 走 2.4 upload） */
  onFiles: (files: File[]) => void;
}

export interface UseFileDropResult {
  /** 是否有文件正被拖到窗口上（驱动覆盖层） */
  isDragOver: boolean;
}

export function useFileDrop({ onFiles }: FileDropHandlers): UseFileDropResult {
  const [isDragOver, setIsDragOver] = useState(false);
  // dragenter/dragleave 按元素进出会多次触发，用深度计数判断真正离开窗口
  const depthRef = useRef(0);
  // 保持最新回调：挂载一次，避免 onFiles 变化导致重复 add/removeEventListener
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  useEffect(() => {
    const hasFiles = (e: DragEvent): boolean =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return; // 拖的是文本/选区，不弹覆盖层
      e.preventDefault();
      depthRef.current += 1;
      setIsDragOver(true);
    };
    // 必须 preventDefault，否则 WebView 不接收后续 drop（并会导航到被拖入的文件）
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDragLeave = () => {
      depthRef.current = Math.max(0, depthRef.current - 1);
      if (depthRef.current === 0) setIsDragOver(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault(); // 阻止 WebView 导航
      depthRef.current = 0;
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) onFilesRef.current(files);
    };
    // 2.3：⌘V 粘贴（只拦带文件的粘贴；纯文本粘贴照常进输入框）
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length === 0) return;
      e.preventDefault();
      onFilesRef.current(files);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      document.removeEventListener("paste", onPaste);
    };
  }, []);

  return { isDragOver };
}
