'use strict';
// Resolve a separate downstream round only from a literal, unambiguous official label.
// Work's original HOLD / null roundKey is never edited.
const H=require('../../vendor/work-v04/src/hash53');
const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
function key(sourceNoticeKey,quote){
  return 'ROUND:'+H.digest([sourceNoticeKey,norm(quote)]).slice(0,24);
}
function resolveLiteralRound({
  handoff,observation,confirmedAt,kind='ROUND_RESOLUTION'
}
={
}
){
 const held=reason=>({
    state:'HOLD',reason,resolution:null
  }
  );
 if(!handoff||!observation||handoff.schema!=='HA53_CANONICAL_HANDOFF_V1'||handoff.disposition!=='HOLD'||handoff.eventEmissionAllowed!==false||handoff.deliveryCapability!=='NONE')return held('SOURCE_HANDOFF_REQUIRED');
 if(handoff.original.observationSha256!==H.digest(observation)||handoff.original.sourceNoticeKey!==observation.sourceNoticeKey||handoff.original.url!==observation.url)return held('SOURCE_HASH_BINDING');
 if(!['ROUND_RESOLUTION','RECRUITMENT_CHANGE'].includes(kind)||!Number.isFinite(Date.parse(confirmedAt)))return held('RESOLUTION_CONTEXT_REQUIRED');
 const candidates=[...new Set(String(observation.bodyText||'').split(/\n/).map(norm).filter(q=>/^[■●\s]*(?:모집(?:공고)?(?:회차|차수)|공고회차)\s*[:：]\s*20\d{2}.*/.test(q)))];
 if(candidates.length!==1)return held(candidates.length?'ROUND_LABEL_CONFLICT':'ROUND_LABEL_NOT_EXPLICIT');
 const quote=candidates[0];
  if(!/20\d{2}.*(?:\d+\s*(?:차|순위)|최초|추가|재모집)/.test(quote))return held('ROUND_LABEL_NOT_EXPLICIT');
 return {
    state:'CONFIRMED',reason:'BOUND_LITERAL_ROUND_EVIDENCE',resolution:{
      schema:'BRIDGE_ROUND_RESOLUTION_V1',mode:'MOCK_ONLY',kind,sourceNoticeKey:observation.sourceNoticeKey,handoffSha256:H.digest(handoff),observationSha256:H.digest(observation),roundKey:key(observation.sourceNoticeKey,quote),evidence:{
        url:observation.url,layer:'WEB_BODY',quote
      }
      ,confirmedAt
    }
  }
  ;
}
module.exports={
  key,resolveLiteralRound
}
;
