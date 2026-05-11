# Fly.io Voice Gateway Deployment

Use Fly.io for the public dev validation environment of `apps/voice-gateway`.

## Why This Exists

Twilio Media Streams local-tunnel validation has been unreliable. This deploy path gives the voice gateway:

- a stable public HTTPS/WSS URL
- real TLS termination
- an always-on machine for Twilio voice webhooks

Convex remains the main backend. Only the voice gateway is deployed here.

## Prerequisites

- `flyctl` installed and logged in
- a Convex deployment already running
- Twilio and OpenAI credentials available

## First Deploy

1. Pick a globally unique app name, for example `lobbystack-voice-dev-raphael`.
2. Edit [`fly.voice-gateway.toml`](/fly.voice-gateway.toml) and replace:

```toml
app = "replace-with-your-fly-app-name"
```

3. Create the Fly app:

```bash
fly apps create <your-app-name>
```

4. Set the required secrets:

```bash
fly secrets set -a <your-app-name> \
  DEPLOYMENT_MODE=development \
  VOICE_GATEWAY_BASE_URL=https://<your-app-name>.fly.dev \
  CONVEX_SITE_URL=<your-convex-site-url> \
  INTERNAL_SERVICE_TOKEN=<your-internal-service-token> \
  OPENAI_API_KEY=<your-openai-api-key> \
  OPENAI_REALTIME_MODEL=gpt-realtime-2 \
  OPENAI_REALTIME_INPUT_TOKEN_PRICE_USD=<optional-legacy-text-input-price-per-token> \
  OPENAI_REALTIME_OUTPUT_TOKEN_PRICE_USD=<optional-legacy-text-output-price-per-token> \
  OPENAI_REALTIME_TEXT_INPUT_TOKEN_PRICE_USD=<optional-text-input-price-per-token> \
  OPENAI_REALTIME_AUDIO_INPUT_TOKEN_PRICE_USD=<optional-audio-input-price-per-token> \
  OPENAI_REALTIME_TEXT_OUTPUT_TOKEN_PRICE_USD=<optional-text-output-price-per-token> \
  OPENAI_REALTIME_AUDIO_OUTPUT_TOKEN_PRICE_USD=<optional-audio-output-price-per-token> \
  OPENAI_REALTIME_CACHED_INPUT_TOKEN_PRICE_USD=<optional-cache-read-price-per-token> \
  OPENAI_REALTIME_VOICE=marin \
  OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe \
  OPENAI_TRANSCRIPTION_INPUT_TOKEN_PRICE_USD=<optional-transcription-input-price-per-token> \
  OPENAI_TRANSCRIPTION_OUTPUT_TOKEN_PRICE_USD=<optional-transcription-output-price-per-token> \
  TWILIO_ACCOUNT_SID=<your-twilio-account-sid> \
  TWILIO_AUTH_TOKEN=<your-twilio-auth-token>
```

5. Deploy:

```bash
fly deploy -c fly.voice-gateway.toml
```

## After Deploy

Verify health:

```bash
curl -i https://<your-app-name>.fly.dev/health
```

Expected response:

```http
HTTP/2 200
...
{"ok":true}
```

Then set the Twilio number voice webhook to:

```text
POST https://<your-app-name>.fly.dev/twilio/voice/inbound
```

## Notes

- `DEPLOYMENT_MODE=development` is intentional for the first validation pass. It keeps the current development-only fallbacks while we finish provider validation.
- If PostHog does not auto-price your configured `OPENAI_REALTIME_MODEL`, set the optional `OPENAI_REALTIME_*_TOKEN_PRICE_USD` secrets so the gateway can emit `$ai_total_cost_usd` from token usage.
- For voice calls, prefer the explicit text/audio token price secrets over the legacy generic input/output ones so the gateway can price Realtime audio and text buckets accurately.
- If `input_audio_transcription` is enabled, set the optional `OPENAI_TRANSCRIPTION_*_TOKEN_PRICE_USD` secrets too so the gateway can include separate transcription usage in the per-call OpenAI cost.
- Once the Twilio number is mapped to a real business in Convex, the gateway will stop using the demo `Maple Family Clinic` snapshot.
- Keep `min_machines_running = 1` so Twilio does not hit a cold-started machine during voice webhook delivery.
