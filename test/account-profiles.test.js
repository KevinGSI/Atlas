import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { createAtlasHandler } from '../src/http.js';
import { IdentityService, TokenService } from '../src/identity.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';

async function json(handler,url,options={}){const request=Readable.from(options.body?[Buffer.from(options.body)]:[]);request.method=options.method??'GET';request.url=url;request.headers=options.headers??{};return new Promise((resolve,reject)=>{const response={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){resolve({status:this.status,body:JSON.parse(body),headers:this.headers});}};Promise.resolve(handler(request,response)).catch(reject);});}

test('firm and attorney profiles persist as canonical firm-isolated objects available to every case context',async()=>{
  const repository=new InMemoryRepository();
  const atlas=new AtlasService(repository,()=> '2026-07-14T22:00:00.000Z');
  const identity=new IdentityService(repository,new TokenService('p'.repeat(32)),()=> '2026-07-14T22:00:00.000Z');
  const registered=await identity.registerFirm({firmName:'Demo Firm',name:'Jordan Attorney',email:'jordan@example.test',password:'correct horse battery staple'});
  const matter=await atlas.createObject(registered.workspace.id,{dimension:'matter',type:'civil',title:'Demo Case'});
  const saved=await atlas.updateAccountProfiles(registered.workspace.id,registered.user,{firm:{displayName:'Jordan Legal',legalName:'Jordan Legal PLLC',generalEmail:'hello@jordan.example',phone:'555-0100',website:'https://jordan.example',city:'Orlando',state:'Florida',jurisdictions:['Florida'],practiceAreas:['Civil litigation']},attorney:{name:'Jordan Attorney',professionalEmail:'jordan@jordan.example',title:'Managing Attorney',barNumber:'FL-12345',barJurisdictions:['Florida'],practiceAreas:['Civil litigation'],signatureBlock:'Jordan Attorney\nJordan Legal'}},{canEditFirm:true,role:'owner'});
  assert.equal(saved.firm.type,'firm_profile');
  assert.equal(saved.attorney.type,'attorney_profile');
  assert.equal(saved.firm.state.displayName,'Jordan Legal');
  assert.equal(saved.attorney.state.userId,registered.user.id);
  assert.equal(saved.attorney.state.profileUpdatedAt,'2026-07-14T22:00:00.000Z');
  const context=await atlas.getCanonicalContext(registered.workspace.id,matter.id,registered.user.id);
  assert.ok(context.objects.some(item=>item.id===saved.firm.id));
  assert.ok(context.objects.some(item=>item.id===saved.attorney.id));
  assert.ok((await atlas.listEvents(registered.workspace.id,saved.firm.id)).some(item=>item.type==='object.created'));
});

test('account profile HTTP boundary lets professionals edit themselves but reserves firm information for owner or admin',async()=>{
  const repository=new InMemoryRepository();
  const identity=new IdentityService(repository,new TokenService('q'.repeat(32)));
  const atlas=new AtlasService(repository);
  const handler=createAtlasHandler(atlas,{identity,ready:async()=>true,config:{maxBodyBytes:1_048_576,corsOrigins:[]}});
  const owner=await identity.registerFirm({firmName:'Isolated Firm',name:'Firm Owner',email:'owner@example.test',password:'correct horse battery staple'});
  const member=await identity.register({name:'Firm Lawyer',email:'lawyer@example.test',password:'correct horse battery staple'});
  await identity.addMembership(owner.workspace.id,member.user.id,'attorney');
  const ownerHeaders={authorization:`Bearer ${owner.accessToken}`};
  const memberHeaders={authorization:`Bearer ${member.accessToken}`};
  const ownerSave=await json(handler,`/v1/workspaces/${owner.workspace.id}/account-profile`,{method:'PATCH',headers:ownerHeaders,body:JSON.stringify({firm:{displayName:'Saved Firm'},attorney:{name:'Firm Owner',title:'Partner'}})});
  assert.equal(ownerSave.status,200);
  assert.equal(ownerSave.body.data.canEditFirm,true);
  const denied=await json(handler,`/v1/workspaces/${owner.workspace.id}/account-profile`,{method:'PATCH',headers:memberHeaders,body:JSON.stringify({firm:{displayName:'Unauthorized Rename'}})});
  assert.equal(denied.status,403);
  const ownSave=await json(handler,`/v1/workspaces/${owner.workspace.id}/account-profile`,{method:'PATCH',headers:memberHeaders,body:JSON.stringify({attorney:{name:'Firm Lawyer',barNumber:'BAR-9'}})});
  assert.equal(ownSave.status,200);
  assert.equal(ownSave.body.data.attorney.state.userId,member.user.id);
  assert.equal(ownSave.body.data.firm.state.displayName,'Saved Firm');
  assert.equal(ownSave.body.data.canEditFirm,false);
});

test('Account Info exposes editable reusable firm and attorney fields backed by the authenticated profile endpoint',async()=>{
  const script=await readFile(new URL('../web/phase-one/app.js',import.meta.url),'utf8');
  assert.match(script,/Firm &amp; attorney information/);
  assert.match(script,/id="accountProfileEditor"/);
  assert.match(script,/My professional profile/);
  assert.match(script,/Firm profile/);
  assert.match(script,/Default signature block/);
  assert.match(script,/Bar jurisdictions/);
  assert.match(script,/function saveAccountProfiles\(event\)/);
  assert.match(script,/\/account-profile`/);
  assert.match(script,/Save firm & attorney information/);
  assert.match(script,/available throughout this firm’s Atlas workspace/);
});
