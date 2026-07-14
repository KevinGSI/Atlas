# Atlas compliance assurance

Atlas treats security and privacy as system-wide requirements. They apply to the API, native intelligence, integrations, storage, workers, web application, and every future tool. A feature cannot opt out of firm isolation, authorization, auditability, encryption boundaries, retention, human approval, or incident controls.

## Honest status

The software contains security controls and a production evidence gate. That does **not** mean Atlas is presently ISO/IEC 27001 certified, has a SOC 2 report, is verified GDPR compliant, or is verified HIPAA compliant. Those statements require organizational operation, documented legal decisions, evidence over time, and—where applicable—independent assessment.

Atlas must not display a compliance badge or make a sales claim until the corresponding evidence has been independently validated.

Operational evidence is tracked in the editable [compliance evidence register](./COMPLIANCE_EVIDENCE_REGISTER.md). Run `pnpm check:compliance` to evaluate that register's corresponding production attestations independently from infrastructure readiness.

## Enforced production profiles

`NODE_ENV=production` activates the compliance evidence gate. `COMPLIANCE_PROFILE` selects one of:

- `security`: ISO/IEC 27001 and SOC 2-aligned security governance baseline.
- `gdpr`: security baseline plus privacy governance and GDPR evidence.
- `hipaa`: security baseline plus HIPAA business-associate safeguards and evidence.
- `gdpr_hipaa`: all requirements above.

Local development is not blocked by operational evidence. Production is blocked when required evidence is missing or stale. The gate logs only evidence field names and status, never the evidence contents or secrets.

## Common production evidence

- Named security program owner.
- Security risk assessment reviewed within the last year.
- Approved incident-response plan and retention/disposal policy.
- Successful backup restoration test within the last 100 days.
- Privileged-access review within the last 100 days.
- Current subprocessor register.

These attestations are deployment controls, not substitutes for source documents, tickets, approvals, test records, audit samples, or independent review.

## GDPR profile

The GDPR profile additionally requires a privacy owner, privacy notice, data-processing agreement, records of processing, tested data-subject-rights procedure, and documented international-transfer mechanism. Counsel must still determine roles, lawful bases, territorial applicability, retention, special-category processing, DPIA requirements, breach duties, and transfer legality.

Atlas's technical program must maintain privacy by design/default, data minimization, tenant isolation, security appropriate to risk, export/access capability, correction and deletion workflows subject to legal holds, processing records, incident evidence, and processor/subprocessor controls.

## HIPAA profile

The HIPAA profile additionally requires a designated security official, current HIPAA risk analysis, counsel-approved BAA, subcontractor BAA register, breach procedure, and current workforce training. Before Atlas stores ePHI, the organization must determine that Atlas is acting as a business associate, execute required BAAs, restrict subprocessors to HIPAA-eligible services, establish minimum-necessary access, validate backups and contingency procedures, and complete legal/security review.

HIPAA is not a product certification. The current HHS Security Rule requires administrative, physical, and technical safeguards, risk analysis and risk management, documented policies, access controls, audit controls, incident procedures, contingency planning, periodic evaluation, and business-associate arrangements.

## ISO/IEC 27001 and SOC 2

Atlas will use one integrated control system and evidence set for overlapping requirements, while keeping assurance outcomes distinct:

- ISO/IEC 27001:2022 requires an operating information security management system. Certification must come from an appropriate independent certification body if Atlas elects certification.
- SOC 2 is an examination of controls relevant to the AICPA Trust Services Criteria. A report must be issued through the proper CPA assurance process; Atlas cannot self-issue it.

The operating program still needs a scoped asset inventory, risk register and treatment plan, control ownership, policy approvals, vendor reviews, workforce training, access reviews, change evidence, vulnerability management, monitoring, incident exercises, continuity tests, internal review, management review, corrective actions, and retained audit evidence.

## Authoritative references

- [ISO/IEC 27001:2022 overview](https://www.iso.org/standard/27001)
- [AICPA System and Organization Controls resources](https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2)
- [EU General Data Protection Regulation](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- [HHS HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
- [HHS summary of the HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html)
