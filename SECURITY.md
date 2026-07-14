# Atlas security policy

Do not disclose a suspected vulnerability in a public issue, discussion, pull request, or demonstration environment.

Use GitHub private vulnerability reporting for the `KevinGSI/Atlas` repository. Include the affected component, reproducible steps, impact, and any suggested mitigation. Do not access, copy, modify, or retain real firm or client information while investigating.

Atlas will acknowledge a complete private report, assess severity, preserve evidence, coordinate remediation, and disclose material incidents according to applicable legal and contractual duties. Response-time commitments will be published only after an operating security team and monitored reporting channel exist.

This policy is not a bug-bounty promise and does not authorize testing against production customers, denial of service, social engineering, credential attacks, physical facilities, third-party systems, or data belonging to another person or firm.

Uploaded and connected-mail files are untrusted until the configured file-security provider returns a clean verdict. Production must use the ClamAV adapter through a private connection and fails closed when the scanner is unavailable or returns an ambiguous response. Local basic signature checks are a development aid, not a production antivirus control. See `docs/FILE_SECURITY.md` for the acceptance boundary and remaining operational requirements.
