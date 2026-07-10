function normalize(value){return String(value??'').trim().toLowerCase().replace(/[^a-z0-9@]+/g,' ');}
function scoreText(expected,candidate){if(!expected||!candidate)return 0;const a=normalize(expected),b=normalize(candidate);if(a===b)return 1;if(a.includes(b)||b.includes(a))return .75;const words=new Set(a.split(' ').filter(Boolean));const other=new Set(b.split(' ').filter(Boolean));const overlap=[...words].filter((word)=>other.has(word)).length;return overlap/Math.max(words.size,other.size,1)*.6;}

export class AtlasResolver {
  constructor(repository){this.repository=repository;}
  async resolveMatter(workspaceId,signals={}){
    const matters=await this.repository.listObjects(workspaceId,{dimension:'matter'});
    return matters.map((matter)=>{const titleScore=scoreText(signals.title,matter.title);const referenceScore=scoreText(signals.reference,matter.state.caseNumber??matter.state.reference);const clientScore=scoreText(signals.client,matter.state.clientName);const score=Math.max(titleScore,referenceScore,clientScore);return {objectId:matter.id,score,signals:{title:titleScore,reference:referenceScore,client:clientScore}};}).filter((x)=>x.score>0).sort((a,b)=>b.score-a.score||a.objectId.localeCompare(b.objectId));
  }
  async resolveEntity(workspaceId,signals={}){
    const objects=await this.repository.listObjects(workspaceId,{});const entities=objects.filter((item)=>['person','organization','client'].includes(item.dimension));
    return entities.map((entity)=>{const nameScore=scoreText(signals.name,entity.title);const emailScore=scoreText(signals.email,entity.state.email);const score=Math.max(nameScore,emailScore);return {objectId:entity.id,score,signals:{name:nameScore,email:emailScore}};}).filter((x)=>x.score>0).sort((a,b)=>b.score-a.score||a.objectId.localeCompare(b.objectId));
  }
}
