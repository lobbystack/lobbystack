# Serve partners' domains

Partners reach their dashboards on a subdomain of the partner base domain, such as `acme.receptionistportal.com`. They can also connect a subdomain of their own website, such as `app.acmeagency.com`: on a paid tier while the deployment sells tiers, and on any tier otherwise. This page covers what you set up once per deployment: Cloudflare for SaaS and Traefik on the cloud's Dokploy server, and Caddy on a self-hosted Compose server. After that, the admin and the worker add, check and remove each partner's domain on their own, as [A partner's own domain](../branding.md#a-partners-own-domain) describes.

## On the cloud

Cloudflare carries every partner hostname to the Dokploy server in [Deploy LobbyStack on Dokploy](dokploy.md). Subdomains of `receptionistportal.com` arrive through a wildcard record, and partners' own domains through Cloudflare for SaaS. Traefik sends each hostname it has no other route for to the production admin, which answers the hostname with its partner's brand, or with a 404 when it belongs to no partner.

### Set up the partner base domain

The `receptionistportal.com` zone carries the partner subdomains:

1. Add `receptionistportal.com` to Cloudflare as its own zone.
2. Add a proxied `A` record for `*`, pointing at the server's address from [Hostnames](dokploy.md#hostnames).
3. Set the zone's SSL/TLS encryption mode to **Full**. Cloudflare connects to the server with each partner's own hostname, which no origin certificate covers, so **Full (strict)** would refuse those connections.
4. Create a Cloudflare Origin CA certificate for `receptionistportal.com` and `*.receptionistportal.com`, and add it in Dokploy under **Certificates**. Traefik serves it for partner subdomains, and its default certificate for partners' own domains. **Full** accepts both.
5. Set `PARTNER_BASE_DOMAIN=receptionistportal.com` on the production `admin` and `worker`.

### Turn on Cloudflare for SaaS

Partners' own domains reach the server as custom hostnames of the same zone:

1. In the `receptionistportal.com` zone, open **SSL/TLS** > **Custom Hostnames** and enable Cloudflare for SaaS.
2. Add a proxied `A` record for `host.receptionistportal.com`, pointing at the same address. No partner can take `host` as its slug.
3. On the **Custom Hostnames** page, choose **Add Fallback Origin**, enter `host.receptionistportal.com`, and wait until its status shows **Active**.
4. Under **My Profile** > **API Tokens**, create a custom token with the **Zone** > **SSL and Certificates** > **Edit** permission, limited to the `receptionistportal.com` zone.
5. On the production `admin` and `worker`, set `CLOUDFLARE_SAAS_API_TOKEN` to the token and `CLOUDFLARE_SAAS_ZONE_ID` to the zone ID from the zone's **Overview** page. Leave `PARTNER_DOMAIN_CNAME_TARGET` unset, so partners point their CNAME record at the fallback origin.

Partners' CNAME records name `host.receptionistportal.com`, so keep that record. To move to another server, change the record's address.

The worker registers each partner's domain as a custom hostname with a certificate that Cloudflare validates over HTTP. The domain goes live once Cloudflare reports the hostname and its certificate active. Cloudflare's traffic for these hostnames comes from its published ranges, so the [firewall](dokploy.md#firewall) and `TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip` already cover it.

### Route every partner hostname to the admin

Dokploy writes one Traefik route for each domain it knows, so partner hostnames need one more route that catches every other hostname. Over SSH, create `/etc/dokploy/traefik/dynamic/partner-hosts.yml` on the server. Dokploy's **Traefik File System** page then lists it beside the files Dokploy writes:

```yaml
http:
  routers:
    partner-hosts:
      rule: "PathPrefix(`/`)"
      priority: 1
      entryPoints: [websecure]
      tls: {}
      service: partner-hosts
    partner-hosts-http:
      rule: "PathPrefix(`/`)"
      priority: 1
      entryPoints: [web]
      middlewares: [partner-hosts-https]
      service: partner-hosts
  middlewares:
    partner-hosts-https:
      redirectScheme:
        scheme: https
        permanent: true
  services:
    partner-hosts:
      loadBalancer:
        servers:
          - url: http://lobbystack-admin-8oaiya:3000
```

The URL names the production admin's app name from [Services](dokploy.md#services). Traefik watches the directory and loads the file without a restart. Priority 1 ranks this route below every route Dokploy writes, so `app.lobbystack.com`, `staging.lobbystack.com` and the Dokploy panel keep theirs. With **Full**, Cloudflare sends a visitor's plain HTTP request to port 80, where the second router moves it to HTTPS.

### Let people at partners' businesses sign up

Sign-up asks for a Turnstile challenge, and the `lobbystack-signup` widget renders only on the hostnames it lists. A listed domain covers its subdomains, so add `receptionistportal.com` to the widget's hostnames to cover every partner subdomain.

Invitations and every other email link go to the partner's subdomain, even after the partner connects its own domain, so invited people sign up there. A partner's own domain still serves sign-in. To let people sign up on it too, add it to the widget's hostnames once it goes live. A widget on Cloudflare's Free plan lists up to 10 hostnames, and an Enterprise widget up to 200.

### Check a partner's domain

Test the setup with a domain you control:

1. In the console of a partner on a paid tier, open **Branding & domain** and connect a subdomain of your test domain.
2. At your DNS provider, add the two records the page shows: the CNAME pointing at `host.receptionistportal.com`, and the TXT record at `_domain-verification.<your subdomain>` with the page's value.
3. Wait until the page shows the domain as active. The worker checks every minute during the domain's first hour. Without the TXT record, the domain stays pending even once Cloudflare serves it.
4. Open the domain over HTTPS. You should see the partner's sign-in page under the partner's brand.
5. Remove the domain on the same page, and confirm that the custom hostname leaves Cloudflare's **Custom Hostnames** list.

## On a self-hosted Compose server

Compose's Caddy serves HTTPS for the dashboard and every partner hostname itself, and gets each certificate the first time someone visits the hostname. `docker-compose.tls.yml` turns that on: it mounts `docker/caddy/Caddyfile.tls` and publishes port 443. Without it, Caddy serves plain HTTP from `docker/caddy/Caddyfile` and publishes no port 443, for local use or for a server behind another HTTPS proxy.

1. In `.env`, set `COMPOSE_FILE=docker-compose.yml:docker-compose.tls.yml`, `HTTP_BIND_ADDRESS=0.0.0.0` and `CADDY_ON_DEMAND_TLS=true`. Set `PARTNER_BASE_DOMAIN` too if partners get subdomains.
2. Point the dashboard's hostname at the server. For partner subdomains, also point a wildcard record for `*` under `PARTNER_BASE_DOMAIN` at it.
3. Open TCP ports 80 and 443, and UDP port 443.
4. Restart the stack with `docker compose --env-file .env up -d`.

Before it issues a certificate, Caddy asks `http://admin:3000/api/tls/ask?domain=<hostname>`. The route approves the host's own hostnames, partners' subdomains, and partners' own domains once the worker verified them, and answers every other hostname with a 404. When the database can't say, it answers 503 and Caddy asks again on the next connection. The proxy lets the route answer on Caddy's own address and during maintenance, so renewals keep working.

Partners point a CNAME record at `PARTNER_DOMAIN_CNAME_TARGET`, which defaults to the hostname in `APP_BASE_URL`, and add the TXT record the console shows. The worker marks a domain verified once every address it resolves to is one of the target's and the TXT record holds the domain's token. The TXT record keeps a partner from taking a hostname that reaches the server for another reason, such as a wildcard record under your own domain. Compose's Caddy healthcheck calls `/api/health/live` over plain HTTP, which `Caddyfile.tls` keeps answering on port 80 while it moves everything else to HTTPS.

When Turnstile is configured, list the partner base domain among the widget's hostnames, as on the cloud. Without `PARTNER_BASE_DOMAIN`, a partner's invitations link to its own domain, so list each partner's domain once it goes live. [Deploy with Docker Compose](../../mintlify/self-hosting/docker-compose.mdx#serve-https-from-caddy) has the self-hoster's version of these steps.

## Google Calendar and Instagram

Partners' domains need no redirect URIs of their own. Google and Meta keep sending callbacks to `GOOGLE_REDIRECT_URI` and `INSTAGRAM_REDIRECT_URI` on the host's domain. When a connection started on a partner's host, the host's domain sends the callback on to that host, where the person is signed in, and the connection finishes there. [Calendar and Instagram on a partner's host](../branding.md#calendar-and-instagram-on-a-partners-host) explains the handoff.
