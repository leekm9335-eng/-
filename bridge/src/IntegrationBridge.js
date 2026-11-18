/* Offline integration core. Dependencies injected; no HTTP, Google access or transport. */
var HousingIntegrationBridge = (function(){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  function check(ok,reason){
    if(!ok)throw Error('BRIDGE_'+reason);
  }
  function stamp(v){
    check(typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v)),'TIMESTAMP_REQUIRED');
    return Date.parse(v);
  }
  const routes={
    SOCO:{
      hosts:['soco.seoul.go.kr'],prefix:'SOCO_YOUTH:BMSR00015:'
    }
    ,HUG_NOTICE:{
      hosts:['www.khug.or.kr'],prefix:'HUG_NOTICE:1295:'
    }
    ,NANUM:{
      hosts:['www.yesnanum.org'],prefix:'NANUM:'
    }
    ,ONEROOF:{
      hosts:['www.xn--9r3bn6tz4i.kr'],prefix:'ONEROOF:'
    }
    ,MZIP:{
      hosts:['mzip.kr'],prefix:'MZIP:'
    }
    ,PAJU:{
      hosts:['www.paju.go.kr','paju.go.kr'],prefix:'PAJU:'
    }
    ,UUC:{
      hosts:['uuc.or.kr'],prefix:'UUC:'
    }
  }
  ;
  function official(url,route){
    const m=String(url||'').match(/^https:\/\/([a-z0-9.-]+)(\/[^\s\\]*)$/i);
    return !!m&&!!routes[route]&&routes[route].hosts.includes(m[1].toLowerCase())&&!/[\u0000-\u001f\u007f]/.test(url);
  }
  function root(state){
    if(!state.bridge)state.bridge={
      schema:1,mode:'MOCK_ONLY',activations:{
      }
      ,sourceBaselines:{
      }
      ,baselineSources:{
      }
      ,observations:{
      }
      ,details:{
      }
      ,masters:{
      }
      ,decisions:{
      }
      ,canonical:{
      }
      ,reviews:{
      }
      ,history:{
      }
      ,links:{
      }
      ,receipts:{
      }
    }
    ;
    if(!state.bridge.decisions)state.bridge.decisions={
    }
    ;
    check(state.bridge.schema===1&&state.bridge.mode==='MOCK_ONLY','CENTRAL_SCHEMA');
    return state.bridge;
  }
  function create(o){
 check(o&&o.mode==='MOCK_ONLY'&&o.store&&o.stage&&o.parser&&o.a6&&o.hash&&o.sender&&o.gate,'MOCK_DEPENDENCIES_REQUIRED');
 const hash=o.hash,now=()=>Number(o.clock()),digest=x=>hash(o.stable(x));
 const inspect=()=>root(o.store.read());
 function activate(config){
  check(config&&config.approved===true&&config.mode==='MOCK_ONLY'&&routes[config.source]&&config.baselineId,'SOURCE_APPROVAL_REQUIRED');
  const baseline=o.sender.inspect().baseline;
      check(baseline&&baseline.id===config.baselineId,'SENDER_BASELINE_REQUIRED');
  const source=baseline.sources[config.source];
      check(source&&source.state==='INCREMENTAL','SOURCE_NOT_IN_BASELINE');
  check(stamp(config.incrementalAt)===stamp(source.monitoringStartAt),'ACTIVATION_BOUNDARY_MISMATCH');
  const c={
        source:config.source,baselineId:config.baselineId,incrementalAt:config.incrementalAt,mode:'MOCK_ONLY',approved:true
      }
      ;
  c.hash=digest(c);
      return o.store.transaction(s=>{
        const b=root(s),proof=b.sourceBaselines[c.source];
        check(proof&&proof.snapshotId===config.baselineSnapshotId&&proof.commitRef===config.baselineCommitRef,'VERIFIED_SOURCE_BASELINE_REQUIRED');
        const old=b.activations[c.source];
        check(!old||old.hash===c.hash,'ACTIVATION_IMMUTABLE');
        b.activations[c.source]=c;
        return c.hash;
      }
      );
 
    }
 function registerBaseline(input){
  const sink=o.stage.createMemory();
      sink.importJournal(copy(input.transactions));
      const last=input.transactions[input.transactions.length-1];
  check(last&&['SOCO','HUG_NOTICE'].includes(last.source)&&input.transactions.every(t=>!t.page||t.page.coverage!=='OBSERVATION_BATCH_ONLY')&&last.cursor.mode==='INITIAL_BASELINE'&&last.cursor.status==='COMPLETE'&&input.transactions.every(t=>t.source===last.source&&t.snapshotId===last.snapshotId),'COMPLETE_INITIAL_SOURCE_BASELINE_REQUIRED');
  const existing=inspect().sourceBaselines[last.source];
      if(existing){
        check(existing.commitRef===last.commitRef&&existing.snapshotId===last.snapshotId,'SOURCE_BASELINE_IMMUTABLE');
        return {
          mode:'MOCK_ONLY',alreadyRegistered:true
        }
        ;
      }
      check(!inspect().activations[last.source],'SOURCE_BASELINE_IMMUTABLE');
  const result=processJournal(input);
      o.store.transaction(s=>{
        const b=root(s),old=b.sourceBaselines[last.source],proof={
          source:last.source,snapshotId:last.snapshotId,commitRef:last.commitRef,uniqueCount:last.cursor.uniqueCount,idSetSha256:last.cursor.idSetSha256
        }
        ;
        check(!b.activations[last.source]&&(!old||o.stable(old)===o.stable(proof)),'SOURCE_BASELINE_IMMUTABLE');
        b.sourceBaselines[last.source]=proof;
      }
      );
      return result;
 
    }
 function adjudicate(envelope,detail,observedAt,prior,review,intake){
  const stage=envelope.stage,key=envelope.sourceNoticeKey,source=stage.source,obs=envelope.observation;
  check(routes[source]&&key.startsWith(routes[source].prefix),'SOURCE_NAMESPACE');
  const originalUrl=obs.detailUrl||obs.url;
      check(official(originalUrl,source),'OFFICIAL_SOURCE_URL');
  let parsed;
  if(detail){
   check(detail.status===200&&detail.url===originalUrl&&official(detail.url,source),'DETAIL_IDENTITY');
   if(source==='SOCO')parsed=o.parser.soco(detail,obs.listRecord||obs);
   else if(source==='HUG_NOTICE')parsed=o.parser.hug(detail);
   else check(false,'DETAIL_ADAPTER_NOT_CONNECTED');
  
      }
      else if(obs.schemaVersion==='0.2'&&obs.bodyText&&obs.url)parsed=copy(obs);
  else check(false,'DETAIL_REQUIRED');
  check(parsed.sourceNoticeKey===key&&parsed.url===originalUrl,'PARSED_IDENTITY');
  // Raw Work policy remains unmodified; this is a separate downstream decision.
  check(parsed.deliveryCapability==='NONE'&&parsed.notificationDecision==='DEFER_TO_INTEGRATOR'&&parsed.recruitmentRoundKey===null,'WORK_DETAIL_CONTRACT');
  const rawHash=digest(detail||parsed),body=String(parsed.bodyText||''),url=parsed.url;
  const listContent=(obs.raw||{
      }
      ).content;
      if(typeof listContent==='string'&&listContent.trim())check(o.parser.normalizeContent(listContent)===body.replace(/\s+/g,' ').trim(),'LIST_DETAIL_CONTENT_CONFLICT');
  let verifiedReview=false;
  if(review){
        check(review.approved===true&&review.mode==='MOCK_ONLY'&&review.sourceNoticeKey===key&&review.detailHash===rawHash&&review.quote&&body.includes(review.quote),'REVIEW_EVIDENCE');
        check(stamp(review.reviewedAt)<=now(),'FUTURE_REVIEW');
        verifiedReview=true;
      }
  if(verifiedReview&&review.roundId)check(typeof review.roundId==='string'&&/^[A-Za-z0-9][A-Za-z0-9:_.@\/-]{0,159}$/.test(review.roundId),'ROUND_ID');
  if(verifiedReview&&review.kind==='RECRUITMENT_CHANGE')check(o.a6.action(parsed.title+' '+review.quote),'NEW_ROUND_ACTION_EVIDENCE');
  const evidence={
        recruitmentChangeConfirmed:verifiedReview&&review.kind==='RECRUITMENT_CHANGE'&&!!review.roundId
      }
      ;
  const noticeKind=o.a6.noticeKind(parsed.title,evidence);
  if(noticeKind==='EXCLUDED')return {
        reason:'RESULT_OR_NON_RECRUITMENT',parsed,rawHash,noticeKind
      }
      ;
  if(noticeKind==='REVIEW')return {
        reason:'RECRUITMENT_REVIEW',parsed,rawHash,noticeKind
      }
      ;
  if(/채용|입찰|매도신청|주택\s*매입|운영기관|사업자\s*모집/.test(parsed.title))return {
        reason:'NON_RESIDENTIAL_RECRUITMENT',parsed,rawHash,noticeKind
      }
      ;
  if(!/입주자|주택|아파트|(?:공공|민간).*임대/.test(parsed.title+' '+body))return {
        reason:'RESIDENTIAL_REVIEW',parsed,rawHash,noticeKind
      }
      ;
  const locations=body.split(/\n/).map(x=>x.trim()).filter(x=>/^[■●\s]*(?:주택\s*위치|공급\s*위치|공급\s*소재지|사업\s*위치)\s*[:：]/.test(x));
  const row=prior?prior.row.slice():Array(40).fill(''),geo=o.a6.region(row,{
        address:locations.join('\n'),_supplyRegion:''
      }
      );
  if(!locations.length||!['서울·경기','서울·경기 포함/복수'].includes(geo.group))return {
        reason:geo.group==='서울·경기 외'?'OUTSIDE_TARGET':'REGION_REVIEW',parsed,rawHash,geo,noticeKind
      }
      ;
  const allClaims=parsed.schedule&&parsed.schedule.claims||[];
  // Recompute reconciliation from evidence; never trust deadlineDateResolved flags alone.
  for(const claim of allClaims){
        check(claim.evidence&&claim.evidence.origin&&claim.evidence.origin.url===url&&claim.evidence.origin.layer==='WEB_BODY'&&typeof claim.evidence.quote==='string'&&body.replace(/\s+/g,' ').includes(claim.evidence.quote.replace(/\s+/g,' ')),'SCHEDULE_EVIDENCE');
      }
  const schedule=o.parser.reconcile(allClaims);
  if(schedule.status==='SCHEDULE_CONFLICT')return {
        reason:'SCHEDULE_CONFLICT',parsed,rawHash,geo,noticeKind
      }
      ;
  const windows=[];
  for(const w of schedule.resolvedWindows){
   check(w.kind==='APPLICATION_WINDOW'&&w.start&&w.end&&w.start.timezone==='Asia/Seoul'&&w.end.timezone==='Asia/Seoul','SCHEDULE_TYPE');
   const refs={
          state:'CONFIRMED',refs:[url]
        }
        ,id='W:'+digest([w.kind,w.channel,'UNSPECIFIED_GROUP']).slice(0,24);
   const canonical={
          id,evidence:refs,timezone:'Asia/Seoul',startDate:w.start.date,startTime:w.start.time,endDate:w.end.date,endTime:w.end.time,status:'OPEN',channel:w.channel,group:'대상군 원문 확인',unitIds:[]
        }
        ;
   check(!o.windowReason(canonical),'SCHEDULE_INVALID');
        windows.push(canonical);
  
      }
  if(windows.length&&windows.every(w=>Date.parse(w.endDate+'T'+(w.endTime||'23:59:59')+'+09:00')<=now()))return {
        reason:'DEADLINE_PAST',parsed,rawHash,geo,noticeKind
      }
      ;
  const marker=/무순위/.test(parsed.title)?'UNRANKED':/잔여세대/.test(parsed.title)?'REMAINDER':/재모집|재공급/.test(parsed.title)?'REOPEN':/추가.*모집|추가접수/.test(parsed.title)?'ADDITIONAL':verifiedReview&&evidence.recruitmentChangeConfirmed?'NEW_ROUND':'NEW';
  if(prior&&prior.canonical&&prior.detailHash===rawHash&&o.stable(prior.canonical.windows)!==o.stable(windows))return {
        reason:'PARSER_ONLY_SCHEDULE_REVIEW',parsed,rawHash,geo,noticeKind
      }
      ;
  const recruitmentId='BR:'+digest(key).slice(0,24),roundId=verifiedReview&&review.roundId?review.roundId:prior&&prior.roundId||'R:'+digest([key,marker]).slice(0,24);
  if(prior&&prior.marker&&prior.marker!==marker&&!(evidence.recruitmentChangeConfirmed&&review.roundId!==prior.roundId))return {
        reason:'ROUND_CHANGE_REVIEW',parsed,rawHash,geo,noticeKind
      }
      ;
  const refs={
        state:'CONFIRMED',refs:[url]
      }
      ,interest=/미리내집|장기전세|신혼부부|신생아/.test(parsed.title)&&!/제외|아님|불가|해당없|비대상/.test(parsed.title);
  const units=[];
      for(const line of body.split(/\n/).map(x=>x.trim()).filter(x=>/^[■●\s]*(?:공급)?주택형\s*[:：]/.test(x))){
        const a=line.match(/전용(?:면적)?\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:㎡|m2|m²)/i),g=o.a6.region(Array(40).fill(''),{
          address:line,_supplyRegion:''
        }
        );
        if(a&&/아파트/.test(line)&&['서울·경기','서울·경기 외'].includes(g.group))units.push({
          building:'APARTMENT',exclusiveArea:Number(a[1]),evidence:{
            ...refs,quote:line
          }
          ,region:{
            ...refs,scope:g.group==='서울·경기'?'SEOUL_GYEONGGI':'OUTSIDE'
          }
        }
        );
      }
  const importantUnit=units.some(u=>u.region.scope==='SEOUL_GYEONGGI'&&u.exclusiveArea>=59),important=interest||importantUnit;
  const r={
        schema:'HOUSING_CANONICAL_V1',recruitmentId,roundId,modelVersion:'BRIDGE_P1:'+rawHash.slice(0,24),opportunityVersion:roundId,primarySourceId:source,sourceNoticeIds:[key],identityEvidence:refs,officialUrl:url,title:parsed.title,supplier:parsed.listRecord&&parsed.listRecord.supplierNameHint||obs.supplierNameHint||source,origin:'INCREMENTAL',firstValidDiscoveryAt:prior&&prior.roundId===roundId?prior.firstValidDiscoveryAt:observedAt,region:{
          ...refs,scope:geo.group==='서울·경기'?'SEOUL_GYEONGGI':'INCLUDES_TARGET',label:locations.join(' / ')
        }
        ,residential:{
          ...refs,value:true
        }
        ,recruitment:{
          ...refs,kind:marker
        }
        ,status:'OPEN',priority:important?'IMPORTANT':units.length?'NORMAL':'REVIEW',priorityEvidence:{
          ...refs,basis:importantUnit?'TARGET_UNIT_APARTMENT_59':'TARGET_INTEREST_PROGRAM'
        }
        ,interestProgram:{
          ...refs,targetRegionConfirmed:interest
        }
        ,units,windows,changes:[],bridgeProvenance:{
          sourceNoticeKey:key,originalStageMode:stage.mode,originalEventEmissionAllowed:false,detailHash:rawHash,adjudicator:'A6_NOTICE_REGION_PLUS_WORK_SCHEDULE_V1'
        }
      }
      ;
  // Extra evidence is attached only after the normal A6/staging eligibility gates.
  if(intake&&intake.evidence)for(const name of ['supplyType','supplyTypeEvidence','roundResolutionEvidence','handoffProvenance','officialScheduleEvidence'])if(intake.evidence[name]!==undefined)r[name]=copy(intake.evidence[name]);
  // Official semantic changes require changed raw detail, not a parser-only revision.
  if(prior&&prior.roundId===roundId&&prior.canonical&&prior.detailHash!==rawHash){
   const fields=[];
        for(const w of windows){
          const old=prior.canonical.windows.find(x=>x.id===w.id);
          if(old)for(const name of ['startDate','startTime','endDate','endTime'])if(old[name]!==w[name])fields.push({
            name:name.startsWith('start')?'start':'end',before:old[name],after:w[name],windowId:w.id,field:name
          }
          );
        }
   if(fields.length)r.changes=[{
          version:'C:'+digest([prior.detailHash,rawHash,fields,observedAt]).slice(0,24),observedAt,evidence:refs,fields
        }
        ];
  
      }
  if(prior&&prior.canonical){
        for(const ch of prior.canonical.changes||[])if(!r.changes.some(x=>x.version===ch.version))r.changes.push(ch);
      }
  if(r.supplyType)row[3]=r.supplyType;
  row[0]=recruitmentId;
      row[1]=prior?prior.row[1]:observedAt;
      row[2]=obs.postedDateDisplay||obs.postedDate||'';
      row[4]=source;
      row[5]=r.title;
      row[8]=r.region.label;
      row[17]=windows[0]&&windows[0].startDate||'';
      row[18]=windows[0]&&windows[0].endDate||'';
      row[26]=url;
  return {
        canonical:r,parsed,rawHash,geo,row,marker,noticeKind
      }
      ;
 
    }
 function processJournalData(input){
  check(input&&Array.isArray(input.transactions)&&input.transactions.length>0,'JOURNAL_REQUIRED');
  // Replay the actual Work protocol, including namespace, hash chain and envelope invariants.
  const sink=o.stage.createMemory();
      sink.importJournal(copy(input.transactions));
  const items=[];
      for(const tx of input.transactions)for(const e of tx.observations||[])items.push({
        envelope:e,observedAt:tx.rawResponse&&tx.rawResponse.observedAt,commitRef:tx.commitRef
      }
      );
  const result=[];
  for(const item of items){
   const e=item.envelope,key=e.sourceNoticeKey,stage=e.stage,observationHash=digest(e),detail=(input.details||{})[key]||null;
   let review=(input.reviews||{})[key]||null,intake=null;
   if(o.inputPolicy){
     try{intake=o.inputPolicy.assess({envelope:e,detail,input,observedAt:item.observedAt,now:now()});check(intake&&typeof intake.fingerprint==='string'&&('reason'in intake),'HANDOFF_POLICY_RESULT');}
     catch(error){intake={reason:String(error.message||error),fingerprint:digest([input.handoffs&&input.handoffs[key],input.roundResolutions&&input.roundResolutions[key]]),handoff:input.handoffs&&input.handoffs[key]||null,resolution:input.roundResolutions&&input.roundResolutions[key]||null};}
     review=intake.review||null;
   }
   const detailHash=detail?digest(detail):null,receiptKey=digest(intake?[observationHash,detailHash,review,intake.fingerprint]:[observationHash,detailHash,review]);
   o.store.transaction(state=>{
    const b=root(state),at=new Date(now()).toISOString(),existing=b.observations[observationHash];
    if(intake){b.intakes=b.intakes||{};b.intakes[intake.fingerprint]=b.intakes[intake.fingerprint]||{...copy(intake),sourceNoticeKey:key,at};}
    check(!existing||o.stable(existing.envelope)===o.stable(e),'OBSERVATION_IMMUTABLE');
    b.observations[observationHash]=existing||{
            envelope:copy(e),observedAt:item.observedAt||null,commitRef:item.commitRef,receivedAt:at
          }
          ;
    if(detail)b.details[detailHash]=b.details[detailHash]||{
            response:copy(detail),sourceNoticeKey:key
          }
          ;
    const rid='BR:'+digest(key).slice(0,24),prior=b.masters[rid];
          check(!prior||prior.sourceNoticeIds.includes(key),'MASTER_KEY_COLLISION');
    let verdict,reason=null;
    if(stage.mode==='INITIAL_BASELINE'){
            reason='INITIAL_BACKFILL';
            b.baselineSources[key]=b.baselineSources[key]||{
              observationHash,source:stage.source,snapshotId:stage.snapshotId
            }
            ;
          }
    else if(stage.mode!=='OBSERVE_ONLY'||stage.eventEmissionAllowed!==false||stage.deliveryCapability!=='NONE')reason='STAGE_POLICY';
    else if(intake&&intake.reason)reason=intake.reason;
    else if(!b.activations[stage.source])reason='SOURCE_NOT_ACTIVATED';
    else {
            try{
      const activation=b.activations[stage.source],baseline=o.sender.inspect().baseline;
      check(activation.baselineId===baseline.id,'BASELINE_CHANGED');
      const t=stamp(item.observedAt);
              check(t<=now()&&t>=stamp(activation.incrementalAt)&&t>=stamp(baseline.goLiveAt),'OBSERVATION_BEFORE_BASELINE_OR_FUTURE');
      check(!b.baselineSources[key]||(review&&review.kind==='RECRUITMENT_CHANGE'&&review.roundId),'BASELINE_EXISTING_NOTICE');
      const posted=e.observation.postedDateDisplay||e.observation.postedDate;
              if(posted&&posted<new Date(stamp(baseline.goLiveAt)+32400000).toISOString().slice(0,10))check(review&&review.kind==='RECRUITMENT_CHANGE'&&review.roundId,'PAST_PUBLICATION_NEWLY_DISCOVERED');
      check(!baseline.knownRecruitmentVersions.includes(rid+'@'+(prior&&prior.roundId||'unknown'))&&!baseline.legacyEventKeys.includes(key),'KNOWN_BASELINE_EVENT');
      verdict=adjudicate(e,detail,item.observedAt,prior,review,intake);
              reason=verdict.reason||null;
    
            }
            catch(error){
              reason=String(error.message||error).slice(0,240);
            }
          }
    // Repeated receipts are processed idempotently to repair an interrupted B enqueue.
    const stale=prior&&prior.latestObservedAt&&item.observedAt&&stamp(item.observedAt)<stamp(prior.latestObservedAt);
    if(stale){
            result.push({
              sourceNoticeKey:key,recruitmentId:rid,decision:'HOLD',reason:'STALE_OBSERVATION',receiptKey
            }
            );
            return;
          }
    const master=prior?copy(prior):{
            row:Array(40).fill(''),user:{
            }
            ,sourceNoticeIds:[key],firstSeenAt:at
          }
          ;
          master.row[0]=rid;
          master.row[5]=e.observation.title||master.row[5];
          master.latestObservationHash=observationHash;
          master.latestObservedAt=item.observedAt||null;
          master.receiptKey=receiptKey;
    if(verdict&&verdict.canonical&&!reason){
      if(prior&&prior.canonical)b.history[digest([rid,prior.canonical.modelVersion])]={
              canonical:copy(prior.canonical),retainedAt:at
            }
            ;
      Object.assign(master,{
              row:verdict.row,canonical:verdict.canonical,roundId:verdict.canonical.roundId,marker:verdict.marker,firstValidDiscoveryAt:verdict.canonical.firstValidDiscoveryAt,detailHash:verdict.rawHash,decision:'VALID',reason:null
            }
            );
      b.canonical[rid]=copy(verdict.canonical);
      if(state.v04PendingHandoffs&&state.v04PendingHandoffs[key]&&verdict.canonical.handoffProvenance&&state.v04PendingHandoffs[key].hash===verdict.canonical.handoffProvenance.handoffSha256)delete state.v04PendingHandoffs[key];
    
          }
          else{
            master.decision='HOLD';
            master.reason=reason||'UNCLASSIFIED';
            delete b.canonical[rid];
            const k=digest([key,observationHash,detailHash,reason]);
            b.reviews[k]=b.reviews[k]||{
              sourceNoticeKey:key,recruitmentId:rid,reason:master.reason,at
            }
            ;
          }
    b.masters[rid]=master;
    b.decisions[receiptKey]={
            sourceNoticeKey:key,recruitmentId:rid,observationHash,detailHash,decision:master.decision,reason:master.reason,at,a6NoticeKind:verdict&&verdict.noticeKind||null,geo:verdict&&verdict.geo||null,rawScheduleStatus:verdict&&verdict.parsed.schedule&&verdict.parsed.schedule.status||null,canonicalWindows:verdict&&verdict.canonical?copy(verdict.canonical.windows):[]
          }
          ;
    b.receipts[receiptKey]={
            receiptKey,sourceNoticeKey:key,recruitmentId:rid,observationHash,detailHash,decision:master.decision,reason:master.reason,at
          }
          ;
    result.push(copy(b.receipts[receiptKey]));
   
        }
        );
  
      }
  flush();
      return {
        mode:'MOCK_ONLY',processed:result,realTelegramCalls:0
      }
      ;
 
    }
 function processJournal(input,options){
  const key=digest(input);
      o.gate.enter(key,!!(options&&options.recoverFailed));
  try{
        const out=processJournalData(input);
        o.gate.finish(key);
        return out;
      }
  catch(error){
        try{
          o.gate.fail(key,String(error.message||error));
        }
        catch(_){
        }
        throw error;
      }
 
    }
 function recoverInterrupted(input,options){
      check(options&&options.previousOwnerStopped===true,'STOP_OWNER_BEFORE_RECOVERY');
      o.gate.recover(digest(input));
      return processJournal(input,{
        recoverFailed:true
      }
      );
    }
 function flush(){
      const b=inspect(),rows=Object.values(b.canonical);
      if(rows.length)o.sender.ingest(rows);
      return syncLinks();
    }
 function syncLinks(){
      const delivered=o.sender.inspect();
      return o.store.transaction(s=>{
        const b=root(s);
        for(const e of Object.values(delivered.events)){
          const r=b.masters[e.recruitmentId];
          if(!r)continue;
          for(const key of e.sourceNoticeIds){
            const id=digest([key,e.key]);
            b.links[id]={
              sourceNoticeKey:key,recruitmentId:e.recruitmentId,roundId:e.roundId,windowId:e.windowId,windowIds:e.windowId?[e.windowId]:(r.canonical&&r.canonical.windows||[]).map(w=>w.id),eventKey:e.key,deliveryKey:e.key,eventType:e.type,state:delivered.deliveries[e.key].state
            }
            ;
          }
        }
        return Object.keys(b.links).length;
      }
      );
    }
 function dispatchOne(){
      if(!o.gate.ready())return {
        state:'HOLD',reason:'INTEGRATION_NOT_COMMITTED'
      }
      ;
      const out=o.sender.dispatchOne();
      syncLinks();
      return out;
    }
 return Object.freeze({
      activate,registerBaseline,processJournal,recoverInterrupted,flush,dispatchOne,inspect,syncLinks,adjudicate
    }
    );
  }
  return Object.freeze({
    create,official,routes
  }
  );
}
)();
if(typeof module!=='undefined'&&module.exports)module.exports=HousingIntegrationBridge;
