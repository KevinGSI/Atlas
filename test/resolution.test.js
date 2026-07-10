import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasResolver } from '../src/resolution.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';

test('matter and entity resolution scores authorized canonical workspace objects',async()=>{
  const repository=new InMemoryRepository();const service=new AtlasService(repository);const workspace=await service.createWorkspace({name:'Resolution Firm'});
  const matter=await service.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Reed v. Northline',state:{caseNumber:'2026-CV-104',clientName:'Jordan Reed'}});
  const person=await service.createObject(workspace.id,{dimension:'person',type:'contact',title:'Jordan Reed',state:{email:'jordan@example.com'}});
  const resolver=new AtlasResolver(repository);
  assert.equal((await resolver.resolveMatter(workspace.id,{reference:'2026-CV-104'}))[0].objectId,matter.id);
  assert.equal((await resolver.resolveEntity(workspace.id,{email:'JORDAN@example.com'}))[0].objectId,person.id);
  assert.equal((await resolver.resolveMatter(workspace.id,{title:'Unrelated'})).length,0);
});

test('resolution never crosses workspace boundaries',async()=>{
  const repository=new InMemoryRepository();const service=new AtlasService(repository);const first=await service.createWorkspace({name:'First'});const second=await service.createWorkspace({name:'Second'});
  await service.createObject(second.id,{dimension:'matter',type:'secret',title:'Secret Matter',state:{caseNumber:'SECRET-1'}});
  assert.equal((await new AtlasResolver(repository).resolveMatter(first.id,{reference:'SECRET-1'})).length,0);
});
