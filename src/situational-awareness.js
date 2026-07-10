import { createId } from './ids.js';

const category=(trigger)=>trigger==='email.received'?'incoming_email':trigger==='phone_call.received'?'phone_call':trigger==='attachment.received'?'document_upload':trigger==='deadline.missed'?'missed_deadline':trigger.startsWith('cms.')?'cms_activity':'firm_activity';

export class SituationalPlaybookEngine {
  apply(job,result){const output={...result,observations:[...(result.observations??[])],actionProposals:[...(result.actionProposals??[])]};
    const hasObservation=(kind)=>output.observations.some((item)=>item.kind===kind);
    const hasAction=(actionType)=>output.actionProposals.some((item)=>item.actionType===actionType);
    if(job.triggerType==='email.received'&&hasObservation('duty')&&!hasAction('draft_email')){
      const email=job.payload?.email??{};const state=email.state??{};
      output.actionProposals.push({actionType:'draft_email',input:{subject:`Re: ${email.title??'Response requested'}`,recipients:state.from?[state.from]:[],body:'Draft response for attorney review. Verify the requested position, supporting record, and deadline before sending.'}});
    }
    if(job.triggerType==='phone_call.received'&&hasObservation('duty')&&!hasAction('create_task')){
      output.actionProposals.push({actionType:'create_task',input:{title:'Review and complete requested call follow-up',matterId:job.payload?.call?.parentObjectId??null,dueDate:null,description:'Review the incoming call and complete the extracted callback or follow-up duty.'}});
    }
    if(job.triggerType==='attachment.received'&&hasObservation('deadline')&&!hasAction('create_task')){
      const deadline=output.observations.find((item)=>item.kind==='deadline')?.data??{};
      output.actionProposals.push({actionType:'create_task',input:{title:`Review deadline: ${deadline.title??job.payload?.document?.title??'uploaded document'}`,matterId:job.payload?.document?.parentObjectId??null,dueDate:deadline.date??null,description:'Verify the extracted deadline and prepare the required response for attorney review.'}});
    }
    if(job.triggerType==='deadline.missed'&&job.payload?.deadline?.state?.deadlineType==='discovery'){
      const deadline=job.payload.deadline;const matterId=deadline.parentObjectId??null;
      if(!hasAction('create_document'))output.actionProposals.push({actionType:'create_document',input:{title:`Motion to Compel — ${job.payload.matterTitle??'Matter'}`,documentType:'motion_to_compel',matterId,content:`DRAFT FOR ATTORNEY REVIEW\n\nDiscovery deadline missed: ${deadline.title}.\n\nIssues and supporting record citations must be verified before filing.`}});
      if(!hasAction('create_task'))output.actionProposals.push({actionType:'create_task',input:{title:`Review missed discovery deadline: ${deadline.title}`,matterId,dueDate:null,description:'Review discovery status and the automatically prepared motion-to-compel draft.'}});
      output.observations.push({kind:'risk',data:{title:'Discovery deadline missed',description:deadline.title,matterId},confidence:1,sourceLocation:{objectId:deadline.id}});
    }
    const material=new Set(['email.received','phone_call.received','attachment.received','deadline.missed']);
    if(output.awareness||material.has(job.triggerType)||output.observations.length||output.actionProposals.length)output.awareness=output.awareness??{category:category(job.triggerType),priority:job.triggerType==='deadline.missed'?'urgent':output.actionProposals.length?'high':'normal',headline:job.triggerType==='deadline.missed'?'Missed deadline requires review':`Atlas processed ${category(job.triggerType).replaceAll('_',' ')}`,summary:`${output.observations.length} observation(s) and ${output.actionProposals.length} proposed action(s) are ready for review.`,targetUserId:job.payload?.assignedTo??null};return output;
  }
}

export class SituationalSweepService {
  constructor(repository,clock=()=>new Date().toISOString()){this.repository=repository;this.clock=clock;}
  async run(){const now=this.clock();let queued=0;for(const workspace of await this.repository.listWorkspaces()){const objects=await this.repository.listObjects(workspace.id,{});const matters=new Map(objects.filter((item)=>item.dimension==='matter').map((item)=>[item.id,item]));for(const deadline of objects.filter((item)=>item.type==='deadline'&&item.state?.date&&item.state?.status!=='completed'&&new Date(item.state.date)<new Date(now))){const marker=`missed_deadline:${deadline.id}:${deadline.state.date}`;const created=await this.repository.transaction(async(repository)=>{if(!await repository.createAutomationMarker(workspace.id,marker,now))return false;await repository.createIntelligenceJob({id:createId('inj'),workspaceId:workspace.id,triggerType:'deadline.missed',objectId:deadline.id,eventId:null,status:'pending',attempts:0,payload:{deadline,matterTitle:matters.get(deadline.parentObjectId)?.title??null,assignedTo:deadline.state.assignedTo??null},result:null,provider:null,errorCode:null,availableAt:now,lockedAt:null,createdAt:now,completedAt:null});return true;});if(created)queued+=1;}}return {queued};}
}

export async function runSituationalSweepScheduler(service,options={}){const signal=options.signal;const intervalMs=options.intervalMs??60000;while(!signal?.aborted){if(options.leaseCoordinator)await options.leaseCoordinator.runExclusive(options.leaseName??'situational-sweep',()=>service.run());else await service.run();if(signal?.aborted)break;await new Promise((resolve)=>{const timer=setTimeout(resolve,intervalMs);signal?.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});});}}
