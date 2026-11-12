// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => ({ "edit.contactName": "Contact name", "edit.failed": "Couldn't save the contact. Try again." })[key] ?? key }) }));

import { canEditContacts, EditableContactName } from "./editable-contact-name";

const businessId = "business-1";
const contactId = "contact-1";
let client: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;

function renderName(props: Partial<Parameters<typeof EditableContactName>[0]> = {}) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.spyOn(client, "invalidateQueries");
  return render(<QueryClientProvider client={client}><h2><EditableContactName businessId={businessId} canEdit contactId={contactId} displayName="Milana Brenović" {...props} /></h2></QueryClientProvider>);
}

function type(element: HTMLElement, text: string) {
  act(() => { element.focus(); element.textContent = text; });
}

beforeEach(() => {
  fetchMock = vi.fn(async () => Response.json({ contactId, name: "Milan Obrenović", email: null }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

const sentBodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));

describe("EditableContactName", () => {
  it("reads as the heading's text, named Contact name, and focusable from the keyboard", () => {
    renderName();
    const name = screen.getByRole("textbox", { name: "Contact name" });
    expect(name.textContent).toBe("Milana Brenović");
    expect(name.getAttribute("contenteditable")).toBe("plaintext-only");
    expect(name.tabIndex).toBe(0);
    // No box at rest, only the text cursor.
    expect(name.className.split(" ").sort()).toEqual(["cursor-text", "outline-none"]);
    expect(screen.getByRole("heading").textContent).toBe("Milana Brenović");
  });

  it("saves the new name on Enter and refreshes every list and page that shows it", async () => {
    renderName();
    const name = screen.getByRole("textbox", { name: "Contact name" });
    type(name, "Milan Obrenović");
    fireEvent.keyDown(name, { key: "Enter" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/contacts/${contactId}?businessId=${businessId}`);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("PATCH");
    expect(sentBodies()).toEqual([{ name: "Milan Obrenović" }]);
    expect(document.activeElement).not.toBe(name);
    expect(name.textContent).toBe("Milan Obrenović");
    await waitFor(() => expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["inbox", businessId] }));
    for (const key of ["contacts", "contact", "call", "messages"]) expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: [key, businessId] });
  });

  it("saves when focus leaves, tidying spaces", async () => {
    renderName();
    const name = screen.getByRole("textbox", { name: "Contact name" });
    type(name, "  Milan   Obrenović ");
    fireEvent.blur(name);
    await waitFor(() => expect(sentBodies()).toEqual([{ name: "Milan Obrenović" }]));
  });

  it("puts the old name back on Escape and saves nothing", async () => {
    renderName();
    const name = screen.getByRole("textbox", { name: "Contact name" });
    type(name, "Milan Obren");
    fireEvent.keyDown(name, { key: "Escape" });
    fireEvent.blur(name);
    expect(name.textContent).toBe("Milana Brenović");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("puts the old name back when the name is emptied", () => {
    renderName();
    const name = screen.getByRole("textbox", { name: "Contact name" });
    type(name, "   ");
    fireEvent.keyDown(name, { key: "Enter" });
    fireEvent.blur(name);
    expect(name.textContent).toBe("Milana Brenović");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves nothing when the name didn't change", () => {
    renderName();
    const name = screen.getByRole("textbox", { name: "Contact name" });
    type(name, "Milana Brenović");
    fireEvent.blur(name);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the error toast and the old name when the save fails", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "nope" }, { status: 500 }));
    renderName();
    const name = screen.getByRole("textbox", { name: "Contact name" });
    type(name, "Milan Obrenović");
    fireEvent.blur(name);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't save the contact. Try again."));
    expect(name.textContent).toBe("Milana Brenović");
  });

  it("is plain text for someone who can't change contacts, and without a contact", () => {
    const { unmount } = renderName({ canEdit: false });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("heading").textContent).toBe("Milana Brenović");
    unmount();
    renderName({ contactId: null, displayName: "Web caller" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("heading").textContent).toBe("Web caller");
  });

  it("lets owners and admins change contacts, and no one else", () => {
    expect(["business_owner", "business_admin", "business_member", "viewer", null].map(canEditContacts)).toEqual([true, true, false, false, false]);
  });
});
