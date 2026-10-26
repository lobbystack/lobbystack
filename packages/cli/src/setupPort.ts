import type { ApiKnowledgeEntry, ApiKnowledgeSource, BusinessSetupPort } from "@lobbystack/shared";

import type { Client } from "./client";
import { listAll } from "./operations";

/**
 * The setup port lobbystack onboard applies a manifest through: the v1 API,
 * on the business the client names. The manifest's documents are uploaded by
 * onboard itself, which keeps track of them in its state file, so this port
 * has no uploadFile.
 */
export function httpSetupPort(client: Client): BusinessSetupPort {
  const idempotency = (key: string | undefined) => (key ? { idempotencyKey: key } : {});
  return {
    getBusiness: async () => (await client.call("getBusiness")).data,
    updateBusiness: async (changes) => await client.call("updateBusiness", { body: changes }),
    getReceptionist: async () => (await client.call("getReceptionist")).data,
    updateReceptionist: async (changes) => await client.call("updateReceptionist", { body: changes }),
    listServices: async () => (await client.call("listServices", { query: { include_inactive: true } })).data,
    createService: async (service, key) => await client.call("createService", { body: service, ...idempotency(key) }),
    updateService: async (serviceId, changes) => await client.call("updateService", { params: { service_id: serviceId }, body: changes }),
    listRules: async () => (await client.call("listRules")).data,
    createRule: async (rule, key) => await client.call("createRule", { body: rule, ...idempotency(key) }),
    updateRule: async (ruleId, changes) => await client.call("updateRule", { params: { rule_id: ruleId }, body: changes }),
    listKnowledgeEntries: async (type) => await listAll(async (cursor) => await client.call("listKnowledgeEntries", { query: { type, ...(cursor ? { cursor } : {}) } })) as unknown as ApiKnowledgeEntry[],
    createKnowledgeEntry: async (entry, key) => await client.call("createKnowledgeEntry", { body: entry, ...idempotency(key) }),
    updateKnowledgeEntry: async (entryId, changes) => await client.call("updateKnowledgeEntry", { params: { entry_id: entryId }, body: changes }),
    listKnowledgeSources: async (type) => await listAll(async (cursor) => await client.call("listKnowledgeSources", { query: { type, ...(cursor ? { cursor } : {}) } })) as unknown as ApiKnowledgeSource[],
    addWebsite: async (url) => (await client.call("createKnowledgeSource", { body: { type: "website", url } })).data,
  };
}
