# Atlas file security boundary

Atlas treats every direct upload and connected-mail attachment as untrusted until it passes the file-security boundary. The boundary runs before bytes are written to durable document storage, before a canonical document is created, and before native intelligence receives a job.

## Acceptance sequence

1. Enforce the supported media-type and configured byte-size allowlists.
2. Decode and validate the complete base64 payload.
3. Compare the file bytes with the declared PDF, DOCX, text, CSV, JPEG, or PNG signature.
4. Stream the bytes to the configured malware scanner.
5. Accept only an explicit clean verdict.
6. Compute the SHA-256 digest and write to firm-isolated, content-addressed storage.
7. Persist the clean security verdict with the canonical document and queue native document intelligence.

A type mismatch, detected signature, scanner outage, timeout, or ambiguous scanner response prevents file acceptance. Atlas does not create a document or intelligence job for an unaccepted direct upload. Connected mail remains available when an individual attachment has an unsafe type, invalid signature, excessive size, or detected malware; the email records its imported and skipped counts. A scanner outage blocks the connected-mail synchronization batch so attachments are never silently accepted without inspection.

## Replaceable scanner contract

`BasicFileSecurityScanner` provides local-development signature verification and deterministic rejection of the standard antivirus test signature. It does not claim general malware coverage.

`ClamAvFileSecurityScanner` implements the same provider-neutral contract through ClamAV's `INSTREAM` protocol. It sends bytes over the private scanner connection without writing an unverified file to Atlas storage. Production configuration requires this scanner and refuses to start without a host:

```text
FILE_MALWARE_SCANNER=clamav
CLAMAV_HOST=<private scanner hostname>
CLAMAV_PORT=3310
CLAMAV_TIMEOUT_MS=30000
```

Atlas application readiness probes PostgreSQL first and then sends ClamAV's bounded `PING` command over the private scanner connection. `/ready` returns `503 FILE_SCANNER_UNAVAILABLE` unless the scanner responds with exactly `PONG`. `/live` remains a process-only liveness endpoint so an orchestrator can distinguish a running process from an instance that must not receive firm traffic.

The local Docker stack includes a ClamAV service. A hosted deployment must supply a private, reachable ClamAV service and maintain its engine and signature updates. Atlas does not claim daily rescanning, content disarm and reconstruction, operational alert response, or independent malware-control assurance until those systems and procedures are deployed and verified.
