---
title: "Google Business Profile calls: set up, track, answer"
seoTitle: "Google Business Profile calls: number, hours, tracking"
description: "Google Business Profile calls go to the number on your profile. Set the number and hours, read the Calls metric, track answered calls and cover calls after hours."
pubDate: 2026-10-10T09:00:00-04:00
updatedDate: 2026-10-10T09:00:00-04:00
author: "LobbyStack Team"
category: "Guides"
featured: false
coverImage: "/illustrations/google-business-profile-calls-hero.webp"
coverImageAlt: "Light beige cover card with a small dot pattern and the title Google Business Profile calls: set up, track, answer in black text"
locale: "en"
canonicalSlug: "google-business-profile-calls"
---

**Google Business Profile calls** go to the phone number you enter on your profile: the Call button on Google Search and Maps dials it. Google counts clicks on that button in its Performance report, but it stopped showing call history on July 31, 2024. Keep the number and hours right, and set up coverage for the calls you can't take.

We checked every Google feature, menu path and limit below on Google's own help pages on October 10, 2026, and we link each one. If a label on your screen differs, the linked page has Google's current wording. LobbyStack wrote this guide and sells an AI receptionist, so we also say where it doesn't fit.

## Where does the call button on a Google Business Profile come from?

The Call button uses the phone number you add to your profile. Google's [Performance report](https://support.google.com/business/answer/9918094?hl=en) counts the times customers click that button, and it asks you to add a phone number to track the metric. Creating the profile is [free](https://business.google.com/us/business-profile/).

Some profiles had a Google forwarding number behind the Call button while call history existed. When Google ended call history and chat on July 31, 2024, it said those numbers "will be automatically updated to use the merchant's supplied phone number" ([Google](https://support.google.com/business/answer/14919056?hl=en)). Today a customer who taps Call dials the number you entered, and the same page confirms you keep receiving calls from your profile.

Two things you control decide the rest: the number and hours on the profile, and who answers when you can't.

## How do I add or change the phone number on my Google Business Profile?

Google's [steps to add a phone number](https://support.google.com/business/answer/16750496?hl=en), on Google Search:

1. Open your Business Profile.
2. Select **Edit profile**, then **Contact**.
3. Next to **Phone number**, select **Edit**.
4. Pick your country so Google sets the country code.
5. Type the number. Google formats it, so skip parentheses and dashes. To add a second or third number, select **Add phone number**.
6. Select **Save**.

In the Google Maps app, tap **Business** at the bottom right, then **Edit profile** ([Google](https://support.google.com/business/answer/3039617?hl=en)).

Google reviews changes before it updates your live profile, and it doesn't publish a review time. Keep the old line working until the new number shows on your profile.

### Google's rules for the number

- **Up to three numbers:** a primary number plus up to two more, mobile or landline. Google doesn't accept fax numbers ([add your phone number](https://support.google.com/business/answer/16750496?hl=en)).
- **Local over call center:** use a local number instead of a central call-center helpline where you can ([guidelines](https://support.google.com/business/answer/3038177?hl=en)).
- **Your control:** the number must be under the business's direct control.
- **No referral numbers:** don't list numbers that redirect or refer callers to landing pages or to numbers other than the business's own.
- **No premium-rate numbers**, whatever the caller pays.

### Can you hide the number?

Yes. Open your profile, select **More**, then **Business Profile settings** and **Advanced settings**. Under **Phone number**, turn on **Don't show** ([Google](https://support.google.com/business/answer/3039617?hl=en)). Hide it only if you don't want calls from Google at all.

## What call data does Google show today?

Inside your profile, Google shows one call figure: **Calls**, in the Performance report, which counts clicks on your profile's call button over the period you pick. A click count can't tell you who called, whether anyone answered or how long the call lasted. Call history, which listed individual calls for some profiles, ended on July 31, 2024.

To open it ([Google](https://support.google.com/business/answer/9918094?hl=en)):

- **On Google Search:** open your Business Profile, select **Performance**, choose a time period and select **Apply**.
- **In the Google Maps app:** in **Business**, tap **See more** next to Performance, choose a period and tap **Apply**.

Only verified profiles have performance data, and you have to be signed in to the Google Account that manages the profile.

| Call data | Available in October 2026? | Where |
| --- | --- | --- |
| Clicks on the call button | Yes | Performance > **Calls** |
| Daily call-button clicks for software | Yes | Business Profile Performance API, metric [`CALL_CLICKS`](https://developers.google.com/my-business/reference/performance/rest/v1/DailyMetric) |
| A list of individual calls (call history) | No. Ended July 31, 2024 | Google Takeout downloads of old records closed August 30, 2024 ([Google](https://support.google.com/business/answer/14919056?hl=en)) |
| Caller numbers, answered or missed, call length | Not in your Business Profile | Your carrier's call log, phone system or answering service |

## How do I track calls from my Google Business Profile?

Track them in two places. Google's Calls metric tells you how many people clicked Call. Your phone records tell you how many calls arrived and how many someone answered. Put the two side by side each month: a growing gap can mean callers hang up before anyone picks up, though some clicks never become a dialed call.

1. **Read Google's count.** Note last month's Calls figure from Performance.
2. **Read your side.** Pull the same month from your carrier's log, phone system or answering service: calls received, answered and missed.
3. **Ask new callers how they found you.** Whoever answers writes "Google" on the call note when the caller says so.
4. **Automate it if you report on many locations.** The Performance API returns daily `CALL_CLICKS` per profile, which a dashboard can pull.

Google's Business Profile help pages don't cover call tracking numbers. The guidelines above still apply to any number you list: under your direct control, and not redirecting callers to a number other than your business's own. Read [the guidelines](https://support.google.com/business/answer/3038177?hl=en) before you swap the number. Forwarding your own number to backup coverage leaves the profile number unchanged.

If you forward to LobbyStack, every call it answers gets a summary, transcript and recording in the dashboard, which gives you the record for step 2. Signed webhooks for 6 events and a REST API connect LobbyStack to your other tools.

## How do hours and "open now" affect calls from Google?

Your hours tell searchers when you serve customers. Google Maps on a computer has an [Hours filter](https://support.google.com/gmm/answer/2839844?hl=en) that checks places currently open for business, so hours that say you're closed can hide you from a searcher who uses it. Keep regular, holiday and special hours accurate, and list the hours you serve customers.

Google's [steps to set regular hours](https://support.google.com/business/answer/15300403?hl=en):

1. Open your Business Profile and select **Edit profile**, then **Hours**.
2. Under **Business hours**, next to **Hours**, select **Edit**, then **Open with main hours**. **Open with no main hours** hides your hours.
3. Check each day you're open and set the times. For a lunch break, create two entries for the same day. For a day open around the clock, select **Opens at**, then **24 hours**.
4. Select **Save**.

After you update your hours, Google can show customers a message confirming the update on your profile.

### Holidays and short closures

[Special hours](https://support.google.com/business/answer/6303076?hl=en) cover temporary changes, including closures of up to 6 days in a row. For 7 days or more, or an unknown period, Google recommends marking the business temporarily closed. Special hours only show if your hours are set to **Open with main hours**. Google suggests confirming hours for official holidays even when they match your regular hours.

[More hours](https://support.google.com/business/answer/9876800?hl=en) list times for specific services such as delivery, takeout, drive-through and pickup. They only display once you've set regular hours.

### Should you list 24 hours because someone answers at night?

Only if you serve customers around the clock. Google's [guidelines](https://support.google.com/business/answer/3038177?hl=en) ask for your regular customer-facing hours, and they say businesses that work only by appointment shouldn't list hours. If you answer the phone at night but send crews out in the morning, list your real hours and let after-hours answering book the 9 p.m. caller for tomorrow.

## How do I make sure calls from my Google Business Profile get answered?

Forward the number on your profile to backup coverage for the calls you can't take: unanswered calls during the day, every call after hours, or all calls. The backup can be a teammate's phone, a live answering service or an AI receptionist. The number on your profile stays the same, so you change nothing on Google.

### 1. Pick who answers

| Backup | What the caller gets | Fits |
| --- | --- | --- |
| Voicemail | Leaves a message and waits for your callback | Low call volume, calls that can wait ([AI receptionist vs voicemail](/blog/ai-receptionist-vs-voicemail/)) |
| A teammate's or on-call phone | A person, if they're free | Small teams where someone is free to pick up |
| Live answering service | A remote receptionist who takes messages, and on many plans books | Calls that need human judgment ([what a phone answering service does](/blog/what-is-a-phone-answering-service/)) |
| AI receptionist | Answers questions, books and transfers urgent calls | Booking and after-hours calls |

### 2. Forward your number

You set the rule with your carrier: forward when busy or unanswered for overflow, forward at closing time for after-hours coverage, or forward every call. [How to forward business calls](/blog/how-to-forward-business-calls/) walks through the settings.

### 3. Set up the receptionist

With LobbyStack as the example:

- You get a LobbyStack number (available in the US, Canada, the UK, Australia and New Zealand) and forward your business number to it. It can answer every call or only overflow or after-hours calls.
- It books into Google Calendar. With the caller's consent, it texts a confirmation and a reminder 24 hours before the appointment to US and Canadian numbers.
- It transfers urgent calls to one number per business. Transfers are blind, so it doesn't brief the person who picks up. If a transfer can't go through, it tells the caller, offers to take a message, and your team can get a "Live call transfer failed" alert.
- Each call gets a summary, transcript and recording. You get an email alert when it takes a message, and text alerts are optional.
- Calls open in your default language, English or French, and the receptionist then answers in the caller's language: 70+ languages, including Spanish.
- LobbyStack doesn't bill spam calls or calls under 10 seconds.

Know the limits before you forward a line: Google Calendar is the only calendar, the AI doesn't reply to texts, and there's no CRM or field-service software sync. For a full after-hours setup, see [after-hours answering](/solutions/after-hours-answering-service/).

### 4. Test it from your own profile

After your closing time, find your business on Google from a phone, tap **Call** and check that the call reaches your backup. Book a test appointment and ask for something urgent. Then read the call record. LobbyStack's Free plan gives you 30 voice minutes and a US or Canadian number free for 14 days, with no card, so you can forward your line and run this test before you pay.

## Are calls from Google about my Business Profile real?

Some are. Google says it may call or text the number on your profile to confirm details such as your hours, and to help customers book an appointment, check a wait time or confirm prices and stock ([Google](https://support.google.com/business/answer/7690269?hl=en)). Google never asks for payment information over the phone and never promises a special spot in its products ([Google](https://support.google.com/business/answer/6212928?hl=en)).

- **Opt out:** open your profile, select **More**, then **Business Profile settings** and **Advanced settings**. Under **Google automated calls and text messages**, turn off what you don't want. You need a verified profile, and Google may still call by hand to confirm your information. You can also ask the caller to stop calling.
- **Where the customer calls run:** booking, wait-time and price calls cover select regions. In the US, that's every state except Indiana, Louisiana, Minnesota, Montana and Nebraska.
- **Report a fake:** in the US, report fraud to the FTC at ReportFraud.ftc.gov, and tell Google through the webform linked on its [fraud page](https://support.google.com/business/answer/6212928?hl=en).

If a receptionist or an AI answers your line, these automated calls reach whoever answers. A booking call from Google carries a real customer's request, so tell your receptionist to expect them.

## Questions about Google Business Profile calls

### Does Google Business Profile still show call history?

No. Google removed call history and chat from Business Profile on July 31, 2024, and Google Takeout downloads of past records closed on August 30, 2024. Customers can still call you from your profile, and Performance still counts call-button clicks. For a list of calls, use your carrier's log or your answering service.

### How many phone numbers can a Google Business Profile have?

Three: one primary number plus up to two more. Google accepts mobile and landline numbers but not fax numbers. You add them under Edit profile, then Contact. Google's guidelines ask for a local number over a call-center helpline where possible, and the number must be under your business's direct control.

### Does the Calls metric count answered calls?

No. Google defines Calls as the number of times a customer clicked the call button on your Business Profile. A click doesn't show whether the call connected or whether anyone answered. To count answered and missed calls, compare the metric with your phone system's log or your answering service's records for the same dates.

### Do I need a verified profile to see call data?

Yes. Google shows Performance data only for verified Business Profiles, and you must be signed in to the Google Account that manages the profile. Owners and managers open Performance on Google Search or in the Google Maps app, choose a time period, and read the Calls figure for that period.

### Can an AI receptionist answer calls from my Google Business Profile?

Yes. Keep your number on the profile and forward it to the AI receptionist for missed calls, after-hours calls or every call. LobbyStack answers forwarded calls, books into Google Calendar, transfers urgent calls to one number, and saves a summary, transcript and recording of each call. Paid plans start at $30 a month, or $24 billed annually.

## Answer the calls your profile already sends you

Your profile puts your number one tap away from people searching for you. The person who picks up decides whether they book. Start with LobbyStack Free: 30 voice minutes and a US or Canadian number free for 14 days, no card needed, enough to hear how the receptionist handles a caller who found you on Google. To keep the number, Starter costs $30 a month for 150 minutes, then $0.20 a minute. There's no setup fee. [Start free](https://app.lobbystack.com/en/signup) or compare plans on the [pricing page](/pricing/).
