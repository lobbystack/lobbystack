# Spec: register each business for US texting

Status: draft. It needs the decisions below and one approved pilot business before an agent can build it.

## Problem Statement

A cloud business texts from the shared toll-free number, except for two kinds of text that use its own number: inbox replies and `STOP`, `START` and `HELP` replies. US carriers block unregistered local numbers with error 30034.

Lobbystack's own campaign can't cover this traffic:

- Its only campaign record is `FAILED` with error 30909. The campaign claims opt-in forms on lobbystack.com that don't exist.
- Rewriting the message flow wouldn't be enough. Twilio's error 30926 rejects a campaign that registers your company as the brand when messages go out for client businesses.

AI text replies can't ship for US customers until this is solved.

## Solution

LobbyStack registers each business that wants to text US numbers from a +1 local number. The owner answers one question first: is this a registered company?

- **Not registered:** an unincorporated owner gives a name, address, email and mobile number, then confirms a one-time passcode. LobbyStack creates a sole proprietor brand, and the owner gives no tax ID.
- **Registered company:** the owner also gives the legal details and a tax ID, such as an EIN or a Canadian Business Number. LobbyStack creates a low-volume standard brand. A registered company that has no tax ID to give stays unregistered, and its texts to US numbers stay off until it gives one.

Sole proprietor is the path for unincorporated owners only. It isn't the small-business default, and having no tax ID doesn't qualify a company for it: Twilio's rules exclude any registered company, even one with no number.

Either way, LobbyStack works under the existing ISV primary profile, creates one campaign, and adds the number to the campaign's Messaging Service.

The business sees the registration status in the dashboard. Until Twilio approves the campaign, texts to US numbers from that business's +1 number stay blocked, with a reason that names the registration. Canadian numbers texting Canadian recipients need no registration, so a Canadian business can use AI text replies without any of this. See [AI text replies](ai-sms-replies.md).

The primary profile is already approved with the identity `isv_reseller_or_partner`, so no account-level change is needed.

## Scope

### In the first version

- Cloud businesses with a +1 Twilio number.
- Unregistered US and Canadian owners, on a sole proprietor brand.
- Registered companies with a tax ID, on a low-volume standard brand.
- Status polling, dashboard status, inbox blocking and fix-and-resubmit.
- Texts that name the business that sends them.

### Left for later

- Moving a sole proprietor brand to a low-volume standard brand when the owner incorporates or outgrows its limits.
- Registration through the public API, partner templates and `lobbystack onboard`. A partner's businesses need this before they can text.
- Telnyx numbers. Self-hosters keep registering their own numbers.
- AI text replies themselves. [AI text replies](ai-sms-replies.md) covers them. This spec makes the sender legal for US recipients, and campaigns must describe those replies from the first submission.

## Key risk: proof of consent

Twilio's rule for error 30909 asks for every opt-in path, plus a public URL with the full verbal script. It also says the Terms and Conditions page must be hosted on your business website.

Many small businesses won't have those pages. LobbyStack can host a public SMS page for each business, but nothing yet shows that reviewers accept it. Each failed review costs a non-refundable $15, so the pilot comes before the build.

### Step 0: pilot

Register one real small business by hand:

1. Pick an unregistered US or Canadian owner with a +1 number who can receive a passcode on a real mobile. The business doesn't need a website.
2. Publish its SMS page with the verbal script, the inbound-text path, and links to its privacy and terms pages.
3. Publish those privacy and terms pages. Nothing yet proves that reviewers accept pages LobbyStack hosts for the business, so the pilot tests that.
4. Submit the sole proprietor brand and campaign, with LobbyStack as the campaign's reseller and a description that covers AI replies.
5. Record the result here, including any rejection codes.

The build starts after an approval. If reviewers reject hosted pages, the business has to publish the pages on its own site, and onboarding changes to match.

## Design

### Consent paths in the campaign

The message flow describes only what the product does:

- A customer texts the business's number first.
- A caller agrees on a recorded call, using the script in `mintlify/integrations/sms.mdx`. Website chat and browser calls don't record consent.

Every campaign says from its first submission that an AI assistant answers customer texts for the business. A campaign that leaves this out would need a second submission, at $15, the day a business turns replies on.

### Reseller tag

Twilio requires an ISV to name itself as the reseller on campaigns it submits for customers. Each campaign names LobbyStack that way. Twilio's sole proprietor rules state this outright, and its API guide doesn't name the field, so the pilot confirms the field and whether low-volume standard campaigns need it too.

### Data

| Data | Where it lives |
|---|---|
| Legal name, tax ID, address, representative | Sent to Twilio. See open decision 2 for what LobbyStack keeps. |
| Profile, brand, campaign and Messaging Service SIDs | A new business-scoped table with RLS |
| Status and last error codes | The same table |

`businesses.legal_name`, `business_type` and `website_url` exist. The tax ID, street address and representative contact don't.

### Brand types

| | Sole proprietor | Low-volume standard |
|---|---|---|
| Who | Unregistered US or Canadian owner | Registered company with a tax ID |
| The owner provides | Name, address, email, mobile, passcode | Legal name, tax ID, address, representative |
| Campaigns | 1 | Up to 5 |
| Numbers per campaign | 1 | Several |
| Speed | 1 message a second | Lowest tier |

Each sole proprietor mobile can validate three brands across all vendors, and each email or address 10. The mobile must be a real US or Canadian mobile, so a Twilio or other VoIP number won't work. Prefill it from the owner's verified `users.phone`.

A registered company can't use the sole proprietor path, with or without a tax ID. An owner who holds a tax ID can't use it either: Twilio says a Canadian Business Number counts as one. A business that claims otherwise pays to register again.

### Registration flow

A durable job runs the steps in Twilio's ISV order, and stores each SID before the next step so a retry resumes.

For a sole proprietor brand:

1. Create the starter customer profile and submit it.
2. Create the A2P trust bundle and submit it.
3. Create the brand and send the passcode to the owner's mobile.
4. Wait for the owner to confirm it.
5. Create the Messaging Service and the campaign.
6. Add the business's number.

For a low-volume standard brand:

1. Create the secondary customer profile and submit it.
2. Create the A2P trust product and submit it.
3. Create the brand with `skip_automatic_sec_vet`.
4. Create the Messaging Service.
5. Wait for the brand to reach `APPROVED`.
6. Create the campaign.
7. Add the business's number to the Messaging Service.

Twilio advises waiting 30 seconds between sole proprietor submissions, and not waiting for manual approval before the next step.

A scheduled sweep polls open registrations, following the `partnerDomain.check` pattern in `apps/worker/src/scheduler.ts`. Twilio's ISV guide limits brand requests to one per second.

### Numbers

`NumberInventory` gains attach and detach methods for a Messaging Service, and `TwilioCarrier` implements them.

- Provisioning attaches a number after purchase when the business has an approved campaign.
- Replacing a number attaches the new one.
- Reclaiming and deleting detach it first.

Sending stays `from` the number, and `twilioProvider.ts` needs no `MessagingServiceSid`. The service sets `use_inbound_webhook_on_number`, so inbound texts keep reaching the number's own `smsUrl`. The pilot confirms both.

### Toll-free numbers

The shared toll-free number can't carry this traffic. Twilio's error 30478 declines toll-free verification when a number serves more than one company: "A Toll-Free number used for messaging must map 1:1 to a single business." The number that texts for every cloud business already sits outside that rule. AI replies must never go out on it, and it keeps taking no conversations. Moving its notifications to per-business senders is a separate decision.

### Sending rule

`sms_registration_required` already exists for AI text replies (`textReplyBlockedReason` in `packages/domain/src/server/sms.ts`). It applies when a cloud business's own +1 number would text a US-bound number. This spec adds two things: an approved campaign clears the block, and inbox replies follow the same rule. Canadian recipients aren't affected. `smsRecipientRegion` in `packages/shared/src/smsReach.ts` counts US territories as US-bound. The worker checks the same rule before it sends.

`STOP`, `START` and `HELP` replies still go out, because Twilio's opt-out handling and carrier rules expect them.

### Message content

Reviewers need each campaign to name one sender. The opt-in confirmation and the `HELP` and `START` replies on a business's own number lead with "LobbyStack" today (`packages/domain/src/server/sms.ts:58`). On a registered number they lead with the business's name.

### Dashboard

The status goes on the phone number page under `phoneNumber` in the `settings` namespace, in all four interface languages. The inbox replaces the blanket `page.smsReplyBlocked` toast with a message per reason, because the current copy blames the contact.

### Parity checks

`compliance.twilio_a2p` in `docs/validation/replacement-parity.json` forbids `twilioA2p`, `10DLC` and `a2pRegistration` in scanned source, and `admin-ui-parity.json` excludes the same capability. `billing.ai_sms` sits beside it in both files and forbids `ai_sms`, `sms_ai`, `sms.processInbound` and `sms.reply`. Change the `compliance.twilio_a2p` entries in the first commit, leave `billing.ai_sms` excluded unless AI texts get their own add-on, and update the runbook line in `docs/validation/certification-runbook.md`.

## Fees

Twilio's published figures, to confirm in the Console before launch:

| Item | Cost |
|---|---|
| Sole proprietor or low-volume standard brand | $4.50 once |
| Campaign vetting | $15 for each submission, non-refundable |
| Sole proprietor campaign | $2 a month |
| Low-volume mixed campaign | $1.50 a month |

## Implementation order

1. Run Step 0 and record the result.
2. Change the parity entries.
3. Add the migration, schema and domain module.
4. Add the Twilio registration adapter in `packages/providers`.
5. Add the job and polling sweep.
6. Add number attach and detach.
7. Add the sending rule and the per-reason inbox message.
8. Change the message content.
9. Build the dashboard form and status.
10. Update the terms, privacy policy, Help Center and changelog.

## Verification

- Unit tests cover each step's resume, every status and each blocked reason.
- Integration tests cover the new table's RLS and cross-tenant denial.
- `pnpm db:check`, `pnpm db:verify-rls` and `pnpm replacement:parity` pass.
- On staging, a test registration runs through mocked Twilio responses, because a real one costs money and needs a real business.
- In production, the pilot business sends an inbox reply to a US phone and it arrives with no 30034 error.

## Open decisions

1. **Who pays the fees?** Recommendation: LobbyStack pays the first submission for paying plans and passes on nothing. At $19.50 once and up to $2 a month, the fee is small against a subscription, and a form with a fee would slow signups.
2. **Does LobbyStack keep the tax ID?** Recommendation: keep it only until Twilio accepts the profile, then clear it and store the last four digits. A rejected profile can ask the business to enter it again.
3. **Which business runs the pilot?** It needs a +1 number, an unregistered owner, and a real mobile.
4. **What happens to the failed campaign?** Recommendation: leave it. It has no campaign ID, and `usAppToPersonRegistered` on that Messaging Service doesn't mean a number can send.
5. **One account, or one subaccount per business?** This spec assumes one account with a Messaging Service per business, Twilio's architecture #4, which Twilio allows. Twilio prefers #1, a subaccount per customer: a business that sends noncompliant traffic could otherwise get the primary account suspended, and per-business analytics are harder. Moving later has a price. Numbers, webhooks and registrations move to each subaccount, the carrier code gains per-business credentials, and Twilio's opt-out lists reset because they belong to the account, so LobbyStack has to export them first. Recommendation: decide before Step 0, because the pilot's brand and campaign would otherwise be the first thing to move.

## Sources

- [Error 30909](https://www.twilio.com/docs/api/errors/30909)
- [Error 30926](https://www.twilio.com/docs/api/errors/30926)
- [Error 30478](https://www.twilio.com/docs/api/errors/30478)
- [ISV onboarding overview](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv)
- [ISV API walkthrough](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv-api)
- [ISV sole proprietor walkthrough](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv-api-sole-prop-new)
- [Business information](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/collect-business-info)
- [Pricing and fees](https://support.twilio.com/hc/en-us/articles/1260803965530-Pricing-and-Fees-for-A2P-10DLC-Service)
