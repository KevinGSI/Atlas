# Atlas Form Bank

The Form Bank is the firm-scoped source library for reusable legal forms. It is part of Atlas's canonical digital twin, not a separate file share.

## What it does

- Accepts approved PDF, DOCX, and text forms through Atlas's existing secure file-upload boundary.
- Scans every upload before storage, records an integrity hash, and stores the bytes inside the uploading firm's storage namespace.
- Catalogs the form by document type, practice area, jurisdiction, description, and tags.
- Sends the form through the native document-intelligence pipeline for classification, summary, extraction, and retrieval indexing.
- Makes active forms searchable by the Atlas assistant and selectable when an attorney generates a case draft.
- Populates the case caption only from the selected case's canonical name, case number, court, jurisdiction, and judge.
- Records the source form and source version on every generated draft so the attorney can trace what Atlas used.
- Keeps every generated document unfiled and marked for attorney review.

## Security and firm isolation

Form Bank records use the same workspace authorization, malware scanning, storage integrity, audit, and event boundaries as other Atlas documents. A form belongs to one firm workspace. Supplying an object identifier from another workspace does not grant access to its metadata or bytes.

Atlas never exposes one firm's forms to another firm. For drafting, the configured interchangeable AI provider receives only bounded, authorized canonical case context and the analyzed text retrieved from the selected form in the active workspace. Provider selection, retention, and data-use terms must satisfy the firm's deployment policy. Archived forms remain part of the firm's audit history but are excluded from new drafting by default.

## Drafting workflow

1. An authorized user uploads a reusable form in **Documents → Form Bank**.
2. Atlas scans, stores, reads, classifies, summarizes, and indexes it.
3. The user selects a case and an active form, then supplies drafting instructions.
4. Atlas combines the selected form's authorized structure and provenance with the case's canonical caption fields.
5. Atlas creates an unfiled review draft; it never sends, signs, files, or publishes the document automatically.
6. The resulting draft stays related to both the case and the source form in the canonical twin.

## Operational boundary

PDF and DOCX drafting quality depends on successful document extraction. A newly uploaded form can be stored immediately while analysis remains pending. Atlas should show that state and must not imply that a form was used until its authorized content or extracted structure was actually available.
