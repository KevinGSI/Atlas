import { createHash } from 'node:crypto';
import { AtlasError } from './errors.js';
import { createId } from './ids.js';

const BLOCKED_FILE_CODES=new Set(['FILE_MALWARE_DETECTED','FILE_SIGNATURE_MISMATCH','MAIL_ATTACHMENT_UNSAFE']);

export function isBlockedFileSecurityCode(code){return BLOCKED_FILE_CODES.has(code);}

export class FileSecurityIncidentService {
  constructor(repository,clock=()=>new Date().toISOString()){
    if(typeof repository?.transaction!=='function')throw new AtlasError('FILE_SECURITY_INCIDENT_CONFIGURATION_ERROR','Transactional security incident storage is required',500);
    this.repository=repository;this.clock=clock;
  }

  async record({workspaceId,actorId=null,filename,mediaType=null,sha256=null,error,source='file-upload',incidentKey=null}){
    if(!isBlockedFileSecurityCode(error?.code))throw new AtlasError('FILE_SECURITY_INCIDENT_INVALID','Only blocked file security verdicts may create an incident',500);
    const now=this.clock();const securityEventId=createId('sev');const jobId=createId('inj');const awarenessId=createId('awi');
    const malware=error.code==='FILE_MALWARE_DETECTED';
    const displayFilename=String(filename??'blocked file').replace(/[\\/\0\r\n\t]/g,'_').trim().slice(0,240)||'blocked file';
    const declaredMediaType=mediaType?String(mediaType).replace(/[\r\n\t]/g,'').slice(0,120):null;
    const signature=error.details?.signature?String(error.details.signature).replace(/[\r\n\t]/g,' ').slice(0,256):null;
    const reason=malware?'malware protection detected a threat':error.code==='FILE_SIGNATURE_MISMATCH'?'the file contents did not match the declared type':'the attachment did not meet the firm file-safety policy';
    const fingerprint=createHash('sha256').update(`${error.code}:${incidentKey??sha256??`${source}:${displayFilename}:${declaredMediaType??''}`}`).digest('hex');
    const details={filename:displayFilename,mediaType:declaredMediaType,sha256,reasonCode:error.code,source,scannerProvider:error.details?.provider??null,signature,fingerprint};
    return this.repository.transaction(async(repository)=>{
      const targetUserId=actorId&&actorId!=='system'?actorId:null;
      await repository.createSecurityEvent({id:securityEventId,userId:targetUserId,workspaceId,type:'file.upload_blocked',outcome:'blocked',ipAddress:null,userAgent:null,details,createdAt:now});
      if(!await repository.createAutomationMarker(workspaceId,`file-security:${fingerprint}`,now))return {securityEventId,duplicate:true};
      const job=await repository.createIntelligenceJob({id:jobId,workspaceId,triggerType:'file.security.blocked',objectId:null,eventId:null,status:'completed',attempts:0,payload:details,result:{blockedBeforeStorage:true,securityEventId},provider:error.details?.provider??'atlas-file-security',errorCode:error.code,availableAt:now,lockedAt:null,createdAt:now,completedAt:now});
      const awareness=await repository.createAwarenessItem({id:awarenessId,workspaceId,targetUserId,sourceJobId:job.id,sourceObjectId:null,category:'security_alert',priority:malware?'urgent':'high',headline:malware?'Atlas blocked a malicious file':'Atlas blocked a suspicious file',summary:`${displayFilename} was blocked before storage or cataloging because ${reason}.`,observationIds:[],actionProposalIds:[],createdAt:now});
      return {securityEventId,job,awareness,duplicate:false};
    });
  }
}
