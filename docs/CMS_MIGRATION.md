# CMS migration and transition

Atlas supports two transition paths that write into the same canonical firm model.

## Connected provider coexistence

An administrator authorizes a supported provider through OAuth. Atlas requests read-only access, stores credentials behind the encrypted credential vault, pulls incrementally, and preserves source identity and update provenance. Source deletion or archival creates a reconciliation tombstone; it does not delete the Atlas record. Firms can continue working in the former CMS during transition.

Production connection requires an approved developer application and credentials from the provider. The current adapters cover Clio Manage and a configurable MyCase Open API connection. Additional providers implement the same connector contract without changing the canonical object model.

## Downloaded export migration

The authenticated Migration workspace accepts CSV and JSON exports. Preview parses and classifies the selected files without changing firm data. Supported canonical datasets are:

- cases and matters
- contacts and clients
- events and calendar entries
- accounting records
- email
- tasks
- communications, calls, and messages

After a successful preview, import creates a canonical migration batch and normalized records. Child records are linked to a case when the export provides a matter or case identifier. Every record retains provider, external ID, source file, checksum, source update time, batch ID, and import time. Repeating a batch skips records already identified by provider, dataset kind, and external ID.

## Current limitations

- Uploaded files must be CSV or JSON and are limited to 10 MB per file and 18 MB per browser preview batch.
- ZIP extraction, document binaries, attachments, and provider-specific custom fields need additional adapters.
- Unknown filenames may require a future per-file mapping screen. Current detection recognizes common case, matter, contact, client, event, accounting, email, calendar, task, and communication names.
- A completed import can contain record-level errors; the migration batch retains up to 250 error summaries for review.
- Import does not alter the source CMS and does not automatically disconnect a connected provider.

Before a production migration, use a copied export, preview it, test in a non-production firm workspace, compare record counts, and retain the original provider backup.
