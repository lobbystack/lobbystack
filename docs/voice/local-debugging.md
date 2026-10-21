# Run and debug LobbyStack on your desktop

This page runs LobbyStack on your desktop with Docker, debugs it in VS Code, and lets real phone calls and texts reach it through a public tunnel while your deployment keeps answering its own numbers. The commands work in PowerShell on Windows and in a terminal elsewhere. For scripted calls against the real model, see [Test a voice change before you ship it](./testing.md).

For debugging, run Postgres and Redis in Docker and the admin and worker from source with `pnpm dev`: code reloads when you save, and breakpoints work. To run every service in Docker the way a deployment does, see [Run the whole stack in Docker](#run-the-whole-stack-in-docker).

## Set up the local stack

You need:

- Docker Desktop. On Windows, keep its default WSL 2 backend.
- Node 26, which the repo requires, and pnpm 10.30.3: `npm install --global pnpm@10.30.3`.
- Git.

### Keep Linux line endings on Windows

Git for Windows checks files out with Windows line endings (CRLF) unless you've changed its default. Two files break with them:

- `docker/postgres/init/roles.sh` runs in Linux when Postgres first creates its database, and gives the app's database roles their passwords. With CRLF it fails, Docker restarts the container, and Postgres then skips the script because the database exists. The admin and worker can't connect to the database after that.
- `pnpm env:generate` reads `.env.example` line by line. With CRLF it generates no secrets and copies the placeholders.

Before you start Postgres for the first time, switch the clone to LF and check both files out again:

```powershell
git config core.autocrlf input
Remove-Item docker/postgres/init/roles.sh, .env.example
git restore docker/postgres/init/roles.sh .env.example
git ls-files --eol docker/postgres/init/roles.sh .env.example
```

The last command should show `w/lf` for both files. If Postgres already started with the CRLF script, run `docker compose down -v`. It deletes the database, which has nothing usable yet, along with the other Docker volumes, so the script runs again on the next start.

### Create the environment files

```sh
pnpm install
pnpm env:generate
```

`pnpm env:generate` writes `.env` from `.env.example` with new random secrets and says how many it generated. If it says 0, `.env.example` still has CRLF line endings. Fix them and run `pnpm env:generate --force`, which replaces every secret in `.env`.

Keep your own keys and overrides in `.env.local` at the repo root. `pnpm dev` and the database commands load it before `.env`, so its values win, and Git ignores it. Add `OPENAI_API_KEY` there for website chat and browser test calls.

### Start the database and the apps

```sh
docker compose up -d postgres redis
pnpm db:migrate
pnpm --filter @lobbystack/telemetry build
pnpm dev
```

- Compose takes the database passwords and ports from `.env`: Postgres listens on `127.0.0.1:15433` and Redis on `127.0.0.1:16380`.
- Run `pnpm db:migrate` again after you pull new migrations.
- The admin loads `@lobbystack/telemetry` from its build output, so on a fresh clone it fails with `Can't resolve '@lobbystack/telemetry/node'` until you build it. Build it again after you pull changes to `packages/telemetry`.
- `pnpm dev` starts the admin on port 13000, the worker on 13002, and the landing site on 4321. Each restarts or reloads when you save a file it uses.

Both `http://localhost:13000/api/health/ready` and `http://localhost:13002/health/ready` should answer with `"ok":true`.

Open the dashboard at `http://localhost:13000` exactly. Sign-in only trusts `APP_BASE_URL` unless you list more origins in `AUTH_TRUSTED_ORIGINS`, so `http://127.0.0.1:13000` gets `Invalid origin`.

Sign up there. The sign-up form then waits for an emailed code, which only arrives once the worker can send email, for example through Mailpit (below). With `REQUIRE_EMAIL_VERIFICATION=false`, as in `.env.example`, you can sign in with the same email and password instead.

On a fresh database, the first account starts onboarding by naming the deployment and choosing its logo. Skip that step to keep LobbyStack, or see [Brand a deployment](../branding.md). Onboarding then creates your business, and the worker publishes its first snapshot.

With `DEPLOYMENT_MODE=self_hosted_standard`, as in `.env.example`, your business is self-hosted. It has unlimited call minutes, and onboarding skips the mobile number check after the test call. On the number step, choose **I'll add a number later**. The local worker can't buy numbers without `TWILIO_SIP_TRUNK_SID`, which this setup leaves empty, so [Attach the number to a local business](#attach-the-number-to-a-local-business) adds a test number instead.

Any other `DEPLOYMENT_MODE` makes it a cloud business on the free plan, whose minutes run out. Onboarding then texts a code to your mobile before it offers a 14-day trial number, and sending that code needs a Twilio Verify service in `TWILIO_VERIFY_SERVICE_SID`. Keep `self_hosted_standard` for local work.

`pnpm db:seed` only adds a Demo Business that no one owns, so you can't sign in to it.

To read the emails the worker sends, start Mailpit with `docker compose --profile development up -d mailpit`, set `SMTP_HOST=127.0.0.1` and `SMTP_PORT=1025` in `.env.local`, restart `pnpm dev`, and open `http://localhost:8025`.

To start over with an empty database, run `docker compose down -v`, then start again from `docker compose up -d postgres redis`.

## Run the whole stack in Docker

Compose can also build and run the services a deployment runs from your working copy: the migrator, the admin, the worker and Caddy.

```sh
docker compose --env-file .env --env-file .env.local up -d --build
```

- Compose reads only `.env` unless you name files. The second `--env-file` adds `.env.local`, whose values win as they do with `pnpm dev`. Leave it out if you have no `.env.local`.
- Stop `pnpm dev` first. The containers take the same ports: 13000 for the admin and 13002 for the worker.
- The migrator applies migrations before the admin and worker start.
- The admin and worker run with `NODE_ENV=production`, so they refuse to start with the placeholder secrets from `.env.example`.
- Caddy serves `http://localhost` on port 80, but only for the host in `APP_HOSTNAME`. Point the tunnel below at the admin's port, 13000, not at Caddy.
- After you change code, run the command again to rebuild the images. After you change an env file, the same command recreates only the containers whose settings changed.
- Follow the logs with `docker compose logs -f admin worker`.

The images are production builds without source maps, so breakpoints can't map to the TypeScript source. To step through code against the same data, stop the app containers and run the apps from source:

```sh
docker compose stop admin worker caddy
pnpm dev
```

Recordings and uploads that the containers saved stay in the `storage_data` volume, which `pnpm dev` doesn't read.

## Debug in VS Code

Add `.vscode/launch.json`, which Git ignores in this repo:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "LobbyStack dev",
      "type": "node-terminal",
      "request": "launch",
      "command": "pnpm dev",
      "cwd": "${workspaceFolder}"
    }
  ]
}
```

It runs `pnpm dev` in a debug terminal, which attaches to every Node process it starts, so breakpoints bind in both the admin and the worker, including the packages they import. Stop any `pnpm dev` you started elsewhere first, since both would want the same ports.

- A test call from the local dashboard needs no tunnel. The browser talks to OpenAI over WebRTC and the worker attaches over its sideband, so instructions, tools, delegation and transcripts can all be debugged on localhost. `pnpm voice:eval` needs no tunnel either. The browser sends no keypad tones, though, so keypad PINs need a phone call.
- For each phone call it answers, the admin logs a `live.incoming` line with each step's timing. Lines starting with `[live]` say why it skipped or rejected a call. The worker logs JSON events such as `live.delegation` and `live.closed`.
- Saving a file the worker imports restarts the worker, which interrupts a call in progress. See [Debug a live call](#debug-a-live-call).

## Take real phone calls and texts

Use a phone call when you need the SIP path, caller ID, keypad PINs or transfers, and a text for the SMS routes. Both need a public URL.

To try a keypad PIN, set **Caller verification** to **Keypad PIN** in AI settings, then set a PIN on the caller's contact, on its Details tab. The worker reads the digits from the call's keypad events, so the PIN never reaches GPT-Live or the transcript. Both apps hash PINs with `OTP_HASH_SECRET`, which `pnpm env:generate` writes to `.env`. If you change it, every saved PIN stops working.

### What needs a public URL

Only the admin app receives requests from outside, and only on three routes:

| Sender | Route on the admin | When |
| --- | --- | --- |
| OpenAI | `POST /api/webhooks/openai/live` | A phone call arrives (`live.transport.incoming`) |
| Twilio | `POST /api/webhooks/twilio/sms` | Someone texts the number |
| Twilio | `POST /api/webhooks/twilio/status` | Delivery updates for texts the worker sends |

The worker only makes outbound connections: its sideband WebSocket to OpenAI and Twilio's API. The tunnel only needs the admin's port, `ADMIN_PORT` (13000 in `.env.example`). Keep the worker's port private, because its attach endpoint is there.

### Start a tunnel to the admin

The examples use ngrok. Its [free plan](https://ngrok.com/docs/pricing-limits/free-plan-limits) gives each account one fixed dev domain, such as `your-name.ngrok-free.app`, so you enter the URLs in OpenAI and Twilio once. The free monthly quota of 20,000 requests and 1 GB of transfer is plenty for webhooks, but not for browsing the dashboard through the tunnel.

Install ngrok (`winget install ngrok -s msstore` on Windows, or see [ngrok's download page](https://ngrok.com/download) for other systems), then add your authtoken:

```sh
ngrok config add-authtoken your_ngrok_authtoken
```

Save this [traffic policy](https://ngrok.com/docs/traffic-policy/concepts/expressions) as `webhooks-only.yml` outside the repo. It lets the three webhook routes through and answers 404 to everything else, so the rest of your dev admin stays off the internet:

```yaml
on_http_request:
  - expressions:
      - "!(req.url.path in ['/api/webhooks/openai/live', '/api/webhooks/twilio/sms', '/api/webhooks/twilio/status'])"
    actions:
      - type: deny
        config:
          status_code: 404
```

Start the tunnel with your dev domain, which the ngrok dashboard shows:

```sh
ngrok http 13000 --url https://your-dev-domain.ngrok-free.app --traffic-policy-file /path/to/webhooks-only.yml
```

ngrok's inspector at `http://127.0.0.1:4040` lists every webhook with the admin's response, and can replay one while you step through the route. A replayed text runs the route again but isn't saved twice, because the admin keys texts on Twilio's message ID.

If you own a domain on Cloudflare, a named `cloudflared` tunnel works the same way. Avoid quick tunnels on `trycloudflare.com`: their URL changes on every start, so you'd re-enter it in OpenAI and Twilio each time.

### Point OpenAI at the tunnel

Keep your deployment's OpenAI project and SIP trunk. In the OpenAI dashboard, open that project's webhooks and add a second endpoint:

- URL: `https://your-dev-domain.ngrok-free.app/api/webhooks/openai/live`, with no trailing slash. Next.js would redirect it, and OpenAI's [webhooks guide](https://developers.openai.com/api/docs/guides/webhooks) counts a redirect as a failed delivery.
- Event: `live.transport.incoming`.
- Copy the new endpoint's signing secret for the local `OPENAI_WEBHOOK_SECRET`. Each endpoint has its own secret, so your deployment's secret doesn't verify local deliveries.

OpenAI then sends every incoming call to both your deployment and your desktop. The webhook route in `apps/admin/app/api/webhooks/openai/live/route.ts` is built for that, the same way staging and production share one project: it answers a call only when the dialled number belongs to a business in its own database, and otherwise returns 200 and leaves the call alone. While the tunnel is up, the local admin logs `incoming call for a number this deployment doesn't serve` for your deployment's calls, and your deployment logs the same line for local ones.

While the tunnel is down, OpenAI keeps retrying deliveries to the local endpoint for up to 72 hours. Your deployment gets its own delivery, so its calls aren't affected.

Use an API key from that same project for the local `OPENAI_API_KEY`, because accepting a call has to come from the project that received it. A separate key lets you revoke it on its own and see local usage apart.

### Give the local stack its own number

Use a second Twilio number on the same account and the same SIP trunk:

1. Buy a number in Twilio, or pick a spare one, that no business on your deployment uses.
2. Add it to the SIP trunk under Elastic SIP Trunking. Its calls then reach OpenAI the same way your deployment's do.
3. In the number's messaging configuration, set "A message comes in" to Webhook, `https://your-dev-domain.ngrok-free.app/api/webhooks/twilio/sms`, HTTP POST.

Keep each number in one database only. If the same number belongs to a business on your deployment and on your desktop, both try to answer its calls and the first to accept wins. To debug calls to a deployed number, take that number off its deployed business first.

If you'd rather your deployment never see your test calls, and your desktop never see the deployment's, use a second OpenAI project with SIP enabled, its own webhook and API key, and a second Elastic SIP trunk whose origination URI is `sip:your_new_project_id@sip.api.openai.com;transport=tls`. Then put the test number on that trunk instead.

### Set the local environment

Add these to `.env.local`, then restart `pnpm dev`, or run the `docker compose` command again if you run the whole stack in Docker:

```dotenv
LIVE_PROTOTYPE_ENABLED=true
OPENAI_API_KEY=a_key_from_the_project_your_sip_trunk_uses
OPENAI_WEBHOOK_SECRET=the_local_endpoint_signing_secret
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_SMS_WEBHOOK_URL=https://your-dev-domain.ngrok-free.app/api/webhooks/twilio/sms
TWILIO_STATUS_CALLBACK_URL=https://your-dev-domain.ngrok-free.app/api/webhooks/twilio/status
```

- Twilio signs each request with the URL it called, and the admin checks the signature against these two URLs rather than the URL the request arrived on. They must match what's set in Twilio exactly, scheme and host included. The worker also adds the status URL to every text it sends, so delivery updates come back to the local stack.
- Keep `APP_BASE_URL` on localhost, so sign-in, links and recordings keep working there.
- Leave `TWILIO_SIP_TRUNK_SID` empty. The worker then refuses to provision numbers, so claiming a number in the local dashboard can't buy one on the shared account. A number bought locally would also get a localhost SMS URL, because the worker builds it from `APP_BASE_URL`. The only other effect is that local calls skip the Twilio price lookup.
- Run `pnpm dev` from the repo root. `pnpm dev:worker` on its own doesn't load the env files.
- `ALLOWED_DEV_ORIGINS` only matters if you open the dashboard through the tunnel, which also means dropping the traffic policy. It takes the hostname alone, without `https://`. Webhooks don't need it, because Next.js only guards its own `/_next` dev resources.

### Attach the number to a local business

The local dashboard only adds numbers by buying new ones, so add the test number's row directly:

```sh
docker compose exec postgres psql -U postgres -d lobbystack
```

```sql
select id, name from businesses;

insert into phone_numbers (business_id, e164, provider_phone_id, voice_webhook_status, voice_webhook_target_url, sms_webhook_status, sms_webhook_target_url)
values ('your_business_id', '+15815550123', 'your_number_sid', 'synced', 'sip-trunk:your_trunk_sid', 'synced', 'https://your-dev-domain.ngrok-free.app/api/webhooks/twilio/sms');
```

Calls find the business through this row right away. Then change and save one AI setting for that business in the local dashboard, such as the greeting. Saving rebuilds the business snapshot, which then lists the number among the business's contact details. A self-hosted business also texts from this number.

Don't release this number from the local dashboard: that releases it from your Twilio account.

### Check the path

With the stack and the tunnel running, send one request through the tunnel. In Windows PowerShell, type `curl.exe` rather than `curl`.

```sh
curl -X POST https://your-dev-domain.ngrok-free.app/api/webhooks/openai/live
```

`Invalid signature.` means the request reached the admin. With `pnpm dev`, it also compiles the route now, which would otherwise happen on your first real call while the caller hears ringing.

Then call the test number. The admin logs `live.incoming` with each step's timing, and the worker logs `live.delegation` and `live.closed`. Text the number to see the message under Messages. For repeatable calls, `pnpm voice:call` can dial the test number with the scripted callers from [Place real test calls](./testing.md#place-real-test-calls). It reads `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` from the shell, not from `.env.local`, and `pnpm voice:eval` reads `OPENAI_API_KEY` the same way.

### Debug a live call

A phone call keeps running while you're paused:

- Prefer logpoints in the worker during a call. While the worker is paused, GPT-Live's requests wait unanswered, timers that came due fire as soon as you resume (the silence timeout among them), and a long pause can drop the sideband, which ends the call.
- A breakpoint in the webhook route before the accept keeps the caller hearing ringing. OpenAI expects an answer within a few seconds and then delivers the event again. The route handles the repeat.
- Saving a file the worker imports, including package code, makes `tsx watch` restart the worker. On macOS and Linux the old process gets 5 seconds to end its calls with the restart goodbye from [Deploy the worker during calls](./runtime.md#deploy-the-worker-during-calls). On Windows it's killed at once: the call stays up, but nothing answers GPT-Live's requests until the recovery job takes the call over a minute or two later. Edit between calls.

## If something fails

| What you see | Likely cause |
| --- | --- |
| The admin or worker can't connect as a `lobbystack_` role: `is not permitted to log in`, `does not exist`, or `password authentication failed` | Postgres started with a CRLF `roles.sh`, or the passwords in `.env` changed after its first start. See [Keep Linux line endings on Windows](#keep-linux-line-endings-on-windows) |
| `pnpm env:generate` says it generated 0 secrets | `.env.example` has CRLF line endings |
| The admin or worker container keeps restarting and logs `must not use a placeholder value in production` | `.env` still has the placeholder secrets from `.env.example` |
| Docker says `Ports are not available` | Another program, or a port range Windows reserved, holds the port. `netsh interface ipv4 show excludedportrange protocol=tcp` lists the reserved ranges. Change the port in `.env`, along with the URLs that contain it |
| Sign-in fails with `Invalid origin` | The dashboard isn't open at `APP_BASE_URL` |
| The admin fails with `Can't resolve '@lobbystack/telemetry/node'` | Build it with `pnpm --filter @lobbystack/telemetry build` |
| The webhook answers 400 `Invalid signature.` to real calls in the ngrok inspector | `OPENAI_WEBHOOK_SECRET` is your deployment's secret, not the local endpoint's |
| The check request answers 500 instead of `Invalid signature.` | The admin has no `OPENAI_API_KEY`. Add it and restart `pnpm dev` |
| The local admin logs `incoming call for a number this deployment doesn't serve` for your test call | The number isn't in the local `phone_numbers` table, or isn't `active` |
| A busy signal | The local business is a cloud business whose minutes ran out, or whose trial number ended (SIP 486). Only businesses created with `DEPLOYMENT_MODE=self_hosted_standard` have unlimited minutes |
| The call never connects, and the local admin logs `no published snapshot for incoming call` | The worker hasn't published the business's snapshot. Check that the worker is running, then save an AI setting |
| The SMS webhook answers 401 | `TWILIO_SMS_WEBHOOK_URL` doesn't exactly match the number's URL in Twilio, or the auth token belongs to another account |
| Texts never reach the tunnel although the number's URL is right | The number belongs to a Messaging Service, whose own incoming-message setting applies |
| ngrok shows `ERR_NGROK_8012` | The admin isn't running on the tunnel's port |
