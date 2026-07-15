import { createHash } from 'node:crypto';

const clone=value=>JSON.parse(JSON.stringify(value));
const slug=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100)||'home';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pageKey=page=>`page:${page.path}`;
const entity=(type,contentKey,title,state)=>({type,contentKey,title,state:{contentModelVersion:1,contentKey,active:true,...state}});

function pageIntent(page){if(['practice','location','contact'].includes(page.type))return'high_intent';if(page.type==='attorney')return'comparison';return'informational';}
function moduleEntities(page){const key=slug(page.path);return[
  entity('website_page_module',`module:${key}:hero`,`${page.heading} — hero`,{moduleType:'hero',variantPolicy:'approved_emphasis_only',content:{eyebrow:page.eyebrow,headline:page.heading,supportingText:page.summary},allowedAdaptiveFields:['ctaLabel','moduleOrder','proofEmphasis']}),
  entity('website_page_module',`module:${key}:article`,`${page.heading} — article`,{moduleType:'article',variantPolicy:'stable_people_first_content',content:{body:page.body,highlights:page.highlights,localEvidence:page.localEvidence,localEvidenceVerified:page.localEvidenceVerified},allowedAdaptiveFields:[]}),
  entity('website_page_module',`module:${key}:conversion`,`${page.heading} — conversion`,{moduleType:'conversion',variantPolicy:'approved_cta_profile_only',content:{disclaimer:'Contact does not create an attorney-client relationship.'},allowedAdaptiveFields:['ctaLabel','ctaMode','placement']})
];}

export function buildWebsiteContentModel(input){
  const site=clone(input);const pages=site.pages;const ctaKey='cta:default-legal-intake';const formKey='form:progressive-legal-intake';const routingKey='routing:professional-review';const entities=[];const edges=[];
  entities.push(entity('website_cta_profile',ctaKey,'Default legal intake calls to action',{modes:['call_first','form_first','schedule_first','callback_first'],labels:{default:'Request a consultation',mobile:'Call now',afterHours:'Request a callback'},placements:['hero','sticky_mobile_bar','post_faq','footer'],externalActionRequiresHumanOrVisitorAction:true}));
  entities.push(entity('website_form_variant',formKey,'Progressive legal intake',{steps:[{name:'initial_contact',fields:['full_name','phone','email_optional','legal_issue','city_county']},{name:'qualification',fields:['charges_filed','custody_status','court_date','visitor_role','best_time_to_reach']}],completionPolicy:{allowStepOneSubmit:true,requestStepTwoBeforeScheduling:true},spamControls:{honeypot:true,rateLimit:true,contactValidation:true},representationCreatedOnSubmit:false}));
  entities.push(entity('website_lead_routing_rule',routingKey,'Professional intake review routing',{inputs:['urgency','geography','matter_fit','conflict','readiness'],routes:['conflicts_review','consultation_review','referral_review','educational_follow_up','staff_review'],conflictClearanceRequired:true,automaticRepresentation:false,automaticContact:false}));
  for(const page of pages){
    const pKey=pageKey(page);const moduleKeys=moduleEntities(page).map(item=>item.contentKey);const faqKey=`faq:${slug(page.path)}`;const linkKey=`links:${slug(page.path)}`;const related=pages.filter(item=>item.path!==page.path&&(item.type===page.type||item.path==='/')).slice(0,6);
    entities.push(entity('website_seo_page',pKey,page.heading,{path:page.path,canonicalUrl:new URL(page.path,site.firm.domain).href,pageType:page.type,pageIntent:pageIntent(page),seo:{titleTag:page.seoTitle,metaDescription:page.metaDescription,h1:page.heading,targetQuery:page.targetQuery},schemaTypes:['LegalService','WebPage',...(page.faqs.length?['FAQPage']:[])],audience:['prospective_client','family_member'],moduleOrder:moduleKeys,faqSetKey:faqKey,internalLinkSetKey:linkKey,primaryCtaProfileKey:ctaKey,formVariantKey:formKey,leadRoutingRuleKey:routingKey,conversionGoal:'scheduled_consultation',indexable:false,author:page.author,reviewedAt:page.reviewedAt}));
    entities.push(...moduleEntities(page));
    entities.push(entity('website_faq_set',faqKey,`${page.heading} — FAQs`,{pageKey:pKey,questions:page.faqs.map((item,index)=>({id:`q${index+1}`,question:item.question,answer:item.answer})),attorneyReviewRequired:true}));
    entities.push(entity('website_internal_link_set',linkKey,`${page.heading} — internal links`,{primaryTopic:page.targetQuery,sourcePageKey:pKey,relatedPages:related.map(item=>({pageKey:pageKey(item),anchorText:item.navLabel||item.heading,relationship:item.path==='/'?'pillar':item.type===page.type?'peer_topic':'support'}))}));
    for(const key of [...moduleKeys,faqKey,linkKey,ctaKey,formKey,routingKey])edges.push({fromKey:pKey,toKey:key,type:key.startsWith('module:')?'uses_website_module':key.startsWith('faq:')?'uses_website_faq_set':key.startsWith('links:')?'uses_website_link_set':key.startsWith('cta:')?'uses_website_cta_profile':key.startsWith('form:')?'uses_website_form_variant':'uses_website_routing_rule'});
    for(const item of related)edges.push({fromKey:linkKey,toKey:pageKey(item),type:'links_to_website_page'});
  }
  return{schemaVersion:1,site:{templateId:site.templateId,firmName:site.firm.name,domain:site.firm.domain},entities,edges,governance:{oneCanonicalPagePerPath:true,thinPageGenerationBlocked:true,verifiedClaimsOnly:true,humanPublicationReview:true,adaptiveLegalClaims:false}};
}

export class WebsiteContentModelService{
  constructor(atlas){this.atlas=atlas;}
  async materialize(workspaceId,siteObject,site,actorId){
    const model=buildWebsiteContentModel(site);const objects=await this.atlas.listObjects(workspaceId,{});const existing=objects.filter(item=>item.parentObjectId===siteObject.id&&item.state?.contentModelVersion===1);const byKey=new Map(existing.map(item=>[`${item.type}|${item.state.contentKey}`,item]));const resolved=new Map();
    for(const definition of model.entities){const key=`${definition.type}|${definition.contentKey}`;const current=byKey.get(key);let record;if(current){const nextState={...definition.state,siteId:siteObject.id};record=digest(current.state)===digest(nextState)&&current.title===definition.title?current:await this.atlas.updateObject(workspaceId,current.id,{version:current.version,title:definition.title,state:nextState},actorId);}else record=await this.atlas.createObject(workspaceId,{dimension:'operation',type:definition.type,parentObjectId:siteObject.id,title:definition.title,state:{...definition.state,siteId:siteObject.id},actorId});resolved.set(definition.contentKey,record);}
    const activeKeys=new Set(model.entities.map(item=>`${item.type}|${item.contentKey}`));for(const current of existing)if(current.state?.active!==false&&!activeKeys.has(`${current.type}|${current.state.contentKey}`))await this.atlas.updateObject(workspaceId,current.id,{version:current.version,state:{...current.state,active:false,retiredBecause:'removed_from_website_content_model'}},actorId);
    for(const edge of model.edges){const from=resolved.get(edge.fromKey),to=resolved.get(edge.toKey);if(!from||!to)continue;try{await this.atlas.createRelationship(workspaceId,{fromObjectId:from.id,toObjectId:to.id,type:edge.type,attributes:{siteId:siteObject.id,contentModelVersion:1},actorId});}catch(error){if(error.code!=='RELATIONSHIP_EXISTS')throw error;}}
    return{schemaVersion:model.schemaVersion,entityCount:model.entities.length,edgeCount:model.edges.length,contentHash:digest(model),governance:model.governance};
  }
}
