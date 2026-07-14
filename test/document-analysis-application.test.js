import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { startApplicationIntelligenceWorker } from '../src/application.js';
import { InMemoryRepository } from '../src/repository.js';
import { InMemoryBlobStore } from '../src/file-storage.js';
import { AtlasIngestionService } from '../src/ingestion.js';
import { AtlasService } from '../src/service.js';
import { AtlasIntelligenceRuntime, DocumentIntelligenceProvider, IntelligenceProviderRegistry } from '../src/intelligence.js';
import { IntelligenceProjectionService } from '../src/intelligence-projection.js';

test('local Atlas runtime automatically reads, classifies, summarizes, and catalogs an uploaded document',async()=>{
  const repository=new InMemoryRepository();
  const blobStore=new InMemoryBlobStore();
  const model={
    async complete(){return {text:JSON.stringify({observations:[],actionProposals:[]})};},
    async analyzeFile({content,filename,instruction}){
      assert.equal(content.toString(),'PLAINTIFF RESPONSES TO INTERROGATORIES');
      assert.equal(filename,'discovery-responses.pdf');
      assert.match(instruction,/distinguish requests from responses/);
      return {
        documentAnalysis:{documentType:'discovery_response',summary:'The plaintiff answers written interrogatories and identifies the responding party.',confidence:.96,suggestedTitle:'Plaintiff Responses to Interrogatories',caseNumber:'2026-CV-44',court:'Superior Court',documentDate:'2026-07-14',parties:['Taylor Morgan','Lakeside Property Group'],attorneys:['Alex Counsel'],organizations:[],keyDates:[],requiresAttorneyReview:true},
        observations:[{kind:'classification',data:{documentType:'discovery_response'},confidence:.96,sourceLocation:{page:1}}],
        actionProposals:[],
        awareness:{category:'document_upload',priority:'normal',headline:'Discovery responses cataloged',summary:'Atlas summarized and cataloged the uploaded discovery responses.'},
        retrievalChunks:[]
      };
    }
  };
  const errors=[];
  const providers=new IntelligenceProviderRegistry().register('document-analysis',new DocumentIntelligenceProvider(model,blobStore));
  const intelligence=new AtlasIntelligenceRuntime(repository,providers,{projector:new IntelligenceProjectionService()});
  const worker=startApplicationIntelligenceWorker({intelligenceWorkerEnabled:true},intelligence,providers,{intelligencePollMs:5,onIntelligenceError:error=>errors.push(error)});
  try{
    const workspace=await new AtlasService(repository).createWorkspace({name:'Document Intelligence Firm'});
    const content=Buffer.from('PLAINTIFF RESPONSES TO INTERROGATORIES');
    const sha256=createHash('sha256').update(content).digest('hex');
    const storageRef=await blobStore.write({workspaceId:workspace.id,sha256,content});
    const uploaded=await new AtlasIngestionService(repository).ingestDocument(workspace.id,{connector:'atlas-upload',externalId:'document-analysis-e2e',filename:'discovery-responses.pdf',storageRef,sha256,mediaType:'application/pdf',size:content.length},'usr_attorney');
    let cataloged;
    for(let attempt=0;attempt<100;attempt+=1){
      cataloged=await repository.getObject(workspace.id,uploaded.root.id);
      if(cataloged.state.extractionStatus==='completed')break;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.equal(cataloged.state.extractionStatus,'completed');
    assert.equal(cataloged.state.documentType,'discovery_response');
    assert.match(cataloged.state.summary,/answers written interrogatories/);
    assert.equal(cataloged.state.documentAnalysis.caseNumber,'2026-CV-44');
    assert.equal(cataloged.state.documentAnalysis.status,'cataloged');
    assert.equal((await repository.listIntelligenceJobs(workspace.id))[0].status,'completed');
    assert.equal((await repository.listEvents(workspace.id,uploaded.root.id)).some(event=>event.type==='document.analyzed'),true);
    assert.equal(errors.length,0);
  } finally {
    worker.controller.abort();
    await worker.completion;
  }
});
