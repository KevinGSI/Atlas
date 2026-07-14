# Atlas compliance evidence register

Status: **Draft — no certification or compliance claim authorized**

This is the editable operating register for the Atlas security and privacy program. An entry becomes complete only when the underlying document or test record exists, its owner reviews it, and the approval is retained. Adding an environment value alone is not evidence.

For a production launch that must support all four frameworks, use `COMPLIANCE_PROFILE=gdpr_hipaa`.

## Common security program

| Evidence | Deployment field | Owner | Evidence location | Approved version/date | Status |
|---|---|---|---|---|---|
| Information-security program owner | `SECURITY_PROGRAM_OWNER` | Unassigned | — | — | Missing |
| Organization-wide risk assessment | `RISK_ASSESSMENT_REVIEWED_AT` | Unassigned | — | — | Missing |
| Incident-response plan | `INCIDENT_RESPONSE_PLAN_VERSION` | Unassigned | `docs/INCIDENT_RESPONSE_AND_RECOVERY.md` is a technical starting point | — | Needs approval and exercise |
| Retention and secure-disposal policy | `DATA_RETENTION_POLICY_VERSION` | Unassigned | — | — | Missing |
| Backup restoration test | `BACKUP_RESTORE_TESTED_AT` | Unassigned | — | — | Not yet performed |
| Privileged-access review | `ACCESS_REVIEW_COMPLETED_AT` | Unassigned | — | — | Not yet performed |
| Subprocessor register | `SUBPROCESSOR_REGISTER_VERSION` | Unassigned | — | — | Missing |

## GDPR program

| Evidence | Deployment field | Owner | Evidence location | Approved version/date | Status |
|---|---|---|---|---|---|
| Privacy program owner | `PRIVACY_PROGRAM_OWNER` | Unassigned | — | — | Missing |
| Privacy notice | `PRIVACY_NOTICE_VERSION` | Unassigned | — | — | Requires counsel |
| Data-processing agreement | `DATA_PROCESSING_AGREEMENT_VERSION` | Unassigned | — | — | Requires counsel |
| Records of processing activities | `RECORDS_OF_PROCESSING_VERSION` | Unassigned | — | — | Missing |
| Data-subject-rights procedure and test | `DATA_SUBJECT_RIGHTS_PROCEDURE_VERSION` | Unassigned | — | — | Missing |
| International-transfer mechanism and assessment | `INTERNATIONAL_TRANSFER_MECHANISM` | Unassigned | — | — | Requires counsel |

The privacy review must also document controller/processor roles, lawful bases, data categories, recipients, retention, special-category data, DPIA decisions, breach escalation, data residency, and legal holds.

## HIPAA program

| Evidence | Deployment field | Owner | Evidence location | Approved version/date | Status |
|---|---|---|---|---|---|
| HIPAA security official | `HIPAA_SECURITY_OFFICIAL` | Unassigned | — | — | Missing |
| HIPAA security risk analysis | `HIPAA_RISK_ANALYSIS_REVIEWED_AT` | Unassigned | — | — | Missing |
| Business associate agreement | `HIPAA_BAA_TEMPLATE_VERSION` | Unassigned | — | — | Requires counsel |
| Subcontractor BAA register | `HIPAA_SUBCONTRACTOR_BAA_REGISTER_VERSION` | Unassigned | — | — | Missing |
| HIPAA breach procedure | `HIPAA_BREACH_PROCEDURE_VERSION` | Unassigned | — | — | Requires counsel and exercise |
| Workforce training record | `HIPAA_WORKFORCE_TRAINING_COMPLETED_AT` | Unassigned | — | — | Not yet performed |

Before ePHI is accepted, every infrastructure, storage, logging, support, AI, email, backup, monitoring, and integration provider that may handle ePHI must be evaluated for HIPAA eligibility and included in the BAA chain where required.

## Independent assurance

| Outcome | Required work | Current status |
|---|---|---|
| ISO/IEC 27001:2022 certification | Define the ISMS scope, operate the management system, complete internal audit and management review, correct findings, and engage an appropriate certification body | Not certified |
| SOC 2 report | Define the system description and Trust Services Criteria scope, operate controls for the examination period, retain samples, remediate exceptions, and engage a qualified CPA firm | No report |
| GDPR validation | Complete technical, privacy, contractual, transfer, and jurisdictional review with qualified counsel | Not verified |
| HIPAA business-associate readiness | Complete applicability analysis, risk analysis, policies, BAAs, safeguards, training, testing, and counsel review | Not verified |

## Approval rule

After an item is genuinely completed:

1. Store the source evidence in the controlled compliance repository.
2. Record its owner, location, approval, and review date in this register.
3. Set the matching deployment field to the approved version or date.
4. Run the compliance readiness check.
5. Retain the output with the release evidence.

No person may change a status to complete based only on planned work, a draft document, or an untested configuration.

