# Atlas Product Constitution

## Authority and purpose

This document is the highest-level product source of truth for Atlas. It consolidates the enduring objectives that govern architecture, user experience, intelligence, security, commercial design, and product claims. The more detailed Native Intelligence Constitution, UX Constitution, business model, and launch specification operate beneath it and may not contradict it.

Atlas exists to become the continuously aware digital twin and operating system of an authorized law firm. Atlas is one continuously updated, firm-scoped digital twin—not a collection of feature-specific applications or AI assistants. It combines legal practice management, firm knowledge, communications, documents, accounting, research, workflows, and proactive intelligence in one connected platform. It should reduce fragmented work, recognize situations without waiting for a prompt, prepare reviewable work, and help authorized professionals act with better context and less delay.

## Constitutional objectives

1. **One firm twin.** Each subscribing firm receives one private canonical workspace containing all authorized firm activity and knowledge.
2. **Native intelligence.** Intelligence is layered beneath the whole platform. `What do you need?`, Workspace, background event processing, search, and every feature use the same intelligence and memory; none owns a separate chatbot brain.
3. **Continuous awareness.** Material events—including emails, attachments, documents, calls, texts, calendar changes, case activity, tasks, deadlines, accounting activity, research, and user decisions—enter one durable event and intelligence pipeline.
4. **Proactive preparation.** Atlas detects duties, deadlines, risks, conflicts, missing work, and opportunities, then prepares safe reversible work for the Attorney Inbox and `While You Were Gone` without requiring a task log or prompt.
5. **Human legal control.** Attorneys remain accountable. Atlas prepares and proposes consequential work but cannot silently send, file, publish, contact, delete, bind, or move money.
6. **Provider interchangeability.** OpenAI may power the initial release, but the Atlas domain, memory, tools, safety, and workflows remain independent of any model or infrastructure vendor.
7. **Coexistence and transition.** Firms may connect or import authorized data from existing systems while continuing to use them. Atlas learns the firm through lawful APIs, exports, and OAuth—not customer passwords.
8. **Compounding firm value.** The private twin becomes more useful as authorized firm events, reviewed knowledge, corrections, templates, decisions, and outcomes accumulate.
9. **Verifiable claims.** Atlas distinguishes coded behavior, deterministic tests, live integrations, deployed infrastructure, certifications, and future plans. It never represents one as another.

## Canonical system invariant

Every durable firm record is represented once in the canonical workspace model or linked to it through explicit provenance. Cases, contacts, documents, communications, email, calendar events, tasks, deadlines, accounting, research, marketing, forms, AI work, approvals, and events are not separate product islands.

Every material mutation must:

- occur within an authorized firm boundary;
- preserve stable object identity and versioning;
- create canonical event coverage;
- identify directly and indirectly affected objects;
- preserve source and decision provenance;
- make the result available to shared retrieval and canonical context;
- enqueue governed reanalysis when the change can affect connected work.

New pages consume this system. They may not create their own truth, memory, relationship logic, AI prompt history, or action channel. A new record type should participate in search, graph expansion, context, metrics, event processing, Workspace, and native intelligence by satisfying the shared contracts—not by adding a new hard-coded command for each use.

## Knowledge, memory, and cross-case reuse

The firm twin may retrieve authorized knowledge across the entire firm unless permissions or ethical walls narrow access. A document remains owned by its original case or firm library, but its approved structure, clauses, checklist, and drafting pattern may support new work elsewhere.

Cross-case reuse must:

- leave the original source unchanged;
- create a new target-case work product;
- record source document, source case, source version, and reuse policy;
- prevent old names, facts, dates, amounts, allegations, strategy, or legal positions from becoming current-case facts without independent current-case support;
- preserve review status and attorney approval.

Atlas operational memory consists of encrypted requests, final answers, sources, tools, proposals, approvals, rejections, corrections, and outcomes. It does not include private model chain-of-thought. Firm memory improves retrieval and future action without pretending that a hosted foundation model was silently retrained.

## Firm isolation and shared Atlas learning

Private customer data is isolated by firm. No user, model request, retrieval index, connector, administrator workflow, or analytics query may expose one firm's confidential content to another firm.

Atlas may improve the shared product from permitted signals only through a separate privacy firewall. Raw or identifiable client data, case facts, document text, communications, attorney strategy, credentials, and privileged or work-product content may not enter shared training, cross-tenant retrieval, advertising, or resale.

Permitted shared improvement signals are limited to data that has been contractually authorized, minimized, and transformed so it cannot reasonably identify a firm, client, matter, person, or confidential substance. Examples may include aggregate reliability, latency, error category, capability selection, approval/rejection rate, correction category, and workflow completion measurements. Production use requires:

- a documented lawful basis and customer-facing terms;
- explicit controls for participation where required;
- removal of direct and indirect identifiers;
- minimum aggregation thresholds and re-identification testing;
- retention limits and deletion procedures;
- security and privacy review;
- human approval before a sanitized dataset changes a shared model, prompt, playbook, evaluation, or capability.

Shared Atlas learning improves provider routing, tool contracts, generic workflows, safety rules, evaluations, and non-confidential product behavior. It never gives another firm access to the source firm's memory.

## Performance and retrieval

Atlas must be designed for faster retrieval and action as the twin grows. Production architecture should use workspace-scoped indexes, semantic indexes, incremental projections, bounded context assembly, event-driven updates, cache invalidation tied to canonical events, and observable latency budgets. Performance optimizations may duplicate derived indexes or caches, but never create a competing source of truth. Every derived representation must be reproducible from canonical records and safely invalidated when those records change.

Growing data does not automatically make a model intelligent. Value compounds only when Atlas preserves quality, provenance, review decisions, outcome signals, and retrieval relevance. The system must measure those qualities rather than claim exponential learning without evidence.

## Product and tenant invariant

Atlas is one shared core platform delivered to many isolated law-firm tenants. A firm may configure its users, roles, templates, integrations, preferences, workflows, and approved intelligence behavior. Firm-specific configuration remains inside that firm and may not change the core behavior or data of another firm.

Client access, when implemented, is restricted to the client's expressly authorized case content and never implies access to firm-wide context.

## Safety, security, and professional responsibility

Authorization, least privilege, ethical walls, auditability, encryption, retention, source fidelity, confidence, review, and fail-closed behavior are platform responsibilities. AI output is never canonical merely because a model produced it. External providers receive only the minimum authorized data required for the capability.

Atlas may support compliance programs, but it may not claim certification or legal compliance without the required organizational controls and independent evidence.

## Amendment rule

Implementation convenience, a page redesign, a vendor limitation, or a conversational request does not silently amend this constitution. A material change requires an explicit product decision, an update to this document and its subordinate specifications, and corresponding regression tests.
