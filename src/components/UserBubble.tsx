/** T9：用户消息气泡（D16 规格 1，样式落 app.css .user-bubble） */

interface UserBubbleProps {
  text: string;
}

export default function UserBubble({ text }: UserBubbleProps) {
  return <div className="user-bubble">{text}</div>;
}
