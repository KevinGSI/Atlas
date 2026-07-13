import { createHash } from 'node:crypto';
import { AtlasError } from './errors.js';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,stable(value[key])]));
  return value;
}

function ordered(values) {
  return [...values].sort((a,b)=>String(a.createdAt??'').localeCompare(String(b.createdAt??''))||String(a.id??'').localeCompare(String(b.id??'')));
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export class FirmExportService {
  constructor(repository, clock=()=>new Date().toISOString()) { this.repository=repository;this.clock=clock; }

  async create(workspaceId,input={}) {
    if(input.confirmation!=='EXPORT FIRM DATA')throw new AtlasError('FIRM_EXPORT_CONFIRMATION_REQUIRED','Type EXPORT FIRM DATA to create a firm export',400);
    const workspace=await this.repository.getWorkspace(workspaceId);
    const memberships=ordered(await this.repository.listMemberships(workspaceId));
    const members=await Promise.all(memberships.map(async(membership)=>{
      const user=await this.repository.getUser(membership.userId);
      return {...membership,user:{id:user.id,name:user.name,email:user.email,createdAt:user.createdAt}};
    }));
    let subscription=null;
    try{subscription=await this.repository.getSubscription(workspaceId);}catch(error){if(error?.code!=='SUBSCRIPTION_NOT_FOUND')throw error;}
    const [objects,relationships,events,audits,securityPolicy,actions,observations]=await Promise.all([
      this.repository.listObjects(workspaceId,{includeDeleted:true}),this.repository.listRelationships(workspaceId),this.repository.listEvents(workspaceId),this.repository.listAudits(workspaceId),this.repository.getWorkspaceSecurityPolicy(workspaceId),this.repository.listAiActionProposals(workspaceId),this.repository.listIntelligenceObservations(workspaceId)
    ]);
    const data=stable({workspace,subscription,members,securityPolicy,objects:ordered(objects),relationships:ordered(relationships),events:ordered(events),audits:ordered(audits),intelligence:{observations:ordered(observations),actionProposals:ordered(actions)}});
    return {format:'atlas-firm-export',schemaVersion:1,generatedAt:this.clock(),manifest:{algorithm:'sha256',digest:digest(data),counts:{members:members.length,objects:objects.length,relationships:relationships.length,events:events.length,audits:audits.length,observations:observations.length,actionProposals:actions.length}},exclusions:['password hashes','session and refresh tokens','MFA secrets and recovery codes','password-reset tokens','OAuth and connector credentials','webhook signing secrets','AI encryption keys'],data};
  }
}
