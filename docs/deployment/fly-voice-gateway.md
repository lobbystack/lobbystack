# Deploy the voice gateway on Fly.io

Use Fly.io for the public dev validation environment of `apps/voice-gateway`.

## Use the validation environment

Twilio Media Streams local-tunnel validation has been unreliable. This deploy path gives the voice gateway:

- a stable public HTTPS/WSS URL
- real TLS termination
- an always-on machine for Twilio voice webhooks

PostgreSQL and the admin backend remain the source of truth. Only the voice gateway is deployed here.

## Prerequisites

- `flyctl` installed and logged in
- a reachable admin backend already running
- Twilio and OpenAI credentials available

## Create the first deployment

1. Pick a globally unique app name, for example `lobbystack-voice-dev-raphael`.
2. Edit [`fly.voice-gateway.toml`](/fly.voice-gateway.toml) and replace:

```toml
app = "replace-with-your-fly-app-name"
```

3. Create the Fly app:

```bash
fly apps create lobbystack-voice-dev
```

4. Set the required secrets:

```bash
fly secrets set -a lobbystack-voice-dev \
  DEPLOYMENT_MODE=development \
  VOICE_GATEWAY_TRUST_PROXY=true \
  VOICE_GATEWAY_BASE_URL=https://lobbystack-voice-dev.fly.dev \
  BACKEND_INTERNAL_URL=https://app.example.com \
  INTERNAL_SERVICE_TOKEN=your_internal_service_token_here \
  OPENAI_API_KEY=your_openai_api_key_here \
  OPENAI_REALTIME_MODEL=gpt-realtime \
  OPENAI_REALTIME_INPUT_TOKEN_PRICE_USD=0.00 \
  OPENAI_REALTIME_OUTPUT_TOKEN_PRICE_USD=0.00 \
  OPENAI_REALTIME_TEXT_INPUT_TOKEN_PRICE_USD=0.00 \
  OPENAI_REALTIME_AUDIO_INPUT_TOKEN_PRICE_USD=0.00 \
  OPENAI_REALTIME_TEXT_OUTPUT_TOKEN_PRICE_USD=0.00 \
  OPENAI_REALTIME_AUDIO_OUTPUT_TOKEN_PRICE_USD=0.00 \
  OPENAI_REALTIME_CACHED_INPUT_TOKEN_PRICE_USD=0.00 \
  OPENAI_REALTIME_VOICE=marin \
  OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe \
  OPENAI_TRANSCRIPTION_INPUT_TOKEN_PRICE_USD=0.00 \
  OPENAI_TRANSCRIPTION_OUTPUT_TOKEN_PRICE_USD=0.00 \
  TWILIO_ACCOUNT_SID=your_twilio_account_sid_here \
  TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
```

If the gateway will serve web calls from local dev, set the allowed browser origins to include the dashboard and landing dev ports:

```bash
fly secrets set -a lobbystack-voice-dev \
  WEB_CALL_ALLOWED_ORIGINS=https://app.lobbystack.com,https://lobbystack.com,https://www.lobbystack.com,http://localhost:3000,http://127.0.0.1:3000,http://localhost:4321,http://127.0.0.1:4321
```

5. Deploy:

```bash
fly deploy -c fly.voice-gateway.toml
```

## Verify the deployment

Verify health:

```bash
curl -i https://lobbystack-voice-dev.fly.dev/health
```

Expected response:

```http
HTTP/2 200
...
{"ok":true}
```

Then set the Twilio number voice webhook to:

```text
POST https://lobbystack-voice-dev.fly.dev/twilio/voice/inbound
```

## Notes

- `DEPLOYMENT_MODE=development` is intentional for the first validation pass. It keeps the current development-only fallbacks while we finish provider validation.
- The web-call Cross-Origin Resource Sharing (CORS) allowlist must include the exact browser origin and port. The local dashboard uses `http://localhost:3000` by default. The local landing site uses `http://localhost:4321`.
- `VOICE_GATEWAY_TRUST_PROXY=true` trusts only loopback/link-local/private proxy ranges for client IP derivation. Use an explicit comma-separated CIDR list if your ingress proxy uses public source ranges.
- If PostHog does not auto-price your configured `OPENAI_REALTIME_MODEL`, set the optional `OPENAI_REALTIME_*_TOKEN_PRICE_USD` secrets so the gateway can emit `$ai_total_cost_usd` from token usage.
- For voice calls, prefer the explicit text/audio token price secrets over the legacy generic input/output ones so the gateway can price Realtime audio and text buckets accurately.
- If `input_audio_transcription` is enabled, set the optional `OPENAI_TRANSCRIPTION_*_TOKEN_PRICE_USD` secrets too so the gateway can include separate transcription usage in the per-call OpenAI cost.
- Once the Twilio number is mapped to a real business in PostgreSQL, the gateway will stop using the demo `Maple Family Clinic` snapshot.
- Keep `min_machines_running = 1` so Twilio does not hit a cold-started machine during voice webhook delivery.
