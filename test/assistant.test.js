import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasAssistant, AtlasToolRegistry } from '../src/assistant.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';
import { AtlasError } from '../src/errors.js';

async function fixture() {
  const service = new AtlasService(new InMemoryRepository(), () => '2026-07-10T12:00:00.000Z');
  const workspace = await service.createWorkspace({ name: 'Firm One' });
  const otherWorkspace = await service.createWorkspace({ name: 'Firm Two' });
  const matter = await service.createObject(workspace.id, {
    dimension: 'matter', type: 'civil', title: 'Reed v. Northline',
    state: { nextDeadline: '2026-07-09', ownerId: 'usr_1', clientId: 'obj_client' }
  });
  await service.createObject(workspace.id, { dimension: 'document', type: 'motion_to_compel', title: 'Motion to Compel Discovery' });
  await service.createObject(otherWorkspace.id, { dimension: 'document', type: 'motion_to_compel', title: 'Secret Motion to Compel' });
  return { service, tools: new AtlasToolRegistry(service), workspace, otherWorkspace, matter };
}

test('AI tools remain pinned to the already-authorized workspace', async () => {
  const { tools, workspace } = await fixture();
  const result = await tools.execute('search_objects', workspace.id, { query: 'motion to compel' });
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].title, 'Motion to Compel Discovery');
  assert.deepEqual(result.sources.map((item) => item.objectId), [result.data[0].id]);
});

test('document knowledge retrieval is firm-isolated and preserves page-level review provenance',async()=>{const {service,tools,workspace,otherWorkspace,matter}=await fixture();const document=await service.createObject(workspace.id,{parentObjectId:matter.id,dimension:'document',type:'discovery_response',title:'Plaintiff Discovery Responses',state:{status:'received'}});const secret=await service.createObject(otherWorkspace.id,{dimension:'document',type:'discovery_response',title:'Other Firm Discovery Responses'});const now='2026-07-13T15:00:00.000Z';await service.repository.createIntelligenceObservation({id:'ino_document_1',workspaceId:workspace.id,jobId:'inj_1',sourceObjectId:document.id,kind:'deadline',data:{title:'Discovery supplement due',date:'2026-07-24',matterId:matter.id},confidence:.94,sourceLocation:{page:7},provider:'openai',status:'candidate',reviewedBy:null,reviewedAt:null,createdAt:now});await service.repository.createIntelligenceObservation({id:'ino_document_2',workspaceId:workspace.id,jobId:'inj_1',sourceObjectId:document.id,kind:'fact',data:{title:'Discovery response served',description:'Responses were served by email',matterId:matter.id},confidence:.91,sourceLocation:{page:2},provider:'openai',status:'accepted',reviewedBy:'usr_1',reviewedAt:now,createdAt:now});await service.repository.createIntelligenceObservation({id:'ino_secret',workspaceId:otherWorkspace.id,jobId:'inj_2',sourceObjectId:secret.id,kind:'fact',data:{description:'Secret discovery response'},confidence:.99,sourceLocation:{page:1},provider:'openai',status:'accepted',reviewedBy:'usr_other',reviewedAt:now,createdAt:now});const result=await tools.execute('search_document_knowledge',workspace.id,{query:'discovery response',limit:20});assert.equal(result.data.results.some(item=>item.sourceObjectId===secret.id),false);assert.equal(result.data.results.some(item=>item.observationId==='ino_document_1'&&item.reviewStatus==='candidate'&&item.sourceLocation.page===7),true);assert.equal(result.data.results.some(item=>item.observationId==='ino_document_2'&&item.reviewStatus==='accepted'),true);assert.equal(result.sources.filter(item=>item.objectId===document.id).length>=2,true);assert.equal(result.sources.some(item=>item.sourceId==='observation:ino_document_1'&&item.matterTitle==='Reed v. Northline'),true);});

test('assistant keeps separate citations for multiple findings in the same document',async()=>{const {service,tools,workspace}=await fixture();const document=await service.createObject(workspace.id,{dimension:'document',type:'court_order',title:'Discovery Order'});for(const [id,page,title] of [['ino_cite_1',3,'Production deadline'],['ino_cite_2',5,'Privilege log deadline']])await service.repository.createIntelligenceObservation({id,workspaceId:workspace.id,jobId:'inj_cite',sourceObjectId:document.id,kind:'deadline',data:{title},confidence:.9,sourceLocation:{page},provider:'local',status:'accepted',reviewedBy:'usr_1',reviewedAt:'2026-07-13T15:00:00.000Z',createdAt:'2026-07-13T15:00:00.000Z'});let turn=0;const model={async complete(){turn+=1;return turn===1?{toolCalls:[{id:'knowledge_1',name:'search_document_knowledge',arguments:{query:'deadline'}}]}:{text:'The order contains two deadlines on pages 3 and 5.'};}};const answer=await new AtlasAssistant(model,tools).query({workspaceId:workspace.id,userId:'usr_1',prompt:'What deadlines are in the discovery order?'});assert.equal(answer.sources.filter(item=>item.objectId===document.id).length,2);assert.deepEqual(answer.sources.map(item=>item.sourceLocation.page).sort(),[3,5]);});

test('semantic document retrieval finds differently worded authorized knowledge',async()=>{const {service,workspace}=await fixture();const document=await service.createObject(workspace.id,{dimension:'document',type:'court_order',title:'Case Management Order'});const observation=await service.repository.createIntelligenceObservation({id:'ino_semantic',workspaceId:workspace.id,jobId:'inj_semantic',sourceObjectId:document.id,kind:'duty',data:{title:'Produce native-format records by July 24'},confidence:.93,sourceLocation:{page:4},provider:'local',status:'accepted',reviewedBy:'usr_1',reviewedAt:'2026-07-13T15:00:00.000Z',createdAt:'2026-07-13T15:00:00.000Z'});await service.repository.createDocumentKnowledgeEmbedding({id:'dke_1',workspaceId:workspace.id,observationId:observation.id,provider:'local',model:'semantic-test',dimensions:3,embedding:[1,0,0],createdAt:'2026-07-13T15:00:00.000Z'});const embeddingProvider={async embedTexts(){return {vectors:[[.99,.01,0]],provider:'local',model:'semantic-test',dimensions:3,usage:{inputTokens:2,outputTokens:0,totalTokens:2}};}};const tools=new AtlasToolRegistry(service,{embeddingProvider});const result=await tools.execute('search_document_knowledge',workspace.id,{query:'what material must we hand over soon?'});assert.equal(result.data.retrievalMode,'semantic');assert.equal(result.data.results[0].observationId,'ino_semantic');assert.equal(result.data.results[0].semanticSimilarity>.99,true);assert.deepEqual(result.usage,{inputTokens:2,outputTokens:0,totalTokens:2});});

test('semantic document retrieval decrypts only authorized source passages for the AI',async()=>{const {service,workspace,otherWorkspace}=await fixture();const document=await service.createObject(workspace.id,{dimension:'document',type:'motion',title:'Motion to Compel'});const other=await service.createObject(otherWorkspace.id,{dimension:'document',type:'private',title:'Other Firm Secret'});const cipher={encrypt:(value,context)=>`sealed:${context}:${value}`,decrypt:(value,context)=>value.replace(`sealed:${context}:`,'')};for(const [id,firm,object,text] of [['dkc_one',workspace.id,document,'Opposition is due Friday.'],['dkc_two',otherWorkspace.id,other,'Never disclose this.']])await service.repository.createDocumentKnowledgeChunk({id,workspaceId:firm,sourceObjectId:object.id,ordinal:0,content:cipher.encrypt(text,`document-chunk:${id}:content`),sourceLocation:{page:7},provider:'local',model:'semantic-test',dimensions:3,embedding:[1,0,0],createdAt:'2026-07-13T15:00:00.000Z'});const embeddingProvider={async embedTexts(){return {vectors:[[1,0,0]],model:'semantic-test',dimensions:3};}};const result=await new AtlasToolRegistry(service,{embeddingProvider,contentCipher:cipher}).execute('search_document_knowledge',workspace.id,{query:'when is the opposition due?'});const passage=result.data.results.find(item=>item.chunkId==='dkc_one');assert.equal(passage.text,'Opposition is due Friday.');assert.equal('encryptedContent' in passage,false);assert.equal(result.data.results.some(item=>item.chunkId==='dkc_two'),false);assert.equal(result.sources.find(item=>item.chunkId==='dkc_one').sourceLocation.page,7);});

test('assistant executes read-only tools and returns deduplicated source references', async () => {
  const { tools, workspace } = await fixture();
  let turn = 0;
  const model = {
    async complete(input) {
      turn += 1;
      assert.equal(input.context.workspaceId, workspace.id);
      if (turn === 1) return { toolCalls: [{ id: 'call_1', name: 'search_objects', arguments: { query: 'motion to compel' } }] };
      assert.equal(input.messages.at(-1).role, 'tool');
      return { text: 'One motion to compel was found.', provider: 'test-provider', model: 'test-model', usage: { inputTokens: 4, outputTokens: 3, totalTokens: 7 } };
    }
  };
  const answer = await new AtlasAssistant(model, tools).query({ workspaceId: workspace.id, userId: 'usr_1', prompt: 'Find motions to compel' });
  assert.equal(answer.answer, 'One motion to compel was found.');
  assert.equal(answer.toolCalls, 1);
  assert.equal(answer.sources.length, 1);
  assert.equal(answer.sources[0].title, 'Motion to Compel Discovery');
  assert.equal(answer.provider, 'test-provider');
  assert.equal(answer.model, 'test-model');
  assert.deepEqual(answer.usage, { inputTokens: 4, outputTokens: 3, totalTokens: 7 });
});

test('daily priorities are derived from matter health and deadlines with sources', async () => {
  const { tools, workspace, matter } = await fixture();
  const result = await tools.execute('list_daily_priorities', workspace.id, { limit: 3 });
  assert.equal(result.data[0].matterId, matter.id);
  assert.equal(result.data[0].overdue, true);
  assert.equal(result.sources[0].objectId, matter.id);
});

test('matter context and priorities include canonical child tasks and deadlines', async () => {
  const { service, tools, workspace, matter } = await fixture();
  const task = await service.createObject(workspace.id, { parentObjectId: matter.id, dimension: 'operation', type: 'task', title: 'Review discovery plan', state: { status: 'open' } });
  const deadline = await service.createObject(workspace.id, { parentObjectId: matter.id, dimension: 'operation', type: 'deadline', title: 'Discovery responses due', state: { status: 'open', date: '2026-07-11T12:00:00.000Z' } });
  const context = await tools.execute('get_matter_context', workspace.id, { matterId: matter.id });
  assert.deepEqual(context.data.related.map((item) => item.id), [task.id, deadline.id]);
  assert.deepEqual(new Set(context.sources.map((item) => item.id ?? item.objectId)), new Set([matter.id, task.id, deadline.id]));
  const priorities = await tools.execute('list_daily_priorities', workspace.id, { limit: 1 });
  assert.equal(priorities.data[0].openTaskCount, 1);
  assert.equal(priorities.sources.some((item) => item.objectId === deadline.id), true);
});

test('firm metrics compute recent-case work and client-contact counts on the server',async()=>{const {service,tools,workspace,matter}=await fixture();await service.createObject(workspace.id,{parentObjectId:matter.id,dimension:'operation',type:'communication',title:'Client status call',state:{status:'completed',occurredAt:'2026-07-09T15:00:00.000Z'}});await service.createObject(workspace.id,{parentObjectId:matter.id,dimension:'operation',type:'task',title:'Prepare discovery response',state:{status:'open',date:'2026-07-09T10:00:00.000Z'}});await service.createObject(workspace.id,{parentObjectId:matter.id,dimension:'operation',type:'deadline',title:'Discovery due',state:{status:'open',date:'2026-07-12T12:00:00.000Z'}});const metrics=await tools.execute('compute_firm_metrics',workspace.id,{recentMatterLimit:10});assert.equal(metrics.data.totals.matters,1);assert.equal(metrics.data.totals.openTasks,1);assert.equal(metrics.data.totals.overdueTasks,1);assert.equal(metrics.data.totals.deadlinesWithinSevenDays,1);assert.equal(metrics.data.totals.communications,1);assert.equal(metrics.data.recentMatters[0].clientContactCount,1);assert.equal(metrics.data.recentMatters[0].lastClientContactAt,'2026-07-09T15:00:00.000Z');assert.equal(metrics.sources.some(item=>item.objectId===matter.id),true);});

test('public web research is isolated, cited, and rejects private firm identifiers',async()=>{const {service,workspace}=await fixture();const calls=[];const webResearch={async search(input){calls.push(input);return {answer:'Rule 26 requires proportionality.',sources:[{url:'https://www.law.cornell.edu/rules/frcp/rule_26',title:'Federal Rule 26'}],usage:{inputTokens:3,outputTokens:4,totalTokens:7}};}};const tools=new AtlasToolRegistry(service,{webResearch});assert.equal(tools.definitions().some(tool=>tool.name==='search_public_web'),true);const researched=await tools.execute('search_public_web',workspace.id,{query:'current federal discovery proportionality standard'});assert.deepEqual(calls,[{query:'current federal discovery proportionality standard'}]);assert.deepEqual(researched.webSources,[{url:'https://www.law.cornell.edu/rules/frcp/rule_26',title:'Federal Rule 26'}]);await assert.rejects(()=>tools.execute('search_public_web',workspace.id,{query:'search Reed v. Northline on the web'}),error=>error.code==='AI_WEB_QUERY_CONFIDENTIAL');await assert.rejects(()=>tools.execute('search_public_web',workspace.id,{query:'research client@example.com'}),error=>error.code==='AI_WEB_QUERY_CONFIDENTIAL');});

test('assistant combines canonical tools with isolated web citations and audit usage',async()=>{const {service,workspace}=await fixture();const webResearch={async search(){return {answer:'Public research result',sources:[{url:'https://rules.example/rule',title:'Public rule'}],usage:{inputTokens:5,outputTokens:6,totalTokens:11}};}};const tools=new AtlasToolRegistry(service,{webResearch});let turn=0;const model={async complete(){turn+=1;return turn===1?{toolCalls:[{id:'web_1',name:'search_public_web',arguments:{query:'current public discovery rule'}}],usage:{inputTokens:2,outputTokens:1,totalTokens:3},provider:'test',model:'test-model'}:{text:'The current rule is supported by the cited public source.',usage:{inputTokens:3,outputTokens:4,totalTokens:7},provider:'test',model:'test-model'};}};const result=await new AtlasAssistant(model,tools,{repository:service.repository}).query({workspaceId:workspace.id,userId:'usr_1',prompt:'Research the current discovery rule'});assert.deepEqual(result.webSources,[{url:'https://rules.example/rule',title:'Public rule'}]);assert.deepEqual(result.usage,{inputTokens:10,outputTokens:11,totalTokens:21});const run=(await service.repository.listAiRuns(workspace.id,1))[0];assert.equal(run.sources.some(item=>item.sourceType==='web'&&item.url==='https://rules.example/rule'),true);});

test('assistant answers unfamiliar general questions without requiring a command or tool',async()=>{const {tools,workspace}=await fixture();const model={async complete(input){assert.match(input.messages[0].content,/reasonable questions even when they do not match a known Atlas command/);assert.match(input.messages[0].content,/law or any other public topic/);return {text:'A contract generally requires offer, acceptance, and consideration.'};}};const result=await new AtlasAssistant(model,tools).query({workspaceId:workspace.id,userId:'usr_1',prompt:'What are the basic elements of a contract?'});assert.equal(result.answer,'A contract generally requires offer, acceptance, and consideration.');assert.equal(result.toolCalls,0);});

test('assistant safely reformulates a private web query instead of failing the conversation',async()=>{const {service,workspace}=await fixture();const searches=[];const webResearch={async search({query}){searches.push(query);return {answer:'Public Delaware discovery rules.',sources:[{url:'https://courts.delaware.gov/rules','title':'Delaware Courts'}]};}};const tools=new AtlasToolRegistry(service,{webResearch});let turn=0;const model={async complete(input){turn+=1;if(turn===1)return {toolCalls:[{id:'private_web',name:'search_public_web',arguments:{query:'rules for Reed v. Northline'}}]};if(turn===2){assert.deepEqual(input.messages.at(-1).content,{ok:false,error:{code:'AI_WEB_QUERY_CONFIDENTIAL',message:'The public search query contained private firm context and was not sent.',recovery:'Use Atlas tools for private facts. Reformulate only the public issue as a generic query with every client, matter, case, contact, strategy, and document identifier removed, then retry search_public_web.'}});return {toolCalls:[{id:'safe_web',name:'search_public_web',arguments:{query:'current Delaware civil discovery rules'}}]};}return {text:'I separated the private matter context and researched the public Delaware rules.'};}};const result=await new AtlasAssistant(model,tools).query({workspaceId:workspace.id,userId:'usr_1',prompt:'Research current rules for Reed v. Northline'});assert.deepEqual(searches,['current Delaware civil discovery rules']);assert.equal(result.toolCalls,2);assert.equal(result.webSources[0].url,'https://courts.delaware.gov/rules');assert.match(result.answer,/separated the private matter context/);});

test('assistant remains conversational when live web research is temporarily unavailable',async()=>{const {service,workspace}=await fixture();const tools=new AtlasToolRegistry(service,{webResearch:{async search(){throw new AtlasError('WEB_RESEARCH_UNAVAILABLE','network unavailable',503,{provider:'test'});}}});let turn=0;const model={async complete(input){turn+=1;if(turn===1)return {toolCalls:[{id:'web_down',name:'search_public_web',arguments:{query:'current Delaware governor'}}]};assert.equal(input.messages.at(-1).content.error.code,'WEB_RESEARCH_UNAVAILABLE');assert.match(input.messages.at(-1).content.error.recovery,/live browsing is temporarily unavailable/);return {text:"Live browsing is temporarily unavailable, so I can't verify the current officeholder. Please retry shortly."};}};const result=await new AtlasAssistant(model,tools).query({workspaceId:workspace.id,userId:'usr_1',prompt:'Who is the current Delaware governor?'});assert.match(result.answer,/Live browsing is temporarily unavailable/);assert.equal(result.webSources.length,0);assert.equal(result.toolCalls,1);});

test('assistant fails honestly when no model provider is configured', async () => {
  const { tools, workspace } = await fixture();
  await assert.rejects(
    () => new AtlasAssistant(null, tools).query({ workspaceId: workspace.id, userId: 'usr_1', prompt: 'Help me' }),
    (error) => error.code === 'AI_NOT_CONFIGURED' && error.status === 503
  );
});

test('assistant rejects unknown tools, oversized prompts, and unbounded tool loops', async () => {
  const { tools, workspace } = await fixture();
  const unknown = { async complete() { return { toolCalls: [{ id: 'bad', name: 'delete_everything', arguments: {} }] }; } };
  await assert.rejects(() => new AtlasAssistant(unknown, tools).query({ workspaceId: workspace.id, userId: 'usr_1', prompt: 'Delete' }), (error) => error.code === 'AI_TOOL_NOT_ALLOWED');
  await assert.rejects(() => new AtlasAssistant(unknown, tools, { maxPromptCharacters: 3 }).query({ workspaceId: workspace.id, userId: 'usr_1', prompt: 'Too long' }), (error) => error.code === 'AI_PROMPT_TOO_LARGE');
  const looping = { async complete() { return { toolCalls: [{ id: 'loop', name: 'list_recent_matters', arguments: {} }] }; } };
  await assert.rejects(() => new AtlasAssistant(looping, tools, { maxToolRounds: 1 }).query({ workspaceId: workspace.id, userId: 'usr_1', prompt: 'Loop' }), (error) => error.code === 'AI_TOOL_LIMIT_EXCEEDED');
});

test('assistant rejects invalid provider responses and invalid tool arguments', async () => {
  const { tools, workspace } = await fixture();
  const invalid = { async complete() { return {}; } };
  await assert.rejects(() => new AtlasAssistant(invalid, tools).query({ workspaceId: workspace.id, userId: 'usr_1', prompt: 'Answer' }), (error) => error.code === 'AI_INVALID_RESPONSE');
  const badArguments = { async complete() { return { toolCalls: [{ id: 'bad_args', name: 'search_objects', arguments: { query: 'motion', limit: 500 } }] }; } };
  await assert.rejects(() => new AtlasAssistant(badArguments, tools).query({ workspaceId: workspace.id, userId: 'usr_1', prompt: 'Search' }), (error) => error.code === 'AI_TOOL_ARGUMENT_INVALID');
});

test('assistant records immutable-shaped completed and failed run records', async () => {
  const { service, tools, workspace } = await fixture();
  const repository = service.repository;
  const success = { async complete() { return { text: 'Completed answer', provider: 'local', model: 'model-l', usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } }; } };
  const assistant = new AtlasAssistant(success, tools, { repository, clock: () => '2026-07-10T13:00:00.000Z' });
  const answer = await assistant.query({ workspaceId: workspace.id, userId: 'usr_1', prompt: 'Summarize' });
  assert.match(answer.runId, /^air_/);
  let runs = await assistant.listRuns(workspace.id);
  assert.equal(runs[0].status, 'completed');
  assert.equal(runs[0].answer, 'Completed answer');
  assert.deepEqual(runs[0].usage, { inputTokens: 2, outputTokens: 3, totalTokens: 5 });
  const failed = new AtlasAssistant({ async complete() { throw new AtlasError('AI_PROVIDER_ERROR', 'failed', 502, { provider: 'local' }); } }, tools, { repository });
  await assert.rejects(() => failed.query({ workspaceId: workspace.id, userId: 'usr_1', prompt: 'Fail safely' }), (error) => error.code === 'AI_PROVIDER_ERROR');
  runs = await failed.listRuns(workspace.id);
  assert.equal(runs[0].status, 'failed');
  assert.equal(runs[0].errorCode, 'AI_PROVIDER_ERROR');
  assert.equal(runs[0].answer, null);
});

test('assistant persists private conversations and continues with prior messages', async () => {
  const { service, tools, workspace } = await fixture();
  const seen = [];
  const model = { async complete(input) { seen.push(input.messages.map((m) => `${m.role}:${m.content}`)); return { text: `Answer ${seen.length}` }; } };
  const assistant = new AtlasAssistant(model, tools, { repository: service.repository });
  const first = await assistant.query({ workspaceId: workspace.id, userId: 'usr_owner', prompt: 'First question' });
  const second = await assistant.query({ workspaceId: workspace.id, userId: 'usr_owner', conversationId: first.conversationId, prompt: 'Follow up' });
  assert.equal(second.conversationId, first.conversationId);
  assert.equal(seen[1][0].startsWith('developer:You are Atlas'), true);
  assert.deepEqual(seen[1].slice(1), ['user:First question', 'assistant:Answer 1', 'user:Follow up']);
  const conversations = await assistant.listConversations(workspace.id, 'usr_owner');
  assert.equal(conversations.length, 1);
  const messages = await assistant.listMessages(workspace.id, 'usr_owner', first.conversationId);
  assert.deepEqual(messages.map((m) => m.role), ['user', 'assistant', 'user', 'assistant']);
  await assert.rejects(() => assistant.listMessages(workspace.id, 'usr_other', first.conversationId), (error) => error.code === 'AI_CONVERSATION_NOT_FOUND');
});

test('AI task proposals require a separate human decision before creating platform objects', async () => {
  const { service, tools, workspace, matter } = await fixture();
  let turn = 0;
  const model = { async complete() { turn += 1; return turn === 1
    ? { toolCalls: [{ id: 'proposal_1', name: 'propose_create_task', arguments: { title: 'Prepare witness outline', matterId: matter.id, dueDate: '2026-07-12' } }] }
    : { text: 'I prepared a task proposal for your approval.' }; } };
  const assistant = new AtlasAssistant(model, tools, { repository: service.repository });
  const response = await assistant.query({ workspaceId: workspace.id, userId: 'usr_approver', prompt: 'Create a witness preparation task' });
  assert.equal(response.actionProposals.length, 1);
  assert.equal(response.actionProposals[0].status, 'pending');
  assert.equal((await service.listObjects(workspace.id, { dimension: 'operation' })).length, 0);

  const approved = await service.decideAiActionProposal(workspace.id, response.actionProposals[0].id, { version: 1, decision: 'approve' }, 'usr_approver');
  assert.equal(approved.proposal.status, 'approved');
  assert.equal(approved.result.type, 'task');
  assert.equal(approved.result.parentObjectId, matter.id);
  assert.equal(approved.result.state.createdFromAiProposalId, response.actionProposals[0].id);
  await assert.rejects(() => service.decideAiActionProposal(workspace.id, response.actionProposals[0].id, { version: 1, decision: 'approve' }, 'usr_approver'), (error) => error.code === 'AI_ACTION_ALREADY_DECIDED');
});

test('rejected AI task proposals never create tasks', async () => {
  const { service, workspace } = await fixture();
  const proposal = await service.repository.createAiActionProposal({ id: 'aap_reject', workspaceId: workspace.id, runId: 'air_test', proposedBy: 'usr_1', actionType: 'create_task', input: { title: 'Do not create', matterId: null }, status: 'pending', version: 1, decidedBy: null, resultObjectId: null, createdAt: '2026-07-10T12:00:00.000Z', decidedAt: null });
  const rejected = await service.decideAiActionProposal(workspace.id, proposal.id, { version: 1, decision: 'reject' }, 'usr_2');
  assert.equal(rejected.status, 'rejected');
  assert.equal((await service.listObjects(workspace.id, { dimension: 'operation' })).length, 0);
});

test('approved document and email actions create drafts but never file or send them', async () => {
  const { service, tools, workspace, matter } = await fixture();
  let turn = 0;
  const model = { async complete() { turn += 1; return turn === 1 ? { toolCalls: [
    { id: 'doc_1', name: 'propose_create_document', arguments: { title: 'Motion to Compel Draft', documentType: 'motion_to_compel', matterId: matter.id, content: 'Draft argument' } },
    { id: 'email_1', name: 'propose_draft_email', arguments: { subject: 'Discovery follow-up', recipients: ['counsel@example.com'], matterId: matter.id, body: 'Draft email body' } }
  ] } : { text: 'I prepared two drafts for approval.' }; } };
  const assistant = new AtlasAssistant(model, tools, { repository: service.repository });
  const response = await assistant.query({ workspaceId: workspace.id, userId: 'usr_1', prompt: 'Prepare the motion and email' });
  assert.deepEqual(response.actionProposals.map((proposal) => proposal.actionType), ['create_document', 'draft_email']);
  const document = await service.decideAiActionProposal(workspace.id, response.actionProposals[0].id, { version: 1, decision: 'approve' }, 'usr_1');
  const email = await service.decideAiActionProposal(workspace.id, response.actionProposals[1].id, { version: 1, decision: 'approve' }, 'usr_1');
  assert.deepEqual({ dimension: document.result.dimension, type: document.result.type, status: document.result.state.status, filed: document.result.state.filed }, { dimension: 'document', type: 'motion_to_compel', status: 'draft', filed: false });
  assert.deepEqual({ type: email.result.type, status: email.result.state.status, sent: email.result.state.sent }, { type: 'email_draft', status: 'draft', sent: false });
  assert.equal(document.result.parentObjectId, matter.id);
  assert.equal(email.result.parentObjectId, matter.id);
});

test('calendar proposals remain review-only until an attorney approves one canonical event',async()=>{
  const {service,tools,workspace,matter}=await fixture();let turn=0;const model={async complete(){turn+=1;return turn===1?{toolCalls:[{id:'calendar_1',name:'propose_create_calendar_event',arguments:{title:'Client deposition',eventType:'deposition',startsAt:'2026-07-21T14:00:00.000Z',endsAt:'2026-07-21T16:00:00.000Z',matterId:matter.id,location:'Conference Room',attendees:['Client@Example.com']}}]}:{text:'I prepared the deposition for your calendar review.'};}};const assistant=new AtlasAssistant(model,tools,{repository:service.repository});const response=await assistant.query({workspaceId:workspace.id,userId:'usr_attorney',prompt:'Add the deposition after I approve it'});const proposal=response.actionProposals[0];assert.equal(proposal.actionType,'create_calendar_event');assert.equal(proposal.status,'pending');assert.equal((await service.listObjects(workspace.id,{dimension:'operation'})).filter(item=>item.type==='calendar_event').length,0);
  const approved=await service.decideAiActionProposal(workspace.id,proposal.id,{version:1,decision:'approve'},'usr_attorney');assert.equal(approved.result.type,'calendar_event');assert.equal(approved.result.parentObjectId,matter.id);assert.deepEqual({eventType:approved.result.state.eventType,startsAt:approved.result.state.startsAt,endsAt:approved.result.state.endsAt,targetUserId:approved.result.state.targetUserId,attendees:approved.result.state.attendees,externalStatus:approved.result.state.externalCalendar.status},{eventType:'deposition',startsAt:'2026-07-21T14:00:00.000Z',endsAt:'2026-07-21T16:00:00.000Z',targetUserId:'usr_attorney',attendees:['client@example.com'],externalStatus:'pending'});assert.equal(approved.calendarDelivery.status,'pending');assert.equal((await service.listObjects(workspace.id,{dimension:'operation'})).filter(item=>item.type==='calendar_event').length,1);
});

test('rejected and invalid calendar proposals never create calendar events',async()=>{const {service,tools,workspace}=await fixture();await assert.rejects(()=>tools.execute('propose_create_calendar_event',workspace.id,{title:'Unknown date',eventType:'meeting',startsAt:'not-a-date'}),error=>error.code==='AI_TOOL_ARGUMENT_INVALID');const proposal=await service.repository.createAiActionProposal({id:'aap_calendar_reject',workspaceId:workspace.id,runId:null,intelligenceJobId:'inj_calendar',originType:'intelligence',proposedBy:'atlas',actionType:'create_calendar_event',input:{title:'Court hearing',eventType:'court_date',startsAt:'2026-07-22T13:00:00.000Z'},status:'pending',version:1,decidedBy:null,resultObjectId:null,createdAt:'2026-07-10T12:00:00.000Z',decidedAt:null});const rejected=await service.decideAiActionProposal(workspace.id,proposal.id,{version:1,decision:'reject'},'usr_attorney');assert.equal(rejected.status,'rejected');assert.equal((await service.listObjects(workspace.id,{dimension:'operation'})).filter(item=>item.type==='calendar_event').length,0);});

test('draft proposal tools reject invalid recipients and oversized content', async () => {
  const { tools, workspace } = await fixture();
  await assert.rejects(() => tools.execute('propose_draft_email', workspace.id, { subject: 'Draft', recipients: ['not-an-email'], body: 'Body' }), (error) => error.code === 'AI_TOOL_ARGUMENT_INVALID');
  await assert.rejects(() => tools.execute('propose_create_document', workspace.id, { title: 'Draft', documentType: 'motion', content: 'x'.repeat(100_001) }), (error) => error.code === 'AI_TOOL_ARGUMENT_INVALID');
});
