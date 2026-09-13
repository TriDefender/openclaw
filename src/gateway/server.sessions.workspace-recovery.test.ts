import { afterEach, expect, test, vi } from "vitest";
import { closeOpenClawStateDatabaseForTest } from "../state/openclaw-state-db.js";
import { loadSessionEntry } from "./session-utils.js";
import { writeSessionStore } from "./test-helpers.js";
import {
  directSessionReq,
  sessionStoreEntry,
  setupGatewaySessionsHandlerTestHarness,
} from "./test/server-sessions.test-helpers.js";
import type { WorkerSessionPlacementRecord } from "./worker-environments/placement-record.js";

const { createSessionStoreDir } = setupGatewaySessionsHandlerTestHarness();

afterEach(() => {
  closeOpenClawStateDatabaseForTest();
});

test("sessions.delete diagnoses an exact pending result on an offline device", async () => {
  await createSessionStoreDir();
  const sessionKey = "agent:main:delete-offline-pending-result";
  const sessionId = "session-delete-offline-pending-result";
  await writeSessionStore({ entries: { [sessionKey]: sessionStoreEntry(sessionId) } });
  const placement: WorkerSessionPlacementRecord = {
    sessionId,
    sessionKey,
    agentId: "main",
    executionMode: "worker-turn",
    state: "active",
    generation: 5,
    environmentId: "environment-1",
    activeOwnerEpoch: 70,
    workspaceBaseManifestRef: "manifest-ref",
    remoteWorkspaceDir: "/workspace",
    workerBundleHash: "bundle-hash",
    lastTranscriptAckCursor: null,
    lastLiveEventAckCursor: null,
    recoveryError: null,
    terminalReason: null,
    terminalAtMs: null,
    turnClaim: {
      owner: "worker",
      claimId: "pending-claim",
      runId: "pending-run",
      generation: 5,
      ownerEpoch: 70,
    },
    createdAtMs: 1,
    updatedAtMs: 2,
    stateChangedAtMs: 2,
  };
  const pending = {
    sessionId,
    environmentId: placement.environmentId,
    ownerEpoch: placement.activeOwnerEpoch,
    placementGeneration: placement.generation,
    claimId: "pending-claim",
    runId: "pending-run",
    gatewayInstanceId: "gateway-1",
    recoveryRequestedAtMs: 1,
    workspaceAcceptedAtMs: null,
    stagedResultRef: null,
  };
  const waitForTurnClaimRelease = vi.fn();
  const reclaim = vi.fn();

  const deleted = await directSessionReq(
    "sessions.delete",
    { key: sessionKey, expectedSessionId: sessionId },
    {
      context: {
        workerSessionPlacementService: {
          getMany: () => new Map([[sessionId, placement]]),
          listPendingWorkspaceResults: () => [pending],
          waitForTurnClaimRelease,
        },
        workerPlacementRunnerAvailabilityReader: {
          read: () => ({ kind: "device", status: "offline" }),
          version: () => 1,
        },
        workerPlacementDispatchService: { dispatch: vi.fn(), reclaim },
      },
    },
  );

  expect(deleted).toMatchObject({
    ok: false,
    error: {
      code: "UNAVAILABLE",
      retryable: false,
      details: {
        code: "SESSION_WORKSPACE_RECOVERY_REQUIRED",
        cause: "device_offline",
        recoveryAction: "continue_on_gateway",
        sessionId,
        source: {
          generation: placement.generation,
          environmentId: placement.environmentId,
          ownerEpoch: placement.activeOwnerEpoch,
        },
      },
    },
  });
  expect(waitForTurnClaimRelease).not.toHaveBeenCalled();
  expect(reclaim).not.toHaveBeenCalled();
  expect(loadSessionEntry(sessionKey).entry?.sessionId).toBe(sessionId);
});
