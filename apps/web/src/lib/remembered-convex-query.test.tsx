import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("convex/server", () => ({
  getFunctionName: () => "test.rememberedQuery",
}));

describe("useRememberedConvexQuery", () => {
  afterEach(() => {
    useQueryMock.mockReset();
    vi.resetModules();
  });

  it("does not reuse the previous key's remembered data", async () => {
    useQueryMock.mockReturnValue("workspace-a");
    const { useRememberedConvexQuery } = await import("./remembered-convex-query");

    function Probe({ businessId }: { businessId: string }) {
      const { data, isInitialLoading } = useRememberedConvexQuery(
        {} as never,
        { businessId } as never,
      );

      return (
        <div>
          <span data-testid="data">{data ?? "empty"}</span>
          <span data-testid="status">{isInitialLoading ? "loading" : "ready"}</span>
        </div>
      );
    }

    const { rerender } = render(<Probe businessId="business-a" />);
    expect(screen.getByTestId("data").textContent).toBe("workspace-a");
    expect(screen.getByTestId("status").textContent).toBe("ready");

    useQueryMock.mockReturnValue(undefined);
    rerender(<Probe businessId="business-b" />);

    expect(screen.getByTestId("data").textContent).toBe("empty");
    expect(screen.getByTestId("status").textContent).toBe("loading");
  });

  it("drops remembered data after the auth-scoped cache is cleared", async () => {
    useQueryMock.mockReturnValue("workspace-a");
    const { clearRememberedConvexQueries, useRememberedConvexQuery } = await import(
      "./remembered-convex-query"
    );
    const queryRef = {} as never;

    function Probe() {
      const { data, isInitialLoading } = useRememberedConvexQuery(
        queryRef,
        { businessId: "business-a" } as never,
      );

      return (
        <div>
          <span data-testid="data">{data ?? "empty"}</span>
          <span data-testid="status">{isInitialLoading ? "loading" : "ready"}</span>
        </div>
      );
    }

    const firstRender = render(<Probe />);
    expect(screen.getByTestId("data").textContent).toBe("workspace-a");
    expect(screen.getByTestId("status").textContent).toBe("ready");

    firstRender.unmount();
    clearRememberedConvexQueries();
    useQueryMock.mockReturnValue(undefined);

    render(<Probe />);

    expect(screen.getByTestId("data").textContent).toBe("empty");
    expect(screen.getByTestId("status").textContent).toBe("loading");
  });
});
