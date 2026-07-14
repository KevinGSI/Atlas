# Atlas Phase 1 launch candidate

Atlas `1.0.0-rc.1` is the code-complete Phase 1 launch candidate. “Code complete” means the agreed first-release workflows, safety boundaries, tenant isolation, persistence adapters, deployment definitions, and automated regression coverage exist in the tracked application. It does not mean a public production deployment or third-party certification has already occurred.

## Included product

- Subscribing law-firm onboarding with isolated firm membership, roles, invitations, sessions, MFA, access deactivation, and firm export
- Canonical cases, clients, documents, email, calendar, tasks, communications, accounting, timelines, relationships, audit history, and matter health
- The native Atlas digital twin across the homepage, Workspace, `What do you need?`, event processing, situational awareness, firm search, and human review queues
- Provider-neutral AI orchestration with OpenAI as the initial configured adapter, cited firm retrieval, screened public research, immutable run history, and approval-gated work
- Gmail and Microsoft 365 mail/calendar connections, Clio coexistence, a MyCase Open API boundary, and previewed CSV/JSON migration
- File storage, integrity verification, pre-storage type inspection, ClamAV scanning, encrypted document passages, semantic retrieval, and visible blocked-file alerts
- Phone and text assistant workflows with signed Twilio boundaries, disclosure, opt-out handling, safe acknowledgment, drafts, and human send approval
- Canonical accounting, invoice-linked ACH/card checkout, external-payment reconciliation, non-custodial crypto verification, and provider-neutral banking/financing boundaries
- Docker, local PostgreSQL and ClamAV services, Render deployment definitions, ordered migrations, readiness, staging smoke tests, CodeQL, dependency auditing, and launch checks
- Multi-instance-safe PostgreSQL request limits for authentication, AI, file/import, write, and signed-webhook traffic

## Automated release gate

The repository release gate is:

```text
pnpm verify
```

It inventories required launch files, checks critical security and migration contracts, and runs the complete non-live test suite. The dedicated live checks are:

```text
pnpm test:postgres
pnpm test:ai
pnpm test:staging
```

These commands fail closed unless their real database, paid AI credential, or deployed staging URL is supplied. They are separate because the local code workspace must not pretend to operate infrastructure or spend money that is not present.

## Required before pilot traffic

1. Push the launch-candidate commit to the deployment branch and allow GitHub security and PostgreSQL workflows to pass.
2. Provision the hosted PostgreSQL database and private ClamAV service.
3. Configure Render with the launch secrets and vendor credentials; do not rely on GitHub Secrets being copied automatically.
4. Run the pre-deploy launch check and all 29 ordered migrations.
5. Run the OpenAI evaluation and the HTTPS staging smoke test.
6. Complete vendor setup for the specific mailbox, CMS, telephony, payment, and blockchain services enabled for the pilot.
7. Configure backups, restoration testing, monitored scanner updates, logs/alerts, retention, incident ownership, privacy terms, and customer agreements.
8. Use fictional or approved pilot data until legal, privacy, security, and professional-responsibility review authorizes real client information.

## Claims boundary

Atlas can be released to a controlled Phase 1 pilot after the external gates above pass. The software must not be described as SOC 2, ISO 27001, HIPAA, PCI DSS, penetration-tested, highly available, or disaster-recovery verified until independent evidence exists. Atlas does not autonomously send substantive communications, file or publish legal documents, move money, hold crypto keys, or accept CMS passwords.
