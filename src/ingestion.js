import { AtlasError, required } from './errors.js';
import { createId } from './ids.js';

function emailAddress(value, field) {
  const text = required(value, field).trim().toLowerCase();
  if (!text.includes('@') || text.length > 320) throw new AtlasError('INGESTION_INVALID', `${field} must be a valid email address`, 400);
  return text;
}

function nonNegativeInteger(value, field) {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) throw new AtlasError('INGESTION_INVALID', `${field} must be a non-negative integer`, 400);
  return value ?? null;
}

function documentMetadata(input) {
  const storageRef=required(input.storageRef,'storageRef'); const sha256=required(input.sha256,'sha256'); const mediaType=required(input.mediaType,'mediaType');
  const size=nonNegativeInteger(input.size,'size'); if(size===null)throw new AtlasError('INGESTION_INVALID','size is required',400);
  return {storageRef,sha256,mediaType,size};
}

export class IngestionConnectorRegistry {
  #connectors = new Map();
  register(name, connector) {
    if (!name || typeof connector?.pull !== 'function' || typeof connector?.capabilities !== 'function') throw new AtlasError('INGESTION_CONNECTOR_INVALID','Ingestion connectors must implement pull and capabilities',500);
    if (this.#connectors.has(name)) throw new AtlasError('INGESTION_CONNECTOR_EXISTS','Ingestion connector is already registered',409,{connector:name});
    this.#connectors.set(name,connector); return this;
  }
  resolve(name) { const value=this.#connectors.get(name);if(!value)throw new AtlasError('INGESTION_CONNECTOR_NOT_FOUND','Ingestion connector is not registered',503,{connector:name});return value; }
}

export class ContentExtractorRegistry {
  #extractors = new Map();
  register(mediaType, extractor) {
    if (!mediaType || typeof extractor?.extract !== 'function' || typeof extractor?.capabilities !== 'function') throw new AtlasError('CONTENT_EXTRACTOR_INVALID','Content extractors must implement extract and capabilities',500);
    this.#extractors.set(mediaType,extractor); return this;
  }
  resolve(mediaType) { const value=this.#extractors.get(mediaType);if(!value)throw new AtlasError('CONTENT_EXTRACTOR_NOT_FOUND','No content extractor is registered for this media type',503,{mediaType});return value; }
}

export class AtlasIngestionService {
  constructor(repository, clock = () => new Date().toISOString()) { this.repository=repository;this.clock=clock; }
  async ingestEmail(workspaceId,input,actorId='system') {
    const connector=required(input.connector,'connector'); const externalId=required(input.externalId,'externalId');
    const sender=emailAddress(input.from,'from'); const recipients=(input.to??[]).map((value)=>emailAddress(value,'to'));
    if (!recipients.length) throw new AtlasError('INGESTION_INVALID','At least one recipient is required',400);
    const attachments=input.attachments??[];
    for(const item of attachments) if(!item.storageRef||!item.sha256||!item.mediaType||!Number.isInteger(item.size)||item.size<0) throw new AtlasError('INGESTION_INVALID','Attachments require storageRef, sha256, mediaType, and size',400);
    const now=this.clock();
    return this.repository.transaction(async(repository)=>{
      const existing=await repository.findIngestionRecord(workspaceId,connector,externalId);
      if(existing)return { ingestion:existing,duplicate:true,root:await repository.getObject(workspaceId,existing.rootObjectId),attachments:[] };
      if(input.matterId)await repository.getObject(workspaceId,input.matterId);
      const email={id:createId('obj'),workspaceId,parentObjectId:input.matterId??null,dimension:'operation',type:'incoming_email',title:input.subject?.trim()||'(no subject)',state:{from:sender,to:recipients,cc:input.cc??[],bodyText:input.bodyText??null,receivedAt:input.receivedAt??now,status:'received'},version:1,createdAt:now,updatedAt:now,deletedAt:null};
      await repository.createObject(email);
      const event={id:createId('evt'),workspaceId,parentObjectId:email.id,type:'communication.received',actorId,source:`connector:${connector}`,confidence:1,visibility:'workspace',relatedObjectIds:input.matterId?[input.matterId]:[],data:{externalId,attachmentCount:attachments.length},occurredAt:input.receivedAt??now,createdAt:now};
      await repository.createEvent(event);
      const documents=[];
      for(const item of attachments){
        const document={id:createId('obj'),workspaceId,parentObjectId:input.matterId??null,dimension:'document',type:'incoming_attachment',title:required(item.filename,'filename'),state:{storageRef:item.storageRef,sha256:item.sha256,mediaType:item.mediaType,size:item.size,extractionStatus:'pending'},version:1,createdAt:now,updatedAt:now,deletedAt:null};
        await repository.createObject(document); documents.push(document);
        await repository.createRelationship({id:createId('rel'),workspaceId,fromObjectId:email.id,toObjectId:document.id,type:'has_attachment',attributes:{},createdAt:now});
        await repository.createIntelligenceJob({id:createId('inj'),workspaceId,triggerType:'attachment.received',objectId:document.id,eventId:event.id,status:'pending',attempts:0,payload:{document,emailId:email.id,matterId:input.matterId??null},result:null,provider:null,errorCode:null,availableAt:now,lockedAt:null,createdAt:now,completedAt:null});
      }
      await repository.createIntelligenceJob({id:createId('inj'),workspaceId,triggerType:'email.received',objectId:email.id,eventId:event.id,status:'pending',attempts:0,payload:{email,attachmentIds:documents.map((x)=>x.id)},result:null,provider:null,errorCode:null,availableAt:now,lockedAt:null,createdAt:now,completedAt:null});
      const ingestion=await repository.createIngestionRecord({id:createId('ing'),workspaceId,connector,externalId,kind:'email',status:'cataloged',rootObjectId:email.id,metadata:{attachmentCount:documents.length},errorCode:null,receivedAt:input.receivedAt??now,createdAt:now});
      return {ingestion,duplicate:false,root:email,attachments:documents};
    });
  }

  async ingestPhoneCall(workspaceId,input,actorId='system') {
    const connector=required(input.connector,'connector'); const externalId=required(input.externalId,'externalId'); const direction=input.direction??'incoming';
    if(!['incoming','outgoing'].includes(direction))throw new AtlasError('INGESTION_INVALID','direction must be incoming or outgoing',400);
    const durationSeconds=nonNegativeInteger(input.durationSeconds,'durationSeconds'); const now=this.clock();
    return this.repository.transaction(async(repository)=>{
      const existing=await repository.findIngestionRecord(workspaceId,connector,externalId);
      if(existing)return {ingestion:existing,duplicate:true,root:await repository.getObject(workspaceId,existing.rootObjectId)};
      if(input.matterId)await repository.getObject(workspaceId,input.matterId);
      const call={id:createId('obj'),workspaceId,parentObjectId:input.matterId??null,dimension:'operation',type:'phone_call',title:input.title?.trim()||`${direction==='incoming'?'Incoming':'Outgoing'} call`,state:{direction,from:input.from??null,to:input.to??null,transcript:input.transcript??null,summary:input.summary??null,recordingRef:input.recordingRef??null,durationSeconds,occurredAt:input.occurredAt??now,status:'received'},version:1,createdAt:now,updatedAt:now,deletedAt:null};
      await repository.createObject(call);
      const event={id:createId('evt'),workspaceId,parentObjectId:call.id,type:'phone_call.received',actorId,source:`connector:${connector}`,confidence:1,visibility:'workspace',relatedObjectIds:input.matterId?[input.matterId]:[],data:{externalId,direction,durationSeconds},occurredAt:input.occurredAt??now,createdAt:now};
      await repository.createEvent(event);
      await repository.createIntelligenceJob({id:createId('inj'),workspaceId,triggerType:'phone_call.received',objectId:call.id,eventId:event.id,status:'pending',attempts:0,payload:{call,matterId:input.matterId??null},result:null,provider:null,errorCode:null,availableAt:now,lockedAt:null,createdAt:now,completedAt:null});
      const ingestion=await repository.createIngestionRecord({id:createId('ing'),workspaceId,connector,externalId,kind:'phone_call',status:'cataloged',rootObjectId:call.id,metadata:{direction,durationSeconds,hasTranscript:Boolean(input.transcript)},errorCode:null,receivedAt:input.occurredAt??now,createdAt:now});
      return {ingestion,duplicate:false,root:call};
    });
  }

  async ingestDocument(workspaceId,input,actorId='system') {
    const connector=required(input.connector,'connector'); const externalId=required(input.externalId,'externalId'); const file=documentMetadata(input); const now=this.clock();
    return this.repository.transaction(async(repository)=>{
      const existing=await repository.findIngestionRecord(workspaceId,connector,externalId);
      if(existing)return {ingestion:existing,duplicate:true,root:await repository.getObject(workspaceId,existing.rootObjectId)};
      if(input.matterId)await repository.getObject(workspaceId,input.matterId);
      const document={id:createId('obj'),workspaceId,parentObjectId:input.matterId??null,dimension:'document',type:'uploaded_document',title:required(input.filename,'filename'),state:{...file,documentType:input.documentType??null,uploadedAt:input.uploadedAt??now,extractionStatus:'pending'},version:1,createdAt:now,updatedAt:now,deletedAt:null};
      await repository.createObject(document);
      const event={id:createId('evt'),workspaceId,parentObjectId:document.id,type:'attachment.received',actorId,source:`connector:${connector}`,confidence:1,visibility:'workspace',relatedObjectIds:input.matterId?[input.matterId]:[],data:{externalId,filename:document.title,mediaType:file.mediaType},occurredAt:input.uploadedAt??now,createdAt:now};
      await repository.createEvent(event);
      await repository.createIntelligenceJob({id:createId('inj'),workspaceId,triggerType:'attachment.received',objectId:document.id,eventId:event.id,status:'pending',attempts:0,payload:{document,matterId:input.matterId??null},result:null,provider:null,errorCode:null,availableAt:now,lockedAt:null,createdAt:now,completedAt:null});
      const ingestion=await repository.createIngestionRecord({id:createId('ing'),workspaceId,connector,externalId,kind:'document',status:'cataloged',rootObjectId:document.id,metadata:{mediaType:file.mediaType,size:file.size},errorCode:null,receivedAt:input.uploadedAt??now,createdAt:now});
      return {ingestion,duplicate:false,root:document};
    });
  }
}

export class AttachmentExtractionProvider {
  constructor(blobStore, extractors) {
    if(typeof blobStore?.read!=='function')throw new AtlasError('BLOB_STORE_INVALID','Blob store must implement read',500);
    this.blobStore=blobStore;this.extractors=extractors;
  }
  capabilities(){return {triggers:['attachment.received'],contentExtraction:true};}
  async analyze({event,context}){
    const document=event.document;const extractor=this.extractors.resolve(document.state.mediaType);
    const content=await this.blobStore.read(document.state.storageRef);
    const extracted=await extractor.extract({content,mediaType:document.state.mediaType,filename:document.title,context});
    if(typeof extracted?.text!=='string')throw new AtlasError('CONTENT_EXTRACTION_INVALID','Extractor did not return text',502);
    return {observations:[
      {kind:'classification',data:{mediaType:document.state.mediaType,documentType:extracted.documentType??'unknown'},confidence:extracted.confidence??1,sourceLocation:null},
      {kind:'fact',data:{title:`Extracted text: ${document.title}`,description:extracted.text,matterId:event.matterId??null},confidence:extracted.confidence??1,sourceLocation:{attachmentId:document.id}}
    ],actionProposals:[]};
  }
}
