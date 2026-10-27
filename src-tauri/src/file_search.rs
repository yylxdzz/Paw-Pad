//! 模块 2（2.1）：文件搜索（输入框 @ 补全的 Rust 后端）。
//!
//! 目标：非原生 open dialog——输入框打 @ 触发补全列表，实时过滤。
//! 约束（不可商量）：
//! - 范围：~/Desktop + ~/Documents + ~/Downloads（SEARCH_ROOTS）
//! - 匹配：glob（含 * ? 元字符时）+ fuzzy（子序列）双模式
//! - 深度 3-4 层（MAX_DEPTH 取 4）
//! - 忽略 node_modules / .git / .cache（另跳过隐藏条目降噪）
//! - 限 20 条（MAX_RESULTS）；按需搜索、不建索引、无后台驻留
//!
//! 命中的文件由前端读字节后统一走模块 2.4 的 upload 链路
//! （POST /api/console/upload → url → file_url / image_url content part）。

use serde::Serialize;
use std::path::Path;
use tauri::AppHandle;
use tauri::Manager;

/// 搜索深度上限：约束「深度 3-4 层」，取 4。
const MAX_DEPTH: usize = 4;

/// 结果条数上限：约束「限 20 条」。
const MAX_RESULTS: usize = 20;

/// 遍历软上限：命中/访问数达到即停止，兜底控制扫描成本（目录超大时）。
const SCAN_LIMIT: usize = 2000;

/// 搜索根目录（相对 home 目录）。
const SEARCH_ROOTS: [&str; 3] = ["Desktop", "Documents", "Downloads"];

/// 强制忽略的目录名。
const IGNORED_DIRS: [&str; 3] = ["node_modules", ".git", ".cache"];

/// 单条搜索结果（与前端 useFileSearch.ts 的 FileEntry 对齐）。
#[derive(Serialize, Clone, Debug)]
pub struct FileEntry {
    /// 绝对路径（前端读字节 / upload 用）
    pub path: String,
    /// 文件名（含扩展名；chip 展示与匹配用）
    pub name: String,
    /// 字节数（目录恒 0）
    pub size: u64,
    /// 是否目录
    pub is_dir: bool,
    /// 匹配得分（越大越靠前；glob 命中固定高分）
    pub score: u32,
}

/// 模块 2（2.1）：@ 补全搜索命令。query 为空直接返回空列表。
#[tauri::command]
pub fn search_files(app: AppHandle, query: String) -> Vec<FileEntry> {
    let q = query.trim();
    if q.is_empty() {
        return Vec::new();
    }
    let home = match app.path().home_dir() {
        Ok(dir) => dir,
        Err(_) => return Vec::new(),
    };
    let mut matches: Vec<FileEntry> = Vec::new();
    let mut visited: usize = 0;
    for root in SEARCH_ROOTS {
        walk_dir(&home.join(root), 0, q, &mut matches, &mut visited);
    }
    // 按匹配质量排序后截断到 20 条
    matches.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.name.cmp(&b.name)));
    matches.truncate(MAX_RESULTS);
    matches
}

/// 递归遍历目录：深度限制 + 忽略名单 + 命中收集（软上限 SCAN_LIMIT）。
fn walk_dir(dir: &Path, depth: usize, query: &str, out: &mut Vec<FileEntry>, visited: &mut usize) {
    if depth > MAX_DEPTH || out.len() >= SCAN_LIMIT || *visited >= SCAN_LIMIT {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return, // 无权限 / 不存在：静默跳过
    };
    for entry in entries.flatten() {
        *visited += 1;
        if *visited >= SCAN_LIMIT {
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        // 忽略名单（node_modules/.git/.cache）
        if IGNORED_DIRS.contains(&name.as_str()) {
            continue;
        }
        // 隐藏条目降噪（.DS_Store 等；.git/.cache 已被上面的名单覆盖）
        if name.starts_with('.') {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        let is_dir = meta.is_dir();
        if let Some(score) = match_score(&name, query) {
            out.push(FileEntry {
                path: entry.path().to_string_lossy().to_string(),
                name,
                size: if is_dir { 0 } else { meta.len() },
                is_dir,
                score,
            });
            if out.len() >= SCAN_LIMIT {
                break;
            }
        }
        if is_dir {
            walk_dir(&entry.path(), depth + 1, query, out, visited);
        }
    }
}

/// glob + fuzzy 双模式匹配，返回得分（None = 不匹配）。
///
/// - query 含 glob 元字符（`*` / `?`）→ glob 匹配（大小写不敏感），命中给 1000 基础分
/// - 否则 → fuzzy 子序列匹配（`fuzzy_score`）
fn match_score(name: &str, query: &str) -> Option<u32> {
    let name_l = name.to_lowercase();
    let q = query.to_lowercase();
    if q.contains('*') || q.contains('?') {
        return if glob_match(&q, &name_l) { Some(1000) } else { None };
    }
    fuzzy_score(&q, &name_l)
}

/// glob 匹配：支持 `*`（任意串，含空）与 `?`（单字符）。
fn glob_match(pattern: &str, text: &str) -> bool {
    let p: Vec<char> = pattern.chars().collect();
    let t: Vec<char> = text.chars().collect();
    glob_rec(&p, 0, &t, 0)
}

/// glob 递归核心（`*` 回溯所有可能切分点；query 短，成本可控）。
fn glob_rec(p: &[char], mut pi: usize, t: &[char], mut ti: usize) -> bool {
    while pi < p.len() {
        match p[pi] {
            '*' => {
                while pi < p.len() && p[pi] == '*' {
                    pi += 1; // 连续 * 折叠为一个
                }
                if pi == p.len() {
                    return true; // 尾部 *：匹配任意剩余
                }
                for k in ti..=t.len() {
                    if glob_rec(p, pi, t, k) {
                        return true;
                    }
                }
                return false;
            }
            '?' => {
                if ti >= t.len() {
                    return false;
                }
                pi += 1;
                ti += 1;
            }
            c => {
                if ti >= t.len() || t[ti] != c {
                    return false;
                }
                pi += 1;
                ti += 1;
            }
        }
    }
    ti == t.len()
}

/// fuzzy 子序列匹配得分：query 字符按序出现在 name 中即可命中。
/// 基础分 10/字；相邻连续命中 +8；词首（开头或 `_-./ @` 之后）命中 +12。
fn fuzzy_score(query: &str, name: &str) -> Option<u32> {
    if query.is_empty() {
        return Some(1);
    }
    let q: Vec<char> = query.chars().collect();
    let n: Vec<char> = name.chars().collect();
    let mut score: u32 = 0;
    let mut ni = 0usize;
    let mut prev_at: Option<usize> = None;
    for &qc in &q {
        let mut found: Option<usize> = None;
        while ni < n.len() {
            if n[ni] == qc {
                found = Some(ni);
                break;
            }
            ni += 1;
        }
        let at = found?; // 子序列断裂 → 不匹配
        score += 10;
        if at > 0 && prev_at == Some(at - 1) {
            score += 8; // 连续命中
        }
        if at == 0 || is_boundary(n[at - 1]) {
            score += 12; // 词首命中
        }
        prev_at = Some(at);
        ni = at + 1;
    }
    Some(score)
}

/// 词边界字符（文件名里常见分词符）。
fn is_boundary(c: char) -> bool {
    matches!(c, '_' | '-' | '.' | ' ' | '/' | '@')
}
