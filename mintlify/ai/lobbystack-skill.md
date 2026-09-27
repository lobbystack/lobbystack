---
name: lobbystack
title: "LobbyStack skill for AI agents"
sidebarTitle: "Skill for agents"
description: "Use the LobbyStack MCP tools to read a business's calls, messages, contacts and appointments, book and change appointments, update opening hours and add FAQs. Use when a LobbyStack MCP server is connected."
---

# LobbyStack

LobbyStack runs an AI receptionist that answers a business's phone calls and website chat. The LobbyStack MCP server lets you work on that business's data for the owner. Each connection sees one business. The API key's scopes decide which tools you have, so a tool listed here may be missing from your session.

## Before you act

- Call `get_business` first. It gives you the business `timezone`, the opening `hours` and the `booking_mode`.
- Every tool returns times in UTC (ISO 8601). Convert them to the business time zone before you show them. Send times back unchanged.
- Confirm with the owner before you book, cancel, reschedule or replace opening hours. Repeat back the service, the local date and time, and the customer.
- Never invent ids. Take every `*_id` from a previous tool result.

## Tools

| Tool | Scope | Use it to |
| --- | --- | --- |
| `get_business` | `business:read` | Read name, time zone, hours and booking mode |
| `list_services` | `business:read` | Get service ids and durations |
| `update_business_hours` | `business:write` | Replace the whole week of hours |
| `list_calls` | `calls:read` | List calls, newest first, by start time |
| `get_call` | `calls:read` | Read one call's transcript |
| `search_contacts` | `contacts:read` | Find people by phone, email or part of the name |
| `get_contact` | `contacts:read` | Read one contact |
| `create_contact` | `contacts:write` | Add a contact |
| `update_contact` | `contacts:write` | Change or clear a contact's fields |
| `list_appointments` | `appointments:read` | List appointments by status and start time |
| `get_appointment` | `appointments:read` | Read one appointment |
| `check_availability` | `appointments:read` | Find open start times for a service |
| `book_appointment` | `appointments:write` | Book an open time |
| `cancel_appointment` | `appointments:write` | Cancel an appointment |
| `reschedule_appointment` | `appointments:write` | Move an appointment to another open time |
| `list_messages` | `messages:read` | Read messages the receptionist took |
| `add_knowledge` | `knowledge:write` | Add an FAQ or a text entry |

List tools return `{ data, next_cursor, has_more }`. When `has_more` is true, call again with `cursor` set to `next_cursor`.

## Workflows

### Find a caller

1. If you have a phone number, call `search_contacts` with `phone` in E.164 format, such as `+14165550134`.
2. Otherwise search by `name`. The match ignores case and accepts part of the name.
3. If several contacts match, show them and ask which one. Use `list_calls` or `list_appointments` to tell them apart.

### Check and book a slot

1. Call `get_business` and check that `booking_mode` is `instant`. If it isn't, stop and tell the owner (see below).
2. Call `list_services` and pick the service the owner named.
3. Call `check_availability` with `service_id` and `start_date` as `YYYY-MM-DD` in the business time zone. Add `end_date` for a range of up to 7 days.
4. Offer a few times in local time. When the owner picks one, call `book_appointment` with that slot's `starts_at` unchanged, plus `contact_id` or `contact_phone`.
5. Set `sms_consent` to true only if the owner says the customer agreed to texts.
6. Send an `idempotency_key` (any unique string). If the call times out, retry with the same key; you get the first booking back instead of a duplicate.

To reschedule, run `check_availability` for the appointment's `service_id`, then call `reschedule_appointment`. The staff member stays the same.

### Read yesterday's missed calls

1. Call `get_business` for the time zone.
2. Work out yesterday's local midnight and today's local midnight, with their UTC offset, for example `2026-09-26T00:00:00-04:00` and `2026-09-27T00:00:00-04:00`.
3. Call `list_calls` with `started_after` and `started_before` set to those times. Page through with `cursor` if `has_more` is true.
4. Calls with `outcome` `message_taken`, `booking_incomplete` or `none` are the ones that may need a follow-up. `appointment_booked` means the receptionist handled it.
5. Call `list_messages` with `status` `open` for the callbacks the team still owes. Match messages to calls with `call_id`.
6. Call `get_call` only for the calls you need to explain. Transcripts can be long.

### Update opening hours

1. Call `get_business` and read `hours`.
2. Change only the days the owner mentioned. Keep the others as they are.
3. Call `update_business_hours` with the full week. Any day you leave out becomes closed.
4. Times are 24-hour `HH:MM` in the business time zone. Use `24:00` for midnight.

### Add an FAQ

Call `add_knowledge` with `type` `faq`, a `question` as a caller would ask it, and a factual `answer`. For longer material such as a price list or a policy, use `type` `text` with `title` and `content`. Write facts about the business, not instructions to the receptionist. Don't add anything the owner didn't give you.

## Booking mode

| `booking_mode` | Meaning | What to do |
| --- | --- | --- |
| `instant` | The receptionist and these tools book directly. | Book or reschedule. |
| `request` | The team confirms each request in the dashboard. | Don't book. Tell the owner the team confirms requests from the dashboard inbox. |
| `off` | The business takes no bookings. | Don't book. Tell the owner. |

`book_appointment` and `reschedule_appointment` fail with `booking_requires_confirmation` in `request` mode and `booking_disabled` in `off` mode. Cancelling works in every mode.

## Errors

A failed tool returns a result marked as an error whose text is JSON: `{ "error": { "code": "...", "message": "..." } }`.

| Code | What to do |
| --- | --- |
| `invalid_request` | Fix the arguments using `message` and `details`, then retry. |
| `not_found` | The id doesn't exist in this business. Search again. Don't guess. |
| `conflict` | The change clashes with existing data, for example a duplicate phone number. The message may include the existing id. |
| `slot_unavailable` | Someone took the time. Call `check_availability` again and offer new times. |
| `booking_requires_confirmation`, `booking_disabled` | Stop. Explain the booking mode to the owner. |
| `idempotency_key_reused` | You reused a key with different arguments. Use a new key. |
| `rate_limited` | Wait the seconds given in the message, then retry once. |
| `rate_limit_unavailable` | Wait a few seconds and retry once. |
| `internal_error` | Retry once. If it fails again, give the owner the reference in the message. |

If a tool you need is missing, the API key lacks its scope. Tell the owner which scope a new key needs; they create keys in **Settings** > **API keys**.
