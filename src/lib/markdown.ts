/**
 * T8：自写最小化 Markdown 渲染器（D18 零依赖，不引任何第三方 MD 库）。
 *
 * 支持范围（写死不扩展）：
 * - 粗体 **text** / 行内代码 `code`（chip）/ 无序 - 列表 / 有序 1. 列表
 * - 链接 [text](url) / 多行代码块 ```lang ... ```（引用式）/ 段落（空行分隔）
 * - 标题 # → 粗体段落；表格/公式/mermaid/HTML → 降级纯文本不报错
 *
 * 架构：
 * - parseMarkdown / parseInlines：纯函数（结构化 Block[]/Inline[]，不依赖 React，node 可测）
 * - renderMarkdown：React 元素树。用 createElement 而非 JSX——保住 plan 指定的 .ts 文件名
 *   （JSX 必须放 .tsx）。T9 接入 AssistantBlock 时按扩展名无关的方式 import。
 *
 * 流式友好（条件 5）：renderMarkdown 是 text 的纯函数，增量追加的文本可整段重入；
 * 本版不做「只追加不重解析」的增量优化（plan 标注为 P1 可选）。
 */

import { createElement, Fragment, type ReactNode } from "react";

/* ================= 结构化类型 ================= */

export type Inline =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; text: string; url: string };

export interface ListItem {
  inlines: Inline[];
}

export type Block =
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "codeblock"; lang: string | null; content: string };

/* ================= 行内解析（纯函数） ================= */

/** 左起优先：`code` 先行（内容字面），再 **bold**，再 [text](url)；未闭合标记按字面量 */
const INLINE_RE = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

export function parseInlines(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) {
      out.push({ type: "text", value: text.slice(last, m.index) });
    }
    if (m[1] !== undefined) {
      out.push({ type: "code", value: m[1] });
    } else if (m[2] !== undefined) {
      out.push({ type: "bold", value: m[2] });
    } else if (m[3] !== undefined && m[4] !== undefined) {
      out.push({ type: "link", text: m[3], url: m[4] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push({ type: "text", value: text.slice(last) });
  }
  return out;
}

/* ================= 链接协议白名单（B2 安全修复，纯函数） ================= */

/**
 * 渲染 <a> 前的协议校验：http/https/mailto 放行（原样返回），
 * 其余（javascript: / data: / 相对路径 / 畸形 URL）返回 null——调用方降级为纯文本。
 * 背景：agent 答案可能含 [text](javascript:...) 注入面；React 转义覆盖文本但不覆盖 href。
 */
export function safeHref(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null; // 相对路径 / 空串 / 畸形 URL
  }
  if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:") {
    return url;
  }
  return null;
}

/* ================= 块级解析（纯函数） ================= */

const UL_RE = /^\s*[-*+]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;
const HEADING_RE = /^\s*#{1,6}\s+(.*)$/;
const FENCE_RE = /^\s*```\s*(\S*)\s*$/;

export function parseMarkdown(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length > 0) {
      blocks.push({ type: "paragraph", lines: para });
      para = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 多行代码块：```lang 起，``` 止；未闭合则吃到文末（降级不崩）
    const fence = FENCE_RE.exec(line);
    if (fence) {
      flushPara();
      const lang = fence[1] || null;
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // 跳过收尾 fence（缺失时已到文末，+1 退出循环）
      blocks.push({ type: "codeblock", lang, content: body.join("\n") });
      continue;
    }

    // 标题 → 粗体段落（复用行内 ** 解析）
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushPara();
      blocks.push({ type: "paragraph", lines: [`**${heading[1].trim()}**`] });
      i++;
      continue;
    }

    // 列表：连续同类项归一个 ListBlock；遇异类/空行/普通行即收
    const isUl = UL_RE.test(line);
    const isOl = !isUl && OL_RE.test(line);
    if (isUl || isOl) {
      flushPara();
      const ordered = isOl;
      const items: ListItem[] = [];
      while (i < lines.length) {
        const mu = ordered ? OL_RE.exec(lines[i]) : UL_RE.exec(lines[i]);
        if (!mu) break;
        items.push({ inlines: parseInlines(mu[1]) });
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // 空行 → 段落分隔
    if (line.trim() === "") {
      flushPara();
      i++;
      continue;
    }

    // 普通行 → 累积段落（连续行属同一段，渲染时软换行）
    para.push(line);
    i++;
  }
  flushPara();
  return blocks;
}

/* ================= 渲染层 ================= */

/** 主入口：text → ReactNode。纯函数，可对增量文本反复整段调用（流式重入） */
export function renderMarkdown(text: string): ReactNode {
  const blocks = parseMarkdown(text);
  return createElement(
    "div",
    { className: "md-root" },
    blocks.map((block, idx) => renderBlock(block, idx)),
  );
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.type) {
    case "paragraph":
      return createElement(
        "p",
        { className: "md-p", key },
        block.lines.map((line, li) => {
          const kids = renderInlines(parseInlines(line), `${key}-${li}`);
          // 段落内多行：行间插 <br>（软换行保留）
          return li === 0
            ? kids
            : [createElement("br", { key: `${key}-${li}-br` }), kids];
        }),
      );
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      return createElement(
        tag,
        { className: block.ordered ? "md-ol" : "md-ul", key },
        block.items.map((item, ii) =>
          createElement(
            "li",
            { className: "md-li", key: ii },
            renderInlines(item.inlines, `${key}-${ii}`),
          ),
        ),
      );
    }
    case "codeblock":
      // 引用式：左竖线 + 等宽 + 无底色无圆角（样式见 app.css .code-block-reference）
      return createElement(
        "pre",
        { className: "code-block-reference", key },
        createElement("code", null, block.content),
      );
  }
}

function renderInlines(inlines: Inline[], keyPrefix: string): ReactNode[] {
  return inlines.map((inline, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (inline.type) {
      case "text":
        // Fragment 包裹保证数组子节点带 key；字符串内容由 React 转义
        return createElement(Fragment, { key }, inline.value);
      case "bold":
        return createElement("strong", { key }, inline.value);
      case "code":
        return createElement("code", { className: "inline-code-chip", key }, inline.value);
      case "link": {
        // B2：协议白名单——不在名单内降级为纯文本，不渲染 <a>
        const href = safeHref(inline.url);
        if (href === null) {
          return createElement(Fragment, { key }, `${inline.text} (${inline.url})`);
        }
        return createElement(
          "a",
          { key, href, target: "_blank", rel: "noreferrer" },
          inline.text,
        );
      }
    }
  });
}
