# Atlas repository instructions

These instructions apply to every file and every task in this repository.

## Required reading before work

Before planning, changing, reviewing, or describing Atlas, read these files completely:

1. `docs/ATLAS_PRODUCT_CONSTITUTION.md`
2. `docs/NATIVE_INTELLIGENCE_CONSTITUTION.md`
3. `docs/UX_CONSTITUTION.md`
4. `docs/BUSINESS_MODEL.md`
5. `docs/PHASE_ONE_LAUNCH.md` when the task affects launch scope, deployment, or product claims

Do not substitute conversational memory for these tracked requirements. If a request appears to conflict with them, identify the conflict before implementation. The product constitution may be amended only through an explicit product decision; update the constitution, affected tests, and implementation together.

## Non-negotiable implementation rules

- Atlas is one continuously updated, firm-scoped digital twin. Chat is one interface, never a separate intelligence product.
- Every material domain write must use the canonical workspace object/relationship model, create durable canonical event coverage, and queue governed intelligence work where applicable.
- Every feature reads shared canonical context. Do not introduce page-only data stores, private feature memory, duplicated case records, or type-specific AI plumbing when the canonical context and capability registry can represent the work.
- All private reads and writes are authorized and scoped by `workspaceId`; user scope, ethical walls, and case restrictions must narrow access further when applicable. Never create cross-firm retrieval.
- New object types and relationships must become discoverable through shared search, graph context, events, metrics, Workspace, and Atlas intelligence without one-off chat commands.
- AI providers remain interchangeable adapters. Core domain modules may not import provider SDKs or depend on provider-specific response formats.
- Provider output is untrusted until Atlas validates it. Preserve source, location, confidence, provider, model, time, and decision provenance.
- Consequential actions remain proposals until an authorized human approves them. Atlas may not silently send, file, publish, delete, move money, contact a person, or establish a binding legal fact or deadline.
- Store auditable operational memory: requests, final answers, sources, tool activity, proposals, decisions, corrections, and outcomes. Do not request, expose, or store private model chain-of-thought.
- Public or licensed research must remain separated from private firm context. Never place confidential firm content into an external query.
- Cross-case reuse preserves the original record and immutable provenance. Reuse structure and approved language only; current-case facts must come from current-case sources.
- Shared Atlas improvements may not use raw or identifiable customer content. Follow the privacy firewall and permitted shared-learning rules in the product constitution.
- Firm configuration, prompts, templates, and learned preferences belong to that firm and may not mutate the shared core platform for other firms.
- Direct navigation and core legal workflows must remain usable when an AI provider is unavailable.

## Verification and truthfulness

- Add or update tests for every changed invariant and capability.
- Run the relevant focused tests and the complete non-live test suite before claiming completion.
- Treat live PostgreSQL, vendor OAuth, paid AI, mail, calendar, payments, telephony, licensed research, malware scanning, and deployment as unverified unless actually exercised in the appropriate environment.
- Never describe a mock, adapter contract, migration, or passing unit test as a live vendor integration.
- Preserve unrelated user changes in the working tree.
