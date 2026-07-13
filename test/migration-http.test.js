import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createAtlasHandler } from '../src/http.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';
import { CmsExportMigrationService } from '../src/migration-import.js';

async function json(handler,url,{method='GET',body}={}){const request=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);request.method=method;request.url=url;request.headers={};return new Promise((resolve,reject)=>{const response={writeHead(status){this.status=status;},end(content){resolve({status:this.status,body:JSON.parse(String(content))});}};Promise.resolve(handler(request,response)).catch(reject);});}

test('migration HTTP preview, import, and batch history use one canonical service',async()=>{const repository=new InMemoryRepository();const atlas=new AtlasService(repository);const workspace=await atlas.createWorkspace({name:'HTTP Migration Firm'});const migration=new CmsExportMigrationService(atlas);const handler=createAtlasHandler(atlas,{config:{maxBodyBytes:1024,migrationMaxBodyBytes:1_000_000,corsOrigins:[]},migration});const payload={provider:'clio',files:[{name:'matters.csv',content:'id,name\n1,Imported case\n'},{name:'tasks.csv',content:'id,title,matter_id\n2,Review file,1\n'}]};const preview=await json(handler,`/v1/workspaces/${workspace.id}/migration/preview`,{method:'POST',body:payload});assert.equal(preview.status,200);assert.equal(preview.body.data.totalRecords,2);assert.equal((await atlas.listObjects(workspace.id,{})).length,0);const imported=await json(handler,`/v1/workspaces/${workspace.id}/migration/imports`,{method:'POST',body:payload});assert.equal(imported.status,201);assert.equal(imported.body.data.state.created,2);const history=await json(handler,`/v1/workspaces/${workspace.id}/migration/imports`);assert.equal(history.body.data.length,1);const objects=await atlas.listObjects(workspace.id,{});const matter=objects.find(item=>item.dimension==='matter');assert.equal(objects.find(item=>item.type==='task').parentObjectId,matter.id);});
