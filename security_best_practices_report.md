# Security Best Practices Report

## Executive Summary

I reviewed this branch against `main`, focusing on the changed Convex SMS runtime and its tests.

I found 3 security-relevant issues:

- 1 High severity integrity flaw where the model can supply booking-confirmation tool arguments that are trusted strongly enough to finalize a booking even if the customer's current SMS did not confirm it.
- 1 Medium severity confidentiality/integrity flaw where overly broad appointment-change intent matching can disclose appointment details in response to unrelated "change" or "move" requests.
- 1 Medium severity privacy/data-minimization issue where confirmed appointment details are injected into the LLM system prompt before any tool-backed lookup is required.

I did not find evidence in this branch diff of DOM XSS sinks, unsafe HTML rendering, dynamic code execution, unsafe third-party script loading, or direct secret leakage to the browser.

## Scope And Method

- Compared `main...HEAD`
- Reviewed changed files:
  - [convex/ai/agents/runtime.ts](/Users/raphael/Coding/ai-receptionist/convex/ai/agents/runtime.ts)
  - [packages/testing/src/smsAvailabilityFlow.test.ts](/Users/raphael/Coding/ai-receptionist/packages/testing/src/smsAvailabilityFlow.test.ts)
- Applied the TypeScript/Node and React/frontend security guidance from the `security-best-practices` skill, focusing on:
  - trust-boundary handling
  - model/tool trust
  - unintended data disclosure
  - action confirmation and authorization-by-prompt patterns

## High Severity Findings

### SEC-001: Model-supplied confirmation arguments can book an offered slot without user-confirmed intent

- Severity: High
- Location:
  - [convex/ai/agents/runtime.ts](/Users/raphael/Coding/ai-receptionist/convex/ai/agents/runtime.ts#L2139)
  - [convex/ai/agents/runtime.ts](/Users/raphael/Coding/ai-receptionist/convex/ai/agents/runtime.ts#L2452)
- Impact:
  - A prompt-injected, hallucinating, or simply mistaken model can finalize a booking for a previously offered slot even if the user's latest SMS did not confirm that booking.
  - This breaks the intended "backend validates actions from actual customer confirmation" boundary and allows unauthorized state changes driven by model-generated tool args rather than the customer's message.
- Evidence:

```ts
const structuredSchedulingText = buildSchedulingTextFromToolArgs(toolArgs);
const schedulingText = structuredSchedulingText ?? promptSchedulingText;
const selectedStartsAtInput = toolArgs?.selectedStartsAt?.trim();
```

```ts
const shouldBookRequestedTime =
  (toolArgs?.confirmSelection === true || looksLikeBookingConfirmation(prompt)) &&
  selectedOfferedSlot !== null;
if (exactAvailability.length > 0) {
  if (shouldBookRequestedTime) {
    const bookingResult = await bookConversationAppointment(ctx, {
      businessId,
      startsAt,
      service,
      timezone: snapshot.timezone,
      conversationId,
      locale,
    });
```

- Why this is a security issue:
  - The model is untrusted for state-changing authority. Tool arguments should help normalize user intent, not replace it.
  - In the current code, `confirmSelection: true` from the model is sufficient to book an offered slot, even when the actual `prompt` is not a confirmation.
- Fix:
  - Require the customer's current SMS to independently satisfy a confirmation rule before booking.
  - Treat model-supplied `confirmSelection` as advisory only, not authoritative.
  - Keep `selectedStartsAt` for exact slot resolution, but gate final booking on prompt-backed confirmation or a server-side pending-confirmation state transition that can only be advanced by a prompt-confirmed reply.
- Mitigation:
  - Add regression tests where the model supplies `confirmSelection: true` on a non-confirming prompt and assert that no booking is created.
  - Consider splitting the tool contract into:
    - `resolveSlotSelection(...)`
    - `confirmBookedSlot(...)`
    so the mutating step always has an explicit prompt-backed confirmation check.
- False positive notes:
  - This is not a generic "LLMs can hallucinate" concern. The mutating booking path is concretely gated by `toolArgs?.confirmSelection === true`, which is model-controlled.

## Medium Severity Findings

### SEC-002: Overly broad appointment-change detection can disclose appointment details on unrelated "change" or "move" requests

- Severity: Medium
- Location:
  - [convex/ai/agents/runtime.ts](/Users/raphael/Coding/ai-receptionist/convex/ai/agents/runtime.ts#L398)
  - [convex/ai/agents/runtime.ts](/Users/raphael/Coding/ai-receptionist/convex/ai/agents/runtime.ts#L1651)
  - [convex/ai/agents/runtime.ts](/Users/raphael/Coding/ai-receptionist/convex/ai/agents/runtime.ts#L1689)
- Impact:
  - Messages like "Can you change to English?" or "Move me to a human." can be misclassified as appointment-change requests.
  - If the conversation has a confirmed appointment, the assistant can answer with appointment-specific details even though the user did not ask about cancelling or rescheduling that appointment.
- Evidence:

```ts
function looksLikeAppointmentChangeRequest(text: string): boolean {
  return /\b(cancel(?:led|ling)?|resched(?:ule|uled|uling)?|move|change|annul(?:er|e|ee|é)?|report(?:er|e|ee|é)?|deplac(?:er|e|ee|é)|modifi(?:er|e|ee|é))\b/i.test(
    normalizeComparable(text),
  );
}
```

```ts
if (!looksLikeAppointmentChangeRequest(prompt)) {
  return null;
}
```

```ts
return buildAppointmentChangeUnavailableReply(status.appointment, locale);
```

- Why this is a security issue:
  - Appointment data should only be disclosed when the prompt is actually about appointment cancellation or rescheduling.
  - Matching generic words like `change` and `move` violates least-disclosure expectations and can leak appointment details in unrelated conversational flows.
- Fix:
  - Tighten the detector so change/cancel intent only matches when an appointment term is also present, for example requiring both:
    - a change verb (`cancel`, `reschedule`, `move`, `change`)
    - and an appointment object (`appointment`, `booking`, `rendez-vous`, etc.)
  - Alternatively, move this classification fully into a structured model tool call and keep the backend matcher as a narrower guardrail.
- Mitigation:
  - Add regression tests for benign prompts such as:
    - "Can you change to English?"
    - "Move me to a human"
    and assert that no appointment details are returned.
- False positive notes:
  - This is branch-specific because the new model-first flow makes appointment-change status a primary tool-backed path and keeps the broad matcher as the authoritative backend gate.

### SEC-003: Confirmed appointment details are injected into the LLM system prompt even before a tool-backed lookup is needed

- Severity: Medium
- Location:
  - [convex/ai/agents/runtime.ts](/Users/raphael/Coding/ai-receptionist/convex/ai/agents/runtime.ts#L1496)
  - [convex/ai/agents/runtime.ts](/Users/raphael/Coding/ai-receptionist/convex/ai/agents/runtime.ts#L3044)
- Impact:
  - Exact confirmed appointment details are sent to the model as hidden system context for every model-routed SMS, even when the user has not asked an appointment question.
  - This expands unnecessary disclosure of appointment metadata to the LLM provider and undermines the intended "tool-backed facts only" design, because the model can answer from hidden prompt state instead of calling the lookup tool.
- Evidence:

```ts
if (mode === "booked" && input.state?.lastConfirmedStartsAt && input.state.lastConfirmedServiceId) {
  const service = input.services.find(
    (candidate) => candidate._id === input.state?.lastConfirmedServiceId,
  );
  const formattedStart = formatRuntimeAppointmentDateTime(
    input.state.lastConfirmedStartsAt,
    input.timezone,
    "en",
  );
  return `A booking is already confirmed${service ? ` for ${service.name}` : ""} on ${formattedStart}. Answer unrelated questions directly unless the user asks to change that appointment.`;
}
```

```ts
const result = await receptionistAgent.generateText(
  ctx,
  { threadId },
  {
    system: buildGroundedSystemPrompt({
      ...
      bookingStateSummary: buildBookingStateSummary({
        state: bookingState,
        services,
        timezone: snapshot.timezone,
      }),
    }),
```

- Why this is a security issue:
  - The model now has access to exact appointment details even when no appointment tool was called.
  - That weakens the branch's own security goal that appointment facts should come from structured, tool-backed validation rather than prompt memory.
  - It also sends more personal scheduling data to the model provider than is strictly necessary for many non-appointment prompts.
- Fix:
  - Remove exact confirmed appointment date/time/service details from the always-present `bookingStateSummary`.
  - Keep only coarse state such as "a booking is already confirmed" in the system prompt.
  - Require `getCurrentAppointment` / `getAppointmentChangeStatus` to provide exact details on demand.
- Mitigation:
  - If some summary context must remain, redact it to the minimum useful shape, for example:
    - `A booking is already confirmed. Use appointment tools if the customer asks about it.`
- False positive notes:
  - This is not a browser exposure issue; it is a model/provider data-minimization and tool-bypass issue within the backend prompt assembly.

## Recommended Next Steps

1. Fix SEC-001 before merging. It is the only finding here that can directly create unauthorized bookings.
2. Tighten appointment-change intent matching in SEC-002 so unrelated "change" requests do not disclose appointment details.
3. Remove exact appointment data from `bookingStateSummary` per SEC-003 so the model must rely on structured lookup tools for those facts.
4. After fixes, rerun:
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
   - manual SMS smoke tests for:
     - non-confirming messages after offered slots
     - locale-switch/change wording
     - current appointment lookup
     - unsupported cancel/reschedule replies
