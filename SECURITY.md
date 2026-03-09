# Security Policy

## Supported Deployments

- Cloud deployments are fully supported by default.
- Self-hosted deployments are supported through the documented install path only.
- Local development environments are not covered by formal support guarantees.

## Reporting

Report security issues privately to the maintainers before opening public issues.

Include:

- affected version or commit
- deployment profile
- reproduction steps
- expected impact

## Security Principles

- Verify inbound webhooks and OAuth callbacks.
- Keep secrets out of the browser bundle.
- Encrypt stored provider credentials and tokens.
- Redact sensitive data from logs and telemetry.
- Keep call recording off by default.
