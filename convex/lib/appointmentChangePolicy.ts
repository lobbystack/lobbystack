import { v } from "convex/values";

export const appointmentChangeVerificationModeValidator = v.union(
  v.literal("phone_match_and_facts"),
  v.literal("otp_required"),
  v.literal("operator_only"),
);

export const appointmentChangePolicyValidator = v.object({
  enabled: v.boolean(),
  allowCancel: v.boolean(),
  allowReschedule: v.boolean(),
  verificationMode: appointmentChangeVerificationModeValidator,
});

export type AppointmentChangeVerificationMode =
  | "phone_match_and_facts"
  | "otp_required"
  | "operator_only";

export type AppointmentChangePolicy = {
  enabled: boolean;
  allowCancel: boolean;
  allowReschedule: boolean;
  verificationMode: AppointmentChangeVerificationMode;
};

export const DEFAULT_APPOINTMENT_CHANGE_POLICY: AppointmentChangePolicy = {
  enabled: true,
  allowCancel: true,
  allowReschedule: true,
  verificationMode: "phone_match_and_facts",
};

export function normalizeAppointmentChangePolicy(
  policy: Partial<AppointmentChangePolicy> | null | undefined,
): AppointmentChangePolicy {
  return {
    enabled: policy?.enabled ?? DEFAULT_APPOINTMENT_CHANGE_POLICY.enabled,
    allowCancel: policy?.allowCancel ?? DEFAULT_APPOINTMENT_CHANGE_POLICY.allowCancel,
    allowReschedule:
      policy?.allowReschedule ?? DEFAULT_APPOINTMENT_CHANGE_POLICY.allowReschedule,
    verificationMode:
      policy?.verificationMode ?? DEFAULT_APPOINTMENT_CHANGE_POLICY.verificationMode,
  };
}
