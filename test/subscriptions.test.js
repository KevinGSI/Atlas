import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';
import { IdentityService, TokenService } from '../src/identity.js';

async function fixture(seatLimit=2){
  const repository=new InMemoryRepository();
  const identity=new IdentityService(repository,new TokenService('a'.repeat(32)));
  const service=new AtlasService(repository,()=> '2026-07-10T12:00:00.000Z');
  const owner=(await identity.register({email:'owner@firm.test',name:'Owner',password:'correct horse battery staple'})).user;
  const workspace=await service.createWorkspace({name:'Subscriber Firm',seatLimit},owner.id);
  return {repository,identity,service,owner,workspace};
}

test('a new subscribing firm receives an isolated trial and one owner seat',async()=>{
  const {repository,workspace,owner}=await fixture();
  const subscription=await repository.getSubscription(workspace.id);
  assert.deepEqual({plan:subscription.plan,status:subscription.status,seatLimit:subscription.seatLimit},{plan:'pilot',status:'trialing',seatLimit:2});
  assert.equal((await repository.getMembership(workspace.id,owner.id)).role,'owner');
});

test('subscription seats bound invited firm users',async()=>{
  const {repository,identity,workspace}=await fixture(1);
  const user=(await identity.register({email:'paralegal@firm.test',name:'Paralegal',password:'correct horse battery staple'})).user;
  await assert.rejects(()=>identity.addMembership(workspace.id,user.id,'member'),error=>error.code==='SEAT_LIMIT_REACHED');
  assert.equal((await repository.listMemberships(workspace.id)).length,1);
});

test('inactive subscriptions fail closed while firm data remains siloed',async()=>{
  const {repository,identity,service,owner,workspace}=await fixture();
  const otherOwner=(await identity.register({email:'owner@other.test',name:'Other',password:'correct horse battery staple'})).user;
  const other=await service.createWorkspace({name:'Other Firm'},otherOwner.id);
  await assert.rejects(()=>identity.authorize(other.id,owner.id,'workspace:read'),error=>error.code==='ACCESS_DENIED');
  await repository.updateSubscription(workspace.id,{status:'suspended'},'2026-07-10T12:01:00.000Z');
  await assert.rejects(()=>identity.authorize(workspace.id,owner.id,'workspace:read'),error=>error.code==='SUBSCRIPTION_INACTIVE'&&error.status===402);
});
