import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';
import { WebsiteIntakeService } from '../src/website-intake.js';

const clock=()=> '2026-07-15T13:00:00.000Z';
const connection=(workspaceId,token='x')=>({websiteId:'flo-dui',workspaceId,targetUserId:'usr_attorney',token:token.repeat(32),timeZone:'America/New_York'});
const submission={name:'Prospective Client',phone:'8135550199',message:'I need to discuss a DUI arrest.',matterType:'DUI arrest',charges:'DUI',location:'Tampa',consultationType:'standard',consent:true,textConsent:true,page:'/contact/'};

test('consultation negotiates first and schedules only after the client confirms',async()=>{
  const repository=new InMemoryRepository();const atlas=new AtlasService(repository,clock);const workspace=await atlas.createWorkspace({name:'Florida’s Law Office'});
  await atlas.createObject(workspace.id,{dimension:'operation',type:'calendar_event',title:'Existing appointment',state:{startsAt:'2026-07-15T14:00:00.000Z',endsAt:'2026-07-15T14:30:00.000Z'},actorId:'usr_attorney'});
  let published=0;atlas.setCalendarPublisher(async({calendarEvent})=>{published+=1;return{status:'published',provider:'microsoft',calendarEvent:{...calendarEvent,state:{...calendarEvent.state,externalCalendar:{provider:'microsoft',status:'published'}}}};});
  let attorneyTexts=0;let clientTexts=0;
  const intake=new WebsiteIntakeService(atlas,repository,{clock,connections:[connection(workspace.id)],attorneySmsSender:async input=>{attorneyTexts+=1;assert.equal(input.targetUserId,'usr_attorney');return{draft:{id:`smd_attorney_${attorneyTexts}`},message:{id:`sms_attorney_${attorneyTexts}`,state:{status:'sent',provider:'twilio'}}};},clientSmsSender:async input=>{clientTexts+=1;assert.equal(input.to,'8135550199');assert.equal(input.textConsent,true);assert.match(input.body,/Reply STOP/i);return{draft:{id:`smd_client_${clientTexts}`},message:{id:`sms_client_${clientTexts}`,state:{status:'sent',provider:'twilio'}}};}});
  const received=await intake.ingest('flo-dui',`Bearer ${'x'.repeat(32)}`,submission);
  assert.equal(received.status,'pending_attorney_confirmation');assert.equal(received.attorneyConfirmationRequired,true);assert.equal(attorneyTexts,1);assert.equal(clientTexts,0);
  let [request]=await intake.list(workspace.id);assert.equal(request.proposedSlots.length,3);assert.ok(request.proposedSlots.every(slot=>slot.startsAt!=='2026-07-15T14:00:00.000Z'));assert.equal('email' in request.prospectiveClient,false);
  const proposalReply=await intake.handleSmsReply(workspace.id,{from:'8135550100',body:'1',role:'attorney'});const proposal=proposalReply.result;
  assert.equal(proposalReply.handled,true);assert.equal(proposal.request.status,'awaiting_client_confirmation');assert.equal(published,0);assert.equal(clientTexts,1);assert.equal((await atlas.listObjects(workspace.id,{type:'calendar_event'})).length,1);assert.equal((await atlas.listObjects(workspace.id,{type:'email_draft'})).length,0);assert.equal((await atlas.whileYouWereGone(workspace.id,'usr_attorney')).length,0);
  const confirmed=await intake.handleSmsReply(workspace.id,{from:'(813) 555-0199',body:'YES'});
  assert.equal(confirmed.handled,true);assert.equal(confirmed.result.request.status,'scheduled_confirmed');assert.equal(published,1);assert.equal(clientTexts,2);assert.equal(attorneyTexts,2);
  const calendarEvents=await atlas.listObjects(workspace.id,{type:'calendar_event'});assert.equal(calendarEvents.length,2);assert.ok(calendarEvents.find(item=>item.id===confirmed.result.request.calendarEventId).state.createdFromAiProposalId);
});

test('client-confirmed time remains pending when no live calendar can publish it',async()=>{
  const repository=new InMemoryRepository();const atlas=new AtlasService(repository,clock);const workspace=await atlas.createWorkspace({name:'Firm'});const intake=new WebsiteIntakeService(atlas,repository,{clock,connections:[connection(workspace.id,'y')]});
  await intake.ingest('flo-dui',`Bearer ${'y'.repeat(32)}`,submission);await intake.handleSmsReply(workspace.id,{from:'8135550100',body:'1',role:'attorney'});
  const confirmed=await intake.handleSmsReply(workspace.id,{from:'8135550199',body:'confirm'});assert.equal(confirmed.result.request.status,'client_confirmed_calendar_pending');assert.equal(confirmed.result.calendarDelivery.status,'pending');assert.equal(confirmed.result.clientSmsDelivery.status,'pending');
});

test('counteroffers and direct scheduling bypass the Attorney Inbox and route by text',async()=>{
  const repository=new InMemoryRepository();const atlas=new AtlasService(repository,clock);const workspace=await atlas.createWorkspace({name:'Firm'});const attorneyMessages=[];const clientMessages=[];const intake=new WebsiteIntakeService(atlas,repository,{clock,connections:[connection(workspace.id,'c')],attorneySmsSender:async input=>{attorneyMessages.push(input.body);return{status:'sent'};},clientSmsSender:async input=>{clientMessages.push(input.body);return{status:'sent'};}});
  await intake.ingest('flo-dui',`Bearer ${'c'.repeat(32)}`,submission);await intake.handleSmsReply(workspace.id,{from:'8135550100',body:'1',role:'attorney'});
  const counter=await intake.handleSmsReply(workspace.id,{from:'8135550199',body:'Friday at 2:00 PM would be better.',role:'client'});assert.equal(counter.request.status,'client_counter_received');assert.match(attorneyMessages.at(-1),/Friday at 2:00 PM/);assert.match(attorneyMessages.at(-1),/Reply 1, 2, or 3/);
  const thirdReply=await intake.handleSmsReply(workspace.id,{from:'8135550100',body:'2',role:'attorney'});assert.equal(thirdReply.result.request.negotiationRound,2);
  const declined=await intake.handleSmsReply(workspace.id,{from:'8135550199',body:'No, that does not work.',role:'client'});assert.equal(declined.request.status,'direct_scheduling_open');assert.match(declined.reply,/sent directly to the attorney/i);assert.match(attorneyMessages.at(-1),/No, that does not work/);
  const later=await intake.handleSmsReply(workspace.id,{from:'8135550199',body:'Can the attorney message me directly?',role:'client'});assert.equal(later.handled,true);assert.equal(later.reply,null);assert.match(attorneyMessages.at(-1),/Can the attorney message me directly/);
  const attorneyDirect=await intake.handleSmsReply(workspace.id,{from:'8135550100',body:'Yes. Would Monday at 10 work?',role:'attorney'});assert.equal(attorneyDirect.handled,true);assert.match(clientMessages.at(-1),/Monday at 10/);const [latest]=await intake.list(workspace.id);assert.equal(latest.status,'direct_scheduling_open');assert.equal((await atlas.whileYouWereGone(workspace.id,'usr_attorney')).length,0);
});

test('public website intake requires separate scheduling-text permission',async()=>{const repository=new InMemoryRepository();const atlas=new AtlasService(repository,clock);const workspace=await atlas.createWorkspace({name:'Firm'});const intake=new WebsiteIntakeService(atlas,repository,{connections:[connection(workspace.id,'q')]});await assert.rejects(()=>intake.ingest('flo-dui',`Bearer ${'q'.repeat(32)}`,{...submission,textConsent:false}),error=>error.code==='WEBSITE_INTAKE_INVALID'&&/scheduling text permission/i.test(error.message));});

test('public website intake rejects an invalid ingestion credential',async()=>{const repository=new InMemoryRepository();const atlas=new AtlasService(repository,clock);const workspace=await atlas.createWorkspace({name:'Firm'});const intake=new WebsiteIntakeService(atlas,repository,{connections:[connection(workspace.id,'z')]});await assert.rejects(()=>intake.availability('flo-dui','Bearer wrong'),error=>error.code==='WEBSITE_INTAKE_UNAUTHORIZED'&&error.status===401);});
