import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasAssistant, AtlasToolRegistry } from '../src/assistant.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';

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

test('assistant executes read-only tools and returns deduplicated source references', async () => {
  const { tools, workspace } = await fixture();
  let turn = 0;
  const model = {
    async complete(input) {
      turn += 1;
      assert.equal(input.context.workspaceId, workspace.id);
      if (turn === 1) return { toolCalls: [{ id: 'call_1', name: 'search_objects', arguments: { query: 'motion to compel' } }] };
      assert.equal(input.messages.at(-1).role, 'tool');
      return { text: 'One motion to compel was found.' };
    }
  };
  const answer = await new AtlasAssistant(model, tools).query({ workspaceId: workspace.id, userId: 'usr_1', prompt: 'Find motions to compel' });
  assert.equal(answer.answer, 'One motion to compel was found.');
  assert.equal(answer.toolCalls, 1);
  assert.equal(answer.sources.length, 1);
  assert.equal(answer.sources[0].title, 'Motion to Compel Discovery');
});

test('daily priorities are derived from matter health and deadlines with sources', async () => {
  const { tools, workspace, matter } = await fixture();
  const result = await tools.execute('list_daily_priorities', workspace.id, { limit: 3 });
  assert.equal(result.data[0].matterId, matter.id);
  assert.equal(result.data[0].overdue, true);
  assert.equal(result.sources[0].objectId, matter.id);
});

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
