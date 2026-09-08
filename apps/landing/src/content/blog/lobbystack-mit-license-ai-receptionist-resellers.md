---
title: "LobbyStack Is Now MIT: Build and Sell Your Own"
seoTitle: "LobbyStack Is Now MIT: Build and Sell Your Own"
description: "LobbyStack now uses the MIT License, giving agencies room to modify, host, sublicense, and sell AI receptionist products built from our open-source code."
pubDate: 2026-09-04T10:00:00-04:00
author: "LobbyStack Team"
category: "Product updates"
featured: false
coverImage: "/illustrations/lobbystack-mit-license-ai-receptionist-resellers-hero.webp"
coverImageAlt: "A shared AI phone receptionist connected to four independently operated small business storefronts"
locale: "en"
canonicalSlug: "lobbystack-mit-license-ai-receptionist-resellers"
---

An agency can now take LobbyStack, adapt it for a market, deploy it for clients, and charge for the result under the MIT License. A product company can build its own commercial AI receptionist on the same code.

We made this change because LobbyStack has not reached the product or community adoption we expected. We want more businesses to benefit from the software, including businesses that buy it through agencies and resellers we may never meet.

## Why we changed the license

LobbyStack previously used the GNU Affero General Public License, version 3. The AGPL supports a reciprocal model for network software. It allows commercial use and sale. An operator who modifies the program and lets users interact with it over a network must offer those users the corresponding source under the AGPL terms.

That model serves many open-source projects. It also added a license review for agencies and product teams that wanted to build a commercial offer on LobbyStack. Some teams wanted to keep client-specific work private. Others needed sublicensing terms that fit their contracts. The questions arrived before they could evaluate the receptionist itself.

We had a similar issue with the original backend. Convex helped us move fast and continues to serve our paying customers well. We found that a less familiar stack combined with a copyleft license raised the cost of evaluating LobbyStack for client work.

Our product and contributor adoption stayed below our goal. We chose to reduce both sources of friction. LobbyStack is moving to a conventional Next.js, PostgreSQL, and Drizzle stack, and the repository now uses MIT.

## What the MIT License permits

The [LobbyStack license](https://github.com/lobbystack/lobbystack/blob/main/LICENSE) gives anyone who receives the software permission to use, copy, modify, merge, publish, distribute, sublicense, and sell it.

The license has one condition: copies or substantial portions of the software must include its copyright and permission notice. It also includes the standard MIT warranty and liability disclaimer.

For a commercial builder, that creates a wide field of use. You can change the interface, connect different providers, add niche workflows, run a hosted derivative, and decide how you charge customers. You can keep your application changes private under MIT while preserving the required notice in the software you distribute.

## Four ways to build a business with LobbyStack

LobbyStack already includes the product layer that sits around an AI voice model: calls, SMS, website chat, appointments, knowledge, transcripts, recordings, human handoff, usage, billing, and an operator dashboard. You can spend your time on the customer and market you know.

### Build a vertical AI receptionist

A team that serves dental clinics can add intake rules, scheduling logic, and integrations for that market. A home-services specialist can focus on service areas, quote requests, emergency routing, and dispatch. You can give each product its own brand and commercial model.

### Run managed client deployments

An agency can deploy LobbyStack in its own environment or in infrastructure controlled by the client. Charge for setup, provider configuration, prompt and knowledge design, integrations, monitoring, upgrades, and support.

The self-hosted stack uses tools that infrastructure teams know: Next.js, PostgreSQL, Drizzle, Redis, BullMQ, Fastify, and Docker Compose. Your team can bring its own Twilio, OpenAI-compatible AI, calendar, email, analytics, billing, and storage accounts.

### Sell integrations and workflow design

Clients rarely share the same booking, routing, or escalation rules. A clinic and a repair shop ask for different information and hand work to different systems. LobbyStack gives you the receptionist base, while your team sells the work that connects it to calendars, CRMs, dispatch software, and internal processes.

### Operate your own hosted product

The MIT License permits a company to run a separate hosted derivative and sell access under its own terms. LobbyStack does not include a one-click reseller portal, so your team still owns packaging, customer support, provider billing, security, and operations. The code supplies the receptionist product base, and your team supplies the commercial service around it.

## You can build your brand on the code

The MIT License covers LobbyStack's code and associated documentation. It does not grant unrestricted rights to the LobbyStack name, logos, or branding.

You can rebrand a product built from the code and sell it under your own name. Keep the required MIT notice with copies or substantial portions, and use your own brand for the commercial offer.

This separation helps customers understand who operates the service. Your company owns the deployment, support relationship, pricing, provider accounts, and promises it makes to clients. LobbyStack remains the name of our project and hosted service.

## The hosted product remains available

Open source gives agencies and technical teams control. Many businesses want someone else to run the infrastructure, monitor providers, ship updates, and support the product.

[LobbyStack Cloud](https://lobbystack.com/pricing/) remains the managed option for those customers. They can configure the receptionist, business knowledge, rules, phone numbers, and integrations without operating PostgreSQL, Redis, or the voice gateway.

Agencies can choose the model that fits each engagement. Use the MIT code when the client needs a branded product, custom infrastructure, or deep integration work. Use LobbyStack Cloud when the client wants the product managed and your value comes from setup, workflow design, and ongoing service.

## Build the offer your clients need

We chose the AGPL for a reciprocal model while we built the first version. We have chosen MIT to make commercial adoption easier and help more builders take LobbyStack into markets we cannot reach alone.

[Clone LobbyStack on GitHub](https://github.com/lobbystack/lobbystack), read the [self-hosting overview](https://docs.lobbystack.com/self-hosting/overview), and use the [Docker Compose guide](https://docs.lobbystack.com/self-hosting/docker-compose) for your first deployment. The companion article explains [why LobbyStack is moving away from Convex](/blog/why-lobbystack-is-moving-away-from-convex/).

If you would rather start with the managed product, [create a LobbyStack Cloud account](https://app.lobbystack.com/signup) and test a real call before you bring it to a client.
