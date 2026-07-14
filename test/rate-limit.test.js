import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRepository } from '../src/repository.js';
import { RepositoryRequestRateLimiter } from '../src/rate-limit.js';

test('repository rate limiting allows the configured window then returns a stable retry interval',async()=>{
  let now='2026-07-13T12:00:00.000Z';
  const limiter=new RepositoryRequestRateLimiter(new InMemoryRepository(),'s'.repeat(32),{aiRequests:2},()=>now);
  const input={routeName:'assistantQuery',method:'POST',userId:'usr_1',ipAddress:'192.0.2.10'};
  assert.equal((await limiter.check(input)).remaining,1);
  assert.equal((await limiter.check(input)).remaining,0);
  await assert.rejects(()=>limiter.check(input),(error)=>error.code==='RATE_LIMITED'&&error.status===429&&error.details.scope==='ai'&&error.details.retryAfterSeconds===60);
  now='2026-07-13T12:01:00.000Z';
  assert.equal((await limiter.check(input)).remaining,1);
});

test('rate-limit storage receives only HMAC identifiers and isolates users and policy scopes',async()=>{
  const seen=[];const buckets=new Map();
  const repository={consumeRateLimitBucket(input){seen.push(input);const count=(buckets.get(input.keyHash)??0)+1;buckets.set(input.keyHash,count);return {count,expiresAt:'2026-07-13T12:15:00.000Z'};}};
  const limiter=new RepositoryRequestRateLimiter(repository,'h'.repeat(32),{authRequests:5,writeRequests:5},()=> '2026-07-13T12:00:00.000Z');
  await limiter.check({routeName:'registerFirm',method:'POST',ipAddress:'198.51.100.20'});
  await limiter.check({routeName:'createObject',method:'POST',userId:'usr_private',ipAddress:'198.51.100.20'});
  await limiter.check({routeName:'createObject',method:'POST',userId:'usr_other',ipAddress:'198.51.100.20'});
  assert.equal(seen.length,3);assert.ok(seen.every(item=>/^[a-f0-9]{64}$/.test(item.keyHash)));
  assert.equal(JSON.stringify(seen).includes('198.51.100.20'),false);assert.equal(JSON.stringify(seen).includes('usr_private'),false);
  assert.notEqual(seen[0].keyHash,seen[1].keyHash);assert.notEqual(seen[1].keyHash,seen[2].keyHash);
  assert.deepEqual(seen.map(item=>item.scope),['auth','write','write']);
});

test('read-only workspace traffic is not application-rate-limited while sensitive categories are',async()=>{
  let calls=0;const repository={consumeRateLimitBucket(){calls+=1;return {count:1,expiresAt:'2026-07-13T12:01:00.000Z'};}};
  const limiter=new RepositoryRequestRateLimiter(repository,'r'.repeat(32),{},()=> '2026-07-13T12:00:00.000Z');
  assert.deepEqual(await limiter.check({routeName:'listObjects',method:'GET',userId:'usr_1'}),{limited:false});
  for(const input of [{routeName:'login',method:'POST'},{routeName:'assistantQuery',method:'POST',userId:'usr_1'},{routeName:'uploadFile',method:'POST',userId:'usr_1'},{routeName:'ingestWebhook',method:'POST'},{routeName:'createObject',method:'POST',userId:'usr_1'}])await limiter.check(input);
  assert.equal(calls,5);
});
