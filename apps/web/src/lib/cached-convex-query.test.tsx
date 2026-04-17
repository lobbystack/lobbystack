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

  it("starts a fresh request when refresh is called during an in-flight load", async () => {
    let resolveInitialQuery: ((value: string) => void) | null = null;
    const initialQuery = new Promise<string>((resolve) => {
      resolveInitialQuery = resolve;
    });
    let resolveRefreshQuery: ((value: string) => void) | null = null;
    const refreshQuery = new Promise<string>((resolve) => {
      resolveRefreshQuery = resolve;
    });

    convexQueryMock.mockReturnValueOnce(initialQuery);
    convexQueryMock.mockReturnValueOnce(refreshQuery);

    const { useCachedConvexQuery } = await import("./cached-convex-query");
    const queryRef = {} as never;

    function Probe() {
      const { data, isLoading, refresh } = useCachedConvexQuery(
        queryRef,
        { businessId: "business-a" } as never,
      );

      return (
        <div>
          <span data-testid="data">{data ?? "empty"}</span>
          <span data-testid="status">{isLoading ? "loading" : "ready"}</span>
          <button onClick={() => void refresh()} type="button">
            Refresh
          </button>
        </div>
      );
    }

    render(<Probe />);

    await waitFor(() => {
      expect(convexQueryMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      screen.getByRole("button", { name: "Refresh" }).click();
    });

    await waitFor(() => {
      expect(convexQueryMock).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      resolveInitialQuery?.("stale-workspace");
      await initialQuery;
    });

    expect(screen.getByTestId("data").textContent).toBe("empty");
    expect(screen.getByTestId("status").textContent).toBe("loading");

    await act(async () => {
      resolveRefreshQuery?.("fresh-workspace");
      await refreshQuery;
    });

    expect(screen.getByTestId("data").textContent).toBe("fresh-workspace");
    expect(screen.getByTestId("status").textContent).toBe("ready");
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

  it("re-renders mounted consumers when cached data is updated", async () => {
    convexQueryMock.mockResolvedValueOnce("workspace-a");
    const { setCachedConvexQuery, useCachedConvexQuery } = await import("./cached-convex-query");
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

    render(<Probe />);

    await waitFor(() => {
      expect(screen.getByTestId("data").textContent).toBe("workspace-a");
      expect(screen.getByTestId("status").textContent).toBe("ready");
    });

    act(() => {
      setCachedConvexQuery(
        queryRef,
        { businessId: "business-a" } as never,
        "workspace-b" as never,
      );
    });

    expect(screen.getByTestId("data").textContent).toBe("workspace-b");
    expect(screen.getByTestId("status").textContent).toBe("ready");
  });
});
