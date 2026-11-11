# Spec: required phone number and 14-day trial at signup

Status: ready-for-agent

## Problem Statement

A direct customer can finish onboarding without a phone number. The number step offers "I'll add a number later", and the plans offer Free, which also moves on without one. An owner who skips never hears their agent answer a real call. Getting started then asks them to hear their agent in the browser and to connect a number, and neither step proves that a caller can reach the agent.

The 14-day trial number already exists: a first number claimed without a paid plan starts it. Owners don't see it as a trial, though. Nothing tells them how many days are left until the last week, and nothing on Home tells them whether forwarding from their current line works.

Onboarding also asks questions that don't move the owner closer to an answered call: a mobile number and a text code before the number, and what they want the agent to do first.

## Solution

A direct customer signs up, gives their website, and picks a number. Onboarding no longer asks for their mobile or for a goal. The only way past the number step without a number is a country where LobbyStack sells none.

Right after the number, onboarding shows the plans, with no way to close them. The first card, **Start 14-day free trial**, needs no card. **Starter** and **Pro** follow with **Subscribe**. While the trial runs, the sidebar shows **Free trial · Nd left** with **View plans**.

Home's Getting started changes for a business that has, or had, a number:

1. Read the rest of your site
2. Call your number
3. Forward calls from your current number
4. Add opening hours, only when the agent books directly and no hours are saved
5. Add more sources

Step 3 finishes on its own when LobbyStack sees the first forwarded call, and shows the line it learned: "Forwarding from +1 …".

Partners' businesses and white-label businesses keep their onboarding, their Getting started and their trial-number rules.

## Decisions

The product owner made these calls. Each one is settled.

- **No skip for direct customers.** A direct customer can't skip the number step. The only fallback is a country where LobbyStack can't provide numbers. The server trusts the country the owner picks and logs it.
- **Self-hosted keeps the skip.** A self-hosted direct business keeps "I'll add a number later".
- **Partners don't change.** Partners' businesses and white-label businesses keep their flow and their trial-number rules exactly.
- **Plans screen.** It has no close button. The first card reads **Start 14-day free trial** and needs no card. It only moves onboarding on, because the trial clock started when the worker bought the number. **Starter** and **Pro** follow with **Subscribe**. Plan names don't change.
- **Refused trial.** When the trial was refused (already used, network limited, unsupported country), the number step shows Starter, Pro and Enterprise, and no Free card.
- **Sidebar chip.** While the trial runs, the sidebar footer shows **Free trial · Nd left** with **View plans**, which opens the existing upgrade dialog. In the trial's last week the chip shows alone: the top banner no longer counts down.
- **After 14 days with no plan.** LobbyStack releases the number as it does today. The business drops to Free without a number: 30 minutes, browser and chat.
- **Getting started for a business with a number,** in order: Read the rest of your site (manual, unchanged); Call your number (done on the first answered real phone call); Forward calls from your current number (opens the existing forwarding dialog, done on the first detected forwarded call, shows "Forwarding from +1 …", with an **It works** button after the test call as the fallback); Add opening hours (only when the agent books directly and no hours are saved, as today); Add more sources.
- **Free after the trial.** With no number, the forwarding step says to choose a plan to get the number back.
- **Classic list.** Partners' businesses and businesses that never had a number keep today's steps.
- **No phone step for direct customers.** Onboarding drops "Verify your phone" (stage `verify_phone`) for direct customers. Partners keep it.
- **No goal step.** Onboarding drops "What do you want your agent to do first?" (stage `goal`) for everyone. After the plans, onboarding goes to the attribution question.
- **Attribution is required.** "How did you hear about LobbyStack?" has no Skip link, and the server refuses to move past it without an answer. Partners never see the step, as today.
- **Back to dashboard.** A person who creates another workspace from the workspace switcher gets **Back to dashboard** in the onboarding header when they have a finished workspace. It opens that workspace's Home and leaves the new one as it is.
- **Number step title.** The title names the agent: "Pick your agent's phone number". A new workspace's number goes to its default agent.

## How the trial works today

This feature builds on the trial in `packages/domain/src/server/numberTrials.ts` and adds no second one.

- **Claim:** a cloud business on Free claims its first number through `app.reserve_trial_number_claim`. The claim refuses a second trial for the same workspace, user, verified phone or network (`app.number_trial_used`, `app.number_trial_ip_used`), an unverified email, and a disposable email. Australia has no trial.
- **Start:** `activateNumberTrialInTransaction` starts the clock when the worker has bought the number. The trial ends at the end of its 14th day in the business's time zone (`numberTrialEndsAt`).
- **Emails:** `sweepNumberTrial` queues the day 10, day 13 and "ended" emails, and `markNumberTrialMinutesExhausted` queues one when the minutes run out.
- **End:** on day 15 the trial moves to `ended`, the number moves to `fallback` routing, and calls go unanswered. The number stays the business's until the day before its next carrier bill (`numberTrialReleaseAt`), and then the `phoneNumber.reclaim` job releases it.
- **Paying:** `convertNumberTrialInTransaction` makes the trial number the business's own and clears the release.
- **Transfers:** during a trial that recorded a verified mobile, calls transfer only to that mobile.

So **Start 14-day free trial** doesn't start a clock. The clock started a few seconds earlier, when the worker bought the number. The card records nothing and moves onboarding on.

## Onboarding

### Stages

`packages/shared/src/onboardingStages.ts` lists the stages in order:

`create_business`, `website`, `language`, `verify_phone`, `phone_number`, `phone_number_claiming`, `choose_plan`, `attribution`, `meet`, `complete`

- A direct business goes through `create_business`, `website`, `language`, `phone_number`, `choose_plan`, `attribution` and `meet`.
- A partner's business goes through `website`, `language`, `verify_phone` and `meet`, as today. At the activity level it has `verify_phone` only.

`choose_plan` routes to `/onboarding/plan`. It shares the number step's dot, so a direct owner sees six dots: sign-up, business, website, number, attribution, meet.

`goal` leaves the list. A stored `goal` reads as `attribution`, as the other legacy stages read as the step after them. A stored `verify_phone` reads as `phone_number` for a direct business, and so do the legacy stages that read as `verify_phone`.

Migration `0207_required_number.sql` moves stored values forward once: direct businesses on `verify_phone` or a legacy stage before it go to `phone_number`, and every business on `goal` goes to `attribution`. The read-time mapping covers values that old code writes during the rollout. Before a trial claim, `reserveOnboardingNumberClaim` repairs a direct business still stored on `verify_phone`, because `app.reserve_trial_number_claim` checks the stored value.

Allowed moves for a direct business:

| From | To |
|---|---|
| `website` | `language`, `phone_number` |
| `language` | `phone_number` |
| `verify_phone` (stored by old code) | `phone_number`, `attribution` |
| `phone_number` | `attribution`, through the country fallback or a self-hosted skip only |
| `phone_number_claiming` | `phone_number`, `choose_plan`, `attribution` |
| `choose_plan` | `attribution` |
| `attribution` | `meet`, with an answer |
| `meet` | `complete` |

A request to move a direct business to `verify_phone` moves it to `phone_number`, so an old tab still lands on the number step.

### Number step

The number step loses "I'll add a number later" for direct cloud businesses. Its title reads "Pick your agent's phone number".

**Country fallback:** below the picker, **My country isn't listed** opens a country select with every country. Picking one where LobbyStack sells no numbers shows the waitlist and **Continue without a number**. When the business's time zone points to such a country, or the deployment sells numbers nowhere, the step opens on the fallback. Continuing calls `POST /api/onboarding/phone-numbers/skip` with the country.

`skipOnboardingNumber` enforces the rule on the server:

- A self-hosted business skips with no country.
- A direct cloud business must send a two-letter country that `numberCountries()` doesn't list. Otherwise the server answers `409 number_required`.
- The server logs `onboarding.number_skipped` with the business and the country, and the browser sends `web.onboarding.number_skipped`.

`advanceOnboardingStage` refuses `phone_number` to `attribution` for a direct cloud business with `409 number_required`, so the skip endpoint is the only way around the number.

**Refused trial:** when the search refuses a trial, the step shows the line for the refusal and the paid plans, Starter, Pro and Enterprise, with no Free card:

- `trial_already_used`, `trial_ip_limited`, `trial_not_available`, `dedicated_number_requires_paid_plan`
- `email_verification_required`, with the line asking the owner to verify their email

After checkout, `/billing/success` sends the owner back to the number step with a plan that includes a number.

### Without the phone step

A direct owner no longer verifies a mobile in onboarding. The dashboard's trial claim keeps every other guard: once per workspace and per user, once per network in 30 days, a verified email, no disposable inbox, and no Australia.

Where the dashboard asked for a mobile before, it now refuses the trial and shows the paid plans:

- The network started a trial in the last 30 days: `trial_ip_limited`.
- The request has no trusted address or no usable country, so LobbyStack can't check the network: `trial_not_available`.

Partners' businesses still verify a mobile, because their trial and their calls forward to it. The public API still requires a verified mobile for an API-claimed trial.

A mobile verified before this release keeps working. Each place that reads it falls back as follows for a new business without one:

| Where | With a verified mobile | Without one |
|---|---|---|
| `activateNumberTrialInTransaction` | Sets the default agent's transfer number to it | Leaves the transfer number as it is |
| `trialTransferNumberInTransaction`, `assertTransferNumberAllowed` | Transfers go only to that mobile during the trial | No lock: the transfer number rules apply |
| `resolveNumberFallback` (out of minutes, refused calls) | The agent's transfer number, else the mobile | The agent's transfer number, else the owner's verified phone if they have one, else the call is refused |
| `getNumberTrialState` (`forwardTo`), the out-of-minutes banner and email | The transfer number, else the mobile | The transfer number, else nothing, and the banner shows no forwarding line |
| `numberEligibilityInTransaction` | The mobile's country picks the number's country | The search's country picks it |
| Text alerts (`loadNotificationPreferencesInTransaction`) | Texts can turn on | The notification settings verify a mobile in their own dialog, as today |
| Staff answers first | Reads no mobile | Unchanged |

### Plans screen

`/onboarding/plan` shows `OnboardingPlanSurface` in its `trial` variant:

- **First card:** the Free plan, described as "14 days, no card needed", with **Start 14-day free trial**. The button moves the stage from `choose_plan` to `attribution`.
- **Starter and Pro:** **Subscribe**. Checkout returns to `/billing/success`, which moves the stage from `choose_plan` to `attribution` and continues to the attribution question.
- **Enterprise:** left out.
- **Close:** none. The onboarding header offers only Sign out, or Back to dashboard.

`completeNumberProvisioning` moves a direct cloud business to `choose_plan` when the claim started a trial that nobody pays for. A business whose plan is already live, a self-hosted business, and a business already past the number step move to `attribution`, or stay where they are. A partner's business never reaches `choose_plan`.

### Goal step

The goal step, its route, its API and its surface go away. `businesses.onboarding_goal` and its check constraint stay for existing data, and nothing writes the column. A later release can drop both. The welcome email still reads a saved goal, so an owner who answered before this release gets the same email.

Getting started's hints no longer follow the goal: the call step says "Ask what your callers ask most.", and Add more sources says "Upload your policies, FAQs or pricing."

### Attribution step

The attribution step has no Skip link. **Continue** stays disabled until the owner picks a source. `submitOnboardingAttribution` refuses an empty source with `400 attribution_required` while the business is on `attribution`. Coming back from Meet your agent keeps the saved answer, as today.

### Back to dashboard

The onboarding header shows **Back to dashboard** before Sign out when the person has another workspace on this brand whose onboarding is complete. It switches the active workspace to the one they came from, which the workspace switcher records when they pick **Create new workspace**. Without that record it picks their most recently created finished workspace. Then it opens Home. The unfinished workspace stays as it is, and the workspace switcher lists it as it does today. A person with no finished workspace sees Sign out only.

## Sidebar chip

While the trial is `active`, the sidebar footer shows **Free trial · Nd left** above the account menu, with **View plans**, which opens the upgrade dialog. `N` is `daysLeft` from `getNumberTrialState`. Only people who can see billing see it, so a partner's business never shows it. The chip hides in the collapsed sidebar.

The banner across the top no longer counts down. It still shows when the trial runs out of minutes and after the trial ends.

## Getting started

### Which list a business gets

`loadSetupGuideInTransaction` returns a `variant`:

- **`number`:** a direct business with an active number, or with a number trial in any state past reserved.
- **`classic`:** every other business: a partner's business, and a direct business that never had a number, such as one in a country without numbers. It keeps today's list.

The v1 API keeps reading the classic step ids, which are part of its contract. The new steps have new ids.

### Steps in the number list

| Step | Done when | Shows |
|---|---|---|
| `fullScan` | As today | As today |
| `callNumber` | A phone call to the business carried audio and ended (`hasAnsweredPhoneCall`) | The number as a `tel:` link, and "Ask what your callers ask most." |
| `forwardCalls` | An active number has `forwarding_detected_at` or `forwarding_confirmed_at` | **Set up forwarding**, which opens the forwarding dialog. Once done: "Forwarding from +1 …", or "Forwarding works" when the owner confirmed it |
| `hours` | As today | As today |
| `sources` | As today | As today |

Either new step can be skipped like the others.

### Free after the trial

Steps 2 and 3, while not done, say the trial ended and offer **Choose a plan**, which opens the upgrade dialog.

### Forwarding dialog

Getting started opens the existing `CallForwardingDialog`. An **It works** button after the test-call line calls `POST /api/setup/forwarding`, which records `forwarding_confirmed_at`, for carriers that strip the forwarding header.

## Detecting forwarded calls

- **GPT-Live webhook** (`/api/webhooks/openai/live`): `Diversion` and `History-Info`.
- **Twilio staff answers first and Twilio voice fallback:** `ForwardedFrom`.
- **Telnyx TeXML voice:** Telnyx sends no forwarded-from field. A Telnyx number that reaches GPT-Live through its FQDN connection is covered by the webhook's headers.

`recordForwardedCall` takes the first phone that isn't the dialled number, the caller, a number the business holds, or the shared SMS sender. It stores the phone and the time on the dialled number the first time only, and records `voice.forwarding_detected`. The webhook runs it after the call is accepted, so it never delays an answer.

## Data

Migration `0207_required_number.sql`:

- Adds `forwarded_from_e164`, `forwarding_detected_at` and `forwarding_confirmed_at` to `phone_numbers`. The table's existing RLS policies cover them.
- Moves stored onboarding stages forward, as described under Stages.

## Telemetry

- `web.onboarding.trial_started` (browser): the owner picked **Start 14-day free trial**.
- `web.onboarding.number_skipped` (browser): the owner continued without a number, with the country.
- `web.activation.forwarding_confirmed` (browser): the owner pressed **It works**.
- `voice.forwarding_detected` (durable): the first forwarded call reached a number.
- `web.onboarding.goal_submitted` and `web.onboarding.phone_verified` keep firing for partners' phone step and existing producers only where a producer remains. An event with no producer leaves the registry.

## Help Center

Update the onboarding, trial, Getting started and forwarding pages in `mintlify/`, with their `fr/` and `es/` copies.

## Known risks

- **Losing the per-phone guard.** Without a verified mobile, a person can start a second trial from a new account, a new email and a new network. The per-user, per-workspace, per-network and email guards remain. No new check replaces the phone.

## Open questions

Each one took the conservative option for now.

- **Paid-only refusals:** an owner whose trial was refused must subscribe to finish onboarding, or pick a country without numbers.
- **Untrusted networks:** a direct owner whose request carries no trusted address or country gets the paid plans, where they could verify a mobile before.
- **Call step after the trial:** the decision names the forwarding step only. The call step shows the same "choose a plan" line, since there's no number to call.
- **Existing businesses:** a direct business that finished onboarding with a number before this release gets the new list, with the two new steps not done.
- **Workspace switcher:** an unfinished workspace shows in the switcher as it does today, with no "Finish setup" state.
- **Back to dashboard target:** the workspace the person came from lives in the browser's session storage, so another tab or device falls back to the most recent finished workspace.
