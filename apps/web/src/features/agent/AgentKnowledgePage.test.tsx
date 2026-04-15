import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentKnowledgePage } from "./AgentKnowledgePage";

const useRememberedConvexQueryMock = vi.fn();
const deleteKnowledgeEntryMock = vi.fn();
const upsertKnowledgeSnippetMock = vi.fn();
const convexQueryMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("convex/react", () => ({
  useAction: () => deleteKnowledgeEntryMock,
  useConvex: () => ({
    query: convexQueryMock,
  }),
  useMutation: () => upsertKnowledgeSnippetMock,
  useQuery: (...args: unknown[]) => useRememberedConvexQueryMock(...args),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      language: "en",
      resolvedLanguage: "en",
    },
    t: (key: string, options?: Record<string, unknown>) => {
      if (typeof options?.page === "number" && typeof options?.total === "number") {
        return `${key}:${options.page}/${options.total}`;
      }

      if (typeof options?.page === "number") {
        return `${key}:${options.page}`;
      }

      return key;
    },
  }),
}));

vi.mock("@/lib/analytics", () => ({
  captureAnalyticsException: vi.fn(),
}));

vi.mock("@/lib/locale", () => ({
  formatDateTime: (value: string | number) => `formatted:${String(value)}`,
  resolveLocale: () => "en",
}));

vi.mock("@/components/data-table/pagination", () => ({
  DataTablePagination: () => <div data-testid="pagination" />,
}));

vi.mock("@/components/ui/dropdown-menu", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");
  const DropdownMenuContext = ReactModule.createContext({
    open: false,
    setOpen: (_nextOpen: boolean) => {},
  });

  function DropdownMenu({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = ReactModule.useState(false);

    return (
      <DropdownMenuContext.Provider value={{ open, setOpen }}>
        {children}
      </DropdownMenuContext.Provider>
    );
  }

  function DropdownMenuTrigger({
    render,
  }: {
    render: React.ReactElement<React.ComponentProps<"button">>;
  }) {
    const { setOpen } = ReactModule.useContext(DropdownMenuContext);

    return ReactModule.cloneElement(render, {
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        render.props.onClick?.(event);
        setOpen(true);
      },
    });
  }

  function DropdownMenuContent({ children, ...props }: React.ComponentProps<"div">) {
    const { open } = ReactModule.useContext(DropdownMenuContext);
    if (!open) {
      return null;
    }

    return <div {...props}>{children}</div>;
  }

  function DropdownMenuItem({
    children,
    onClick,
    ...props
  }: React.ComponentProps<"button"> & { variant?: string }) {
    return (
      <button
        {...props}
        onClick={onClick}
        type="button"
      >
        {children}
      </button>
    );
  }

  return {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
  };
});

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
  },
}));

vi.mock("@/components/ui/dialog", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");
  const DialogContext = ReactModule.createContext({ open: false });

  function Dialog({
    children,
    open,
  }: {
    children: React.ReactNode;
    open?: boolean;
  }) {
    return <DialogContext.Provider value={{ open: open ?? false }}>{children}</DialogContext.Provider>;
  }

  function DialogContent({ children, ...props }: React.ComponentProps<"div">) {
    const { open } = ReactModule.useContext(DialogContext);
    if (!open) {
      return null;
    }

    return <div {...props}>{children}</div>;
  }

  return {
    Dialog,
    DialogContent,
    DialogDescription: ({ children, ...props }: React.ComponentProps<"div">) => (
      <div {...props}>{children}</div>
    ),
    DialogFooter: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
    DialogHeader: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
    DialogTitle: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
    DialogTrigger: ({ render }: { render?: React.ReactNode }) => <>{render ?? null}</>,
  };
});

function createSnippet(overrides: Record<string, unknown> = {}) {
  return {
    _id: "snippet-1",
    _creationTime: 1710000000000,
    businessId: "business-1",
    section: "knowledge",
    title: "Hours",
    content: "Open weekdays from 9 to 5.",
    tags: ["hours", "weekday"],
    priority: 55,
    active: true,
    ...overrides,
  };
}

function createDocument(overrides: Record<string, unknown> = {}) {
  return {
    _id: "document-1",
    _creationTime: 1710000000000,
    businessId: "business-1",
    section: "knowledge",
    sourceType: "upload",
    title: "Clinic Policies",
    mimeType: "text/plain",
    textContent: "",
    status: "indexed",
    processingProgress: 100,
    tags: ["policy"],
    importance: 75,
    extractedTextStorageId: "storage-1",
    contentHash: "hash-1",
    lastIndexedAt: "2026-04-14T00:00:00.000Z",
    error: null,
    ...overrides,
  };
}

describe("AgentKnowledgePage", () => {
  beforeEach(() => {
    useRememberedConvexQueryMock.mockReset();
    deleteKnowledgeEntryMock.mockReset();
    upsertKnowledgeSnippetMock.mockReset();
    convexQueryMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it.each(["knowledge", "services", "rules"] as const)(
    "renders the shared table shell for %s",
    (section) => {
      useRememberedConvexQueryMock.mockReturnValue({
        documents: [],
        snippets: [],
      });

      render(<AgentKnowledgePage businessId={"business-1" as never} section={section} />);

      expect(screen.getByPlaceholderText("agent:table.searchPlaceholder")).toBeTruthy();
      expect(screen.getByText("agent:table.title")).toBeTruthy();
      expect(screen.getByText("agent:table.preview")).toBeTruthy();
      expect(screen.getByText("agent:table.tags")).toBeTruthy();
      expect(screen.getByText("agent:table.status")).toBeTruthy();
      expect(screen.getByText("agent:table.added")).toBeTruthy();
      expect(screen.getByText(`agent:sections.${section}.emptyState`)).toBeTruthy();
      expect(screen.getByTestId("pagination")).toBeTruthy();
    },
  );

  it("opens snippet rows in edit mode with prefilled values and saves via snippetId", async () => {
    useRememberedConvexQueryMock.mockReturnValue({
      documents: [],
      snippets: [createSnippet()],
    });
    upsertKnowledgeSnippetMock.mockResolvedValue({ snippetId: "snippet-1" });

    render(<AgentKnowledgePage businessId={"business-1" as never} section="knowledge" />);

    const user = userEvent.setup();
    await user.click(screen.getByText("Hours"));

    expect(screen.getByText("agent:sections.knowledge.editKnowledge")).toBeTruthy();
    const titleInput = screen.getByLabelText("agent:sections.knowledge.fields.title.label");
    const contentInput = screen.getByLabelText("agent:sections.knowledge.fields.content.label");
    const tagsInput = screen.getByLabelText("agent:sections.knowledge.fields.tags.label");

    expect(screen.getByDisplayValue("Hours")).toBeTruthy();
    expect(screen.getByDisplayValue("Open weekdays from 9 to 5.")).toBeTruthy();
    expect(screen.getByDisplayValue("hours, weekday")).toBeTruthy();

    await user.clear(titleInput);
    await user.type(titleInput, "Updated Hours");
    await user.clear(contentInput);
    await user.type(contentInput, "Updated weekday hours.");
    await user.clear(tagsInput);
    await user.type(tagsInput, "hours, updated");
    await user.click(screen.getByRole("button", { name: "agent:actions.saveChanges" }));

    await waitFor(() => {
      expect(upsertKnowledgeSnippetMock).toHaveBeenCalledWith({
        businessId: "business-1",
        snippetId: "snippet-1",
        section: "knowledge",
        title: "Updated Hours",
        content: "Updated weekday hours.",
        tags: ["hours", "updated"],
        priority: 55,
        active: true,
      });
    });
  });

  it("keeps delete actions from opening the snippet edit dialog", async () => {
    useRememberedConvexQueryMock.mockReturnValue({
      documents: [],
      snippets: [createSnippet()],
    });
    deleteKnowledgeEntryMock.mockResolvedValue(null);

    render(<AgentKnowledgePage businessId={"business-1" as never} section="knowledge" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "actions.moreOptions" }));

    expect(screen.queryByText("agent:sections.knowledge.editKnowledge")).toBeNull();
    expect(screen.getByRole("button", { name: "actions.delete" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "actions.delete" }));

    await waitFor(() => {
      expect(deleteKnowledgeEntryMock).toHaveBeenCalledWith({
        businessId: "business-1",
        snippetId: "snippet-1",
      });
    });
    expect(screen.queryByText("agent:sections.knowledge.editKnowledge")).toBeNull();
  });

  it("expands knowledge documents inline without opening the snippet edit dialog", async () => {
    useRememberedConvexQueryMock.mockReturnValue({
      documents: [createDocument()],
      snippets: [],
    });
    convexQueryMock.mockResolvedValue({
      textContent: "",
      extractedTextUrl: "https://example.com/document.txt",
      error: null,
      status: "indexed",
    });
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => "Full document text loaded",
    });

    render(<AgentKnowledgePage businessId={"business-1" as never} section="knowledge" />);

    const user = userEvent.setup();
    await user.click(screen.getByText("Clinic Policies"));

    expect(screen.queryByText("agent:sections.knowledge.editKnowledge")).toBeNull();
    expect(await screen.findByDisplayValue("Full document text loaded")).toBeTruthy();
    expect(convexQueryMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/document.txt");
  });
});
