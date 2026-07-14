# Atlas trust, safety, compliance, and security matrix

This matrix compares Atlas with controls publicly described by Clio as of July 13, 2026. It distinguishes implemented software from operational assurance. Atlas must not advertise a certification, regulatory status, audit result, recovery capability, or contractual protection until the named independent or organizational work is complete.

| Control area | Clio public position | Atlas status | Required next assurance |
|---|---|---|---|
| Independent assurance | SOC 2 Type II, ISO 27001, recurring audits | Not certified | Engage an auditor, define the system boundary, operate controls for the audit period, remediate exceptions, and obtain reports |
| Encryption in transit | TLS/SSL | Deployment supports HTTPS; production origin must be HTTPS | Configure managed TLS, HSTS, certificate monitoring, and external TLS testing |
| Encryption at rest | Encrypted hosted data | AI content and integration credentials have application encryption; MFA secrets are encrypted; PostgreSQL volume encryption is a hosting control | Select managed encrypted storage, KMS/HSM custody, rotation, backup encryption, and key-access reviews |
| MFA | Authenticator MFA and emergency recovery codes | Implemented: TOTP, encrypted secrets, hashed single-use recovery codes, login enforcement, session revocation, and firm-wide enforcement policy | Security review, recovery support procedure, and rate and abuse testing |
| SSO | SAML SSO with verified domains | Not implemented | Add SAML/OIDC enterprise identity, domain verification, break-glass administrator, and configuration audit |
| Access control | Roles, permissions, user deactivation | Firm roles, workspace authorization, subscription isolation, invitations, reversible user deactivation, protected owners, and session revocation implemented | Add granular case ethical walls, periodic access certification, and least-privilege reviews |
| Login visibility | Firm administrators can inspect login and activity history | Implemented security-event and firm-session APIs, Settings interface, and explicitly configured proxy-aware client IP collection | Add retention policy, broader anomaly rules, SIEM export, and operating-team review procedures |
| Abuse and request controls | Layered controls and monitored service protection | Implemented PostgreSQL-backed limits for authentication, AI, file/import, write, and signed-webhook traffic; HMAC-only principals and stable retry responses | Calibrate through staging/load tests, connect monitoring and alert thresholds, document emergency overrides, and rehearse abuse response |
| Incident containment | Administrators can sign out users; security team response | Firm-wide emergency session revocation implemented | Staff incident-response training, on-call rotation, evidence preservation, notification decision tree, exercises |
| Secure SDLC | Code review, scanning, dependency monitoring | Tests, CodeQL workflow, dependency audit, Dependabot, protected action permissions | Enable branch protection, required reviews/checks, signed releases, SBOM, SAST triage SLAs, change approvals |
| Vulnerability management | Penetration tests, bug bounty/responsible disclosure | Private reporting policy and automated analysis added; no penetration test completed | Enable private reporting, appoint security contact, commission annual and major-release tests, track remediation |
| Malware protection | Daily malware scans publicly described | Implemented technical boundary: uploads and connected-mail files require signature verification and a clean scanner verdict before durable storage or intelligence; production requires the replaceable ClamAV adapter, fails closed, and creates append-only/deduplicated attorney alerts for blocked suspicious files | Operate private scanners with monitored engine/signature updates, add content disarm where appropriate, retained evidence, periodic rescanning, staffed alert response, and independent control testing |
| Backups and recovery | Geo-redundant backups and quarterly restoration tests | Database migrations and test isolation exist; no production backup claim | Managed point-in-time recovery, separate-region encrypted backups, quarterly restoration evidence, approved RPO/RTO |
| Availability and continuity | Disaster-recovery planning and testing | Health/readiness, graceful shutdown, Docker and deployment definitions exist | Multi-zone design, capacity/load tests, recovery runbooks, dependency failover, status page, continuity exercises |
| Data portability | Customer export and backup capabilities | Administrator-confirmed firm JSON export with canonical records, audit history, safe membership metadata, reviewed intelligence, explicit secret exclusions, and SHA-256 manifest is implemented | Add large-export object storage, one-time expiring download links, termination/deletion workflow, and independent restoration testing |
| Privacy governance | Privacy policy, DPA, subprocessors, GDPR/PIPEDA and regional commitments | Technical firm isolation and confidentiality controls exist; no completed legal program | Counsel-approved privacy notice, DPA, subprocessor register, records of processing, rights workflow, transfer assessment |
| HIPAA | HIPAA support and BAA offering for eligible services | Not claimed | Risk analysis, policies, BAA/subcontractor chain, audit controls, safeguards, breach procedure, legal review |
| PCI DSS | Compliant payment product | Atlas rejects raw card/CVV data and uses hosted/tokenized provider boundaries; not assessed | Select compliant processor, complete merchant/service-provider scope analysis and required validation |
| AI safety | Secure AI guidance, verified sources, human review | Provider-neutral AI, confidential web-search screening, source citations, immutable run ledger, human approval gates | External model/privacy terms, red-team program, evaluation monitoring, retention commitments, incident response |
| Data residency | Regional processing and disclosed subprocessors | Not implemented | Regional infrastructure, tenant placement, transfer controls, subprocessor inventory, contractual disclosure |
| Physical security | Managed data-center safeguards | Inherited from future cloud providers; not selected or attested here | Select audited providers and collect SOC/ISO reports and shared-responsibility evidence |

## Official Clio references

- [Clio security](https://www.clio.com/security/)
- [Clio security protocols and infrastructure](https://www.clio.com/wp-content/uploads/2024/04/Brochure-Guide-Security-Protocols-and-Infrastructure-Guide.pdf)
- [Clio administrator security settings](https://help.clio.com/hc/en-us/articles/9284653811739-User-Security-Settings-for-Administrators)
- [Clio multi-factor authentication](https://help.clio.com/hc/en-us/articles/9284706542619-Set-Up-Multi-Factor-Authentication)
- [Clio SAML single sign-on](https://help.clio.com/hc/en-us/articles/41135505613339-Single-Sign-On)
- [Clio responsible disclosure](https://www.clio.com/security/responsible-disclosure/)
- [Clio subprocessors](https://www.clio.com/tos/subprocessors/)
- [Clio terms and data-protection addendum](https://www.clio.com/tos/)
