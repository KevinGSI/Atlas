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
    return { observations, actionProposals };
  }
  async project(repository, job, provider, result) {
    const normalized = this.validate(result);
    const observations = await Promise.all(normalized.observations.map((item) => repository.createIntelligenceObservation({
      id:createId('ino'),workspaceId:job.workspaceId,jobId:job.id,sourceObjectId:job.objectId,kind:item.kind,data:item.data,
      confidence:item.confidence,sourceLocation:item.sourceLocation??null,provider,status:'candidate',reviewedBy:null,reviewedAt:null,createdAt:this.clock()
    })));
    const actionProposals = await Promise.all(normalized.actionProposals.map((item) => repository.createAiActionProposal({
      id:createId('aap'),workspaceId:job.workspaceId,runId:null,intelligenceJobId:job.id,originType:'intelligence',proposedBy:null,
      actionType:item.actionType,input:item.input,status:'pending',version:1,decidedBy:null,resultObjectId:null,createdAt:this.clock(),decidedAt:null
    })));
    return { observations, actionProposals };
  }
}
