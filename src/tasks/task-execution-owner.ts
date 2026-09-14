import { hostname } from "node:os";
import { buildAgentRunTerminalOutcome } from "../agents/agent-run-terminal-outcome.js";
import { AGENT_RUN_RESTART_ABORT_STOP_REASON } from "../agents/run-termination.js";
import { getFileLockProcessStartTime, isPidDefinitelyDead } from "../shared/pid-alive.js";
import { mapAgentRunTerminalOutcomeToTaskStatus } from "./task-registry-common.js";
import { applyTaskRecordPatch } from "./task-registry-records.js";
import type { TaskExecutionOwner, TaskRecord } from "./task-registry.types.js";

export function captureTaskExecutionOwner(pid = process.pid): TaskExecutionOwner | undefined {
  const startIdentity = getFileLockProcessStartTime(pid);
  return Number.isSafeInteger(pid) && pid > 0 && startIdentity !== null
    ? { host: hostname(), pid, startIdentity }
    : undefined;
}

function isTaskExecutionOwnerDead(owner: TaskExecutionOwner): boolean {
  if (owner.host !== hostname()) {
    return false;
  }
  if (isPidDefinitelyDead(owner.pid)) {
    return true;
  }
  const startIdentity = getFileLockProcessStartTime(owner.pid);
  return startIdentity !== null && startIdentity !== owner.startIdentity;
}

export function settleOrphanedTaskAtRestore(task: TaskRecord, now: number): TaskRecord {
  if (
    task.status !== "running" ||
    task.endedAt !== undefined ||
    !task.executionOwner ||
    !isTaskExecutionOwnerDead(task.executionOwner)
  ) {
    return task;
  }
  const reason = "Task execution process exited before restart.";
  const outcome = buildAgentRunTerminalOutcome({
    status: "error",
    stopReason: AGENT_RUN_RESTART_ABORT_STOP_REASON,
    error: task.error ?? reason,
    startedAt: task.startedAt,
    endedAt: now,
  });
  return applyTaskRecordPatch(task, {
    status: mapAgentRunTerminalOutcomeToTaskStatus(outcome),
    endedAt: now,
    lastEventAt: now,
    error: outcome.error,
    terminalSummary: reason,
    terminalOutcome: undefined,
  });
}
