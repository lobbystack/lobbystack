# Answer calls on a number from another carrier

Twilio and Telnyx sell the numbers LobbyStack answers today. Some countries have neither. A business there can keep a number it gets from a local carrier or a reseller such as Zadarma, and have that carrier send the calls to a SIP server you run. The server passes each call to OpenAI, and LobbyStack answers it like any other. This page explains how that works, how to run the server, and what such a number can't do.

Use it when LobbyStack can't buy a number in the business's country. It is manual work for each number, and it carries voice only.

## How a call reaches the agent

```
Caller → carrier → SIP server (docker/asterisk) → OpenAI → LobbyStack
```

1. The carrier sends the call to `sip:<number>@<your server>`, where `<number>` is the dialled number's digits with the country code, such as `381211234567`. You set that address on the carrier once for each number.
2. The server accepts the call only from the carrier's addresses. It reads the dialled number from the SIP address and works out the caller's number from the carrier's headers.
3. The server sends the call to your OpenAI project over TLS with encrypted audio. The caller's number goes in `From` as `+<country code><number>`, and the dialled number goes in `X-LobbyStack-Called` as `tel:+<number>`.
4. From there the call is the one [Follow a phone call](./runtime.md#follow-a-phone-call) describes. The admin finds the business from `X-LobbyStack-Called`, and the worker attaches to the session.

LobbyStack holds no account with the carrier. The number is a `phone_numbers` row with `carrier` set to `external` and no `provider_phone_id`. No adapter buys, routes, texts from or releases it, and the jobs that would call one skip it. Business deletion and the dashboard's remove action leave the carrier alone.

## Run the SIP server

The server runs on a host with a public IP address, such as a small VPS. It needs Docker.

1. Copy `docker/asterisk/asterisk.env.example` to `docker/asterisk/asterisk.env` and set at least these:

   | Variable | What it holds |
   | --- | --- |
   | `OPENAI_PROJECT_ID` | Your OpenAI project id, the same one as `OPENAI_PROJECT_ID` on the worker. |
   | `CARRIER_IPS` | The carrier's SIP server addresses, comma separated. The server refuses calls from anywhere else. |
   | `DEFAULT_COUNTRY_CODE` | The country code, without the plus, added to a caller number that starts with 0. The default is `381`. |
   | `CALLER_HEADER` | The header that holds the caller's number, when it isn't `P-Asserted-Identity`, `Remote-Party-ID` or `From`. Leave it empty until a test call shows you need it. |
   | `PUBLIC_IP` | The server's public address, only when it sits behind NAT. |
   | `TLS_CERT_FILE`, `TLS_KEY_FILE` | A certificate for the server's host name, only when the carrier sends calls over TLS. Put the files in `docker/asterisk/certs`. The `asterisk` user must be able to read them. |

2. Start it:

   ```sh
   cd docker/asterisk
   docker compose up -d --build
   ```

3. Open these ports. The carrier publishes its addresses, and OpenAI lists the media addresses in its [SIP guide](https://developers.openai.com/api/docs/guides/voice-sip), so check both against the current lists.

   | Direction | Port | Peer |
   | --- | --- | --- |
   | In | UDP 5060, or TCP 5061 for TLS | The carrier's addresses only |
   | In and out | UDP 10000–10200 (`RTP_START` to `RTP_END`) | The carrier's addresses and OpenAI's media addresses |
   | Out | TCP 5061 | `sip.api.openai.com`, which resolves to different addresses by region |

The server needs no database and keeps nothing between calls. Its logs go to the container's output.

## Connect the carrier

Set each number's destination at the carrier to an external SIP address:

```
sip:381211234567@sip.your-server.example:5060
```

Use the digits only, with no plus. The server answers a number with a plus or letters as "not found" and logs why.

Start with UDP on port 5060, and move to TLS on port 5061 once calls work and the server has a certificate.

### Zadarma

Zadarma confirmed in November 2026 that it keeps the user part of the address in the INVITE's Request-URI and in `To`, that `From` holds the caller's number, and that it sends over UDP, TCP or TLS on the port you set. It sends G.711 A-law and µ-law, which the server passes through.

Zadarma's landline numbers come with 2 incoming channels, so a number takes 2 calls at once. A third caller gets nothing, and the call never reaches the server or LobbyStack. A number can have up to 15 more channels, each priced per month. Zadarma's numbers API (`PUT /v1/direct_numbers/set_sip_id/`) sets a number's destination in a script.

Zadarma's support told us the caller's number is in `From`, which the server reads when there is no `P-Asserted-Identity` or `Remote-Party-ID`. The first test call confirms it: the log line shows the caller.

## Attach the number to a business

```sh
pnpm exec tsx scripts/operations/attach-external-number.ts \
  --business-id your_business_id --number +381211234567 --apply
```

The script prints what it would do until you pass `--apply`. It gives the number to the business's default agent. Pass `--agent-id` to pick another agent of that business. Running it again for a number the business already has changes nothing. A number that any business or carrier holds is refused.

Do this once the business has finished onboarding. The dashboard then lists the number like any other.

To take it off the business, run the same command with `--remove`:

```sh
pnpm exec tsx scripts/operations/attach-external-number.ts \
  --business-id your_business_id --number +381211234567 --remove --apply
```

That never touches a number a carrier holds. Cancel the number with the carrier too, or it keeps billing.

## Test a call

1. Watch the server: `docker compose logs -f asterisk`. Turn on SIP tracing with `docker compose exec asterisk asterisk -rx "pjsip set logger on"`.
2. Call the number from a phone.
3. The server logs one line per call: `call dialled=+381211234567 caller=+381641234567`.
   - `caller=anonymous` means the server found no caller number. Read the INVITE in the SIP trace, find the header that holds it, and set `CALLER_HEADER` to that header's name. A caller who withholds their number also shows as `anonymous`, and the admin then keeps the call without a contact number, as it does for any withheld number.
   - No line at all means the carrier didn't reach the server. Check `CARRIER_IPS`, the firewall and the address you set at the carrier.
4. In the admin's logs, `live.incoming` shows `routedBy: x-lobbystack-called` and the call opens in the dashboard with the caller as a contact.

Call it from a phone a few times before you give it to a customer, and run `pnpm voice:call` against it. [testing.md](./testing.md) describes the script.

## What an external number can't do

- **Texts.** The number carries voice only, so it sends and receives no texts. The shared sender texts only +1 numbers, so a business outside them gets no texts, the same as a New Zealand business.
- **Transfers.** OpenAI transfers a call by sending a REFER to the server. The server has no outbound line to place the transfer, so the agent can't hand a call to staff. Transfers need an outbound line at the carrier.
- **Calls the agent can't take.** When LobbyStack refuses a call, such as for an out-of-minutes plan or a blocked caller, the server answers the carrier with busy or congestion. Nothing forwards the caller to the owner.
- **Staff answers first.** This works on Twilio numbers only.
- **Call cost.** The worker has no carrier to ask what a call cost, so it skips the price lookup.
- **Capacity.** The carrier sets how many calls a number takes at once.
