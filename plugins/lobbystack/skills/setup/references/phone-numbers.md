# Add a phone number to a quickstart install

A phone call reaches the agent through the carrier, then OpenAI's SIP endpoint, then a webhook to the dashboard. That webhook needs a public HTTPS address, so the quickstart's `http://localhost:3000` isn't enough. Work through the sections in order. Every setting goes in the install's env file (`lobbystack/.env`, or `.env.quickstart` in a clone); after editing it, rerun the quickstart script, or run `docker compose up -d` from the install directory, so the containers pick it up.

Tell the user what each step costs before they start: a domain or tunnel, a carrier account with a paid number, and OpenAI usage per call minute.

## 1. Give the dashboard a public HTTPS address

Pick one with the user:

- **A server**: run the quickstart on a server with a DNS name, and put a reverse proxy that ends HTTPS, such as Caddy, nginx or a load balancer, in front of `127.0.0.1:3000`.
- **A tunnel, to try it from a laptop**: Cloudflare Tunnel or ngrok pointed at `http://localhost:3000`. Use a fixed hostname: OpenAI and the carrier keep calling the address you give them.

The proxy or tunnel must pass the original `Host` header through. The dashboard answers only on the hostname in `APP_BASE_URL`.

Then set:

```dotenv
APP_BASE_URL=https://receptionist.example.com
BETTER_AUTH_USE_SECURE_COOKIES=true
# Keeps http://localhost:3000 working alongside the public address.
AUTH_TRUSTED_ORIGINS=http://localhost:3000
# The one header your proxy sets to the client's IP, such as x-real-ip. Leave it out if unsure.
TRUSTED_CLIENT_IP_HEADER=
```

The Twilio webhook URLs and the Google redirect URI follow `APP_BASE_URL` on their own. Done when `curl -fsS https://<host>/api/health/ready` returns `"ok":true` from another machine.

## 2. Connect OpenAI

1. In the OpenAI dashboard, open the project that owns the API key and copy its ID, which starts with `proj_`. Set it as `OPENAI_PROJECT_ID`.
2. Add a webhook for the `live.transport.incoming` event that points to `https://<host>/api/webhooks/openai/live`. Set its signing secret as `OPENAI_WEBHOOK_SECRET`.

## 3. Connect a carrier

Use Twilio unless the user prefers Telnyx. One deployment can use both.

### Twilio

1. Set `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` from the Twilio Console.
2. Create an Elastic SIP trunk. Under **Origination**, add the URI `sip:<OPENAI_PROJECT_ID>@sip.api.openai.com;transport=tls`, and set the disaster recovery URL to `https://<host>/api/webhooks/twilio/voice` with `POST`. Allow transfers to any number, so the agent can hand calls to staff.
3. Set the trunk's SID, which starts with `TK`, as `TWILIO_SIP_TRUNK_SID`. The worker refuses to buy a number without it.

Twilio sells numbers in the US, Canada and Puerto Rico without paperwork. The UK, Australia and New Zealand need an approved regulatory bundle per country; the [voice runtime guide](https://github.com/lobbystack/lobbystack/blob/main/docs/voice/runtime.md#sell-numbers-in-the-uk-australia-and-new-zealand) lists the variables.

### Telnyx

The worker creates the SIP connection for each Telnyx number itself. Set up the rest:

1. Set `TELNYX_API_KEY`, and the account's public key from **Account settings > Keys & Credentials > Public Key** as `TELNYX_PUBLIC_KEY`. `OPENAI_PROJECT_ID` from step 2 is required too.
2. Create an outbound voice profile and set its ID as `TELNYX_OUTBOUND_VOICE_PROFILE_ID`.
3. Pick a random secret. Create a TeXML application whose voice URL is `https://<host>/api/webhooks/telnyx/voice?key=<secret>` with `POST`, and give it the same outbound voice profile. Set its ID as `TELNYX_TEXML_APPLICATION_ID` and the secret as `TELNYX_TEXML_WEBHOOK_SECRET`.
4. Create a messaging profile whose webhook URL is `https://<host>/api/webhooks/telnyx/sms`, and set its ID as `TELNYX_MESSAGING_PROFILE_ID`.
5. Send numbers to Telnyx with `TELEPHONY_NUMBERS=*:telnyx`, or by country such as `US:telnyx,*:twilio`. Without Twilio credentials, also set `TELEPHONY_LOOKUP=telnyx`.

The [voice runtime guide](https://github.com/lobbystack/lobbystack/blob/main/docs/voice/runtime.md#use-telnyx) lists the parts of the Telnyx path that haven't been tested against a live account.

## 4. Buy the number

Apply the settings, then check `docker compose ps` shows `admin` and `worker` healthy. A malformed carrier setting stops the worker at boot, and its logs name the setting.

On the dashboard home, the user selects **Connect a phone number** under **Getting started**, searches by country and area code, and picks a number. Done when calling that number reaches the agent. If the call fails, read the `admin` logs for the OpenAI webhook and the `worker` logs for the call.
