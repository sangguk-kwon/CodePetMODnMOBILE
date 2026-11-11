const { createHash } = require("node:crypto");
const { redactSensitiveText } = require("./chat-run-diagnostics");

// Only top-level, user-facing assistant text. Thinking, tool results and child
// agents are not commentary. No model call or prompt instruction is added.
function publicMessages(providerId, emit) {
  const seen = new Set();
  const claudeText = new Map();
  const key = value => createHash("sha256").update(String(value)).digest("hex");
  const start = id => { if (id) emit({ kind: "public-start", messageId: key(id) }); };
  function complete(id, text, phase) {
    if (typeof text !== "string" || !text.trim()) return;
    const fingerprint = key(`${id || ""}\0${text}`);
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    if (seen.size > 256) seen.delete(seen.values().next().value);
    emit({ kind: "public-complete", messageId: key(id || fingerprint),
      text: redactSensitiveText(text.slice(0, 64 * 1024)) + (text.length > 64 * 1024 ? "\n…(중간 메시지 길이 제한)" : ""),
      phase: ["commentary", "final_answer"].includes(phase) ? phase : "unknown" });
  }
  return event => {
    if (!event || event.parent_tool_use_id || event.parentToolCallId) return;
    if (providerId === "claude") {
      if (event.type === "stream_event" && event.event?.type === "message_start") start(event.event.message?.id);
      if (event.type === "assistant" && Array.isArray(event.message?.content)) {
        let text = event.message.content.filter(block => block?.type === "text")
          .map(block => block.text).filter(text => typeof text === "string").join("\n\n");
        const id = event.message.id;
        if (id && text) {
          const previous = claudeText.get(id) || "";
          if (previous && !text.startsWith(previous)) text = previous.endsWith(text) ? previous : `${previous}\n\n${text}`;
          text = text.slice(0, 64 * 1024 + 1);
          claudeText.set(id, text);
          if (claudeText.size > 128) claudeText.delete(claudeText.keys().next().value);
        }
        complete(id, text);
      }
    } else if (providerId === "codex") {
      if (event.item?.type === "agent_message") {
        if (event.type === "item.started") start(event.item.id);
        if (event.type === "item.completed") complete(event.item.id, event.item.text, event.item.phase);
      }
      if (event.msg?.type === "agent_message") complete(event.msg.id, event.msg.message, event.msg.phase);
    }
  };
}

module.exports = { publicMessages };
