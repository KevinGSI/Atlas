import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runMigrations } from '../src/migrations.js';
import { PostgresRepository } from '../src/postgres-repository.js';
import { AtlasService } from '../src/service.js';

const databaseUrl=process.env.TEST_DATABASE_URL;

test('live PostgreSQL applies every migration and persists an isolated Atlas workflow',{skip:!databaseUrl},async()=>{
  const pool=new pg.Pool({connectionString:databaseUrl,max:1});const client=await pool.connect();const schema=`atlas_test_${randomUUID().replaceAll('-','')}`;
  const executor={query:(sql,values)=>client.query(sql,values),connect:async()=>({query:(sql,values)=>client.query(sql,values),release(){}})};
  try{
    await client.query(`CREATE SCHEMA ${schema}`);await client.query(`SET search_path TO ${schema}`);
    const migrations=join(dirname(fileURLToPath(import.meta.url)),'..','db','migrations');const applied=await runMigrations(executor,migrations);assert.equal(applied.length,18);assert.equal((await runMigrations(executor,migrations)).length,0);
    const tables=await client.query("SELECT count(*)::int count FROM information_schema.tables WHERE table_schema=$1",[schema]);assert.equal(tables.rows[0].count,28);
    const repository=new PostgresRepository(executor);const clock=()=> '2026-07-10T12:00:00.000Z';await repository.createUser({id:'usr_live',email:'live-integration@atlas.invalid',name:'Live Integration User',passwordHash:'integration-test-only',createdAt:clock()});const service=new AtlasService(repository,clock);const workspace=await service.createWorkspace({name:'Live PostgreSQL Firm'},'usr_live');const matter=await service.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Live Database Matter'});assert.equal((await service.getObject(workspace.id,matter.id)).title,'Live Database Matter');
    const sourceEvent=await service.createEvent(workspace.id,{parentObjectId:matter.id,type:'live.awareness.source',actorId:'usr_live',source:'integration'});await repository.createIntelligenceJob({id:'inj_live_unique',workspaceId:workspace.id,triggerType:'live.awareness',objectId:matter.id,eventId:sourceEvent.id,status:'completed',attempts:1,payload:{},result:{},provider:'integration',errorCode:null,availableAt:clock(),lockedAt:clock(),createdAt:clock(),completedAt:clock()});
    await repository.createAwarenessItem({id:'awi_live',workspaceId:workspace.id,targetUserId:null,sourceJobId:'inj_live_unique',sourceObjectId:matter.id,category:'firm_activity',priority:'normal',headline:'Live database awareness',summary:'Persisted in PostgreSQL.',observationIds:[],actionProposalIds:[],createdAt:clock()});assert.equal((await service.whileYouWereGone(workspace.id,'usr_live'))[0].reviewStatus,'unseen');await service.updateAwarenessStatus(workspace.id,'awi_live','usr_live','reviewed');assert.equal((await service.whileYouWereGone(workspace.id,'usr_live'))[0].reviewStatus,'reviewed');
    await assert.rejects(()=>repository.transaction(async(transaction)=>{await transaction.createObject({id:'obj_rollback',workspaceId:workspace.id,parentObjectId:null,dimension:'operation',type:'task',title:'Must roll back',state:{},version:1,createdAt:clock(),updatedAt:clock(),deletedAt:null});throw new Error('forced rollback');}),/forced rollback/);assert.equal((await repository.listObjects(workspace.id,{})).some((item)=>item.id==='obj_rollback'),false);
    await assert.rejects(()=>repository.transaction(async(transaction)=>transaction.createObject({id:'obj_uncovered',workspaceId:workspace.id,parentObjectId:null,dimension:'operation',type:'task',title:'Uncovered',state:{},version:1,createdAt:clock(),updatedAt:clock(),deletedAt:null})),(error)=>error.code==='CANONICAL_EVENT_REQUIRED');assert.equal((await repository.listObjects(workspace.id,{})).some((item)=>item.id==='obj_uncovered'),false);
    const event=await service.createEvent(workspace.id,{parentObjectId:matter.id,type:'live.test',actorId:'usr_live',source:'integration'});const canonical=await client.query('SELECT correlation_id FROM atlas_canonical_event WHERE id=$1',[event.id]);assert.equal(canonical.rows[0].correlation_id,event.id);const links=await client.query('SELECT object_id FROM atlas_canonical_event_object WHERE event_id=$1',[event.id]);assert.deepEqual(links.rows.map((row)=>row.object_id),[matter.id]);await assert.rejects(()=>client.query('UPDATE atlas_timeline_event SET source=$1 WHERE id=$2',['tampered',event.id]));
  }finally{await client.query('RESET search_path').catch(()=>{});await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(()=>{});client.release();await pool.end();}
});
