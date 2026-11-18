'use strict';
// Work's HOLD is immutable source evidence; any mock candidate is a separate decision.
const fs=require('fs'),path=require('path'),H=require('../../vendor/work-v04/src/hash53'),T=require('../../vendor/work-v04/src/staging53'),E=require('../../vendor/work-v04/src/handoff53'),S=require('../../vendor/work-v04/src/soco53_adapter'),C=require('../../vendor/work-v04/src/housing_core');
const manifest=require('../../vendor/work-v04/fixtures_manifest.v2.json');
const Round=require('./RoundResolverV04.cjs');
const copy=x=>JSON.parse(JSON.stringify(x)),norm=s=>String(s||'').replace(/\s+/g,' ').trim();
function assert(ok,message){
  if(!ok)throw Error('V04_'+message);
}
const roundKey=Round.key;
function create(){
 function assess({
    envelope,detail,input,observedAt,now
  }
  ){
  const key=envelope.sourceNoticeKey,h=(input.handoffs||{
    }
    )[key]||null,res=(input.roundResolutions||{
    }
    )[key]||null,capture=(input.captures||{
    }
    )[key]||null;
  const record={
      policyVersion:'BRIDGE_HANDOFF_V04_1',fingerprint:H.digest(['BRIDGE_HANDOFF_V04_1',key,H.digest(envelope),h,res,capture]),handoff:copy(h),resolution:copy(res),capture:copy(capture),reason:null
    }
    ;
  try{
   assert(h&&h.schema==='HA53_CANONICAL_HANDOFF_V1','HANDOFF_REQUIRED');
   assert(h.disposition==='HOLD'&&h.eventEmissionAllowed===false&&h.deliveryCapability==='NONE','ORIGINAL_HOLD_POLICY_REQUIRED');
   assert(h.original&&h.original.sourceNoticeKey===key&&h.original.snapshotId===envelope.stage.snapshotId,'SOURCE_SNAPSHOT_BINDING');
   const obs=envelope.observation;
   let parsed;
   if(envelope.stage.source==='SOCO'){
    assert(detail&&detail.status===200&&detail.url===(obs.detailUrl||obs.url),'DETAIL_REQUIRED');
    parsed=S.soco53ParseDetail(detail,obs.listRecord||obs);
   
      }
      else{
    assert(obs.schemaVersion==='0.2'&&obs.url&&obs.bodyText,'FULL_OBSERVATION_REQUIRED');
        parsed=copy(obs);
   
      }
   assert(parsed.sourceNoticeKey===key&&H.digest(parsed)===h.original.observationSha256,'OBSERVATION_HASH');
   const body=norm(parsed.bodyText),url=parsed.url;
   const expected=E.convert(T.envelope(parsed,envelope.stage),{
    regionEvidence:h.evidence.regionEvidence,supplyType:h.canonicalRecruitment.supplyType,supplyTypeEvidence:h.canonicalRecruitment.supplyTypeEvidence,
    sourceResponseSha256:h.original.sourceResponseSha256,fixtureSha256:h.original.fixtureSha256,
    validRecruitmentVerified:!h.holdReasons.includes('VALID_RECRUITMENT_UNCONFIRMED')
      }
      );
   assert(H.canonical(expected)===H.canonical(h),'HANDOFF_REPLAY_MISMATCH');
   assert(capture&&detail&&typeof detail.text==='string','CAPTURE_BINDING_REQUIRED');
   let captureProof;
   if(capture.kind==='SYNTHETIC_FIXTURE'){
    const sha=H.sha256(detail.text);
        assert(capture.synthetic===true&&h.original.fixtureSha256===sha&&h.original.sourceResponseSha256===sha,'SYNTHETIC_CAPTURE_HASH');
    captureProof={
          kind:'SYNTHETIC_FIXTURE',fixtureBytesVerification:'LOCAL_MATCH',sourceResponseBytesVerification:'SYNTHETIC_BYTES_MATCH',fixtureSha256:sha,sourceResponseSha256:sha
        }
        ;
   
      }
      else{
    assert(capture.kind==='PROVIDED_MANIFEST_FIXTURE','UNSUPPORTED_CAPTURE');
    const meta=manifest.records.find(m=>m.fixture_id===capture.fixtureId);
        assert(meta,'FIXTURE_NOT_IN_MANIFEST');
    assert(/^fixtures\/[A-Za-z0-9_.-]+$/.test(meta.fixture_path),'MANIFEST_FIXTURE_PATH');
    const bytes=fs.readFileSync(path.join(__dirname,'../../vendor/work-v04',meta.fixture_path));
    const sha=require('crypto').createHash('sha256').update(bytes).digest('hex');
    const decoded=new TextDecoder(/^euc-kr|cp949/i.test(meta.encoding||'')?'euc-kr':'utf-8',{
          fatal:true
        }
        ).decode(bytes);
    assert(sha===meta.fixture_sha256&&detail.url===meta.url&&detail.status===meta.status&&detail.text===decoded,'MANIFEST_FIXTURE_BINDING');
    assert(h.original.fixtureSha256===sha&&h.original.sourceResponseSha256===meta.response_sha256,'RESPONSE_AND_FIXTURE_HASH_DISTINCT');
    captureProof={
          kind:capture.kind,fixtureId:meta.fixture_id,fixtureBytesVerification:'LOCAL_MATCH',sourceResponseBytesVerification:'UPSTREAM_MANIFEST_ONLY_NOT_REFETCHED',fixtureSha256:sha,sourceResponseSha256:meta.response_sha256
        }
        ;
   
      }
   record.captureProof=captureProof;
   if(envelope.stage.mode==='INITIAL_BASELINE'||h.holdReasons.includes('INITIAL_BACKFILL'))throw Error('V04_INITIAL_BACKFILL');
   if(h.windows.status==='SCHEDULE_CONFLICT'||h.holdReasons.includes('OFFICIAL_DEADLINE_CONFLICT'))throw Error('V04_SCHEDULE_CONFLICT');
   if(h.holdReasons.includes('CHANGE_UNCLASSIFIED'))throw Error('V04_CHANGE_REVIEW_REQUIRED');
   const region=h.evidence.regionEvidence||[];
      assert(region.length,'OFFICIAL_REGION_REQUIRED');
   for(const q of region){
        assert(q.origin&&q.origin.url===url&&q.origin.layer==='WEB_BODY'&&typeof q.quote==='string'&&body.includes(norm(q.quote))&&/^[■●\s]*(?:주택\s*위치|공급\s*위치|공급\s*소재지|사업\s*위치)\s*[:：]/.test(q.quote),'REGION_QUOTE_BINDING');
        assert(typeof q.sido==='string'&&q.quote.includes(q.sido)&&(!q.sigungu||q.quote.includes(q.sigungu)),'REGION_LITERAL_BINDING');
      }
   const type=h.canonicalRecruitment.supplyType,supply=h.canonicalRecruitment.supplyTypeEvidence;
   assert(['PUBLIC_RENT','PRIVATE_RENT','PUBLIC_SALE','PRIVATE_SALE'].includes(type)&&supply&&supply.origin&&supply.origin.url===url,'SUPPLY_EVIDENCE_REQUIRED');
   if(supply.origin.layer==='SOCO_LIST_JSON'){
    const list=parsed.listRecord||obs,raw=list.raw;
    assert(envelope.stage.source==='SOCO'&&raw&&supply.field==='optn2'&&supply.value===raw.optn2&&type===(raw.optn2==='1'?'PUBLIC_RENT':'PRIVATE_RENT'),'SUPPLY_LIST_FIELD_BINDING');
   
      }
      else{
    assert(supply.origin.layer==='WEB_BODY'&&supply.quote&&body.includes(norm(supply.quote)),'SUPPLY_QUOTE_BINDING');
    const signal={
          PUBLIC_RENT:/공공임대|행복주택|(?:한국토지주택공사|경기주택도시공사).*매입임대주택/,PRIVATE_RENT:/민간임대/,PUBLIC_SALE:/공공분양/,PRIVATE_SALE:/민간분양/
        }
        [type];
        assert(signal.test(supply.quote),'SUPPLY_TYPE_UNCONFIRMED');
   
      }
   const typeLabels=String(parsed.bodyText||'').split(/\n/).map(norm).filter(q=>/^[■●\s]*공급(?:유형|구분)\s*[:：]/.test(q));
   for(const label of typeLabels){
        const types=[];
        if(/공공임대|행복주택/.test(label))types.push('PUBLIC_RENT');
        if(/민간임대/.test(label))types.push('PRIVATE_RENT');
        if(/공공분양/.test(label))types.push('PUBLIC_SALE');
        if(/민간분양/.test(label))types.push('PRIVATE_SALE');
        assert(types.length===1&&types[0]===type,'SUPPLY_TYPE_CONFLICT');
      }
   // Caller assertions are not enough: require an explicit official round label, bound to this observation.
   assert(res&&res.schema==='BRIDGE_ROUND_RESOLUTION_V1'&&res.mode==='MOCK_ONLY'&&res.sourceNoticeKey===key,'ROUND_RESOLUTION_REQUIRED');
   assert(res.handoffSha256===H.digest(h)&&res.observationSha256===h.original.observationSha256,'ROUND_RESOLUTION_HASH');
   const q=res.evidence;
      assert(q&&q.url===url&&q.layer==='WEB_BODY'&&q.quote&&body.includes(norm(q.quote)),'ROUND_QUOTE_BINDING');
   assert(/^[■●\s]*(?:모집(?:공고)?(?:회차|차수)|공고회차)\s*[:：]\s*20\d{2}.*(?:\d+\s*(?:차|순위)|최초|추가|재모집)/.test(q.quote),'EXPLICIT_ROUND_LABEL_REQUIRED');
   assert(res.roundKey===roundKey(key,q.quote),'ROUND_ID_NOT_EVIDENCE_DERIVED');
   assert(Number.isFinite(Date.parse(res.confirmedAt))&&Date.parse(res.confirmedAt)>=Date.parse(observedAt)&&Date.parse(res.confirmedAt)<=now,'ROUND_RESOLUTION_CLOCK');
   const schedule=C.reconcile(parsed.schedule.claims||[]);
      assert(schedule.status!=='SCHEDULE_CONFLICT','SCHEDULE_CONFLICT');
   assert(!res.kind||['ROUND_RESOLUTION','RECRUITMENT_CHANGE'].includes(res.kind),'ROUND_RESOLUTION_KIND');
   record.review={
        approved:true,mode:'MOCK_ONLY',kind:res.kind||'ROUND_RESOLUTION',sourceNoticeKey:key,detailHash:H.digest(detail),roundId:res.roundKey,quote:q.quote,reviewedAt:res.confirmedAt,v04EvidenceHash:record.fingerprint
      }
      ;
   record.evidence={
        supplyType:type,supplyTypeEvidence:{
          state:'CONFIRMED',refs:[url],original:copy(supply)
        }
        ,roundResolutionEvidence:copy(res),handoffProvenance:{
          handoffSha256:H.digest(h),originalDisposition:h.disposition,originalRoundKey:h.canonicalRecruitment.roundKey,originalHoldReasons:copy(h.holdReasons),sourceObservationSha256:h.original.observationSha256,capture:copy(captureProof),decisionScope:'SEPARATE_MOCK_CANDIDATE'
        }
        ,officialScheduleEvidence:{
          claims:copy(h.windows.claims),resolved:copy(h.windows.resolved),sourceUrl:url
        }
      }
      ;
  
    }
    catch(error){
      record.reason=String(error.message||error).slice(0,240);
      record.review=null;
    }
  return record;
 
  }
 return {
    assess
  }
  ;
}
module.exports={
  create,roundKey
}
;
