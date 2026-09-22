# Find engineering documentation

This directory documents LobbyStack’s current architecture, operations, providers, and release checks. Customer-facing guides are in [`mintlify/`](../mintlify/README.md). The paths below group the engineering docs by topic:

- `architecture/`: Runtime boundaries and data flow
- `adr/`: Architecture decision records
- `knowledge/`: Knowledge ingestion and retrieval
- `telemetry/`: Event contracts, key performance indicators, and validation
- `voice/`: Voice gateway runtime behavior
- `providers/`: Provider configuration and operations
- `deployment/`: Hosting and deployment procedures
- `migrations/`: Development Convex import and the [blocked production-snapshot rehearsal boundary](migrations/production-rehearsal.md)
- `operations/`: Backup, restore, and alert runbooks; restore is separate from traffic rollback, and the [reliability rollout runbook](operations/remediation-rollout.md) covers role checks, OAuth compatibility, and retention gates
- `validation/`: Release certification, contract checks, the [production-readiness matrix](validation/production-readiness.md), the [current implementation validation report](validation/readiness-implementation-2026-09-12.md), and the [query-plan remediation report](validation/query-plan-remediation.md)
- `platform.md`: Local stack, service checks, deployment, and cutover summary
