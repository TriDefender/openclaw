import { readSessionWorkspaceRecoveryRequiredError } from "../../../packages/gateway-protocol/src/index.js";
import type { SidebarSessionMutationScope } from "./app-sidebar-session-types.ts";
import {
  requireSessionMutationAccess,
  sessionRowAgentId,
  type SessionActionHost,
  type SessionActionRow,
} from "./session-organizer-batch-mutations.ts";
import {
  confirmContinueSessionOnGateway,
  requestContinueSessionOnGateway,
} from "./session-placement-recovery.runtime.ts";

export async function recoverPendingOfflineDeviceWorkspace(params: {
  error: unknown;
  host: SessionActionHost;
  scope: SidebarSessionMutationScope;
  session: SessionActionRow;
}): Promise<"recovered" | "handled" | "unhandled" | "stale"> {
  const details = readSessionWorkspaceRecoveryRequiredError(params.error);
  if (!details || details.sessionId !== params.session.sessionId) {
    return "unhandled";
  }
  const agentId = sessionRowAgentId(params.session, params.scope);
  const moveParams = {
    key: params.session.key,
    agentId,
    expected: details.source,
    target: { kind: "gateway" as const },
    abandonSource: true,
  };
  if (
    !requireSessionMutationAccess(params.host, params.scope, {
      method: "sessions.move",
      params: moveParams,
      requiredScope: "operator.write",
    })
  ) {
    return "handled";
  }
  const confirmed = await confirmContinueSessionOnGateway({
    label: params.session.label,
    signal: params.scope.signal,
  });
  if (!params.host.sessionData.isSessionMutationScopeCurrent(params.scope)) {
    return "stale";
  }
  if (!confirmed) {
    params.host.sessionData.publishSessionMutationError(params.scope, params.error);
    return "handled";
  }
  try {
    await requestContinueSessionOnGateway({
      client: params.scope.client,
      key: params.session.key,
      agentId,
      expected: details.source,
    });
    if (!params.host.sessionData.isSessionMutationScopeCurrent(params.scope)) {
      return "stale";
    }
    await params.scope.sessions.refreshReplacement(agentId);
    return params.host.sessionData.isSessionMutationScopeCurrent(params.scope)
      ? "recovered"
      : "stale";
  } catch (error) {
    if (params.host.sessionData.isSessionMutationScopeCurrent(params.scope)) {
      params.host.sessionData.publishSessionMutationError(params.scope, error);
    }
    return "handled";
  }
}
