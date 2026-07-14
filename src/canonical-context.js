function objectMap(objects){return new Map(objects.map(object=>[object.id,object]));}

export function canonicalMatterId(object,objects){
  if(!object)return null;
  const byId=objects instanceof Map?objects:objectMap(objects);
  const seen=new Set();
  let current=object;
  while(current&&!seen.has(current.id)){
    seen.add(current.id);
    if(current.dimension==='matter')return current.id;
    const declared=current.state?.matterId;
    if(declared&&byId.get(declared)?.dimension==='matter')return declared;
    current=current.parentObjectId?byId.get(current.parentObjectId):null;
  }
  return null;
}

export function canonicalContextObjectIds(rootObjectId,objects,relationships=[]){
  const byId=objectMap(objects);
  const root=byId.get(rootObjectId);
  if(!root)return new Set();
  const ids=new Set([root.id]);
  for(const object of objects)if(['firm_profile','attorney_profile'].includes(object.type))ids.add(object.id);
  let changed=true;
  while(changed){
    const size=ids.size;
    const matterIds=new Set([...ids].map(id=>canonicalMatterId(byId.get(id),byId)).filter(Boolean));
    for(const matterId of matterIds)ids.add(matterId);
    for(const object of objects)if(matterIds.has(canonicalMatterId(object,byId)))ids.add(object.id);
    for(const relationship of relationships){
      if(ids.has(relationship.fromObjectId))ids.add(relationship.toObjectId);
      if(ids.has(relationship.toObjectId))ids.add(relationship.fromObjectId);
    }
    changed=ids.size!==size;
  }
  return ids;
}

function referencesAny(value,ids){
  if(typeof value==='string')return ids.has(value);
  if(Array.isArray(value))return value.some(item=>referencesAny(item,ids));
  if(value&&typeof value==='object')return Object.values(value).some(item=>referencesAny(item,ids));
  return false;
}

export function buildCanonicalContext({rootObjectId,objects,relationships=[],events=[],observations=[],actions=[],awareness=[]}){
  const byId=objectMap(objects);
  const root=byId.get(rootObjectId)??null;
  const ids=canonicalContextObjectIds(rootObjectId,objects,relationships);
  const contextObjects=objects.filter(object=>ids.has(object.id));
  const matterIds=[...new Set(contextObjects.map(object=>canonicalMatterId(object,byId)).filter(Boolean))];
  const contextRelationships=relationships.filter(relationship=>ids.has(relationship.fromObjectId)&&ids.has(relationship.toObjectId));
  const contextEvents=events.filter(event=>ids.has(event.parentObjectId)||(event.relatedObjectIds??[]).some(id=>ids.has(id)));
  const contextObservations=observations.filter(observation=>ids.has(observation.sourceObjectId)||matterIds.includes(observation.matterId));
  const observationIds=new Set(contextObservations.map(observation=>observation.id));
  const contextActions=actions.filter(action=>ids.has(action.resultObjectId)||matterIds.includes(action.input?.matterId)||referencesAny(action.input,ids));
  const actionIds=new Set(contextActions.map(action=>action.id));
  const contextAwareness=awareness.filter(item=>ids.has(item.sourceObjectId)||(item.observationIds??[]).some(id=>observationIds.has(id))||(item.actionProposalIds??[]).some(id=>actionIds.has(id)));
  const rootMatterId=canonicalMatterId(root,byId);
  const matter=rootMatterId?byId.get(rootMatterId)??null:null;
  return {
    root,
    matter,
    matterIds,
    objects:contextObjects,
    relationships:contextRelationships,
    events:contextEvents,
    intelligence:{observations:contextObservations,actions:contextActions,awareness:contextAwareness},
    counts:{objects:contextObjects.length,relationships:contextRelationships.length,events:contextEvents.length,observations:contextObservations.length,actions:contextActions.length,awareness:contextAwareness.length}
  };
}
