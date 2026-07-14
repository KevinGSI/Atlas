import { AtlasError } from './errors.js';

export const LEGAL_DOCUMENT_TYPES = Object.freeze([
  'discovery', 'discovery_request', 'discovery_response', 'motion', 'notice',
  'court_order', 'complaint', 'answer', 'brief', 'pleading', 'subpoena',
  'correspondence', 'contract', 'engagement_agreement', 'invoice', 'evidence',
  'transcript', 'affidavit', 'declaration', 'deposition', 'medical_record',
  'police_report', 'expert_report', 'settlement_document', 'other'
]);

const types=new Set(LEGAL_DOCUMENT_TYPES);
const text=(value,max)=>value===null||value===undefined?null:String(value).trim().slice(0,max)||null;

function strings(values,maxItems=50,maxLength=300){
  if(values===undefined||values===null)return [];
  if(!Array.isArray(values)||values.length>maxItems)throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Document catalog list is invalid',502);
  return values.map(value=>text(typeof value==='object'?value.name??value.title??value.label:value,maxLength)).filter(Boolean);
}

function dated(values){
  if(values===undefined||values===null)return [];
  if(!Array.isArray(values)||values.length>50)throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Document date catalog is invalid',502);
  return values.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Document date catalog entry is invalid',502);
    const label=text(item.label??item.title,200);const date=text(item.date??item.dateTime,80);
    if(!label||!date)return null;
    return {label,date,...(item.sourceLocation&&typeof item.sourceLocation==='object'&&!Array.isArray(item.sourceLocation)?{sourceLocation:item.sourceLocation}:{})};
  }).filter(Boolean);
}

export function normalizeDocumentAnalysis(value,{filename='document'}={}){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Document analysis is required',502);
  const documentType=text(value.documentType??value.type,80)?.toLowerCase().replace(/[\s-]+/g,'_');
  if(!types.has(documentType))throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Document classification is unsupported',502,{documentType});
  const summary=text(value.summary,6000);
  const confidence=Number(value.confidence);
  if(!summary||!Number.isFinite(confidence)||confidence<0||confidence>1)throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Document summary and classification confidence are required',502);
  const normalized={
    documentType,summary,confidence,
    suggestedTitle:text(value.suggestedTitle??value.title,240)??String(filename).slice(0,240),
    caseNumber:text(value.caseNumber,160),court:text(value.court,300),documentDate:text(value.documentDate,80),
    parties:strings(value.parties),attorneys:strings(value.attorneys),organizations:strings(value.organizations),
    keyDates:dated(value.keyDates),requiresAttorneyReview:value.requiresAttorneyReview!==false
  };
  if(JSON.stringify(normalized).length>20_000)throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Document catalog exceeds the safe size limit',502);
  return normalized;
}

