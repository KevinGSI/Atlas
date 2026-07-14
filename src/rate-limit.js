import { createHmac } from 'node:crypto';
import { AtlasError } from './errors.js';

const PUBLIC_AUTH_ROUTES=new Set(['register','registerFirm','login','refresh','logout','requestPasswordReset','resetPassword','acceptInvitation','cmsOAuthCallback','stripePaymentCheckout']);
const AI_ROUTES=new Set(['assistantQuery','performMatterTask','legalResearchSearch','legalResearchChat','createMatterClientEmailDraft','createMatterClientMeetingDraft']);
const FILE_ROUTES=new Set(['uploadFile','uploadFormBankForm','previewMigration','importMigration']);
const WEBHOOK_ROUTES=new Set(['ingestWebhook','twilioVoiceIncoming','twilioVoiceTurn','twilioVoiceStatus','twilioSmsIncoming','stripePaymentWebhook','docusignExecutionWebhook']);

function positive(value,name){if(!Number.isInteger(value)||value<1)throw new AtlasError('RATE_LIMIT_CONFIGURATION_ERROR',`${name} must be a positive integer`,500);return value;}

export class RepositoryRequestRateLimiter {
  constructor(repository,secret,options={},clock=()=>new Date().toISOString()){
    if(typeof repository?.consumeRateLimitBucket!=='function')throw new AtlasError('RATE_LIMIT_CONFIGURATION_ERROR','Rate-limit repository storage is required',500);
    if(typeof secret!=='string'||secret.length<32)throw new AtlasError('RATE_LIMIT_CONFIGURATION_ERROR','Rate-limit hashing secret must contain at least 32 characters',500);
    this.repository=repository;this.secret=secret;this.clock=clock;
    this.limits={auth:positive(options.authRequests??30,'authRequests'),ai:positive(options.aiRequests??30,'aiRequests'),file:positive(options.fileRequests??20,'fileRequests'),webhook:positive(options.webhookRequests??300,'webhookRequests'),write:positive(options.writeRequests??120,'writeRequests')};
    this.windows={auth:900,ai:60,file:60,webhook:60,write:60};
  }
  policy(routeName,method){if(PUBLIC_AUTH_ROUTES.has(routeName))return {scope:'auth',principal:'ip'};if(WEBHOOK_ROUTES.has(routeName))return {scope:'webhook',principal:'ip'};if(AI_ROUTES.has(routeName))return {scope:'ai',principal:'user'};if(FILE_ROUTES.has(routeName))return {scope:'file',principal:'user'};if(!['GET','HEAD','OPTIONS'].includes(method))return {scope:'write',principal:'user'};return null;}
  async check({routeName,method,userId=null,ipAddress=null}){
    const policy=this.policy(routeName,method);if(!policy)return {limited:false};
    const principal=policy.principal==='user'&&userId?`user:${userId}`:`ip:${ipAddress??'unknown'}`;
    const keyHash=createHmac('sha256',this.secret).update(`${policy.scope}:${routeName}:${principal}`).digest('hex');
    const now=this.clock();const windowSeconds=this.windows[policy.scope];const limit=this.limits[policy.scope];
    const bucket=await this.repository.consumeRateLimitBucket({keyHash,scope:policy.scope,now,windowSeconds});
    const retryAfterSeconds=Math.max(1,Math.ceil((new Date(bucket.expiresAt).getTime()-new Date(now).getTime())/1000));
    if(bucket.count>limit)throw new AtlasError('RATE_LIMITED','Too many requests; try again after the current limit window',429,{scope:policy.scope,retryAfterSeconds});
    return {limited:false,scope:policy.scope,remaining:Math.max(0,limit-bucket.count),resetAt:bucket.expiresAt};
  }
}
