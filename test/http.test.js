import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createAtlasHandler, requestContext } from '../src/http.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';
import { IdentityService, TokenService } from '../src/identity.js';
import { AtlasAssistant, AtlasToolRegistry } from '../src/assistant.js';
import { AtlasIngestionService } from '../src/ingestion.js';
import { FirmExportService } from '../src/firm-export.js';
import { AtlasError } from '../src/errors.js';

function fixture() {
  return createAtlasHandler(new AtlasService(new InMemoryRepository()), {
    config: { maxBodyBytes: 1_048_576, corsOrigins: ['https://atlas.example'] },
    ready: async () => true
  });
}

async function json(handler, url, options = {}) {
  const request = Readable.from(options.body ? [Buffer.from(options.body)] : []);
  request.method = options.method ?? 'GET';
  request.url = url;
  request.headers = options.headers ?? {};
  return new Promise((resolve, reject) => {
    const response = {
      writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(body) { resolve({ status: this.status, body: JSON.parse(body), headers: this.headers }); }
    };
    Promise.resolve(handler(request, response)).catch(reject);
  });
}

async function raw(handler,url){const request=Readable.from([]);request.method='GET';request.url=url;request.headers={};return new Promise((resolve,reject)=>{const response={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){resolve({status:this.status,headers:this.headers,body:Buffer.from(body).toString('utf8')});}};Promise.resolve(handler(request,response)).catch(reject);});}

test('client addresses trust the connected socket unless the deployment explicitly trusts its proxy',()=>{
  const request={headers:{'x-forwarded-for':'203.0.113.7, 10.0.0.1'},socket:{remoteAddress:'::ffff:127.0.0.1'}};
  assert.equal(requestContext(request,{trustProxy:false}).ipAddress,'127.0.0.1');
  assert.equal(requestContext(request,{trustProxy:true}).ipAddress,'203.0.113.7');
  assert.equal(requestContext({...request,headers:{'x-forwarded-for':'not-an-ip'}},{trustProxy:true}).ipAddress,'127.0.0.1');
});

test('HTTP rate-limit failures return a safe retry boundary without exposing the storage key',async()=>{
  let checked;
  const rateLimiter={async check(input){checked=input;throw new AtlasError('RATE_LIMITED','Too many requests',429,{scope:'auth',retryAfterSeconds:42});}};
  const handler=createAtlasHandler(new AtlasService(new InMemoryRepository()),{rateLimiter,config:{maxBodyBytes:1_048_576,corsOrigins:[],trustProxy:true}});
  const response=await json(handler,'/v1/auth/register-firm',{method:'POST',headers:{'x-forwarded-for':'198.51.100.44'},body:'{}'});
  assert.equal(response.status,429);assert.equal(response.headers['retry-after'],'42');assert.equal(response.body.error.code,'RATE_LIMITED');
  assert.deepEqual(response.body.error.details,{scope:'auth',retryAfterSeconds:42});
  assert.deepEqual(checked,{routeName:'registerFirm',method:'POST',userId:null,ipAddress:'198.51.100.44'});
  assert.equal(JSON.stringify(response.body).includes('198.51.100.44'),false);
});

test('serves the connected phase-one client from the application origin',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.equal(page.status,200);assert.match(page.headers['content-type'],/text\/html/);assert.match(page.body,/While You Were Gone/);assert.match(page.body,/continuously aware digital twin/);assert.match(page.body,/commandForm/);assert.match(page.body,/app-shell/);assert.match(page.body,/data-view="matters"/);assert.match(page.body,/data-view="communications"/);assert.doesNotMatch(page.body,/data-view="deadlines"/);assert.match(page.body,/data-matter-tab="deadlines"/);assert.match(page.body,/matterCount/);assert.match(page.body,/matterList/);assert.match(page.body,/onboardingForm/);assert.match(page.body,/matterForm/);assert.match(page.body,/collectionForm/);assert.match(page.body,/Canonical scope/);assert.match(page.body,/data-matter-tab="timeline"/);const script=await raw(handler,'/app.js');assert.match(script.headers['content-type'],/javascript/);assert.match(script.body,/authorization:`Bearer/);assert.match(script.body,/assistant\/query/);assert.match(script.body,/conversationId/);assert.match(script.body,/actionProposals/);assert.match(script.body,/assistant\/actions/);assert.match(script.body,/Approve draft/);assert.match(script.body,/intelligence\/observations/);assert.match(script.body,/Accept/);assert.match(script.body,/loadPilotData/);assert.match(script.body,/register-firm/);assert.match(script.body,/openMatter/);assert.match(script.body,/collectionConfigs/);assert.match(script.body,/Select the case that owns this legal work/);assert.match(script.body,/matters\/\$\{encodeURIComponent\(matter\.id\)\}\/health/);assert.match(script.body,/events\?parentObjectId/);});

test('serves a local visual template studio with editable wording and portable settings',async()=>{const handler=fixture();const page=await raw(handler,'/template-editor');assert.equal(page.status,200);assert.match(page.headers['content-type'],/text\/html/);assert.match(page.body,/Atlas Template Studio/);assert.match(page.body,/contenteditable="true"/);assert.match(page.body,/Save template/);assert.match(page.body,/Download JSON/);assert.match(page.body,/Import JSON/);assert.match(page.body,/Reset defaults/);assert.match(page.body,/First panel/);const script=await raw(handler,'/template-editor.js');assert.equal(script.status,200);assert.match(script.headers['content-type'],/javascript/);assert.match(script.body,/localStorage/);assert.match(script.body,/atlas-template-settings\.json/);assert.match(script.body,/panelOrder/);assert.match(script.body,/navigator\.clipboard/);});

test('frontend uses a versioned deferred script that executes in the local pilot browser',async()=>{const page=await raw(fixture(),'/');assert.match(page.body,/<span class="sr-only">Reply to Atlas or ask anything<\/span><textarea/);assert.match(page.body,/placeholder="Reply to Atlas or ask anything…"/);assert.match(page.body,/<script defer src="\.\/app\.js\?v=1\.0\.0-rc\.1-accounting-quickbooks-1"><\/script>/);});

test('Documents provides real secure upload and verified download controls',async()=>{const page=await raw(fixture(),'/');assert.match(page.body,/id="collectionFile" type="file"/);assert.match(page.body,/application\/pdf/);const script=await raw(fixture(),'/app.js');assert.match(script.body,/contentBase64/);assert.match(script.body,/\/files/);assert.match(script.body,/Download verified file/);assert.match(script.body,/\/content/);});

test('Accounting is a first-class canonical workspace with safe payment boundaries',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/data-view="accounting">Accounting/);assert.match(page.body,/id="view-accounting"/);assert.match(page.body,/Create invoice/);assert.match(page.body,/Record money received/);assert.match(page.body,/does not move the money/);assert.match(page.body,/Bank passwords, routing numbers, card numbers, and CVV values are never stored/);assert.match(page.body,/Legal-fee financing/);assert.match(page.body,/data-matter-tab="billing"/);const script=await raw(handler,'/app.js');assert.match(script.body,/accounting\/summary/);assert.match(script.body,/accounting\/providers/);assert.match(script.body,/accounting\/invoices/);assert.match(script.body,/accounting\/payments\/external/);assert.match(script.body,/loadAccounting/);});

test('Accounting exposes a read-only QuickBooks connection and canonical financial mirror',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/accounting-quickbooks-1/);const script=await raw(handler,'/app.js');assert.match(script.body,/QuickBooks Online/);assert.match(script.body,/Intuit’s secure consent screen/);assert.match(script.body,/cms\/quickbooks\/authorize/);assert.match(script.body,/quickBooksSync/);assert.match(script.body,/QuickBooks finances are mirrored read-only/);assert.match(script.body,/externalSource/);});

test('Accounting exposes non-custodial crypto receiving, invoicing, and blockchain confirmation controls',async()=>{const script=await raw(fixture(),'/app.js');assert.match(script.body,/Non-custodial digital assets/);assert.match(script.body,/Atlas never holds wallet keys, seed phrases, or client funds/);assert.match(script.body,/id="cryptoAccountForm"/);assert.match(script.body,/id="cryptoRequestForm"/);assert.match(script.body,/accounting\/crypto\/accounts/);assert.match(script.body,/accounting\/crypto\/invoice-requests/);assert.match(script.body,/accounting\/crypto\/confirmations/);assert.match(script.body,/Checking blockchain confirmations/);assert.match(script.body,/Firm-controlled wallet · Atlas custody: no/);});

test('Accounting creates Atlas-branded ACH and card links without raw credential fields',async()=>{const script=await raw(fixture(),'/app.js');assert.match(script.body,/Collect ACH or card payment/);assert.match(script.body,/id="checkoutForm"/);assert.match(script.body,/ACH bank payment/);assert.match(script.body,/Debit or credit card/);assert.match(script.body,/accounting\/payment-requests/);assert.match(script.body,/Open Atlas checkout/);assert.doesNotMatch(script.body,/id="(?:cardNumber|cvv|routingNumber|accountNumber)"/);});

test('Atlas serves its own branded secure checkout with processor-isolated fields',async()=>{const handler=fixture();const page=await raw(handler,'/pay');assert.equal(page.status,200);assert.match(page.body,/Pay your legal invoice securely/);assert.match(page.body,/This payment page belongs to your law firm’s Atlas workspace/);assert.match(page.body,/https:\/\/js\.stripe\.com\/clover\/stripe\.js/);assert.match(page.headers['content-security-policy'],/script-src 'self' https:\/\/js\.stripe\.com/);assert.doesNotMatch(page.body,/<input[^>]+(?:card|cvv|routing|account)/i);const script=await raw(handler,'/payment.js');assert.match(script.body,/initEmbeddedCheckout/);assert.match(script.body,/v1\/payments\/stripe\/checkout/);});

test('processor webhook is public only through its signed accounting boundary and preserves the raw body',async()=>{let received;const accounting={async processPaymentWebhook(provider,body,signature){received={provider,body,signature};return {received:true,paymentId:'obj_payment',duplicate:false};}};const handler=createAtlasHandler(new AtlasService(new InMemoryRepository()),{accounting,config:{maxBodyBytes:1_048_576,corsOrigins:[]}});const body='{ "exact": true }';const response=await json(handler,'/v1/payments/stripe/webhook',{method:'POST',headers:{'stripe-signature':'t=1,v1=signed'},body});assert.equal(response.status,200);assert.deepEqual(received,{provider:'stripe',body,signature:'t=1,v1=signed'});});

test('signed public checkout token returns only embedded checkout configuration',async()=>{let token;const accounting={async paymentCheckoutConfiguration(provider,value){token=value;return {publishableKey:'pk_test',clientSecret:'cs_secret',amountMinor:10000,currency:'USD'};}};const handler=createAtlasHandler(new AtlasService(new InMemoryRepository()),{accounting,config:{maxBodyBytes:1_048_576,corsOrigins:[]}});const response=await json(handler,'/v1/payments/stripe/checkout/signed-token');assert.equal(response.status,200);assert.equal(token,'signed-token');assert.equal(response.body.data.publishableKey,'pk_test');});

test('Phone Assistant is a connected canonical workspace with a safe fictional-call simulator',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/data-view="voice">Phone Assistant/);assert.match(page.body,/id="view-voice"/);assert.match(page.body,/never gives legal advice/);assert.match(page.body,/Test a fictional call/);const script=await raw(handler,'/app.js');assert.match(script.body,/voice-assistant\/configuration/);assert.match(script.body,/voice-assistant\/simulate\/start/);assert.match(script.body,/voice-assistant\/simulate\/turn/);assert.match(script.body,/loadVoiceAssistant/);});
test('lower sidebar services use the same icon treatment as primary navigation',async()=>{const page=await raw(fixture(),'/');assert.match(page.body,/\.nav button\[data-view="voice"\]:before\{content:'☎'\}/);assert.match(page.body,/\.nav button\[data-view="accounting"\]:before\{content:'\$'\}/);assert.match(page.body,/\.nav button\[data-view="migration"\]:before\{content:'⇄'\}/);});

test('Communications includes attorney-controlled social suggestions that enter While You Were Gone without publishing',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/data-view="communications">Communications/);assert.doesNotMatch(page.body,/<button[^>]+data-view="social"/);assert.match(page.body,/id="view-social"/);assert.match(page.body,/id="socialConfigurationForm"/);assert.match(page.body,/id="socialSuggestionForm"/);assert.match(page.body,/The suggestion will appear in While You Were Gone/);assert.match(page.body,/Atlas never asks for a social password/);assert.match(page.body,/Publishing remains disabled/);const script=await raw(handler,'/app.js');assert.match(script.body,/function renderSocial\(\)/);assert.match(script.body,/function loadSocial\(\)/);assert.match(script.body,/name==='communications'\)void loadSocial\(\)/);assert.match(script.body,/social\|social media\|linkedin\|facebook\|instagram\|posts.*'communications'/);assert.match(script.body,/social-media\/configuration/);assert.match(script.body,/social-media\/suggestions/);assert.match(script.body,/Social post draft/);assert.match(script.body,/nothing was published/i);});

test('social-media HTTP routes preserve read and write authorization boundaries',async()=>{const calls=[];const social={async status(workspaceId){calls.push(['status',workspaceId]);return {providers:[],configuration:null,drafts:[],pendingSuggestions:[]};},async configure(workspaceId,input,userId){calls.push(['configure',workspaceId,input,userId]);return {id:'obj_social'};},async suggest(workspaceId,input,userId){calls.push(['suggest',workspaceId,input,userId]);return {proposal:{id:'aap_social'}};}};const permissions=[];const identity={async authenticate(){return {id:'usr_attorney'};},async authorize(workspaceId,userId,permission){permissions.push([workspaceId,userId,permission]);}};const handler=createAtlasHandler(new AtlasService(new InMemoryRepository()),{social,identity,ready:async()=>true,config:{maxBodyBytes:1_048_576,corsOrigins:[]}});const headers={authorization:'Bearer test'};assert.equal((await json(handler,'/v1/workspaces/wsp_social/social-media',{headers})).status,200);assert.equal((await json(handler,'/v1/workspaces/wsp_social/social-media/configuration',{method:'POST',headers,body:JSON.stringify({enabled:true})})).status,200);assert.equal((await json(handler,'/v1/workspaces/wsp_social/social-media/suggestions',{method:'POST',headers,body:JSON.stringify({topic:'Legal education'})})).status,200);assert.deepEqual(permissions.map(item=>item[2]),['workspace:read','workspace:write','workspace:write']);assert.deepEqual(calls.map(item=>item[0]),['status','configure','suggest']);});

test('Communications includes the native text assistant, review drafts, and explicit send approval',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/data-view="communications">Communications/);const script=await raw(handler,'/app.js');assert.match(script.body,/Atlas call & text assistant/);assert.match(script.body,/communications\/sms\/configuration/);assert.match(script.body,/communications\/sms\/simulate/);assert.match(script.body,/communications\/sms\/drafts/);assert.match(script.body,/Approve and send text/);assert.match(script.body,/confirm:true/);assert.match(script.body,/sms_message/);});

test('Migration exposes provider coexistence and previewed export import',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/data-view="migration">Migration/);assert.match(page.body,/id="view-migration"/);assert.match(page.body,/Connect your current provider/);assert.match(page.body,/Preview migration/);assert.match(page.body,/Previewing never changes firm data/);const script=await raw(handler,'/app.js');assert.match(script.body,/migration\/preview/);assert.match(script.body,/migration\/imports/);assert.match(script.body,/cms\/connections/);assert.match(script.body,/selectedMigrationPayload/);});

test('Home uses the structurally distinct AI Command Center application template',async()=>{const page=await raw(fixture(),'/');assert.match(page.body,/class="view command-center"/);assert.match(page.body,/class="command-deck"/);assert.match(page.body,/AI Command Center/);assert.match(page.body,/Atlas Command/);assert.match(page.body,/Firm knowledge connected/);assert.match(page.body,/Canonical work synchronized/);assert.match(page.body,/Human approval enforced/);assert.match(page.body,/class="command-center-grid"/);assert.match(page.body,/class="card command command-console flowing-chat"/);assert.match(page.body,/Primary AI workspace/);assert.match(page.body,/class="command-rail"/);assert.match(page.body,/Firm pulse/);assert.match(page.body,/Approval queue/);assert.match(page.body,/class="card review-center"/);assert.match(page.body,/\.nav button\[data-view="workspace"\]:before\{content:'✦'\}/);assert.doesNotMatch(page.body,/Recent Activity/);});

test('What do you need exposes live twin computation and visibly cited public research',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/compute firm activity, research public sources/);assert.match(page.body,/Public research cited/);assert.match(page.body,/Research public law/);const script=await raw(handler,'/app.js');assert.match(script.body,/webSources/);assert.match(script.body,/Public web sources:/);assert.match(script.body,/Atlas records:/);assert.match(script.body,/target='_blank'|target='?_blank'?|target="_blank"/);assert.match(script.body,/noopener noreferrer/);assert.match(script.body,/\['http:','https:'\]/);});

test('command surfaces show only the current exchange while preserving saved conversation identity',async()=>{const script=await raw(fixture(),'/app.js');assert.match(script.body,/function clearVisibleExchange\(transcriptId\)\{byId\(transcriptId\)\.replaceChildren\(\);\}/);assert.match(script.body,/submitCommand\(prompt\).*clearVisibleExchange\('transcript'\)/s);assert.match(script.body,/submitWorkspaceCommand\(prompt\).*clearVisibleExchange\('workspaceAssistantTranscript'\)/s);assert.match(script.body,/submitTwinCommand\(prompt\).*clearVisibleExchange\('twinTranscript'\)/s);assert.match(script.body,/conversationId=result\.conversationId/);assert.match(script.body,/\.\.\.\(conversationId\?\{conversationId\}:\{\}\)/);});

test('browser session survives reload, rotates expired access, and revokes refresh credentials on sign out',async()=>{const script=await raw(fixture(),'/app.js');assert.match(script.body,/sessionStorageKey='atlas-authenticated-session-v1'/);assert.match(script.body,/function persistSession\(\)/);assert.match(script.body,/async function refreshSession\(\)/);assert.match(script.body,/refreshPromise/);assert.match(script.body,/\/v1\/auth\/refresh/);assert.match(script.body,/return request\(path,options,false\)/);assert.match(script.body,/async function restoreStoredSession\(\)/);assert.match(script.body,/async function signOut\(\)/);assert.match(script.body,/\/v1\/auth\/logout/);assert.match(script.body,/clearStoredSession\(\)/);});

test('Home and Workspace keep a reply composer directly beneath the latest exchange',async()=>{const page=await raw(fixture(),'/');assert.match(page.body,/id="transcript" class="transcript"[^>]*><\/div><div id="commandStatus"[^>]*><\/div><form id="commandForm" class="chat-composer"/);assert.match(page.body,/id="workspaceAssistantTranscript" class="transcript"[^>]*><\/div><div id="workspaceAssistantStatus"[^>]*><\/div><form id="workspaceAssistantForm" class="chat-composer"/);assert.match(page.body,/id="workspaceAssistantInput"[^>]*placeholder="Reply to Atlas or ask anything…"/);assert.match(page.body,/\.flowing-chat \.chat-composer\{order:4;position:sticky;bottom:0/);});

test('Enter submits every Atlas chat while Shift+Enter remains available for a new line',async()=>{const script=await raw(fixture(),'/app.js');assert.match(script.body,/function submitChatOnEnter\(inputId,formId\)/);assert.match(script.body,/event\.key==='Enter'&&!event\.shiftKey&&!event\.isComposing/);assert.match(script.body,/form\.requestSubmit\(\)/);assert.match(script.body,/submitChatOnEnter\('commandInput','commandForm'\)/);assert.match(script.body,/submitChatOnEnter\('workspaceAssistantInput','workspaceAssistantForm'\)/);assert.match(script.body,/submitChatOnEnter\('twinInput','twinForm'\)/);});

test('Attorney inbox is displayed before live canonical signals in the homepage rail',async()=>{const page=await raw(fixture(),'/');assert.match(page.body,/\.command-rail #reviewInbox\{order:-1\}/);});

test('homepage summary controls are recognizable buttons with relevant working destinations',async()=>{const handler=fixture();const page=await raw(handler,'/');for(const id of ['openCasesMetric','openTasksMetric','reviewDeadlinesMetric','openReviewMetric'])assert.match(page.body,new RegExp(`id="${id}"`));assert.match(page.body,/aria-label="Open all cases"/);assert.match(page.body,/View tasks/);assert.match(page.body,/aria-label="Ask Atlas to review deadlines"/);assert.match(page.body,/aria-label="Open items needing attorney review"/);assert.match(page.body,/id="reviewInbox"/);const script=await raw(handler,'/app.js');assert.match(script.body,/openCasesMetric.*showView\('matters'\)/);assert.match(script.body,/openTasksMetric.*showView\('tasks'\)/);assert.match(script.body,/reviewDeadlinesMetric.*routeHomeCommand\('Review every approaching or missed deadline/);assert.match(script.body,/openReviewMetric.*reviewInbox.*scrollIntoView/);});

test('homepage work queue shows canonical tasks deadlines and pending Atlas task suggestions',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/id="homeWorkQueue"/);assert.match(page.body,/Atlas Work Queue/);assert.match(page.body,/id="homeWorkList"/);const script=await raw(handler,'/app.js');assert.match(script.body,/function homeWorkItems\(\)/);assert.match(script.body,/\['task','deadline'\]\.includes\(item\.type\)/);assert.match(script.body,/action\.status==='pending'&&action\.actionType==='create_task'/);assert.match(script.body,/function renderHomeWorkQueue\(\)/);assert.match(script.body,/Atlas suggested task/);assert.match(script.body,/renderHomeWorkQueue\(\);await Promise\.all\(\[loadFeed\(\),loadFirmEvents\(\),loadConflictAlerts\(\)\]\)/);assert.match(script.body,/Discovery responses due/);});

test('Workspace unifies filterable lawyer work and the same native firm twin',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/data-view="dashboard">Home<\/button><button data-view="workspace">Workspace<\/button><button data-view="events">Events<\/button><button data-view="matters">Cases/);assert.match(page.body,/id="view-workspace"/);assert.match(page.body,/card command command-console flowing-chat workspace-command-console/);assert.match(page.body,/id="workspaceAssistantTitle">What do you need\?<\/h2><p>Navigate Atlas, ask a question, request work, calculate firm activity, or research the public web\.<\/p>/);assert.match(page.body,/data-workspace-prompt="What are the most important things I need to handle today\?">Prioritize today/);assert.match(page.body,/data-workspace-prompt="Summarize the ten most recently opened matters and identify client-contact gaps\.">Recent matters/);assert.match(page.body,/data-workspace-prompt="Find every motion to compel in the firm and summarize its status\.">Motions to compel/);assert.match(page.body,/data-workspace-prompt="Research the current public federal standard for discovery proportionality and cite the sources\.">Research public law/);assert.match(page.body,/id="workspaceAssistantForm"/);assert.match(page.body,/id="workspaceAssistantTranscript"/);assert.match(page.body,/id="workspaceSearch"/);assert.match(page.body,/id="workspaceFilter"/);assert.match(page.body,/AI drafts/);assert.match(page.body,/Needs review/);assert.match(page.body,/Everything in progress/);const script=await raw(handler,'/app.js');assert.match(script.body,/function submitWorkspaceCommand\(prompt\)/);assert.match(script.body,/workspaceAssistant.*assistant\/query/s);assert.match(script.body,/function workspaceEntries\(\)/);assert.match(script.body,/workspaceActions/);assert.match(script.body,/workspaceAwareness/);assert.match(script.body,/assistant\/actions/);assert.match(script.body,/function renderWorkspaceWork\(\)/);assert.match(script.body,/workspaceSearch.*renderWorkspaceWork/);assert.match(script.body,/name==='workspace'\?'Workspace'/);});

test('every rendered case reference uses the shared embedded case link',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/\.case-link\{/);const script=await raw(handler,'/app.js');assert.match(script.body,/function caseLink\(matter,label=matter\?\.title\)/);assert.match(script.body,/link\.dataset\.caseId=matter\.id/);assert.match(script.body,/void openMatter\(matter\)/);assert.match(script.body,/function appendCaseLinkedText\(container,value\)/);assert.match(script.body,/function casePill\(prefix,matter,fallback='Firm-wide'\)/);assert.match(script.body,/appendCaseLinkedText\(message\.querySelector\('div'\),text\)/);assert.match(script.body,/appendCaseLinkedText\(source,/);});
test('Events exposes the canonical firm timeline on Home and a searchable full feed',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/data-view="events">Events/);assert.match(page.body,/id="homeEvents"/);assert.match(page.body,/Recent Firm Events/);assert.match(page.body,/id="view-events"/);assert.match(page.body,/Firm Event Feed/);assert.doesNotMatch(page.body,/>Activities</);const script=await raw(handler,'/app.js');assert.match(script.body,/function renderFirmEvents\(\)/);assert.match(script.body,/function matterForEvent\(event\)/);assert.match(script.body,/function appendEventRow\(list,event\)/);assert.match(script.body,/\/events`\);renderFirmEvents/);assert.match(script.body,/Promise\.all\(\[loadFeed\(\),loadFirmEvents\(\),loadConflictAlerts\(\)\]\)/);assert.match(script.body,/if\(name==='events'\)renderFirmEvents\(\)/);assert.match(script.body,/viewAllEvents.*showView\('events'\)/);});
test('Home shows native firm-isolated conflict alerts for names found elsewhere in the twin',async()=>{const repository=new InMemoryRepository();const service=new AtlasService(repository);const workspace=await service.createWorkspace({name:'Conflict HTTP Firm'});await service.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Avery Reed v. Northline Holdings',state:{status:'open',parties:['Avery Reed','Northline Holdings']}});const second=await service.createObject(workspace.id,{dimension:'matter',type:'business',title:'Northline Holdings Contract Review',state:{status:'open',parties:['Northline Holdings']}});const handler=createAtlasHandler(service,{config:{maxBodyBytes:1_048_576,corsOrigins:[]}});const result=await json(handler,`/v1/workspaces/${workspace.id}/conflicts`);assert.equal(result.status,200);assert.ok(result.body.data.alerts.some(alert=>alert.matterId===second.id&&alert.partyName==='Northline Holdings'));const page=await raw(handler,'/');assert.match(page.body,/id="conflictAlerts"/);assert.match(page.body,/Native AI conflict screening/);assert.match(page.body,/Conflict Alerts/);assert.match(page.body,/Potential name matches require attorney review/);assert.match(page.body,/id="matterParties"/);const script=await raw(handler,'/app.js');assert.match(script.body,/function renderConflictAlerts\(\)/);assert.match(script.body,/function loadConflictAlerts\(\)/);assert.match(script.body,/\/conflicts/);assert.match(script.body,/function parsedMatterParties\(\)/);assert.match(script.body,/parties:parsedMatterParties\(\)/);assert.match(script.body,/caseLink\(related\)/);});

test('Home routes navigation directly and moves work requests into Workspace for execution',async()=>{const script=await raw(fixture(),'/app.js');assert.match(script.body,/function isWorkRequest\(query\)/);assert.match(script.body,/function routeHomeCommand\(prompt\)/);assert.match(script.body,/if\(isWorkRequest\(query\)\).*showView\('workspace'\);submitWorkspaceCommand\(text\)/s);assert.match(script.body,/requestedMatter\(text\)/);assert.match(script.body,/openMatter\(matter\)/);assert.match(script.body,/commandForm.*routeHomeCommand/s);assert.match(script.body,/data-prompt.*routeHomeCommand/s);assert.match(script.body,/case\|cases\|matter\|matters/);assert.match(script.body,/priority\|priorities\|task\|tasks\|deadline\|deadlines/);});

test('one-click local preview seeds a populated fictional case without manual forms',async()=>{const script=await raw(fixture(),'/app.js');assert.match(script.body,/seedDemoCase/);assert.match(script.body,/Morgan v\. Lakeside Property Group/);assert.match(script.body,/DEMO-2026-CV-101/);assert.match(script.body,/Taylor Morgan/);assert.match(script.body,/Initial Complaint/);assert.match(script.body,/Client intake call/);assert.match(script.body,/Review discovery plan/);assert.match(script.body,/Discovery responses due/);});

test('Settings is an accessible gear with connected firm member and invitation administration',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.doesNotMatch(page.body,/data-view="settings">Settings/);assert.match(page.body,/id="settingsButton"/);assert.match(page.body,/aria-label="Settings"/);assert.match(page.body,/>⚙<\/button><button id="signOut"/);assert.match(page.body,/id="view-settings"/);assert.match(page.body,/id="inviteMemberForm"/);assert.match(page.body,/Firm members/);assert.match(page.body,/Pending invitations/);const script=await raw(handler,'/app.js');assert.match(script.body,/settingsButton/);assert.match(script.body,/showView\('settings'\)/);assert.match(script.body,/function loadSettings\(\)/);assert.match(script.body,/\/invitations/);assert.match(script.body,/invitationTokenFromUrl/);});

test('Settings exposes authenticator MFA and firm-admin security response controls',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/id="loginMfaCode"/);const script=await raw(handler,'/app.js');assert.match(script.body,/Account protection/);assert.match(script.body,/Set up authenticator MFA/);assert.match(script.body,/Require MFA for this firm/);assert.match(script.body,/Deactivate firm access/);assert.match(script.body,/\/v1\/auth\/mfa\/enroll/);assert.match(script.body,/\/v1\/auth\/mfa\/confirm/);assert.match(script.body,/security\/events/);assert.match(script.body,/security\/sessions/);assert.match(script.body,/security\/policy/);assert.match(script.body,/memberships\/\$\{encodeURIComponent\(member\.userId\)\}/);assert.match(script.body,/FIRM_MFA_REQUIRED.*showView\('settings'\)/s);assert.match(script.body,/Complete account protection before opening firm work/);assert.match(script.body,/security\/sign-out-all/);assert.match(script.body,/SIGN OUT ALL/);});

test('Evidence is absent from the user-facing navigation and case workspace',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.doesNotMatch(page.body,/data-view="evidence"/);assert.doesNotMatch(page.body,/data-matter-tab="evidence"/);assert.doesNotMatch(page.body,/>Evidence<\/button>/);const script=await raw(handler,'/app.js');assert.doesNotMatch(script.body,/evidence:\{title:'Evidence'/);assert.match(script.body,/object\.dimension!==\'evidence\'/);});

test('the global twin starts as a compact Atlas launcher and can expand on every authenticated view',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/id="twinDock" class="twin-dock collapsed"/);assert.match(page.body,/id="twinForm"/);assert.match(page.body,/Ask Atlas from anywhere/);assert.match(page.body,/aria-label="Atlas digital twin"/);assert.match(page.body,/id="twinToggle"[^>]*aria-expanded="false"[^>]*aria-label="Open Atlas"/);assert.match(page.body,/twin-launcher-title">Atlas</);const script=await raw(handler,'/app.js');assert.match(script.body,/submitTwinCommand/);assert.match(script.body,/conversationId/);assert.match(script.body,/assistant\/query/);assert.match(script.body,/actionProposals/);assert.match(script.body,/function shouldShowTwinDock\(\)\{return true;\}/);assert.match(script.body,/!shouldShowTwinDock\(name\)/);assert.match(script.body,/collapsed\?'Open Atlas':'Close Atlas'/);});

test('homepage keeps a left sidebar and delegates historical activity questions to Atlas',async()=>{const page=await raw(fixture(),'/');assert.match(page.body,/@media\(max-width:800px\)\{\.app-shell\{grid-template-columns:190px/);assert.doesNotMatch(page.body,/Show activity since/);assert.doesNotMatch(page.body,/Recent Activity/);assert.doesNotMatch(page.body,/recentActivityList/);assert.doesNotMatch(page.body,/id="refresh"/);const script=await raw(fixture(),'/app.js');assert.doesNotMatch(script.body,/byId\('since'\)/);assert.doesNotMatch(script.body,/byId\('refresh'\)/);assert.doesNotMatch(script.body,/renderRecentActivity/);});

test('authenticated application fills the viewport without horizontal overflow',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/body\.atlas-authenticated>\.shell\{width:100%;max-width:none;margin:0;padding:0\}/);assert.match(page.body,/body\.atlas-authenticated>\.shell>\.brand\{display:none\}/);assert.match(page.body,/body\.atlas-authenticated \.sidebar\{height:100vh;height:100dvh;overflow:hidden\}/);assert.match(page.body,/body\.atlas-authenticated \.sidebar \.nav\{flex:1;min-height:0;overflow-y:auto/);assert.match(page.body,/body\.atlas-authenticated \.sidebar-foot\{flex:0 0 auto/);assert.match(page.body,/\.workspace,\.workspace main,\.view,\.card,\.proposal,\.object-card,\.rail-panel\{min-width:0;max-width:100%\}/);assert.match(page.body,/\.command-center-grid \.command-console\{min-height:0\}/);assert.match(page.body,/\.transcript:empty\{display:none;min-height:0;margin:0\}/);assert.match(page.body,/@media\(max-width:900px\)/);assert.match(page.body,/app\.js\?v=1\.0\.0-rc\.1-accounting-quickbooks-1/);const script=await raw(handler,'/app.js');assert.match(script.body,/enterWorkspace\(\)\{document\.body\.classList\.add\('atlas-authenticated'\)/);assert.match(script.body,/resetSignedOutUi\(\)\{document\.body\.classList\.remove\('atlas-authenticated'\)/);});

test('sidebar presents Cases then Email then Calendar with production OAuth and a fictional local fallback',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/data-view="matters">Cases<\/button><button data-view="email">Email<\/button><button data-view="calendar">Calendar/);assert.match(page.body,/Connect Google Workspace/);assert.match(page.body,/Connect Microsoft 365/);assert.match(page.body,/never asks for or stores the mailbox password/);assert.match(page.body,/id="emailConnections"/);const script=await raw(handler,'/app.js');assert.match(script.body,/connectEmailProvider/);assert.match(script.body,/cms\/providers/);assert.match(script.body,/cms\/connections/);assert.match(script.body,/cms\/\$\{encodeURIComponent\(provider\)\}\/authorize/);assert.match(script.body,/Sync now/);assert.match(script.body,/connectDemoEmail/);assert.match(script.body,/`demo-\$\{provider\}`/);assert.match(script.body,/ingestions\/email/);});

test('connector discovery is authenticated and OAuth callback preserves provider company context without exposing credentials',async()=>{let completion;const cms={listProviders(){return [{name:'google',capabilities:{readOnly:true,resources:['email','calendar']}}];},async completeAuthorization(input){completion=input;return {id:'cms_mail',provider:'google',status:'connected',accessMode:'read_only'};}};const identity={async authenticate(){return {id:'usr_mail'};},async authorize(){}};const handler=createAtlasHandler(new AtlasService(new InMemoryRepository()),{config:{maxBodyBytes:1_048_576,corsOrigins:[]},ready:async()=>true,identity,cms});const providers=await json(handler,'/v1/workspaces/wsp_mail/cms/providers',{headers:{authorization:'Bearer test'}});assert.equal(providers.status,200);assert.equal(providers.body.data[0].name,'google');const callback=await raw(handler,'/v1/cms/oauth/callback?state=state&code=code&realmId=company-7');assert.equal(callback.status,200);assert.equal(completion.realmId,'company-7');assert.match(callback.headers['content-type'],/text\/html/);assert.match(callback.body,/Connection complete/);assert.doesNotMatch(callback.body,/access_token|refresh_token|credentialRef/);});

test('Tasks follows Calendar and shares the homepage queue of tasks deadlines and Atlas suggestions',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/data-view="calendar">Calendar<\/button><button data-view="tasks">Tasks<\/button><button data-view="clients">Clients/);const script=await raw(handler,'/app.js');assert.match(script.body,/tasks:\{title:'Tasks'/);assert.match(script.body,/if\(name==='tasks'\)\{const items=homeWorkItems\(\)/);assert.match(script.body,/items\.forEach\(item=>appendWorkQueueItem\(list,item\)\)/);assert.match(script.body,/open canonical task, case deadline, or pending Atlas task suggestion/);});

test('local preview offers a fictional one-click firm without requesting real information',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/Open fictional demo firm/);assert.match(page.body,/No real information is needed/);const script=await raw(handler,'/app.js');assert.match(script.body,/Atlas Demo Law/);assert.match(script.body,/Demo Attorney/);assert.match(script.body,/fictional-demo-password-only/);});

test('firm onboarding atomically creates the owner subscription and authenticated workspace',async()=>{
  const repository=new InMemoryRepository();const service=new AtlasService(repository);const identity=new IdentityService(repository,new TokenService('a'.repeat(32)));const handler=createAtlasHandler(service,{identity,config:{maxBodyBytes:1_048_576,corsOrigins:[]},ready:async()=>true});
  const created=await json(handler,'/v1/auth/register-firm',{method:'POST',body:JSON.stringify({firmName:'New Law Firm',name:'First Owner',email:'owner@newfirm.test',password:'correct horse battery staple'})});
  assert.equal(created.status,201);assert.equal(created.body.data.workspace.name,'New Law Firm');assert.equal(created.body.data.subscription.status,'trialing');assert.equal(created.body.data.subscription.seatLimit,10);
  const {workspace,accessToken}=created.body.data;const headers={authorization:`Bearer ${accessToken}`};
  const subscription=await json(handler,`/v1/workspaces/${workspace.id}/subscription`,{headers});
  assert.equal(subscription.status,200);assert.equal(subscription.body.data.workspaceId,workspace.id);
  const firms=await json(handler,'/v1/me/workspaces',{headers});assert.equal(firms.status,200);assert.deepEqual(firms.body.data.map(item=>item.workspace.id),[workspace.id]);assert.equal(firms.body.data[0].role,'owner');
  const members=await json(handler,`/v1/workspaces/${workspace.id}/memberships`,{headers});
  assert.equal(members.body.data.length,1);assert.equal(members.body.data[0].role,'owner');
});

test('firm owner creates a one-time professional invitation that onboards an isolated team member',async()=>{const repository=new InMemoryRepository();const service=new AtlasService(repository);const identity=new IdentityService(repository,new TokenService('i'.repeat(32)));const handler=createAtlasHandler(service,{identity,config:{maxBodyBytes:1_048_576,corsOrigins:[]},ready:async()=>true});const owner=(await json(handler,'/v1/auth/register-firm',{method:'POST',body:JSON.stringify({firmName:'Invite Firm',name:'Owner',email:'owner@invite-http.test',password:'correct horse battery staple'})})).body.data;const headers={authorization:`Bearer ${owner.accessToken}`};const invited=await json(handler,`/v1/workspaces/${owner.workspace.id}/invitations`,{method:'POST',headers,body:JSON.stringify({email:'attorney@invite-http.test',role:'attorney'})});assert.equal(invited.status,201);assert.ok(invited.body.data.invitationToken);assert.equal('tokenHash' in invited.body.data,false);const accepted=await json(handler,'/v1/auth/invitations/accept',{method:'POST',body:JSON.stringify({invitationToken:invited.body.data.invitationToken,name:'Invited Attorney',password:'correct horse battery staple'})});assert.equal(accepted.status,200);assert.equal(accepted.body.data.membership.role,'attorney');assert.equal(accepted.body.data.workspace.id,owner.workspace.id);const members=await json(handler,`/v1/workspaces/${owner.workspace.id}/memberships`,{headers});assert.equal(members.body.data.length,2);assert.equal(members.body.data.find(item=>item.role==='attorney').user.email,'attorney@invite-http.test');const invitations=await json(handler,`/v1/workspaces/${owner.workspace.id}/invitations`,{headers});assert.equal(invitations.body.data[0].status,'accepted');assert.equal('invitationToken' in invitations.body.data[0],false);});

test('launch pilot journey enters the firm and creates matter-scoped daily work',async()=>{
  const repository=new InMemoryRepository();const service=new AtlasService(repository);const identity=new IdentityService(repository,new TokenService('b'.repeat(32)));const handler=createAtlasHandler(service,{identity,config:{maxBodyBytes:1_048_576,corsOrigins:[]},ready:async()=>true});
  const signup=(await json(handler,'/v1/auth/register-firm',{method:'POST',body:JSON.stringify({firmName:'Pilot Firm',name:'Pilot Owner',email:'pilot@firm.test',password:'correct horse battery staple'})})).body.data;const headers={authorization:`Bearer ${signup.accessToken}`};const workspaceId=signup.workspace.id;
  const matter=(await json(handler,`/v1/workspaces/${workspaceId}/objects`,{method:'POST',headers,body:JSON.stringify({dimension:'matter',type:'civil',title:'Reed v. Northline',state:{caseNumber:'2026-CV-104',status:'open'}})})).body.data;
  for(const input of [{dimension:'client',type:'client',title:'Jordan Reed'},{dimension:'document',type:'document',title:'Initial disclosures'},{dimension:'evidence',type:'evidence',title:'Body camera'},{dimension:'operation',type:'communication',title:'Client status call'},{dimension:'operation',type:'task',title:'Review production'},{dimension:'operation',type:'deadline',title:'Discovery due'}]){const response=await json(handler,`/v1/workspaces/${workspaceId}/objects`,{method:'POST',headers,body:JSON.stringify({...input,parentObjectId:matter.id,state:{scope:'matter',matterId:matter.id,status:'open'}})});assert.equal(response.status,201);assert.equal(response.body.data.parentObjectId,matter.id);}
  const objects=(await json(handler,`/v1/workspaces/${workspaceId}/objects`,{headers})).body.data;assert.equal(objects.length,7);assert.equal(objects.filter(item=>item.parentObjectId===matter.id).length,6);
  const health=await json(handler,`/v1/workspaces/${workspaceId}/matters/${matter.id}/health`,{headers});assert.equal(health.status,200);assert.equal(typeof health.body.data.score,'number');
});

test('health endpoint reports the running release', async () => {
  const response = await json(fixture(), '/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { data: { status: 'ok', version: '1.0.0-rc.1' } });
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.match(response.headers['permissions-policy'],/camera=\(\)/);
  assert.equal(response.headers['cross-origin-opener-policy'],'same-origin');
});

test('authenticated security endpoints expose MFA status and firm-admin session controls',async()=>{const repository=new InMemoryRepository();const service=new AtlasService(repository);const identity=new IdentityService(repository,new TokenService('a'.repeat(32)));const handler=createAtlasHandler(service,{identity,config:{maxBodyBytes:1_048_576,corsOrigins:[]},ready:async()=>true});const created=await json(handler,'/v1/auth/register-firm',{method:'POST',body:JSON.stringify({firmName:'Security Firm',name:'Security Owner',email:'owner@security.test',password:'correct horse battery staple'})});const {workspace,accessToken}=created.body.data;const headers={authorization:`Bearer ${accessToken}`};const status=await json(handler,'/v1/auth/mfa',{headers});assert.equal(status.status,200);assert.deepEqual(status.body.data,{enabled:false,pending:false});const sessions=await json(handler,`/v1/workspaces/${workspace.id}/security/sessions`,{headers});assert.equal(sessions.status,200);assert.equal(sessions.body.data[0].user.email,'owner@security.test');const revoked=await json(handler,`/v1/workspaces/${workspace.id}/security/sign-out-all`,{method:'POST',headers,body:'{}'});assert.equal(revoked.status,200);assert.equal(revoked.body.data.revoked,true);const denied=await json(handler,`/v1/workspaces/${workspace.id}/security/sessions`,{headers});assert.equal(denied.status,401);});

test('firm administrators manage MFA policy and reversible member access over HTTP',async()=>{const repository=new InMemoryRepository();const service=new AtlasService(repository);const identity=new IdentityService(repository,new TokenService('q'.repeat(32)));const handler=createAtlasHandler(service,{identity,config:{maxBodyBytes:1_048_576,corsOrigins:[]},ready:async()=>true});const owner=(await json(handler,'/v1/auth/register-firm',{method:'POST',body:JSON.stringify({firmName:'Access Control Firm',name:'Owner',email:'owner@access-http.test',password:'correct horse battery staple'})})).body.data;const member=await identity.register({name:'Paralegal',email:'paralegal@access-http.test',password:'correct horse battery staple'});await identity.addMembership(owner.workspace.id,member.user.id,'paralegal');const ownerHeaders={authorization:`Bearer ${owner.accessToken}`};const memberHeaders={authorization:`Bearer ${member.accessToken}`};const policy=await json(handler,`/v1/workspaces/${owner.workspace.id}/security/policy`,{headers:ownerHeaders});assert.equal(policy.body.data.requireMfa,false);const saved=await json(handler,`/v1/workspaces/${owner.workspace.id}/security/policy`,{method:'PATCH',headers:ownerHeaders,body:JSON.stringify({requireMfa:false})});assert.equal(saved.status,200);const deactivated=await json(handler,`/v1/workspaces/${owner.workspace.id}/memberships/${member.user.id}/deactivate`,{method:'POST',headers:ownerHeaders,body:JSON.stringify({reason:'Offboarded'})});assert.equal(deactivated.body.data.active,false);const denied=await json(handler,`/v1/workspaces/${owner.workspace.id}`,{headers:memberHeaders});assert.equal(denied.status,403);assert.equal(denied.body.error.code,'MEMBERSHIP_DEACTIVATED');const restored=await json(handler,`/v1/workspaces/${owner.workspace.id}/memberships/${member.user.id}/reactivate`,{method:'POST',headers:ownerHeaders,body:'{}'});assert.equal(restored.body.data.active,true);assert.equal((await json(handler,`/v1/workspaces/${owner.workspace.id}`,{headers:memberHeaders})).status,200);});

test('firm owner creates a confirmed integrity-manifest export while ordinary members are denied',async()=>{const repository=new InMemoryRepository();const service=new AtlasService(repository);const identity=new IdentityService(repository,new TokenService('x'.repeat(32)));const firmExport=new FirmExportService(repository,()=> '2026-07-13T12:00:00.000Z');const handler=createAtlasHandler(service,{identity,firmExport,config:{maxBodyBytes:1_048_576,corsOrigins:[]},ready:async()=>true});const owner=(await json(handler,'/v1/auth/register-firm',{method:'POST',body:JSON.stringify({firmName:'Portable Firm',name:'Owner',email:'owner@portable.test',password:'correct horse battery staple'})})).body.data;await service.createObject(owner.workspace.id,{dimension:'matter',type:'civil',title:'Portable Case',actorId:owner.user.id});const ownerHeaders={authorization:`Bearer ${owner.accessToken}`};const unconfirmed=await json(handler,`/v1/workspaces/${owner.workspace.id}/exports`,{method:'POST',headers:ownerHeaders,body:'{}'});assert.equal(unconfirmed.body.error.code,'FIRM_EXPORT_CONFIRMATION_REQUIRED');const exported=await json(handler,`/v1/workspaces/${owner.workspace.id}/exports`,{method:'POST',headers:ownerHeaders,body:JSON.stringify({confirmation:'EXPORT FIRM DATA'})});assert.equal(exported.status,201);assert.equal(exported.body.data.manifest.counts.objects,1);assert.equal(exported.body.data.data.members[0].user.email,'owner@portable.test');assert.equal((await repository.listSecurityEvents(owner.workspace.id)).some(event=>event.type==='firm.export_created'),true);const member=await identity.register({name:'Member',email:'member@portable.test',password:'correct horse battery staple'});await identity.addMembership(owner.workspace.id,member.user.id,'member');const denied=await json(handler,`/v1/workspaces/${owner.workspace.id}/exports`,{method:'POST',headers:{authorization:`Bearer ${member.accessToken}`},body:JSON.stringify({confirmation:'EXPORT FIRM DATA'})});assert.equal(denied.status,403);});

test('readiness returns 503 when its dependency fails', async () => {
  const handler = createAtlasHandler(new AtlasService(new InMemoryRepository()), {
    config: { maxBodyBytes: 100, corsOrigins: [] },
    ready: async () => { throw new Error('database unavailable'); }
  });
  const response = await json(handler, '/ready');
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'NOT_READY');
});

test('readiness identifies the unavailable file-security dependency without exposing its host',async()=>{
  const handler=createAtlasHandler(new AtlasService(new InMemoryRepository()),{config:{maxBodyBytes:100,corsOrigins:[]},ready:async()=>{throw new AtlasError('FILE_SCANNER_UNAVAILABLE','Malware scanner readiness check failed',503,{provider:'clamav'});}});
  const response=await json(handler,'/ready');
  assert.equal(response.status,503);
  assert.equal(response.body.error.code,'FILE_SCANNER_UNAVAILABLE');
  assert.deepEqual(response.body.error.details,{provider:'clamav'});
  assert.equal(JSON.stringify(response.body).includes('hostname'),false);
});

test('rejects oversized JSON bodies', async () => {
  const handler = createAtlasHandler(new AtlasService(new InMemoryRepository()), {
    config: { maxBodyBytes: 10, corsOrigins: [] }, ready: async () => true
  });
  const response = await json(handler, '/v1/workspaces', { method: 'POST', body: JSON.stringify({ name: 'far too large' }) });
  assert.equal(response.status, 413);
  assert.equal(response.body.error.code, 'PAYLOAD_TOO_LARGE');
});

test('allows configured CORS origins and rejects others', async () => {
  const allowed = await json(fixture(), '/health', { headers: { origin: 'https://atlas.example' } });
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://atlas.example');
  const denied = await json(fixture(), '/health', { headers: { origin: 'https://evil.example' } });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'CORS_ORIGIN_DENIED');
  const sameOrigin=await json(fixture(),'/health',{headers:{origin:'http://127.0.0.1:3000',host:'127.0.0.1:3000'}});
  assert.equal(sameOrigin.status,200);
  assert.equal(sameOrigin.headers['access-control-allow-origin'],'http://127.0.0.1:3000');
  const hostMismatch=await json(fixture(),'/health',{headers:{origin:'http://localhost:3000',host:'127.0.0.1:3000'}});assert.equal(hostMismatch.status,403);
  const schemeMismatch=await json(fixture(),'/health',{headers:{origin:'https://127.0.0.1:3000',host:'127.0.0.1:3000'}});assert.equal(schemeMismatch.status,403);
});

test('HTTP vertical slice creates workspace, matter, evidence, graph, timeline, and health', async () => {
    const handler = fixture();
    const workspaceResponse = await json(handler, '/v1/workspaces', { method: 'POST', body: JSON.stringify({ name: 'Atlas Test' }) });
    assert.equal(workspaceResponse.status, 201);
    const workspaceId = workspaceResponse.body.data.id;
    const createObject = (body) => json(handler, `/v1/workspaces/${workspaceId}/objects`, { method: 'POST', body: JSON.stringify(body) });
    const matter = (await createObject({ dimension: 'matter', type: 'criminal', title: 'State v. Atlas' })).body.data;
    const evidence = (await createObject({ dimension: 'evidence', type: 'video', title: 'Body camera' })).body.data;
    const relation = await json(handler, `/v1/workspaces/${workspaceId}/relationships`, { method: 'POST', body: JSON.stringify({ fromObjectId: evidence.id, toObjectId: matter.id, type: 'supports' }) });
    assert.equal(relation.status, 201);
    const graph = await json(handler, `/v1/workspaces/${workspaceId}/objects/${matter.id}/graph`);
    assert.equal(graph.body.data.nodes[0].id, evidence.id);
    const timeline = await json(handler, `/v1/workspaces/${workspaceId}/events?parentObjectId=${matter.id}`);
    assert.equal(timeline.body.data[0].type, 'object.created');
    const health = await json(handler, `/v1/workspaces/${workspaceId}/matters/${matter.id}/health`);
    assert.equal(health.body.data.score, 65);
});

test('platform exposes the shared native intelligence review inbox',async()=>{
  const handler=fixture();const workspace=(await json(handler,'/v1/workspaces',{method:'POST',body:JSON.stringify({name:'Review Firm'})})).body.data;
  const response=await json(handler,`/v1/workspaces/${workspace.id}/intelligence/review-inbox`);
  assert.equal(response.status,200);assert.deepEqual(response.body.data.counts,{observations:0,actions:0,failures:0});
});

test('HTTP errors have stable structured responses', async () => {
    const handler = fixture();
    const missing = await json(handler, '/v1/workspaces/wsp_missing');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'WORKSPACE_NOT_FOUND');
    const invalid = await json(handler, '/v1/workspaces', { method: 'POST', body: '{' });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, 'INVALID_JSON');
});

test('authenticated HTTP flow enforces workspace roles', async () => {
  const repository = new InMemoryRepository();
  const service = new AtlasService(repository);
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)));
  const handler = createAtlasHandler(service, {
    config: { maxBodyBytes: 1_048_576, corsOrigins: [] }, ready: async () => true, identity
  });
  const register = (email, name) => json(handler, '/v1/auth/register', {
    method: 'POST', body: JSON.stringify({ email, name, password: 'correct horse battery staple' })
  });
  const owner = (await register('owner@example.com', 'Owner')).body.data;
  const viewer = (await register('viewer@example.com', 'Viewer')).body.data;
  const bearer = (token) => ({ authorization: `Bearer ${token}` });
  const workspaceResponse = await json(handler, '/v1/workspaces', {
    method: 'POST', headers: bearer(owner.accessToken), body: JSON.stringify({ name: 'Protected Firm' })
  });
  assert.equal(workspaceResponse.status, 201);
  const workspaceId = workspaceResponse.body.data.id;
  const addViewer = await json(handler, `/v1/workspaces/${workspaceId}/memberships`, {
    method: 'POST', headers: bearer(owner.accessToken), body: JSON.stringify({ userId: viewer.user.id, role: 'viewer' })
  });
  assert.equal(addViewer.status, 201);
  const deniedWrite = await json(handler, `/v1/workspaces/${workspaceId}/objects`, {
    method: 'POST', headers: bearer(viewer.accessToken), body: JSON.stringify({ dimension: 'matter', type: 'civil', title: 'Denied' })
  });
  assert.equal(deniedWrite.status, 403);
  assert.equal(deniedWrite.body.error.code, 'ACCESS_DENIED');
  const allowedRead = await json(handler, `/v1/workspaces/${workspaceId}/objects`, { headers: bearer(viewer.accessToken) });
  assert.equal(allowedRead.status, 200);
  const created = await json(handler, `/v1/workspaces/${workspaceId}/objects`, {
    method: 'POST', headers: bearer(owner.accessToken), body: JSON.stringify({ dimension: 'matter', type: 'civil', title: 'Versioned matter' })
  });
  const objectId = created.body.data.id;
  const updated = await json(handler, `/v1/workspaces/${workspaceId}/objects/${objectId}`, {
    method: 'PATCH', headers: bearer(owner.accessToken), body: JSON.stringify({ version: 1, title: 'Updated matter' })
  });
  assert.equal(updated.body.data.version, 2);
  const stale = await json(handler, `/v1/workspaces/${workspaceId}/objects/${objectId}`, {
    method: 'PATCH', headers: bearer(owner.accessToken), body: JSON.stringify({ version: 1, title: 'Stale update' })
  });
  assert.equal(stale.status, 409);
  const deleted = await json(handler, `/v1/workspaces/${workspaceId}/objects/${objectId}`, {
    method: 'DELETE', headers: bearer(owner.accessToken), body: JSON.stringify({ version: 2 })
  });
  assert.equal(deleted.body.data.version, 3);
  const restored = await json(handler, `/v1/workspaces/${workspaceId}/objects/${objectId}/restore`, {
    method: 'POST', headers: bearer(owner.accessToken), body: JSON.stringify({ version: 3 })
  });
  assert.equal(restored.body.data.version, 4);
  const audits = await json(handler, `/v1/workspaces/${workspaceId}/audit?objectId=${objectId}`, { headers: bearer(owner.accessToken) });
  assert.deepEqual(audits.body.data.map((entry) => entry.action), ['object.updated', 'object.deleted', 'object.restored']);
  const missingToken = await json(handler, `/v1/workspaces/${workspaceId}`);
  assert.equal(missingToken.status, 401);
  assert.equal(missingToken.body.error.code, 'AUTHENTICATION_REQUIRED');
});

test('authenticated homepage loads and reviews attorney awareness through HTTP',async()=>{
  const repository=new InMemoryRepository();const service=new AtlasService(repository);const identity=new IdentityService(repository,new TokenService('a'.repeat(32)));const handler=createAtlasHandler(service,{config:{maxBodyBytes:1_048_576,corsOrigins:[]},ready:async()=>true,identity});
  const registered=(await json(handler,'/v1/auth/register',{method:'POST',body:JSON.stringify({email:'awareness@example.com',name:'Awareness Attorney',password:'correct password long enough'})})).body.data;const headers={authorization:`Bearer ${registered.accessToken}`};const workspace=(await json(handler,'/v1/workspaces',{method:'POST',headers,body:JSON.stringify({name:'Aware Firm'})})).body.data;
  await repository.createAwarenessItem({id:'awi_http',workspaceId:workspace.id,targetUserId:registered.user.id,sourceJobId:'inj_http',sourceObjectId:null,category:'incoming_email',priority:'high',headline:'Response email prepared',summary:'An unsent response is ready for attorney review.',observationIds:[],actionProposalIds:[],createdAt:'2026-07-10T12:00:00.000Z'});
  const feed=await json(handler,`/v1/workspaces/${workspace.id}/home/while-you-were-gone`,{headers});assert.equal(feed.status,200);assert.equal(feed.body.data[0].reviewStatus,'unseen');assert.equal(feed.body.data[0].headline,'Response email prepared');
  const reviewed=await json(handler,`/v1/workspaces/${workspace.id}/home/while-you-were-gone/awi_http`,{method:'PATCH',headers,body:JSON.stringify({status:'reviewed'})});assert.equal(reviewed.status,200);assert.equal(reviewed.body.data.status,'reviewed');const refreshed=await json(handler,`/v1/workspaces/${workspace.id}/home/while-you-were-gone`,{headers});assert.equal(refreshed.body.data[0].reviewStatus,'reviewed');
});

test('homepage review approves an AI legal draft but never files it',async()=>{
  const repository=new InMemoryRepository();const service=new AtlasService(repository);const identity=new IdentityService(repository,new TokenService('a'.repeat(32)));const handler=createAtlasHandler(service,{config:{maxBodyBytes:1_048_576,corsOrigins:[]},ready:async()=>true,identity});
  const registered=(await json(handler,'/v1/auth/register',{method:'POST',body:JSON.stringify({email:'review@example.com',name:'Review Attorney',password:'correct password long enough'})})).body.data;const headers={authorization:`Bearer ${registered.accessToken}`};const workspace=(await json(handler,'/v1/workspaces',{method:'POST',headers,body:JSON.stringify({name:'Review Firm'})})).body.data;
  const proposal=await repository.createAiActionProposal({id:'aap_home_document',workspaceId:workspace.id,runId:null,intelligenceJobId:'inj_home',originType:'native_intelligence',proposedBy:'atlas',actionType:'create_document',input:{title:'Motion to Compel',documentType:'motion_to_compel',content:'DRAFT FOR ATTORNEY REVIEW'},status:'pending',version:1,decidedBy:null,resultObjectId:null,createdAt:'2026-07-10T12:00:00.000Z',decidedAt:null});await repository.createAwarenessItem({id:'awi_home_document',workspaceId:workspace.id,targetUserId:registered.user.id,sourceJobId:'inj_home',sourceObjectId:null,category:'missed_deadline',priority:'urgent',headline:'Motion requires review',summary:'An unfiled motion draft is ready.',observationIds:[],actionProposalIds:[proposal.id],createdAt:'2026-07-10T12:00:00.000Z'});
  const feed=await json(handler,`/v1/workspaces/${workspace.id}/home/while-you-were-gone`,{headers});assert.equal(feed.body.data[0].actions[0].status,'pending');const approved=await json(handler,`/v1/workspaces/${workspace.id}/assistant/actions/${proposal.id}/decision`,{method:'POST',headers,body:JSON.stringify({version:1,decision:'approve'})});assert.equal(approved.body.data.proposal.status,'approved');assert.equal(approved.body.data.result.type,'motion_to_compel');assert.equal(approved.body.data.result.state.filed,false);assert.equal(approved.body.data.result.state.status,'draft');const refreshed=await json(handler,`/v1/workspaces/${workspace.id}/home/while-you-were-gone`,{headers});assert.equal(refreshed.body.data[0].actions[0].status,'approved');
});

test('homepage review accepts verified observations into firm knowledge and rejects others',async()=>{
  const repository=new InMemoryRepository();const service=new AtlasService(repository);const identity=new IdentityService(repository,new TokenService('a'.repeat(32)));const handler=createAtlasHandler(service,{config:{maxBodyBytes:1_048_576,corsOrigins:[]},ready:async()=>true,identity});
  const registered=(await json(handler,'/v1/auth/register',{method:'POST',body:JSON.stringify({email:'knowledge@example.com',name:'Knowledge Attorney',password:'correct password long enough'})})).body.data;const headers={authorization:`Bearer ${registered.accessToken}`};const workspace=(await json(handler,'/v1/workspaces',{method:'POST',headers,body:JSON.stringify({name:'Knowledge Firm'})})).body.data;
  const candidate=(id,kind,data)=>repository.createIntelligenceObservation({id,workspaceId:workspace.id,jobId:'inj_knowledge',sourceObjectId:null,kind,data,confidence:.91,sourceLocation:{page:2},provider:'test-provider',status:'candidate',reviewedBy:null,reviewedAt:null,createdAt:'2026-07-10T12:00:00.000Z'});const risk=await candidate('ino_home_risk','risk',{title:'Discovery sanctions risk',description:'Response remains overdue.'});const fact=await candidate('ino_home_fact','fact',{title:'Unverified allegation',description:'Requires corroboration.'});await repository.createAwarenessItem({id:'awi_home_knowledge',workspaceId:workspace.id,targetUserId:registered.user.id,sourceJobId:'inj_knowledge',sourceObjectId:null,category:'document_upload',priority:'high',headline:'New findings require verification',summary:'Two candidate findings are ready.',observationIds:[risk.id,fact.id],actionProposalIds:[],createdAt:'2026-07-10T12:00:00.000Z'});
  const feed=await json(handler,`/v1/workspaces/${workspace.id}/home/while-you-were-gone`,{headers});assert.deepEqual(feed.body.data[0].observations.map((item)=>item.status),['candidate','candidate']);const accepted=await json(handler,`/v1/workspaces/${workspace.id}/intelligence/observations/${risk.id}/decision`,{method:'POST',headers,body:JSON.stringify({decision:'accept'})});assert.equal(accepted.body.data.observation.status,'accepted');assert.equal(accepted.body.data.result.type,'risk');const rejected=await json(handler,`/v1/workspaces/${workspace.id}/intelligence/observations/${fact.id}/decision`,{method:'POST',headers,body:JSON.stringify({decision:'reject'})});assert.equal(rejected.body.data.observation.status,'rejected');assert.equal(rejected.body.data.result,null);const refreshed=await json(handler,`/v1/workspaces/${workspace.id}/home/while-you-were-gone`,{headers});assert.deepEqual(refreshed.body.data[0].observations.map((item)=>item.status),['accepted','rejected']);
});

test('authenticated ingestion routes accept phone calls and standalone documents idempotently',async()=>{
  const repository=new InMemoryRepository();const service=new AtlasService(repository);const identity=new IdentityService(repository,new TokenService('a'.repeat(32)));const ingestion=new AtlasIngestionService(repository,()=> '2026-07-10T12:00:00.000Z');const handler=createAtlasHandler(service,{config:{maxBodyBytes:1_048_576,corsOrigins:[]},ready:async()=>true,identity,ingestion});
  const registered=(await json(handler,'/v1/auth/register',{method:'POST',body:JSON.stringify({email:'events@example.com',name:'Event Attorney',password:'correct password long enough'})})).body.data;const headers={authorization:`Bearer ${registered.accessToken}`};const workspace=(await json(handler,'/v1/workspaces',{method:'POST',headers,body:JSON.stringify({name:'Event Firm'})})).body.data;
  const callBody={connector:'test-phone',externalId:'call-http-1',direction:'incoming',from:'+15551230000',to:'+15559870000',transcript:'Please call me about discovery.',durationSeconds:45};const call=await json(handler,`/v1/workspaces/${workspace.id}/ingestions/phone-calls`,{method:'POST',headers,body:JSON.stringify(callBody)});assert.equal(call.status,200);assert.equal(call.body.data.root.type,'phone_call');const duplicate=await json(handler,`/v1/workspaces/${workspace.id}/ingestions/phone-calls`,{method:'POST',headers,body:JSON.stringify(callBody)});assert.equal(duplicate.body.data.duplicate,true);
  const document=await json(handler,`/v1/workspaces/${workspace.id}/ingestions/documents`,{method:'POST',headers,body:JSON.stringify({connector:'test-portal',externalId:'doc-http-1',filename:'notice.pdf',storageRef:'blob://notice',sha256:'abc123',mediaType:'application/pdf',size:512})});assert.equal(document.status,200);assert.equal(document.body.data.root.type,'uploaded_document');assert.equal((await repository.listIntelligenceJobs(workspace.id)).filter((job)=>['phone_call.received','attachment.received'].includes(job.triggerType)).length,2);
});

test('HTTP refresh rotates sessions and logout prevents further refresh', async () => {
  const repository = new InMemoryRepository();
  const service = new AtlasService(repository);
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)));
  const handler = createAtlasHandler(service, {
    config: { maxBodyBytes: 1_048_576, corsOrigins: [] }, ready: async () => true, identity
  });
  const registered = await json(handler, '/v1/auth/register', {
    method: 'POST', body: JSON.stringify({ email: 'session@example.com', name: 'Session', password: 'correct horse battery staple' })
  });
  const original = registered.body.data.refreshToken;
  const refreshed = await json(handler, '/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: original }) });
  assert.equal(refreshed.status, 200);
  assert.notEqual(refreshed.body.data.refreshToken, original);
  const logout = await json(handler, '/v1/auth/logout', {
    method: 'POST', body: JSON.stringify({ refreshToken: refreshed.body.data.refreshToken })
  });
  assert.deepEqual(logout.body.data, { revoked: true });
  const denied = await json(handler, '/v1/auth/refresh', {
    method: 'POST', body: JSON.stringify({ refreshToken: refreshed.body.data.refreshToken })
  });
  assert.equal(denied.status, 401);
  assert.equal(denied.body.error.code, 'REFRESH_TOKEN_REUSED');
});

test('HTTP password recovery uses the delivery boundary and replaces credentials', async () => {
  let delivered;
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)), undefined, {
    deliverPasswordReset: async (message) => { delivered = message; }
  });
  const handler = createAtlasHandler(new AtlasService(repository), {
    config: { maxBodyBytes: 1_048_576, corsOrigins: [] }, ready: async () => true, identity
  });
  await json(handler, '/v1/auth/register', { method: 'POST', body: JSON.stringify({ email: 'recover-http@example.com', name: 'Recover', password: 'original password long enough' }) });
  const requested = await json(handler, '/v1/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ email: 'recover-http@example.com' }) });
  assert.deepEqual(requested.body.data, { accepted: true });
  assert.ok(delivered.resetToken);
  const completed = await json(handler, '/v1/auth/password-reset/complete', { method: 'POST', body: JSON.stringify({ resetToken: delivered.resetToken, password: 'replacement password long enough' }) });
  assert.deepEqual(completed.body.data, { reset: true });
  const login = await json(handler, '/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'recover-http@example.com', password: 'replacement password long enough' }) });
  assert.equal(login.status, 200);
});

test('HTTP session inventory supports individual and global logout', async () => {
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)));
  const handler = createAtlasHandler(new AtlasService(repository), {
    config: { maxBodyBytes: 1_048_576, corsOrigins: [] }, ready: async () => true, identity
  });
  const credentials = { email: 'inventory@example.com', password: 'original password long enough' };
  const registered = (await json(handler, '/v1/auth/register', { method: 'POST', body: JSON.stringify({ ...credentials, name: 'Inventory' }) })).body.data;
  const loggedIn = (await json(handler, '/v1/auth/login', { method: 'POST', body: JSON.stringify(credentials) })).body.data;
  const headers = { authorization: `Bearer ${loggedIn.accessToken}` };
  const inventory = await json(handler, '/v1/auth/sessions', { headers });
  assert.equal(inventory.status, 200);
  assert.equal(inventory.body.data.length, 2);
  const current = inventory.body.data.find((session) => session.current);
  assert.ok(current);
  const revoked = await json(handler, `/v1/auth/sessions/${current.id}`, { method: 'DELETE', headers });
  assert.equal(revoked.body.data.sessionId, current.id);
  const immediatelyDenied = await json(handler, '/v1/auth/sessions', { headers });
  assert.equal(immediatelyDenied.body.error.code, 'ACCESS_TOKEN_REVOKED');
  const remainingHeaders = { authorization: `Bearer ${registered.accessToken}` };
  const all = await json(handler, '/v1/auth/sessions', { method: 'DELETE', headers: remainingHeaders });
  assert.deepEqual(all.body.data, { revoked: true });
  const globallyDenied = await json(handler, '/v1/auth/sessions', { headers: remainingHeaders });
  assert.equal(globallyDenied.body.error.code, 'ACCESS_TOKEN_REVOKED');
  const denied = await json(handler, '/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: registered.refreshToken }) });
  assert.equal(denied.body.error.code, 'REFRESH_TOKEN_REUSED');
});

test('HTTP login throttling returns a stable timed-lockout response', async () => {
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)), undefined, {
    loginFailureThreshold: 2, loginFailureWindowSeconds: 300, loginLockSeconds: 60
  });
  const handler = createAtlasHandler(new AtlasService(repository), {
    config: { maxBodyBytes: 1_048_576, corsOrigins: [] }, ready: async () => true, identity
  });
  await json(handler, '/v1/auth/register', { method: 'POST', body: JSON.stringify({ email: 'locked-http@example.com', name: 'Locked', password: 'correct password long enough' }) });
  const fail = () => json(handler, '/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'locked-http@example.com', password: 'wrong password' }) });
  assert.equal((await fail()).body.error.code, 'INVALID_CREDENTIALS');
  const locked = await fail();
  assert.equal(locked.status, 429);
  assert.equal(locked.body.error.code, 'ACCOUNT_LOCKED');
  assert.ok(locked.body.error.details.lockedUntil);
});

test('authenticated assistant endpoint is workspace-scoped and source-aware', async () => {
  const repository = new InMemoryRepository();
  const service = new AtlasService(repository);
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)));
  let turn = 0;
  const model = { async complete(input) {
    assert.equal(input.context.userId.startsWith('usr_'), true);
    turn += 1;
    return turn === 1 ? { toolCalls: [{ id: 'task_1', name: 'propose_create_task', arguments: { title: 'Review priority matter' } }] }
      : { text: 'Your highest-priority matter is ready for review.' };
  } };
  const assistant = new AtlasAssistant(model, new AtlasToolRegistry(service), { repository });
  const handler = createAtlasHandler(service, {
    config: { maxBodyBytes: 1_048_576, corsOrigins: [] }, ready: async () => true, identity, assistant
  });
  const registered = (await json(handler, '/v1/auth/register', { method: 'POST', body: JSON.stringify({ email: 'ai@example.com', name: 'AI User', password: 'correct password long enough' }) })).body.data;
  const headers = { authorization: `Bearer ${registered.accessToken}` };
  const workspace = (await json(handler, '/v1/workspaces', { method: 'POST', headers, body: JSON.stringify({ name: 'AI Firm' }) })).body.data;
  const response = await json(handler, `/v1/workspaces/${workspace.id}/assistant/query`, {
    method: 'POST', headers, body: JSON.stringify({ prompt: 'What matters today?' })
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.answer, 'Your highest-priority matter is ready for review.');
  assert.match(response.body.data.conversationId, /^aic_/);
  assert.equal(response.body.data.actionProposals[0].status, 'pending');
  const actions = await json(handler, `/v1/workspaces/${workspace.id}/assistant/actions?status=pending`, { headers });
  assert.equal(actions.body.data.length, 1);
  const approved = await json(handler, `/v1/workspaces/${workspace.id}/assistant/actions/${actions.body.data[0].id}/decision`, { method: 'POST', headers, body: JSON.stringify({ version: 1, decision: 'approve' }) });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.proposal.status, 'approved');
  assert.equal(approved.body.data.result.type, 'task');
  const history = await json(handler, `/v1/workspaces/${workspace.id}/assistant/runs`, { headers });
  assert.equal(history.status, 200);
  assert.equal(history.body.data.length, 1);
  assert.equal(history.body.data[0].status, 'completed');
  assert.equal(history.body.data[0].prompt, 'What matters today?');
  const conversations = await json(handler, `/v1/workspaces/${workspace.id}/assistant/conversations`, { headers });
  assert.equal(conversations.body.data.length, 1);
  const messages = await json(handler, `/v1/workspaces/${workspace.id}/assistant/conversations/${response.body.data.conversationId}/messages`, { headers });
  assert.deepEqual(messages.body.data.map((message) => message.role), ['user', 'assistant']);
});

test('assistant endpoint reports unavailable providers without pretending AI ran', async () => {
  const repository = new InMemoryRepository();
  const service = new AtlasService(repository);
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)));
  const handler = createAtlasHandler(service, {
    config: { maxBodyBytes: 1_048_576, corsOrigins: [] }, ready: async () => true, identity,
    assistant: new AtlasAssistant(null, new AtlasToolRegistry(service))
  });
  const registered = (await json(handler, '/v1/auth/register', { method: 'POST', body: JSON.stringify({ email: 'no-ai@example.com', name: 'No AI', password: 'correct password long enough' }) })).body.data;
  const headers = { authorization: `Bearer ${registered.accessToken}` };
  const workspace = (await json(handler, '/v1/workspaces', { method: 'POST', headers, body: JSON.stringify({ name: 'No AI Firm' }) })).body.data;
  const response = await json(handler, `/v1/workspaces/${workspace.id}/assistant/query`, { method: 'POST', headers, body: JSON.stringify({ prompt: 'Help' }) });
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'AI_NOT_CONFIGURED');
});
