import { AtlasError } from './errors.js';
import { createId } from './ids.js';
import { canonicalContextObjectIds } from './canonical-context.js';

export class CanonicalEventConsumerRegistry {
  #consumers=new Map();
  register(id,consumer){if(!id||typeof consumer?.handle!=='function')throw new AtlasError('CANONICAL_CONSUMER_INVALID','Canonical event consumer requires an id and handle function',500);if(this.#consumers.has(id))throw new AtlasError('CANONICAL_CONSUMER_DUPLICATE','Canonical event consumer is already registered',409,{id});this.#consumers.set(id,consumer);return this;}
  entries(){return [...this.#consumers.entries()];}
}

export class CanonicalEventDispatcher {
  constructor(repository,consumers,options={}){this.repository=repository;this.consumers=consumers;this.clock=options.clock??(()=>new Date().toISOString());this.maxAttempts=options.maxAttempts??3;}
  async dispatchPending(limit=100){let completed=0,failed=0;for(const [consumerId,consumer] of this.consumers.entries()){const events=await this.repository.listCanonicalEventsForConsumer(consumerId,limit,this.clock());for(const event of events){const delivery=await this.repository.claimCanonicalEventDelivery(event.id,consumerId,this.clock());if(!delivery)continue;try{await consumer.handle(event);await this.repository.completeCanonicalEventDelivery(event.id,consumerId,this.clock());completed+=1;}catch(error){await this.repository.failCanonicalEventDelivery(event.id,consumerId,error.code??'CANONICAL_CONSUMER_FAILED',this.maxAttempts,this.clock());failed+=1;}}}return {completed,failed};}
}

export class DigitalTwinImpactConsumer {
  constructor(repository,clock=()=>new Date().toISOString()){this.repository=repository;this.clock=clock;}
  async handle(event){return this.repository.transaction(async(repository)=>{const [relationships,objects]=await Promise.all([repository.listRelationships(event.workspaceId),repository.listObjects(event.workspaceId,{})]);const affected=new Set(event.affectedObjectIds);const impacted=new Set();for(const objectId of affected)for(const relatedId of canonicalContextObjectIds(objectId,objects,relationships))impacted.add(relatedId);let queued=0;for(const objectId of impacted){if(affected.has(objectId))continue;const marker=`canonical-impact:${event.id}:${objectId}`;if(!await repository.createAutomationMarker(event.workspaceId,marker,this.clock()))continue;const object=await repository.getObject(event.workspaceId,objectId);const now=this.clock();await repository.createIntelligenceJob({id:createId('inj'),workspaceId:event.workspaceId,triggerType:'graph.impact',objectId,eventId:event.id,status:'pending',attempts:0,payload:{causeEventId:event.id,correlationId:event.correlationId,sourceObjectIds:event.affectedObjectIds,contextObjectIds:[...impacted],object},result:null,provider:null,errorCode:null,availableAt:now,lockedAt:null,createdAt:now,completedAt:null});queued+=1;}return {queued};});}
}

export async function runCanonicalEventDispatcher(dispatcher,options={}){const signal=options.signal;const intervalMs=options.intervalMs??1000;const onCycle=options.onCycle??(()=>{});while(!signal?.aborted){onCycle(await dispatcher.dispatchPending(options.limit??100));if(signal?.aborted)break;await new Promise((resolve)=>{const timer=setTimeout(resolve,intervalMs);signal?.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});});}}
