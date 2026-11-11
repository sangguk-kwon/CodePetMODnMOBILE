const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { runClaudeApprovalTurn } = require("../src/chat/claude-approval-runner");
const { createLineParser, parseClaudeLine } = require("../src/chat/chat-events");

// A real child speaking the CLI wire protocol, independent of production code.
function fixtureCli() {
  const readline = require("node:readline");
  const o = JSON.parse(process.argv[2]);
  const send = value => process.stdout.write(JSON.stringify(value) + "\n");
  const session = "11111111-2222-4333-8444-555555555555";
  const rl = readline.createInterface({ input: process.stdin });
  rl.on("close", () => process.exit(0));
  const result = (text, extra = {}) => send({ type: "result", subtype: "success", session_id: session, result: text, ...extra });
  rl.on("line", line => {
    const message = JSON.parse(line);
    if (message.type === "control_request") {
      if (o.mode === "timeout") return;
      send({ type: "control_response", response: { subtype: o.mode === "bad-init" ? "error" : "success",
        request_id: message.request_id, error: "init rejected", response: {} } });
    }
    if (message.type === "user") {
      if (o.mode === "no-result") {
        process.stdout.write(JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "partial" } } }) + "\n", () => process.exit(0)); return;
      }
      send({ type: "system", subtype: "init", session_id: session, cwd: o.mode === "bad-cwd" ? require("node:path").dirname(process.cwd()) : process.cwd(),
        permissionMode: o.mode === "missing-policy" ? undefined : o.mode === "bad-policy" ? "bypassPermissions" : "default" });
      if (o.mode === "wrong-session") { result("wrong", { session_id: "22222222-2222-4333-8444-555555555555" }); return; }
      const input = o.input || { command: "echo fixture", description: "fixture" };
      const request = { type: "control_request", request_id: "permission-1", request: { subtype: "can_use_tool",
        tool_name: o.tool || "Bash", tool_use_id: "tool-1", input,
        permission_suggestions: [{ type: "setMode", mode: "bypassPermissions", destination: "session" }] } };
      send(request);
      if (o.mode === "duplicate") send(request);
      if (o.mode === "cancel-request") setTimeout(() => {
        send({ type: "control_cancel_request", request_id: "permission-1" }); result("request cancelled");
      }, 30);
    }
    if (message.type === "control_response") {
      const decision = message.response.response;
      if (o.mode === "tasks" && message.response.request_id === "permission-1") {
        send({ type: "system", subtype: "session_state_changed", state: "running" });
        send({ type: "system", subtype: "task_started", task_id: "task-1", task_type: "local_agent" });
        result("initial result");
        send({ type: "system", subtype: "session_state_changed", state: "idle" });
        setTimeout(() => {
          send({ type: "control_request", request_id: "permission-2", request: { subtype: "can_use_tool",
            tool_name: "Bash", tool_use_id: "tool-2", input: { command: "echo child task" } } });
        }, 50);
      } else if (o.mode === "tasks") {
        send({ type: "system", subtype: "task_notification", task_id: "task-1", status: "completed" });
        result("after task"); send({ type: "system", subtype: "session_state_changed", state: "idle" });
      } else if (o.mode === "api-error") result("fixture API error", { is_error: true });
      else result(JSON.stringify(decision));
    }
  });
}
function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codepet-claude-stdio-unit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const script = path.join(root, "cli.js"); fs.writeFileSync(script, `(${fixtureCli.toString()})()`);
  const requests = [], events = [], traces = [];
  let accept;
  const requestSeen = new Promise(resolve => { accept = resolve; });
  const run = runClaudeApprovalTurn({ commandPath: process.execPath, cwd: root, argv: [script, JSON.stringify(options),
    ...(options.exclude ? ["--disallowedTools", options.exclude] : []), ...(options.resume ? ["--resume", options.resume] : [])],
    prompt: "fixture prompt", initializeTimeoutMs: options.mode === "timeout" ? 100 : 3000, timeoutMs: 5000,
    parseLine: createLineParser("claude", event => traces.push(event)), onEvent: event => events.push(event),
    requestApproval: request => { requests.push(request); accept(request);
      return options.requestApproval ? options.requestApproval(request) : Promise.resolve(options.approved !== false); },
  });
  return { root, run, requests, events, traces, requestSeen };
}

test("native stdio waits for a scoped decision, preserves original input, and never returns permission amendments", async t => {
  let finish;
  const input = { command: "echo sk-fixture-secret", timeout: 123, description: "fixture", dangerouslyDisableSandbox: true };
  const f = fixture(t, { input, mode: "duplicate", requestApproval: () => new Promise(resolve => { finish = resolve; }) });
  const request = await f.requestSeen;
  assert.equal(f.requests.length, 1); assert.match(request.detail, /REDACTED/);
  assert.doesNotMatch(request.detail, /sk-fixture-secret/);
  assert.equal(request.target.command, input.command);
  assert.equal(request.target.additionalPermissions, true); assert.match(request.detail, /샌드박스 해제/);
  finish(true);
  const result = await f.run.promise;
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(JSON.parse(result.text), { behavior: "allow", updatedInput: input });
  assert.equal(result.appliedPermissions.approval, "default");
  assert.ok(!f.traces.some(event => /permission_suggestions/.test(JSON.stringify(event))));
  const long = fixture(t, { input: { command: `echo ${"x".repeat(5000)}` } });
  assert.equal((await long.run.promise).ok, true);
  assert.match(long.requests[0].detail, /일부 생략/);
});

test("deny and unsupported tools do not run or persist permissions; file content stays out of the approval card", async t => {
  const f = fixture(t, { tool: "Write", input: { file_path: path.join(os.tmpdir(), "fixture.txt"), content: "secret-file-body" }, approved: false });
  const result = await f.run.promise;
  assert.equal(result.ok, true); assert.equal(JSON.parse(result.text).behavior, "deny");
  assert.doesNotMatch(f.requests[0].detail, /secret-file-body/);
  const unsupported = fixture(t, { tool: "AskUserQuestion" });
  assert.equal(JSON.parse((await unsupported.run.promise).text).behavior, "deny");
  assert.equal(unsupported.requests.length, 0);
  const excluded = fixture(t, { exclude: "Bash" });
  assert.equal(JSON.parse((await excluded.run.promise).text).behavior, "deny");
  assert.equal(excluded.requests.length, 0);
});

test("CLI request cancellation and user cancellation abort approval waits and ignore late responses", async t => {
  const cancelled = fixture(t, { mode: "cancel-request", requestApproval: request => new Promise(resolve => request.signal.addEventListener("abort", () => resolve(true), { once: true })) });
  const request = await cancelled.requestSeen;
  const result = await cancelled.run.promise;
  assert.equal(request.signal.aborted, true); assert.equal(result.text, "request cancelled");
  const stopped = fixture(t, { requestApproval: request => new Promise(resolve => request.signal.addEventListener("abort", () => resolve(true), { once: true })) });
  const waiting = await stopped.requestSeen; stopped.run.cancel();
  assert.equal(waiting.signal.aborted, true);
  assert.equal((await stopped.run.promise).cancelled, true);
});

test("initialization failure/timeout, mismatched session/policy and missing final result fail closed", async t => {
  for (const mode of ["bad-init", "timeout", "wrong-session", "bad-policy", "missing-policy", "bad-cwd", "no-result"]) {
    const f = fixture(t, { mode });
    const result = await f.run.promise;
    assert.equal(result.ok, false, mode);
    assert.equal(f.requests.length, 0, mode);
  }
  const wrongResume = fixture(t, { resume: "33333333-2222-4333-8444-555555555555" });
  assert.equal((await wrongResume.run.promise).ok, false); assert.equal(wrongResume.requests.length, 0);
});

test("delegated task result does not close the control channel before the final idle result", async t => {
  const f = fixture(t, { mode: "tasks" });
  const result = await f.run.promise;
  assert.equal(result.ok, true, result.error); assert.equal(result.text, "after task");
  assert.equal(f.requests.length, 2, "tracked child work can still request permission after the first result");
});

test("Claude is_error wins over a success subtype, including after a tool approval", async t => {
  assert.equal(parseClaudeLine('', { type: "result", subtype: "success", is_error: true, result: "API error" }).kind, "error");
  const f = fixture(t, { mode: "api-error" });
  const result = await f.run.promise;
  assert.equal(result.ok, false); assert.match(result.error, /fixture API error/);
});
