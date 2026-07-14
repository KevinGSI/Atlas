# Atlas Native Intelligence Constitution

## Product invariant

Atlas is a continuously updated digital twin of an authorized law-firm workspace. Chat is one interface to that twin. No intelligence capability may be owned exclusively by chat.

## Required flow

Every material platform event must be committed with a durable intelligence job. Provider-neutral analyzers consume jobs and return normalized observations. Atlas validates and projects those observations into canonical objects, facts, relationships, deadlines, risks, recommendations, and review items. Every interface reads the same projected state.

## Canonical-context invariant

Every case-owned record automatically participates in one canonical context. Ownership is resolved through the complete parent chain or an explicit `matterId`; it is never limited to a direct child. Explicit graph relationships expand that context to connected clients, people, organizations, and other authorized records. Events, intelligence observations, proposed actions, and the current attorney's review-inbox items are then joined to the same context.

New features must use this shared context and the capability registry. They must not introduce a private feature store, a page-only relationship rule, or a second AI memory model. Adding a new object type therefore makes it available to case views, priorities, health, metrics, event processing, Workspace, and `What do you need?` without adding type-specific AI plumbing. A new consequential action still requires a separately registered, validated capability and the existing human-approval boundary.

Material events propagate through the connected canonical context and enqueue idempotent reanalysis for affected records. This creates continuous situational awareness without equating unrelated firm data or bypassing firm isolation, ethical walls, authorization, provenance, or review policy.

## Ownership boundary

Atlas owns identity, authorization, ethical walls, canonical objects, graph relationships, firm memory, retrieval, prompts, tools, workflows, action policy, approvals, provenance, confidence, audit history, encryption, retention, and provider routing.

AI providers implement replaceable capability adapters. Core domain services must never import a provider SDK or provider-specific response type.

## Native surfaces

The shared intelligence layer serves home, cases, documents, email, calendar events, communications, people, organizations, accounting, marketing campaigns and aggregate public market signals, licensed legal research, deadlines, tasks, search, event feeds, health scoring, Attorney Inbox, Workspace, and `What do you need?`.

## Normalized intelligence output

Every analysis result must be expressible as validated observations containing:

- classification and document/communication type;
- candidate matter and entity matches;
- extracted facts, dates, deadlines, duties, conflicts, and risks;
- source object and source-location references;
- confidence and provider provenance;
- proposed reversible actions;
- proposed consequential actions requiring human approval.

Provider output is never canonical state until Atlas validates and projects it.

## Action boundary

AI may search, summarize, classify, extract, compare, draft, and propose. Sending, filing, publishing, deleting, changing canonical facts, contacting a person, creating a binding deadline, or causing another consequential external effect requires policy evaluation and explicit authorized approval.

## Graceful degradation

Core legal workflows and direct navigation must continue when no AI provider is configured or a provider is unavailable. Queued work remains inspectable and retryable.

## Verification gates

A release cannot claim native intelligence unless tests prove:

1. ordinary non-chat activity enters the shared intelligence pipeline;
2. workspace authorization is preserved through analysis and projection;
3. provider adapters are interchangeable;
4. claims and actions preserve sources, confidence, and provenance;
5. consequential actions cannot bypass review;
6. provider failure cannot corrupt canonical firm state;
7. chat consumes shared intelligence rather than maintaining a separate memory model.
8. nested case records and explicitly linked records resolve through the same canonical context;
9. material events requeue connected context exactly once per event and record;
10. Attorney Inbox awareness is user-scoped and visible to authorized AI context.
