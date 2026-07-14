# Canonical contacts

Atlas presents the former Clients area as Contacts. A contact remains a canonical workspace object and carries one durable `state.contactType` identifier:

- `client`
- `adjuster`
- `opposing_counsel`
- `medical_provider`
- `opposing_party`
- `judicial_assistant`
- `doctor`
- `expert_witness`
- `lay_witness`
- `court_reporter`
- `other`

The contact's record kind remains separate from its legal relationship. Existing `client`, `person`, and `organization` dimensions remain valid, so this change requires no database migration. New and updated canonical contact objects are normalized at the service boundary, and legacy `type`, `role`, relationship, and case-pointer values remain readable.

A contact can be firm-wide or connected to a case through canonical ownership, a case pointer, or a graph relationship. Case Communications lists only contacts connected to the selected case within the current firm's workspace. It never accepts a browser-supplied email address or phone number as a substitute for the selected canonical contact.

For communication safeguards, detailed identifiers are mapped into the existing recipient-policy groups:

- `client` → client
- `opposing_counsel` → opposing counsel
- `judicial_assistant` → judicial assistant
- `expert_witness` → expert witness
- every other detailed identifier → other contact

Prepared calls, text drafts, email drafts, meeting drafts, and immutable communication events retain both the detailed `contactType` and the communication-policy `contactRole`. This preserves precise firm knowledge without weakening disclosure boundaries or human approval requirements.
