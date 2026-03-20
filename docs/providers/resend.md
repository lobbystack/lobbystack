# Resend Auth Email Setup

This repo sends auth email through the official `@convex-dev/resend` Convex component.

## Required Environment

Set these variables before testing auth email:

- `RESEND_API_KEY`
- `EMAIL_FROM_ADDRESS`

Development keeps the Resend component in test mode by default because the repo uses `DEPLOYMENT_MODE=development`.

## Local Verification

1. Start or refresh Convex codegen with `pnpm convex dev`.
2. Run the web app with `pnpm dev`.
3. Open `/forgot-password` in the dashboard.
4. Submit a Resend test inbox such as `delivered@resend.dev` or a labeled variant like `delivered+ope55@resend.dev`.
5. Confirm the reset code email is accepted in Resend test mode.
6. Complete the reset flow with the emailed code and a new password.
7. Confirm the updated password can sign in successfully.

## Production Notes

- Real delivery requires `DEPLOYMENT_MODE` to be something other than `development`.
- The configured `EMAIL_FROM_ADDRESS` must be a sender that your Resend account can use.
- This first pass wires only password reset email. Signup verification and other transactional templates are reserved for follow-up work.
