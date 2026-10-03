// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OPERATOR_SMS_DISCLOSURE_TEXT } from "@lobbystack/shared";

import settingsEn from "../../public/locales/en/settings.json";
import { SmsPhoneVerificationDialog } from "./sms-phone-verification-dialog";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en", resolvedLanguage: "en" }, t: (key: string, options?: { phone?: string }) => options?.phone ? `${key}:${options.phone}` : key }) }));

const clients: QueryClient[] = [];
beforeEach(() => { Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => null }); vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} }); });
afterEach(async () => {
  cleanup();
  await Promise.all(clients.map(client => client.cancelQueries()));
  // input-otp schedules short timers that can fire after jsdom tears down.
  await new Promise(resolve => setTimeout(resolve, 60));
  clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals();
});

type Routes = { start?: (body: { phoneNumber: string }, call: number) => Response; status?: () => Response; check?: (call: number) => Response };
function setup(routes: Routes = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  let starts = 0; let checks = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/account/phone-verification/check")) { checks += 1; return routes.check?.(checks) ?? Response.json({ approved: true, status: "approved" }); }
    if (init?.method === "POST") { starts += 1; return routes.start?.(JSON.parse(String(init.body)), starts) ?? Response.json({ attemptId: `attempt-${starts}`, phoneE164: "+14165550123" }, { status: 202 }); }
    return routes.status?.() ?? Response.json({ attempt: { id: `attempt-${starts}`, status: "sent" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  const onVerified = vi.fn();
  render(<QueryClientProvider client={client}><SmsPhoneVerificationDialog businessId="business-1" onOpenChange={vi.fn()} onVerified={onVerified} open /></QueryClientProvider>);
  return { fetchMock, onVerified };
}

async function sendCode(phone = "+14165550123") {
  await userEvent.click(screen.getByLabelText("notifications.phoneVerification.fields.mobileNumber"));
  await userEvent.paste(phone);
  await userEvent.click(screen.getByRole("button", { name: "notifications.phoneVerification.sendCode" }));
}

const starts = (fetchMock: ReturnType<typeof setup>["fetchMock"]) => fetchMock.mock.calls.filter(([url, init]) => url.startsWith("/api/account/phone-verification?") && init?.method === "POST");

const checks = (fetchMock: ReturnType<typeof setup>["fetchMock"]) => fetchMock.mock.calls.filter(([url]) => url.startsWith("/api/account/phone-verification/check"));

describe("SMS phone verification dialog", () => {
  it("shows the disclosure that consent records name", () => {
    expect(settingsEn.notifications.phoneVerification.phone.consent).toBe(OPERATOR_SMS_DISCLOSURE_TEXT);
  });

  it("keeps the code input open when the code isn't ready yet", async () => {
    const { onVerified } = setup({ check: (call) => call === 1 ? Response.json({ approved: false, status: "unavailable" }) : Response.json({ approved: true, status: "approved" }) });
    await sendCode();
    const input = await screen.findByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "123456");
    expect(await screen.findByText("notifications.phoneVerification.errors.unavailable")).toBeTruthy();
    expect(input.disabled).toBe(false);
    await userEvent.type(input, "{backspace}6");
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
  });

  it("checks the same code again after a failed request", async () => {
    const { fetchMock, onVerified } = setup({ check: (call) => call === 1 ? Response.json({ error: "Request failed." }, { status: 500 }) : Response.json({ approved: true, status: "approved" }) });
    await sendCode();
    const input = await screen.findByRole("textbox");
    await userEvent.type(input, "123456");
    expect(await screen.findByText("notifications.phoneVerification.errors.checkFailed")).toBeTruthy();
    expect(checks(fetchMock)).toHaveLength(1);
    await userEvent.type(input, "{backspace}6");
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    expect(checks(fetchMock)).toHaveLength(2);
  });

  it("keeps Send code off until the number is valid", async () => {
    setup();
    const send = screen.getByRole("button", { name: "notifications.phoneVerification.sendCode" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("notifications.phoneVerification.fields.mobileNumber"), "+1416");
    expect(send.disabled).toBe(true);
  });

  it("moves to the code screen and verifies a correct code", async () => {
    const { onVerified } = setup();
    await sendCode();
    expect(await screen.findByText("notifications.phoneVerification.code.description:(416) 555-0123")).toBeTruthy();
    await userEvent.type(screen.getByRole("textbox"), "123456");
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
  });

  it("shows a wrong code without resubmitting it", async () => {
    const { fetchMock, onVerified } = setup({ check: () => Response.json({ approved: false, status: "invalid", remainingAttempts: 4 }) });
    await sendCode();
    await userEvent.type(await screen.findByRole("textbox"), "000000");
    expect(await screen.findByText("notifications.phoneVerification.errors.wrongCode")).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => url.startsWith("/api/account/phone-verification/check"))).toHaveLength(1);
    expect(onVerified).not.toHaveBeenCalled();
  });

  it("locks the code input after too many wrong codes", async () => {
    setup({ check: () => Response.json({ approved: false, status: "locked" }) });
    await sendCode();
    await userEvent.type(await screen.findByRole("textbox"), "000000");
    expect(await screen.findByText("notifications.phoneVerification.errors.locked")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(true);
  });

  it("resends a code to the same number", async () => {
    const { fetchMock } = setup();
    await sendCode();
    await userEvent.click(await screen.findByRole("button", { name: "notifications.phoneVerification.code.resend" }));
    await waitFor(() => expect(starts(fetchMock)).toHaveLength(2));
    expect(JSON.parse(String(starts(fetchMock)[1]?.[1]?.body))).toEqual({ phoneNumber: "+14165550123", locale: "en" });
  });

  it("explains the resend cooldown", async () => {
    setup({ start: (_body, call) => call === 1 ? Response.json({ attemptId: "attempt-1", phoneE164: "+14165550123" }, { status: 202 }) : Response.json({ error: "Wait", code: "verification_cooldown" }, { status: 429 }) });
    await sendCode();
    await userEvent.click(await screen.findByRole("button", { name: "notifications.phoneVerification.code.resend" }));
    expect(await screen.findByText("notifications.phoneVerification.errors.cooldown")).toBeTruthy();
  });

  it("goes back to change the number with the old one filled in", async () => {
    setup();
    await sendCode();
    await userEvent.click(await screen.findByRole("button", { name: "notifications.phoneVerification.code.changeNumber" }));
    const input = await screen.findByLabelText("notifications.phoneVerification.fields.mobileNumber") as HTMLInputElement;
    expect(input.value).toBe("(416) 555-0123");
  });

  it("shows when a toll-free sender can't text the number", async () => {
    setup({ start: () => Response.json({ error: "The alert SMS sender can't text this number.", code: "phone_unreachable" }, { status: 422 }) });
    await sendCode("+447911123456");
    expect(await screen.findByText("notifications.phoneVerification.errors.unreachable")).toBeTruthy();
    expect(screen.queryByText("notifications.phoneVerification.code.title")).toBeNull();
  });

  it("reports a code the worker couldn't deliver", async () => {
    setup({ status: () => Response.json({ attempt: { id: "attempt-1", status: "failed" } }) });
    await sendCode();
    expect(await screen.findByText("notifications.phoneVerification.errors.deliveryFailed")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(true);
  });
});
