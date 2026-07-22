import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createAtlasHandler } from '../src/http.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';
import { DivorceDigitalService } from '../src/divorce-digital.js';
import { AtlasIngestionService } from '../src/ingestion.js';
import { AtlasFileService, InMemoryBlobStore } from '../src/file-storage.js';

async function json(handler,url,{method='GET',headers={},body}={}){const request=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);request.method=method;request.url=url;request.headers=headers;return new Promise((resolve,reject)=>{const response={writeHead(status,responseHeaders){this.status=status;this.headers=responseHeaders;},end(content){resolve({status:this.status,headers:this.headers,body:JSON.parse(String(content))});}};Promise.resolve(handler(request,response)).catch(reject);});}

test('public divorce HTTP adapter reaches the canonical Atlas service without firm-user authentication',async()=>{
  const repository=new InMemoryRepository();const atlas=new AtlasService(repository,()=> '2026-07-15T18:00:00.000Z');const workspace=await atlas.createWorkspace({name:'Florida’s Law Office'});const token='website-token-'.padEnd(40,'x');
  const files=new AtlasFileService(atlas,new AtlasIngestionService(repository),new InMemoryBlobStore());const divorceDigital=new DivorceDigitalService(atlas,repository,{files,connections:[{websiteId:'flo-divorce',workspaceId:workspace.id,targetUserId:'usr_attorney',token,timeZone:'America/New_York'}]});
  const handler=createAtlasHandler(atlas,{config:{maxBodyBytes:100_000,documentMaxBytes:1_000_000,corsOrigins:[]},divorceDigital});const authorization=`Bearer ${token}`;
  const lead=await json(handler,'/v1/public/websites/flo-divorce/divorce/demo-leads',{method:'POST',headers:{authorization},body:{name:'Portal Client',email:'client@example.com',phone:'8135550100',contactConsent:true,textConsent:true,consentVersion:'v1'}});
  assert.equal(lead.status,200);assert.ok(lead.body.data.sessionToken);assert.ok(lead.body.data.matterId);
  const saved=await json(handler,'/v1/public/websites/flo-divorce/divorce/workspace/sections/situation',{method:'PUT',headers:{authorization,'x-atlas-session':lead.body.data.sessionToken},body:{data:{county:'Hillsborough'}}});
  assert.equal(saved.status,200);assert.equal(saved.body.data.canonical,true);assert.equal(saved.body.data.matterId,lead.body.data.matterId);
  const document=await json(handler,'/v1/public/websites/flo-divorce/divorce/documents',{method:'POST',headers:{authorization,'x-atlas-session':lead.body.data.sessionToken,'idempotency-key':'http-petition-1'},body:{filename:'Petition.pdf',mediaType:'application/pdf',contentBase64:Buffer.from('%PDF-1.4\nfixture').toString('base64')}});assert.equal(document.status,200);assert.equal(document.body.data.analysisQueued,true);
  const documents=await json(handler,'/v1/public/websites/flo-divorce/divorce/documents',{headers:{authorization,'x-atlas-session':lead.body.data.sessionToken}});assert.equal(documents.status,200);assert.equal(documents.body.data.documents.length,1);
  const recommendations=await json(handler,'/v1/public/websites/flo-divorce/divorce/service-recommendations',{headers:{authorization,'x-atlas-session':lead.body.data.sessionToken}});assert.equal(recommendations.status,503);assert.equal(recommendations.body.error.code,'AI_PROVIDER_NOT_CONFIGURED');
  const smart=await json(handler,'/v1/public/websites/flo-divorce/divorce/smart-workspace',{headers:{authorization,'x-atlas-session':lead.body.data.sessionToken}});assert.equal(smart.status,200);assert.deepEqual(smart.body.data.services,[]);assert.equal(smart.body.data.liveStatusSource,'atlas_canonical_service_orders_and_tasks');
  const context=await atlas.getCanonicalContext(workspace.id,lead.body.data.matterId);assert.ok(context.objects.some(item=>item.type==='divorce_intake_section'));assert.ok(context.events.some(item=>item.type==='divorce.portal.section_saved'));
});

test('public divorce HTTP adapter rejects an invalid website token before creating firm data',async()=>{const repository=new InMemoryRepository();const atlas=new AtlasService(repository);const workspace=await atlas.createWorkspace({name:'Firm'});const divorceDigital=new DivorceDigitalService(atlas,repository,{connections:[{websiteId:'flo-divorce',workspaceId:workspace.id,targetUserId:'usr_attorney',token:'x'.repeat(40),timeZone:'America/New_York'}]});const handler=createAtlasHandler(atlas,{config:{maxBodyBytes:100_000,corsOrigins:[]},divorceDigital});const result=await json(handler,'/v1/public/websites/flo-divorce/divorce/demo-leads',{method:'POST',headers:{authorization:'Bearer forged'},body:{name:'No Access',email:'no@example.com',phone:'555',contactConsent:true}});assert.equal(result.status,401);assert.equal((await atlas.listObjects(workspace.id,{})).length,0);});
