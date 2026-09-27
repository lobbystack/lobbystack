import { requestJson } from "./request-json";

export type CatalogService = { id: string; name: string; durationMinutes: number; description: string | null; active: boolean };

type CatalogPage = { services: CatalogService[]; servicesPagination?: { limit: number; offset: number; total: number; hasNext: boolean } };

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

export function allServicesQueryKey(businessId: string | undefined) {
  return ["catalog-services-all", businessId] as const;
}

/**
 * Every service of the business. The catalog endpoint pages at 100, so this
 * follows `hasNext` until the last page.
 */
export async function fetchAllCatalogServices(businessId: string, fetchPage: (url: string) => Promise<CatalogPage> = (url) => requestJson<CatalogPage>(url)): Promise<CatalogService[]> {
  const services: CatalogService[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await fetchPage(`/api/catalog?businessId=${encodeURIComponent(businessId)}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
    services.push(...result.services);
    if (!result.servicesPagination?.hasNext) break;
  }
  return services;
}
