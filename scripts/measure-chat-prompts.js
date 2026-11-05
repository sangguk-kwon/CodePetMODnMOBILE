// Reproducible synthetic byte comparison. No provider calls, user data or token estimates.
const { buildAgentPrompt } = require("../src/chat/chat-prompt");
const { traceInstructions } = require("../src/chat/chat-trace-access");
const agents = [{ id: "claude", name: "Claude" }, { id: "codex", name: "Codex" }];
const entries = agents.map((agent, i) => ({ id: `00000000-0000-4000-8000-00000000000${i}`,
  agentId: agent.id, status: "completed", count: 12, truncated: false }));
for (const agent of agents) {
  const context = { agent, agents, continued: true, permissionMode: "workspace-write",
    messages: [{ id: "fixture-message", authorType: "user", author: "user", text: "앞선 결과를 바탕으로 다음 작업을 진행해줘." }],
    activeAgentIds: ["claude", "codex"], broadcast: { parallel: true } };
  const before = `${buildAgentPrompt(context)}\n${traceInstructions(entries)}`;
  const after = `${buildAgentPrompt({ ...context, compactRules: true })}\n${traceInstructions(entries, { compact: true })}`;
  const fullBytes = Buffer.byteLength(before), compactBytes = Buffer.byteLength(after);
  console.log(JSON.stringify({ provider: agent.id, fullBytes, compactBytes,
    savedBytes: fullBytes - compactBytes, reductionPercent: Number((100 * (fullBytes - compactBytes) / fullBytes).toFixed(1)) }));
}
