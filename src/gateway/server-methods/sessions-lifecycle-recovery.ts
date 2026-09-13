import {
  ErrorCodes,
  GatewayErrorDetailCodes,
  errorShape,
  type ErrorShape,
  type SessionWorkspaceRecoveryRequiredErrorDetails,
} from "../../../packages/gateway-protocol/src/index.js";
import { isCurrentWorkerWorkspacePendingResultOwner } from "../worker-environments/placement-workspace-result.js";
import type { GatewayRequestContext } from "./types.js";

export class SessionLifecycleWorkspaceRecoveryError extends Error {
  constructor(readonly error: ErrorShape) {
    super(error.message);
  }
}

/** Diagnose only an exact retained result whose paired-device owner is currently offline. */
export function resolveSessionLifecycleWorkspaceRecoveryError(params: {
  context: GatewayRequestContext;
  sessionId?: string;
  sessionKey: string;
}): ErrorShape | undefined {
  const { context, sessionId, sessionKey } = params;
  const placements = context.workerSessionPlacementService;
  if (!sessionId || !placements?.listPendingWorkspaceResults) {
    return undefined;
  }
  const placement = placements.getMany([sessionId]).get(sessionId);
  const pending = placements
    .listPendingWorkspaceResults()
    .find((candidate) => candidate.sessionId === sessionId);
  if (!pending || !isCurrentWorkerWorkspacePendingResultOwner(placement, pending)) {
    return undefined;
  }
  const runner = placement
    ? context.workerPlacementRunnerAvailabilityReader?.read(placement)
    : undefined;
  if (runner?.kind !== "device" || runner.status !== "offline") {
    return undefined;
  }
  const details: SessionWorkspaceRecoveryRequiredErrorDetails = {
    code: GatewayErrorDetailCodes.SESSION_WORKSPACE_RECOVERY_REQUIRED,
    cause: "device_offline",
    recoveryAction: "continue_on_gateway",
    sessionId,
    source: {
      generation: placement.generation,
      environmentId: placement.environmentId,
      ownerEpoch: placement.activeOwnerEpoch,
    },
  };
  return errorShape(
    ErrorCodes.UNAVAILABLE,
    `Session ${sessionKey} has an unrecovered workspace result on an offline device. Reconnect the device to preserve its workspace, or use Continue on Gateway and accept that unsynced files may be lost.`,
    { details, retryable: false },
  );
}
