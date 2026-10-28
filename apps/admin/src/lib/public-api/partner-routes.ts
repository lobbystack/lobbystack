import { revalidatePath } from "next/cache";

import {
  addPartnerDomainForApi,
  archivePartnerPackageForApi,
  createPartnerDemoForApi,
  createPartnerPackageForApi,
  createPartnerStripeOnboardingLinkForApi,
  createPartnerTeamInvitationForApi,
  createPartnerTemplateForApi,
  createPartnerTierCheckoutForApi,
  deletePartnerBusinessForApi,
  deletePartnerDemoForApi,
  deletePartnerTemplateForApi,
  getPartnerBillingForApi,
  getPartnerBrandForApi,
  getPartnerBusinessBillingForApi,
  getPartnerDemoForApi,
  getPartnerDomainsForApi,
  getPartnerForApi,
  getPartnerStripeForApi,
  getPartnerTeamForApi,
  getPartnerTierCheckoutForApi,
  idempotencyRequestHash,
  listPartnerDemosForApi,
  listPartnerPackagesForApi,
  listPartnerTemplatesForApi,
  PublicApiError,
  publishPartnerDemoForApi,
  releasePartnerBusinessForApi,
  removePartnerDomainForApi,
  removePartnerTeamMemberForApi,
  renamePartnerPackageForApi,
  revokePartnerDemoForApi,
  revokePartnerTeamInvitationForApi,
  rotatePartnerDemoLinkForApi,
  runPartnerIdempotent,
  updatePartnerBrandForApi,
  updatePartnerBusinessBillingForApi,
  updatePartnerPoolOverageForApi,
  updatePartnerTeamMemberForApi,
  type DomainContext,
  type PartnerPlatformKey,
} from "@lobbystack/domain";
import {
  apiPartnerBrandUpdateSchema,
  apiPartnerBusinessBillingUpdateSchema,
  apiPartnerDemoCreateSchema,
  apiPartnerDemoPublishSchema,
  apiPartnerDomainCreateSchema,
  apiPartnerPackageCreateSchema,
  apiPartnerPackageUpdateSchema,
  apiPartnerPoolOverageUpdateSchema,
  apiPartnerStripeOnboardingCreateSchema,
  apiPartnerTeamInvitationCreateSchema,
  apiPartnerTeamMemberUpdateSchema,
  apiPartnerTemplateCreateSchema,
  apiPartnerTierCheckoutCreateSchema,
  type ApiOperationId,
} from "@lobbystack/shared";

import { createDomainContext } from "../domain-context";
import { requirePartnerActionAllowed } from "../partner-limits";
import { partnerSitePages } from "../partner-site";
import { getStorageProvider } from "../storage";
import { withStripeConnect } from "../stripe-connect";
import { data, handleApiRequest, queryParam, readApiBody, uuidParam, type ApiResult, type PlatformHandlerInput } from "./http";

// The v1 Partner endpoints: what the partner console does, for a partner's
// platform keys. Each handler runs the partner operation the console's own
// route runs, with the key as the actor, on the app role's context as the
// console does. The pipeline already refused every key but a partner's.

type Params<T extends string> = { params: Promise<Record<T, string>> };

function partnerKey(credential: PlatformHandlerInput["credential"]): PartnerPlatformKey {
  if (credential.partnerId === undefined) throw new PublicApiError(403, "forbidden", "Only a partner's platform keys can call the Partner endpoints.");
  return credential;
}

/** The app role's context, as the console's partner routes use, with the partner's Stripe client. */
function partnerContext(): DomainContext {
  return withStripeConnect(createDomainContext());
}

function list(items: unknown[]): { data: unknown[]; next_cursor: null; has_more: false } {
  return { data: items, next_cursor: null, has_more: false };
}

/** A partner's keys share one allowance per kind of change that costs the host, as one person's console requests do. */
async function requirePartnerLimit(input: { name: string; partnerId: string; limit: number; what: string }): Promise<void> {
  await requirePartnerActionAllowed({ partnerId: input.partnerId }, input);
}

/** Runs a Partner endpoint once per Idempotency-Key, when the request sends one. */
async function idempotent(input: PlatformHandlerInput & { operation: ApiOperationId; body: unknown; path?: string }, status: number, run: () => Promise<unknown>): Promise<ApiResult> {
  if (!input.idempotencyKey) return { status, body: data(await run()) };
  const key = partnerKey(input.credential);
  const outcome = await runPartnerIdempotent(createDomainContext(), { key, operation: input.operation, idempotencyKey: input.idempotencyKey, requestHash: idempotencyRequestHash(input.body, input.path) }, async () => ({ status, body: data(await run()) }));
  return { status: outcome.response.status, body: outcome.response.body, ...(outcome.replayed ? { headers: { "Idempotent-Replayed": "true" } } : {}) };
}

export const partnerV1 = {
  getPartner: (request: Request) => handleApiRequest(request, "getPartner", async ({ credential }) => ({ body: data(await getPartnerForApi(partnerContext(), partnerKey(credential))) })),

  releasePartnerBusiness: (request: Request, { params }: Params<"business_id">) => handleApiRequest(request, "releasePartnerBusiness", async ({ credential }) => {
    const businessId = uuidParam((await params).business_id, "business_id");
    return { body: data(await releasePartnerBusinessForApi(partnerContext(), partnerKey(credential), businessId)) };
  }),
  deletePartnerBusiness: (request: Request, { params }: Params<"business_id">) => handleApiRequest(request, "deletePartnerBusiness", async ({ credential }) => {
    const businessId = uuidParam((await params).business_id, "business_id");
    return { body: data(await deletePartnerBusinessForApi(partnerContext(), partnerKey(credential), businessId)) };
  }),
  getPartnerBusinessBilling: (request: Request, { params }: Params<"business_id">) => handleApiRequest(request, "getPartnerBusinessBilling", async ({ credential }) => {
    const businessId = uuidParam((await params).business_id, "business_id");
    return { body: data(await getPartnerBusinessBillingForApi(partnerContext(), partnerKey(credential), businessId)) };
  }),
  updatePartnerBusinessBilling: (request: Request, { params }: Params<"business_id">) => handleApiRequest(request, "updatePartnerBusinessBilling", async ({ credential }) => {
    const businessId = uuidParam((await params).business_id, "business_id");
    const body = await readApiBody(request, apiPartnerBusinessBillingUpdateSchema);
    return { body: data(await updatePartnerBusinessBillingForApi(partnerContext(), partnerKey(credential), businessId, body)) };
  }),

  createPartnerDemo: (request: Request) => handleApiRequest(request, "createPartnerDemo", async ({ credential }) => {
    const key = partnerKey(credential);
    const body = await readApiBody(request, apiPartnerDemoCreateSchema);
    // Each demo reads the prospect's website, which the host pays for.
    await requirePartnerLimit({ name: "partner-demo-create", partnerId: key.partnerId, limit: 30, what: "demos" });
    return { body: data(await createPartnerDemoForApi(partnerContext(), key, body)) };
  }),
  listPartnerDemos: (request: Request) => handleApiRequest(request, "listPartnerDemos", async ({ credential }) => ({ body: list(await listPartnerDemosForApi(partnerContext(), partnerKey(credential))) })),
  getPartnerDemo: (request: Request, { params }: Params<"demo_id">) => handleApiRequest(request, "getPartnerDemo", async ({ credential }) => {
    const demoId = uuidParam((await params).demo_id, "demo_id");
    return { body: data(await getPartnerDemoForApi(partnerContext(), partnerKey(credential), demoId)) };
  }),
  publishPartnerDemo: (request: Request, { params }: Params<"demo_id">) => handleApiRequest(request, "publishPartnerDemo", async ({ credential }) => {
    const demoId = uuidParam((await params).demo_id, "demo_id");
    const body = await readApiBody(request, apiPartnerDemoPublishSchema);
    return { body: data(await publishPartnerDemoForApi(partnerContext(), partnerKey(credential), demoId, body)) };
  }),
  rotatePartnerDemoLink: (request: Request, { params }: Params<"demo_id">) => handleApiRequest(request, "rotatePartnerDemoLink", async ({ credential }) => {
    const demoId = uuidParam((await params).demo_id, "demo_id");
    return { body: data(await rotatePartnerDemoLinkForApi(partnerContext(), partnerKey(credential), demoId)) };
  }),
  revokePartnerDemo: (request: Request, { params }: Params<"demo_id">) => handleApiRequest(request, "revokePartnerDemo", async ({ credential }) => {
    const demoId = uuidParam((await params).demo_id, "demo_id");
    return { body: data(await revokePartnerDemoForApi(partnerContext(), partnerKey(credential), demoId)) };
  }),
  deletePartnerDemo: (request: Request, { params }: Params<"demo_id">) => handleApiRequest(request, "deletePartnerDemo", async ({ credential }) => {
    const demoId = uuidParam((await params).demo_id, "demo_id");
    return { body: data(await deletePartnerDemoForApi(partnerContext(), partnerKey(credential), demoId)) };
  }),

  listPartnerPackages: (request: Request) => handleApiRequest(request, "listPartnerPackages", async ({ credential }) => ({ body: list(await listPartnerPackagesForApi(partnerContext(), partnerKey(credential))) })),
  createPartnerPackage: (request: Request) => handleApiRequest(request, "createPartnerPackage", async (input) => {
    const key = partnerKey(input.credential);
    const body = await readApiBody(request, apiPartnerPackageCreateSchema);
    return await idempotent({ ...input, operation: "createPartnerPackage", body }, 201, async () => await createPartnerPackageForApi(partnerContext(), key, body));
  }),
  updatePartnerPackage: (request: Request, { params }: Params<"package_id">) => handleApiRequest(request, "updatePartnerPackage", async ({ credential }) => {
    const packageId = uuidParam((await params).package_id, "package_id");
    const body = await readApiBody(request, apiPartnerPackageUpdateSchema);
    return { body: data(await renamePartnerPackageForApi(partnerContext(), partnerKey(credential), packageId, body.name)) };
  }),
  archivePartnerPackage: (request: Request, { params }: Params<"package_id">) => handleApiRequest(request, "archivePartnerPackage", async ({ credential }) => {
    const packageId = uuidParam((await params).package_id, "package_id");
    return { body: data(await archivePartnerPackageForApi(partnerContext(), partnerKey(credential), packageId)) };
  }),

  getPartnerBrand: (request: Request) => handleApiRequest(request, "getPartnerBrand", async ({ credential }) => ({ body: data(await getPartnerBrandForApi(partnerContext(), partnerKey(credential))) })),
  updatePartnerBrand: (request: Request) => handleApiRequest(request, "updatePartnerBrand", async ({ credential }) => {
    const key = partnerKey(credential);
    const body = await readApiBody(request, apiPartnerBrandUpdateSchema);
    const brand = await updatePartnerBrandForApi(partnerContext(), key, body);
    // This process renders the partner's public pages again on their next visit, as a save in the console does.
    for (const page of partnerSitePages(key.partnerId)) revalidatePath(page);
    return { body: data(brand) };
  }),
  getPartnerDomains: (request: Request) => handleApiRequest(request, "getPartnerDomains", async ({ credential }) => ({ body: data(await getPartnerDomainsForApi(partnerContext(), partnerKey(credential))) })),
  addPartnerDomain: (request: Request) => handleApiRequest(request, "addPartnerDomain", async ({ credential }) => {
    const body = await readApiBody(request, apiPartnerDomainCreateSchema);
    return { body: data(await addPartnerDomainForApi(partnerContext(), partnerKey(credential), body.hostname)) };
  }),
  removePartnerDomain: (request: Request) => handleApiRequest(request, "removePartnerDomain", async ({ credential }) => ({ body: data(await removePartnerDomainForApi(partnerContext(), partnerKey(credential))) })),

  listPartnerTemplates: (request: Request) => handleApiRequest(request, "listPartnerTemplates", async ({ credential }) => ({ body: list(await listPartnerTemplatesForApi(partnerContext(), partnerKey(credential))) })),
  createPartnerTemplate: (request: Request) => handleApiRequest(request, "createPartnerTemplate", async (input) => {
    const key = partnerKey(input.credential);
    const body = await readApiBody(request, apiPartnerTemplateCreateSchema);
    return await idempotent({ ...input, operation: "createPartnerTemplate", body }, 201, async () => {
      // Each template keeps a copy of the business's documents.
      await requirePartnerLimit({ name: "partner-template-save", partnerId: key.partnerId, limit: 30, what: "templates" });
      return await createPartnerTemplateForApi(partnerContext(), key, body, { storage: getStorageProvider() });
    });
  }),
  deletePartnerTemplate: (request: Request, { params }: Params<"template_id">) => handleApiRequest(request, "deletePartnerTemplate", async ({ credential }) => {
    const templateId = uuidParam((await params).template_id, "template_id");
    return { body: data(await deletePartnerTemplateForApi(partnerContext(), partnerKey(credential), templateId)) };
  }),

  getPartnerTeam: (request: Request) => handleApiRequest(request, "getPartnerTeam", async ({ credential }) => ({ body: data(await getPartnerTeamForApi(partnerContext(), partnerKey(credential))) })),
  createPartnerTeamInvitation: (request: Request) => handleApiRequest(request, "createPartnerTeamInvitation", async (input) => {
    const key = partnerKey(input.credential);
    const body = await readApiBody(request, apiPartnerTeamInvitationCreateSchema);
    return await idempotent({ ...input, operation: "createPartnerTeamInvitation", body }, 201, async () => {
      // Each invitation sends an email. A replay sends none, so only a new one counts.
      await requirePartnerLimit({ name: "partner-team-invite", partnerId: key.partnerId, limit: 20, what: "invitations" });
      return await createPartnerTeamInvitationForApi(partnerContext(), key, body);
    });
  }),
  revokePartnerTeamInvitation: (request: Request, { params }: Params<"invitation_id">) => handleApiRequest(request, "revokePartnerTeamInvitation", async ({ credential }) => {
    const invitationId = uuidParam((await params).invitation_id, "invitation_id");
    return { body: data(await revokePartnerTeamInvitationForApi(partnerContext(), partnerKey(credential), invitationId)) };
  }),
  updatePartnerTeamMember: (request: Request, { params }: Params<"member_id">) => handleApiRequest(request, "updatePartnerTeamMember", async ({ credential }) => {
    const memberId = uuidParam((await params).member_id, "member_id");
    const body = await readApiBody(request, apiPartnerTeamMemberUpdateSchema);
    return { body: data(await updatePartnerTeamMemberForApi(partnerContext(), partnerKey(credential), memberId, body.role)) };
  }),
  removePartnerTeamMember: (request: Request, { params }: Params<"member_id">) => handleApiRequest(request, "removePartnerTeamMember", async ({ credential }) => {
    const memberId = uuidParam((await params).member_id, "member_id");
    return { body: data(await removePartnerTeamMemberForApi(partnerContext(), partnerKey(credential), memberId)) };
  }),

  getPartnerStripe: (request: Request) => handleApiRequest(request, "getPartnerStripe", async ({ credential }) => {
    const refresh = queryParam(request, "refresh");
    if (refresh !== undefined && refresh !== "true" && refresh !== "false") throw new PublicApiError(400, "invalid_request", "refresh must be true or false.");
    return { body: data(await getPartnerStripeForApi(partnerContext(), partnerKey(credential), { refresh: refresh === "true" })) };
  }),
  createPartnerStripeOnboardingLink: (request: Request) => handleApiRequest(request, "createPartnerStripeOnboardingLink", async ({ credential }) => {
    const body = await readApiBody(request, apiPartnerStripeOnboardingCreateSchema);
    return { body: data(await createPartnerStripeOnboardingLinkForApi(partnerContext(), partnerKey(credential), body)) };
  }),
  getPartnerBilling: (request: Request) => handleApiRequest(request, "getPartnerBilling", async ({ credential }) => ({ body: data(await getPartnerBillingForApi(partnerContext(), partnerKey(credential))) })),
  updatePartnerPoolOverage: (request: Request) => handleApiRequest(request, "updatePartnerPoolOverage", async ({ credential }) => {
    const body = await readApiBody(request, apiPartnerPoolOverageUpdateSchema);
    return { body: data(await updatePartnerPoolOverageForApi(partnerContext(), partnerKey(credential), body)) };
  }),
  createPartnerTierCheckout: (request: Request) => handleApiRequest(request, "createPartnerTierCheckout", async (input) => {
    const key = partnerKey(input.credential);
    const body = await readApiBody(request, apiPartnerTierCheckoutCreateSchema);
    return await idempotent({ ...input, operation: "createPartnerTierCheckout", body }, 202, async () => await createPartnerTierCheckoutForApi(partnerContext(), key, body));
  }),
  getPartnerTierCheckout: (request: Request, { params }: Params<"checkout_id">) => handleApiRequest(request, "getPartnerTierCheckout", async ({ credential }) => {
    const checkoutId = uuidParam((await params).checkout_id, "checkout_id");
    return { body: data(await getPartnerTierCheckoutForApi(partnerContext(), partnerKey(credential), checkoutId)) };
  }),
};
