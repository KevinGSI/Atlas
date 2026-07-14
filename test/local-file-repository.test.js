import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLocalFileRuntime } from '../src/local-file-repository.js';

test('durable local repository retains firm data and document bytes across restarts', async () => {
  const directory=await mkdtemp(join(tmpdir(),'atlas-local-data-'));
  const path=join(directory,'repository.bin');
  try {
    const first=createLocalFileRuntime(path);
    const workspace={id:'wsp_local',name:'Persistent Firm',createdAt:'2026-07-14T12:00:00.000Z'};
    const user={id:'usr_local',email:'lawyer@example.test',name:'Local Lawyer',passwordHash:'hash'};
    const matter={id:'obj_local',workspaceId:workspace.id,parentObjectId:null,dimension:'matter',type:'civil',title:'Persistent case',state:{status:'open'},version:1,createdAt:'2026-07-14T12:00:00.000Z',updatedAt:'2026-07-14T12:00:00.000Z',deletedAt:null};
    await first.repository.createWorkspace(workspace);
    await first.repository.createUser(user);
    await first.repository.createMembership({workspaceId:workspace.id,userId:user.id,role:'owner'});
    await first.repository.createObject(matter);
    await first.repository.createDocumentBlob(workspace.id,'a'.repeat(64),Buffer.from('persistent document'),workspace.createdAt);
    await first.close();

    const second=createLocalFileRuntime(path);
    assert.equal((await second.repository.getWorkspace(workspace.id)).name,'Persistent Firm');
    assert.equal((await second.repository.getUser(user.id)).email,user.email);
    assert.equal((await second.repository.getObject(workspace.id,matter.id)).title,'Persistent case');
    assert.equal((await second.repository.getDocumentBlob(workspace.id,'a'.repeat(64))).content.toString(),'persistent document');
    assert.ok((await readFile(path)).length>0);
    await second.close();
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('durable local repository restores the last known good state after an unreadable write', async () => {
  const directory=await mkdtemp(join(tmpdir(),'atlas-local-recovery-'));
  const path=join(directory,'repository.bin');
  try {
    const first=createLocalFileRuntime(path);
    const workspace={id:'wsp_recovery',name:'Recovered Firm',createdAt:'2026-07-14T12:00:00.000Z'};
    await first.repository.createWorkspace(workspace);
    await first.close();
    assert.ok((await readFile(`${path}.previous`)).length>0);

    await writeFile(path,'not an Atlas repository');
    const recovered=createLocalFileRuntime(path);
    assert.equal((await recovered.repository.getWorkspace(workspace.id)).name,'Recovered Firm');
    assert.ok((await readFile(path)).length>0);
    await recovered.close();
  } finally { await rm(directory,{recursive:true,force:true}); }
});
