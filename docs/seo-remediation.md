# LobbyStack SEO operating map

This document records the intent behind the July 2026 landing-site remediation.
It is the reference for future content additions, Search Console reviews, and
external profile updates.

## Query-to-page map

| Search intent | Canonical page |
| --- | --- |
| LobbyStack, Lobby Stack | `https://lobbystack.com/` |
| AI phone answering service | `/solutions/ai-phone-answering/` |
| AI appointment scheduler | `/solutions/ai-appointment-scheduler/` |
| AI receptionist for home services | `/solutions/ai-receptionist-for-home-services/` |
| AI receptionist for HVAC | `/solutions/ai-receptionist-for-hvac/` |
| AI receptionist for electricians | `/solutions/ai-receptionist-for-electricians/` |
| AI receptionist for salons and spas | `/solutions/ai-receptionist-for-salons-and-spas/` |
| AI vs virtual receptionist | `/blog/ai-receptionist-vs-virtual-receptionist/` |
| Open-source AI receptionist product | `/solutions/open-source-ai-receptionist/` |
| Open-source receptionist architecture | `/blog/open-source-ai-receptionist-stack/` |
| Best open-source phone-answering services | `/blog/best-open-source-ai-phone-answering-services/` |

The open-source pages intentionally serve different stages of intent. Product
copy should not turn the architecture guide into a sales landing page, and the
product page should not become a general roundup.

## Search Console baseline and review

The pre-release three-month baseline was 47 clicks, 4,960 impressions, 0.9%
CTR, and average position 55.2. Record the production release date and review
at 7, 30, 60, and 90 days:

- sitemap status, discovered URLs, and indexed landing pages;
- exact-brand `LobbyStack` impressions, clicks, position, and visible result;
- restored French URL coverage and hreflang selection;
- the zero-click phone-answering, HVAC, salon, electrician, home-service, and
  virtual-receptionist query groups;
- page-level CTR changes for the homepage and priority solutions.

Use separate URL-prefix properties for `https://lobbystack.com/` and
`https://docs.lobbystack.com/`. Mintlify JavaScript assets reported as crawled
but not indexed are expected and should not be blocked when they are required
to render documentation.

## Production rollout

After deployment:

1. Fetch `robots.txt`, the sitemap index, and both child sitemaps normally and
   with a Googlebot user agent. Require HTTP 200, XML content types for
   sitemaps, and no Cloudflare challenge.
2. Resubmit `sitemap-index.xml` and request indexing for the homepage, restored
   French pages, and the priority industry pages.
3. If Search Console still reports zero discovered URLs after 72 hours, submit
   the two child sitemaps directly and inspect Cloudflare security/request logs
   before changing the sitemap format.
4. Classify reported 403 URLs. Remove a challenge only when it affects public
   HTML or an asset required to render public content.

## Entity and authority checklist

Keep the product name, canonical homepage, logo, category, and description
consistent on GitHub, Capterra, SourceForge, AlternativeTo, SaaSHub, and other
verified profiles. The public schema may include a profile in `sameAs` only
after its URL and representation of LobbyStack have been verified.

Existing listings must be checked against current pricing and licensing before
they are promoted. In particular, the source repository is licensed
AGPL-3.0-only. Do not describe it as permissively licensed or imply unrestricted
white-label rights.

Request canonical links from existing editorial mentions that identify
LobbyStack but omit or misdirect the official website. Do not use paid links,
bulk directory submissions, or reciprocal-link schemes.
