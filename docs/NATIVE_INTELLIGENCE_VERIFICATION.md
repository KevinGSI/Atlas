# Native Intelligence Correction — Verification Matrix

| Requirement | Implementation evidence | Verification evidence |
|---|---|---|
| Provider-interchangeable native layer | `src/intelligence.js`, `src/ai-providers.js`, `src/ingestion.js` registries and capability routing | `test/architecture.test.js`, `test/ai-providers.test.js`, `test/intelligence.test.js`, `test/ingestion.test.js` |
| Platform-wide event processing | Transactional enqueueing in `src/service.js` and ingestion enqueueing in `src/ingestion.js` | Non-chat object/update tests in `test/intelligence.test.js`; transaction regression tests in `test/service.test.js` |
| Email and attachment ingestion | `AtlasIngestionService`, connector registry, blob references, canonical objects, relationships, timeline, idempotency | `test/ingestion.test.js`; schema uniqueness in `0013_ingestion_records.sql` |
| PDF/OCR extraction boundary | `ContentExtractorRegistry` and `AttachmentExtractionProvider` | Replaceable blob/extractor test in `test/ingestion.test.js` |
| Entity and matter resolution | Workspace-scoped deterministic `AtlasResolver`; candidates supplied to providers | `test/resolution.test.js`; cross-workspace exclusion test |
| Digital-twin memory and provenance | Observation projection, source object/location, confidence, provider, job, canonical acceptance | `test/intelligence.test.js`, PostgreSQL provenance test, `0012_intelligence_observations.sql` |
| Review inbox and human control | Shared inbox, observation decisions, action decisions, draft-only boundaries | HTTP inbox test, observation review tests, assistant action tests |
| Platform consumption | Twin search and accepted knowledge in matter health | `test/service.test.js`, `test/architecture.test.js` |
| Chat consumption without ownership | `search_twin` calls the same `AtlasService.searchTwin`; conversations remain an interface history | Architecture test and assistant tool tests |
| Background execution | Worker loop, structured-model adapter, retry/failure lifecycle, PostgreSQL skip-locked claim, Render worker | Worker/routing tests, PostgreSQL queue test, deployment test |
| Graceful degradation | Direct services do not require an intelligence provider; jobs remain durable; assistant reports unavailable honestly | HTTP/service regression suite and `AI_NOT_CONFIGURED` test |

## Honest external boundary

The matrix verifies Atlas-owned contracts and behavior with deterministic adapters. It does not prove a live mailbox subscription, real PDF/OCR output, production blob storage, model quality, live PostgreSQL concurrency, or managed deployment security. Those require selected external services and environment credentials and are explicitly excluded from the local verification claim.
# Secure document ingestion

Atlas-owned uploads are hashed and stored through the provider-neutral blob boundary before becoming canonical case documents. The server computes file identity, enforces media-type and size boundaries, queues `attachment.received` intelligence work, and verifies stored bytes against canonical checksum and size metadata before an authorized download.
