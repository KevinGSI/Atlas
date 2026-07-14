import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';
import { SmsAssistantService } from '../src/sms-assistant.js';
import { CaseCommunicationsService } from '../src/case-communications.js';
import {
  CONTACT_TYPES,
  CONTACT_TYPE_LABELS,
  canonicalContactType,
  communicationContactGroup,
  isContactObject,
  normalizeContactState,
  normalizeContactType
} from '../src/contacts.js';

const here=dirname(fileURLToPath(import.meta.url));
const root=join(here,'..');
const now='2026-07-14T16:00:00.000Z';
const expectedTypes=['client','adjuster','opposing_counsel','medical_provider','opposing_party','judicial_assistant','doctor','expert_witness','lay_witness','court_reporter','other'];
const expectedLabels={client:'Client',adjuster:'Adjuster',opposing_counsel:'Opposing counsel',medical_provider:'Medical provider',opposing_party:'Opposing party',judicial_assistant:'Judicial assistant',doctor:'Doctor',expert_witness:'Expert witness',lay_witness:'Lay witness',court_reporter:'Court reporter',other:'Other'};

async function fixture(){
  const repository=new InMemoryRepository();const atlas=new AtlasService(repository,()=>now);const workspace=await atlas.createWorkspace({name:'Contact Directory Firm'});
  const matter=await atlas.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Morgan v. Lakeside'});
  return {repository,atlas,workspace,matter};
}

async function addContact(atlas,workspaceId,matter,type,index=0){
  const state=normalizeContactState({contactType:type,matterId:matter.id,email:`${type.replaceAll('_','-')}-${index}@example.test`,phone:`+1555010${String(index).padStart(4,'0')}`,notes:`Canonical ${type} record`});
  return atlas.createObject(workspaceId,{parentObjectId:matter.id,dimension:type==='client'?'client':'person',type:type==='client'?'client':'contact',title:`${expectedLabels[type]} ${index}`,state});
}

test('contact taxonomy is the exact ordered set of eleven durable identifiers',()=>{
  assert.deepEqual(CONTACT_TYPES,expectedTypes);
  assert.equal(new Set(CONTACT_TYPES).size,11);
  assert.deepEqual(Object.fromEntries(CONTACT_TYPES.map(type=>[type,CONTACT_TYPE_LABELS[type]])),expectedLabels);
  for(const type of expectedTypes){
    assert.equal(normalizeContactType(type),type);
    assert.equal(normalizeContactState({contactType:type,customField:'preserved'}).contactType,type);
    assert.equal(normalizeContactState({contactType:type,customField:'preserved'}).customField,'preserved');
  }
});

test('legacy client and communication role records remain compatible without losing the detailed identifier',()=>{
  assert.equal(normalizeContactType('other_contact'),'other');
  assert.equal(normalizeContactType('claims adjuster'),'adjuster');
  assert.equal(normalizeContactType('healthcare provider'),'medical_provider');
  assert.equal(normalizeContactType('adverse party'),'opposing_party');
  assert.equal(normalizeContactType('treating physician'),'doctor');
  assert.equal(normalizeContactType('fact witness'),'lay_witness');
  assert.equal(normalizeContactType('stenographer'),'court_reporter');
  assert.equal(canonicalContactType({dimension:'client',type:'client',state:{}}),'client');
  assert.equal(canonicalContactType({dimension:'person',type:'opposing_counsel',state:{role:'opposing_counsel'}}),'opposing_counsel');
  assert.equal(canonicalContactType({dimension:'person',type:'judicial_assistant',state:{role:'judicial_assistant'}}),'judicial_assistant');
  assert.equal(canonicalContactType({dimension:'person',type:'expert_witness',state:{role:'expert_witness'}}),'expert_witness');
  assert.equal(canonicalContactType({dimension:'person',type:'contact',state:{role:'other_contact'}}),'other');
  assert.equal(communicationContactGroup('client'),'client');
  assert.equal(communicationContactGroup('opposing_counsel'),'opposing_counsel');
  assert.equal(communicationContactGroup('judicial_assistant'),'judicial_assistant');
  assert.equal(communicationContactGroup('expert_witness'),'expert_witness');
  for(const type of ['adjuster','medical_provider','opposing_party','doctor','lay_witness','court_reporter','other'])assert.equal(communicationContactGroup(type),'other_contact');
});

test('all contact identifiers persist as canonical case objects and remain searchable and case scoped',async()=>{
  const {atlas,workspace,matter}=await fixture();const created=[];
  for(const [index,type] of expectedTypes.entries())created.push(await addContact(atlas,workspace.id,matter,type,index));
  const otherMatter=await atlas.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Unrelated case'});
  const unrelated=await addContact(atlas,workspace.id,otherMatter,'doctor',99);

  const stored=await atlas.listObjects(workspace.id,{});const directory=stored.filter(object=>object.parentObjectId===matter.id&&isContactObject(object));
  assert.equal(directory.length,11);
  assert.deepEqual(new Set(directory.map(object=>object.state.contactType)),new Set(expectedTypes));
  assert.ok(directory.every(object=>object.state.matterId===matter.id));

  const context=await atlas.getCanonicalContext(workspace.id,matter.id);
  assert.deepEqual(new Set(context.objects.filter(isContactObject).map(object=>object.id)),new Set(created.map(object=>object.id)));
  assert.equal(context.objects.some(object=>object.id===unrelated.id),false);

  const result=await atlas.searchTwin(workspace.id,'medical_provider');
  assert.deepEqual(result.objects.map(object=>object.state.contactType),['medical_provider']);

  const doctor=created.find(object=>object.state.contactType==='doctor');
  const updated=await atlas.updateObject(workspace.id,doctor.id,{version:doctor.version,state:{...doctor.state,email:'updated-doctor@example.test'}},'usr_attorney');
  assert.equal(updated.state.contactType,'doctor');assert.equal(updated.state.email,'updated-doctor@example.test');assert.equal(updated.version,2);
  const audits=await atlas.listAudits(workspace.id,doctor.id);assert.equal(audits.length,1);assert.equal(audits[0].beforeSnapshot.state.contactType,'doctor');assert.equal(audits[0].afterSnapshot.state.contactType,'doctor');
});

test('case communication recipients expose detailed contact types while preserving safe legacy action groups',async()=>{
  const {atlas,workspace,matter}=await fixture();
  for(const [index,type] of expectedTypes.entries())await addContact(atlas,workspace.id,matter,type,index);
  const sms=new SmsAssistantService(atlas,{messagingProvider:{describe(){return{provider:'test'};},async sendMessage(){throw new Error('not used');}},clock:()=>now});
  const service=new CaseCommunicationsService(atlas,{sms,clock:()=>now,model:{async complete(){return{text:'{"subject":"Draft","body":"Draft body"}'};}}});
  const status=await service.status(workspace.id,matter.id);const byType=new Map(status.contacts.map(contact=>[contact.contactType,contact]));
  assert.deepEqual(new Set(byType.keys()),new Set(expectedTypes));
  for(const type of expectedTypes){
    const contact=byType.get(type);assert.equal(contact.contactTypeLabel,expectedLabels[type]);assert.equal(contact.role,communicationContactGroup(type));
  }
});

test('the application presents Contacts consistently while retaining internal legacy route keys',async()=>{
  const [page,script]=await Promise.all([readFile(join(root,'web/phase-one/index.html'),'utf8'),readFile(join(root,'web/phase-one/app.js'),'utf8')]);
  assert.match(page,/data-view="contacts">Contacts<\/button>/);
  assert.match(page,/data-matter-tab="contacts">Contacts<\/button>/);
  assert.match(page,/<option value="contacts">Contacts<\/option>/);
  assert.doesNotMatch(page,/data-view="clients">/);
  assert.doesNotMatch(page,/data-matter-tab="clients">/);
  assert.doesNotMatch(page,/<option value="clients">/);
  assert.doesNotMatch(page,/data-view="clients">Clients<\/button>/);
  assert.doesNotMatch(page,/data-matter-tab="clients">Clients<\/button>/);
  assert.doesNotMatch(page,/<option value="clients">Clients<\/option>/);
  assert.match(script,/contacts:\{title:'Contacts',label:'Contact name'/);
  assert.match(script,/\{label:'Contacts',detail:'Firm contacts/);
  assert.match(page,/id="contactDirectoryTools"/);
  assert.match(page,/id="contactDirectorySearch"/);
  assert.match(page,/id="contactDirectoryType"/);
  assert.match(script,/function isContactObject\(object\)/);
  assert.match(script,/if\(isContactObject\(object\)\)return'contacts'/);
  assert.match(script,/view:'contacts'/);
  assert.match(script,/showView=function\(name\)\{return showViewBase\(name==='clients'\?'contacts':name\);\}/);
  assert.match(script,/function collectionItems\(name\)\{if\(name==='clients'\)name='contacts'/);
  assert.match(script,/renderCollection=function\(name\)\{if\(name==='clients'\)name='contacts'/);
  assert.match(script,/const contactType=activeCollection==='contacts'\?byId\('collectionContactType'\)\.value:null/);
  assert.match(script,/contactType,email:byId\('collectionContactEmail'\)/);

  const createOptions=page.match(/<select id="collectionContactType">([\s\S]*?)<\/select>/)?.[1]??'';
  const filterOptions=page.match(/<select id="contactDirectoryType">([\s\S]*?)<\/select>/)?.[1]??'';
  for(const [type,label] of Object.entries(expectedLabels)){
    assert.match(createOptions,new RegExp(`<option value=["']${type}["']>${label}<\\/option>`),`missing create-contact option for ${type}`);
    assert.match(filterOptions,new RegExp(`<option value=["']${type}["']>`),`missing directory filter identifier for ${type}`);
  }
});
