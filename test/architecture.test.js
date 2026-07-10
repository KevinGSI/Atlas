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

test('chat exposes shared twin retrieval instead of only chat-local memory',async()=>{
  const assistant=await readFile(new URL('../src/assistant.js',import.meta.url),'utf8');
  assert.match(assistant,/name: 'search_twin'/);
  assert.match(assistant,/this\.service\.searchTwin/);
});
