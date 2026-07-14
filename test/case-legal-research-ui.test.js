import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('case workspace places durable live legal research immediately after Timeline', async () => {
  const [page, script] = await Promise.all([
    readFile(new URL('web/phase-one/index.html', root), 'utf8'),
    readFile(new URL('web/phase-one/app.js', root), 'utf8')
  ]);

  assert.match(page, /data-matter-tab="timeline">Timeline<\/button><button data-matter-tab="legal-research">Legal Research<\/button>/);
  assert.match(script, /function renderCaseLegalResearch\(content\)/);
  assert.match(script, /function submitCaseLegalResearch\(event,matterId\)/);
  assert.match(script, /matterId,sourceMode:state\.sourceMode/);
  assert.match(script, /legal-research\/chat/);
  assert.match(script, /Use the facts and authorized records in this case/);
  assert.match(script, /private case information inside the firm/);
  assert.match(script, /Saved legal research/);
  assert.match(script, /new Date\(searchedAt\)\.toLocaleString\(\)/);
  assert.match(script, /\['legal_research','legal_research_analysis'\]/);
  assert.match(script, /relatedToMatter\(item,matter\.id\)/);
  assert.match(script, /event\.key==='Enter'&&!event\.shiftKey&&!event\.isComposing/);
});

test('firm-wide legal research exposes its prepared drafts in the unified Workspace',async()=>{const script=await readFile(new URL('web/phase-one/app.js',root),'utf8');assert.match(script,/Open prepared work in Workspace/);assert.match(script,/showView\('workspace'\)/);assert.match(script,/workspaceFilter/);assert.match(script,/action\.actionType==='create_document'/);});
