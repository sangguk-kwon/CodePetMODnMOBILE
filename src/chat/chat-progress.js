const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { writeJsonAtomic } = require("./chat-store");
const CATEGORIES = ["read", "search", "edit", "command", "test", "web", "tool", "thinking", "waiting", "response"];
const STATES = ["running", "completed", "failed", "denied", "cancelled", "unknown"];
const MAX_RUNS = 40, MAX_ROWS = 80;
function category(tool) {
  const value = typeof tool === "string" ? ({ Read: "read", read_file: "read", Grep: "search", Glob: "search", grep: "search", list_dir: "search",
    Write: "edit", Edit: "edit", NotebookEdit: "edit", write_file: "edit", edit_file: "edit", Bash: "command", shell: "command",
    WebSearch: "web", WebFetch: "web", web_search: "web" })[tool] : null;
  return typeof value === "string" ? value : "tool";
}
function testCommand(command) {
  return typeof command === "string" && command.length < 300
    && /^(?:npm(?:\.cmd)? test|pnpm test|yarn test|node --test|pytest|python -m pytest|cargo test|go test)(?: [\w./:=+-]+)*$/.test(command.trim());
}
// Select lifecycle fields only. No prompt, command arguments, paths, tool output,
// arbitrary tool names or reasoning text enter progress IPC/storage.
function progressEvents(provider, raw) {
  if (!raw || typeof raw !== "object") return [];
  const id = value => typeof value === "string" && value.length <= 512
    ? createHash("sha256").update(JSON.stringify([raw.parent_tool_use_id || null, value])).digest("hex") : null;
  const entry = (key, cat, state, exitCode) => ({ key: id(key), category: cat, state,
    ...(Number.isSafeInteger(exitCode) ? { exitCode } : {}) });
  if (["claude", "grok"].includes(provider)) {
    const start = raw.type === "stream_event" && raw.event?.type === "content_block_start" ? raw.event.content_block : null;
    if (start?.type === "thinking") return [entry(null, "thinking", "running")];
    if (start?.type === "tool_use") return [entry(start.id, category(start.name), "running")];
    const blocks = raw.message?.content;
    if (["assistant", "user"].includes(raw.type) && Array.isArray(blocks)) return blocks.flatMap(block => {
      if (block?.type === "tool_use") return [entry(block.id, category(block.name), "running")];
      if (block?.type === "tool_result") return [entry(block.tool_use_id, "tool", block.is_error ? "failed" : "completed")];
      return [];
    });
  }
  if (provider === "codex") {
    const item = raw.item;
    if (item && ["item.started", "item.completed"].includes(raw.type)) {
      const cat = typeof item.type === "string" ? { command_execution: testCommand(item.command) ? "test" : "command", file_change: "edit", mcp_tool_call: "tool", web_search: "web", reasoning: "thinking" }[item.type] : null;
      if (!CATEGORIES.includes(cat)) return [];
      if (raw.type === "item.started") return [entry(item.id, cat, "running")];
      const state = item.status === "declined" ? "denied" : item.status === "failed" || item.error ? "failed"
        : item.status === "interrupted" ? "cancelled" : Number.isSafeInteger(item.exit_code) ? item.exit_code === 0 ? "completed" : "failed"
          : item.status === "completed" || item.type === "mcp_tool_call" && item.result ? "completed" : "unknown";
      return [entry(item.id, cat, state, item.exit_code)];
    }
    const msg = raw.msg;
    if (["exec_command_begin", "exec_command_end"].includes(msg?.type)) return [entry(msg.call_id, "command",
      msg.type.endsWith("begin") ? "running" : Number.isSafeInteger(msg.exit_code) ? msg.exit_code === 0 ? "completed" : "failed" : "unknown", msg.exit_code)];
  }
  if (provider === "agy" && raw.event === "step_update" && raw.step_update?.tool_name) {
    const step = raw.step_update;
    return [entry(step.id, "tool", step.state === "ERROR" ? "failed" : step.state === "SUCCESS" ? "completed" : "running")];
  }
  return [];
}

function sanitize(value) {
  if (!value || !/^[\w-]{1,150}$/.test(value.runId || "") || !/^[\w-]{1,80}$/.test(value.agentId || "")
    || !STATES.includes(value.state) || !Array.isArray(value.rows) || value.rows.length > MAX_ROWS) throw Error("Invalid progress snapshot");
  const number = n => Number.isSafeInteger(n) && n >= 0 ? n : 0;
  return { runId: value.runId, agentId: value.agentId, state: value.state, sequence: number(value.sequence),
    startedAt: number(value.startedAt), updatedAt: number(value.updatedAt), omitted: number(value.omitted),
    rows: value.rows.map(row => {
      if (!CATEGORIES.includes(row.category) || !STATES.includes(row.state)) throw Error("Invalid progress row");
      return { id: number(row.id), category: row.category, state: row.state, at: number(row.at), updatedAt: number(row.updatedAt), count: Math.min(999999, number(row.count) || 1),
        ...(Number.isSafeInteger(row.exitCode) ? { exitCode: row.exitCode } : {}) };
    }) };
}

class ProgressHistory {
  constructor(store, emit) { this.store = store; this.emit = emit; this.sessions = new Map(); this.timers = new Map(); }
  load(sessionId) {
    if (this.sessions.has(sessionId)) return this.sessions.get(sessionId);
    const runs = new Map();
    try {
      const file = path.join(this.store.sessionDir(sessionId), "progress.json");
      if (fs.statSync(file).size > 2 * 1024 * 1024) throw Error("size");
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (data.version !== 1 || !Array.isArray(data.runs) || data.runs.length > MAX_RUNS) throw Error("schema");
      for (const entry of data.runs) {
        const snapshot = sanitize(entry);
        if (snapshot.state === "running") { snapshot.state = "unknown"; snapshot.sequence++; }
        for (const row of snapshot.rows) if (row.state === "running") row.state = "unknown";
        runs.set(snapshot.runId, { ...snapshot, keys: new Map() });
      }
    } catch { /* Missing/corrupt optional history must never fabricate success or stop a run. */ }
    if (this.sessions.size >= 64) {
      const idle = [...this.sessions].find(([, list]) => ![...list.values()].some(run => run.state === "running"));
      if (idle) this.sessions.delete(idle[0]);
      else return runs; // Progress has a bounded budget even if >64 rooms run concurrently.
    }
    this.sessions.set(sessionId, runs); return runs;
  }
  list(sessionId) { return [...this.load(sessionId).values()].map(sanitize); }
  save(sessionId) {
    try {
      if (this.store.readOnly || !this.store.hasSession(sessionId)) return;
      writeJsonAtomic(path.join(this.store.sessionDir(sessionId), "progress.json"), { version: 1, runs: this.list(sessionId) });
    } catch { /* Optional progress history cannot change the execution result. */ }
  }
  publish(sessionId, run, immediate = false) {
    const key = `${sessionId}:${run.runId}`;
    if (immediate) { clearTimeout(this.timers.get(key)); this.timers.delete(key); }
    else if (this.timers.has(key)) return;
    const send = () => {
      this.timers.delete(key);
      if (!this.store.hasSession(sessionId)) return;
      this.emit({ sessionId, agentId: run.agentId, runId: run.runId, kind: "progress", progress: sanitize(run) });
      if (immediate || Date.now() - (run.savedAt || 0) > 1000) { run.savedAt = Date.now(); this.save(sessionId); }
    };
    if (immediate) send();
    else { const timer = setTimeout(send, 150); timer.unref?.(); this.timers.set(key, timer); }
  }
  start(sessionId, runId, agentId) {
    const runs = this.load(sessionId);
    if (runs.has(runId)) return;
    if (runs.size >= MAX_RUNS) {
      const old = [...runs].find(([, run]) => run.state !== "running");
      if (!old) return;
      runs.delete(old[0]);
    }
    const now = Date.now();
    const run = { runId, agentId, state: "running", sequence: 1, startedAt: now, updatedAt: now, rows: [], keys: new Map(), omitted: 0 };
    runs.set(runId, run); this.publish(sessionId, run, true);
  }
  update(sessionId, runId, event) {
    const run = this.load(sessionId).get(runId);
    if (!run || run.state !== "running" || !CATEGORIES.includes(event.category) || !STATES.includes(event.state)) return;
    const key = /^[a-f0-9]{64}$/.test(event.key || "") ? event.key : null;
    let row = key ? run.keys.get(key) : null;
    if (row && row.state !== "running") return; // duplicate/late starts cannot reopen a completed call
    if (row && event.state === "running") return;
    const now = Date.now();
    const last = run.rows.at(-1);
    if (!key && last?.anonymous && last.category === event.category && last.state === event.state
      && last.exitCode === event.exitCode && now - last.updatedAt < 500) {
      last.count = Math.min(999999, (last.count || 1) + 1); last.updatedAt = now;
      run.sequence++; run.updatedAt = now; this.publish(sessionId, run); return;
    }
    if (!row) {
      row = { id: run.sequence + 1, category: event.category, state: event.state, at: now, updatedAt: now, count: 1, anonymous: !key };
      if (run.rows.length >= MAX_ROWS) { const old = run.rows.shift(); for (const [id, entry] of run.keys) if (entry === old) run.keys.delete(id); run.omitted++; }
      run.rows.push(row);
      if (key) run.keys.set(key, row);
    } else { row.state = event.state; row.updatedAt = now; }
    if (Number.isSafeInteger(event.exitCode)) row.exitCode = event.exitCode;
    run.sequence++; run.updatedAt = now; this.publish(sessionId, run);
  }
  finish(sessionId, runId, state) {
    const run = this.load(sessionId).get(runId);
    if (!run || run.state !== "running") return;
    run.state = state; run.sequence++; run.updatedAt = Date.now();
    for (const row of run.rows) if (row.state === "running") row.state = state === "cancelled" ? "cancelled" : "unknown";
    this.publish(sessionId, run, true);
  }
  cancelMissing(sessionId, agents) {
    for (const run of this.load(sessionId).values()) if (run.state === "running" && !agents.includes(run.agentId)) this.finish(sessionId, run.runId, "cancelled");
  }
  close() { for (const timer of this.timers.values()) clearTimeout(timer); this.timers.clear(); for (const id of this.sessions.keys()) this.save(id); }
}
module.exports = { progressEvents, ProgressHistory, sanitize, testCommand, MAX_ROWS, MAX_RUNS };
