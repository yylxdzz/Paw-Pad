/**
 * T11：硬编码 Console 常用命令列表（D14）。
 *
 * 铁律：
 * - 列表与 QwenPaw commands.zh.md 对齐，**不调后端拉取**
 * - App 端不解析命令含义——选中/输入后整条作为消息透传（带 X-Agent-Id + session_id + channel: "console"）
 * - 不自建 Atd 风格命令（plan D14 禁项清单内的命令类型一律不做）
 */

export interface SlashCommand {
  /** 含前导斜杠，如 "/compact" */
  name: string;
  /** 一句话描述（浮层展示） */
  description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "/compact", description: "压缩对话历史，保留关键上下文" },
  { name: "/new", description: "新对话并存档记忆" },
  { name: "/clear", description: "清空当前对话，不存记忆" },
  { name: "/stop", description: "停止当前正在执行的任务" },
  { name: "/model", description: "模型管理与切换" },
  { name: "/checkpoint", description: "创建与管理对话检查点" },
  { name: "/approval", description: "工具审批管理" },
  { name: "/goal", description: "目标循环任务" },
  { name: "/mission", description: "多智能体任务编排" },
  { name: "/proactive", description: "主动提醒管理" },
];

/** 纯函数：是否 slash 命令输入（首字符为 / 且非空） */
export function isSlashCommand(text: string): boolean {
  return text.startsWith("/");
}

/** 纯函数：按输入前缀过滤命令（"/" 或空 query 返回全部，大小写不敏感的前缀匹配） */
export function filterCommands(query: string): SlashCommand[] {
  const q = query.trimStart();
  if (q === "" || q === "/") return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => c.name.toLowerCase().startsWith(q.toLowerCase()));
}
