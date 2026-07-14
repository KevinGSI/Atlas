# Atlas Phase 1 launch candidate

Atlas `1.0.0-rc.1` is the code-complete Phase 1 launch candidate. “Code complete” means the agreed first-release workflows, safety boundaries, tenant isolation, persistence adapters, deployment definitions, and automated regression coverage exist in the tracked application. It does not mean a public production deployment or third-party certification has already occurred.

## Included product

- Subscribing law-firm onboarding with isolated firm membership, Account Info user administration, roles, invitations and cancellation, sessions, MFA, reversible access removal, and firm export
- Canonical cases, contacts (including clients), documents, email, calendar, tasks, communications, accounting, timelines, relationships, audit history, and matter health
- The native Atlas digital twin across the homepage, Workspace, `What do you need?`, case-task execution, event processing, situational awareness, firm search, and human review queues
- Provider-neutral AI orchestration with OpenAI as the initial configured adapter, cited firm retrieval, screened public research, immutable run history, and approval-gated work
- mandatory Microsoft 365 Outlook email/calendar connection, optional Gmail connection, Clio coexistence, a MyCase Open API boundary, and previewed CSV/JSON migration

Atlas must not be published to production until the deployment has a Microsoft Entra application, the exact production OAuth callback derived from `PUBLIC_BASE_URL` is registered, `MICROSOFT_365_CLIENT_ID` and `MICROSOFT_365_CLIENT_SECRET` are present, the organizational tenant is valid, and continuous synchronization is enabled. The production launch gate enforces those settings. Before opening access to customers, complete every live-tenant email and calendar acceptance check in `MICROSOFT_365_SETUP.md`; repository tests cannot substitute for that external validation.
- File storage, integrity verification, pre-storage type inspection, ClamAV scanning, automatic legal-document reading/classification/summarization, canonical catalog fields, encrypted document passages, semantic retrieval, and visible blocked-file alerts
- Firm-scoped Form Bank with secure reusable-form storage, search, metadata and lifecycle controls, native AI access, canonical case-caption population, source-form provenance, and unfiled attorney-review drafting
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
   Upload a fictional PDF in staging and confirm its Documents card changes from pending to a visible legal type and source-faithful summary while `atlas-intelligence-worker` is healthy.
6. Complete vendor setup for the specific mailbox, CMS, telephony, payment, and blockchain services enabled for the pilot.
7. Configure backups, restoration testing, monitored scanner updates, logs/alerts, retention, incident ownership, privacy terms, and customer agreements.
8. Use fictional or approved pilot data until legal, privacy, security, and professional-responsibility review authorizes real client information.

## Claims boundary

Atlas can be released to a controlled Phase 1 pilot after the external gates above pass. The software must not be described as SOC 2, ISO 27001, HIPAA, PCI DSS, penetration-tested, highly available, or disaster-recovery verified until independent evidence exists. Atlas does not autonomously send substantive communications, file or publish legal documents, move money, hold crypto keys, or accept CMS passwords.
