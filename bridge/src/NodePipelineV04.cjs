'use strict';
const Base=require('./NodePipeline.cjs'),Policy=require('./HandoffPolicyV04.cjs');
const {readResult}=require('./GasMvpResult.cjs');
const B=require('../../b11/src/DeliveryCore.js'),hash=Base.hash;
function create(options){
 if(options&&['gasConfig','token','chat_id','writeEnabled','inputPolicy','workVersion'].some(k=>k in options))throw Error('V04_LOCAL_MOCK_ONLY_CONFIG');
 const p=Base.create({
    ...options,workVersion:'0.4',inputPolicy:Policy.create()
  }
  );
 // Handoff alone is never an instruction to emit. Source context + independent evidence are required.
 function persistHandoffs(records,provenance){
    return p.centralStore.transaction(s=>{
      s.v04Handoffs=s.v04Handoffs||{
      }
      ;
      return records.map((h,index)=>{
        const k=hash(B.stable(h)),key=h.original&&h.original.sourceNoticeKey||null;
        const receipt={
          hash:k,sourceNoticeKey:key,original:JSON.parse(JSON.stringify(h)),decision:'HOLD',reason:'ORIGINAL_SOURCE_CONTEXT_AND_ROUND_RESOLUTION_REQUIRED',eventEmissionAllowed:false
        }
        ;
        const stored=s.v04Handoffs[k]=s.v04Handoffs[k]||receipt;
        const evidence=provenance[index];
        let replayed=false;
        if(evidence){
          stored.mvpProvenance=stored.mvpProvenance||{};
          const evidenceKey=hash(B.stable(evidence));
          replayed=Object.hasOwn(stored.mvpProvenance,evidenceKey);
          stored.mvpProvenance[evidenceKey]=evidence;
        }
        const current=s.bridge&&Object.values(s.bridge.canonical).find(r=>r.sourceNoticeIds.includes(key));
        if(!replayed&&current&&(!current.handoffProvenance||current.handoffProvenance.handoffSha256!==k)){
          s.v04PendingHandoffs=s.v04PendingHandoffs||{
          }
          ;
          s.v04PendingHandoffs[key]={
            hash:k,reason:receipt.reason
          }
          ;
        }
        return {
          hash:k,sourceNoticeKey:key,decision:'HOLD',reason:receipt.reason
        }
        ;
      }
      );
    }
    );
  }
 return {
    ...p,
    receiveHandoffs:records=>persistHandoffs(records,[]),
    receiveGasMvpResult(value){
      const {records,provenance,run}=readResult(value);
      return {run,receipts:records.length?persistHandoffs(records,provenance):[]};
    },
    workVersion:'0.4'
  }
  ;
}
module.exports={
  create,hash,resolveLiteralRound:require('./RoundResolverV04.cjs').resolveLiteralRound
}
;
