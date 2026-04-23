import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentKnowledgePage } from "./AgentKnowledgePage";

const useRememberedConvexQueryMock = vi.fn();
const deleteKnowledgeEntryMock = vi.fn();
const setKnowledgeEntryActiveMock = vi.fn();
const cancelWebsiteIngestionJobMock = vi.fn();
const deleteWebsiteIngestionJobMock = vi.fn();
const upsertKnowledgeSnippetMock = vi.fn();
const convexQueryMock = vi.fn();
const fetchMock = vi.fn();
const useMutationMock = vi.fn();

vi.mock("convex/react", () => ({
  useAction: (reference: unknown) => {
    const functionName = getFunctionName(reference as never);

    if (functionName === "ai/context/knowledge:setKnowledgeEntryActive") {
      return setKnowledgeEntryActiveMock;
    }

    if (functionName === "ai/context/websiteIngestion:cancelWebsiteIngestionJob") {
      return cancelWebsiteIngestionJobMock;
    }

    return deleteKnowledgeEntryMock;
  },
  useConvex: () => ({
    query: convexQueryMock,
  }),
  useMutation: (...args: unknown[]) => useMutationMock(...args),
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

  function DropdownMenuSeparator(props: React.ComponentProps<"div">) {
    return <div {...props} />;
  }

  return {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
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

function createWebsiteIngestionJob(overrides: Record<string, unknown> = {}) {
  return {
    _id: "website-job-1",
    _creationTime: 1711000000000,
    businessId: "business-1",
    websiteUrl: "https://example.com/team",
    provider: "cloudflare_browser_run",
    status: "crawling",
    crawlMode: "http",
    fallbackTriggered: false,
    pageLimit: 40,
    depth: 3,
    crawlFinishedCount: 0,
    crawlTotalCount: 40,
    importedCount: 0,
    indexedCount: 0,
    errorCount: 0,
    documentCount: 0,
    indexedDocumentCount: 0,
    errorDocumentCount: 0,
    pendingDocumentCount: 0,
    ...overrides,
  };
}

function mockAgentKnowledgeQueries(input: {
  knowledge?: {
    documents: Array<Record<string, unknown>>;
    snippets: Array<Record<string, unknown>>;
  };
  websiteJobs?: Array<Record<string, unknown>>;
}) {
  const knowledgeResult = {
    documents: input.knowledge?.documents ?? [],
    snippets: input.knowledge?.snippets ?? [],
  };
  const websiteJobsResult = input.websiteJobs ?? [];

  useRememberedConvexQueryMock.mockImplementation((_query: unknown, args: unknown) => {
    if (!args || args === "skip" || typeof args !== "object") {
      return undefined;
    }

    if ("section" in args) {
      return knowledgeResult;
    }

    return websiteJobsResult;
  });
}

describe("AgentKnowledgePage", () => {
  beforeEach(() => {
    useRememberedConvexQueryMock.mockReset();
    deleteKnowledgeEntryMock.mockReset();
    setKnowledgeEntryActiveMock.mockReset();
    cancelWebsiteIngestionJobMock.mockReset();
    deleteWebsiteIngestionJobMock.mockReset();
    upsertKnowledgeSnippetMock.mockReset();
    convexQueryMock.mockReset();
    fetchMock.mockReset();
    useMutationMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    useMutationMock.mockImplementation((reference: unknown) => {
      const functionName = getFunctionName(reference as never);

      if (functionName === "ai/context/knowledge:upsertKnowledgeSnippet") {
        return upsertKnowledgeSnippetMock;
      }

      if (functionName === "ai/context/websiteIngestion:deleteWebsiteIngestionJob") {
        return deleteWebsiteIngestionJobMock;
      }

      if (functionName === "ai/context/websiteIngestion:cancelWebsiteIngestionJob") {
        return cancelWebsiteIngestionJobMock;
      }

      return vi.fn();
    });
  });

  it.each(["knowledge", "services", "rules"] as const)(
    "renders the shared table shell for %s",
    (section) => {
      mockAgentKnowledgeQueries({
        knowledge: {
          documents: [],
          snippets: [],
        },
      });

      render(<AgentKnowledgePage businessId={"business-1" as never} section={section} />);

      expect(screen.getByPlaceholderText("agent:table.searchPlaceholder")).toBeTruthy();
      expect(screen.getByText("agent:table.title")).toBeTruthy();
      expect(screen.getByText("agent:table.preview")).toBeTruthy();
      expect(screen.getByText("agent:table.status")).toBeTruthy();
      expect(screen.queryByText("agent:table.tags")).toBeNull();
      expect(screen.queryByRole("switch")).toBeNull();
      expect(screen.getByText("agent:table.added")).toBeTruthy();
      expect(screen.getByText(`agent:sections.${section}.emptyState`)).toBeTruthy();
      expect(screen.getByTestId("pagination")).toBeTruthy();
    },
  );

  it("opens snippet rows in edit mode with prefilled values and saves via snippetId", async () => {
    mockAgentKnowledgeQueries({
      knowledge: {
        documents: [],
        snippets: [createSnippet()],
      },
    });
    upsertKnowledgeSnippetMock.mockResolvedValue({ snippetId: "snippet-1" });

    render(<AgentKnowledgePage businessId={"business-1" as never} section="knowledge" />);

    expect(screen.getByLabelText("agent:sections.knowledge.textBadge")).toBeTruthy();

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

  it("toggles snippet activity from the row actions menu", async () => {
    mockAgentKnowledgeQueries({
      knowledge: {
        documents: [],
        snippets: [createSnippet()],
      },
    });
    setKnowledgeEntryActiveMock.mockResolvedValue(null);

    render(<AgentKnowledgePage businessId={"business-1" as never} section="knowledge" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "actions.moreOptions" }));
    await user.click(screen.getByRole("button", { name: "agent:actions.disable" }));

    await waitFor(() => {
      expect(setKnowledgeEntryActiveMock).toHaveBeenCalledWith({
        businessId: "business-1",
        snippetId: "snippet-1",
        active: false,
      });
    });
  });

  it("keeps delete actions from opening the snippet edit dialog", async () => {
    mockAgentKnowledgeQueries({
      knowledge: {
        documents: [],
        snippets: [createSnippet()],
      },
    });
    deleteKnowledgeEntryMock.mockResolvedValue(null);

    render(<AgentKnowledgePage businessId={"business-1" as never} section="knowledge" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "actions.moreOptions" }));

    expect(screen.queryByText("agent:sections.knowledge.editKnowledge")).toBeNull();
    expect(screen.getByRole("button", { name: "actions.delete" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "actions.delete" }));
    expect(screen.queryByText("agent:sections.knowledge.editKnowledge")).toBeNull();

    await user.click(screen.getByRole("button", { name: "agent:actions.delete" }));

    await waitFor(() => {
      expect(deleteKnowledgeEntryMock).toHaveBeenCalledWith({
        businessId: "business-1",
        snippetId: "snippet-1",
      });
    });
    expect(screen.queryByText("agent:sections.knowledge.editKnowledge")).toBeNull();
  });

  it("expands knowledge documents inline without opening the snippet edit dialog", async () => {
    mockAgentKnowledgeQueries({
      knowledge: {
        documents: [createDocument()],
        snippets: [],
      },
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

  it.each(["services", "rules"] as const)(
    "expands uploaded documents inline on the %s page",
    async (section) => {
      mockAgentKnowledgeQueries({
        knowledge: {
          documents: [
            createDocument({
              _id: `document-${section}`,
              section,
              lastIndexedAt: `2026-04-14T00:00:00.000Z-${section}`,
            }),
          ],
          snippets: [],
        },
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

      render(<AgentKnowledgePage businessId={"business-1" as never} section={section} />);

      const user = userEvent.setup();
      await user.click(screen.getByText("Clinic Policies"));

      expect(await screen.findByDisplayValue("Full document text loaded")).toBeTruthy();
      expect(convexQueryMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith("https://example.com/document.txt");
    },
  );

  it("shows a pending website crawl row before any imported documents exist", () => {
    mockAgentKnowledgeQueries({
      knowledge: {
        documents: [],
        snippets: [],
      },
      websiteJobs: [
        createWebsiteIngestionJob({
          crawlFinishedCount: 6,
          crawlTotalCount: 40,
        }),
      ],
    });

    render(<AgentKnowledgePage businessId={"business-1" as never} section="knowledge" />);

    expect(screen.getByText("example.com/team")).toBeTruthy();
    expect(
      screen.getByLabelText("agent:sections.knowledge.websiteImport.badge"),
    ).toBeTruthy();
    expect(screen.getByText("15%")).toBeTruthy();
    expect(screen.getByRole("button", { name: "actions.moreOptions" })).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(
      screen.queryByText("agent:sections.knowledge.websiteImport.previewPending"),
    ).toBeNull();
  });

  it("caps website crawl progress below 100 until the job leaves the crawling state", () => {
    mockAgentKnowledgeQueries({
      knowledge: {
        documents: [],
        snippets: [],
      },
      websiteJobs: [
        createWebsiteIngestionJob({
          crawlFinishedCount: 34,
          crawlTotalCount: 34,
        }),
      ],
    });

    render(<AgentKnowledgePage businessId={"business-1" as never} section="knowledge" />);

    expect(screen.getByText("99%")).toBeTruthy();
    expect(screen.queryByText("100%")).toBeNull();
  });

  it("allows canceling an in-progress website import from the row actions menu", async () => {
    mockAgentKnowledgeQueries({
      knowledge: {
        documents: [],
        snippets: [],
      },
      websiteJobs: [
        createWebsiteIngestionJob({
          _id: "website-job-active",
          status: "crawling",
        }),
      ],
    });
    cancelWebsiteIngestionJobMock.mockResolvedValue(null);

    render(<AgentKnowledgePage businessId={"business-1" as never} section="knowledge" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "actions.moreOptions" }));
    await user.click(screen.getByRole("button", { name: "agent:actions.cancelImport" }));
    await user.click(screen.getByRole("button", { name: "agent:actions.cancelImport" }));

    await waitFor(() => {
      expect(cancelWebsiteIngestionJobMock).toHaveBeenCalledWith({
        businessId: "business-1",
        websiteIngestionJobId: "website-job-active",
      });
    });
    expect(screen.queryByText("example.com/team")).toBeNull();
  });

  it("shows processing uploads with the same preview progress pattern", () => {
    mockAgentKnowledgeQueries({
      knowledge: {
        documents: [
          createDocument({
            status: "indexing",
            processingProgress: 18,
            textContent: "",
          }),
        ],
        snippets: [],
      },
    });

    render(<AgentKnowledgePage businessId={"business-1" as never} section="knowledge" />);

    expect(screen.getByText("Clinic Policies")).toBeTruthy();
    expect(screen.getByLabelText("agent:sections.knowledge.documentBadge")).toBeTruthy();
    expect(screen.getAllByText("18%")).toHaveLength(1);
    expect(screen.getByText("agent:sections.knowledge.status.indexing")).toBeTruthy();
    expect(screen.queryByText("agent:sections.knowledge.status.analyzing")).toBeNull();
    expect(screen.queryByText("agent:sections.knowledge.previewPending")).toBeNull();
  });

  it("toggles document activity from the row actions menu", async () => {
    mockAgentKnowledgeQueries({
      knowledge: {
        documents: [createDocument()],
        snippets: [],
      },
    });
    setKnowledgeEntryActiveMock.mockResolvedValue(null);

    render(<AgentKnowledgePage businessId={"business-1" as never} section="knowledge" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "actions.moreOptions" }));
    await user.click(screen.getByRole("button", { name: "agent:actions.disable" }));

    await waitFor(() => {
      expect(setKnowledgeEntryActiveMock).toHaveBeenCalledWith({
        businessId: "business-1",
        documentId: "document-1",
        active: false,
      });
    });
  });

  it("shows completed website documents with the website marker", () => {
    mockAgentKnowledgeQueries({
      knowledge: {
        documents: [
          createDocument({
            sourceType: "website",
            sourceUrl: "https://example.com/changelog",
            title: "Changelog",
          }),
        ],
        snippets: [],
      },
    });

    render(<AgentKnowledgePage businessId={"business-1" as never} section="knowledge" />);

    expect(screen.getByText("Changelog")).toBeTruthy();
    expect(screen.getByLabelText("agent:sections.knowledge.websiteImport.badge")).toBeTruthy();
    expect(screen.queryByLabelText("agent:sections.knowledge.documentBadge")).toBeNull();
  });

  it.each([
    {
      section: "services" as const,
      snippet: createSnippet({
        _id: "snippet-service-1",
        section: "services",
        title: "Front-desk service",
      }),
      title: "Front-desk service",
    },
    {
      section: "rules" as const,
      snippet: createSnippet({
        _id: "snippet-rule-1",
        section: "rules",
        title: "After-hours rule",
      }),
      title: "After-hours rule",
    },
  ])("does not show title markers for $section rows", ({ section, snippet, title }) => {
    mockAgentKnowledgeQueries({
      knowledge: {
        documents: [],
        snippets: [snippet],
      },
    });

    render(<AgentKnowledgePage businessId={"business-1" as never} section={section} />);

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.queryByLabelText(`agent:sections.${section}.textBadge`)).toBeNull();
    expect(screen.queryByLabelText(`agent:sections.${section}.documentBadge`)).toBeNull();
  });

  it("allows deleting a failed website import row from the row actions menu", async () => {
    mockAgentKnowledgeQueries({
      knowledge: {
        documents: [],
        snippets: [],
      },
      websiteJobs: [
        createWebsiteIngestionJob({
          _id: "website-job-failed",
          status: "failed",
          lastError: "Cloudflare request failed",
        }),
      ],
    });
    deleteWebsiteIngestionJobMock.mockResolvedValue(null);

    render(<AgentKnowledgePage businessId={"business-1" as never} section="knowledge" />);

    expect(screen.getByText("agent:sections.knowledge.websiteImport.previewFailed")).toBeTruthy();
    expect(screen.queryByText("Cloudflare request failed")).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "actions.moreOptions" }));
    await user.click(screen.getByRole("button", { name: "actions.delete" }));
    await user.click(screen.getByRole("button", { name: "agent:actions.delete" }));

    await waitFor(() => {
      expect(deleteWebsiteIngestionJobMock).toHaveBeenCalledWith({
        businessId: "business-1",
        websiteIngestionJobId: "website-job-failed",
      });
    });
  });
});
