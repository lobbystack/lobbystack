import { describe, expect, it, vi } from "vitest";

import { fetchAllCatalogServices } from "./catalog-services";

const service = (index: number) => ({ id: `service-${index}`, name: `Service ${index}`, durationMinutes: 30, description: null, active: true });

describe("fetchAllCatalogServices", () => {
  it("follows the catalog pages past the first 100 services", async () => {
    const all = Array.from({ length: 230 }, (_, index) => service(index));
    const fetchPage = vi.fn(async (url: string) => {
      const offset = Number(new URL(url, "http://localhost").searchParams.get("offset"));
      const page = all.slice(offset, offset + 100);
      return { services: page, servicesPagination: { limit: 100, offset, total: all.length, hasNext: offset + 100 < all.length } };
    });
    const services = await fetchAllCatalogServices("business", fetchPage);
    expect(services).toHaveLength(230);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage.mock.calls.map(([url]) => new URL(url, "http://localhost").searchParams.get("offset"))).toEqual(["0", "100", "200"]);
  });

  it("stops after one page when there is nothing more", async () => {
    const fetchPage = vi.fn(async () => ({ services: [service(1)], servicesPagination: { limit: 100, offset: 0, total: 1, hasNext: false } }));
    expect(await fetchAllCatalogServices("business", fetchPage)).toHaveLength(1);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
