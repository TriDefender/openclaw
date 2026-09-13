import { afterEach, beforeEach, expect, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../test/helpers/temp-dir.js";
import { closeOpenClawAgentDatabasesForTest } from "../../state/openclaw-agent-db.js";
import { closeOpenClawStateDatabaseForTest } from "../../state/openclaw-state-db.js";
import { createTaskRecord as createTaskRecordOrNull } from "../../tasks/runtime-internal.js";
import type { TaskRecord } from "../../tasks/task-registry.types.js";
import {
  resetTaskRegistryControlRuntimeForTests,
  resetTaskRegistryForTests,
  setTaskRegistryControlRuntimeForTests,
} from "../../tasks/task-runtime.test-helpers.js";
import { captureEnv, setTestEnvValue } from "../../test-utils/env.js";
import { runTaskHandler } from "./tasks.test-helpers.js";

export const mainSessionTaskScope = {
  requesterSessionKey: "agent:main:main",
  ownerKey: "agent:main:main",
  scopeKind: "session",
} as const;

export function useTaskGatewayFixture() {
  const stateDirEnvSnapshot = captureEnv(["OPENCLAW_STATE_DIR"]);
  const cancelSessionMock = vi.fn();
  const tempDirs = useAutoCleanupTempDirTracker((cleanup) =>
    afterEach(() => {
      resetTaskRegistryControlRuntimeForTests();
      resetTaskRegistryForTests();
      stateDirEnvSnapshot.restore();
      closeOpenClawAgentDatabasesForTest();
      closeOpenClawStateDatabaseForTest();
      cleanup();
    }),
  );

  beforeEach(() => {
    setTestEnvValue("OPENCLAW_STATE_DIR", tempDirs.make("openclaw-gateway-tasks-"));
    resetTaskRegistryForTests();
    cancelSessionMock.mockReset();
    setTaskRegistryControlRuntimeForTests({
      cancelActiveCronTaskRun: () => false,
      getAcpSessionManager: () => ({ cancelSession: cancelSessionMock }),
      killSubagentRunAdmin: async () => {
        throw new Error("Unexpected subagent cancellation in task handler fixture");
      },
    });
  });

  return { cancelSessionMock };
}

export function createTaskRecord(params: Parameters<typeof createTaskRecordOrNull>[0]): TaskRecord {
  const task = createTaskRecordOrNull(params);
  if (!task) {
    throw new Error("expected task creation to succeed");
  }
  return task;
}

export async function getTaskPayload(taskId: string) {
  const { calls, payload } = await runTaskHandler("tasks.get", { taskId });
  expect(calls[0]?.[0]).toBe(true);
  expect(payload?.task?.id).toBe(taskId);
  return { calls, payload };
}
