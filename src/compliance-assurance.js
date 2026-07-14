const PROFILES = new Set(['security', 'gdpr', 'hipaa', 'gdpr_hipaa']);

const COMMON_EVIDENCE = Object.freeze([
  ['SECURITY_PROGRAM_OWNER', 'Named security program owner'],
  ['RISK_ASSESSMENT_REVIEWED_AT', 'Current organization-wide security risk assessment', 366],
  ['INCIDENT_RESPONSE_PLAN_VERSION', 'Approved incident-response plan'],
  ['DATA_RETENTION_POLICY_VERSION', 'Approved retention and disposal policy'],
  ['BACKUP_RESTORE_TESTED_AT', 'Recent backup restoration test', 100],
  ['ACCESS_REVIEW_COMPLETED_AT', 'Recent privileged-access review', 100],
  ['SUBPROCESSOR_REGISTER_VERSION', 'Approved subprocessor register']
]);

const GDPR_EVIDENCE = Object.freeze([
  ['PRIVACY_PROGRAM_OWNER', 'Named privacy program owner'],
  ['PRIVACY_NOTICE_VERSION', 'Approved privacy notice'],
  ['DATA_PROCESSING_AGREEMENT_VERSION', 'Approved data-processing agreement'],
  ['RECORDS_OF_PROCESSING_VERSION', 'Current records of processing activities'],
  ['DATA_SUBJECT_RIGHTS_PROCEDURE_VERSION', 'Tested data-subject-rights procedure'],
  ['INTERNATIONAL_TRANSFER_MECHANISM', 'Documented international-transfer mechanism']
]);

const HIPAA_EVIDENCE = Object.freeze([
  ['HIPAA_SECURITY_OFFICIAL', 'Designated HIPAA security official'],
  ['HIPAA_RISK_ANALYSIS_REVIEWED_AT', 'Current HIPAA security risk analysis', 366],
  ['HIPAA_BAA_TEMPLATE_VERSION', 'Counsel-approved business associate agreement'],
  ['HIPAA_SUBCONTRACTOR_BAA_REGISTER_VERSION', 'Current subcontractor BAA register'],
  ['HIPAA_BREACH_PROCEDURE_VERSION', 'Approved HIPAA breach procedure'],
  ['HIPAA_WORKFORCE_TRAINING_COMPLETED_AT', 'Current HIPAA workforce training', 366]
]);

function configured(value) {
  return typeof value === 'string' && value.trim().length > 0 && !/replace-with|example/i.test(value);
}

function recentDate(value, maximumAgeDays, now) {
  if (!configured(value)) return false;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date > now) return false;
  return now.getTime() - date.getTime() <= maximumAgeDays * 24 * 60 * 60 * 1000;
}

function assessEvidence(requirements, env, now) {
  return requirements.map(([key, name, maximumAgeDays]) => ({
    key,
    name,
    passed: maximumAgeDays ? recentDate(env[key], maximumAgeDays, now) : configured(env[key])
  }));
}

function framework(id, standard, status, externalAssurance) {
  return { id, standard, status, externalAssurance };
}

/**
 * Evaluates deployment evidence without treating self-attestation as certification.
 * The returned object is safe to log: it contains field names and status only.
 */
export function evaluateComplianceAssurance(env = process.env, { technicalReady = true, now = new Date() } = {}) {
  const production = env.NODE_ENV === 'production';
  const profile = env.COMPLIANCE_PROFILE || 'gdpr_hipaa';
  const profileValid = PROFILES.has(profile);
  const gdpr = profile === 'gdpr' || profile === 'gdpr_hipaa';
  const hipaa = profile === 'hipaa' || profile === 'gdpr_hipaa';
  const evidence = [
    ...assessEvidence(COMMON_EVIDENCE, env, now),
    ...(gdpr ? assessEvidence(GDPR_EVIDENCE, env, now) : []),
    ...(hipaa ? assessEvidence(HIPAA_EVIDENCE, env, now) : [])
  ];
  const missing = evidence.filter((item) => !item.passed).map((item) => item.key);
  if (!profileValid) missing.unshift('COMPLIANCE_PROFILE');

  const operationalEvidenceReady = profileValid && missing.length === 0;
  const enforced = production;
  const ready = !enforced || (technicalReady && operationalEvidenceReady);
  const candidateStatus = operationalEvidenceReady && technicalReady
    ? 'ready_for_independent_or_legal_validation'
    : 'controls_or_evidence_incomplete';

  return {
    enforced,
    profile,
    profileValid,
    ready,
    operationalEvidenceReady,
    evidence: evidence.map(({ key, name, passed }) => ({ key, name, passed })),
    missing: [...new Set(missing)],
    frameworks: [
      framework('iso_27001', 'ISO/IEC 27001:2022', candidateStatus, 'Accredited certification is not present or inferred.'),
      framework('soc_2', 'AICPA Trust Services Criteria', candidateStatus, 'A CPA-issued SOC 2 report is not present or inferred.'),
      framework('gdpr', 'Regulation (EU) 2016/679', gdpr ? candidateStatus : 'profile_not_enabled', 'Applicability and compliance require counsel and documented controller/processor decisions.'),
      framework('hipaa', '45 CFR Parts 160 and 164', hipaa ? candidateStatus : 'profile_not_enabled', 'HIPAA readiness requires applicability review, BAAs, risk analysis, and legal validation.')
    ],
    claims: {
      iso27001Certified: false,
      soc2ReportAvailable: false,
      gdprComplianceVerified: false,
      hipaaComplianceVerified: false
    }
  };
}
