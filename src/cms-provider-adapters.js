import { AtlasError } from './errors.js';

function basicRecord(type,row){return {type,id:String(row.id),updatedAt:row.updated_at??row.updatedAt??null,checksum:row.etag??null,deleted:Boolean(row.deleted_at||row.deletedAt||row.archived_at||row.archivedAt||row.status==='deleted'),deletedAt:row.deleted_at??row.deletedAt??row.archived_at??row.archivedAt??null,data:{...row,title:row.display_number??row.name??row.subject??`${type} ${row.id}`}};}

export class OAuthCmsConnector {
  constructor(options){this.name=options.name;this.clientId=options.clientId;this.clientSecret=options.clientSecret;this.authorizeEndpoint=options.authorizeEndpoint;this.tokenEndpoint=options.tokenEndpoint;this.revokeEndpoint=options.revokeEndpoint;this.apiBase=options.apiBase;this.scopes=options.scopes??[];this.resources=options.resources??[];this.transport=options.transport??fetch;}
  capabilities(){return {oauth2:true,pkce:true,incrementalSync:true,readOnly:true,resources:this.resources.map((item)=>item.type)};}
  beginAuthorization({state,codeChallenge,redirectUri}){const query=new URLSearchParams({response_type:'code',client_id:this.clientId,redirect_uri:redirectUri,state,code_challenge:codeChallenge,code_challenge_method:'S256'});if(this.scopes.length)query.set('scope',this.scopes.join(' '));return `${this.authorizeEndpoint}?${query}`;}
  async exchangeCode({code,codeVerifier,redirectUri}){const body=new URLSearchParams({grant_type:'authorization_code',client_id:this.clientId,code,redirect_uri:redirectUri,code_verifier:codeVerifier});if(this.clientSecret)body.set('client_secret',this.clientSecret);const response=await this.transport(this.tokenEndpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});if(!response.ok)throw new AtlasError('CMS_AUTHORIZATION_FAILED','CMS authorization exchange failed',502,{provider:this.name,status:response.status});return response.json();}
  async pull({credentials,cursor}){const position=cursor??{resource:0,page:1};const resource=this.resources[position.resource];if(!resource)return {records:[],nextCursor:position,hasMore:false};const url=new URL(`${this.apiBase}${resource.path}`);url.searchParams.set('page',String(position.page));url.searchParams.set('limit',String(resource.limit??200));const response=await this.transport(url,{headers:{authorization:`Bearer ${credentials.access_token}`}});if(!response.ok)throw new AtlasError('CMS_SYNC_PROVIDER_ERROR','CMS provider sync request failed',502,{provider:this.name,status:response.status});const body=await response.json();const rows=body.data??body.items??[];const records=rows.map((row)=>(resource.normalize??((value)=>basicRecord(resource.type,value)))(row));const more=Boolean(body.meta?.paging?.next??body.next);const nextCursor=more?{resource:position.resource,page:position.page+1}:{resource:position.resource+1,page:1};return {records,nextCursor,hasMore:more||position.resource+1<this.resources.length};}
  async revoke({credentials}){if(!this.revokeEndpoint)return;await this.transport(this.revokeEndpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:credentials.access_token})});}
}

export class ClioManageConnector extends OAuthCmsConnector {
  constructor(options){const region=options.region&&options.region!=='us'?`${options.region}.app.clio.com`:'app.clio.com';super({...options,name:'clio',authorizeEndpoint:`https://${region}/oauth/authorize`,tokenEndpoint:`https://${region}/oauth/token`,revokeEndpoint:`https://${region}/oauth/deauthorize`,apiBase:`https://${region}`,resources:options.resources??[
    {type:'matter',path:'/api/v4/matters'},{type:'contact',path:'/api/v4/contacts'},{type:'task',path:'/api/v4/tasks'},{type:'calendar',path:'/api/v4/calendar_entries'},{type:'accounting',path:'/api/v4/activities'},{type:'document',path:'/api/v4/documents'},{type:'communication',path:'/api/v4/communications'}
  ]});}
}

export class MyCaseOpenApiConnector extends OAuthCmsConnector {
  constructor(options){if(!options.authorizeEndpoint||!options.tokenEndpoint||!options.apiBase)throw new AtlasError('CMS_CONNECTOR_CONFIGURATION_ERROR','MyCase endpoints issued through Open API access are required',500);super({...options,name:'mycase'});}
}
