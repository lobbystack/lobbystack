import type { SQL } from "drizzle-orm";

// Stands in for the app role's database in tests of the brand pipeline, so a
// test drives the real resolveHostBrand without PostgreSQL: deployment_branding
// through the select chain, and the partner functions of migrations 0131 and
// 0152 through execute. brands.integration.test.ts covers the real functions.

export type FakeBrandPartner = {
  partnerId: string;
  name: string;
  /** Its verified subdomain. */
  subdomain: string;
  /** Its own domain, once verified. */
  customDomain?: string | null;
  logoVersion?: string | null;
  color?: string | null;
  supportEmail?: string | null;
};

function queryText(query: SQL): string {
  return query.queryChunks.map((chunk) => (typeof chunk === "object" && chunk !== null && "value" in chunk && Array.isArray(chunk.value) ? chunk.value.join("") : "?")).join("");
}

function queryParams(query: SQL): unknown[] {
  return query.queryChunks.filter((chunk) => !(typeof chunk === "object" && chunk !== null && "value" in chunk && Array.isArray(chunk.value)));
}

export function fakeBrandDatabase(input: { saved: () => Promise<Array<{ appName: string | null; logoVersion: string | null }>>; partners: () => FakeBrandPartner[] | Promise<FakeBrandPartner[]> }) {
  return {
    select: () => ({ from: () => ({ limit: input.saved }) }),
    execute: async (query: SQL) => {
      const text = queryText(query);
      const [param] = queryParams(query);
      const partners = await input.partners();
      if (text.includes("app.partner_for_host(")) {
        const partner = partners.find((candidate) => candidate.subdomain === param || candidate.customDomain === param);
        return { rows: partner ? [{ partner_id: partner.partnerId, kind: partner.subdomain === param ? "subdomain" : "custom" }] : [] };
      }
      if (text.includes("app.partner_brand(")) {
        const partner = partners.find((candidate) => candidate.partnerId === param);
        return {
          rows: partner ? [{
            name: partner.name,
            subdomain: partner.subdomain,
            logo_version: partner.logoVersion ?? null,
            favicon_version: null,
            brand_color: partner.color ?? null,
            terms_url: null,
            privacy_url: null,
            support_url: null,
            support_email: partner.supportEmail ?? null,
            custom_domain: partner.customDomain ?? null,
          }] : [],
        };
      }
      throw new Error(`The fake brand database doesn't answer: ${text}`);
    },
  };
}
