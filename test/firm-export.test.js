import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { FirmExportService } from '../src/firm-export.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';

test('confirmed firm export is complete, deterministic, and excludes authentication secrets',async()=>{
  const repository=new InMemoryRepository();const clock=()=> '2026-07-13T12:00:00.000Z';const atlas=new AtlasService(repository,clock);
  const user=await repository.createUser({id:'usr_export',name:'Export Owner',email:'owner@export.test',passwordHash:'NEVER_EXPORT_THIS_HASH',createdAt:clock()});
  const workspace=await atlas.createWorkspace({name:'Export Firm'},user.id);
  const object=await atlas.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Exported Case',actorId:user.id});
  await atlas.deleteObject(workspace.id,object.id,{version:object.version},user.id);
  const service=new FirmExportService(repository,clock);
  await assert.rejects(()=>service.create(workspace.id,{}),(error)=>error.code==='FIRM_EXPORT_CONFIRMATION_REQUIRED');
  const exported=await service.create(workspace.id,{confirmation:'EXPORT FIRM DATA'});
  assert.equal(exported.format,'atlas-firm-export');assert.equal(exported.data.objects[0].deletedAt,clock());assert.equal(exported.manifest.counts.members,1);assert.equal(exported.manifest.counts.objects,1);
  assert.equal(exported.manifest.digest,createHash('sha256').update(JSON.stringify(exported.data)).digest('hex'));
  const dataText=JSON.stringify(exported.data);assert.doesNotMatch(dataText,/NEVER_EXPORT_THIS_HASH|passwordHash|tokenHash|refreshToken|encryptedSecret|recoveryCodeHashes/);
});
