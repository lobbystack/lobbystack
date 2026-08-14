# Railway marketplace template for self-hosted LobbyStack

Author a full self-hosted LobbyStack template in the [Railway template composer](https://railway.com/workspace/templates). The template should extend Railway's official **[Convex template](https://railway.com/deploy/convex)** pattern with LobbyStack **Web** and **Voice Gateway** services.

Railway templates do not need `railway.toml` files. Configure each service directly in the template composer, or generate an unpublished template from a cleaned Railway reference project and review it in the composer before publishing.

Start with an **unlisted** template. Deploy it once in your own workspace, fix any wiring gaps, then publish it to the marketplace. Do not attach a live demo project for the first version.

> Railway must have an active workspace plan before you can create or attach services for validation. If the workspace trial is expired, finish the local docs and resume the Railway validation after billing is active.

## Architecture

| Service | Source | Role |
|---------|--------|------|
| Postgres | [Convex template](https://railway.com/deploy/convex) | Convex persistence |
| Convex Backend | Convex template | Self-hosted Convex API (3210) and HTTP actions (3211) |
| Convex Dashboard | Convex template | Admin UI (8080) |
| Web | `lobbystack/lobbystack` + [`Dockerfile.web`](../../Dockerfile.web) | Operator dashboard (nginx, port 8080) |
| Voice Gateway | `lobbystack/lobbystack` + [`Dockerfile.voice-gateway`](../../Dockerfile.voice-gateway) | Twilio / OpenAI Realtime runtime (port 3001) |

Railway provides HTTPS per service. Caddy from the Docker Compose stack is not required.

## Author the template

1. Confirm the source branch is `main` and includes `Dockerfile.web`, `Dockerfile.voice-gateway`, and the self-hosted helper scripts.
2. Open [Railway workspace templates](https://railway.com/workspace/templates).
3. Click **New Template**.
4. Add the Convex services using the official [Convex template](https://railway.com/deploy/convex) as the configuration reference:
   - **Postgres**
   - **Convex Backend**
   - **Convex Dashboard**
5. Add two GitHub services from `lobbystack/lobbystack` on `main`:
   - **Web**
   - **Voice Gateway**
6. Configure service build and deploy settings directly in the composer:

| Service | Dockerfile | Start command | Healthcheck |
|---------|------------|---------------|-------------|
| Web | `Dockerfile.web` | `nginx -g 'daemon off;'` | `/healthz` |
| Voice Gateway | `Dockerfile.voice-gateway` | `./node_modules/.bin/tsx src/index.ts` | `/health` |

7. Generate public networking:
   - **Web** → port **8080**
   - **Voice Gateway** → port **3001**
   - **Convex Backend** → HTTP port **3210**
   - **Convex Backend** → **TCP proxy** port **3211** (HTTP actions / `CONVEX_SITE_URL`)
   - **Convex Dashboard** → port **8080**

## Variable wiring

Use exact service names for `${{...}}` references (case-sensitive): `Convex Backend`, `Convex Dashboard`, `Postgres`, `Web`, `Voice Gateway`.

### Convex Backend (from official template + LobbyStack)

| Variable | Value |
|----------|-------|
| `CONVEX_CLOUD_ORIGIN` | `${{PUBLIC_CONVEX_CLOUD_ORIGIN}}` |
| `CONVEX_SITE_ORIGIN` | `${{PUBLIC_CONVEX_SITE_ORIGIN}}` |
| `CONVEX_SELF_HOSTED_ADMIN_KEY` | Copy from first-run deploy logs, then restart backend |
| `INSTANCE_SECRET` | `${{secret(64, "abcdef0123456789")}}` (template default) |
| `POSTGRES_URL` | `${{Postgres.CONVEX_DATABASE_URL}}` |
| `APP_BASE_URL` | `https://${{Web.RAILWAY_PUBLIC_DOMAIN}}` |
| `SITE_URL` | `https://${{Web.RAILWAY_PUBLIC_DOMAIN}}` |
| `VOICE_GATEWAY_BASE_URL` | `https://${{Voice Gateway.RAILWAY_PUBLIC_DOMAIN}}` |
| `CONVEX_URL` | `${{PUBLIC_CONVEX_CLOUD_ORIGIN}}` |
| `CONVEX_SITE_URL` | `${{PUBLIC_CONVEX_SITE_ORIGIN}}` |
| `INTERNAL_SERVICE_TOKEN` | `${{secret(32)}}` |
| `SESSION_ENCRYPTION_KEY` | `${{secret(32)}}` |
| `NUMBER_CLAIM_TOKEN_SECRET` | `${{secret(32)}}` |
| `DEPLOYMENT_MODE` | `self_hosted_standard` |

Enable **TCP proxy** on **Convex Backend** for port **3211** so `PUBLIC_CONVEX_SITE_ORIGIN` resolves to `http://${{RAILWAY_TCP_PROXY_DOMAIN}}:${{RAILWAY_TCP_PROXY_PORT}}`.

### Web (build-time + runtime)

| Variable | Value |
|----------|-------|
| `CONVEX_URL` | `${{Convex Backend.PUBLIC_CONVEX_CLOUD_ORIGIN}}` |
| `CONVEX_SITE_URL` | `${{Convex Backend.PUBLIC_CONVEX_SITE_ORIGIN}}` |
| `VITE_APP_NAME` | `LobbyStack` |
| `VITE_DEPLOYMENT_MODE` | `self_hosted_standard` |

Redeploy **Web** after Convex public URLs are final.

### Voice Gateway

| Variable | Value |
|----------|-------|
| `CONVEX_SITE_URL` | `http://${{Convex Backend.RAILWAY_PRIVATE_DOMAIN}}:3211` |
| `VOICE_GATEWAY_BASE_URL` | `https://${{Voice Gateway.RAILWAY_PUBLIC_DOMAIN}}` |
| `WEB_CALL_ALLOWED_ORIGINS` | `https://${{Web.RAILWAY_PUBLIC_DOMAIN}}` |
| `INTERNAL_SERVICE_TOKEN` | Same value as on **Convex Backend** |
| `DEPLOYMENT_MODE` | `self_hosted_standard` |
| `VOICE_GATEWAY_TRUST_PROXY` | `true` |
| `PORT` | `3001` |
| `OPENAI_API_KEY` | User-supplied (required for voice) |
| Twilio vars | User-supplied when using telephony |

## Post-deploy checklist

### 1. Convex admin key ([official Convex template flow](https://railway.com/deploy/convex))

1. Open **Convex Backend** deploy logs on first run.
2. Copy the line after `Admin key:` (format `railway|...`).
3. Set `CONVEX_SELF_HOSTED_ADMIN_KEY` on **Convex Backend**.
4. Restart **Convex Backend**.
5. Open **Convex Dashboard** public URL and sign in with the admin key.

Do **not** use the `convex-postgres` SSH flow (`./generate_admin_key.sh`) for the `convex` template unless you migrate templates.

### 2. Deploy LobbyStack Convex functions

From a local clone:

```bash
cp .env.self-hosted.example .env.self-hosted
# Set:
# CONVEX_SELF_HOSTED_URL=https://<convex-backend-3210-domain>
# CONVEX_SELF_HOSTED_ADMIN_KEY=<admin-key-from-logs>
pnpm self-hosted:convex:env
pnpm self-hosted:convex:deploy
```

Sync provider secrets (Twilio, OpenAI, Turnstile, etc.) via `pnpm self-hosted:convex:env` — see [environment variables](https://docs.lobbystack.com/self-hosting/environment-variables).

### 3. Redeploy Web

After public URLs and Convex env are stable:

```bash
railway redeploy --service Web --yes
```

### 4. Verify

```bash
pnpm self-hosted:verify
```

Manual checks:

- `https://<web-domain>/healthz` → 200
- `https://<convex-backend-domain>/version` → 200
- `https://<voice-domain>/health` → 200

## Validate the unpublished template

1. Create the template and leave it unpublished/unlisted.
2. Deploy the template into a fresh Railway project in your own workspace.
3. Complete the post-deploy checklist above.
4. Run `pnpm self-hosted:verify` with Railway-specific verify URLs.
5. Fix the template composer settings until the deploy passes without manual service rewiring.

## Publish the marketplace template

1. Review all five services, volumes, TCP proxy on 3211, and variable descriptions in the composer.
2. Publish using the overview in [`railway-marketplace-overview.md`](./railway-marketplace-overview.md).
3. Leave **Live Demo** empty for v1.
4. Copy the template code and add the **Deploy on Railway** button to the README:

   ```md
   [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/<TEMPLATE_CODE>?utm_medium=integration&utm_source=button&utm_campaign=lobbystack)
   ```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `PUBLIC_CONVEX_SITE_ORIGIN` is `http://:` | Enable TCP proxy on **Convex Backend** port 3211 and redeploy |
| Web loads but Convex client errors | Redeploy **Web** after setting final `CONVEX_URL` / `CONVEX_SITE_URL` build args |
| Voice gateway unhealthy | Confirm `PORT=3001`, private `CONVEX_SITE_URL`, and `INTERNAL_SERVICE_TOKEN` match Convex Backend |
| Service limit in a throwaway project | Author the template directly in the template composer instead of provisioning a reference project |
| `pnpm self-hosted:convex:deploy` fails | Confirm admin key is set and backend restarted |

## Related docs

- [Docker Compose self-hosting](https://docs.lobbystack.com/self-hosting/docker-compose)
- [Environment variables](https://docs.lobbystack.com/self-hosting/environment-variables)
- [Official Convex on Railway](https://railway.com/deploy/convex)
