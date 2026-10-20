/**
 * T9：agent 答案块（D16 规格 2）。
 * Markdown 由 T8 的 renderMarkdown 渲染（代码块自动成引用式）；
 * streaming=true 时答案末尾带闪烁光标（生成中）。
 */

import { renderMarkdown } from "../lib/markdown";

interface AssistantBlockProps {
  text: string;
  /** 生成中：末尾显示闪烁光标 */
  streaming?: boolean;
}

export default function AssistantBlock({ text, streaming = false }: AssistantBlockProps) {
  return (
    <div className="assistant-block">
      {renderMarkdown(text)}
      {streaming && <span className="stream-cursor" aria-hidden />}
    </div>
  );
}
