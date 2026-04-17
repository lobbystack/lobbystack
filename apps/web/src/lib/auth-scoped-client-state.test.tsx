import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const useConvexAuthMock = vi.fn();
const clearCachedConvexQueriesMock = vi.fn();
const clearRememberedConvexQueriesMock = vi.fn();

vi.mock("convex/react", () => ({
  useConvexAuth: () => useConvexAuthMock(),
}));

vi.mock("@/lib/cached-convex-query", () => ({
  clearCachedConvexQueries: () => clearCachedConvexQueriesMock(),
}));

vi.mock("@/lib/remembered-convex-query", () => ({
  clearRememberedConvexQueries: () => clearRememberedConvexQueriesMock(),
}));

describe("useResetAuthScopedClientStateOnSignOut", () => {
  it("clears auth-scoped client caches after sign-out", async () => {
    const { useResetAuthScopedClientStateOnSignOut } = await import(
      "./auth-scoped-client-state"
    );

    function Probe() {
      useResetAuthScopedClientStateOnSignOut();
      return null;
    }

    useConvexAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });
    const rendered = render(<Probe />);

    expect(clearCachedConvexQueriesMock).not.toHaveBeenCalled();
    expect(clearRememberedConvexQueriesMock).not.toHaveBeenCalled();

    useConvexAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false });
    rendered.rerender(<Probe />);

    expect(clearCachedConvexQueriesMock).toHaveBeenCalledTimes(1);
    expect(clearRememberedConvexQueriesMock).toHaveBeenCalledTimes(1);
  });
});
