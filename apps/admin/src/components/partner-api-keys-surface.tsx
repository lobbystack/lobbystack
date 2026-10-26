"use client";

import { offeredPartnerPlatformKeyScopes } from "@lobbystack/shared";
import { ApiKeysSurface, type ApiKeyRecord } from "@/components/live-api-keys-surface";
import { useConsolePartner } from "@/components/partner-shell";
import { requestJson } from "@/lib/request-json";

/**
 * The console's API keys page: the partner's platform keys, which act as the
 * partner on its businesses. Owners and admins make and revoke them, and see
 * each new key once; members see why they can't. The server enforces the same.
 */
export function PartnerApiKeysSurface() {
  const partner = useConsolePartner();
  const partnerId = encodeURIComponent(partner.partnerId);
  return (
    <ApiKeysSurface
      canManage={partner.role === "owner" || partner.role === "admin"}
      layout="page"
      loading={false}
      namespace="partner"
      scopes={offeredPartnerPlatformKeyScopes}
      source={{
        queryKey: ["partner-platform-keys", partner.partnerId],
        list: async () => (await requestJson<{ keys: ApiKeyRecord[] }>(`/api/partner/platform-keys?partnerId=${partnerId}`)).keys,
        create: async (input) => {
          const result = await requestJson<{ key: string; platformKey: ApiKeyRecord }>("/api/partner/platform-keys", { method: "POST", body: JSON.stringify({ partnerId: partner.partnerId, ...input }) });
          return { key: result.key, record: result.platformKey };
        },
        revoke: (key) => requestJson(`/api/partner/platform-keys/${encodeURIComponent(key.id)}?partnerId=${partnerId}`, { method: "DELETE" }),
      }}
    />
  );
}
