import test from 'node:test';
import assert from 'node:assert/strict';
import { AiProviderRegistry, OpenAiResponsesProvider, createAiProviderRegistry } from '../src/ai-providers.js';

function jsonResponse(body, status = 200, requestId = null) {
  return { ok: status >= 200 && status < 300, status, headers: { get: (name) => name === 'x-request-id' ? requestId : null }, async json() { return body; } };
}

test('provider registry exposes normalized capabilities and prevents duplicate names', () => {
  const provider = { capabilities: () => ({ toolCalling: true }), async complete() { return { text: 'ok' }; } };
  const registry = new AiProviderRegistry().register('test', provider);
  assert.equal(registry.resolve('test'), provider);
  assert.deepEqual(registry.list(), [{ name: 'test', capabilities: { toolCalling: true } }]);
  assert.throws(() => registry.register('test', provider), (error) => error.code === 'AI_PROVIDER_EXISTS');
  assert.throws(() => registry.resolve('missing'), (error) => error.code === 'AI_PROVIDER_NOT_FOUND');
});

test('OpenAI adapter translates normalized tools, calls, outputs, text, state, and usage', async () => {
  const requests = [];
  const responses = [
    { id: 'resp_1', model: 'model-a', output: [{ id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'search_objects', arguments: '{"query":"motion"}' }], usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 } },
    { id: 'resp_2', model: 'model-a', output: [{ type: 'message', content: [{ type: 'output_text', text: 'One motion was found.' }] }], usage: { input_tokens: 7, output_tokens: 5, total_tokens: 12 } }
  ];
  const transport = async (url, options) => { requests.push({ url, options, body: JSON.parse(options.body) }); return jsonResponse(responses.shift()); };
  const provider = new OpenAiResponsesProvider({ apiKey: 'test-key', model: 'model-a', transport });
  const tools = [{ name: 'search_objects', description: 'Search', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }];
  const first = await provider.complete({ messages: [{ role: 'developer', content: 'Use authorized tools.' }, { role: 'user', content: 'Find motions' }], tools });
  assert.deepEqual(first.toolCalls, [{ id: 'call_1', name: 'search_objects', arguments: { query: 'motion' } }]);
  assert.equal(requests[0].body.tools[0].type, 'function');
  assert.equal(requests[0].body.store, false);
  assert.equal(requests[0].options.headers.authorization, 'Bearer test-key');
  const messages = [
    { role: 'user', content: 'Find motions' },
    { role: 'assistant', toolCalls: first.toolCalls },
    { role: 'tool', toolCallId: 'call_1', name: 'search_objects', content: [{ id: 'obj_1' }] }
  ];
  const second = await provider.complete({ messages, tools, state: first.state });
  assert.equal(requests[1].body.input[0].role, 'developer');
  assert.equal(requests[1].body.input[1].role, 'user');
  assert.equal(requests[1].body.input[2].type, 'function_call');
  assert.equal(requests[1].body.input[3].type, 'function_call_output');
  assert.equal(requests[1].body.input[3].call_id, 'call_1');
  assert.equal(second.text, 'One motion was found.');
  assert.deepEqual(second.usage, { inputTokens: 7, outputTokens: 5, totalTokens: 12 });
  assert.equal(second.provider, 'openai');
});

test('OpenAI adapter normalizes transport, authentication, rate-limit, and malformed responses', async () => {
  const options = { apiKey: 'secret', model: 'model-a' };
  await assert.rejects(() => new OpenAiResponsesProvider({ ...options, transport: async () => { throw new Error('network'); } }).complete({ messages: [], tools: [] }), (error) => error.code === 'AI_PROVIDER_UNAVAILABLE');
  await assert.rejects(() => new OpenAiResponsesProvider({ ...options, transport: async () => jsonResponse({}, 401, 'req_auth') }).complete({ messages: [], tools: [] }), (error) => error.code === 'AI_PROVIDER_AUTHENTICATION_FAILED' && error.details.requestId === 'req_auth');
  await assert.rejects(() => new OpenAiResponsesProvider({ ...options, transport: async () => jsonResponse({}, 429) }).complete({ messages: [], tools: [] }), (error) => error.code === 'AI_PROVIDER_RATE_LIMITED');
  await assert.rejects(() => new OpenAiResponsesProvider({ ...options, transport: async () => jsonResponse({ output: [{ type: 'function_call', call_id: 'c', name: 'x', arguments: '{' }] }) }).complete({ messages: [], tools: [] }), (error) => error.code === 'AI_PROVIDER_INVALID_RESPONSE');
});

test('OpenAI file analysis uses private direct file input behind the interchangeable provider contract',async()=>{let sent;const transport=async(url,options)=>{sent=JSON.parse(options.body);return jsonResponse({model:'model-a',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({observations:[{kind:'deadline',data:{title:'Response due',date:'2026-07-24'},confidence:.94,sourceLocation:{page:2}}],actionProposals:[],awareness:{category:'document_upload',priority:'high',headline:'Deadline found',summary:'Review required'}})}]}],usage:{input_tokens:12,output_tokens:8,total_tokens:20}});};const provider=new OpenAiResponsesProvider({apiKey:'test-key',model:'model-a',transport});const result=await provider.analyzeFile({content:Buffer.from('%PDF-test'),filename:'notice.pdf',mediaType:'application/pdf',instruction:'Analyze',context:{workspaceId:'wsp_1'}});const parts=sent.input[0].content;assert.equal(parts[0].type,'input_file');assert.equal(parts[0].filename,'notice.pdf');assert.match(parts[0].file_data,/^data:application\/pdf;base64,/);assert.equal(parts[0].detail,'high');assert.equal(parts[1].type,'input_text');assert.equal(sent.store,false);assert.equal(sent.text.format.type,'json_object');assert.equal(result.observations[0].kind,'deadline');assert.deepEqual(result.usage,{inputTokens:12,outputTokens:8,totalTokens:20});});

test('OpenAI source-passage extraction stays behind the file-capable provider contract',async()=>{let sent;const provider=new OpenAiResponsesProvider({apiKey:'test-key',model:'model-a',transport:async(url,options)=>{sent=JSON.parse(options.body);return jsonResponse({model:'model-a',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({retrievalChunks:[{text:'Responses are due July 24.',sourceLocation:{page:3}}]})}]}]});}});const result=await provider.extractDocumentChunks({content:Buffer.from('%PDF-test'),filename:'order.pdf',mediaType:'application/pdf',context:{workspaceId:'wsp_1'}});assert.equal(result.retrievalChunks[0].sourceLocation.page,3);assert.equal(sent.store,false);assert.match(sent.input[0].content[1].text,/source-faithful retrieval passages/);});

test('OpenAI embeddings implement the bounded interchangeable semantic-index contract',async()=>{let request;const provider=new OpenAiResponsesProvider({apiKey:'test-key',model:'model-a',embeddingModel:'text-embedding-test',embeddingDimensions:3,transport:async(url,options)=>{request={url,body:JSON.parse(options.body)};return jsonResponse({model:'text-embedding-test',data:[{index:1,embedding:[0,1,0]},{index:0,embedding:[1,0,0]}],usage:{prompt_tokens:6,total_tokens:6}});}});const result=await provider.embedTexts(['production obligation','payment history']);assert.match(request.url,/\/embeddings$/);assert.deepEqual(request.body,{model:'text-embedding-test',input:['production obligation','payment history'],encoding_format:'float',dimensions:3});assert.deepEqual(result.vectors,[[1,0,0],[0,1,0]]);assert.deepEqual(result.usage,{inputTokens:6,outputTokens:0,totalTokens:6});assert.equal(provider.capabilities().embeddings,true);});

test('registry accepts interchangeable injected providers without OpenAI configuration', () => {
  const local = { capabilities: () => ({ toolCalling: true, local: true }), async complete() { return { text: 'local' }; } };
  const registry = createAiProviderRegistry({ openAiApiKey: null }, { aiProviders: { local } });
  assert.equal(registry.resolve('local'), local);
  assert.equal(registry.list()[0].capabilities.local, true);
});
