/**
 * 模块 2（2.4）：统一 upload 链路——所有文件来源的唯一入口。
 *
 * 链路（不可商量）：
 *   POST /api/console/upload（multipart，字段 file）
 *     → 响应 { url, file_name, size }
 *     → url 生成 content part：图片 { type: "image", image_url } / 其他 { type: "file", file_url }
 *     → 发送时填入 chat input 数组（sse.ts → api.sendChatMessage）
 *
 * 三个入口（@ 搜索 / 主窗拖拽 / ⌘V 粘贴）与浮球投放（模块 1.6）都经本模块，
 * 不各写一套 upload。
 *
 * API 形状经 localhost:8088 实测（2026-10-21）：
 *   curl -X POST .../api/console/upload -F "file=@x.txt"
 *   → {"url":"/…/media/<hash>_x.txt","file_name":"x.txt","size":14}   HTTP 200
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { readFile } from "@tauri-apps/plugin-fs";

import { getApiBase } from "./connection";
import { getCurrentAgentId } from "./session";
import type { ChatContentPart } from "./api";

/** 上传接口路径（POST，multipart）。 */
export const UPLOAD_PATH = "/api/console/upload";

/** 图片扩展名（决定 image_url / file_url 分流）。 */
const IMAGE_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic", "heif", "avif", "tiff", "tif",
]);

/** 上传结果。 */
export interface UploadResult {
  /** 后端返回的可访问地址 */
  url: string;
  /** 后端规范后的文件名 */
  fileName: string;
  /** 字节数 */
  size: number;
  /** 是否图片（content part 分流用） */
  isImage: boolean;
}

/**
 * 上传输入：
 * - 拖拽 / 粘贴：直接传 `file`（File 对象，字节现成）
 * - @ 搜索 / 浮球投放：传 `path`（本地绝对路径，内部读字节）
 */
export interface UploadInput {
  /** 展示用文件名 */
  name: string;
  /** File 对象（拖拽 / 粘贴来源） */
  file?: File;
  /** 本地绝对路径（@ 搜索 / 浮球投放来源） */
  path?: string;
}

/** 按文件名判断是否图片（分流 image_url / file_url）。 */
export function isImageName(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS.has(ext);
}

/**
 * url → chat input content part（2.4：图片走 image_url，其他走 file_url）。
 * 形状对齐 types.ts 的 SSEContentEvent type 枚举（image / file）。
 */
export function toContentPart(url: string, isImage: boolean): ChatContentPart {
  return isImage ? { type: "image", image_url: url } : { type: "file", file_url: url };
}

/**
 * 统一上传：所有来源走同一 API。
 *
 * 2026-10-23 排查结论（运行验证 A5：截图 chip 显示「失败」）：
 * - 请求构造本身正确——字段名 `file`、multipart 由 FormData 自动带
 *   content-type + boundary，与 QwenPaw Console 自身上传实现（console
 *   dist：`new FormData(); append("file", file); fetch(..., {body: form})`）
 *   一致；对 localhost:8088 实测 POST /api/console/upload 返回
 *   `{"url":…,"file_name":…,"size":…}` HTTP 200。
 * - 真正的根因在 readFile：capability 只授了 `fs:allow-read-file` 却没配
 *   `fs:scope`，fs 插件 scope 为空 → tauri 的 Scope::is_allowed 对任何路径
 *   返回 false → 截图/@ 搜索/浮球投放这些「传 path」的来源全部 readFile
 *   抛错 → chip 落 failed。已修：src-tauri/capabilities/default.json 补
 *   `fs:scope`（$TEMP + $HOME）。
 *
 * @throws upload 失败 / 响应无 url 时抛出（调用方落 failed chip）
 */
export async function uploadFile(input: UploadInput): Promise<UploadResult> {
  let file = input.file;
  if (!file) {
    if (!input.path) throw new Error("uploadFile: 需要 file 或 path 之一");
    // @ 搜索 / 浮球投放：路径 → 字节（fs 插件，能力同模块 1.6）
    const bytes = await readFile(input.path);
    file = new File([bytes], input.name);
  }
  const form = new FormData();
  form.append("file", file, input.name);
  const res = await tauriFetch(`${getApiBase()}${UPLOAD_PATH}`, {
    method: "POST",
    headers: { "X-Agent-Id": getCurrentAgentId() ?? "default" },
    body: form,
  });
  if (!res.ok) {
    // 带响应体片段：便于区分 400（图片损坏/超限）/404（路径错）/403（agent 错）
    const detail = await res.text().catch(() => "");
    throw new Error(
      `upload 失败：HTTP ${res.status}${detail ? ` ${detail.slice(0, 200)}` : ""}`,
    );
  }
  const data = (await res.json()) as { url?: string; file_name?: string; size?: number };
  if (!data.url) throw new Error("upload 响应无 url");
  return {
    url: data.url,
    fileName: data.file_name ?? input.name,
    size: data.size ?? file.size,
    isImage: isImageName(input.name),
  };
}
