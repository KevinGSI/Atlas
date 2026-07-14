# Native Intelligence Correction — Verification Matrix

| Requirement | Implementation evidence | Verification evidence |
|---|---|---|
| Provider-interchangeable native layer | `src/intelligence.js`, `src/ai-providers.js`, `src/ingestion.js` registries and capability routing | `test/architecture.test.js`, `test/ai-providers.test.js`, `test/intelligence.test.js`, `test/ingestion.test.js` |
| Platform-wide event processing | Transactional enqueueing in `src/service.js` and ingestion enqueueing in `src/ingestion.js` | Non-chat object/update tests in `test/intelligence.test.js`; transaction regression tests in `test/service.test.js` |
| One canonical context across every surface | `src/canonical-context.js` resolves complete case ownership, nested records, explicit graph links, events, observations, proposals, and user-scoped Attorney Inbox awareness; `src/service.js`, `src/assistant.js`, and the browser consume that resolution | `test/canonical-context.test.js` proves complete joined context and idempotent connected reanalysis; nested health, priority, metric, HTTP, and browser assertions run in `test/service.test.js`, `test/assistant.test.js`, and `test/http.test.js` |
| Licensed legal research | Provider-neutral registry and OAuth client-credential adapter in `src/legal-research.js`; Westlaw and LexisNexis configuration remains server-side; normalized citations are saved as canonical case records and exposed through the native AI tool | `test/legal-research.test.js`, configuration tests, HTTP authorization tests, browser navigation and provider-state assertions |
| Email and attachment ingestion | `AtlasIngestionService`, connector registry, blob references, canonical objects, relationships, timeline, idempotency | `test/ingestion.test.js`; schema uniqueness in `0013_ingestion_records.sql` |
| PDF/OCR extraction boundary | `ContentExtractorRegistry` and `AttachmentExtractionProvider` | Replaceable blob/extractor test in `test/ingestion.test.js` |
| Automatic document understanding | `DocumentIntelligenceProvider` reads integrity-verified bytes; `normalizeDocumentAnalysis` enforces the legal catalog contract; `IntelligenceProjectionService` writes the type, summary, extracted catalog, event, and audit back to the canonical document | File-routing and canonical-projection tests in `test/intelligence.test.js`; automatic local-worker integration in `test/document-analysis-application.test.js`; visible Documents polling/card assertions in `test/http.test.js` |
| Entity and matter resolution | Workspace-scoped deterministic `AtlasResolver`; candidates supplied to providers | `test/resolution.test.js`; cross-workspace exclusion test |
| Digital-twin memory and provenance | Observation projection, source object/location, confidence, provider, job, canonical acceptance | `test/intelligence.test.js`, PostgreSQL provenance test, `0012_intelligence_observations.sql` |
| Review inbox and human control | Shared inbox, observation decisions, action decisions, draft-only boundaries | HTTP inbox test, observation review tests, assistant action tests |
| Platform consumption | Twin search and accepted knowledge in matter health | `test/service.test.js`, `test/architecture.test.js` |
| Chat consumption without ownership | `search_twin` calls the same `AtlasService.searchTwin`; conversations remain an interface history | Architecture test and assistant tool tests |
| Background execution | Local application worker for development, dedicated production worker, structured-model adapter, retry/failure lifecycle, PostgreSQL skip-locked claim, Render worker | Configuration and automatic document-worker tests, worker/routing tests, PostgreSQL queue test, deployment test |
| Graceful degradation | Direct services do not require an intelligence provider; jobs remain durable; assistant reports unavailable honestly | HTTP/service regression suite and `AI_NOT_CONFIGURED` test |

## Honest external boundary

The matrix verifies Atlas-owned contracts and behavior with deterministic adapters. It does not prove a live mailbox subscription, the quality of a live provider's PDF/OCR interpretation, production blob storage, model quality, live PostgreSQL concurrency, or managed deployment security. Those require selected external services and environment credentials and are explicitly excluded from the local verification claim. A staging acceptance upload must therefore confirm the selected model, worker, storage, and scanner together before customer documents are allowed.
# Secure document ingestion

Atlas-owned uploads are hashed and stored through the provider-neutral blob boundary before becoming canonical case documents. The server computes file identity, enforces media-type and size boundaries, queues `attachment.received` intelligence work, and verifies stored bytes against canonical checksum and size metadata before an authorized download.
