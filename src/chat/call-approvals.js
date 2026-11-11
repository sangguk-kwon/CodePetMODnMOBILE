const { randomUUID } = require("node:crypto");

// Approval grants belong to one live request, never to a restarted turn.
class CallApprovals {
  constructor({ emit, timeoutMs = 5 * 60_000 }) {
    this.emit = emit;
    this.timeoutMs = timeoutMs;
    this.pending = new Map();
  }

  list(sessionId) {
    return [...this.pending.values()].filter(entry => entry.public.sessionId === sessionId).map(entry => entry.public);
  }

  request({ sessionId, agentId, runId, summary, detail, signal, isCurrent = () => true, conversationLabel, onConversation }) {
    if (signal?.aborted || !isCurrent()) return Promise.resolve(false);
    return new Promise(resolve => {
      const approvalId = randomUUID();
      const publicEntry = { sessionId, agentId, runId, approvalId, summary, detail,
        ...(typeof onConversation === "function" ? { conversationLabel } : {}),
        retryScope: "call", expiresAt: Date.now() + this.timeoutMs };
      const finish = (approved, reason) => {
        if (!this.pending.delete(approvalId)) return;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        this.emit("resolved", { sessionId, approvalId, runId, reason });
        resolve(approved);
      };
      const abort = () => finish(false, "cancelled");
      const timer = setTimeout(() => finish(false, "expired"), this.timeoutMs);
      timer.unref?.();
      this.pending.set(approvalId, { public: publicEntry, isCurrent, finish, onConversation });
      signal?.addEventListener("abort", abort, { once: true });
      this.emit("request", publicEntry);
    });
  }

  respond(sessionId, approvalId, decision) {
    if (!["approve", "approve-conversation", "deny"].includes(decision)) return false;
    const entry = this.pending.get(approvalId);
    if (!entry || entry.public.sessionId !== sessionId) return false;
    if (!entry.isCurrent()) { entry.finish(false, "settings-changed"); return false; }
    if (decision === "approve-conversation") {
      if (typeof entry.onConversation !== "function") return false;
      entry.onConversation(); // Persist before allowing execution; a write failure leaves the request pending.
    }
    entry.finish(decision !== "deny", decision !== "deny" ? "approved" : "denied");
    return true;
  }

  close() {
    for (const entry of this.pending.values()) entry.finish(false, "cancelled");
  }
}

module.exports = { CallApprovals };
