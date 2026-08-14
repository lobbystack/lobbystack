# Marketplace overview (paste into Railway publish form)

Use this copy after the unlisted LobbyStack template validates successfully. Replace `<TEMPLATE_CODE>` after creation.

---

# Deploy and Host LobbyStack with Railway

LobbyStack is an open-source AI receptionist for phone calls, SMS, and appointment scheduling. This template deploys a self-hosted stack: official Convex + Postgres, the operator web dashboard, and the voice gateway for Twilio and OpenAI Realtime.

## About Hosting LobbyStack

This template extends the official [Convex template](https://railway.com/deploy/convex) with LobbyStack application services. Railway provisions Postgres, the Convex backend and dashboard, builds the LobbyStack web app, and runs the voice gateway. After deploy, you push Convex functions from your machine and configure provider credentials (Twilio, OpenAI, etc.).

The Convex layer uses the same admin-key flow as the official Convex template: copy the key from **Convex Backend** deploy logs, set `CONVEX_SELF_HOSTED_ADMIN_KEY`, and restart the backend.

## Common Use Cases

- Self-hosted AI phone receptionist for clinics, salons, and local service businesses
- HIPAA- or GDPR-sensitive deployments where you control infrastructure
- Teams that want open-source voice AI with calendar and SMS integrations
- Developers evaluating LobbyStack before production hardening

## Dependencies for LobbyStack Hosting

### Deployment Dependencies

- [LobbyStack repository](https://github.com/lobbystack/lobbystack)
- [Official Convex on Railway](https://railway.com/deploy/convex)
- [LobbyStack Railway deployment guide](https://github.com/lobbystack/lobbystack/blob/main/docs/deployment/railway-template.md)
- [Self-hosting documentation](https://docs.lobbystack.com/self-hosting/overview)

### Implementation Details

Services included:

1. **Postgres** — Convex persistence (from Convex template)
2. **Convex Backend** — ports 3210 (API) and 3211 (HTTP actions via TCP proxy)
3. **Convex Dashboard** — admin UI on port 8080
4. **Web** — LobbyStack operator dashboard (`Dockerfile.web`, port 8080)
5. **Voice Gateway** — live call runtime (`Dockerfile.voice-gateway`, port 3001)

Post-deploy (required):

1. Set `CONVEX_SELF_HOSTED_ADMIN_KEY` from Convex Backend logs
2. Run `pnpm self-hosted:convex:env` and `pnpm self-hosted:convex:deploy` from a local clone
3. Redeploy **Web** after public URLs are final
4. Configure Twilio and OpenAI credentials

## Why Deploy LobbyStack on Railway?

Railway hosts the full stack—database, backend, web, and voice—on one platform with private networking between services, managed TLS, and vertical scaling. You avoid operating Caddy or separate Fly.io voice hosting for a standard self-hosted LobbyStack deployment.

---

## Deploy button (after publish)

```md
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/<TEMPLATE_CODE>?utm_medium=integration&utm_source=button&utm_campaign=lobbystack)
```

## Template authoring

Create and validate the template privately from [Railway workspace templates](https://railway.com/workspace/templates) using the service settings listed in the Railway deployment guide. Publish only after a fresh Railway deploy passes the post-deploy checklist.
