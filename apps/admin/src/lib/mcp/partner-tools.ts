import type { StandardSchemaWithJSON, ToolAnnotations } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  addPartnerDomainForApi,
  archivePartnerPackageForApi,
  createPartnerBusinessForApi,
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
  isPartnerMemberSubject,
  listPartnerBusinessesForApi,
  listPartnerDemosForApi,
  listPartnerPackagesForApi,
  listPartnerTemplatesForApi,
  publishPartnerDemoForApi,
  releasePartnerBusinessForApi,
  removePartnerDomainForApi,
  removePartnerTeamMemberForApi,
  renamePartnerPackageForApi,
  revokePartnerDemoForApi,
  revokePartnerTeamInvitationForApi,
  rotatePartnerDemoLinkForApi,
  updatePartnerBrandForApi,
  updatePartnerBusinessBillingForApi,
  updatePartnerPoolOverageForApi,
  updatePartnerTeamMemberForApi,
  type DomainContext,
  type PartnerSubject,
  type TemplateStorage,
} from "@lobbystack/domain";
import {
  apiBusinessCreateSchema,
  apiBusinessSchema,
  apiDeletedSchema,
  apiOperations,
  apiPageSchema,
  apiPartnerBillingSchema,
  apiPartnerBrandSchema,
  apiPartnerBrandUpdateSchema,
  apiPartnerBusinessBillingSchema,
  apiPartnerBusinessBillingUpdateSchema,
  apiPartnerBusinessReleasedSchema,
  apiPartnerBusinessSummarySchema,
  apiPartnerDemoCreateSchema,
  apiPartnerDemoCreatedSchema,
  apiPartnerDemoLinkSchema,
  apiPartnerDemoPublishSchema,
  apiPartnerDemoSchema,
  apiPartnerDemoStateSchema,
  apiPartnerDomainCreateSchema,
  apiPartnerDomainsSchema,
  apiPartnerLinkSchema,
  apiPartnerPackageCreateSchema,
  apiPartnerPackageSchema,
  apiPartnerPackageUpdateSchema,
  apiPartnerPoolOverageSchema,
  apiPartnerPoolOverageUpdateSchema,
  apiPartnerSchema,
  apiPartnerStripeConnectionSchema,
  apiPartnerStripeOnboardingCreateSchema,
  apiPartnerTeamInvitationCreateSchema,
  apiPartnerTeamInvitationSchema,
  apiPartnerTeamMemberSchema,
  apiPartnerTeamMemberUpdateSchema,
  apiPartnerTeamSchema,
  apiPartnerTemplateCreateSchema,
  apiPartnerTemplateSchema,
  apiPartnerTierCheckoutCreateSchema,
  apiPartnerTierCheckoutSchema,
  billingIntervals,
  keyHasScope,
  paidPartnerTierSlugs,
  partnerAccessLevels,
  runtimeLocales,
  type ApiKeyScope,
  type ApiOperationId,
} from "@lobbystack/shared";

import type { PartnerLimit } from "../partner-limits";
import { contractSchema } from "./contract-schema";
import { contractBody, defined } from "./tools";

// The MCP tools a partner connection gets on top of the per-business ones:
// what the partner console does, one tool per v1 Partner endpoint. Each calls
// the same domain function as the REST route, so a platform key and an
// agency connection get exactly the console's rules. Platform keys are never
// made or revoked here. Links come back as URLs for the person to open.

/** The partner operations the tools call. Tests replace them to check the mapping. */
export const partnerMcpOperations = {
  getPartnerForApi,
  listPartnerBusinessesForApi,
  createPartnerBusinessForApi,
  releasePartnerBusinessForApi,
  deletePartnerBusinessForApi,
  getPartnerBusinessBillingForApi,
  updatePartnerBusinessBillingForApi,
  createPartnerDemoForApi,
  listPartnerDemosForApi,
  getPartnerDemoForApi,
  publishPartnerDemoForApi,
  rotatePartnerDemoLinkForApi,
  revokePartnerDemoForApi,
  deletePartnerDemoForApi,
  listPartnerPackagesForApi,
  createPartnerPackageForApi,
  renamePartnerPackageForApi,
  archivePartnerPackageForApi,
  getPartnerBrandForApi,
  updatePartnerBrandForApi,
  getPartnerDomainsForApi,
  addPartnerDomainForApi,
  removePartnerDomainForApi,
  listPartnerTemplatesForApi,
  createPartnerTemplateForApi,
  deletePartnerTemplateForApi,
  getPartnerTeamForApi,
  createPartnerTeamInvitationForApi,
  updatePartnerTeamMemberForApi,
  removePartnerTeamMemberForApi,
  revokePartnerTeamInvitationForApi,
  getPartnerStripeForApi,
  createPartnerStripeOnboardingLinkForApi,
  getPartnerBillingForApi,
  updatePartnerPoolOverageForApi,
  createPartnerTierCheckoutForApi,
  getPartnerTierCheckoutForApi,
};

export type PartnerMcpOperations = typeof partnerMcpOperations;

/** What a partner tool runs with. */
export type PartnerToolRun = {
  /** The app role's context with the partner's Stripe client, as the console's routes use. */
  context: DomainContext;
  /** The worker's context, which applies a template as the console does. */
  worker: DomainContext;
  storage: () => TemplateStorage;
  subject: PartnerSubject;
  operations: PartnerMcpOperations;
  /** Refuses past the hourly limit for work that costs the host: the partner's for a key, the person's for an agency connection. */
  limit: (input: PartnerLimit) => Promise<void>;
  /** Runs after the brand changes, so the partner's public pages render again. */
  brandChanged: (partnerId: string) => void;
};

type ToolInput = z.ZodObject;

type PartnerToolDefinition<Input extends ToolInput> = {
  name: string;
  title: string;
  description: string;
  /** The v1 operation this tool performs. Its scope is the tool's. */
  operation: ApiOperationId;
  /** A scope other than the operation's, where the REST route's doesn't fit a partner connection. */
  scope?: ApiKeyScope;
  annotations: ToolAnnotations;
  inputSchema: Input;
  outputSchema: StandardSchemaWithJSON;
  run: (run: PartnerToolRun, input: z.output<Input>) => Promise<Record<string, unknown>>;
};

export type PartnerMcpTool<Input extends ToolInput = ToolInput> = PartnerToolDefinition<Input> & { scope: ApiKeyScope };

function partnerTool<Input extends ToolInput>(definition: PartnerToolDefinition<Input>): PartnerMcpTool {
  const scope = definition.scope ?? apiOperations[definition.operation].scope;
  if (!scope) throw new Error(`MCP tool ${definition.name} needs a scope.`);
  return { ...definition, scope } as unknown as PartnerMcpTool;
}

const readOnly: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const creates: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const updates: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
/** Deletes, releases, revokes or removes something, which the person can't undo from here. */
const destroys: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

const uuid = (what: string) => z.uuid().describe(`The ${what} id (UUID).`);
const list = (items: unknown[]) => ({ data: items, next_cursor: null, has_more: false });
const idempotencyKeyInput = z.string().min(1).max(255).regex(/^[\x21-\x7e]+$/, "Use visible ASCII characters only.").optional().describe("Optional. A unique value you choose, such as a UUID. Retrying with the same value returns the business the first call created instead of creating another.");

export const partnerMcpTools: PartnerMcpTool[] = [
  // The partner
  partnerTool({
    name: "get_partner",
    title: "Get the agency",
    description: "Returns the partner (agency) this connection acts for: its name, subdomain, own domain, the dashboard address its clients use, its tier, and this month's shared pool when the connection may read billing. Call this first.",
    operation: "getPartner",
    annotations: readOnly,
    inputSchema: z.object({}),
    outputSchema: contractSchema(apiPartnerSchema),
    run: async ({ context, subject, operations }) => await operations.getPartnerForApi(context, subject),
  }),

  // Businesses
  partnerTool({
    name: "list_businesses",
    title: "List the agency's businesses",
    description: "Lists the partner's businesses by name, with each one's owner or pending owner invitation, access level, onboarding stage and this month's minutes and chats. Owners and admins also see each business's billing. Use a business id as business_id with the per-business tools. Demos nobody claimed are listed by list_demos instead.",
    operation: "listBusinesses",
    scope: "partner:read",
    annotations: readOnly,
    inputSchema: z.object({}),
    outputSchema: contractSchema(apiPageSchema(apiPartnerBusinessSummarySchema)),
    run: async ({ context, subject, operations }) => list(await operations.listPartnerBusinessesForApi(context, subject)),
  }),
  partnerTool({
    name: "create_business",
    title: "Create a business",
    description: "Creates a business for a client, with no owner yet, and emails owner_email an invitation to own it under the partner's brand. Pass template_id (from list_templates) to set it up from a saved template, and package_id (from list_packages) to sell it a package; without one, it's billed outside LobbyStack. template_id also needs the partner:read scope and package_id the partner.businesses:write scope. Confirm the name, owner email, template and package with the person first.",
    operation: "createBusiness",
    annotations: creates,
    inputSchema: z.object({
      name: z.string().describe("The business name."),
      owner_email: z.string().describe("Who will own the business. They get an invitation by email."),
      timezone: z.string().describe("IANA time zone, for example America/Toronto."),
      access_level: z.enum(partnerAccessLevels).optional().describe("What the business's own team can use once someone owns it. full (the default) lets them run the receptionist; activity shows them calls, messages and appointments, and the agency sets up the receptionist."),
      template_id: z.uuid().optional().describe("A template from list_templates to set the business up from."),
      package_id: z.uuid().optional().describe("A package from list_packages to sell the business."),
      business_type: z.string().optional().describe("The kind of business, for example hvac or dental."),
      locale: z.enum(runtimeLocales).optional().describe("The language callers hear first."),
      website_url: z.string().optional().describe("The business's website."),
      idempotency_key: idempotencyKeyInput,
    }),
    outputSchema: contractSchema(apiBusinessSchema),
    run: async ({ context, worker, storage, subject, operations, limit }, input) => {
      const { idempotency_key: given, ...fields } = input;
      const body = contractBody(apiBusinessCreateSchema, defined(fields));
      const idempotencyKey = given ?? crypto.randomUUID();
      const result = await operations.createPartnerBusinessForApi(context, { key: subject, idempotencyKey, requestHash: idempotencyRequestHash(body), body }, {
        // Each business emails its owner, so it counts against the console's limit.
        beforeCreate: async () => await limit({ name: "partner-business-create", limit: 30, what: "new businesses" }),
        ...(body.template_id !== undefined ? { setup: { worker, storage: storage() } } : {}),
      });
      return result.business;
    },
  }),
  partnerTool({
    name: "release_business",
    title: "Release a business to its owner",
    description: "Hands a business over to the owner who accepted its invitation: it leaves the partner, its package ends and it moves to the host's Free plan. The partner loses all access, and this can't be undone here. A business whose package subscription is live fails with subscription_active until it's cancelled in Stripe. Confirm with the person before calling.",
    operation: "releasePartnerBusiness",
    annotations: destroys,
    inputSchema: z.object({ business_id: uuid("business") }),
    outputSchema: contractSchema(apiPartnerBusinessReleasedSchema),
    run: async ({ context, subject, operations }, input) => await operations.releasePartnerBusinessForApi(context, subject, input.business_id),
  }),
  partnerTool({
    name: "delete_business",
    title: "Delete a business",
    description: "Deletes one of the partner's businesses and everything in it: calls, contacts, appointments, its audit log, and its phone numbers, which go back to the carrier. It can't be undone. Confirm the business by name with the person before calling.",
    operation: "deletePartnerBusiness",
    annotations: destroys,
    inputSchema: z.object({ business_id: uuid("business") }),
    outputSchema: contractSchema(apiDeletedSchema),
    run: async ({ context, subject, operations }, input) => await operations.deletePartnerBusinessForApi(context, subject, input.business_id),
  }),
  partnerTool({
    name: "get_business_billing",
    title: "Get how a business is billed",
    description: "Returns the package a business is sold and its subscription status, or kind outside when it's billed outside LobbyStack, with its overage. Members of the partner's team can't read billing.",
    operation: "getPartnerBusinessBilling",
    annotations: readOnly,
    inputSchema: z.object({ business_id: uuid("business") }),
    outputSchema: contractSchema(apiPartnerBusinessBillingSchema),
    run: async ({ context, subject, operations }, input) => await operations.getPartnerBusinessBillingForApi(context, subject, input.business_id),
  }),
  partnerTool({
    name: "set_business_billing",
    title: "Set a business's package and overage",
    description: "Sells a business one of the partner's packages (package_id), or bills it outside LobbyStack (package_id null), and sets its overage. A business whose subscription is live fails with conflict until it's cancelled in Stripe. Rates and caps are whole numbers of the package currency's smallest unit, such as cents.",
    operation: "updatePartnerBusinessBilling",
    annotations: updates,
    inputSchema: z.object({
      business_id: uuid("business"),
      package_id: z.uuid().nullable().optional().describe("The package to sell, or null to bill the business outside LobbyStack."),
      overage: z.object({
        enabled: z.boolean(),
        voice_minute_rate_minor: z.number().int().min(0),
        chat_rate_minor: z.number().int().min(0),
        cap_minor: z.number().int().min(0).nullable(),
      }).optional().describe("The business's overage past its package's allowance."),
    }),
    outputSchema: contractSchema(apiPartnerBusinessBillingSchema),
    run: async ({ context, subject, operations }, input) => {
      const { business_id: businessId, ...fields } = input;
      return await operations.updatePartnerBusinessBillingForApi(context, subject, businessId, contractBody(apiPartnerBusinessBillingUpdateSchema, defined(fields)));
    },
  }),

  // Prospect demos
  partnerTool({
    name: "create_demo",
    title: "Make a demo from a website",
    description: "Makes a prospect demo: a receptionist that reads the prospect's website, on a demo page under the partner's brand. It starts preparing; poll get_demo until every ready flag is true, then publish_demo with the token returned here. The url is the page to send the prospect once it's published.",
    operation: "createPartnerDemo",
    annotations: creates,
    inputSchema: z.object({
      name: z.string().describe("The prospect's business name."),
      website_url: z.string().describe("The prospect's website, for example https://joesplumbing.com."),
      access_level: z.enum(partnerAccessLevels).optional().describe("What the business's own team gets once the prospect claims the demo. Defaults to full."),
      locale: z.enum(runtimeLocales).optional().describe("The language the demo receptionist speaks first. Defaults to en."),
      greeting: z.string().optional(),
      timezone: z.string().optional().describe("IANA time zone, for example America/Chicago."),
      suggested_prompts: z.array(z.string()).max(6).optional().describe("What the demo page suggests the prospect ask. Publishing needs at least two."),
    }),
    outputSchema: contractSchema(apiPartnerDemoCreatedSchema),
    run: async ({ context, subject, operations, limit }, input) => {
      const body = contractBody(apiPartnerDemoCreateSchema, defined(input));
      // Each demo reads the prospect's website, which the host pays for.
      await limit({ name: "partner-demo-create", limit: 30, what: "demos" });
      return await operations.createPartnerDemoForApi(context, subject, body);
    },
  }),
  partnerTool({
    name: "list_demos",
    title: "List demos",
    description: "Lists the partner's prospect demos with their status (preparing, active, claimed, revoked or expired), what publishing waits for, and this month's usage.",
    operation: "listPartnerDemos",
    annotations: readOnly,
    inputSchema: z.object({}),
    outputSchema: contractSchema(apiPageSchema(apiPartnerDemoSchema)),
    run: async ({ context, subject, operations }) => list(await operations.listPartnerDemosForApi(context, subject)),
  }),
  partnerTool({
    name: "get_demo",
    title: "Get a demo",
    description: "Returns one prospect demo. ready says what publishing still waits for: the website read, the greeting, the snapshot and at least two suggested prompts.",
    operation: "getPartnerDemo",
    annotations: readOnly,
    inputSchema: z.object({ demo_id: uuid("demo") }),
    outputSchema: contractSchema(apiPartnerDemoSchema),
    run: async ({ context, subject, operations }, input) => await operations.getPartnerDemoForApi(context, subject, input.demo_id),
  }),
  partnerTool({
    name: "publish_demo",
    title: "Publish a demo",
    description: "Opens a ready demo's page to the prospect. Pass the token create_demo or rotate_demo_link returned. Returns when the demo expires.",
    operation: "publishPartnerDemo",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({
      demo_id: uuid("demo"),
      token: z.string().describe("The token of the demo's current link."),
      suggested_prompts: z.array(z.string()).max(6).optional(),
    }),
    outputSchema: contractSchema(apiPartnerDemoStateSchema),
    run: async ({ context, subject, operations }, input) => {
      const { demo_id: demoId, ...fields } = input;
      return await operations.publishPartnerDemoForApi(context, subject, demoId, contractBody(apiPartnerDemoPublishSchema, defined(fields)));
    },
  }),
  partnerTool({
    name: "rotate_demo_link",
    title: "Give a demo a new link",
    description: "Replaces a demo's link with a new one. The old link stops working at once. Returns the new token and url.",
    operation: "rotatePartnerDemoLink",
    annotations: destroys,
    inputSchema: z.object({ demo_id: uuid("demo") }),
    outputSchema: contractSchema(apiPartnerDemoLinkSchema),
    run: async ({ context, subject, operations }, input) => await operations.rotatePartnerDemoLinkForApi(context, subject, input.demo_id),
  }),
  partnerTool({
    name: "revoke_demo",
    title: "Turn a demo off",
    description: "Turns a demo off: its page and link stop working. A claimed demo can't be turned off. Confirm with the person before calling.",
    operation: "revokePartnerDemo",
    annotations: destroys,
    inputSchema: z.object({ demo_id: uuid("demo") }),
    outputSchema: contractSchema(apiPartnerDemoStateSchema),
    run: async ({ context, subject, operations }, input) => await operations.revokePartnerDemoForApi(context, subject, input.demo_id),
  }),
  partnerTool({
    name: "delete_demo",
    title: "Delete a demo",
    description: "Deletes a demo that's turned off or expired and nobody claimed, with its business. An open demo fails with demo_open; turn it off with revoke_demo first. Confirm with the person before calling.",
    operation: "deletePartnerDemo",
    annotations: destroys,
    inputSchema: z.object({ demo_id: uuid("demo") }),
    outputSchema: contractSchema(apiDeletedSchema),
    run: async ({ context, subject, operations }, input) => await operations.deletePartnerDemoForApi(context, subject, input.demo_id),
  }),

  // Packages
  partnerTool({
    name: "list_packages",
    title: "List packages",
    description: "Lists the packages the partner sells its businesses through its Stripe account, with each one's monthly price, setup fee and allowance. Use a package id as package_id with create_business or set_business_billing.",
    operation: "listPartnerPackages",
    annotations: readOnly,
    inputSchema: z.object({}),
    outputSchema: contractSchema(apiPageSchema(apiPartnerPackageSchema)),
    run: async ({ context, subject, operations }) => list(await operations.listPartnerPackagesForApi(context, subject)),
  }),
  partnerTool({
    name: "create_package",
    title: "Make a package",
    description: "Makes a package to sell businesses, in the connected Stripe account's currency. Prices are whole numbers of the currency's smallest unit, such as cents: 9900 is 99.00. A package's price and allowance never change once made. Confirm the price with the person before calling.",
    operation: "createPartnerPackage",
    annotations: creates,
    inputSchema: z.object({
      name: z.string(),
      monthly_price_minor: z.number().int().describe("The monthly price in the currency's smallest unit."),
      setup_fee_minor: z.number().int().nullable().optional().describe("A one-time fee with the first month, or null for none."),
      voice_minutes: z.number().int().describe("Minutes included each month."),
      chats: z.number().int().describe("Chats included each month."),
    }),
    outputSchema: contractSchema(apiPartnerPackageSchema),
    run: async ({ context, subject, operations }, input) => await operations.createPartnerPackageForApi(context, subject, contractBody(apiPartnerPackageCreateSchema, defined(input))),
  }),
  partnerTool({
    name: "rename_package",
    title: "Rename a package",
    description: "Changes a package's name. Its price and allowance stay.",
    operation: "updatePartnerPackage",
    annotations: updates,
    inputSchema: z.object({ package_id: uuid("package"), name: z.string() }),
    outputSchema: contractSchema(apiPartnerPackageSchema),
    run: async ({ context, subject, operations }, input) => await operations.renamePartnerPackageForApi(context, subject, input.package_id, contractBody(apiPartnerPackageUpdateSchema, { name: input.name }).name),
  }),
  partnerTool({
    name: "archive_package",
    title: "Stop selling a package",
    description: "Takes a package off sale. Businesses that already pay for it keep it. Confirm with the person before calling.",
    operation: "archivePartnerPackage",
    annotations: destroys,
    inputSchema: z.object({ package_id: uuid("package") }),
    outputSchema: contractSchema(apiDeletedSchema),
    run: async ({ context, subject, operations }, input) => await operations.archivePartnerPackageForApi(context, subject, input.package_id),
  }),

  // Brand and domains
  partnerTool({
    name: "get_brand",
    title: "Get the brand",
    description: "Returns the brand the partner's clients see: name, logo and favicon URLs, color, links and support email.",
    operation: "getPartnerBrand",
    annotations: readOnly,
    inputSchema: z.object({}),
    outputSchema: contractSchema(apiPartnerBrandSchema),
    run: async ({ context, subject, operations }) => await operations.getPartnerBrandForApi(context, subject),
  }),
  partnerTool({
    name: "update_brand",
    title: "Update the brand",
    description: "Changes the fields you send and keeps the rest. logo and favicon are PNG, JPEG, WebP or SVG images of 256 KB at most, sent in base64; null removes one. Set a link or the color to null to clear it.",
    operation: "updatePartnerBrand",
    annotations: updates,
    inputSchema: z.object({
      name: z.string().optional(),
      color: z.string().nullable().optional().describe("Hex color, for example #0f766e."),
      terms_url: z.string().nullable().optional(),
      privacy_url: z.string().nullable().optional(),
      support_url: z.string().nullable().optional(),
      support_email: z.string().nullable().optional().describe("Where replies to the partner's emails go."),
      logo: z.string().nullable().optional().describe("The logo image in base64, or null to remove it."),
      favicon: z.string().nullable().optional().describe("The favicon image in base64, or null to remove it."),
    }),
    outputSchema: contractSchema(apiPartnerBrandSchema),
    run: async ({ context, subject, operations, brandChanged }, input) => {
      const brand = await operations.updatePartnerBrandForApi(context, subject, contractBody(apiPartnerBrandUpdateSchema, defined(input)));
      brandChanged(subject.partnerId);
      return brand;
    },
  }),
  partnerTool({
    name: "get_domains",
    title: "Get the domains",
    description: "Returns the partner's subdomain and its own domain, if any: its status and the DNS records to add, each with whether it checks out.",
    operation: "getPartnerDomains",
    annotations: readOnly,
    inputSchema: z.object({}),
    outputSchema: contractSchema(apiPartnerDomainsSchema),
    run: async ({ context, subject, operations }) => await operations.getPartnerDomainsForApi(context, subject),
  }),
  partnerTool({
    name: "add_domain",
    title: "Connect the agency's own domain",
    description: "Adds the partner's own domain, such as app.youragency.com, for its clients' dashboards. Returns the DNS records to add; LobbyStack checks them on its own. A partner has one domain of its own.",
    operation: "addPartnerDomain",
    annotations: creates,
    inputSchema: z.object({ hostname: z.string().describe("A subdomain of the agency's own domain, such as app.youragency.com.") }),
    outputSchema: contractSchema(apiPartnerDomainsSchema),
    run: async ({ context, subject, operations }, input) => await operations.addPartnerDomainForApi(context, subject, contractBody(apiPartnerDomainCreateSchema, input).hostname),
  }),
  partnerTool({
    name: "remove_domain",
    title: "Remove the agency's own domain",
    description: "Removes the partner's own domain. Its clients' dashboards move back to the subdomain. Confirm with the person before calling.",
    operation: "removePartnerDomain",
    annotations: destroys,
    inputSchema: z.object({}),
    outputSchema: contractSchema(apiPartnerDomainsSchema),
    run: async ({ context, subject, operations }) => await operations.removePartnerDomainForApi(context, subject),
  }),

  // Templates
  partnerTool({
    name: "save_template",
    title: "Save a business as a template",
    description: "Copies one of the partner's businesses' setup, with its documents, into a template that create_business can start a new business from. Details that belong to one business, such as its phone number and website, are left out.",
    operation: "createPartnerTemplate",
    annotations: creates,
    inputSchema: z.object({ business_id: uuid("business").describe("The business whose setup to copy."), name: z.string().describe("The template's name, for example HVAC.") }),
    outputSchema: contractSchema(apiPartnerTemplateSchema),
    run: async ({ context, storage, subject, operations, limit }, input) => {
      const body = contractBody(apiPartnerTemplateCreateSchema, input);
      // Each template keeps a copy of the business's documents.
      await limit({ name: "partner-template-save", limit: 30, what: "templates" });
      return await operations.createPartnerTemplateForApi(context, subject, body, { storage: storage() });
    },
  }),
  partnerTool({
    name: "list_templates",
    title: "List templates",
    description: "Lists the partner's saved templates by id and name, with the setup each one copies. Pass a template id as template_id to create_business.",
    operation: "listPartnerTemplates",
    annotations: readOnly,
    inputSchema: z.object({}),
    outputSchema: contractSchema(apiPageSchema(apiPartnerTemplateSchema)),
    run: async ({ context, subject, operations }) => list(await operations.listPartnerTemplatesForApi(context, subject)),
  }),
  partnerTool({
    name: "delete_template",
    title: "Delete a template",
    description: "Deletes a template and its copies of documents. Businesses already set up from it keep their setup. Confirm with the person before calling.",
    operation: "deletePartnerTemplate",
    annotations: destroys,
    inputSchema: z.object({ template_id: uuid("template") }),
    outputSchema: contractSchema(apiDeletedSchema),
    run: async ({ context, subject, operations }, input) => await operations.deletePartnerTemplateForApi(context, subject, input.template_id),
  }),

  // Team
  partnerTool({
    name: "get_team",
    title: "Get the agency's team",
    description: "Lists the people on the partner's team with their roles (owner, admin or member), and the invitations nobody accepted yet.",
    operation: "getPartnerTeam",
    annotations: readOnly,
    inputSchema: z.object({}),
    outputSchema: contractSchema(apiPartnerTeamSchema),
    run: async ({ context, subject, operations }) => await operations.getPartnerTeamForApi(context, subject),
  }),
  partnerTool({
    name: "invite_team_member",
    title: "Invite someone to the team",
    description: "Emails an invitation to join the partner's team as an admin or a member. Owners are invited from the console.",
    operation: "createPartnerTeamInvitation",
    annotations: creates,
    inputSchema: z.object({ email: z.string(), role: z.enum(["admin", "member"]) }),
    outputSchema: contractSchema(apiPartnerTeamInvitationSchema),
    run: async ({ context, subject, operations, limit }, input) => {
      const body = contractBody(apiPartnerTeamInvitationCreateSchema, input);
      // Each invitation sends an email.
      await limit({ name: "partner-team-invite", limit: 20, what: "invitations" });
      return await operations.createPartnerTeamInvitationForApi(context, subject, body);
    },
  }),
  partnerTool({
    name: "change_team_member_role",
    title: "Change someone's role",
    description: "Makes someone on the team an admin or a member. Use the membership id from get_team. Owners are changed from the console.",
    operation: "updatePartnerTeamMember",
    annotations: updates,
    inputSchema: z.object({ member_id: uuid("membership"), role: z.enum(["admin", "member"]) }),
    outputSchema: contractSchema(apiPartnerTeamMemberSchema),
    run: async ({ context, subject, operations }, input) => await operations.updatePartnerTeamMemberForApi(context, subject, input.member_id, contractBody(apiPartnerTeamMemberUpdateSchema, { role: input.role }).role),
  }),
  partnerTool({
    name: "remove_team_member",
    title: "Remove someone from the team",
    description: "Removes someone from the partner's team. They lose access to the console and every client business at once. Use the membership id from get_team. Confirm with the person before calling.",
    operation: "removePartnerTeamMember",
    annotations: destroys,
    inputSchema: z.object({ member_id: uuid("membership") }),
    outputSchema: contractSchema(apiDeletedSchema),
    run: async ({ context, subject, operations }, input) => await operations.removePartnerTeamMemberForApi(context, subject, input.member_id),
  }),
  partnerTool({
    name: "revoke_team_invitation",
    title: "Revoke a team invitation",
    description: "Revokes an invitation to the partner's team nobody accepted yet. Its link stops working.",
    operation: "revokePartnerTeamInvitation",
    annotations: destroys,
    inputSchema: z.object({ invitation_id: uuid("invitation") }),
    outputSchema: contractSchema(apiDeletedSchema),
    run: async ({ context, subject, operations }, input) => await operations.revokePartnerTeamInvitationForApi(context, subject, input.invitation_id),
  }),

  // Payments and billing, which only owners reach
  partnerTool({
    name: "get_stripe_status",
    title: "Get the Stripe connection",
    description: "Returns whether the partner's Stripe account is connected and takes payments, and its currency. Only owners reach Stripe. Pass refresh true to ask Stripe again.",
    operation: "getPartnerStripe",
    annotations: readOnly,
    inputSchema: z.object({ refresh: z.boolean().optional().describe("Ask Stripe for the account's current state.") }),
    outputSchema: contractSchema(apiPartnerStripeConnectionSchema),
    run: async ({ context, subject, operations }, input) => await operations.getPartnerStripeForApi(context, subject, { refresh: input.refresh === true }),
  }),
  partnerTool({
    name: "create_stripe_onboarding_link",
    title: "Get a Stripe onboarding link",
    description: "Returns a Stripe page where the owner connects or finishes the partner's Stripe account, so it can sell packages. Give the url to the person to open; it works once, for a few minutes. country applies only to a new account.",
    operation: "createPartnerStripeOnboardingLink",
    annotations: creates,
    inputSchema: z.object({ country: z.string().optional().describe("Two-letter country code a new account opens in, for example CA.") }),
    outputSchema: contractSchema(apiPartnerLinkSchema),
    run: async ({ context, subject, operations }, input) => await operations.createPartnerStripeOnboardingLinkForApi(context, subject, contractBody(apiPartnerStripeOnboardingCreateSchema, defined(input))),
  }),
  partnerTool({
    name: "get_billing",
    title: "Get the agency's tier and usage",
    description: "Returns the partner's tier, its subscription, the phone numbers it includes and holds, this month's shared pool and the pool's overage settings. Only owners reach billing.",
    operation: "getPartnerBilling",
    annotations: readOnly,
    inputSchema: z.object({}),
    outputSchema: contractSchema(apiPartnerBillingSchema),
    run: async ({ context, subject, operations }) => await operations.getPartnerBillingForApi(context, subject),
  }),
  partnerTool({
    name: "set_pool_overage",
    title: "Set the pool's overage",
    description: "Turns overage past the shared pool on or off, and sets a monthly cap in US cents, or none. Only owners change billing. Confirm with the person before calling.",
    operation: "updatePartnerPoolOverage",
    annotations: updates,
    inputSchema: z.object({ enabled: z.boolean(), cap_cents: z.number().int().nullable().optional().describe("The monthly cap in US cents, or null for none.") }),
    outputSchema: contractSchema(apiPartnerPoolOverageSchema),
    run: async ({ context, subject, operations }, input) => await operations.updatePartnerPoolOverageForApi(context, subject, contractBody(apiPartnerPoolOverageUpdateSchema, defined(input))),
  }),
  partnerTool({
    name: "create_tier_checkout",
    title: "Start a tier checkout",
    description: "Asks for a Polar checkout page where the owner pays for a tier. It starts pending; call get_tier_checkout until status is ready, then give the person checkout_url to open. Only owners pay for tiers.",
    operation: "createPartnerTierCheckout",
    annotations: creates,
    inputSchema: z.object({ tier: z.enum(paidPartnerTierSlugs), interval: z.enum(billingIntervals) }),
    outputSchema: contractSchema(apiPartnerTierCheckoutSchema),
    run: async ({ context, subject, operations }, input) => await operations.createPartnerTierCheckoutForApi(context, subject, contractBody(apiPartnerTierCheckoutCreateSchema, input)),
  }),
  partnerTool({
    name: "get_tier_checkout",
    title: "Check a tier checkout",
    description: "Returns a tier checkout's status and, once ready, its checkout_url for the person to open.",
    operation: "getPartnerTierCheckout",
    annotations: readOnly,
    inputSchema: z.object({ checkout_id: uuid("checkout") }),
    outputSchema: contractSchema(apiPartnerTierCheckoutSchema),
    run: async ({ context, subject, operations }, input) => await operations.getPartnerTierCheckoutForApi(context, subject, input.checkout_id),
  }),
];

/** The partner tools a connection's scopes allow. */
export function partnerToolsForScopes(scopes: readonly ApiKeyScope[]): PartnerMcpTool[] {
  return partnerMcpTools.filter((entry) => keyHasScope(scopes, entry.scope));
}

/** Whether the subject is a person, whose limits count against them rather than the partner. */
export function limitSubject(subject: PartnerSubject): { partnerId: string; userId?: string } {
  return isPartnerMemberSubject(subject) ? { partnerId: subject.partnerId, userId: subject.userId } : { partnerId: subject.partnerId };
}
