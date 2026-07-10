# Atlas Core 0.20.0 — Native Intelligence Correction Status

## Corrected architecture verified in code

- Chat is one consumer of shared Atlas intelligence, not the owner of firm intelligence
- All material object, timeline, ingestion, and approved-action activity enters a durable native intelligence queue
- Provider-specific APIs are confined to composition/adapters; domain modules use normalized contracts
- Capability routing selects interchangeable analysis, extraction, OCR, or model-backed providers by event type
- A deployable background worker claims jobs safely, retries failures, records provenance, and shuts down gracefully
- Incoming email and attachments become canonical, matter-linkable objects with timeline and graph relationships
- Connector delivery is idempotent by workspace, connector, and external message identifier
- Attachment content is accessed through blob-storage and media-type extraction boundaries
- Provider output is validated before it can affect the digital twin
- Candidate classifications, entities, matter matches, facts, deadlines, duties, conflicts, risks, and recommendations preserve source, location, confidence, job, and provider provenance
- Candidate knowledge requires authorized acceptance or rejection
- Accepted knowledge becomes canonical objects or graph relationships shared by all platform surfaces
- Deterministic entity/matter candidate scoring remains workspace-scoped and Atlas-owned
- The unified review inbox combines candidate observations, proposed actions, and terminal processing failures
- Platform search and chat both query the shared twin
- Matter health consumes accepted twin deadlines, risks, and conflicts with explainable object links
- Consequential task/document/email actions retain human approval; email drafts remain unsent and documents remain unfiled
- Direct workflows continue when intelligence providers are absent or unavailable
- The native intelligence constitution and architecture regression tests make these invariants enforceable

## Verification completed here

- Full canonical Node test suite, architecture tests, and repository verifier
- Ordinary non-chat activity entering the shared pipeline
- Provider interchangeability, capability routing, structured-model adapter, and invalid-output rollback
- Worker draining, bounded retries, and terminal failure behavior
- Email/PDF metadata ingestion, idempotency, graph linkage, and atomic rollback
- Replaceable blob/extraction/OCR boundary behavior
- Workspace-isolated entity and matter resolution
- Candidate projection, review inbox aggregation, acceptance, rejection, canonicalization, and duplicate-review prevention
- Shared twin retrieval from chat and platform services
- Matter-health changes driven by accepted twin knowledge

## External capabilities not live-verified in this environment

- A real Microsoft 365, Gmail, IMAP, or court-notification mailbox connector
- Binary object storage and malware scanning
- A production PDF parser or OCR engine processing real files
- Live model-backed structured extraction
- Live PostgreSQL migrations, concurrent workers, and production-sized queue behavior
- Managed secrets/KMS, observability, backup recovery, penetration testing, and provider privacy certification

These are adapter and infrastructure verification boundaries, not hidden claims of completed third-party integration. Synthetic adapters prove the Atlas contracts and workflow behavior; production readiness requires connecting and testing selected services.

## Remaining product expansion, not architectural correction

- Additional connector implementations and provider adapters
- Document templates, citation checking, redlining, email delivery, filing, signatures, and calendar synchronization
- Ethical-wall policy administration, retention/legal-hold workflows, operational dashboards, and independent legal-quality evaluation

## Completion boundary

Version `0.20.0` completes the requested architectural correction: native provider-interchangeable intelligence now powers a common digital-twin pipeline across ingestion, extraction contracts, resolution, provenance, review, platform behavior, and chat. It does not claim that unavailable external services were executed live or that the broader Atlas product is finished.
