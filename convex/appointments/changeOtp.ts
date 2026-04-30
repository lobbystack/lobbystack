"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getTwilioClient, requireTwilioVerifyServiceSid } from "../lib/node/twilioClient";

type TwilioVerificationResult = {
  sid: string;
  status: string;
};

type TwilioVerificationCheckResult = {
  status: string;
};

type StartAppointmentChangeOtpResult =
  | {
      ok: true;
      status: "pending" | "approved";
      verificationId: Id<"appointment_change_verifications">;
      otpPhone: string;
    }
  | {
      ok: false;
      reason: string;
    };

type VerifyAppointmentChangeOtpResult =
  | {
      ok: true;
      status: "approved";
      verificationId: Id<"appointment_change_verifications">;
    }
  | {
      ok: false;
      status: "pending";
      reason: string;
    };

function buildVerificationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "We couldn't verify that code right now.";
}

function isExpired(verification: Doc<"appointment_change_verifications">): boolean {
  return verification.expiresAt < new Date().toISOString();
}

export const startAppointmentChangeOtp = internalAction({
  args: {
    verificationId: v.id("appointment_change_verifications"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<StartAppointmentChangeOtpResult> => {
    const verification: Doc<"appointment_change_verifications"> | null = await ctx.runQuery(
      internal.appointments.changes.getAppointmentChangeVerification,
      { verificationId: args.verificationId },
    );
    if (!verification) {
      return { ok: false, reason: "verification_not_found" };
    }
    if (isExpired(verification)) {
      return { ok: false, reason: "verification_expired" };
    }
    if (verification.status === "otp_verified") {
      return {
        ok: true,
        status: "approved",
        verificationId: verification._id,
        otpPhone: verification.otpPhone ?? verification.callerPhone,
      };
    }
    if (verification.status !== "otp_pending") {
      return { ok: false, reason: "otp_not_required" };
    }

    const otpPhone = verification.otpPhone ?? verification.callerPhone;
    try {
      const client = getTwilioClient();
      const verifyServiceSid = requireTwilioVerifyServiceSid();
      const twilioVerification: TwilioVerificationResult = await client.verify.v2
        .services(verifyServiceSid)
        .verifications.create({
          to: otpPhone,
          channel: "sms",
        });

      await ctx.runMutation(internal.appointments.changes.markAppointmentChangeOtpStarted, {
        verificationId: verification._id,
        verificationSid: twilioVerification.sid,
        status: "otp_pending",
        updatedAt: new Date().toISOString(),
      });

      return {
        ok: true,
        status: "pending",
        verificationId: verification._id,
        otpPhone,
      };
    } catch (error) {
      await ctx.runMutation(internal.appointments.changes.updateAppointmentChangeOtpStatus, {
        verificationId: verification._id,
        status: "otp_pending",
        updatedAt: new Date().toISOString(),
        attemptCount: verification.attemptCount,
        lastError: buildVerificationErrorMessage(error),
      });
      return { ok: false, reason: buildVerificationErrorMessage(error) };
    }
  },
});

export const verifyAppointmentChangeOtp = internalAction({
  args: {
    verificationId: v.id("appointment_change_verifications"),
    code: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<VerifyAppointmentChangeOtpResult> => {
    const verification: Doc<"appointment_change_verifications"> | null = await ctx.runQuery(
      internal.appointments.changes.getAppointmentChangeVerification,
      { verificationId: args.verificationId },
    );
    if (!verification) {
      return { ok: false, status: "pending", reason: "verification_not_found" };
    }
    if (isExpired(verification)) {
      return { ok: false, status: "pending", reason: "verification_expired" };
    }
    if (verification.status === "otp_verified") {
      return {
        ok: true,
        status: "approved",
        verificationId: verification._id,
      };
    }
    if (!verification.verificationSid) {
      return { ok: false, status: "pending", reason: "otp_not_started" };
    }

    const nextAttemptCount = verification.attemptCount + 1;
    try {
      const client = getTwilioClient();
      const verifyServiceSid = requireTwilioVerifyServiceSid();
      const result: TwilioVerificationCheckResult = await client.verify.v2
        .services(verifyServiceSid)
        .verificationChecks.create({
          verificationSid: verification.verificationSid,
          code: args.code.trim(),
        });

      if (result.status === "approved") {
        await ctx.runMutation(internal.appointments.changes.markAppointmentChangeOtpApproved, {
          verificationId: verification._id,
          status: "otp_verified",
          approvedAt: new Date().toISOString(),
          attemptCount: nextAttemptCount,
        });
        return {
          ok: true,
          status: "approved",
          verificationId: verification._id,
        };
      }

      const message = "That verification code is invalid or expired. Try requesting a new one.";
      await ctx.runMutation(internal.appointments.changes.updateAppointmentChangeOtpStatus, {
        verificationId: verification._id,
        status: "otp_pending",
        updatedAt: new Date().toISOString(),
        attemptCount: nextAttemptCount,
        lastError: message,
      });
      return { ok: false, status: "pending", reason: message };
    } catch (error) {
      const message = buildVerificationErrorMessage(error);
      await ctx.runMutation(internal.appointments.changes.updateAppointmentChangeOtpStatus, {
        verificationId: verification._id,
        status: "otp_pending",
        updatedAt: new Date().toISOString(),
        attemptCount: nextAttemptCount,
        lastError: message,
      });
      return { ok: false, status: "pending", reason: message };
    }
  },
});
