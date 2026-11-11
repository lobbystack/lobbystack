// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import common from "../../public/locales/en/common.json";
import contacts from "../../public/locales/en/contacts.json";
import { NewContactButton } from "./new-contact-dialog";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const copy = contacts.create;
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function setup(options: { canCreate?: boolean; response?: Response } = {}) {
  const i18n = createInstance();
  await i18n.init({ lng: "en", defaultNS: "contacts", resources: { en: { common, contacts } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const fetchMock = vi.fn(async () => options.response ?? Response.json({ contactId: "contact-new" }, { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><NewContactButton businessId="business" canCreate={options.canCreate ?? true} /></QueryClientProvider></I18nextProvider>);
  return { fetchMock, invalidate };
}

async function open() {
  await userEvent.click(screen.getByRole("button", { name: copy.action }));
  return await screen.findByRole("dialog");
}

describe("NewContactButton", () => {
  it("is hidden from people who can't edit contacts", async () => {
    await setup({ canCreate: false });
    expect(screen.queryByRole("button", { name: copy.action })).toBeNull();
  });

  it("creates the contact, refreshes the list and opens it", async () => {
    const { fetchMock, invalidate } = await setup();
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText(copy.name), "  Ana Petrović ");
    await userEvent.type(within(dialog).getByLabelText(copy.phone), "4165550100");
    await userEvent.type(within(dialog).getByLabelText(copy.email), "ana@example.com");
    await userEvent.click(within(dialog).getByRole("button", { name: copy.save }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/contacts/contact-new"));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/contacts?businessId=business");
    expect(JSON.parse(String(init.body))).toEqual({ name: "Ana Petrović", phone: "+14165550100", email: "ana@example.com" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["contacts", "business"] });
    expect(toast.success).toHaveBeenCalledWith(copy.saved);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks for a name and a way to reach the contact before sending anything", async () => {
    const { fetchMock } = await setup();
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole("button", { name: copy.save }));
    expect(within(dialog).getByText(copy.nameRequired)).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText(copy.name), "Ana");
    await userEvent.click(within(dialog).getByRole("button", { name: copy.save }));
    expect(within(dialog).getByText(copy.reachRequired)).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText(copy.phone), "416555");
    await userEvent.click(within(dialog).getByRole("button", { name: copy.save }));
    expect(within(dialog).getByText(copy.phoneInvalid)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("links to the contact that already has the number", async () => {
    await setup({ response: Response.json({ error: "A contact with this phone number already exists.", code: "contact_exists", contactId: "contact-9" }, { status: 409 }) });
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText(copy.name), "Ana");
    await userEvent.type(within(dialog).getByLabelText(copy.phone), "4165550100");
    await userEvent.click(within(dialog).getByRole("button", { name: copy.save }));
    expect(await within(dialog).findByText(copy.exists)).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: copy.openExisting }).getAttribute("href")).toBe("/contacts/contact-9");
    expect(router.push).not.toHaveBeenCalled();
  });
});
