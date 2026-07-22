# Divorce digital portal — canonical Atlas integration

The Florida’s Law Office divorce webapp is an Atlas connected surface. It is not a second case-management system and it does not own a separate AI assistant, matter record, memory store, or action channel.

## Hub-and-spoke invariant

There is one maintained divorce-webapp hub and one opaque portal route for each client matter. Every route uses the same `flo_divorce_shared_v1` presentation and capability framework; no client-specific fork of the webapp is created. The route identifier is deliberately nonsecret and never authorizes access. Atlas accepts client operations only through an HttpOnly session whose stored digest, portal identifier, framework version, workspace, and parent matter agree. As a result, upgrading the shared portal framework upgrades the interaction available to every client while the canonical matter boundary keeps each client's data isolated.

## Canonical flow

1. A consented demo registration enters the Atlas firm workspace as a `prospective_client`, a canonical `divorce` matter, and a hashed `client_portal_session`. Atlas also issues one opaque `/portal/{portalId}/` route bound to that matter and the shared portal framework.
2. Every portal section is stored as a `divorce_intake_section` under that same matter. Saving creates normal object version history, canonical event coverage, and a durable intelligence job.
3. The portal’s Atlas conversation uses the configured provider-neutral `AtlasAssistant`. It stores encrypted requests, final answers, sources, provider/model provenance, and a matter event. Each completed exchange also creates a client-visible `divorce_conversation_intake` under the matter so the information is part of the case context rather than isolated chatbot memory. It disables firm-wide recall and exposes only client-visible records in the authenticated matter. The only optional external tool exposed to this client interface is confidentiality-screened public web research.
4. An uploaded court paper uses the existing Atlas file-security and document-intelligence path. The original is a canonical `uploaded_document`; completed classification and extracted case facts are projected into `divorce_document_facts` with source provenance and relationships to the matter and document.
5. A confidently identified petition for dissolution may create a client-visible `client_service_suggestion` for the approved response service. The suggestion carries a source-linked, verification-required summary of Florida Family Law Rule of Procedure 12.140(a)(1); Atlas does not calculate a binding deadline, purchase the service, or file anything.
6. When the client opens Services & Agreements, Atlas evaluates the current client-visible canonical context and asks the interchangeable AI provider to rank three to five services from the active attorney-approved catalog. It stores only the concise final recommendations, reasons, missing information, provenance, and context fingerprint—never private chain-of-thought. A changed intake or document version produces a new context fingerprint; an unchanged context reuses the existing recommendation.
7. An activated attorney-approved service creates a `client_service_order` and a linked `limited_scope_agreement`. Agreement text is loaded only from an active attorney-approved template. Atlas may replace only `clientName` and `agreementDate`; it may not generate or revise terms.
8. A signed agreement, verified payment, submitted answers, and service work remain under the same matter and are connected by explicit canonical relationships.
9. Verified payment creates an immutable canonical payment record and a service workflow task. It does not authorize Atlas to sign, send, file, publish, negotiate, or make a legal judgment. Those boundaries continue to apply through internal quality control and any separately authorized consequential action.
10. Smart Workspace projects those canonical orders and tasks back to the client. It derives approved-template questions from the client-visible matter, shows whether client information is blocking preparation, exposes the current production status and percentage, and distinguishes Atlas preparation from attorney completion or internal quality control. The client interface polls the authenticated projection; it does not invent progress in browser state.

## Firm and client isolation

- The website connection token is bound to one configured Atlas workspace and never enters browser code.
- A raw portal session token is never stored in Atlas. Atlas stores a keyed digest and fails closed on an invalid, expired, or cross-firm session.
- Client-facing context includes only that matter’s objects explicitly marked `clientVisible`. Firm-wide recall, other cases, internal notes, attorney work product, and other clients are excluded.
- Private records may not train shared models. Only separately approved, minimized, non-identifying aggregate product signals may cross the privacy firewall described in the Product Constitution.

## Runtime routes

All routes share the existing `ATLAS_PUBLIC_WEBSITE_CONNECTIONS` binding and live beneath:

`/v1/public/websites/:websiteId/divorce/`

The route family covers consented lead/session creation, canonical section saves, the restricted native Atlas assistant, secure client document upload/status, client service orders, locked agreement signature, provider checkout handoff, verified-payment activation, and service answers.

## Truthful status

The route implementation, canonical object graph, event coverage, intelligence queueing, firm isolation, portal-context restriction, and automated tests exist in this repository. A standalone `file://` demonstration is intentionally offline and does not transmit, persist, OCR, or analyze real client data. A live connection still requires HTTPS deployment, a configured public website connection, durable PostgreSQL and document storage, production malware scanning, a file-capable AI provider for OCR/document analysis, an active attorney-approved service catalog, and a real payment-session provider. Passing local tests is not proof those external systems are live.
