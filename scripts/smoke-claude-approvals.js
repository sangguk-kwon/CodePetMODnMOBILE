// Native installed Claude CLI + loopback-only Anthropic fixture; no subscription
// credentials, real model service, or Claude UI delegation is used.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { randomUUID } = require("node:crypto");
const { runClaudeApprovalTurn } = require("../src/chat/claude-approval-runner");
const { buildAgentInvocation } = require("../src/chat/chat-argv");
const { createLineParser } = require("../src/chat/chat-events");
const { evaluateApproval, defaults } = require("../src/chat/tool-settings");
const output = path.resolve("artifacts", "claude-approval-smoke", String(Date.now()));
fs.mkdirSync(output, { recursive: true });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "codepet-claude-approval-"));
const report = { root, output, fixtureProvider: true, turns: [], requests: [], progress: [], publicMessages: [] };
function respond(res, content, stop) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  const send = data => res.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
  send({ type: "message_start", message: { id: `msg_${randomUUID()}`, type: "message", role: "assistant", model: "claude-fixture",
    content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } });
  const blocks = content.type === "tool_use" ? [{ type: "text", text: "Checking the fixture before running the tool." }, content] : [content];
  blocks.forEach((block, index) => {
    send({ type: "content_block_start", index, content_block: block.type === "tool_use" ? { ...block, input: {} } : { type: "text", text: "" } });
    send({ type: "content_block_delta", index, delta: block.type === "tool_use"
      ? { type: "input_json_delta", partial_json: JSON.stringify(block.input) } : { type: "text_delta", text: block.text } });
    send({ type: "content_block_stop", index });
  });
  send({ type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 1 } });
  send({ type: "message_stop" }); res.end();
}
async function main() {
  const command = process.env.CODEPET_SMOKE_CLAUDE;
  if (!command || !fs.existsSync(command)) throw new Error("Set CODEPET_SMOKE_CLAUDE to the installed native executable.");
  let shellCommand, tool = "Bash", toolInput;
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const part of req) chunks.push(part);
    let body; try { body = JSON.parse(Buffer.concat(chunks)); } catch { res.writeHead(400).end(); return; }
    if (req.url.includes("count_tokens")) { res.writeHead(200, { "Content-Type": "application/json" }).end('{"input_tokens":1}'); return; }
    if (!req.url.startsWith("/v1/messages")) { res.writeHead(404).end(); return; }
    const last = body.messages?.at(-1);
    report.requests.push({ path: req.url, model: body.model, lastRole: last?.role,
      lastTypes: Array.isArray(last?.content) ? last.content.map(part => part.type) : typeof last?.content });
    const hasResult = Array.isArray(last?.content) && last.content.some(part => part.type === "tool_result");
    if (hasResult) respond(res, { type: "text", text: "Local fixture finished." }, "end_turn");
    else respond(res, { type: "tool_use", id: `tool_${randomUUID()}`, name: tool, input: toolInput || { command: shellCommand, description: "CodePet local fixture only" } }, "tool_use");
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    for (const requestedTool of ["Bash", "Write"]) for (const approved of [true, false]) {
      tool = requestedTool;
      const dir = path.join(root, `${tool.toLowerCase()}-${approved ? "accept" : "deny"}`), cwd = path.join(dir, "workspace"), home = path.join(dir, "config");
      fs.mkdirSync(cwd, { recursive: true }); fs.mkdirSync(home);
      const marker = path.join(cwd, "marker.txt");
      shellCommand = `node -e "require('node:fs').writeFileSync('marker.txt','approved')"`;
      toolInput = tool === "Write" ? { file_path: marker, content: "approved" } : null;
      const env = { ...process.env };
      for (const key of Object.keys(env)) if (/^(?:ANTHROPIC_|CLAUDE_|CLAUDECODE$|AWS_|GOOGLE_|BEDROCK_|VERTEX_)/.test(key)) delete env[key];
      Object.assign(env, { CLAUDE_CONFIG_DIR: home, HOME: dir, USERPROFILE: dir, APPDATA: dir, LOCALAPPDATA: dir,
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`, ANTHROPIC_API_KEY: "codepet-local-fixture",
        CLAUDE_CODE_GIT_BASH_PATH: process.env.CODEPET_SMOKE_GIT_BASH || "C:/Program Files/Git/bin/bash.exe",
        DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_AUTOUPDATER: "1" });
      const invocation = buildAgentInvocation({ provider: { id: "claude", status: "cli", catalogStatus: "ready",
        modelOptions: [{ id: "claude-fixture" }], permissions: { "workspace-write": { supported: true } } },
        permissionMode: "workspace-write", workspace: cwd, chatCwd: cwd, model: "claude-fixture" });
      assert.equal(invocation.ok, true);
      let cliSessionId, target, detail;
      let decisions = 0;
      const base = { commandPath: command, env, cwd, argv: invocation.argv, timeoutMs: 45_000, initializeTimeoutMs: 15_000,
        prompt: "Run the local fixture tool once and finish.", parseLine: createLineParser("claude", null, id => { cliSessionId = id; }, null,
          event => report.progress.push(event), event => report.publicMessages.push(event)) };
      const result = await runClaudeApprovalTurn({ ...base, requestApproval: async approval => {
        target = approval.target; detail = approval.detail; decisions++; return approved;
      } }).promise;
      report.turns.push({ approved, result, decisions, target, detail, marker: fs.existsSync(marker), session: cliSessionId });
      assert.equal(result.ok, true, result.error);
      assert.equal(decisions, 1); assert.equal(fs.existsSync(marker), approved);
      assert.equal(result.appliedPermissions?.approval, "default");
      if (fs.existsSync(marker)) fs.unlinkSync(marker);
      const policy = { ...defaults(), rules: [{ id: "fixture-rule", kind: tool === "Bash" ? "command" : "file", effect: approved ? "allow" : "deny", match: tool === "Bash" ? target.command : marker }] };
      let ruleDecisions = 0;
      let resumedId;
      const continued = await runClaudeApprovalTurn({ ...base, argv: [...base.argv, "--resume", cliSessionId],
        parseLine: createLineParser("claude", null, id => { resumedId = id; }), requestApproval: async approval => {
          const matched = evaluateApproval(policy, approval.target, cwd);
          report.ruleTarget = approval.target;
          assert.equal(matched?.effect, approved ? "allow" : "deny"); ruleDecisions++; return matched.effect === "allow";
        } }).promise;
      report.turns.push({ rule: approved ? "allow" : "deny", result: continued, decisions: ruleDecisions, marker: fs.existsSync(marker), resumedId });
      assert.equal(continued.ok, true, continued.error); assert.equal(ruleDecisions, 1); assert.equal(fs.existsSync(marker), approved);
      assert.equal(resumedId, cliSessionId);
    }
    assert.ok(report.progress.some(event => event.state === "running"));
    assert.ok(report.progress.some(event => event.state === "completed" || event.state === "failed"));
    assert.ok(report.publicMessages.some(event => event.text === "Checking the fixture before running the tool."));
    assert.ok(report.publicMessages.some(event => event.text === "Local fixture finished."));
    report.ok = true;
    console.log(`PASS native Claude Bash/Write one-call allow/deny, rules and resume via local fixture: ${output}`);
  } finally {
    server.closeAllConnections(); server.close();
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
