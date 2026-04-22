import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getTwilioClientMock } = vi.hoisted(() => ({
  getTwilioClientMock: vi.fn(),
}));

vi.mock("../lib/node/twilioClient", async () => {
  const actual = await vi.importActual<typeof import("../lib/node/twilioClient")>(
    "../lib/node/twilioClient",
  );

  return {
    ...actual,
    getTwilioClient: () => getTwilioClientMock(),
  };
});

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { SmsComplianceDraft } from "../lib/smsCompliance";
import schema from "../schema";
import { modules } from "../test.setup";

type ConvexHarness = TestConvex<typeof schema>;
type TestRunFunction = Parameters<ConvexHarness["run"]>[0];
type TestContext = Parameters<TestRunFunction>[0];

const convexModules = modules;
const originalConvexSiteUrl = process.env.CONVEX_SITE_URL;
const originalPrimaryCustomerProfileSid = process.env.TWILIO_PRIMARY_CUSTOMER_PROFILE_SID;
const originalA2pStatusEmail = process.env.TWILIO_A2P_STATUS_EMAIL;
const originalTwilioRequestDelayMs = process.env.TWILIO_A2P_REQUEST_DELAY_MS;

function buildValidDraft(): SmsComplianceDraft {
  return {
    businessName: "Acme Clinic LLC",
    businessType: "Corporation",
    businessIndustry: "HEALTHCARE",
    businessRegistrationIdentifier: "EIN",
    businessRegistrationNumber: "12-3456789",
    websiteUrl: "https://example.com",
    businessRegionsOfOperation: ["USA_AND_CANADA"],
    companyType: "private",
    brandContactEmail: "ops@example.com",
    campaignDescription: "Appointment alerts and AI SMS replies for registered patients.",
    messageFlow:
      "Customers opt in through intake paperwork and online booking forms that clearly disclose SMS consent.",
    sampleMessages: [
      "Acme Clinic: your appointment is tomorrow at 2 PM. Reply STOP to unsubscribe.",
      "Acme Clinic: reply YES to confirm your visit or STOP to unsubscribe from future texts.",
    ],
    hasEmbeddedLinks: false,
    hasEmbeddedPhone: true,
    optInMessage: "Acme Clinic: you are subscribed. Reply HELP for help or STOP to unsubscribe.",
    optOutMessage: "Acme Clinic: you are unsubscribed and will receive no more SMS messages.",
    helpMessage: "Acme Clinic: reply STOP to unsubscribe or call 416-555-0100 for support.",
    optInKeywords: ["START"],
    optOutKeywords: ["STOP"],
    helpKeywords: ["HELP"],
    address: {
      customerName: "Acme Clinic LLC",
      street: "123 Main Street",
      city: "Toronto",
      region: "ON",
      postalCode: "M5V 2T6",
      isoCountry: "CA",
    },
    authorizedRepresentative: {
      firstName: "Jordan",
      lastName: "Lee",
      businessTitle: "Operations Manager",
      jobPosition: "Director",
      phoneNumber: "+14165550188",
      email: "jordan@example.com",
    },
  };
}

async function seedRegistrationContext(
  t: ConvexHarness,
  input: {
    registrationStatus: "approved" | "failed" | "pending_review";
    trafficTier: "low_volume" | "mixed";
    draft: SmsComplianceDraft;
    twilioSids?: Partial<{
      customerProfileSid: string;
      businessInfoSid: string;
      authorizedRepresentativeSid: string;
      addressSid: string;
      addressDocumentSid: string;
      trustProductSid: string;
      messagingProfileSid: string;
      brandRegistrationSid: string;
      messagingServiceSid: string;
      campaignSid: string;
    }>;
    previousSubmission?: {
      trafficTier: "low_volume" | "mixed";
      draft: SmsComplianceDraft;
      resultStatus: "failed" | "pending_review" | "approved";
      twilioCampaignSid?: string;
    };
  },
): Promise<{
  registrationId: Id<"sms_compliance_registrations">;
  phoneNumberId: Id<"phone_numbers">;
}> {
  return await t.run(async (ctx: TestContext) => {
    const businessId: Id<"businesses"> = await ctx.db.insert("businesses", {
      slug: `twilio-a2p-${Date.now()}`,
      name: "Acme Clinic",
      timezone: "America/Toronto",
      businessType: "clinic",
      defaultLocale: "en",
      deploymentMode: "cloud",
      status: "active",
    });

    const phoneNumberId: Id<"phone_numbers"> = await ctx.db.insert("phone_numbers", {
      businessId,
      e164: "+14165550170",
      twilioPhoneSid: "PN-twilio-a2p-test",
      voiceEnabled: true,
      smsEnabled: true,
      status: "active",
    });

    const registrationId: Id<"sms_compliance_registrations"> = await ctx.db.insert(
      "sms_compliance_registrations",
      {
        businessId,
        status: input.registrationStatus,
        customerType: "direct_customer",
        brandKind: "standard_business",
        trafficTier: input.trafficTier,
        draft: input.draft,
        approvedPhoneNumberId: phoneNumberId,
        ...(input.twilioSids?.customerProfileSid
          ? { twilioCustomerProfileSid: input.twilioSids.customerProfileSid }
          : {}),
        ...(input.twilioSids?.businessInfoSid
          ? { twilioBusinessInfoSid: input.twilioSids.businessInfoSid }
          : {}),
        ...(input.twilioSids?.authorizedRepresentativeSid
          ? { twilioAuthorizedRepresentativeSid: input.twilioSids.authorizedRepresentativeSid }
          : {}),
        ...(input.twilioSids?.addressSid ? { twilioAddressSid: input.twilioSids.addressSid } : {}),
        ...(input.twilioSids?.addressDocumentSid
          ? { twilioAddressDocumentSid: input.twilioSids.addressDocumentSid }
          : {}),
        ...(input.twilioSids?.trustProductSid
          ? { twilioTrustProductSid: input.twilioSids.trustProductSid }
          : {}),
        ...(input.twilioSids?.messagingProfileSid
          ? { twilioMessagingProfileSid: input.twilioSids.messagingProfileSid }
          : {}),
        ...(input.twilioSids?.brandRegistrationSid
          ? { twilioBrandRegistrationSid: input.twilioSids.brandRegistrationSid }
          : {}),
        ...(input.twilioSids?.messagingServiceSid
          ? { twilioMessagingServiceSid: input.twilioSids.messagingServiceSid }
          : {}),
        ...(input.twilioSids?.campaignSid
          ? { twilioCampaignSid: input.twilioSids.campaignSid }
          : {}),
      },
    );

    if (input.previousSubmission) {
      await ctx.db.insert("sms_compliance_submissions", {
        registrationId,
        businessId,
        attemptKey: "attempt-1",
        status: input.previousSubmission.resultStatus,
        trafficTier: input.previousSubmission.trafficTier,
        snapshot: {
          trafficTier: input.previousSubmission.trafficTier,
          draft: input.previousSubmission.draft,
        },
        createdAt: "2026-04-17T12:00:00.000Z",
        submittedAt: "2026-04-17T12:00:00.000Z",
        completedAt: "2026-04-17T12:10:00.000Z",
        resultStatus: input.previousSubmission.resultStatus,
        ...(input.previousSubmission.twilioCampaignSid
          ? { twilioCampaignSid: input.previousSubmission.twilioCampaignSid }
          : {}),
      });
    }

    return { registrationId, phoneNumberId };
  });
}

function createTwilioClientFixture() {
  const customerProfileAssignmentCreateMock = vi.fn(async (_sid: string, _params?: unknown) => null);
  const customerProfileEvaluationCreateMock = vi.fn(async (_sid: string, _params?: unknown) => ({
    status: "compliant",
    results: [],
  }));
  const customerProfileUpdateMock = vi.fn(async (_sid: string, _params?: unknown) => ({}));
  const customerProfileFetchMock = vi.fn(async (sid: string) => ({
    sid,
    ...(sid === process.env.TWILIO_PRIMARY_CUSTOMER_PROFILE_SID ? { policySid: "RN-primary" } : {}),
  }));
  const customerProfileCreateMock = vi.fn(async () => ({ sid: "BU-created" }));

  const endUserUpdateMock = vi.fn(async (_sid: string, _params?: unknown) => ({}));
  const endUserCreateMock = vi.fn(async () => ({ sid: "IT-created" }));

  const addressUpdateMock = vi.fn(async (_sid: string, _params?: unknown) => ({}));
  const addressCreateMock = vi.fn(async () => ({ sid: "AD-created" }));

  const supportingDocumentUpdateMock = vi.fn(async (_sid: string, _params?: unknown) => ({}));
  const supportingDocumentCreateMock = vi.fn(async () => ({ sid: "RD-created" }));

  const trustProductAssignmentCreateMock = vi.fn(async (_sid: string, _params?: unknown) => null);
  const trustProductEvaluationCreateMock = vi.fn(async (_sid: string, _params?: unknown) => ({
    status: "compliant",
    results: [],
  }));
  const trustProductUpdateMock = vi.fn(async (_sid: string, _params?: unknown) => ({}));
  const trustProductCreateMock = vi.fn(async () => ({ sid: "BU-trust-created" }));

  const brandCreateMock = vi.fn(async () => ({
    sid: "BN-created",
    status: "PENDING",
    errors: [],
  }));
  const brandFetchMock = vi.fn(async (sid: string) => ({
    sid,
    status: "APPROVED",
    errors: [],
  }));
  const brandUpdateMock = vi.fn(async (sid: string) => ({
    sid,
    status: "PENDING",
    errors: [],
  }));

  const serviceUpdateMock = vi.fn(async (_sid: string, _params?: unknown) => ({}));
  const serviceCreateMock = vi.fn(async () => ({ sid: "MG-created" }));

  const campaignFetchMock = vi.fn(async (_serviceSid: string, campaignSid: string) => ({
    sid: campaignSid,
    campaignStatus: "FAILED",
    errors: [],
  }));
  const campaignUpdateMock = vi.fn(
    async (_serviceSid: string, campaignSid: string, _params?: unknown) => ({
      sid: campaignSid,
      campaignStatus: "PENDING",
      errors: [],
    }),
  );
  const campaignRemoveMock = vi.fn(async (_serviceSid: string, _campaignSid: string) => true);
  const campaignCreateMock = vi.fn(async (_serviceSid: string, _params?: unknown) => ({
    sid: "QE-created",
    campaignStatus: "PENDING",
    errors: [],
  }));
  const campaignListMock = vi.fn(async (_serviceSid: string, _params?: unknown) => []);

  const phoneNumbersListMock = vi.fn(async (_serviceSid: string, _params?: unknown) => []);
  const phoneNumbersCreateMock = vi.fn(async (_serviceSid: string, _params?: unknown) => ({}));

  const client = {
    api: {
      v2010: {
        account: {
          addresses: Object.assign(
            (sid: string) => ({
              update: (params: unknown) => addressUpdateMock(sid, params),
            }),
            {
              create: addressCreateMock,
            },
          ),
        },
      },
    },
    trusthub: {
      v1: {
        customerProfiles: Object.assign(
          (sid: string) => ({
            fetch: () => customerProfileFetchMock(sid),
            update: (params?: unknown) => customerProfileUpdateMock(sid, params),
            evaluations: {
              create: (params: unknown) => customerProfileEvaluationCreateMock(sid, params),
            },
            customerProfilesEntityAssignments: {
              create: (params: unknown) => customerProfileAssignmentCreateMock(sid, params),
            },
          }),
          {
            create: customerProfileCreateMock,
          },
        ),
        endUsers: Object.assign(
          (sid: string) => ({
            update: (params: unknown) => endUserUpdateMock(sid, params),
          }),
          {
            create: endUserCreateMock,
          },
        ),
        supportingDocuments: Object.assign(
          (sid: string) => ({
            update: (params: unknown) => supportingDocumentUpdateMock(sid, params),
          }),
          {
            create: supportingDocumentCreateMock,
          },
        ),
        trustProducts: Object.assign(
          (sid: string) => ({
            update: (params?: unknown) => trustProductUpdateMock(sid, params),
            evaluations: {
              create: (params: unknown) => trustProductEvaluationCreateMock(sid, params),
            },
            trustProductsEntityAssignments: {
              create: (params: unknown) => trustProductAssignmentCreateMock(sid, params),
            },
          }),
          {
            create: trustProductCreateMock,
          },
        ),
      },
    },
    messaging: {
      v1: {
        brandRegistrations: Object.assign(
          (sid: string) => ({
            fetch: () => brandFetchMock(sid),
            update: () => brandUpdateMock(sid),
          }),
          {
            create: brandCreateMock,
          },
        ),
        services: Object.assign(
          (sid: string) => ({
            update: (params: unknown) => serviceUpdateMock(sid, params),
            usAppToPerson: Object.assign(
              (campaignSid: string) => ({
                fetch: () => campaignFetchMock(sid, campaignSid),
                update: (params: unknown) => campaignUpdateMock(sid, campaignSid, params),
                remove: () => campaignRemoveMock(sid, campaignSid),
              }),
              {
                create: (params: unknown) => campaignCreateMock(sid, params),
                list: (params: unknown) => campaignListMock(sid, params),
              },
            ),
            phoneNumbers: {
              list: (params: unknown) => phoneNumbersListMock(sid, params),
              create: (params: unknown) => phoneNumbersCreateMock(sid, params),
            },
          }),
          {
            create: serviceCreateMock,
          },
        ),
      },
    },
  };

  return {
    client,
    mocks: {
      addressCreateMock,
      addressUpdateMock,
      brandFetchMock,
      campaignCreateMock,
      campaignFetchMock,
      campaignRemoveMock,
      campaignUpdateMock,
      customerProfileFetchMock,
      endUserUpdateMock,
      phoneNumbersCreateMock,
      phoneNumbersListMock,
      serviceUpdateMock,
      supportingDocumentUpdateMock,
    },
  };
}

beforeEach(() => {
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  process.env.TWILIO_PRIMARY_CUSTOMER_PROFILE_SID = "BU-primary-profile";
  process.env.TWILIO_A2P_STATUS_EMAIL = "a2p-status@example.com";
  process.env.TWILIO_A2P_REQUEST_DELAY_MS = "0";
});

afterEach(() => {
  vi.clearAllMocks();
  process.env.CONVEX_SITE_URL = originalConvexSiteUrl;
  process.env.TWILIO_PRIMARY_CUSTOMER_PROFILE_SID = originalPrimaryCustomerProfileSid;
  process.env.TWILIO_A2P_STATUS_EMAIL = originalA2pStatusEmail;
  process.env.TWILIO_A2P_REQUEST_DELAY_MS = originalTwilioRequestDelayMs;
});

describe("twilioA2p syncRegistration", () => {
  it("updates existing Twilio resources and recreates failed campaigns for immutable changes", async () => {
    const t = convexTest(schema, convexModules);
    const currentDraft = buildValidDraft();
    const previousDraft = {
      ...buildValidDraft(),
      optOutMessage: "Acme Clinic: reply STOP to stop receiving messages.",
    };

    const { registrationId } = await seedRegistrationContext(t, {
      registrationStatus: "failed",
      trafficTier: "low_volume",
      draft: currentDraft,
      twilioSids: {
        customerProfileSid: "BU-customer",
        businessInfoSid: "IT-business",
        authorizedRepresentativeSid: "IT-authorized",
        addressSid: "AD-address",
        addressDocumentSid: "RD-address-doc",
        trustProductSid: "BU-trust",
        messagingProfileSid: "IT-messaging",
        brandRegistrationSid: "BN-brand",
        messagingServiceSid: "MG-service",
        campaignSid: "QE-failed",
      },
      previousSubmission: {
        trafficTier: "low_volume",
        draft: previousDraft,
        resultStatus: "failed",
        twilioCampaignSid: "QE-failed",
      },
    });

    const fixture = createTwilioClientFixture();
    getTwilioClientMock.mockReturnValue(fixture.client);

    const context = await t.query(internal.smsCompliance.getTwilioRegistrationContext, {
      registrationId,
    });
    expect(context.previousCompletedSubmission?.snapshot.draft.optOutMessage).toBe(
      previousDraft.optOutMessage,
    );

    const result = await t.action(internal.integrations.twilioA2p.syncRegistration, {
      registrationId,
      mode: "submit",
    });

    expect(fixture.mocks.endUserUpdateMock).toHaveBeenCalledWith(
      "IT-business",
      expect.objectContaining({
        attributes: expect.objectContaining({
          business_name: "Acme Clinic LLC",
        }),
      }),
    );
    expect(fixture.mocks.endUserUpdateMock).toHaveBeenCalledWith(
      "IT-authorized",
      expect.objectContaining({
        attributes: expect.objectContaining({
          first_name: "Jordan",
        }),
      }),
    );
    expect(fixture.mocks.endUserUpdateMock).toHaveBeenCalledWith(
      "IT-messaging",
      expect.objectContaining({
        attributes: expect.objectContaining({
          company_type: "private",
        }),
      }),
    );
    expect(fixture.mocks.addressUpdateMock).toHaveBeenCalledWith(
      "AD-address",
      expect.objectContaining({
        customerName: "Acme Clinic LLC",
      }),
    );
    expect(fixture.mocks.supportingDocumentUpdateMock).toHaveBeenCalledWith(
      "RD-address-doc",
      expect.objectContaining({
        attributes: {
          address_sids: "AD-address",
        },
      }),
    );
    expect(fixture.mocks.campaignRemoveMock).toHaveBeenCalledWith("MG-service", "QE-failed");
    expect(fixture.mocks.campaignCreateMock).toHaveBeenCalledWith(
      "MG-service",
      expect.objectContaining({
        optOutMessage: currentDraft.optOutMessage,
        usAppToPersonUsecase: "LOW_VOLUME",
      }),
    );
    expect(fixture.mocks.campaignUpdateMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "pending_review",
      twilioCampaignSid: "QE-created",
    });
  });

  it("keeps approved registrations approved when refresh hits a transient Twilio error", async () => {
    const t = convexTest(schema, convexModules);
    const { registrationId } = await seedRegistrationContext(t, {
      registrationStatus: "approved",
      trafficTier: "low_volume",
      draft: buildValidDraft(),
      twilioSids: {
        customerProfileSid: "BU-customer",
        brandRegistrationSid: "BN-approved",
        messagingServiceSid: "MG-approved",
        campaignSid: "QE-approved",
      },
    });

    const fixture = createTwilioClientFixture();
    fixture.mocks.brandFetchMock.mockRejectedValueOnce(new Error("Twilio timeout"));
    getTwilioClientMock.mockReturnValue(fixture.client);

    const result = await t.action(internal.integrations.twilioA2p.syncRegistration, {
      registrationId,
      mode: "refresh",
    });

    expect(result).toMatchObject({
      status: "approved",
      twilioMessagingServiceSid: "MG-approved",
      twilioCampaignSid: "QE-approved",
    });
    expect(result.failureCode).toBeUndefined();
    expect(result.failureMessage).toBeUndefined();
    expect(result.pendingAction).toBeUndefined();
  });
});
