# Security Review: `feature/ope-16-twilio-sms-status` vs `main`

## Executive Summary

I reviewed the SMS/Twilio/agent changes on this branch against `main`, with special attention to webhook trust boundaries, prompt injection, tool abuse, tenant isolation, and confirmation fallback behavior.

No new critical, high, medium, or low-severity security vulnerabilities remain in this diff after the prompt-hardening follow-up. The branch improves several security-relevant areas: Twilio SMS ingress and status callbacks now require signed webhooks, prompt context explicitly labels customer and knowledge inputs as untrusted, the booking tools ignore model-supplied freeform arguments and instead operate on the actual SMS text plus stored conversation state, and the SMS runtime no longer injects raw tenant `smsInstructions` into the hidden system prompt.

I also ran `pnpm audit --prod --dev`, which reported no known dependency vulnerabilities at the time of review.

## Critical

No critical findings in the branch diff reviewed.

## High

No high-severity findings in the branch diff reviewed.

## Medium

No medium-severity findings in the branch diff reviewed.

## Low

No low-severity findings remain in the reviewed diff after the prompt-hardening follow-up.

## Prompt Injection Review

### What I checked

- Separation of untrusted inputs from system instructions
- Whether tool calls can be induced from retrieved knowledge instead of the actual customer SMS
- Whether model output alone can cause booking, cancellation, or resend side effects
- Whether stale thread or booking state could enable cross-turn unsafe actions

### What looks good

- Customer SMS and retrieved knowledge are explicitly marked untrusted in the prompt construction:
  - `convex/ai/agents/runtime.ts:39-45`
  - `convex/ai/agents/runtime.ts:69-75`
- The tool layer does not accept model-supplied freeform arguments for privileged actions; each tool ignores model parameters and uses the real `conversationPrompt` plus stored server-side state instead:
  - `convex/ai/agents/runtime.ts:1001-1078`
- Knowledge lookup stays business-scoped by namespace:
  - `convex/ai/context/knowledge.ts:211-219`
- Blank or malformed model output no longer creates an empty outbound SMS body; the runtime falls back to a safe reply:
  - `convex/ai/agents/runtime.ts:1900-1905`
  - `convex/conversations/webhooks.ts:615-620`
- The runtime explicitly instructs the model not to claim bookings, cancellations, or reschedules unless a tool-backed reply already confirmed that state:
  - `convex/ai/agents/runtime.ts:34-47`

### Residual prompt-injection risk

- Retrieved knowledge and customer content are labeled untrusted, and the tool handlers materially reduce the risk of model-driven unauthorized booking actions.
- The branch now removes raw tenant `smsInstructions` from the hidden SMS system prompt and short-circuits direct prompt-extraction attempts with a refusal response.
- Hidden prompt leakage is still a general LLM risk category, but I did not identify a remaining branch-specific prompt-injection issue in the current diff.

## Webhook Authenticity and Trust Boundaries

### What looks good

- Both inbound SMS and SMS status callbacks require a valid `X-Twilio-Signature` before side effects:
  - `convex/http.ts:203-231`
  - `convex/http.ts:246-320`
- Signature validation is delegated to the official Twilio SDK:
  - `convex/integrations/twilioSms.ts:23-36`
- Status callbacks only mutate records matched by `providerMessageSid`, and transition guards prevent regressions from terminal states:
  - `convex/integrations/twilioMessageStatus.ts:24-73`
  - `packages/shared/src/twilioMessageStatus.ts`

### Operational note

- Twilio signature validation depends on the runtime seeing the same URL Twilio signed. I did not find a branch-introduced bug here, but this should still be verified in production behind any proxy or custom-domain setup.

## Delivery Failure Confirmation Fallback

### What looks good

- The branch correctly adds a fallback confirmation path if the conversational booking confirmation SMS fails synchronously or later reconciles to `failed` / `undelivered`:
  - `convex/conversations/webhooks.ts:444-507`
  - `convex/integrations/twilioMessageStatus.ts:55-65`
  - `convex/notifications/reminders.ts:210-252`
- The notification dedupe path on `kind + relatedId` prevents duplicate fallback confirmations for the same appointment:
  - `convex/notifications/reminders.ts:220-252`
  - `convex/schema.ts:361-371`

## Validation Performed

- Reviewed `git diff --stat main...HEAD`
- Inspected security-relevant diffs in:
  - `convex/http.ts`
  - `convex/conversations/webhooks.ts`
  - `convex/integrations/twilioSms.ts`
  - `convex/integrations/twilioMessageStatus.ts`
  - `convex/ai/agents/runtime.ts`
  - `convex/ai/context/knowledge.ts`
  - `convex/notifications/reminders.ts`
  - `convex/schema.ts`
- Ran:
  - `pnpm audit --prod --dev`

## Conclusion

This branch does not appear to introduce new critical, high, medium, or low security vulnerabilities relative to `main` after the prompt-hardening follow-up. The prompt-injection posture is materially improved by separating untrusted content from the system prompt, removing raw tenant `smsInstructions` from the hidden SMS prompt, refusing direct prompt-extraction attempts, and constraining tool handlers to server-side conversation state instead of model-supplied arguments.
