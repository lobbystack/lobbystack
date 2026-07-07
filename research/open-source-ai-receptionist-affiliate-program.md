# Open-Source AI Receptionist Affiliate Program Research

Research date: July 7, 2026

Purpose: source notes for a LobbyStack blog post about the new affiliate program, especially how an open-source AI receptionist affiliate offer compares with SaaS, AI receptionist, and voice-agent infrastructure programs.

## Executive Takeaways

- LobbyStack's current public and in-app terms are competitive but conservative: **20% commission for 12 months**, **30-day hold**, **USD $100 minimum payout**, and **manual PayPal payouts**. The source materials do not state a fixed cookie window; attribution is implemented through `?via=` referral codes stored client-side and bound during onboarding.
- In AI receptionist tools, published public programs often lean more aggressive than general SaaS: Upfirst offers **25% lifetime plus a $50 bonus**, My AI Front Desk's current affiliate page says **30% recurring with lifetime attribution**, AI Phone 360 says **20% monthly recurring** with a **30-day cookie**, and RealVoice advertises tiered **20%-40%** commissions.
- In open-source or self-hostable SaaS, Cal.com and n8n are the cleanest comparables. Cal.com offers **20% for 12 months** plus **20% off for referrals**. n8n offers **30% for 12 months**, PayPal payouts, and a **EUR 100 minimum**. Supabase appears to emphasize partner and advocate programs rather than a simple public affiliate rate card.
- LobbyStack's strongest differentiation is not the highest commission. It is the combination of: open-source product, hosted cloud, self-hosting, BYO provider keys, agency-friendly implementation surface, and SMB-facing AI phone outcomes.
- Blog angle: "Most AI receptionist affiliate programs sell a black-box subscription. LobbyStack lets affiliates recommend a hosted AI receptionist that can also be inspected, self-hosted, and extended."

## LobbyStack Program Snapshot

| Term | Current LobbyStack value | Source notes |
| --- | --- | --- |
| Commission | 20% | `COMMISSION_RATE = 0.2` in `convex/affiliates.ts`; Terms page says 20%. |
| Commission duration | First 12 months after attribution | `COMMISSION_MONTHS = 12`; Terms page says first 12 months. |
| Hold period | 30 days | `HOLD_DAYS = 30`; Terms page says commissions become eligible only after the referred customer's payment clears a 30-day hold. |
| Minimum payout | USD $100 | `MIN_PAYOUT_CENTS = 10_000`; Terms page and affiliate FAQ say $100. |
| Payout method | Manual PayPal | Affiliate UI copy and Terms page say manual PayPal payouts using the PayPal email in the affiliate dashboard. |
| Payout cadence | Monthly review/run implied | UI copy says eligible balances of $100 or more are reviewed monthly; Convex has a monthly affiliate payout cron. |
| Attribution | Referral links/codes; `?via=` captured in local storage and bound to a business | `apps/web/src/App.tsx` stores `lobbystack.affiliate.referralCode` from the `via` query param. No explicit public cookie-window term found. |
| Refunds/chargebacks | Unpaid commissions may be voided/reversed | Terms and affiliate FAQ both mention refunds/disputes voiding or reversing unpaid commissions. |

Local source files inspected:

- `convex/affiliates.ts`
- `convex/crons.ts`
- `apps/landing/src/pages/terms.astro`
- `apps/web/public/locales/en/affiliate.json`
- `apps/web/src/App.tsx`
- `README.md`
- `research/open-source-ai-receptionist-stack.md`

## LobbyStack Positioning From Repository

- README headline: "The open-source AI receptionist for calls, texts, and appointments." It explicitly names My AI Front Desk, Upfirst, Goodcall, and Phonely as alternatives.
- Core product promise: answers phone calls, responds to SMS, books appointments, handles reschedules/cancellations, and transfers to a human.
- Open-source angle: inspect the code, self-host, extend, and keep control of data.
- Hosted plus self-hosted: LobbyStack Cloud is managed; self-hosting lets teams run their own infrastructure and use their own Convex, Twilio, OpenAI, calendar, analytics, billing, and email accounts.
- Agency/developer angle: TypeScript monorepo, Convex as source of truth, narrow Node voice gateway for Twilio Voice, Media Streams, and OpenAI Realtime.
- Existing research note says LobbyStack should be framed as the open-source product layer around realtime voice, Twilio wiring, scheduling, transcripts, billing, alerts, monitoring, and operator dashboards.

## Competitive Affiliate Landscape

### AI Receptionist And AI Phone Answering Programs

| Company | Product category | Commission | Payout / threshold | Attribution / cookie window | Positioning notes | Source |
| --- | --- | --- | --- | --- | --- | --- |
| Upfirst | AI receptionist | 25% lifetime commission plus $50 bonus after customer has been active for 2 months | Paid via Stripe; no public minimum found on page | Commission starts 30 days after signup; cookie window not found | Very affiliate-forward: referral portal, pending commissions, "get paid for referring clients" | [Upfirst Affiliate Partner Program](https://upfirst.ai/affiliate-program), accessed July 7, 2026 |
| My AI Front Desk / Frontdesk | AI receptionist/front-office automation | Current page: 30% recurring every month while referral remains a customer | Paid 1st of every month via Stripe or wire; no threshold found | "Lifetime cookies" and "every click is tracked forever"; page says lifetime attribution | Aggressive creator-friendly pitch: no approval, sign up in 60 seconds, free marketing kit. Note: an older blog post dated Jun. 12, 2025 says 40%, but current affiliate page says 30%. | [Frontdesk Affiliate](https://www.myaifrontdesk.com/affiliate), accessed July 7, 2026; older blog: [How Our AI Receptionist Affiliate Program Beats the Competition](https://www.myaifrontdesk.com/blogs/how-our-ai-receptionist-affiliate-program-beats-the-competition), published Jun. 12, 2025, accessed July 7, 2026 |
| AI Phone 360 | AI receptionist / phone system | Partner agreement: 20% of monthly recurring subscription revenue | Stripe direct deposit; $50 minimum; payouts due within 90 days from month-end, typically sooner | Affiliate page says 30-day cookie | Similar to LobbyStack rate, but lifetime/monthly recurring language appears broader; not open-source | [AI Phone 360 Affiliates](https://www.aiphone360.com/affiliates), accessed July 7, 2026; [Partner Agreement](https://www.aiphone360.com/partner-agreement), accessed July 7, 2026 |
| RealVoice AI | AI workforce, includes AI receptionist | Tiered 20%, 30%, 40% based on monthly referral volume | Monthly payouts via PayPal, bank transfer, or crypto; threshold not found | Cookie window not found | Broader "AI employees" framing, not only receptionist. Useful example of high advertised rates with less visible fine print. | [RealVoice AI Affiliate](https://www.realvoice.ai/affiliate), accessed July 7, 2026 |
| Retell AI | Voice-agent infrastructure | 15% for every paid referral | Managed by Tolt; threshold not visible on public landing page | Cookie window not found | Adjacent competitor for build-your-own voice agents. More developer/infrastructure than turnkey receptionist. | [Retell AI Affiliate Program docs](https://docs.retellai.com/ecosystem/affiliate-program), accessed July 7, 2026; [Retell affiliate landing page](https://affiliate.retellai.com/), accessed July 7, 2026 |
| Smith.ai | Virtual receptionist / live answering and chat | Public article mentions referral affiliates, resellers, wholesalers; specific rate not visible in inspected source | Not found | Not found | Mature partner program with partner portal, promo codes, reseller/wholesale options, and agency management. Less self-serve public affiliate-rate positioning. | [Smith.ai Partner Portal article](https://smith.ai/blog/introducing-the-smith-ai-partner-portal-one-account-to-manage-your-clients), published Dec. 3, 2020, updated Jul. 23, 2021, accessed July 7, 2026 |

### Open-Source Or Self-Hostable SaaS Comparables

| Company | Open-source relevance | Commission | Payout / threshold | Attribution / cookie window | Notes | Source |
| --- | --- | --- | --- | --- | --- | --- |
| Cal.com | Open-source scheduling SaaS | 20% commission for 12 months | Not found in inspected page | Not found in inspected page | Strong closest analogue to LobbyStack's rate/duration; also gives referred clients 20% off for 12 months, which can make conversion easier. | [Cal.com Affiliate Program](https://cal.com/affiliate-program), accessed July 7, 2026; [Cal.com Affiliate Terms](https://cal.com/affiliate-terms), accessed July 7, 2026 |
| n8n | Source-available / self-hostable automation platform | 30% on n8n Cloud referrals for 12 months | PayPal; monthly payouts; balances of EUR 100 or more | Not found in inspected page | Useful comparison for self-hostable SaaS: commission applies to cloud product, while page clearly explains Cloud vs Community self-hosted vs Enterprise. | [n8n Cloud Affiliate Partner Program](https://n8n.io/affiliates/), accessed July 7, 2026 |
| Supabase | Open-source backend platform | No simple public affiliate rate found in inspected source | Not found | Not found | Public page emphasizes partner ecosystem rather than classic affiliate payouts. Good contrast: many open-source companies choose partner/solution ecosystems over simple affiliate pages. | [Supabase Partners](https://supabase.com/partners), accessed July 7, 2026 |

### General SaaS / AI SaaS Benchmarks

| Company | Commission | Payout / threshold | Attribution / cookie window | Notes | Source |
| --- | --- | --- | --- | --- | --- |
| Jasper | Commission for first 12 months; base amount not visible in agreement excerpt, but increases to 30% after 100 leads and 100 customers in rolling 12 months | $25 minimum; PayPal, Wise, or similar processors; 30-day customer-good-standing requirement | 14-day purchase window after first affiliate-link click; last cookie usually wins | Useful AI SaaS legal benchmark. Compared with LobbyStack, Jasper's attribution window is shorter, threshold lower, and terms are more legalistic. | [Jasper Affiliate Agreement](https://www.jasper.ai/legal/affiliates), accessed July 7, 2026 |
| Cal.com | 20% for 12 months | Not found | Not found | General SaaS/open-source scheduling benchmark; similar to LobbyStack economics. | [Cal.com Affiliate Program](https://cal.com/affiliate-program), accessed July 7, 2026 |
| n8n | 30% for 12 months | PayPal; EUR 100 minimum | Not found | More generous rate than LobbyStack, similar 12-month duration, similar high payout threshold. | [n8n Affiliates](https://n8n.io/affiliates/), accessed July 7, 2026 |

## How LobbyStack Compares

LobbyStack is not the highest-commission option in the niche. Upfirst, My AI Front Desk, and RealVoice all advertise more aggressive upside. The stronger comparison is:

- Versus **Cal.com**: same 20% and 12-month duration, but Cal.com adds a buyer discount. LobbyStack could consider an affiliate-only first-month or first-year discount if conversion friction matters.
- Versus **n8n**: lower commission rate but same 12-month horizon. n8n's EUR 100 minimum is comparable to LobbyStack's USD $100 minimum.
- Versus **AI Phone 360**: same 20% rate, but AI Phone 360 publishes a 30-day cookie and $50 threshold. LobbyStack's $100 threshold is higher; LobbyStack should either publish a clear attribution window or frame the program around dashboard-tracked referral codes.
- Versus **My AI Front Desk**: LobbyStack is less aggressive on commission, but can be more credible on open-source control, self-hosting, no black-box logic, and transparent engineering.
- Versus **Upfirst**: Upfirst is very affiliate-friendly with 25% lifetime plus $50 bonus. LobbyStack should avoid a pure rate war and instead target affiliates who care about open-source, agencies, developers, and client-specific deployment options.
- Versus **Retell**: Retell is lower at 15% and infrastructure-oriented. LobbyStack can position as the product outcome built on top of the kind of voice-agent infrastructure buyers otherwise have to assemble.

## Blog-Useful Angles

1. **"The first open-source AI receptionist affiliate program" angle**
   - Use carefully unless verified across the market. Safer phrasing: "an affiliate program for an open-source AI receptionist platform."

2. **Affiliate audience**
   - Agencies serving local businesses.
   - SaaS consultants.
   - AI automation builders.
   - Creators writing about AI phone answering, missed-call recovery, booking automation, and local-service operations.
   - Developers who want to recommend a product clients can inspect or self-host.

3. **Value proposition for affiliates**
   - Not just a commission link: a credible technical product that agencies can explain and, when needed, deploy more deeply.
   - Hosted cloud for fast referrals; self-hosting for clients with provider-control, compliance, or infrastructure preferences.
   - AGPL/open-source trust signal: affiliates can point skeptical buyers to the codebase instead of asking them to trust a closed black box.

4. **How to discuss commission without overclaiming**
   - "20% for the first year" is normal-to-competitive for SaaS and open-source SaaS.
   - "Some AI receptionist programs advertise higher recurring commissions, but many do not offer open-source control or self-hosting."
   - "LobbyStack's affiliate program is built for honest referrals to operators and agencies, not coupon spam."

5. **Potential improvement to publish before/during blog**
   - Add a public affiliate landing page with: commission, duration, hold period, payout minimum, payout method, attribution window, prohibited promotion rules, and ideal partner examples.
   - Clarify the attribution window. The implementation captures referral codes in local storage, but the public terms do not expose a cookie/window number.
   - Consider whether $100 minimum is appropriate at launch. It is defensible and common, but competitors like AI Phone 360 and Jasper have lower visible thresholds.
   - Consider a referral discount. Cal.com's "affiliate earns 20%, referral saves 20%" is clean and easy to promote.

## Source Log

- [Upfirst Affiliate Partner Program](https://upfirst.ai/affiliate-program), accessed July 7, 2026. No visible publication date found. Key terms: 25% lifetime commission, $50 bonus after 2 months active, Stripe payouts, commission starts 30 days after signup.
- [Frontdesk Affiliate](https://www.myaifrontdesk.com/affiliate), accessed July 7, 2026. No visible publication date found. Key terms: 30% recurring, monthly payouts on the 1st via Stripe or wire, lifetime cookies/lifetime attribution.
- [How Our AI Receptionist Affiliate Program Beats the Competition](https://www.myaifrontdesk.com/blogs/how-our-ai-receptionist-affiliate-program-beats-the-competition), published June 12, 2025, accessed July 7, 2026. Older blog says 40% commission; treat as potentially superseded by current affiliate page.
- [AI Phone 360 Affiliates](https://www.aiphone360.com/affiliates), accessed July 7, 2026. No visible publication date found. Key terms: recurring commissions, monthly payouts, Stripe direct deposit, 30-day cookie.
- [AI Phone 360 Partner Agreement](https://www.aiphone360.com/partner-agreement), accessed July 7, 2026. No visible publication date found. Key terms: 20% of monthly recurring subscription revenue, $50 minimum payout, payouts due within 90 days from month-end, disqualified referrals and paid-ad restrictions.
- [RealVoice AI Affiliate](https://www.realvoice.ai/affiliate), accessed July 7, 2026. No visible publication date found. Key terms: tiered 20%/30%/40%, monthly payouts by PayPal, bank transfer, or crypto.
- [Retell AI Affiliate Program docs](https://docs.retellai.com/ecosystem/affiliate-program), accessed July 7, 2026. No visible publication date found. Key terms: apply for Retell affiliate program, official docs link to affiliate landing page.
- [Retell affiliate landing page](https://affiliate.retellai.com/), accessed July 7, 2026. No visible publication date found. Key term: 15% for every paid referral; payouts managed by Tolt.
- [Smith.ai Partner Portal article](https://smith.ai/blog/introducing-the-smith-ai-partner-portal-one-account-to-manage-your-clients), published December 3, 2020, updated July 23, 2021, accessed July 7, 2026. Key terms: referral affiliates, authorized resellers, wholesalers, portal, promo codes/links; no public commission rate found in inspected source.
- [Cal.com Affiliate Program](https://cal.com/affiliate-program), accessed July 7, 2026. No visible publication date found. Key terms: 20% commission for 12 months; referred clients get 20% off for 12 months.
- [Cal.com Affiliate Terms](https://cal.com/affiliate-terms), accessed July 7, 2026. No visible publication date found in scraped page.
- [n8n Cloud Affiliate Partner Program](https://n8n.io/affiliates/), accessed July 7, 2026. No visible publication date found. Key terms: 30% on n8n Cloud referrals for 12 months, PayPal payouts monthly, EUR 100 minimum.
- [Supabase Partners](https://supabase.com/partners), accessed July 7, 2026. No visible publication date found. Key note: partner ecosystem page found; no simple public affiliate commission rate found in inspected source.
- [Jasper Affiliate Agreement](https://www.jasper.ai/legal/affiliates), accessed July 7, 2026. No visible publication date found in scraped page. Key terms: commission for first 12 months, 14-day affiliate lead purchase window, $25 minimum, payment through PayPal/Wise/similar processors, 30% increased commission after 100 leads and 100 customers in rolling 12 months.

