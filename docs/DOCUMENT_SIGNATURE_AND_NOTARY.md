# Document Signature and Virtual Notary

Atlas Documents includes two case-owned execution workflows: Docusign eSignature and Virtual Notary. Neither workflow permits Atlas or an attorney to apply another person's signature or perform a notarial act.

## Docusign workflow

1. Search stored Atlas PDF and DOCX documents or attorney-approved Atlas-created drafts by title, type, or case.
2. Select the document and identify the signer.
3. Atlas creates a **draft** Docusign envelope through the eSignature REST API.
4. The attorney opens Docusign to place fields, confirm recipients, and send the envelope.
5. Signers review, consent, authenticate as configured in Docusign, and apply their own signatures.
6. A Docusign Connect webhook is verified with HMAC before Atlas changes canonical state.
7. After completion, Atlas downloads the combined executed PDF, malware-scans it, verifies storage integrity, saves it into the original case, links it to the source document, and retains the envelope provenance.

Atlas treats duplicate completion webhooks idempotently and does not create duplicate executed documents.

An Atlas-created draft does not require a second manual upload. Atlas transmits its canonical draft text as the envelope document, while an uploaded PDF or DOCX is transmitted from private file storage. In both cases, the completed Docusign combined PDF returns to the source case and is linked to the original canonical document.

## Docusign configuration

Production requires a Docusign integration key and dedicated sender user with one-time impersonation consent. Store these values only in the server secret manager:

```text
DOCUSIGN_INTEGRATION_KEY
DOCUSIGN_WORKSPACE_ID
DOCUSIGN_USER_ID
DOCUSIGN_ACCOUNT_ID
DOCUSIGN_PRIVATE_KEY_BASE64
DOCUSIGN_AUTH_BASE_URL
DOCUSIGN_API_BASE_URL
DOCUSIGN_RETURN_URL
DOCUSIGN_CONNECT_HMAC_KEY
```

The private key is a base64-encoded PEM. `DOCUSIGN_RETURN_URL` and the API endpoints must use HTTPS. Configure Docusign Connect to post envelope events to:

```text
POST /v1/document-execution/docusign/{workspaceId}/webhook
```

and enable HMAC signing with the same secret held by Atlas.

`DOCUSIGN_WORKSPACE_ID` binds that external sender account to one Atlas firm. A provider connection must never be reused across unrelated firm workspaces. Additional firms require their own isolated Docusign connection through the provider registry.

## Virtual Notary workflow

Virtual notarization is implemented behind a provider-neutral remote-online-notary adapter. A connected adapter must create the secure session, perform required identity proofing, route the signer to a commissioned notary, preserve the applicable audiovisual record and electronic journal, and return the notarized document and completion certificate under the provider contract.

Atlas saves only the canonical request and completed case document. It does not determine whether a particular document, signer, notarial act, commissioned notary, or jurisdiction is legally eligible. The attorney and notary must verify the current law, venue-specific acceptance rules, commission, identity-proofing requirements, certificate wording, retention period, and interstate-recognition requirements before proceeding.

Docusign advertises Notary and Notary On-Demand, including identity proofing, audiovisual sessions, audit trails, electronic journals, and completion certificates. Access and exact API payloads depend on the firm's Docusign contract and enabled notary product, so Atlas does not simulate a connected notary provider when none has been provisioned.

## Canonical records

- `operation/signature_request` records the source document, provider envelope ID, recipients, launch state, and completed document link.
- `operation/notary_request` records the source document, jurisdiction, requested notarial act, signer, provider session ID, and completion link.
- Completed files are normal case-owned document objects and enter document intelligence like every other uploaded file.
- `execution_source`, `notarization_source`, and `executed_version_of` relationships keep the full chain visible to the digital twin.
