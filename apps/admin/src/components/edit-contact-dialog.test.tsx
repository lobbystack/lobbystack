// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import en from "../../public/locales/en/contacts.json";
import { EditContactDialog } from "./edit-contact-dialog";

const toast = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const contact = { id: "contact-1", name: "Alex", email: "alex@example.com" };
const clients: QueryClient[] = [];
beforeEach(() => { vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() }); });
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function setup() {
  const i18n = createInstance();
  await i18n.init({ lng: "en", defaultNS: "contacts", resources: { en: { contacts: en } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  const fetchMock = vi.fn(async () => Response.json({ contactId: contact.id, name: "Alexandra", email: contact.email }));
  vi.stubGlobal("fetch", fetchMock);
  const onOpenChange = vi.fn();
  render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><EditContactDialog businessId="business" contact={contact} onOpenChange={onOpenChange} /></QueryClientProvider></I18nextProvider>);
  return { fetchMock, onOpenChange };
}

const save = () => screen.getByRole("button", { name: en.edit.save }) as HTMLButtonElement;
function body(fetchMock: Mock) {
  return JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
}

describe("EditContactDialog", () => {
  it("keeps Save disabled until a field differs from the saved contact", async () => {
    await setup();
    expect(save().disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(en.edit.name), "a");
    expect(save().disabled).toBe(false);
  });

  it("sends only the field that changed, so the audit entry names what the operator edited", async () => {
    const { fetchMock, onOpenChange } = await setup();
    await userEvent.clear(screen.getByLabelText(en.edit.name));
    await userEvent.type(screen.getByLabelText(en.edit.name), "Alexandra");
    await userEvent.click(save());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(body(fetchMock)).toEqual({ name: "Alexandra" });
    expect(toast.success).toHaveBeenCalledWith(en.edit.saved);
  });

  it("sends a cleared field as null", async () => {
    const { fetchMock } = await setup();
    await userEvent.clear(screen.getByLabelText(en.edit.email));
    await userEvent.click(save());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(body(fetchMock)).toEqual({ email: null });
  });

  it("refuses an email the API would refuse", async () => {
    const { fetchMock } = await setup();
    await userEvent.clear(screen.getByLabelText(en.edit.email));
    await userEvent.type(screen.getByLabelText(en.edit.email), "alex@");
    await userEvent.click(save());
    expect(await screen.findByText(en.edit.invalidEmail)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
