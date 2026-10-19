import { message } from "antd";

// Tell the user when shadow-SKU lines were moved to the new SKU
export function showShadowMessages(messages) {
  if (messages?.length) message.info({ content: messages.join("\n"), duration: 8, style: { whiteSpace: "pre-line" } });
}
