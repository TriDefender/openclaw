import { describe, expect, it } from "vitest";
import type { WorkerSessionPlacementRecord } from "../worker-environments/placement-record.js";
import type { WorkerWorkspacePendingResult } from "../worker-environments/placement-workspace-result.js";
import { resolveSessionLifecycleWorkspaceRecoveryError } from "./sessions-lifecycle-recovery.js";
import type { GatewayRequestContext } from "./types.js";

const sessionId = "session-1";
const placement: WorkerSessionPlacementRecord = {
  sessionId,
  sessionKey: "agent:main:session-1",
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
    claimId: "claim-1",
    runId: "run-1",
    generation: 5,
    ownerEpoch: 70,
  },
  createdAtMs: 1,
  updatedAtMs: 2,
  stateChangedAtMs: 2,
};
const pending: WorkerWorkspacePendingResult = {
  sessionId,
  environmentId: "environment-1",
  ownerEpoch: 70,
  placementGeneration: 5,
  claimId: "claim-1",
  runId: "run-1",
  gatewayInstanceId: "gateway-1",
  recoveryRequestedAtMs: 3,
  workspaceAcceptedAtMs: null,
  stagedResultRef: null,
};

function context(params: {
  pending?: WorkerWorkspacePendingResult;
  runner?: "available" | "offline";
}): GatewayRequestContext {
  return {
    workerSessionPlacementService: {
      getMany: () => new Map([[sessionId, placement]]),
      listPendingWorkspaceResults: () => (params.pending ? [params.pending] : []),
    },
    workerPlacementRunnerAvailabilityReader: {
      read: () => (params.runner ? { kind: "device" as const, status: params.runner } : undefined),
      version: () => 1,
    },
  } as unknown as GatewayRequestContext;
}

describe("session lifecycle workspace recovery diagnosis", () => {
  it.each([
    ["available runner", { pending, runner: "available" as const }],
    ["unknown runner", { pending }],
    [
      "stale pending owner",
      { pending: { ...pending, ownerEpoch: 69 }, runner: "offline" as const },
    ],
  ])("does not route %s to destructive recovery", (_name, params) => {
    expect(
      resolveSessionLifecycleWorkspaceRecoveryError({
        context: context(params),
        sessionId,
        sessionKey: placement.sessionKey,
      }),
    ).toBeUndefined();
  });
});
