/* 5.2-B v1.1 — executable sender with persistent state; MOCK TRANSPORT ONLY. */
var HousingB11 = (function(){
  'use strict';
  const json=x=>JSON.parse(JSON.stringify(x));
  const stable=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(stable).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';
  function empty(){
    return {
      schema:1,environment:'MOCK_ONLY',revision:0,baseline:null,events:{
      }
      ,deliveries:{
      }
      ,requests:{
      }
      ,reviews:{
      }
    }
    ;
  }
  function assert(ok,msg){
    if(!ok)throw Error(msg);
  }
  function ms(x){
    const n=typeof x==='number'?x:Date.parse(x);
    assert(Number.isFinite(n),'INVALID_CLOCK');
    return n;
  }
  function iso(x){
    return new Date(ms(x)).toISOString();
  }
  function local(x){
    const s=new Date(ms(x)+32400000).toISOString();
    return {
      day:s.slice(0,10),minute:Number(s.slice(11,13))*60+Number(s.slice(14,16))
    }
    ;
  }
  function day(x){
    if(!/^20\d\d-\d\d-\d\d$/.test(String(x)))return false;
    const d=new Date(x+'T00:00:00Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x;
  }
  function atKst(d,t){
    assert(day(d)&&/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(t),'INVALID_SCHEDULE');
    return ms(d+'T'+t+(t.length===5?':00':'')+'+09:00');
  }
  function refs(e){
    return e&&e.state==='CONFIRMED'&&Array.isArray(e.refs)&&e.refs.length>0&&e.refs.every(x=>typeof x==='string'&&/^https:\/\//.test(x));
  }
  function recipient(c){
    assert(c&&c.kind==='PERSONAL'&&c.count===1&&/^[A-Z][A-Z0-9_-]{0,39}$/.test(c.scope),'ONE_PERSONAL_RECIPIENT_REQUIRED');
    assert(!('token'in c)&&!('chat_id'in c),'SECRETS_NOT_ACCEPTED');
  }
  function baseReason(r){
    if(r&&(!['recruitmentId','roundId','modelVersion','opportunityVersion','primarySourceId'].every(k=>typeof r[k]==='string'&&/^[A-Za-z0-9][A-Za-z0-9:_.@\/-]{0,159}$/.test(r[k]))))return 'CANONICAL_IDENTITY_REQUIRED';
    if(!r||r.schema!=='HOUSING_CANONICAL_V1'||!r.recruitmentId||!r.roundId||(!r.modelVersion||!r.opportunityVersion))return 'CANONICAL_IDENTITY_REQUIRED';
    if(r.notificationDecision==='DEFER_TO_INTEGRATOR'||r.deliveryCapability==='NONE'||r.recruitmentRoundKey===null)return 'ADAPTER_NOT_INTEGRATED';
    if(!refs(r.identityEvidence)||!Array.isArray(r.sourceNoticeIds)||!r.sourceNoticeIds.length)return 'IDENTITY_EVIDENCE_REQUIRED';
    if(!/^https:\/\//.test(r.officialUrl||''))return 'OFFICIAL_URL_REQUIRED';
    if(!refs(r.region)||!['SEOUL_GYEONGGI','INCLUDES_TARGET'].includes(r.region.scope))return 'REGION_REVIEW_OR_OUTSIDE';
    if(!refs(r.residential)||r.residential.value!==true||!refs(r.recruitment)||!kinds.includes(r.recruitment.kind))return 'RECRUITMENT_REVIEW';
    return null;
  }
  const kinds=['NEW','NEW_ROUND','REOPEN','ADDITIONAL','UNRANKED','REMAINDER','RESERVE'];
  function sourceReady(r,b,t){
    const a=Object.prototype.hasOwnProperty.call(b.sources,r.primarySourceId)&&b.sources[r.primarySourceId];
    return !!a&&a.state==='INCREMENTAL'&&ms(a.monitoringStartAt)<=t&&ms(b.goLiveAt)<=t;
  }
// Importance is a display/ranking signal, never NEW eligibility.
  function important(r){
    if(r.priority!=='IMPORTANT'||!refs(r.priorityEvidence))return false;
 if(r.priorityEvidence.basis==='TARGET_INTEREST_PROGRAM')return refs(r.interestProgram)&&r.interestProgram.targetRegionConfirmed===true;
 if(r.priorityEvidence.basis!=='TARGET_UNIT_APARTMENT_59')return false;
 return (r.units||[]).some(u=>refs(u.evidence)&&refs(u.region)&&['SEOUL_GYEONGGI','INCLUDES_TARGET'].includes(u.region.scope)&&u.building==='APARTMENT'&&Number.isFinite(u.exclusiveArea)&&u.exclusiveArea>=59);
  }
  function newEligible(r,b,t){
    const s=b.sources[r.primarySourceId];
    if(!sourceReady(r,b,t))return false;
    if(r.origin!=='INCREMENTAL'||!r.firstValidDiscoveryAt||ms(r.firstValidDiscoveryAt)>t||ms(r.firstValidDiscoveryAt)<ms(b.goLiveAt)||ms(r.firstValidDiscoveryAt)<ms(s.monitoringStartAt))return false;
    if(b.knownRecruitmentVersions.includes(r.recruitmentId+'@'+r.opportunityVersion))return false;
    if((r.legacyEventKeys||[]).some(k=>b.legacyEventKeys.includes(k)))return false;
    return true;
  }
  function windowReason(w){
    if(!w||!w.id||!refs(w.evidence)||w.conflict||!day(w.endDate)||!['OPEN','UPCOMING'].includes(w.status))return 'SCHEDULE_REVIEW';
    if(w.timezone!=='Asia/Seoul')return 'SCHEDULE_TIMEZONE';
    if(w.startDate&&(!day(w.startDate)||w.startDate>w.endDate))return 'SCHEDULE_ORDER';
    try{
      if(w.endTime)atKst(w.endDate,w.endTime);
      if(w.startTime)atKst(w.startDate,w.startTime);
      if(w.startDate===w.endDate&&w.startTime&&w.endTime&&atKst(w.startDate,w.startTime)>atKst(w.endDate,w.endTime))return 'SCHEDULE_ORDER';
    }
    catch(_){
      return 'SCHEDULE_REVIEW';
    }
    return null;
  }
  function active(r,t){
    if(!['OPEN','UPCOMING'].includes(r.status))return false;
    const windows=(r.windows||[]).filter(w=>!windowReason(w));
    return !windows.length||windows.some(w=>w.endTime?atKst(w.endDate,w.endTime)>t:w.endDate>=local(t).day);
  }
  function windowVersion(w,hash){
    return hash(stable([w.id,w.startDate||'',w.startTime||'',w.endDate,w.endTime||'',w.channel,w.group,w.unitIds||[]]));
  }
  function makeEvent(r,type,version,w,now,b,hash,c){
    const scheduleWindow=w?w.id+'@'+w.endDate:'NONE',id=hash(stable(['telegram',c.scope,r.recruitmentId,type,[r.roundId,version],scheduleWindow]));
    return {
      key:id,recruitmentId:r.recruitmentId,roundId:r.roundId,type,version,eventSemanticVersion:stable([r.roundId,version]),scheduleWindow,windowId:w?w.id:null,endDate:w?w.endDate:null,expectedWindowVersion:w?windowVersion(w,hash):null,dueAt:w?iso(atKst(local(now).day,'09:00')):iso(now),dueDay:w?local(now).day:null,createdAt:iso(now),sourceNoticeIds:r.sourceNoticeIds.slice(),baselineId:b.id,priority:important(r)?'IMPORTANT':(r.priority==='IMPORTANT'?'REVIEW':r.priority||'UNKNOWN')
    }
    ;
  }
  function build(r,b,now,hash,c){
    const reason=baseReason(r);
    if(reason)return {
      events:[],holds:[reason]
    }
    ;
    const events=[],holds=[];
    if(['HUG_ARCHIVE','ADAPTER_BACKFILL'].includes(r.origin))return {
      events,holds:['BACKFILL_BLOCKED']
    }
    ;
    const eligible=newEligible(r,b,now),live=active(r,now);
    if(eligible&&live&&['NEW','NEW_ROUND','REOPEN','ADDITIONAL','UNRANKED','REMAINDER','RESERVE'].includes(r.recruitment.kind))events.push(makeEvent(r,'NEW',r.opportunityVersion,null,now,b,hash,c));
 for(const ch of r.changes||[]){
      if(!sourceReady(r,b,now)||!ch.version||!ch.observedAt||ms(ch.observedAt)>now||ms(ch.observedAt)<ms(b.sources[r.primarySourceId].monitoringStartAt)||ms(ch.observedAt)<ms(b.goLiveAt)||b.knownChangeVersions.includes(r.recruitmentId+'@'+ch.version))continue;
      const cancellation=ch.fields&&ch.fields.some(f=>f.name==='cancellation');
      if(!live&&!cancellation)continue;
      const meaningful=refs(ch.evidence)&&ch.fields&&ch.fields.length&&ch.fields.every(f=>['start','end','price','deposit','rent','quantity','qualification','cancellation','applicationMethod'].includes(f.name)&&f.before!==undefined&&f.after!==undefined&&stable(f.before)!==stable(f.after));
      if(meaningful){
        const e=makeEvent(r,'CHANGE',ch.version,null,now,b,hash,c);
        e.expectedChangeHash=hash(stable(ch.fields));
        events.push(e);
      }
      else holds.push('CHANGE_UNCLASSIFIED');
    }
 if(eligible&&live)for(const w of r.windows||[]){
      const bad=windowReason(w);
      if(bad){
        holds.push(bad+':'+(w.id||'?'));
        continue;
      }
      const delta=(ms(w.endDate+'T00:00:00Z')-ms(local(now).day+'T00:00:00Z'))/86400000;
      const type=delta===1?'D1':delta===3?'D3':null;
      if(!type)continue;
      if(type==='D3'&&!important(r))continue;
      events.push(makeEvent(r,type,windowVersion(w,hash),w,now,b,hash,c));
    }
 if(!eligible)holds.push('NEW_BASELINE_BLOCKED');
    return {
      events,holds
    }
    ;
  }
  function validateCurrent(event,r,b,now,hash){
    if(event.baselineId!==b.id)return 'BASELINE_CHANGED';
    const bad=baseReason(r);
    if(bad)return bad;
    if(r.roundId!==event.roundId)return 'ROUND_CHANGED';
    if(['HUG_ARCHIVE','ADAPTER_BACKFILL'].includes(r.origin))return 'BACKFILL_BLOCKED';
    if(event.type==='CHANGE'){
      const ch=(r.changes||[]).find(x=>x.version===event.version);
      if(!sourceReady(r,b,now)||!ch||!ch.observedAt||ms(ch.observedAt)>now||ms(ch.observedAt)<ms(b.sources[r.primarySourceId].monitoringStartAt)||!refs(ch.evidence)||ms(ch.observedAt)<ms(b.goLiveAt)||b.knownChangeVersions.includes(r.recruitmentId+'@'+event.version))return 'CHANGE_STALE';
      if(!active(r,now)&&!(ch.fields||[]).some(f=>f.name==='cancellation'))return 'CHANGE_INACTIVE';
      if(!ch.fields||!ch.fields.length||hash(stable(ch.fields))!==event.expectedChangeHash)return 'CHANGE_STALE';
      return null;
    }
 if(!newEligible(r,b,now)||!active(r,now))return 'INACTIVE_OR_BASELINE';
    if(event.type==='NEW')return r.opportunityVersion===event.version?null:'NEW_VERSION_CHANGED';
    const w=(r.windows||[]).find(x=>x.id===event.windowId);
    if(windowReason(w)||windowVersion(w,hash)!==event.expectedWindowVersion)return 'WINDOW_CHANGED';
    const delta=(ms(w.endDate+'T00:00:00Z')-ms(local(now).day+'T00:00:00Z'))/86400000;
    if(delta!==(event.type==='D1'?1:3)||local(now).day!==event.dueDay)return 'REMINDER_EXPIRED';
    if(event.type==='D3'&&!important(r))return 'PRIORITY_CHANGED';
    return null;
  }
  function current(e,r,b,t,h){
    try{
      return validateCurrent(e,r,b,t,h);
    }
    catch(_){
      return 'MODEL_INVALID';
    }
  }
  function title(s,max){
    return Array.from(String(s||'공식 모집공고')).slice(0,max).join('');
  }
  function itemText(e,r){
    const star=important(r)?'★중요★ ':'',header=e.type==='NEW'?'신규 모집':e.type==='CHANGE'?'중요 정정':'접수 마감 '+(e.type==='D1'?'D-1':'D-3');
    let lines=[star+'['+header+'] '+title(r.title,160),'기관: '+title(r.supplier||'원문 확인',100),'공급지역: '+title(r.region.label||'서울·경기 공식 공급',100)];
    if(e.type==='CHANGE'){
      const ch=r.changes.find(x=>x.version===e.version);
      for(const f of ch.fields)lines.push(title(f.name,40)+': '+title(stable(f.before),200)+' → '+title(stable(f.after),200));
    }
    else if(e.windowId){
      const w=r.windows.find(x=>x.id===e.windowId);
      lines.push('접수창: '+title(w.group||'',80)+' / '+title(w.channel||'',80),'마감: '+w.endDate+(w.endTime?' '+w.endTime:' (정확한 시각 원문 확인)')+' KST');
    }
    else{
      const good=(r.windows||[]).filter(w=>!windowReason(w));
      lines.push(good.length?'접수: '+good.map(w=>w.endDate+(w.endTime?' '+w.endTime:'')).join(' / '):'접수기간 확인 필요');
    }
    lines.push('신청자격: 공고문 기준 별도 확인',r.officialUrl);
    return lines.join('\n');
  }
  const mockSet=new WeakSet();
  function createMockAdapter(script){
    const queue=json(script||[]),calls=[];
    const adapter=Object.freeze({
      kind:'MOCK_ONLY',network:false,calls:()=>json(calls),send(payload,ctx){
        assert(payload.recipientScope&&!('chat_id'in payload)&&!('token'in payload),'MOCK_NO_SECRETS');
        calls.push(json({
          payload,at:ctx.at,requestId:ctx.requestId
        }
        ));
        const x=queue.length?queue.shift():{
          kind:'OK'
        }
        ;
        if(x.kind==='THROW')throw Error('MOCK_TRANSPORT_RESULT_UNKNOWN');
        if(x.kind==='API_ERROR')return {
          ok:false,error_code:x.code,parameters:x.retryAfter?{
            retry_after:x.retryAfter
          }
          :undefined
        }
        ;
        if(x.kind==='MALFORMED')return {
        }
        ;
        return {
          ok:true,result:{
            message_id:1000+calls.length,date:Math.floor(ms(ctx.at)/1000)
          }
        }
        ;
      }
    }
    );
    mockSet.add(adapter);
    return adapter;
  }
  class MemoryStore{
    constructor(){
      this.data=empty();
      this.locked=false;
    }
    read(){
      return json(this.data);
    }
    transaction(fn){
      assert(!this.locked,'STORE_BUSY');
      this.locked=true;
      try{
        const next=json(this.data),value=fn(next);
        if(stable(next)!==stable(this.data)){
          next.revision++;
          this.data=json(next);
        }
        return json(value===undefined?null:value);
      }
      finally{
        this.locked=false;
      }
    }
  }
  class ModelRepository{
    constructor(rows){
      this.rows={
      }
      ;
      for(const r of rows||[])this.set(r);
    }
    get(id){
      return this.rows[id]?json(this.rows[id]):null;
    }
    set(r){
      assert(r&&r.recruitmentId,'MODEL_ID');
      this.rows[r.recruitmentId]=json(r);
    }
  }
  function engine(options){
    const o=options||{
    }
    ;
    recipient(o.recipient);
    assert(o.mode==='MOCK_ONLY'&&o.store&&o.models&&typeof o.hash==='function','MOCK_ENGINE_CONFIG_REQUIRED');
    const adapter=o.adapter||createMockAdapter();
    assert(mockSet.has(adapter),'LIVE_ADAPTER_FORBIDDEN');
    assert(o.store.read().environment==='MOCK_ONLY','LEDGER_ENVIRONMENT_MISMATCH');const existing=o.store.read().baseline;
    if(existing)assert(existing.recipientScope===o.recipient.scope,'RECIPIENT_BASELINE_MISMATCH');
    const store=o.store,hash=o.hash,clock=o.clock||(()=>Date.now()),id=o.id||(()=>String(Date.now())+'-'+Math.random()),fault=o.fault||(()=>{
    }
    ),scope=o.recipient;
    const now=()=>ms(clock());
 function freezeBaseline(b){
      assert(b&&b.approved===true&&b.approvalScope==='MOCK_ONLY'&&b.id&&b.sources,'EXPLICIT_MOCK_BASELINE_REQUIRED');
      ms(b.goLiveAt);
      for(const s of Object.values(b.sources)){
        assert(s.state==='INCREMENTAL','SOURCE_BASELINE_INCOMPLETE');
        ms(s.monitoringStartAt);
      }
      const normalized={
        id:b.id,goLiveAt:iso(b.goLiveAt),sources:json(b.sources),knownRecruitmentVersions:(b.knownRecruitmentVersions||[]).slice().sort(),knownChangeVersions:(b.knownChangeVersions||[]).slice().sort(),legacyEventKeys:(b.legacyEventKeys||[]).slice().sort(),recipientScope:scope.scope,approved:true
      }
      ;
      normalized.hash=hash(stable(normalized));
      return store.transaction(s=>{
        if(s.baseline){
          assert(s.baseline.hash===normalized.hash,'BASELINE_IMMUTABLE');
          return s.baseline.id;
        }
        s.baseline=normalized;
        return normalized.id;
      }
      );
    }
 function ingest(rows){
      const b=store.read().baseline;
      assert(b,'BASELINE_NOT_APPROVED');
      let added=0;
      const review=[];
      assert(Array.isArray(rows),'ROWS_ARRAY_REQUIRED');
      // Bounded journal transactions; retries preserve already committed event keys.
      for(let offset=0;offset<rows.length;offset+=100){
      store.transaction(s=>{
        assert(s.baseline.hash===b.hash,'BASELINE_CHANGED');
        const index=new Map();
        for(const e of Object.values(s.events)){if(!index.has(e.recruitmentId))index.set(e.recruitmentId,[]);index.get(e.recruitmentId).push(e.key);}
        for(const r of rows.slice(offset,offset+100)){
          let built;
          try{
            built=build(r,b,now(),hash,scope);
          }
          catch(_){
            built={
              events:[],holds:['MODEL_INVALID']
            }
            ;
          }
          for(const reason of built.holds){
            const k=hash(stable([r&&r.recruitmentId,r&&r.modelVersion,reason]));
            s.reviews[k]=s.reviews[k]||{
              at:iso(now()),recruitmentId:r&&r.recruitmentId||null,reason
            }
            ;
            review.push(reason);
          }
          for(const e of built.events){
            if(s.events[e.key]){
              assert(s.events[e.key].roundId===e.roundId,'EVENT_KEY_COLLISION');
              const old=s.deliveries[e.key];
              if((old.state==='HOLD'||(old.state==='SUPPRESSED'&&old.reason!=='ALREADY_COVERED'))&&!current(s.events[e.key],r,s.baseline,now(),hash)){
                old.state='PENDING';
                old.reason=null;
              }
              s.events[e.key].sourceNoticeIds=[...new Set(s.events[e.key].sourceNoticeIds.concat(e.sourceNoticeIds))];
              continue;
            }
            s.events[e.key]=e;
            s.deliveries[e.key]={
              key:e.key,state:'PENDING',attempt:0,createdAt:iso(now()),nextRetryAt:e.dueAt,requestId:null
            }
            ;
            if(!index.has(e.recruitmentId))index.set(e.recruitmentId,[]);index.get(e.recruitmentId).push(e.key);
            added++;
          }
          for(const key of index.get(r&&r.recruitmentId)||[]){
            const d=s.deliveries[key],e=s.events[key];
            if(e.recruitmentId!==r.recruitmentId||!['PENDING','RETRY_WAIT','HOLD'].includes(d.state))continue;
            const bad=current(e,r,s.baseline,now(),hash);
            if(bad){
              d.state='SUPPRESSED';
              d.reason=bad;
            }
          }
        }
      }
      );
      }
      return {
        added,reviews:review
      }
      ;
    }
 function recover(){
      return store.transaction(s=>{
        let unknown=0,released=0;
        for(const d of Object.values(s.deliveries)){
          if(!['CLAIMED','REQUEST_STARTED'].includes(d.state)||ms(d.leaseUntil)>now())continue;
          if(d.state==='REQUEST_STARTED'){
            d.state='UNKNOWN_DELIVERY';
            d.reason='REQUEST_MAY_HAVE_BEEN_ACCEPTED';
            unknown++;
            if(s.requests[d.requestId])s.requests[d.requestId].state='UNKNOWN_DELIVERY';
          }
          else{
            d.state='PENDING';
            d.reason='CLAIM_EXPIRED_BEFORE_REQUEST_MARKER';
            if(s.requests[d.requestId])s.requests[d.requestId].state='EXPIRED_BEFORE_REQUEST';
            released++;
          }
        }
        return {
          unknown,released
        }
        ;
      }
      );
    }
 function uncertainOverlap(s,e,t,history){
      if(!['D1','D3'].includes(e.type))return false;
      return (history.get(e.recruitmentId)||[]).some(d=>{
        if(!['UNKNOWN_DELIVERY','REQUEST_STARTED','CLAIMED'].includes(d.state))return false;
        const p=s.events[d.key];
        if(!p||p.key===e.key||p.recruitmentId!==e.recruitmentId||p.roundId!==e.roundId)return false;
        if(p.type===e.type&&p.windowId===e.windowId&&p.endDate===e.endDate&&p.dueDay===e.dueDay)return true;
        return e.type==='D1'&&p.type==='NEW'&&d.requestStartedAt&&local(d.requestStartedAt).day===local(t).day&&(d.attemptedWindows||[]).includes(e.scheduleWindow);
      }
      );
    }
 function covered(s,e,r,t,history){
      if(!['D1','D3'].includes(e.type))return false;
      return (history.get(e.recruitmentId)||[]).some(d=>{
        if(d.state!=='DELIVERED')return false;
        const prev=s.events[d.key];
        if(!prev||prev.recruitmentId!==e.recruitmentId||prev.roundId!==e.roundId)return false;
        if(prev.type===e.type&&prev.windowId===e.windowId&&prev.endDate===e.endDate&&prev.dueDay===e.dueDay)return true;
        return e.type==='D1'&&prev.type==='NEW'&&local(d.sentAt).day===local(t).day&&(d.coveredWindows||[]).includes(e.scheduleWindow);
      }
      );
    }
 function dispatchOne(){
      recover();
      const requestId='MOCK:'+id(),claim=store.transaction(s=>{
        assert(s.baseline,'BASELINE_NOT_APPROVED');
        const t=now(),candidates=[],history=new Map();
        for(const d of Object.values(s.deliveries)){const e=s.events[d.key];if(!history.has(e.recruitmentId))history.set(e.recruitmentId,[]);history.get(e.recruitmentId).push(d);}
        for(const d of Object.values(s.deliveries)){
          if(!['PENDING','RETRY_WAIT'].includes(d.state)||ms(d.nextRetryAt)>t)continue;
          const e=s.events[d.key],r=o.models.get(e.recruitmentId),bad=current(e,r,s.baseline,t,hash);
          if(bad){
            d.state='SUPPRESSED';
            d.reason=bad;
            continue;
          }
          if(uncertainOverlap(s,e,t,history)){
            d.state='HOLD';
            d.reason='PREVIOUS_RESULT_UNKNOWN';
            continue;
          }
          if(covered(s,e,r,t,history)){
            d.state='SUPPRESSED';
            d.reason='ALREADY_COVERED';
            continue;
          }
          if(d.attempt>=3){
            d.state='PERMANENT_REVIEW';
            d.reason='ATTEMPT_LIMIT';
            continue;
          }
          candidates.push({
            d,e,r
          }
          );
        }
        candidates.sort((a,b)=>({
          NEW:0,CHANGE:1,D3:2,D1:3
        }
        [a.e.type]-{
          NEW:0,CHANGE:1,D3:2,D1:3
        }
        [b.e.type])||(important(a.r)?0:1)-(important(b.r)?0:1)||a.e.dueAt.localeCompare(b.e.dueAt)||a.e.key.localeCompare(b.e.key));
        if(!candidates.length)return null;
        const group=[candidates[0]],d1=candidates[0].e.type==='D1';
        let text=itemText(group[0].e,group[0].r);
        if(text.length>3500){
          group[0].d.state='HOLD';
          group[0].d.reason='MESSAGE_TOO_LONG';
          return null;
        }
        if(d1)for(const c of candidates.slice(1)){
          if(c.e.type!=='D1'||group.length>=8)continue;
          const next=text+'\n\n'+itemText(c.e,c.r);
          if(next.length>3500)continue;
          group.push(c);
          text=next;
        }
        const keys=group.map(c=>c.e.key);
        for(const c of group){
          c.d.state='CLAIMED';
          c.d.attempt++;
          c.d.requestId=requestId;
          c.d.claimAt=iso(t);
          c.d.leaseUntil=iso(t+120000);
        }
        assert(!s.requests[requestId],'REQUEST_ID_COLLISION');
        s.requests[requestId]={
          id:requestId,state:'CLAIMED',keys,createdAt:iso(t),payloadHash:hash(text)
        }
        ;
        return {
          keys,text
        }
        ;
      }
      );
      if(!claim)return {
        state:'IDLE'
      }
      ;
      fault('AFTER_CLAIM');
 store.transaction(s=>{
        const q=s.requests[requestId];
        assert(q&&q.state==='CLAIMED','CLAIM_LOST');
        for(const k of claim.keys){
          const d=s.deliveries[k];
          assert(d.state==='CLAIMED'&&d.requestId===requestId&&ms(d.leaseUntil)>now(),'CLAIM_LOST');
          const e=s.events[k],bad=current(e,o.models.get(e.recruitmentId),s.baseline,now(),hash);
          if(bad){
            for(const key of claim.keys){
              s.deliveries[key].state='SUPPRESSED';
              s.deliveries[key].reason='BATCH_INPUT_CHANGED';
            }
            q.state='SUPPRESSED';
            return;
          }
        }
        for(const k of claim.keys){
          s.deliveries[k].state='REQUEST_STARTED';
          s.deliveries[k].requestStartedAt=iso(now());
          const r=o.models.get(s.events[k].recruitmentId);
          s.deliveries[k].attemptedWindows=(r.windows||[]).filter(w=>!windowReason(w)).map(w=>w.id+'@'+w.endDate);
        }
        q.state='REQUEST_STARTED';
      }
      );
      fault('AFTER_REQUEST_MARKER');
      const markerState=store.read().requests[requestId].state;
      if(markerState!=='REQUEST_STARTED')return {
        state:markerState,requestId
      }
      ;
 const check=store.read();
      if(check.requests[requestId].state!=='REQUEST_STARTED'||claim.keys.some(k=>check.deliveries[k].requestId!==requestId||check.deliveries[k].state!=='REQUEST_STARTED'||ms(check.deliveries[k].leaseUntil)<=now()))return {
        state:'UNKNOWN_DELIVERY',requestId,reason:'REQUEST_OWNERSHIP_EXPIRED'
      }
      ;
      if(claim.keys.some(k=>current(check.events[k],o.models.get(check.events[k].recruitmentId),check.baseline,now(),hash))){
        store.transaction(s=>{
          for(const k of claim.keys){
            s.deliveries[k].state='SUPPRESSED';
            s.deliveries[k].reason='FINAL_REVALIDATION';
          }
          s.requests[requestId].state='SUPPRESSED';
        }
        );
        return {
          state:'SUPPRESSED'
        }
        ;
      }
 const latestText=claim.keys.map(k=>{
        const e=check.events[k];
        return itemText(e,o.models.get(e.recruitmentId));
      }
      ).join('\n\n');
      if(latestText.length>3500){
        store.transaction(s=>{
          for(const k of claim.keys){
            s.deliveries[k].state='HOLD';
            s.deliveries[k].reason='MESSAGE_SIZE_CHANGED';
          }
          s.requests[requestId].state='SUPPRESSED';
        }
        );
        return {
          state:'HOLD'
        }
        ;
      }
      const attemptedAt=iso(now()),minute=local(attemptedAt).minute,payload={
        recipientScope:scope.scope,text:latestText,disable_notification:minute>=1380||minute<420,parse_mode:null
      }
      ;
      let response,unknown=false;
      try{
        response=adapter.send(payload,{
          at:attemptedAt,requestId
        }
        );
      }
      catch(_){
        unknown=true;
      }
      fault('AFTER_MOCK_RESPONSE');
 const classification=unknown||!response||typeof response.ok!=='boolean'?'UNKNOWN_DELIVERY':response.ok?(response.result&&Number.isInteger(response.result.message_id)&&response.result.message_id>0&&Number.isFinite(response.result.date)&&response.result.date>0?'DELIVERED':'UNKNOWN_DELIVERY'):([500,502,503,504].includes(response.error_code)||(response.error_code===429&&Number.isFinite(response.parameters&&response.parameters.retry_after)&&response.parameters.retry_after>0))?'RETRY_WAIT':'PERMANENT_REVIEW';
 try{
        store.transaction(s=>{
          const q=s.requests[requestId];
          assert(q&&q.state==='REQUEST_STARTED','REQUEST_STATE_CONFLICT');
          q.state=classification;
          q.attemptedAt=attemptedAt;
          q.disable_notification=payload.disable_notification;
          q.payloadHash=hash(payload.text);
          for(const k of claim.keys){
            const d=s.deliveries[k];
            assert(d.requestId===requestId&&d.state==='REQUEST_STARTED','DELIVERY_OWNERSHIP_LOST');
            d.state=classification;
            d.lastAttemptAt=attemptedAt;
            if(classification==='DELIVERED'){
              d.sentAt=attemptedAt;
              d.messageId=response.result.message_id;
              d.serverTimestamp=response.result.date;
              const r=o.models.get(s.events[k].recruitmentId);
              d.coveredWindows=(r.windows||[]).filter(w=>!windowReason(w)).map(w=>w.id+'@'+w.endDate);
            }
            else if(classification==='RETRY_WAIT'){
              const retry=response.error_code===429&&response.parameters&&response.parameters.retry_after;
              d.nextRetryAt=iso(now()+Math.max(Number(retry)||0,Math.min(3600,60*Math.pow(2,d.attempt-1)))*1000);
              d.errorCode=response.error_code;
            }
            else d.reason=classification==='UNKNOWN_DELIVERY'?'RESULT_UNKNOWN_NO_AUTO_RETRY':'API_REJECTED';
          }
        }
        );
      }
      catch(_){
        return {
          state:'UNKNOWN_DELIVERY',requestId,persistedState:'REQUEST_STARTED_OR_COMMIT_UNCERTAIN'
        }
        ;
      }
 return {
        state:classification,requestId,count:claim.keys.length
      }
      ;
    }
 return Object.freeze({
      freezeBaseline,ingest,dispatchOne,recover,inspect:()=>store.read(),adapter
    }
    );
  }
  return Object.freeze({
    engine,MemoryStore,ModelRepository,createMockAdapter,empty,stable,local,build,baseReason,windowReason,important
  }
  );
}
)();
if(typeof module!=='undefined'&&module.exports)module.exports=HousingB11;
