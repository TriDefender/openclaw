import type { SessionMoveExpectedSource } from "../../../packages/gateway-protocol/src/index.js";
import type { GatewayBrowserClient } from "../api/gateway.ts";
import { t } from "../i18n/index.ts";
import { registerSessionPlacementEnglish } from "../i18n/locales/en-session-placement.ts";
import { showConfirmDialog } from "./confirm-dialog.ts";

registerSessionPlacementEnglish();

export async function confirmContinueSessionOnGateway(params: {
  label: string;
  signal?: AbortSignal;
}): Promise<boolean> {
  return await showConfirmDialog({
    message: t("sessionsView.continueOnGatewayConfirm", { session: params.label }),
    confirmLabel: t("sessionsView.continueOnGatewayAction"),
    danger: true,
    signal: params.signal,
  });
}

export async function requestContinueSessionOnGateway(params: {
  agentId?: string;
  client: GatewayBrowserClient;
  expected: SessionMoveExpectedSource;
  key: string;
}): Promise<void> {
  await params.client.request("sessions.move", {
    key: params.key,
    ...(params.agentId ? { agentId: params.agentId } : {}),
    expected: params.expected,
    target: { kind: "gateway" },
    abandonSource: true,
  });
}
