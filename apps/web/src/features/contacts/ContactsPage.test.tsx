import { render, screen } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContactsPage } from "./ContactsPage";

const useRememberedConvexQueryMock = vi.fn();
const useMutationMock = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: (...args: unknown[]) => useMutationMock(...args),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      language: "en",
    },
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/analytics", () => ({
  captureAnalyticsEvent: vi.fn(),
}));

vi.mock("@/lib/locale", () => ({
  formatDateTime: (value: string | number) => `formatted:${String(value)}`,
}));

vi.mock("@/lib/phone", () => ({
  formatPhoneNumberDisplay: (value: string) => value,
}));

vi.mock("@/lib/remembered-convex-query", () => ({
  useRememberedConvexQuery: (...args: unknown[]) => useRememberedConvexQueryMock(...args),
}));

vi.mock("@/components/data-table/pagination", () => ({
  DataTablePagination: () => <div data-testid="pagination" />,
}));

vi.mock("@/components/confirm-action-dialog", () => ({
  ConfirmActionDialog: () => null,
}));

vi.mock("@/components/confirm-delete-dialog", () => ({
  ConfirmDeleteDialog: () => null,
}));

vi.mock("@/features/contacts/ContactActionsMenu", () => ({
  ContactActionsMenu: () => <button aria-label="table.actions.moreOptions" type="button" />,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("ContactsPage", () => {
  beforeEach(() => {
    useRememberedConvexQueryMock.mockReset();
    useMutationMock.mockReset();
    useMutationMock.mockReturnValue(vi.fn());
    useRememberedConvexQueryMock.mockReturnValue({
      data: [
        {
          id: "contact-1",
          name: "Unknown contact",
          phone: "(581) 748-4609",
          email: null,
          isBlocked: false,
          blockedAt: null,
          blockedByName: null,
          messageCount: 0,
          callCount: 2,
          appointmentCount: 0,
          lastInteractionAt: 1710000000000,
        },
      ],
      isInitialLoading: false,
    });
  });

  it("renders the shared trailing actions cell layout", () => {
    const { container } = render(<ContactsPage businessId={"business-1" as never} />);

    expect(screen.getByRole("button", { name: "table.actions.moreOptions" })).toBeTruthy();
    expect(container.querySelector("[data-slot='data-table-row-actions']")).toBeTruthy();
  });
});
