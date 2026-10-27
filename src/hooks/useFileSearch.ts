/**
 * 模块 2（2.1）：@ 文件搜索补全 hook（前端侧）。
 *
 * 约束：
 * - 200ms debounce（SEARCH_DEBOUNCE_MS）——防每键一次 IPC
 * - 限 20 条（MAX_SEARCH_RESULTS）——后端 file_search.rs 已截断，前端再兜一层
 * - 调 Rust 命令 search_files（glob + fuzzy，按需搜索不建索引）
 * - 过期响应丢弃（seq 递增）：快速输入时只认最后一次 debounce 的结果
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** 单条文件搜索结果（与 file_search.rs 的 FileEntry 字段对齐）。 */
export interface FileEntry {
  /** 绝对路径（前端读字节 / upload 用） */
  path: string;
  /** 文件名（含扩展名） */
  name: string;
  /** 字节数（目录恒 0） */
  size: number;
  /** 是否目录 */
  is_dir: boolean;
  /** 匹配得分（越大越靠前） */
  score: number;
}

/** 2.1 约束：200ms debounce。 */
export const SEARCH_DEBOUNCE_MS = 200;

/** 2.1 约束：最多 20 条结果。 */
export const MAX_SEARCH_RESULTS = 20;

export interface UseFileSearchResult {
  /** 当前结果（已限 20 条） */
  results: FileEntry[];
  /** 是否正在搜索（debounce 等待 / IPC 在途） */
  searching: boolean;
  /** 输入变化即调用（内部 debounce 200ms） */
  search: (query: string) => void;
  /** 关闭补全（选中 / Esc / 失焦） */
  clear: () => void;
}

export function useFileSearch(): UseFileSearchResult {
  const [results, setResults] = useState<FileEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  // 卸载时清掉在途 debounce
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const search = useCallback((query: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = query.trim();
    if (!q) {
      seqRef.current += 1; // 让在途响应失效
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timerRef.current = setTimeout(() => {
      const seq = ++seqRef.current;
      invoke<FileEntry[]>("search_files", { query: q })
        .then((found) => {
          if (seq !== seqRef.current) return;
          setResults(found.slice(0, MAX_SEARCH_RESULTS));
        })
        .catch(() => {
          if (seq !== seqRef.current) return;
          setResults([]);
        })
        .finally(() => {
          if (seq === seqRef.current) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    seqRef.current += 1;
    setResults([]);
    setSearching(false);
  }, []);

  return { results, searching, search, clear };
}
