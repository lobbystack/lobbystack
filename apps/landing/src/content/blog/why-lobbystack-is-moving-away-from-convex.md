---
title: "Why LobbyStack Is Moving Away From Convex"
seoTitle: "Why LobbyStack Is Moving Away From Convex"
description: "LobbyStack is moving away from Convex to improve self-hosting and contribution with a familiar Next.js, PostgreSQL, Drizzle, and Redis stack for more teams."
pubDate: 2026-09-04T10:00:00-04:00
author: "LobbyStack Team"
category: "Product updates"
featured: false
coverImage: "/illustrations/why-lobbystack-is-moving-away-from-convex-hero.webp"
coverImageAlt: "Modular application services connected to a central PostgreSQL database and a realtime voice channel"
locale: "en"
canonicalSlug: "why-lobbystack-is-moving-away-from-convex"
---

Convex helped us turn LobbyStack from an idea into a working AI receptionist at a pace we could not have matched with a hand-built backend. It still powers the product used by our paying customers today, and it has served them well.

We are moving LobbyStack to a conventional TypeScript stack centered on Next.js, PostgreSQL, and Drizzle. The application code port is complete. The production data and traffic migration will happen after every import, reconciliation, storage, and rollback check passes.

We made this choice because LobbyStack needs broader product and contributor adoption. Convex gave us a reliable product, while LobbyStack grew more slowly than we expected.

## Convex helped us ship the first product

Our first job was to find out whether LobbyStack could answer real calls, understand a business, book appointments, send messages, and hand work back to a person when needed. Convex gave us a productive way to build that system.

It handled persistent data, business logic, workflows, authentication, scheduled jobs, and realtime updates. We could change a schema, add an operation, and see the result in the dashboard without assembling each backend layer first. That speed mattered while the product changed every week.

We kept the latency-sensitive voice path in a separate Fastify gateway. At the start of a call, the gateway loaded a snapshot of the business and its instructions. It returned to the backend for actions that needed authority, such as booking an appointment or saving the call result. That architecture has worked for live customers.

Convex gave us a strong first stage and continues to serve our customers reliably while we prepare the production migration.

## Our constraint changed from shipping to adoption

LobbyStack now needs more businesses using the product and more developers willing to run, inspect, and extend it. We have not seen the adoption we hoped for in either group.

The technical evaluation created friction for some of the people we wanted to reach. A contributor had to understand our product and add Convex to the systems they needed to learn. A self-hoster had to operate the LobbyStack services and a separate Convex backend. An agency considering a client deployment had to explain that architecture to its own team and customer.

Teams spent more time evaluating and learning the infrastructure before they could adopt the product.

We believe a familiar stack gives more teams a shorter path from opening the repository to running LobbyStack. It also gives agencies a larger pool of developers and operators who can maintain client deployments. That is a business advantage for an open-source product that depends on community use and commercial implementation.

## The new LobbyStack stack

The replacement keeps the parts of the architecture that already worked and makes the durable backend more familiar.

- **Next.js** serves the operator dashboard, authentication, and HTTP API.
- **PostgreSQL** stores durable business data with role-specific connections and row-level security.
- **Drizzle** defines the schema and explicit database migrations.
- **Redis and BullMQ** run queued work, rate limits, and realtime coordination.
- **Fastify** continues to handle the narrow Twilio and OpenAI Realtime voice path.

We moved business operations into shared domain modules used by the Next.js app and the worker. This keeps booking, billing, knowledge, messaging, and call behavior consistent across both runtimes.

We also added a transactional outbox. When LobbyStack changes business data and schedules a side effect, PostgreSQL commits both records in one transaction. The worker can retry delivery without losing the connection between the original action and the queued work.

Self-hosters now get a standard set of services: PostgreSQL, Redis, the Next.js app, a worker, the voice gateway, and file storage. Teams that need object storage can connect an S3-compatible provider. They can use familiar backup, migration, monitoring, and access-control tools throughout the stack.

## PostgreSQL makes important operations explicit

Managed platforms remove work during the early stages of a product. Open-source infrastructure has a different requirement. Operators need to see how data moves, how permissions work, and how they recover a system under their control.

PostgreSQL gives LobbyStack explicit schema migrations, backup and restore procedures, least-privilege roles, and forced row-level security. Drizzle keeps those definitions in the repository. Our validation tools can test tenant isolation and check that application roles cannot bypass the policies.

The same clarity helps during client reviews. An agency can explain where the data lives, which service can read it, and how the team will restore it. A contributor can inspect the schema without learning a platform-specific data model first.

These capabilities existed in different forms in the old stack. We now expose them through PostgreSQL and standard operational tooling. We believe this lets more teams apply experience they already have.

## The customer migration comes last

We have finished the application code port and removed Convex from the active replacement runtime. Paying-customer data and production traffic still run through the current Convex deployment.

We will keep it that way until the production migration passes its gates. The process requires a final immutable export, an idempotent import, complete record reconciliation, file checksums, a write freeze, and a rehearsed rollback. Existing password hashes need a controlled transition, provider webhooks need a traffic plan, and every required workflow must pass without calling the old backend.

We will keep Convex available through the rollback window after cutover. This release ships the replacement code. Production customer migration remains a separate, operator-controlled step that moves no traffic or data on its own.

We use these gates to protect customer calls, accounts, and data throughout the cutover.

## A platform more teams can build on

LobbyStack remains the same product: an AI receptionist for calls, messages, bookings, knowledge, and human handoff. The new backend gives more developers a familiar place to contribute and more agencies a stack they can operate for clients.

The license now supports that goal too. We changed LobbyStack from AGPL to MIT so commercial builders can adapt, sublicense, and sell products based on the code. Read [why LobbyStack is now MIT](/blog/lobbystack-mit-license-ai-receptionist-resellers/) for the business case and the permissions that come with the new license.

You can [inspect the platform on GitHub](https://github.com/lobbystack/lobbystack), follow the [self-hosting overview](https://docs.lobbystack.com/self-hosting/overview), or use the [Docker Compose guide](https://docs.lobbystack.com/self-hosting/docker-compose) to run it yourself.

If you want the receptionist without operating the infrastructure, [create a LobbyStack Cloud account](https://app.lobbystack.com/signup) and test it with your business.
