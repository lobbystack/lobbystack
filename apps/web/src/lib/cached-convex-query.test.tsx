import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const convexQueryMock = vi.fn();
const convexClientMock = {
  query: (...args: unknown[]) => convexQueryMock(...args),
};

vi.mock("convex/react", () => ({
  useConvex: () => convexClientMock,
}));

vi.mock("convex/server", () => ({
  getFunctionName: () => "test.cachedQuery",
}));

describe("useCachedConvexQuery", () => {
  afterEach(() => {
    convexQueryMock.mockReset();
    vi.resetModules();
  });

  it("clears the previous key's data before the next fetch resolves", async () => {
    convexQueryMock.mockResolvedValueOnce("workspace-a");
    let resolvePendingQuery: ((value: string) => void) | null = null;
    const pendingQuery = new Promise<string>((resolve) => {
      resolvePendingQuery = resolve;
    });
    convexQueryMock.mockReturnValueOnce(pendingQuery);

    const { useCachedConvexQuery } = await import("./cached-convex-query");
    const queryRef = {} as never;

    function Probe({ businessId }: { businessId: string }) {
      const { data, isLoading } = useCachedConvexQuery(
        queryRef,
        { businessId } as never,
      );

      return (
        <div>
          <span data-testid="data">{data ?? "empty"}</span>
          <span data-testid="status">{isLoading ? "loading" : "ready"}</span>
        </div>
      );
    }

    const { rerender, unmount } = render(<Probe businessId="business-a" />);

    await waitFor(() => {
      expect(screen.getByTestId("data").textContent).toBe("workspace-a");
      expect(screen.getByTestId("status").textContent).toBe("ready");
    });

    rerender(<Probe businessId="business-b" />);

    expect(screen.getByTestId("data").textContent).toBe("empty");
    expect(screen.getByTestId("status").textContent).toBe("loading");

    await act(async () => {
      resolvePendingQuery?.("workspace-b");
      await pendingQuery;
    });

    expect(screen.getByTestId("data").textContent).toBe("workspace-b");
    expect(screen.getByTestId("status").textContent).toBe("ready");

    unmount();
  });

  it("drops cached data after the auth-scoped cache is cleared", async () => {
    convexQueryMock.mockResolvedValueOnce("workspace-a");
    const { clearCachedConvexQueries, useCachedConvexQuery } = await import("./cached-convex-query");
    const queryRef = {} as never;

    function Probe() {
      const { data, isLoading } = useCachedConvexQuery(
        queryRef,
        { businessId: "business-a" } as never,
      );

      return (
        <div>
          <span data-testid="data">{data ?? "empty"}</span>
          <span data-testid="status">{isLoading ? "loading" : "ready"}</span>
        </div>
      );
    }

    const firstRender = render(<Probe />);

    await waitFor(() => {
      expect(screen.getByTestId("data").textContent).toBe("workspace-a");
      expect(screen.getByTestId("status").textContent).toBe("ready");
    });

    firstRender.unmount();
    clearCachedConvexQueries();
    convexQueryMock.mockResolvedValueOnce("workspace-b");

    const secondRender = render(<Probe />);

    expect(screen.getByTestId("data").textContent).toBe("empty");
    expect(screen.getByTestId("status").textContent).toBe("loading");

    await waitFor(() => {
      expect(screen.getByTestId("data").textContent).toBe("workspace-b");
      expect(screen.getByTestId("status").textContent).toBe("ready");
    });

    secondRender.unmount();
  });
});
