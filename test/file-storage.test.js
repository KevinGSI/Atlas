import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasFileService, InMemoryBlobStore, RepositoryBlobStore } from '../src/file-storage.js';
import { AtlasIngestionService } from '../src/ingestion.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';

async function fixture(options={}) {
  const repository=new InMemoryRepository();
  const atlas=new AtlasService(repository,()=> '2026-07-13T12:00:00.000Z');
  const workspace=await atlas.createWorkspace({name:'Files Firm'});
  const matter=await atlas.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Morgan v. Lake'});
  const blobStore=new InMemoryBlobStore();
  const files=new AtlasFileService(atlas,new AtlasIngestionService(repository,()=> '2026-07-13T12:00:00.000Z'),blobStore,options);
  return {repository,atlas,workspace,matter,files,blobStore};
}

test('Atlas uploads, hashes, catalogs, links, and retrieves a matter file',async()=>{
  const {repository,workspace,matter,files}=await fixture();
  const content=Buffer.from('%PDF-fictional discovery response');
  const uploaded=await files.upload(workspace.id,{matterId:matter.id,filename:'discovery.pdf',mediaType:'application/pdf',contentBase64:content.toString('base64')},'usr_attorney');
  assert.equal(uploaded.root.parentObjectId,matter.id);
  assert.equal(uploaded.root.state.size,content.length);
  assert.match(uploaded.root.state.sha256,/^[a-f0-9]{64}$/);
  assert.match(uploaded.root.state.storageRef,new RegExp(`^atlas-blob://${workspace.id}/`));
  assert.equal(uploaded.root.state.securityScan.status,'clean');
  assert.deepEqual(uploaded.root.state.provenance,{kind:'computer_upload',connector:'atlas-upload'});
  assert.equal((await repository.listIntelligenceJobs(workspace.id)).at(-1).triggerType,'attachment.received');
  const downloaded=await files.download(workspace.id,uploaded.root.id);
  assert.deepEqual(downloaded.content,content);
});

test('content-addressed storage deduplicates bytes while retaining canonical document events',async()=>{
  const {workspace,files}=await fixture();
  const input={filename:'notice.pdf',mediaType:'application/pdf',contentBase64:Buffer.from('%PDF-same').toString('base64')};
  const first=await files.upload(workspace.id,{...input,externalId:'one'},'usr_1');
  const second=await files.upload(workspace.id,{...input,externalId:'two'},'usr_1');
  assert.equal(first.root.state.storageRef,second.root.state.storageRef);
  assert.notEqual(first.root.id,second.root.id);
});

test('file boundaries reject unsafe types, malformed content, and oversized files before cataloging',async()=>{
  const {repository,workspace,files}=await fixture({maxBytes:4});
  await assert.rejects(()=>files.upload(workspace.id,{filename:'malware.exe',mediaType:'application/octet-stream',contentBase64:'YWJj'},'usr_1'),error=>error.code==='FILE_TYPE_NOT_ALLOWED');
  await assert.rejects(()=>files.upload(workspace.id,{filename:'bad.pdf',mediaType:'application/pdf',contentBase64:'***'},'usr_1'),error=>error.code==='FILE_INVALID');
  await assert.rejects(()=>files.upload(workspace.id,{filename:'large.pdf',mediaType:'application/pdf',contentBase64:Buffer.from('12345').toString('base64')},'usr_1'),error=>error.code==='FILE_TOO_LARGE');
  assert.equal((await repository.listObjects(workspace.id,{})).filter(item=>item.dimension==='document').length,0);
});

test('a scanner rejection occurs before file storage, cataloging, or native intelligence',async()=>{
  const scanner={async scan(){const error=new Error('scanner unavailable');error.code='FILE_SCANNER_UNAVAILABLE';throw error;}};
  const {repository,workspace,files,blobStore}=await fixture({fileSecurityScanner:scanner});
  const content=Buffer.from('%PDF-unaccepted');
  await assert.rejects(()=>files.upload(workspace.id,{filename:'unaccepted.pdf',mediaType:'application/pdf',contentBase64:content.toString('base64')},'usr_1'),(error)=>error.code==='FILE_SCANNER_UNAVAILABLE');
  assert.equal((await repository.listObjects(workspace.id,{})).filter(item=>item.dimension==='document').length,0);
  assert.equal((await repository.listIntelligenceJobs(workspace.id)).filter(item=>item.triggerType==='attachment.received').length,0);
  const sha256=(await import('node:crypto')).createHash('sha256').update(content).digest('hex');
  await assert.rejects(()=>blobStore.read(`atlas-blob://${workspace.id}/${sha256}`),(error)=>error.code==='FILE_NOT_FOUND');
});

test('a blocked malicious upload creates an append-only security event and a deduplicated attorney alert',async()=>{
  const {repository,atlas,workspace,files}=await fixture();
  const content=Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
  const input={filename:'danger.txt',mediaType:'text/plain',contentBase64:content.toString('base64')};
  await assert.rejects(()=>files.upload(workspace.id,input,'usr_attorney'),(error)=>error.code==='FILE_MALWARE_DETECTED');
  await assert.rejects(()=>files.upload(workspace.id,input,'usr_attorney'),(error)=>error.code==='FILE_MALWARE_DETECTED');
  assert.equal((await repository.listObjects(workspace.id,{dimension:'document'})).length,0);
  const events=await repository.listSecurityEvents(workspace.id);assert.equal(events.length,2);assert.ok(events.every(item=>item.type==='file.upload_blocked'&&item.outcome==='blocked'));
  assert.equal(JSON.stringify(events).includes('contentBase64'),false);assert.equal(JSON.stringify(events).includes('EICAR-STANDARD'),false);
  const alerts=await atlas.whileYouWereGone(workspace.id,'usr_attorney');assert.equal(alerts.length,1);assert.equal(alerts[0].category,'security_alert');assert.equal(alerts[0].priority,'urgent');assert.match(alerts[0].summary,/blocked before storage or cataloging/);
  assert.equal((await repository.listIntelligenceJobs(workspace.id)).filter(item=>item.triggerType==='file.security.blocked').length,1);
});

test('download rejects cross-firm and externally managed references',async()=>{
  const {atlas,workspace,files}=await fixture();
  const other=await atlas.createWorkspace({name:'Other Firm'});
  const uploaded=await files.upload(workspace.id,{filename:'private.pdf',mediaType:'application/pdf',contentBase64:Buffer.from('%PDF-private').toString('base64')},'usr_1');
  await assert.rejects(()=>files.download(other.id,uploaded.root.id),error=>error.code==='OBJECT_NOT_FOUND');
  const external=await atlas.createObject(workspace.id,{dimension:'document',type:'incoming_attachment',title:'external.pdf',state:{storageRef:'provider://file/1'}});
  await assert.rejects(()=>files.download(workspace.id,external.id),error=>error.code==='FILE_NOT_AVAILABLE');
});

test('repository blob storage is shared durable storage without provider lock-in',async()=>{const repository=new InMemoryRepository();const atlas=new AtlasService(repository);const workspace=await atlas.createWorkspace({name:'Shared Files'});const store=new RepositoryBlobStore(repository,()=> '2026-07-13T12:00:00.000Z');const content=Buffer.from('shared worker bytes');const sha256=(await import('node:crypto')).createHash('sha256').update(content).digest('hex');const reference=await store.write({workspaceId:workspace.id,sha256,content});assert.deepEqual(await store.read(reference),content);assert.equal((await repository.getDocumentBlob(workspace.id,sha256)).size,content.length);});
