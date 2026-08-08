export const MAX_INTERNAL_MESSAGE_BYTES = 1_500_000;

export function assertTrustedMessage(message, sender, extensionId) {
  if (typeof extensionId !== "string" || !extensionId || sender?.id !== extensionId) {
    throw new TypeError("OriginMatrix rejects messages from untrusted senders.");
  }
  if (!message || typeof message !== "object" || Array.isArray(message) || typeof message.type !== "string") {
    throw new TypeError("Invalid internal message.");
  }
  let serialized;
  try { serialized = JSON.stringify(message); }
  catch { throw new TypeError("Internal messages must be serializable."); }
  if (new TextEncoder().encode(serialized).length > MAX_INTERNAL_MESSAGE_BYTES) {
    throw new TypeError("Internal message exceeds the size limit.");
  }
  return message;
}
