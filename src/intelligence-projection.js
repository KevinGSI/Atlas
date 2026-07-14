import { AtlasError } from './errors.js';
import { createId } from './ids.js';

const kinds = new Set(['classification','entity','matter_match','fact','deadline','duty','conflict','risk','recommendation']);
const actions = new Set(['create_task','create_document','draft_email']);

export class IntelligenceProjectionService {
  constructor(clock = () => new Date().toISOString()) { this.clock = clock; }
  validate(result) {
    if (!result || typeof result !== 'object') throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Intelligence result must be an object',502);
    const observations = result.observations ?? [];
    const actionProposals = result.actionProposals ?? [];
    if (!Array.isArray(observations) || !Array.isArray(actionProposals)) throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Intelligence result collections must be arrays',502);
    for (const item of observations) {
      if (!kinds.has(item.kind) || typeof item.data !== 'object' || typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 1) throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Intelligence observation is invalid',502);
    }
    for (const item of actionProposals) if (!actions.has(item.actionType) || typeof item.input !== 'object') throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Intelligence action proposal is invalid',502);
    const awareness=result.awareness??null;if(awareness&&(typeof awareness!=='object'||!['low','normal','high','urgent'].includes(awareness.priority??'normal')||typeof (awareness.headline??'')!=='string'||typeof (awareness.summary??'')!=='string'))throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Situational awareness result is invalid',502);
    const knowledgeEmbeddings=result.knowledgeEmbeddings??null;if(knowledgeEmbeddings){if(!Array.isArray(knowledgeEmbeddings.vectors)||knowledgeEmbeddings.vectors.length!==observations.length||!knowledgeEmbeddings.provider||!knowledgeEmbeddings.model||!Number.isInteger(knowledgeEmbeddings.dimensions)||knowledgeEmbeddings.dimensions<1||knowledgeEmbeddings.dimensions>3072||knowledgeEmbeddings.vectors.some(vector=>!Array.isArray(vector)||vector.length!==knowledgeEmbeddings.dimensions||vector.some(value=>!Number.isFinite(value))))throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Document knowledge embeddings are invalid',502);}
    return { observations, actionProposals, awareness, knowledgeEmbeddings };
  }
  async project(repository, job, provider, result) {
    const normalized = this.validate(result);
    const observations = await Promise.all(normalized.observations.map((item) => repository.createIntelligenceObservation({
      id:createId('ino'),workspaceId:job.workspaceId,jobId:job.id,sourceObjectId:job.objectId,kind:item.kind,data:item.data,
      confidence:item.confidence,sourceLocation:item.sourceLocation??null,provider,status:'candidate',reviewedBy:null,reviewedAt:null,createdAt:this.clock()
    })));
    if(normalized.knowledgeEmbeddings)await Promise.all(observations.map((observation,index)=>repository.createDocumentKnowledgeEmbedding({id:createId('dke'),workspaceId:job.workspaceId,observationId:observation.id,provider:normalized.knowledgeEmbeddings.provider,model:normalized.knowledgeEmbeddings.indexModel??normalized.knowledgeEmbeddings.model,dimensions:normalized.knowledgeEmbeddings.dimensions,embedding:normalized.knowledgeEmbeddings.vectors[index],createdAt:this.clock()})));
    const actionProposals = await Promise.all(normalized.actionProposals.map((item) => repository.createAiActionProposal({
      id:createId('aap'),workspaceId:job.workspaceId,runId:null,intelligenceJobId:job.id,originType:'intelligence',proposedBy:null,
      actionType:item.actionType,input:item.input,status:'pending',version:1,decidedBy:null,resultObjectId:null,createdAt:this.clock(),decidedAt:null
    })));
    const awarenessData=normalized.awareness;
    const awareness=awarenessData?await repository.createAwarenessItem({id:createId('awi'),workspaceId:job.workspaceId,targetUserId:awarenessData.targetUserId??null,sourceJobId:job.id,sourceObjectId:job.objectId,category:awarenessData.category??'firm_activity',priority:awarenessData.priority??'normal',headline:awarenessData.headline??'Atlas completed background work',summary:awarenessData.summary??`${observations.length} observation(s) and ${actionProposals.length} action(s) are ready.`,observationIds:observations.map((item)=>item.id),actionProposalIds:actionProposals.map((item)=>item.id),createdAt:this.clock()}):null;
    return { observations, actionProposals, awareness };
  }
}
