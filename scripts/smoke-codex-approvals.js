// Actual installed Codex + a loopback-only Responses fixture. No real account/model calls.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { randomUUID } = require("node:crypto");
const { runCodexApprovalTurn } = require("../src/chat/codex-approval-runner");
const { createLineParser } = require("../src/chat/chat-events");
const { resolveCodexCommand, CodexLiveRpc } = require("../src/live/codex-live-rpc");
const { ToolSettingsStore, settingsCapabilities, evaluateApproval, defaults } = require("../src/chat/tool-settings");

const root = path.resolve("artifacts", "codex-approval-smoke", String(Date.now()));
fs.mkdirSync(root, { recursive: true });
const report = { root, fixtureProvider: true, approvals: [], turns: [], progress: [], publicMessages: [] };
function sendResponse(res, output) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  const event = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  event("response.created", { response: { id: "response-fixture", status: "in_progress", output: [] } });
  const outputs = output.type !== "message" ? [{ type: "message", id: "report-fixture", role: "assistant", phase: "commentary", content: [{ type: "output_text", text: "Checking the fixture before running the tool.", annotations: [] }] }, output] : [output];
  outputs.forEach((item, index) => {
    event("response.output_item.added", { output_index: index, item });
    if (item.type === "message") event("response.output_text.delta", { output_index: index, content_index: 0, item_id: item.id, delta: item.content[0].text });
    event("response.output_item.done", { output_index: index, item });
  });
  event("response.completed", { response: { id: "response-fixture", status: "completed", output: outputs, usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } } });
  res.end();
}
async function main() {
  const command = process.env.CODEPET_SMOKE_CODEX ? { command: process.env.CODEPET_SMOKE_CODEX, needsShell: false } : await resolveCodexCommand();
  let first = true, destination, resumeBase, resumedThread;
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    let body; try { body = JSON.parse(Buffer.concat(chunks)); } catch { res.writeHead(400).end(); return; }
    if (first) {
      first = false;
      const tools = [...(body.tools || []), ...(body.input || []).filter(item => item.type === "additional_tools").flatMap(item => item.tools || [])]
        .flatMap(tool => tool.type === "namespace" ? tool.tools : [tool]);
      const tool = tools.find(tool => ["exec_command", "shell_command", "shell", "exec"].includes(tool.name));
      if (!tool) { report.toolNames = tools.map(tool => tool.name); res.writeHead(500).end("No shell tool"); return; }
      report.selectedTool = { name: tool.name, type: tool.type };
      const cmd = `Set-Content -LiteralPath '${destination.replaceAll("'", "''")}' -Value 'approved'`;
      const args = tool.name === "exec_command" ? { cmd, sandbox_permissions: "require_escalated", justification: "CodePet local approval smoke" }
        : tool.name === "shell_command" ? { command: cmd, sandbox_permissions: "require_escalated", justification: "CodePet local approval smoke" }
          : { command: ["powershell.exe", "-NoProfile", "-Command", cmd], sandbox_permissions: "require_escalated", justification: "CodePet local approval smoke" };
      const callId = `call-${randomUUID()}`, itemId = `fc-${randomUUID()}`;
      sendResponse(res, tool.name === "exec"
        ? { type: "custom_tool_call", id: itemId, call_id: callId, namespace: "functions", name: "exec",
          input: `text(await tools.exec_command(${JSON.stringify({ cmd, sandbox_permissions: "require_escalated", justification: "CodePet local approval smoke" })}));` }
        : { type: "function_call", id: itemId, call_id: callId, name: tool.name, arguments: JSON.stringify(args) });
    } else {
      report.toolOutputs = (body.input || []).filter(item => /call_output/.test(item.type))
        .map(item => (typeof item.output === "string" ? item.output : JSON.stringify(item.output)).slice(-2000));
      sendResponse(res, { type: "message", id: "answer-fixture", role: "assistant", phase: "final_answer", content: [{ type: "output_text", text: "Local approval fixture finished.", annotations: [] }] });
    }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    for (const approved of [true, false]) {
      let observedTarget, observedThread;
      first = true;
      const dir = path.join(root, approved ? "accept" : "deny"), home = path.join(dir, "home"), cwd = path.join(dir, "workspace");
      fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(cwd, { recursive: true });
      destination = path.join(dir, "outside-workspace-marker.txt");
      const env = { ...process.env };
      for (const key of Object.keys(env)) if (/^(CODEX|OPENAI)_/.test(key)) delete env[key];
      env.CODEX_HOME = home;
      const argv = ["-c", 'model_provider="diagnostic"', "-c",
        `model_providers.diagnostic={name="Local fixture",base_url="http://127.0.0.1:${server.address().port}/v1",wire_api="responses",requires_openai_auth=false}`];
      const base = { commandPath: command.command, needsShell: command.needsShell, env, cwd, argv,
        model: "gpt-6.1-sol", timeoutMs: 45000 };
      const run = runCodexApprovalTurn({ ...base,
        rpcFactory: options => {
          const rpc = new CodexLiveRpc(options), request = rpc.request.bind(rpc);
          rpc.request = async (method, params, timeout) => {
            const result = await request(method, params, timeout);
            if (method.startsWith("thread/")) report.threadPolicy = { cwd: result.cwd, sandbox: result.sandbox, approvalPolicy: result.approvalPolicy, approvalsReviewer: result.approvalsReviewer };
            return result;
          };
          return rpc;
        },
        prompt: "Local fixture test", model: "gpt-6.1-sol", timeoutMs: 45000,
        parseLine: createLineParser("codex", null, id => { observedThread = id; if (approved) resumedThread = id; }, null,
          event => report.progress.push(event), event => report.publicMessages.push(event)), requestApproval: async approval => {
          observedTarget = approval.target;
          report.approvals.push({ approved, summary: approval.summary });
          return approved;
        } });
      const result = await run.promise;
      report.turns.push({ approved, result, markerExists: fs.existsSync(destination) });
      if (approved) { assert.equal(result.ok, true, result.error); resumeBase = base; }
      else assert.ok(result.ok || result.status === "denied", result.error);
      assert.equal(fs.existsSync(destination), approved);
      assert.equal(result.appliedPermissions.approval, "on-request");
      if (process.env.CODEPET_SMOKE_RULES === "1") {
        const settingsStore = new ToolSettingsStore({ root: dir, readOnly: false });
        const key = settingsStore.key({ providerId: "codex", accountKey: "fixture", sourceHome: home, workspace: cwd });
        const initial = settingsStore.get(key);
        settingsStore.save(key, { ...defaults(), rules: [{ id: "native-exact-command", kind: "command",
          effect: approved ? "allow" : "deny", match: observedTarget.command }] }, initial.revision,
        settingsCapabilities({ providerId: "codex", permissionMode: "workspace-write", workspace: cwd }));
        if (fs.existsSync(destination)) fs.unlinkSync(destination);
        first = true;
        let decisions = 0;
        // A declined native turn may leave cancelled tool continuations in its
        // thread. Test persisted deny rules in a fresh thread; resume is tested
        // independently below using the successfully completed thread.
        const ruled = await runCodexApprovalTurn({ ...base, cliSessionId: approved ? observedThread : undefined, prompt: "Repeat local rule fixture",
          parseLine: createLineParser("codex"), requestApproval: async approval => {
            const decision = evaluateApproval(new ToolSettingsStore({ root: dir }).get(key).settings, approval.target, cwd);
            assert.equal(decision?.effect, approved ? "allow" : "deny", "real CLI target must match persisted exact rule");
            decisions++;
            return decision.effect === "allow";
          } }).promise;
        assert.equal(decisions, 1);
        assert.equal(fs.existsSync(destination), approved);
        assert.ok(ruled.ok || !approved && ruled.status === "denied", ruled.error);
        report.turns.push({ persistedRule: approved ? "allow" : "deny", result: ruled, markerExists: fs.existsSync(destination) });
        report.rulesVerified = true;
      }
    }
    const continued = await runCodexApprovalTurn({ ...resumeBase, cliSessionId: resumedThread, prompt: "Resume local fixture",
      parseLine: createLineParser("codex", null, id => assert.equal(id, resumedThread)),
      requestApproval: async () => { throw new Error("Unexpected resume approval"); } }).promise;
    assert.equal(continued.ok, true, continued.error);
    report.resumed = true;
    assert.equal(report.approvals.length, 2);
    if (process.env.CODEPET_SMOKE_RESTRICTED_AUTO === "1") {
      first = true;
      destination = path.join(path.dirname(resumeBase.cwd), "restricted-auto-outside-marker.txt");
      const automatic = await runCodexApprovalTurn({ ...resumeBase, autoApprove: true,
        prompt: "Local restricted automatic fixture", parseLine: createLineParser("codex"),
        requestApproval: async () => { throw new Error("Restricted auto must not open an approval dialog"); } }).promise;
      report.restrictedAuto = { result: automatic, markerExists: fs.existsSync(destination), toolOutputs: report.toolOutputs };
      assert.equal(automatic.ok, true, automatic.error);
      assert.equal(automatic.appliedPermissions.approval, "never");
      assert.equal(automatic.appliedPermissions.sandbox, "workspaceWrite");
      assert.equal(fs.existsSync(destination), false, "restricted auto must not execute escalated tools");
      assert.match(JSON.stringify(report.toolOutputs), /never|not allowed|reject|escalat|denied/i);
    }
    assert.ok(report.progress.some(event => event.state === "running"));
    assert.ok(report.progress.some(event => ["completed", "denied", "failed"].includes(event.state)));
    assert.ok(report.publicMessages.some(event => event.phase === "commentary" && event.text === "Checking the fixture before running the tool."));
    assert.ok(report.publicMessages.some(event => event.phase === "final_answer" && event.text === "Local approval fixture finished."));
    report.ok = true;
    console.log(`PASS actual Codex accept/decline using local fixture; report: ${root}`);
  } finally {
    server.closeAllConnections(); server.close();
    fs.writeFileSync(path.join(root, "report.json"), JSON.stringify(report, null, 2));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
