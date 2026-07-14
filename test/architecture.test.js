import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('core domain modules do not import provider-specific adapters', async () => {
  const allowed = new Set(['ai-providers.js', 'application.js', 'config.js']);
  const names = (await readdir(new URL('../src/', import.meta.url))).filter((name) => name.endsWith('.js') && !allowed.has(name));
  for (const name of names) {
    const source = await readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /openai|anthropic|gemini|claude/i, `${name} contains provider-specific coupling`);
  }
});

test('native intelligence constitution explicitly prevents chat-owned intelligence', async () => {
  const constitution = await readFile(new URL('../docs/NATIVE_INTELLIGENCE_CONSTITUTION.md', import.meta.url), 'utf8');
  assert.match(constitution, /Chat is one interface to that twin/);
  assert.match(constitution, /No intelligence capability may be owned exclusively by chat/);
  assert.match(constitution, /explicit authorized approval/);
});

test('root governance makes the product constitution and business model mandatory for future work',async()=>{
  const [instructions,product,business]=await Promise.all([
    readFile(new URL('../AGENTS.md',import.meta.url),'utf8'),
    readFile(new URL('../docs/ATLAS_PRODUCT_CONSTITUTION.md',import.meta.url),'utf8'),
    readFile(new URL('../docs/BUSINESS_MODEL.md',import.meta.url),'utf8')
  ]);
  for(const required of ['docs/ATLAS_PRODUCT_CONSTITUTION.md','docs/NATIVE_INTELLIGENCE_CONSTITUTION.md','docs/UX_CONSTITUTION.md','docs/BUSINESS_MODEL.md'])assert.match(instructions,new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(instructions,/Do not substitute conversational memory/);
  assert.match(instructions,/page-only data stores/);
  assert.match(product,/highest-level product source of truth/);
  assert.match(product,/one continuously updated, firm-scoped digital twin/i);
  assert.match(product,/Raw or identifiable client data/);
  assert.match(product,/does not include private model chain-of-thought/);
  assert.match(product,/A material change requires an explicit product decision/);
  assert.match(business,/business-to-business software platform sold to law firms as a recurring subscription/);
  assert.match(business,/default ten-seat limit/);
  assert.match(business,/does not monetize by/);
  assert.match(business,/not approved public pricing/);
});

test('constitutional architecture retains one canonical event and context path',async()=>{
  const [service,repository,events,context]=await Promise.all([
    readFile(new URL('../src/service.js',import.meta.url),'utf8'),
    readFile(new URL('../src/repository.js',import.meta.url),'utf8'),
    readFile(new URL('../src/canonical-events.js',import.meta.url),'utf8'),
    readFile(new URL('../src/canonical-context.js',import.meta.url),'utf8')
  ]);
  assert.match(service,/getCanonicalContext\(workspaceId,objectId/);
  assert.match(repository,/CANONICAL_EVENT_REQUIRED/);
  assert.match(events,/DigitalTwinImpactConsumer/);
  assert.match(context,/canonicalContextObjectIds/);
});

test('chat exposes shared twin retrieval instead of only chat-local memory',async()=>{
  const assistant=await readFile(new URL('../src/assistant.js',import.meta.url),'utf8');
  assert.match(assistant,/name: 'search_twin'/);
  assert.match(assistant,/this\.service\.searchTwin/);
});
