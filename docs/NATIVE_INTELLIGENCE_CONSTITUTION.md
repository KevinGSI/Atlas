# Atlas Native Intelligence Constitution

## Product invariant

Atlas is a continuously updated digital twin of an authorized law-firm workspace. Chat is one interface to that twin. No intelligence capability may be owned exclusively by chat.

## Required flow

Every material platform event must be committed with a durable intelligence job. Provider-neutral analyzers consume jobs and return normalized observations. Atlas validates and projects those observations into canonical objects, facts, relationships, deadlines, risks, recommendations, and review items. Every interface reads the same projected state.

## Ownership boundary

Atlas owns identity, authorization, ethical walls, canonical objects, graph relationships, firm memory, retrieval, prompts, tools, workflows, action policy, approvals, provenance, confidence, audit history, encryption, retention, and provider routing.

AI providers implement replaceable capability adapters. Core domain services must never import a provider SDK or provider-specific response type.

## Native surfaces

The shared intelligence layer serves home, matters, documents, evidence, communications, people, organizations, deadlines, tasks, search, activity feeds, health scoring, review inboxes, and chat.

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
