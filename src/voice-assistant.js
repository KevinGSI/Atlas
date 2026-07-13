import { AtlasError, required } from './errors.js';

const allowedIntents=new Set(['emergency','urgent_handoff','human','new_client','schedule','billing','existing_client','message','faq','legal_advice','general']);

function clean(value,max=4000){return String(value??'').trim().slice(0,max);}
function phone(value){return clean(value,40).replace(/[^+\d]/g,'');}
function includesAny(text,words){return words.some(word=>text.includes(word));}
function defaultIntent(text){
  const value=text.toLowerCase();
  if(includesAny(value,['911','immediate danger','life threatening','suicide','kill me','kill myself']))return 'emergency';
  if(includesAny(value,['arrested now','police are here','court today','hearing today','urgent','emergency']))return 'urgent_handoff';
  if(includesAny(value,['legal advice','what should i do','will i win','how much is my case worth','should i plead']))return 'legal_advice';
  if(includesAny(value,['new client','new case','hire','consultation','potential client']))return 'new_client';
  if(includesAny(value,['appointment','schedule','calendar','consult']))return 'schedule';
  if(includesAny(value,['bill','invoice','payment','balance','retainer']))return 'billing';
  if(includesAny(value,['lawyer','attorney','paralegal','human','representative','transfer']))return 'human';
  if(includesAny(value,['existing client','my case','case status','update on my']))return 'existing_client';
  if(includesAny(value,['message','call me','callback','call back']))return 'message';
  return 'general';
}

function configurationState(input){
  const greeting=clean(input.greeting||'Thank you for calling. How may I help you today?',600);
  const disclosure=clean(input.disclosure||'I am Atlas, the firm’s automated virtual assistant. I can take information and help route your call, but I cannot give legal advice or form an attorney-client relationship.',900);
  const transferNumber=input.transferNumber?phone(input.transferNumber):null;
  if(input.transferNumber&&!transferNumber)throw new AtlasError('VOICE_CONFIGURATION_INVALID','transferNumber must be a valid telephone number',400);
  const faqs=Array.isArray(input.faqs)?input.faqs.slice(0,25).map(item=>({question:clean(item.question,240),answer:clean(item.answer,800),keywords:(item.keywords??[]).map(value=>clean(value,80).toLowerCase()).filter(Boolean).slice(0,12)})).filter(item=>item.answer&&item.keywords.length):[];
  return {enabled:input.enabled!==false,provider:clean(input.provider||'twilio',80),greeting,disclosure,transferNumber,timezone:clean(input.timezone||'America/New_York',80),businessHours:input.businessHours??null,faqs,recordingEnabled:input.recordingEnabled===true,recordingNotice:input.recordingEnabled?clean(input.recordingNotice||'This call may be recorded and transcribed according to the firm’s policy.',500):null,allowedActions:['answer','screen','intake','message','callback','appointment_request','approved_faq','urgent_transfer'],prohibitedActions:['legal_advice','engagement_acceptance','outcome_promise','confidential_case_disclosure','send','file','publish']};
}

export class VoiceAssistantService{
  constructor(atlasService,options={}){this.atlas=atlasService;this.intentProvider=options.intentProvider??null;this.clock=options.clock??(()=>new Date().toISOString());}
  async objects(workspaceId){return this.atlas.listObjects(workspaceId,{});}
  async configuration(workspaceId){return (await this.objects(workspaceId)).find(item=>item.dimension==='operation'&&item.type==='voice_assistant_configuration')??null;}
  async configure(workspaceId,input,actorId){const state=configurationState(input);const current=await this.configuration(workspaceId);if(!current)return this.atlas.createObject(workspaceId,{dimension:'operation',type:'voice_assistant_configuration',title:'Firm phone assistant',actorId,state:{scope:'firm',...state}});return this.atlas.updateObject(workspaceId,current.id,{version:current.version,state:{...current.state,...state}},actorId);}
  async status(workspaceId){const config=await this.configuration(workspaceId);const calls=(await this.objects(workspaceId)).filter(item=>item.type==='voice_call_session').sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));return {configured:Boolean(config),configuration:config,calls:calls.slice(0,50)};}
  async identifyCaller(workspaceId,caller){const normalized=phone(caller);if(!normalized)return null;return (await this.objects(workspaceId)).find(item=>['client','person'].includes(item.dimension)&&[item.state?.phone,...(item.state?.phones??[])].some(value=>phone(value)===normalized))??null;}
  async findCall(workspaceId,externalCallId){return (await this.objects(workspaceId)).find(item=>item.type==='voice_call_session'&&item.state?.externalCallId===externalCallId)??null;}
  async startCall(workspaceId,input,actorId='telephony:inbound'){
    const externalCallId=required(clean(input.externalCallId,180),'externalCallId');const existing=await this.findCall(workspaceId,externalCallId);if(existing)return {call:existing,...this.gather(existing.state.lastPrompt||'How may I help you?'),duplicate:true};
    const config=await this.configuration(workspaceId);if(!config?.state?.enabled)throw new AtlasError('VOICE_ASSISTANT_NOT_CONFIGURED','The firm phone assistant is not enabled',503);
    const known=await this.identifyCaller(workspaceId,input.from);const now=this.clock();const transcript=[];const opening=[config.state.disclosure,config.state.recordingEnabled?config.state.recordingNotice:null,config.state.greeting].filter(Boolean).join(' ');
    const call=await this.atlas.createObject(workspaceId,{dimension:'operation',type:'voice_call_session',title:`Incoming call · ${phone(input.from)||'unknown caller'}`,actorId,state:{scope:'firm',externalCallId,provider:clean(input.provider||config.state.provider,80),direction:'incoming',from:phone(input.from)||null,to:phone(input.to)||null,status:'in_progress',knownCallerId:known?.id??null,knownCallerTitle:known?.title??null,startedAt:now,endedAt:null,stage:'opening',transcript,handledIntents:[],createdWorkIds:[],lastPrompt:opening,automatedAssistant:true,legalAdviceProvided:false}});
    await this.atlas.createEvent(workspaceId,{parentObjectId:call.id,type:'phone_call.started',actorId,source:`telephony:${call.state.provider}`,confidence:1,data:{externalCallId,knownCaller:Boolean(known)}});
    return {call,...this.gather(opening)};
  }
  gather(prompt){return {action:'gather',prompt,accepts:['speech','dtmf']};}
  async classify(text,context){
    let intent;try{intent=this.intentProvider?await this.intentProvider.classify({text,context}):defaultIntent(text);}catch{intent=defaultIntent(text);}
    intent=typeof intent==='string'?intent:intent?.intent;
    return allowedIntents.has(intent)?intent:'general';
  }
  faq(config,text){const value=text.toLowerCase();return (config.state.faqs??[]).find(item=>item.keywords.some(keyword=>value.includes(keyword)))??null;}
  async createWork(call,input,actorId){
    const created=await this.atlas.createObject(call.workspaceId,{parentObjectId:input.matterId??null,dimension:'operation',type:input.type??'task',title:input.title,actorId,state:{scope:input.matterId?'matter':'firm',matterId:input.matterId??null,status:'open',sourceCallId:call.id,callerNumber:call.state.from,clientId:call.state.knownCallerId,details:input.details??null,requestedAt:this.clock(),requiresAttorneyReview:true,autonomouslyPrepared:true}});
    return created;
  }
  async handleTurn(workspaceId,input,actorId='telephony:inbound'){
    const call=await this.findCall(workspaceId,required(clean(input.externalCallId,180),'externalCallId'));if(!call)throw new AtlasError('VOICE_CALL_NOT_FOUND','Voice call session was not found',404);
    if(call.state.status!=='in_progress')return {call,action:'hangup',prompt:'This call has ended.'};
    const config=await this.configuration(workspaceId);const text=clean(input.text||input.digits,4000);if(!text)return {call,...this.gather('I did not hear a response. Please tell me how I can help, or say representative.')};
    let prompt;let action='gather';let work=null;let stage=call.state.stage;let intent='general';const transcript=[...(call.state.transcript??[]),{speaker:'caller',text,at:this.clock()}];
    if(stage==='intake_name'){stage='intake_issue';prompt=`Thank you, ${text}. Briefly describe the type of legal help you are seeking. Please do not share highly sensitive identifiers.`;}
    else if(stage==='intake_issue'){work=await this.createWork(call,{type:'prospective_client_intake',title:'Review new-client telephone intake',details:text},actorId);stage='complete';prompt='Thank you. I have prepared your intake for the firm to review. This does not create an attorney-client relationship. Is there anything else I can route for you?';}
    else{
      const faq=this.faq(config,text);intent=faq?'faq':await this.classify(text,{knownCaller:Boolean(call.state.knownCallerId),stage});
      if(intent==='emergency'){action='hangup';stage='complete';prompt='If you or someone else is in immediate danger, hang up and call 911 or your local emergency service now. The firm cannot monitor this call as an emergency service.';}
      else if(intent==='urgent_handoff'&&config.state.transferNumber){action='transfer';stage='transferred';prompt='I will connect you with the firm now.';}
      else if(intent==='urgent_handoff'){work=await this.createWork(call,{title:'Urgent caller requires immediate review',details:text},actorId);prompt='I marked this as urgent for immediate firm review. If anyone is in danger, call 911. I cannot guarantee when an attorney will respond.';}
      else if(intent==='new_client'){stage='intake_name';prompt='I can collect a preliminary intake for conflict checking and attorney review. This does not create an attorney-client relationship. What is your full name?';}
      else if(intent==='schedule'){work=await this.createWork(call,{type:'appointment_request',title:'Review consultation or appointment request',details:text},actorId);prompt='I recorded an appointment request for the firm to review against its calendar. No appointment is confirmed until the firm approves it.';}
      else if(intent==='human'||intent==='message'||intent==='existing_client'||intent==='billing'){work=await this.createWork(call,{title:intent==='billing'?'Return billing call':intent==='existing_client'?'Return existing-client call':'Return caller message',details:text},actorId);prompt=call.state.knownCallerId?'I matched your number to a firm contact and prepared a callback request. For privacy, I cannot disclose case information on this automated call.':'I prepared a callback request for the firm. I cannot confirm representation or disclose case information on this call.';}
      else if(intent==='legal_advice'){work=await this.createWork(call,{title:'Attorney review requested after legal question',details:text},actorId);prompt='I cannot provide legal advice, predict an outcome, or tell you what action to take. I recorded your question for an attorney to review.';}
      else if(faq){prompt=faq.answer;}
      else{work=await this.createWork(call,{title:'Review telephone message',details:text},actorId);prompt='I recorded your message for the firm to review. Would you like to add anything else?';}
    }
    transcript.push({speaker:'assistant',text:prompt,at:this.clock()});const updated=await this.atlas.updateObject(workspaceId,call.id,{version:call.version,state:{...call.state,stage,transcript,lastPrompt:prompt,handledIntents:[...(call.state.handledIntents??[]),intent],createdWorkIds:[...(call.state.createdWorkIds??[]),...(work?[work.id]:[])]}},actorId);
    await this.atlas.createEvent(workspaceId,{parentObjectId:call.id,type:'phone_call.turn_processed',actorId,source:`telephony:${call.state.provider}`,confidence:1,relatedObjectIds:work?[work.id]:[],data:{intent,action,workCreated:Boolean(work)}});
    return {call:updated,action,prompt,transferNumber:action==='transfer'?config.state.transferNumber:null,work};
  }
  async completeCall(workspaceId,input,actorId='telephony:status'){
    const call=await this.findCall(workspaceId,required(clean(input.externalCallId,180),'externalCallId'));if(!call)throw new AtlasError('VOICE_CALL_NOT_FOUND','Voice call session was not found',404);if(call.state.status==='completed')return call;
    const updated=await this.atlas.updateObject(workspaceId,call.id,{version:call.version,state:{...call.state,status:'completed',endedAt:this.clock(),providerStatus:clean(input.status||'completed',80),durationSeconds:Number.isInteger(input.durationSeconds)?input.durationSeconds:null}},actorId);
    await this.atlas.createEvent(workspaceId,{parentObjectId:call.id,type:'phone_call.received',actorId,source:`telephony:${call.state.provider}`,confidence:1,relatedObjectIds:call.state.createdWorkIds??[],data:{externalCallId:call.state.externalCallId,durationSeconds:updated.state.durationSeconds,workCreated:(updated.state.createdWorkIds??[]).length,transcript:updated.state.transcript,knownCallerId:updated.state.knownCallerId}});return updated;
  }
}

export class StructuredModelVoiceIntentProvider{
  constructor(model){if(typeof model?.complete!=='function')throw new AtlasError('VOICE_INTENT_PROVIDER_INVALID','Voice intent model must implement complete',500);this.model=model;}
  async classify({text,context}){const response=await this.model.complete({messages:[{role:'user',content:JSON.stringify({instruction:'Classify this inbound law-firm telephone turn. Return JSON only as {"intent":"..."}. Allowed intents: emergency, urgent_handoff, human, new_client, schedule, billing, existing_client, message, faq, legal_advice, general. Do not answer the caller, give legal advice, or infer confidential facts.',text,context})}],tools:[],context:{channel:'voice'}});if(typeof response?.text!=='string')throw new AtlasError('VOICE_INTENT_RESULT_INVALID','Voice intent model returned no text',502);let parsed;try{parsed=JSON.parse(response.text);}catch{throw new AtlasError('VOICE_INTENT_RESULT_INVALID','Voice intent model returned invalid JSON',502);}return allowedIntents.has(parsed.intent)?parsed.intent:'general';}
}
