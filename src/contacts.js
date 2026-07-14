export const CONTACT_TYPES=Object.freeze([
  'client',
  'adjuster',
  'opposing_counsel',
  'medical_provider',
  'opposing_party',
  'judicial_assistant',
  'doctor',
  'expert_witness',
  'lay_witness',
  'court_reporter',
  'other'
]);

export const CONTACT_TYPE_LABELS=Object.freeze({
  client:'Client',
  adjuster:'Adjuster',
  opposing_counsel:'Opposing counsel',
  medical_provider:'Medical provider',
  opposing_party:'Opposing party',
  judicial_assistant:'Judicial assistant',
  doctor:'Doctor',
  expert_witness:'Expert witness',
  lay_witness:'Lay witness',
  court_reporter:'Court reporter',
  other:'Other'
});

export const CONTACT_COMMUNICATION_GROUPS=Object.freeze({
  client:'client',
  adjuster:'other_contact',
  opposing_counsel:'opposing_counsel',
  medical_provider:'other_contact',
  opposing_party:'other_contact',
  judicial_assistant:'judicial_assistant',
  doctor:'other_contact',
  expert_witness:'expert_witness',
  lay_witness:'other_contact',
  court_reporter:'other_contact',
  other:'other_contact'
});

export const MATTER_CONTACT_POINTER_TYPES=Object.freeze({
  clientId:'client',clientIds:'client',client_id:'client',client_ids:'client',
  adjusterId:'adjuster',adjusterIds:'adjuster',adjuster_id:'adjuster',adjuster_ids:'adjuster',
  opposingCounselId:'opposing_counsel',opposingCounselIds:'opposing_counsel',opposing_counsel_id:'opposing_counsel',opposing_counsel_ids:'opposing_counsel',
  medicalProviderId:'medical_provider',medicalProviderIds:'medical_provider',medical_provider_id:'medical_provider',medical_provider_ids:'medical_provider',
  opposingPartyId:'opposing_party',opposingPartyIds:'opposing_party',opposing_party_id:'opposing_party',opposing_party_ids:'opposing_party',
  judicialAssistantId:'judicial_assistant',judicialAssistantIds:'judicial_assistant',judicial_assistant_id:'judicial_assistant',judicial_assistant_ids:'judicial_assistant',
  doctorId:'doctor',doctorIds:'doctor',doctor_id:'doctor',doctor_ids:'doctor',
  expertWitnessId:'expert_witness',expertWitnessIds:'expert_witness',expert_witness_id:'expert_witness',expert_witness_ids:'expert_witness',
  layWitnessId:'lay_witness',layWitnessIds:'lay_witness',lay_witness_id:'lay_witness',lay_witness_ids:'lay_witness',
  courtReporterId:'court_reporter',courtReporterIds:'court_reporter',court_reporter_id:'court_reporter',court_reporter_ids:'court_reporter',
  otherContactId:'other',otherContactIds:'other',other_contact_id:'other',other_contact_ids:'other',contactId:'other',contactIds:'other',contact_id:'other',contact_ids:'other'
});

const CONTACT_DIMENSIONS=new Set(['client','person','organization']);
const CONTACT_TYPE_SET=new Set(CONTACT_TYPES);

export function contactToken(value){return String(value??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}

const CONTACT_TYPE_ALIASES=new Map([
  ['client','client'],['clients','client'],['represented_client','client'],['represented_party','client'],['representation_client','client'],
  ['adjuster','adjuster'],['claims_adjuster','adjuster'],['claim_adjuster','adjuster'],['insurance_adjuster','adjuster'],
  ['opposing_counsel','opposing_counsel'],['opposition_counsel','opposing_counsel'],['adverse_counsel','opposing_counsel'],['defense_counsel','opposing_counsel'],['plaintiff_counsel','opposing_counsel'],['respondent_counsel','opposing_counsel'],['petitioner_counsel','opposing_counsel'],
  ['medical_provider','medical_provider'],['healthcare_provider','medical_provider'],['health_care_provider','medical_provider'],['medical_facility','medical_provider'],
  ['opposing_party','opposing_party'],['adverse_party','opposing_party'],
  ['judicial_assistant','judicial_assistant'],['judge_assistant','judicial_assistant'],['judges_assistant','judicial_assistant'],['chambers_assistant','judicial_assistant'],['court_coordinator','judicial_assistant'],['chambers_contact','judicial_assistant'],['judge','judicial_assistant'],['magistrate','judicial_assistant'],['court_contact','judicial_assistant'],['court_clerk','judicial_assistant'],
  ['doctor','doctor'],['physician','doctor'],['treating_physician','doctor'],['treating_doctor','doctor'],
  ['expert_witness','expert_witness'],['retained_expert','expert_witness'],['testifying_expert','expert_witness'],['consulting_expert','expert_witness'],['expert','expert_witness'],
  ['lay_witness','lay_witness'],['fact_witness','lay_witness'],['witness','lay_witness'],
  ['court_reporter','court_reporter'],['stenographer','court_reporter'],
  ['other','other'],['other_contact','other'],['contact','other'],['case_contact','other'],['party_contact','other']
]);

function recognizedContactType(value){
  const token=contactToken(value);
  if(!token)return null;
  if(CONTACT_TYPE_SET.has(token))return token;
  const direct=CONTACT_TYPE_ALIASES.get(token);if(direct)return direct;
  if(token.includes('opposing_counsel')||token.includes('adverse_counsel'))return 'opposing_counsel';
  if(token.includes('judicial_assistant'))return 'judicial_assistant';
  if(token.includes('expert_witness'))return 'expert_witness';
  return null;
}

export function normalizeContactType(value,{fallback='other'}={}){
  const recognized=recognizedContactType(value);
  if(recognized)return recognized;
  if(fallback===null)return null;
  return recognizedContactType(fallback)??'other';
}

export function normalizeContactState(state={},options={}){
  const source=state&&typeof state==='object'&&!Array.isArray(state)?state:{};
  const candidate=options.contactType??source.contactType??source.contactIdentifier??source.contactRole??source.role??source.partyRole??source.relationshipToMatter;
  return {...source,contactType:normalizeContactType(candidate,{fallback:options.fallback??'other'})};
}

function roleCandidates(object,relationships=[]){
  const state=object?.state??{};
  const candidates=[state.contactType,state.contactIdentifier,state.contactRole,state.role,state.partyRole,state.relationshipToMatter,...(Array.isArray(state.roles)?state.roles:[]),...(Array.isArray(state.contactRoles)?state.contactRoles:[]),object?.type];
  for(const relationship of relationships??[])candidates.push(relationship?.type,relationship?.attributes?.contactType,relationship?.attributes?.role,relationship?.attributes?.contactRole,...(Array.isArray(relationship?.attributes?.roles)?relationship.attributes.roles:[]));
  return candidates;
}

export function canonicalContactType(object,{pointerType=null,relationships=[]}={}){
  const pointer=recognizedContactType(pointerType);if(pointer)return pointer;
  for(const candidate of roleCandidates(object,relationships)){const type=recognizedContactType(candidate);if(type)return type;}
  if(object?.dimension==='client')return 'client';
  return 'other';
}

export function communicationContactGroup(value){
  const token=contactToken(value);
  if(['judge','magistrate','court_contact','court_clerk'].includes(token))return 'judicial_assistant';
  return CONTACT_COMMUNICATION_GROUPS[normalizeContactType(value)]??'other_contact';
}

export function communicationGroupForContact(object,{pointerType=null,relationships=[]}={}){
  const pointerGroup=pointerType?communicationContactGroup(pointerType):null;if(pointerGroup)return pointerGroup;
  const explicitType=recognizedContactType(object?.state?.contactType);if(explicitType)return communicationContactGroup(explicitType);
  for(const candidate of roleCandidates(object,relationships)){const group=communicationContactGroup(candidate);if(group!=='other_contact')return group;}
  return communicationContactGroup(canonicalContactType(object,{pointerType,relationships}));
}

export function isContactObject(object){return Boolean(object&&!object.deletedAt&&CONTACT_DIMENSIONS.has(object.dimension));}
