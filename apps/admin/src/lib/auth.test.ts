import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";

import { rejectExistingUserSignUp } from "./auth";

describe("existing-user signup policy", () => {
  it("stops duplicate signup before the verification-code hook can sign in an existing account", () => {
    expect.assertions(3);

    try {
      rejectExistingUserSignUp();
    } catch (cause) {
      expect(cause).toBeInstanceOf(APIError);
      const error = cause as APIError;
      expect(error.statusCode).toBe(422);
      expect(error.body).toMatchObject({
        code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
        message: "An account with this email already exists. Sign in instead.",
      });
    }
  });
});
