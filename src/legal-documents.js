import { AtlasError, required } from './errors.js';
import { canonicalMatterId } from './canonical-context.js';
import { canonicalContactType, isContactObject } from './contacts.js';

export const LEGAL_DOCUMENT_TYPES = Object.freeze([
  'complaint',
  'answer',
  'motion',
  'notice',
  'discovery',
  'interrogatories',
  'requests_for_production',
  'requests_for_admission',
  'subpoena',
  'pleading',
  'correspondence',
  'agreement',
  'intake',
  'other'
]);

export const FORM_BANK_TEMPLATE_TYPE = 'form_bank_template';

const headings = Object.freeze({
  complaint: 'COMPLAINT',
  answer: 'ANSWER',
  motion: 'MOTION',
  notice: 'NOTICE',
  discovery: 'DISCOVERY REQUESTS',
  interrogatories: 'INTERROGATORIES',
  requests_for_production: 'REQUESTS FOR PRODUCTION',
  requests_for_admission: 'REQUESTS FOR ADMISSION',
  subpoena: 'SUBPOENA',
  pleading: 'PLEADING',
  correspondence: 'CORRESPONDENCE',
  agreement: 'AGREEMENT',
  intake: 'INTAKE FORM',
  other: 'LEGAL DOCUMENT'
});

const typeFamilies = Object.freeze({
  complaint: new Set(['complaint', 'pleading']),
  answer: new Set(['answer', 'pleading']),
  motion: new Set(['motion', 'motion_to_compel', 'pleading']),
  notice: new Set(['notice', 'pleading']),
  discovery: new Set(['discovery', 'discovery_request']),
  interrogatories: new Set(['interrogatories', 'discovery', 'discovery_request']),
  requests_for_production: new Set(['requests_for_production', 'request_for_production', 'discovery', 'discovery_request']),
  requests_for_admission: new Set(['requests_for_admission', 'request_for_admission', 'discovery', 'discovery_request']),
  subpoena: new Set(['subpoena', 'discovery', 'discovery_request']),
  pleading: new Set(['pleading', 'complaint', 'answer', 'motion', 'notice']),
  correspondence: new Set(['correspondence']),
  agreement: new Set(['agreement', 'contract', 'engagement_agreement']),
  intake: new Set(['intake']),
  other: new Set(['other'])
});

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalized(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function normalizedWords(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function documentType(args) {
  const value = normalized(required(args.documentType, 'documentType'));
  if (!LEGAL_DOCUMENT_TYPES.includes(value)) {
    throw new AtlasError('LEGAL_DOCUMENT_TYPE_UNSUPPORTED', 'That legal document template is not supported', 400, { supported: LEGAL_DOCUMENT_TYPES });
  }
  return value;
}

function compatibleType(requestedType, templateType) {
  return typeFamilies[requestedType]?.has(normalized(templateType)) ?? false;
}

function formDocumentType(template) {
  return template?.state?.formDocumentType ?? template?.state?.templateDocumentType ?? template?.state?.documentType ?? template?.state?.documentAnalysis?.documentType;
}

function analyzedActiveForm(template, { automatic = false } = {}) {
  const analysisStatus=template?.state?.documentAnalysis?.status;
  return template?.dimension === 'document' && template.type === FORM_BANK_TEMPLATE_TYPE &&
    !template.deletedAt && template.parentObjectId === null && !template.state?.matterId && template.state?.formBank === true &&
    template.state?.library === 'form_bank' && template.state?.scope === 'firm' &&
    template.state?.provenance?.kind === 'form_bank_upload' && template.state?.securityScan?.status === 'clean' &&
    clean(template.state?.storageRef).startsWith(`atlas-blob://${template.workspaceId}/`) &&
    template.state?.status === 'active' && template.state?.extractionStatus === 'completed' &&
    (automatic ? analysisStatus === 'cataloged' : ['cataloged','needs_review'].includes(analysisStatus));
}

function matterJurisdiction(matter) {
  return normalizedWords(matter.state?.courtJurisdiction ?? matter.state?.jurisdiction ?? '');
}

function templateScore(matter, template, requestedType) {
  const selectedType = normalized(formDocumentType(template));
  if (!compatibleType(requestedType, selectedType)) return -1;
  const requestedJurisdiction = matterJurisdiction(matter);
  const templateJurisdiction = normalizedWords(template.state?.jurisdiction);
  if (templateJurisdiction && requestedJurisdiction && templateJurisdiction !== requestedJurisdiction) return -1;
  let score = selectedType === requestedType ? 100 : 60;
  if (templateJurisdiction && requestedJurisdiction === templateJurisdiction) score += 30;
  else if (!templateJurisdiction) score += 5;
  const practiceArea = normalizedWords(template.state?.practiceArea);
  if (practiceArea && practiceArea === normalizedWords(matter.type)) score += 15;
  const searchable = normalizedWords(`${template.title} ${(template.state?.tags ?? []).join(' ')}`);
  const requestedWords = normalizedWords(requestedType).split(' ').filter(Boolean);
  score += requestedWords.filter((word) => searchable.includes(word)).length * 3;
  return score;
}

export function selectLegalFormTemplate(matter, templates, args = {}) {
  if (!matter || matter.dimension !== 'matter') throw new AtlasError('NOT_A_MATTER', 'The selected object is not a case', 400);
  const requestedType = documentType(args);
  if (!Array.isArray(templates)) throw new AtlasError('LEGAL_FORM_TEMPLATE_INVALID', 'Form Bank templates must be supplied as a collection', 500);
  const active = templates.filter((template)=>analyzedActiveForm(template,{automatic:!args.templateId}));
  if (args.templateId) {
    const explicit = active.find((item) => item.id === args.templateId);
    if (!explicit) {
      throw new AtlasError('LEGAL_FORM_TEMPLATE_NOT_AVAILABLE', 'The selected Form Bank template is not active, analyzed, and available to this firm', 409, { templateId: args.templateId });
    }
    const selectedType = formDocumentType(explicit);
    if (!compatibleType(requestedType, selectedType)) {
      throw new AtlasError('LEGAL_FORM_TEMPLATE_TYPE_MISMATCH', 'The selected Form Bank template does not match the requested legal document type', 409, { templateId: explicit.id, requestedType, templateType: selectedType ?? null });
    }
    return explicit;
  }
  return active.map((template) => ({ template, score: templateScore(matter, template, requestedType) }))
    .filter((item) => item.score >= 0)
    .sort((left, right) => right.score - left.score || String(right.template.updatedAt).localeCompare(String(left.template.updatedAt)) || left.template.id.localeCompare(right.template.id))[0]?.template ?? null;
}

export function authorizedTemplateText(chunks, templateId, contentCipher = { decrypt: (value) => value }) {
  if (!Array.isArray(chunks)) throw new AtlasError('LEGAL_FORM_TEMPLATE_CONTENT_INVALID', 'Form Bank source passages must be supplied as a collection', 500);
  if (!contentCipher || typeof contentCipher.decrypt !== 'function') throw new AtlasError('LEGAL_FORM_TEMPLATE_CONTENT_INVALID', 'Form Bank source decryption is unavailable', 500);
  const matching = chunks.filter((item) => item.sourceObjectId === templateId && typeof item.content === 'string');
  if (!matching.length) throw new AtlasError('LEGAL_FORM_TEMPLATE_CONTENT_UNAVAILABLE', 'The selected Form Bank template has not finished searchable text extraction', 409, { templateId });
  const groups = new Map();
  for (const item of matching) {
    const key = `${item.provider ?? ''}:${item.model ?? ''}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  const selected = [...groups.values()].sort((left, right) => {
    const leftOrdinals = new Set(left.map((item) => item.ordinal)).size;
    const rightOrdinals = new Set(right.map((item) => item.ordinal)).size;
    return rightOrdinals - leftOrdinals || String(right[0]?.createdAt ?? '').localeCompare(String(left[0]?.createdAt ?? ''));
  })[0].sort((left, right) => left.ordinal - right.ordinal || left.id.localeCompare(right.id));
  const passages = [];
  const seen = new Set();
  let characters = 0;
  for (const item of selected) {
    const text = clean(contentCipher.decrypt(item.content, `document-chunk:${item.id}:content`));
    if (!text || seen.has(text)) continue;
    characters += text.length;
    if (characters > 90_000) throw new AtlasError('LEGAL_FORM_TEMPLATE_CONTENT_TOO_LARGE', 'The selected Form Bank template is too large to use safely for drafting', 409, { templateId });
    seen.add(text);
    passages.push({ id: item.id, text, sourceLocation: item.sourceLocation ?? null });
  }
  if (!passages.length) throw new AtlasError('LEGAL_FORM_TEMPLATE_CONTENT_UNAVAILABLE', 'The selected Form Bank template contains no usable analyzed text', 409, { templateId });
  return {
    text: passages.map((item) => item.text).join('\n\n'),
    chunkIds: passages.map((item) => item.id),
    sourceLocations: passages.map((item) => item.sourceLocation),
    provider: selected[0]?.provider ?? null,
    model: selected[0]?.model ?? null
  };
}

function canonicalParties(matter, objects = []) {
  const state = matter.state ?? {};
  const parties = [];
  const seen = new Set();
  const attorneyNames = new Set(objects
    .filter((object) => object.type === 'attorney_profile')
    .flatMap((object) => [object.state?.name, String(object.title ?? '').replace(/^Attorney profile\s*[—-]\s*/i, '')])
    .map(normalizedWords).filter(Boolean));
  const add = (name, role = null, { authoritativeContact = false } = {}) => {
    const value = clean(name);
    if (!value) return;
    const normalizedRole = normalized(role);
    if (normalizedRole === 'client' && !authoritativeContact && attorneyNames.has(normalizedWords(value))) return;
    const key = `${normalizedRole}:${normalizedWords(value)}`;
    if (seen.has(key)) return;
    seen.add(key);
    parties.push({ name: value, role: normalizedRole || null });
  };

  const byId = new Map(objects.map((object) => [object.id, object]));
  for (const object of objects) {
    if (object.id === matter.id || !isContactObject(object) || canonicalMatterId(object, byId) !== matter.id) continue;
    add(object.title, canonicalContactType(object), { authoritativeContact: true });
  }
  if (Array.isArray(state.parties)) for (const party of state.parties) {
    if (typeof party === 'string') add(party);
    else if (party && typeof party === 'object') add(party.name ?? party.title, party.role ?? party.partyType);
  }
  for (const [field, role] of [['plaintiffName', 'plaintiff'], ['defendantName', 'defendant'], ['petitionerName', 'petitioner'], ['respondentName', 'respondent'], ['clientName', 'client'], ['opposingPartyName', 'opposing_party']]) add(state[field], role);
  return parties;
}

export function canonicalCaseData(matter, objects = []) {
  const parties = canonicalParties(matter, objects);
  const byRole = {};
  for (const party of parties) if (party.role && !byRole[party.role]) byRole[party.role] = party.name;
  return {
    matterId: matter.id,
    matterVersion: matter.version,
    matterTitle: clean(matter.title),
    caseNumber: clean(matter.state?.caseNumber),
    courtName: clean(matter.state?.courtName),
    courtJurisdiction: clean(matter.state?.courtJurisdiction),
    judgeName: clean(matter.state?.judgeName),
    parties,
    plaintiffName: byRole.plaintiff ?? null,
    defendantName: byRole.defendant ?? null,
    petitionerName: byRole.petitioner ?? null,
    respondentName: byRole.respondent ?? null,
    clientName: byRole.client ?? null,
    opposingPartyName: byRole.opposing_party ?? null
  };
}

const canonicalPlaceholderNames = Object.freeze({
  mattertitle: 'matterTitle', casename: 'matterTitle', casecaption: 'matterTitle',
  casenumber: 'caseNumber', docketnumber: 'caseNumber',
  court: 'courtName', courtname: 'courtName', jurisdiction: 'courtJurisdiction', courtjurisdiction: 'courtJurisdiction',
  judge: 'judgeName', judgename: 'judgeName', parties: 'parties',
  plaintiff: 'plaintiffName', plaintiffname: 'plaintiffName', defendant: 'defendantName', defendantname: 'defendantName',
  petitioner: 'petitionerName', petitionername: 'petitionerName', respondent: 'respondentName', respondentname: 'respondentName',
  client: 'clientName', clientname: 'clientName', opposingparty: 'opposingPartyName', opposingpartyname: 'opposingPartyName',
  body: 'body', content: 'body', draftbody: 'body'
});

function placeholderValue(canonical, body, rawName, missing) {
  const key = canonicalPlaceholderNames[normalized(rawName).replace(/_/g, '')];
  if (!key) return undefined;
  if (key === 'body') return body;
  if (key === 'parties') {
    if (!canonical.parties.length) { missing.add('parties'); return ''; }
    return canonical.parties.map((party) => party.role ? `${party.name} (${party.role.replace(/_/g, ' ')})` : party.name).join('; ');
  }
  const value = canonical[key];
  if (!value) missing.add(key);
  return value ?? '';
}

function applyTemplatePlaceholders(templateText, canonical, body) {
  const missing = new Set();
  let bodyInserted = false;
  const replace = (match, name) => {
    const value = placeholderValue(canonical, body, name, missing);
    if (value === undefined) return match;
    if (canonicalPlaceholderNames[normalized(name).replace(/_/g, '')] === 'body') bodyInserted = true;
    return value;
  };
  let rendered = templateText.replace(/\{\{\s*([a-z][a-z0-9_. -]*)\s*\}\}/gi, replace);
  rendered = rendered.replace(/\[\s*(CASE NAME|CASE CAPTION|CASE NUMBER|DOCKET NUMBER|COURT|COURT NAME|JURISDICTION|JUDGE|PARTIES|PLAINTIFF|DEFENDANT|PETITIONER|RESPONDENT|CLIENT|OPPOSING PARTY|BODY|CONTENT|DRAFT BODY)\s*\]/gi, replace);
  if (missing.size) throw new AtlasError('LEGAL_DOCUMENT_CONTEXT_INCOMPLETE', `The case is missing fields required by the selected form: ${[...missing].join(', ')}`, 409, { matterId: canonical.matterId, missing: [...missing] });
  return { rendered: clean(rendered), bodyInserted };
}

function trimSourceCaption(templateText, requestedType) {
  const lines = templateText.split(/\r?\n/);
  const heading = normalizedWords(headings[requestedType]);
  const index = lines.findIndex((line) => {
    const candidate = normalizedWords(line);
    return candidate === heading || candidate.startsWith(`${heading} `) || candidate.endsWith(` ${heading}`);
  });
  return index > 0 ? lines.slice(index).join('\n') : templateText;
}

export function buildLegalDocumentDraft(matter, args = {}, options = {}) {
  if (!matter || matter.dimension !== 'matter') {
    throw new AtlasError('NOT_A_MATTER', 'The selected object is not a case', 400);
  }

  const requestedType = documentType(args);
  const canonical = canonicalCaseData(matter, options.canonicalObjects ?? []);
  const missing = [
    ['matterTitle', canonical.matterTitle],
    ['caseNumber', canonical.caseNumber],
    ['courtName', canonical.courtName]
  ].filter(([, value]) => !value).map(([field]) => field);
  if (missing.length) {
    throw new AtlasError(
      'LEGAL_DOCUMENT_CONTEXT_INCOMPLETE',
      `The case is missing required caption information: ${missing.join(', ')}`,
      409,
      { matterId: matter.id, missing }
    );
  }

  const title = clean(args.title) || headings[requestedType];
  const body = clean(required(args.body, 'body'));
  if (!title || title.length > 240 || !body || body.length > 90_000) {
    throw new AtlasError('AI_TOOL_ARGUMENT_INVALID', 'Legal-document title or body is invalid or too large', 400);
  }

  const template = options.template ?? null;
  const source = clean(options.templateText);
  if (template && (!analyzedActiveForm(template) || !compatibleType(requestedType, formDocumentType(template)))) {
    throw new AtlasError('LEGAL_FORM_TEMPLATE_NOT_AVAILABLE', 'The selected Form Bank template is not active, analyzed, and compatible with this draft', 409, { templateId: template.id ?? null });
  }
  if (template && !source) throw new AtlasError('LEGAL_FORM_TEMPLATE_CONTENT_UNAVAILABLE', 'The selected Form Bank template contains no usable analyzed text', 409, { templateId: template.id });

  const caption = [
    'DRAFT FOR ATTORNEY REVIEW — NOT FILED',
    '',
    `IN THE ${canonical.courtName.toUpperCase()}`,
    canonical.courtJurisdiction,
    '',
    canonical.matterTitle,
    `Case No. ${canonical.caseNumber}`,
    canonical.judgeName ? `Before: ${canonical.judgeName}` : '',
    '',
    title.toUpperCase(),
    ''
  ];
  let draftedBody = body;
  if (template && options.renderTemplateText === true) {
    const structured = applyTemplatePlaceholders(trimSourceCaption(source, requestedType), canonical, body);
    draftedBody = structured.bodyInserted ? structured.rendered : `${structured.rendered}\n\n${body}`;
  }
  const content = [
    ...caption,
    draftedBody,
    '',
    'Respectfully submitted,',
    '[ATTORNEY SIGNATURE BLOCK REQUIRED]',
    '',
    '[CERTIFICATE OF SERVICE — COMPLETE IF REQUIRED]'
  ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n');

  if (content.length > 100_000) {
    throw new AtlasError('AI_TOOL_ARGUMENT_INVALID', 'The completed legal-document draft is too large', 400);
  }

  const templateProvenance = template ? {
    templateId: template.id,
    templateTitle: template.title,
    sourceVersion: template.version,
    formVersion: template.state?.formVersion ?? null,
    documentType: formDocumentType(template) ?? null,
    analysisStatus: template.state?.documentAnalysis?.status ?? null,
    analyzedAt: template.state?.documentAnalysis?.analyzedAt ?? null,
    sourceJobId: template.state?.documentAnalysis?.sourceJobId ?? null,
    sourceChunkIds: options.templateChunks?.chunkIds ?? [],
    sourceLocations: options.templateChunks?.sourceLocations ?? [],
    extractionProvider: options.templateChunks?.provider ?? null,
    extractionModel: options.templateChunks?.model ?? null
  } : null;

  return {
    title,
    documentType: requestedType,
    matterId: matter.id,
    content,
    templateData: canonical,
    templateProvenance,
    sourceMatterVersion: matter.version,
    reviewRequired: true,
    filed: false
  };
}
