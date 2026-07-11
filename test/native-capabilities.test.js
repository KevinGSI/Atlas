import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeCapabilityRegistry, createDefaultNativeCapabilities } from '../src/native-capabilities.js';
import { SituationalPlaybookEngine } from '../src/situational-awareness.js';

test('native AI capabilities are independently registered and discoverable',()=>{const capabilities=createDefaultNativeCapabilities().list();assert.deepEqual(capabilities.map((item)=>item.id),['email-response-draft','phone-follow-up-task','document-deadline-task','approaching-deadline-review','missed-discovery-review','cms-tombstone-reconciliation']);assert.ok(capabilities.every((item)=>item.version==='1.0.0'));});

test('CMS tombstones deterministically prepare retention review without deleting data',()=>{const registry=createDefaultNativeCapabilities();const output=registry.apply({triggerType:'cms.record.tombstone',payload:{provider:'clio',recordType:'matter',object:{id:'obj_1',title:'Preserved Matter',parentObjectId:null}}},{observations:[],actionProposals:[]});assert.equal(output.observations[0].kind,'risk');assert.equal(output.actionProposals[0].actionType,'create_task');assert.match(output.actionProposals[0].input.description,/retention obligations/);});

test('a new task capability can be installed without changing the event engine',()=>{const registry=new NativeCapabilityRegistry().register({id:'deposition-summary',version:'1.0.0',triggers:['document.deposition'],description:'Prepare deposition review work.',apply(job,output){output.actionProposals.push({actionType:'create_task',input:{title:`Review deposition: ${job.payload.title}`}});return output;}});const engine=new SituationalPlaybookEngine(registry);const output=engine.apply({triggerType:'document.deposition',payload:{title:'Jordan Lee'}},{observations:[],actionProposals:[]});assert.equal(output.actionProposals[0].input.title,'Review deposition: Jordan Lee');});

test('capability packages cannot introduce consequential actions',()=>{const registry=new NativeCapabilityRegistry().register({id:'unsafe-sender',version:'1.0.0',triggers:['email.received'],apply(_job,output){output.actionProposals.push({actionType:'send_email',input:{}});return output;}});assert.throws(()=>new SituationalPlaybookEngine(registry).apply({triggerType:'email.received',payload:{}},{observations:[],actionProposals:[]}),(error)=>error.code==='NATIVE_CAPABILITY_ACTION_FORBIDDEN');});

test('capability versions cannot be registered twice',()=>{const capability={id:'custom-task',version:'1.0.0',triggers:['custom.event'],apply(_job,output){return output;}};const registry=new NativeCapabilityRegistry().register(capability);assert.throws(()=>registry.register(capability),(error)=>error.code==='NATIVE_CAPABILITY_DUPLICATE');});
