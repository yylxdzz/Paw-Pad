//! 模块 6（6.3/6.4）：日志系统 + 日志导出。
//!
//! 设计（plan 模块 6）：
//! - 三级：ERROR / WARN / INFO
//! - 按日轮转：每天一个文件 QwenPaw-YYYY-MM-DD.log（本地时区）
//! - 保留最近 7 天（KEEP_DAYS）：每次写盘顺手清理过期文件
//! - 路径：~/Library/Logs/QwenPaw轻量助手/（macOS 标准日志目录）
//! - 前端 UI 事件（SSE 消费 / 用户操作）经 `log_frontend` 命令写入
//!   同一日志文件；Rust 侧记原生事件（启动 / panic / 窗口）。
//!
//! 隐私红线（plan 6.3）：只记元数据（模块 / 事件 / 错误摘要），
//! 绝不记录对话内容 / token / 密码。

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use chrono::{Duration, Local, NaiveDate};

/// 日志目录名：~/Library/Logs/QwenPaw轻量助手/
const LOG_DIR_NAME: &str = "QwenPaw轻量助手";
/// 日志文件前缀：QwenPaw-2026-10-21.log
const LOG_FILE_PREFIX: &str = "QwenPaw";
/// 保留天数（6.3）：最近 7 天
const KEEP_DAYS: i64 = 7;

/// 写盘序列化锁（多命令并发 + 前端并发写）
static WRITE_LOCK: Mutex<()> = Mutex::new(());

/// 日志级别（三级：ERROR / WARN / INFO）
#[derive(Clone, Copy)]
pub enum LogLevel {
    Error,
    Warn,
    Info,
}

impl LogLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            LogLevel::Error => "ERROR",
            LogLevel::Warn => "WARN",
            LogLevel::Info => "INFO",
        }
    }

    /// 前端传入的字符串 → 级别（未知值按 INFO 收）
    pub fn parse(s: &str) -> LogLevel {
        match s.trim().to_ascii_uppercase().as_str() {
            "ERROR" => LogLevel::Error,
            "WARN" => LogLevel::Warn,
            _ => LogLevel::Info,
        }
    }
}

/// 日志目录：~/Library/Logs/QwenPaw轻量助手/
pub fn log_dir() -> PathBuf {
    match std::env::var("HOME") {
        Ok(home) => PathBuf::from(home).join("Library/Logs").join(LOG_DIR_NAME),
        Err(_) => PathBuf::from("Library/Logs").join(LOG_DIR_NAME),
    }
}

/// 今天的日期（本地时区，用于按日轮转）
fn today() -> NaiveDate {
    Local::now().date_naive()
}

/// 某天的日志文件：{dir}/QwenPaw-YYYY-MM-DD.log
fn daily_file(dir: &Path, date: NaiveDate) -> PathBuf {
    dir.join(format!("{}-{}.log", LOG_FILE_PREFIX, date.format("%Y-%m-%d")))
}

/// 从 QwenPaw-YYYY-MM-DD.log 解析日期（用于 7 天清理 / 导出筛选）
fn date_from_filename(path: &Path) -> Option<NaiveDate> {
    let stem = path.file_stem()?.to_str()?;
    let date_part = stem.strip_prefix(&format!("{}-", LOG_FILE_PREFIX))?;
    NaiveDate::parse_from_str(date_part, "%Y-%m-%d").ok()
}

/// 清理 7 天前的日志文件（按日轮转目录里逐个判文件名日期）。
pub fn prune_old_logs(dir: &Path) {
    let cutoff = today() - Duration::days(KEEP_DAYS);
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("log") {
                continue;
            }
            if let Some(date) = date_from_filename(&path) {
                if date < cutoff {
                    let _ = fs::remove_file(path);
                }
            }
        }
    }
}

/// 写一条日志（追加到今天的文件；目录不存在时创建；写完清理 7 天前）。
/// 隐私红线：message 只允许元数据/错误摘要，禁止对话内容 / token / 密码。
pub fn write_log(level: LogLevel, module: &str, message: &str) {
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let dir = log_dir();
    if fs::create_dir_all(&dir).is_err() {
        return; // 日志目录不可用不阻塞主流程
    }
    let ts = Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let line = format!("[{}] [{}] [{}] {}\n", ts, level.as_str(), module, message);
    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(daily_file(&dir, today()))
    {
        let _ = f.write_all(line.as_bytes());
    }
    prune_old_logs(&dir);
}

/// 便捷写入：INFO / WARN / ERROR
pub fn info(module: &str, message: &str) {
    write_log(LogLevel::Info, module, message);
}

pub fn warn(module: &str, message: &str) {
    write_log(LogLevel::Warn, module, message);
}

pub fn error(module: &str, message: &str) {
    write_log(LogLevel::Error, module, message);
}

/// 初始化：建目录 + 清理过期 + 记启动事件 + 装 panic hook（崩溃落 ERROR）。
pub fn init() {
    let dir = log_dir();
    let _ = fs::create_dir_all(&dir);
    prune_old_logs(&dir);
    info("app", "Paw Pad 启动（logger init）");
    // panic hook：崩溃落 ERROR。注意不能在这里先 lock WRITE_LOCK——
    // write_log 内部会再锁（std Mutex 非重入 → 死锁），直接调 error() 即可。
    std::panic::set_hook(Box::new(|info| {
        error("panic", &info.to_string());
    }));
}

/// 前端日志入口（6.3）：UI 事件（SSE 消费 / 用户操作）统一写同一日志文件。
#[tauri::command]
pub fn log_frontend(level: String, module: String, message: String) {
    write_log(LogLevel::parse(&level), &module, &message);
}

/// 6.4 导出日志：打包最近 7 天日志 → 保存到桌面。
/// 返回导出的 zip 路径（系统 zip 不可用时退化为桌面文件夹路径）。
#[tauri::command]
pub fn export_logs() -> Result<String, String> {
    let dir = log_dir();
    let cutoff = today() - Duration::days(KEEP_DAYS);

    // 收集最近 7 天的日志文件
    let mut files: Vec<PathBuf> = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("log") {
                continue;
            }
            if let Some(date) = date_from_filename(&path) {
                if date >= cutoff {
                    files.push(path);
                }
            }
        }
    }
    files.sort();
    if files.is_empty() {
        return Err("没有可导出的日志（最近 7 天无记录）".to_string());
    }

    // 桌面暂存文件夹（扁平拷贝，zip -j 去掉目录层级）
    let desktop = match std::env::var("HOME") {
        Ok(home) => PathBuf::from(home).join("Desktop"),
        Err(_) => return Err("无法定位桌面目录（HOME 未设置）".to_string()),
    };
    let stamp = Local::now().format("%Y%m%d-%H%M%S");
    let folder = desktop.join(format!("QwenPaw日志-{}", stamp));
    fs::create_dir_all(&folder).map_err(|e| format!("创建桌面文件夹失败：{e}"))?;
    for f in &files {
        if let Some(name) = f.file_name() {
            fs::copy(f, folder.join(name)).map_err(|e| format!("拷贝日志失败：{e}"))?;
        }
    }

    // 打包 zip（系统 zip 命令，-r -j 扁平化）
    let zip = desktop.join(format!("QwenPaw日志-{}.zip", stamp));
    let zipped = Command::new("zip")
        .arg("-r")
        .arg("-q")
        .arg("-j")
        .arg(&zip)
        .arg(&folder)
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    let result = if zipped {
        let _ = fs::remove_dir_all(&folder);
        zip.to_string_lossy().to_string()
    } else {
        // zip 不可用 → 保留文件夹（导出仍算成功）
        folder.to_string_lossy().to_string()
    };
    info("export", &format!("导出日志 {} 个文件 → {}", files.len(), result));
    Ok(result)
}
