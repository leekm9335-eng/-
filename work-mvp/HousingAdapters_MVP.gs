/* Standalone isolated GAS V8 bundle; no entrypoint/trigger installed. */
'use strict';
/** Dependency-free parser kernel for Node and GAS V8; never executes HTML/JS. */
var HA53Core = (function () {
  function fail(code, msg) { throw new Error('HA53_' + code + ': ' + msg); }
  function assert(ok, code, msg) { if (!ok) fail(code, msg); }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function entities(s) {
    var named = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',middot:'·',ndash:'–',mdash:'—',lsquo:'‘',rsquo:'’'};
    return String(s).replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, function(all,k) {
      if (k[0] !== '#') return Object.prototype.hasOwnProperty.call(named,k) ? named[k] : all;
      var n = k[1].toLowerCase() === 'x' ? parseInt(k.slice(2),16) : Number(k.slice(1));
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '\uFFFD';
    });
  }
  // Small non-executing HTML tree, not a browser DOM. Quoted '>' and raw scripts supported.
  // Unsupported/missing source layouts fail at adapter required selectors, never successful zero rows.
  function html(s) {
    assert(typeof s === 'string' && !s.includes('\uFFFD'), 'ENCODING', 'decoded HTML required without replacement characters');
    var root={tag:'#root',attrs:{},children:[]}, stack=[root];
    var tokens=s.match(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<\/?[a-zA-Z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>|[^<]+|</gi)||[];
    tokens.forEach(function(t){
      if (/^<!--|^<!|^<script\b|^<style\b/i.test(t)) return;
      var closing=t.match(/^<\/([\w:-]+)/);
      if (closing) { for(var i=stack.length-1;i>0;i--) if(stack[i].tag===closing[1].toLowerCase()){stack.length=i;break;} return; }
      var opening=t.match(/^<([\w:-]+)/);
      if(!opening){stack[stack.length-1].children.push(entities(t));return;}
      var tag=opening[1].toLowerCase(), attrs={}, m;
      var ar=/([^\s=<>/'"]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      var a=t.slice(opening[0].length).replace(/\/?\s*>$/,'');
      while((m=ar.exec(a)))attrs[m[1].toLowerCase()]=entities(m[2]!==undefined?m[2]:m[3]!==undefined?m[3]:m[4]||'');
      // Common optional-end tags in public boards.
      if(['p','li','tr','td','th'].indexOf(tag)>=0 && stack[stack.length-1].tag===tag)stack.pop();
      var node={tag:tag,attrs:attrs,children:[]};stack[stack.length-1].children.push(node);
      if(!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag)&&! /\/>$/.test(t))stack.push(node);
    });return root;
  }
  function find(n,p) { var a=[];function walk(x){if(typeof x==='string')return;if(p(x))a.push(x);x.children.forEach(walk);}walk(n);return a; }
  function cls(n,c){return (' '+(n.attrs.class||'').replace(/\s+/g,' ')+' ').indexOf(' '+c+' ')>=0;}
  function one(n,p,label){var a=find(n,p);assert(a.length>0,'LAYOUT','missing '+label);return a[0];}
  function byClass(n,c){return one(n,function(x){return cls(x,c);},'.'+c);}
  function byId(n,id){return one(n,function(x){return x.attrs.id===id;},'#'+id);}
  function text(n){if(typeof n==='string')return n;var t=n.children.map(text).join('');return /^(p|div|br|li|tr|h[1-6]|section|article|dt|dd)$/.test(n.tag)?'\n'+t+'\n':/^(td|th)$/.test(n.tag)?t+' ':t;}
  function lines(n){return text(n).split(/\n/).map(norm).filter(Boolean);}
  function query(u,k){var m=String(u).match(new RegExp('[?&]'+k+'=([^&#]*)'));if(!m)return null;try{return decodeURIComponent(m[1].replace(/\+/g,' ')).trim();}catch(_){fail('URL','bad percent escape');}}
  function absolute(base, href){
    href=entities(href).trim();assert(href&&!/[\u0000-\u0020]/.test(href),'URL','empty/whitespace URL');
    if(/^https:\/\//i.test(href))return href;
    assert(!/^\/\/|^[a-z][a-z0-9+.-]*:/i.test(href),'URL','unsupported scheme');
    var origin=base.match(/^https:\/\/[^/]+/);assert(origin,'URL','HTTPS base required');
    if(href[0]==='/')return origin[0]+href;
    if(href[0]==='?')return base.split('?')[0]+href;
    return base.split('?')[0].replace(/[^/]*$/,'')+href;
  }
  function anchors(n,base,predicate){
    var seen={};return find(n,function(x){return x.tag==='a'&&x.attrs.href&&predicate(x.attrs.href,x);}).map(function(x){
      return {url:absolute(base,x.attrs.href),label:norm(text(x)),linkedFrom:base};
    }).filter(function(a){if(seen[a.url])return false;seen[a.url]=true;return true;});
  }
  function response(r){assert(r&&r.status===200,'HTTP','expected 200, received '+(r&&r.status));assert(typeof r.text==='string','INPUT','decoded text required');return html(r.text);}
  function day(y,m,d){y=Number(y);m=Number(m);d=Number(d);if(y<100)y+=2000;var s=String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');var dt=new Date(s+'T00:00:00Z');assert(!isNaN(dt)&&dt.toISOString().slice(0,10)===s,'DATE','invalid date '+s);return s;}
  function clock(h,m){if(h==null)return null;h=Number(h);m=Number(m||0);assert(h>=0&&h<24&&m>=0&&m<60,'DATE','invalid time');return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');}
  function endpoint(d,t){return {date:d,time:t,timezone:'Asia/Seoul',precision:t?'MINUTE':'DAY'};}
  var datePart="(?<![\\d.])(?:(\\d{4}|\\d{2})\\s*[.년/-]\\s*)?(0?[1-9]|1[0-2])\\s*[.월/-]\\s*(0?[1-9]|[12]\\d|3[01])(?!\\d)(?:\\s*[.일])?(?:\\s*\\([월화수목금토일]\\))?(?:\\s*(\\d{1,2}):([0-5]\\d))?";
  function range(s,year){
    s=norm(s).replace(/[‘’`']/g,'');
    var re=new RegExp(datePart+'\\s*(?:~|～|–|부터)\\s*'+datePart), m=s.match(re);
    if(m){var y=m[1]||year;assert(y,'DATE','missing explicit year context');return {start:endpoint(day(y,m[2],m[3]),clock(m[4],m[5])),end:endpoint(day(m[6]||y,m[7],m[8]),clock(m[9],m[10])),matched:m[0]};}
    // Single-day window, e.g. ‘26.11.02 (월) 10:00 ~ 23:00.
    m=s.match(new RegExp(datePart+'\\s*(?:~|～|–)\\s*(\\d{1,2}):([0-5]\\d)'));
    if(m){var yy=m[1]||year;assert(yy,'DATE','missing year context');var d=day(yy,m[2],m[3]);return {start:endpoint(d,clock(m[4],m[5])),end:endpoint(d,clock(m[6],m[7])),matched:m[0]};}
    return null;
  }
  function claim(raw,year,origin,kind,channel){
    var r=range(raw,year);if(!r)return null;
    var a=r.start.date+(r.start.time||''),b=r.end.date+(r.end.time||'');assert(a<=b,'DATE','reversed range');
    return {kind:kind||'APPLICATION_WINDOW',channel:channel||'UNSPECIFIED',start:r.start,end:r.end,evidence:{origin:origin,quote:norm(raw),matched:r.matched}};
  }
  function schedules(ls,year,origin){
    var claims=[],unparsed=[];
    ls.forEach(function(l){
      var kind=/접수처\s*운영기간/.test(l)?'OFFICE_OPERATION_WINDOW':/방문접수기간|청약\s*신청기간|청약\s*접수일|청약신청\s*[:：]|신청\s*접수\s*[:：]|신청접수\s*\(|신청접수\s*[:：]/.test(l)?'APPLICATION_WINDOW':null;
      if(!kind)return;
      var channel=/방문접수기간/.test(l)?'ONSITE':/청약신청기간/.test(l)?'ONLINE':'UNSPECIFIED';
      var c=claim(l,year,origin,kind,channel);if(c)claims.push(c);else unparsed.push({quote:l,origin:origin,reason:'UNSUPPORTED_SCHEDULE_LAYOUT'});
    });return {claims:claims,unparsed:unparsed};
  }
  function reconcile(claims){
    // Missing times are unknown rather than midnight. Different channels/kinds do not conflict.
    var groups={},conflicts=[];claims.forEach(function(c){var k=c.kind+':'+c.channel;(groups[k]||(groups[k]=[])).push(c);});
    Object.keys(groups).forEach(function(k){var g=groups[k];for(var i=0;i<g.length;i++)for(var j=i+1;j<g.length;j++){
      var a=g[i],b=g[j];if(['start','end'].some(function(e){return a[e].date!==b[e].date||(a[e].time&&b[e].time&&a[e].time!==b[e].time);}))conflicts.push({group:k,left:i,right:j});
    }});
    var apps=claims.filter(function(c){return c.kind==='APPLICATION_WINDOW';});
    var resolved=[];
    if(!conflicts.length)Object.keys(groups).forEach(function(k){var g=groups[k];if(g[0].kind!=='APPLICATION_WINDOW')return;var r=JSON.parse(JSON.stringify(g[0]));['start','end'].forEach(function(e){var precise=g.find(function(c){return !!c[e].time;});if(precise)r[e]=JSON.parse(JSON.stringify(precise[e]));});resolved.push({kind:r.kind,channel:r.channel,start:r.start,end:r.end,evidenceCount:g.length});});
    return {status:conflicts.length?'SCHEDULE_CONFLICT':apps.length?'OBSERVED':'UNVERIFIED',claims:claims,conflicts:conflicts,resolvedWindows:resolved,deadlineDateResolved:apps.length>0&&!conflicts.length,reminderReady:resolved.length>0&&resolved.every(function(c){return !!c.end.time;})};
  }
  function category(title){if(/경쟁률|당첨|결과|합격|추첨결과/.test(title))return 'RESULT_ONLY';if(/사전안내|사전\s*안내|예정/.test(title))return 'PREANNOUNCEMENT';if(/시스템|홈페이지.*(?:지연|점검)|이용\s*지연/.test(title))return 'SERVICE_NOTICE';if(/입주자\s*(?:추가\s*)?모집|모집공고/.test(title))return 'RECRUITMENT';return 'OTHER_NOTICE';}
  function correction(title){return /정정|수정|연장|변경/.test(title)?'TITLE_CORRECTION_CANDIDATE_NO_PRIOR_VERSION':'NO_TITLE_SIGNAL';}
  function observation(source,id,title,url,body,attachments,claims){return {schemaVersion:'0.2',sourceId:source,sourceNoticeKey:source+':'+id,recruitmentRoundKey:null,title:title,url:url,bodyText:body,attachments:attachments||[],classification:category(title),correctionSignal:correction(title),schedule:reconcile(claims||[]),notificationPolicy:{newValidSeoulGyeonggi:'BASIC',importantDminus3:true,allValidDminus1:true},notificationDecision:'DEFER_TO_INTEGRATOR',deliveryCapability:'NONE'};}
  function attachmentResponse(r){
    if(!r||r.status!==200)return {ok:false,kind:'HTTP_ERROR',status:r&&r.status};
    var bytes=r.bytes||[],head=typeof bytes==='string'?bytes.slice(0,2048):Array.prototype.slice.call(bytes,0,2048).map(function(b){return String.fromCharCode((b+256)%256);}).join('');
    if(/<ErrorCode>\s*-1|err\.파일|<ErrorMsg>/.test(r.text||head))return {ok:false,kind:'APPLICATION_ERROR'};
    if(head.slice(0,5)==='%PDF-')return {ok:true,kind:'PDF_MAGIC_CONFIRMED',structuralValidation:'REQUIRES_PDF_ENGINE'};
    return {ok:false,kind:/<html|<!doctype/i.test(head)?'HTML_INSTEAD_OF_FILE':'UNKNOWN_BINARY'};
  }
  function changed(before,after){
    assert(before.sourceNoticeKey===after.sourceNoticeKey,'IDENTITY','cross-source merge prohibited');
    var fields=['title','bodyText','attachments','schedule'];var delta=fields.filter(function(k){return JSON.stringify(before[k])!==JSON.stringify(after[k]);});
    return {sourceNoticeKey:after.sourceNoticeKey,changedFields:delta,event:delta.length?'OBSERVATION_CHANGED':'UNCHANGED',correctionProven:false,requiresSemanticReview:delta.length>0};
  }
  function aliases(items){var by={};items.forEach(function(x){assert(/^[a-f0-9]{64}$/.test(x.sha256),'HASH','sha256 required');(by[x.sha256]||(by[x.sha256]=[])).push(x.url);});return Object.keys(by).filter(function(k){return by[k].length>1;}).map(function(k){return {sha256:k,urls:by[k],relation:'SAME_ATTACHMENT_BYTES_ONLY'};});}
  return {fail:fail,assert:assert,norm:norm,html:html,find:find,cls:cls,one:one,byClass:byClass,byId:byId,text:text,lines:lines,query:query,absolute:absolute,anchors:anchors,response:response,day:day,range:range,claim:claim,schedules:schedules,reconcile:reconcile,category:category,correction:correction,observation:observation,attachmentResponse:attachmentResponse,changed:changed,aliases:aliases};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=HA53Core;

'use strict';
/** SHA-256 over UTF-8, no Node/GAS services required. */
var HA53Hash = (function () {
  var K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  function ro(x,n){return (x>>>n)|(x<<(32-n));}
  function sha256(value){
    if(typeof module!=='undefined'&&module.exports&&typeof require==='function')return require('node:crypto').createHash('sha256').update(String(value),'utf8').digest('hex');
    var encoded=encodeURIComponent(String(value)),bytes=[];
    for(var i=0;i<encoded.length;i++){if(encoded[i]==='%'){bytes.push(parseInt(encoded.slice(i+1,i+3),16));i+=2;}else bytes.push(encoded.charCodeAt(i));}
    var len=bytes.length,bit=len*8;bytes.push(128);while(bytes.length%64!==56)bytes.push(0);
    for(var j=7;j>=0;j--)bytes.push(Math.floor(bit/Math.pow(256,j))%256);
    var h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],w=new Array(64);
    for(var off=0;off<bytes.length;off+=64){
      for(i=0;i<16;i++)w[i]=((bytes[off+i*4]<<24)|(bytes[off+i*4+1]<<16)|(bytes[off+i*4+2]<<8)|bytes[off+i*4+3])>>>0;
      for(i=16;i<64;i++){var x=w[i-15],y=w[i-2];w[i]=((ro(x,7)^ro(x,18)^(x>>>3))+w[i-16]+(ro(y,17)^ro(y,19)^(y>>>10))+w[i-7])>>>0;}
      var a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
      for(i=0;i<64;i++){var t1=(hh+(ro(e,6)^ro(e,11)^ro(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0;var t2=((ro(a,2)^ro(a,13)^ro(a,22))+((a&b)^(a&c)^(b&c)))>>>0;hh=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
      [a,b,c,d,e,f,g,hh].forEach(function(v,k){h[k]=(h[k]+v)>>>0;});
    }
    return h.map(function(n){return n.toString(16).padStart(8,'0');}).join('');
  }
  function canonical(x){
    if(x===null||typeof x!=='object')return JSON.stringify(x);
    if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
    return '{'+Object.keys(x).sort().filter(function(k){return x[k]!==undefined;}).map(function(k){return JSON.stringify(k)+':'+canonical(x[k]);}).join(',')+'}';
  }
  return {sha256:sha256,canonical:canonical,digest:function(x){return sha256(canonical(x));}};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=HA53Hash;

'use strict';
/** Isolated staging transaction protocol. Cursor contains no rows, raw responses or ID sets.
 * A sink must atomically publish an immutable PAGE/CONTROL transaction before acknowledging it.
 * Exact unique-ID index lives behind the sink, NOT in checkpoint/ScriptProperties.
 */
var HA53Stage=(function(C,H){
  var NS='HOUSING53_STAGING_V03';
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function validIdentity(source,id){C.assert(['SOCO','HUG_NOTICE','NANUM','ONEROOF','MZIP','PAJU','UUC'].indexOf(source)>=0&&typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id),'STAGE_IDENTITY','safe source/snapshot ID required');}
  function initial(source,id,mode){validIdentity(source,id);C.assert(['INITIAL_BASELINE','OBSERVE_ONLY'].indexOf(mode||'INITIAL_BASELINE')>=0,'STAGE_POLICY','no sending mode supported');return {version:2,namespace:NS,source:source,snapshotId:id,mode:mode||'INITIAL_BASELINE',nextPage:1,total:null,totalPages:null,pageSize:null,observedCount:0,uniqueCount:0,idSetSha256:H.digest([]),revision:0,commitRef:null,status:'READY',attempts:0,nextAttemptAt:0,lastError:null,deliveryCapability:'NONE',eventEmissionAllowed:false};}
  function assertCursor(s){C.assert(s&&typeof s==='object','STAGE_SCHEMA','cursor object required');C.assert(Object.keys(s).sort().join(',')===Object.keys(initial(s.source,s.snapshotId,s.mode)).sort().join(','),'STAGE_SCHEMA','unknown cursor fields; observations must stay in staging');validIdentity(s.source,s.snapshotId);C.assert(s.version===2&&s.namespace===NS&&!('pages'in s)&&!('records'in s)&&!('ids'in s),'STAGE_SCHEMA','v0.3 lightweight cursor required; v0.2 state cannot be silently imported');C.assert(s.deliveryCapability==='NONE'&&s.eventEmissionAllowed===false&&['INITIAL_BASELINE','OBSERVE_ONLY'].indexOf(s.mode)>=0,'STAGE_POLICY','delivery policy changed');C.assert(Number.isSafeInteger(s.revision)&&s.revision>=0&&Number.isSafeInteger(s.nextPage)&&s.nextPage>0,'STAGE_SCHEMA','bad cursor');}
  function envelope(record,cursor){
    C.assert(cursor&&['INITIAL_BASELINE','OBSERVE_ONLY'].indexOf(cursor.mode)>=0,'STAGE_POLICY','unsupported stage mode');var o=copy(record);C.assert(typeof o.sourceNoticeKey==='string'&&o.sourceNoticeKey,'STAGE_IDENTITY','sourceNoticeKey required');
    return {sourceNoticeKey:o.sourceNoticeKey,observation:o,stage:{namespace:NS,snapshotId:cursor.snapshotId,source:cursor.source,mode:cursor.mode,notificationDisposition:cursor.mode==='INITIAL_BASELINE'?'SUPPRESSED_INITIAL_BACKFILL':'HOLD_FOR_INTEGRATOR',eventEmissionAllowed:false,deliveryCapability:'NONE',changeClassification:/TITLE_CORRECTION_CANDIDATE/.test(o.correctionSignal||'')?'CHANGE_UNCLASSIFIED':null}};
  }
  function empty(){return {cursor:null,ids:Object.create(null),transactions:[]};}
  function identity(cursor){return cursor.namespace+':'+cursor.source+':'+cursor.snapshotId;}
  function contentKey(packet){return H.digest({kind:packet.kind,baseCursor:packet.baseCursor,candidateCursor:packet.candidateCursor,page:packet.page||null,rawResponse:packet.rawResponse||null});}
  function seal(tx){var x=copy(tx);delete x.commitRef;return H.digest(x);}
  function same(a,b){return H.canonical(a)===H.canonical(b);}
  function prepare(ledger,packet){
    C.assert(packet&&['PAGE','CONTROL'].indexOf(packet.kind)>=0,'STAGE_SCHEMA','PAGE/CONTROL transaction required');
    var base=packet.baseCursor;assertCursor(base);var current=ledger.cursor||initial(base.source,base.snapshotId,base.mode);
    C.assert(identity(current)===identity(base),'STAGE_IDENTITY','snapshot/source namespace mismatch');
    var key=contentKey(packet),old=ledger.transactions[base.revision];
    if(old){C.assert(old.contentKey===key,'STAGE_IDEMPOTENCY_CONFLICT','same revision replay differs; reload cursor or restart snapshot');return {replayed:true,transaction:old,cursor:copy(old.cursor)};}
    C.assert(same(current,base),'STAGE_CAS','stale or fabricated cursor; load acknowledged staging cursor');
    var next=copy(packet.candidateCursor);assertCursor(next);C.assert(next.idSetSha256===base.idSetSha256,'STAGE_SCHEMA','ID digest is computed by sink, not caller');
    C.assert(identity(next)===identity(base)&&next.mode===base.mode&&next.revision===base.revision&&next.commitRef===base.commitRef,'STAGE_CAS','candidate identity/revision changed');
    var ids=Object.keys(ledger.ids),page=packet.page||null,observations=[];
    if(packet.kind==='PAGE'){
      C.assert(['READY','RETRY_WAIT'].indexOf(base.status)>=0,'STAGE_STATE','page commit not allowed in this state');
      C.assert(page&&page.pageIndex===base.nextPage&&Array.isArray(page.records)&&page.count===page.records.length,'STAGE_SCHEMA','page/index/count mismatch');
      var psize=page.pageSize||10,total=page.total,pages=page.totalPages;
      C.assert(Number.isSafeInteger(psize)&&psize>0&&Number.isSafeInteger(total)&&total>=0&&Number.isSafeInteger(pages)&&pages>=0&&pages===Math.ceil(total/psize),'STAGE_TOTAL','invalid official totals');
      if(base.total!==null)C.assert(total===base.total&&pages===base.totalPages&&psize===base.pageSize,'STAGE_TOTAL','official header changed; restart snapshot');
      C.assert(page.count===Math.min(psize,Math.max(0,total-(page.pageIndex-1)*psize))&&page.pageIndex<=Math.max(1,pages),'STAGE_TOTAL','page rows incomplete');
      var local=Object.create(null);page.records.forEach(function(r){C.assert(typeof r.sourceNoticeKey==='string'&&r.sourceNoticeKey.indexOf(base.source==='SOCO'?'SOCO_YOUTH:BMSR00015:':base.source==='HUG_NOTICE'?'HUG_NOTICE:1295:':base.source+':')===0,'STAGE_IDENTITY','record source differs from staging route');C.assert(!ledger.ids[r.sourceNoticeKey]&&!local[r.sourceNoticeKey],'STAGE_DUPLICATE','duplicate source ID within/across pages: '+r.sourceNoticeKey);local[r.sourceNoticeKey]=true;ids.push(r.sourceNoticeKey);observations.push(envelope(r,base));});
      ids.sort();
      C.assert(next.nextPage===base.nextPage+1&&next.total===total&&next.totalPages===pages&&next.pageSize===psize&&next.observedCount===base.observedCount+page.count&&next.uniqueCount===ids.length,'STAGE_TOTAL','candidate aggregate mismatch');
      C.assert(next.attempts===0&&next.nextAttemptAt===0&&next.lastError===null,'STAGE_STATE','successful page must reset retries');
      var done=page.pageIndex===Math.max(1,pages);C.assert(next.status===(done?'COMPLETE':'READY'),'STAGE_TOTAL','premature/missing completion');
      if(done)C.assert(ids.length===total&&next.observedCount===total,'STAGE_TOTAL','official total/unique ID mismatch');
      next.idSetSha256=H.digest(ids);
    }else{
      C.assert(same(next.total,base.total)&&same(next.totalPages,base.totalPages)&&same(next.pageSize,base.pageSize)&&next.nextPage===base.nextPage&&next.observedCount===base.observedCount&&next.uniqueCount===base.uniqueCount&&next.idSetSha256===base.idSetSha256,'STAGE_CONTROL','control must not change page data');
      C.assert((base.status==='STOPPED'&&next.status==='READY'&&next.attempts===0&&next.nextAttemptAt===0)||(['READY','RETRY_WAIT'].indexOf(base.status)>=0&&['RETRY_WAIT','STOPPED','RESTART_REQUIRED'].indexOf(next.status)>=0&&next.attempts===base.attempts+1),'STAGE_CONTROL','unsupported control transition');
    }
    next.revision=base.revision+1;
    var tx={protocol:'HOUSING53_STAGE_TX_V1',namespace:NS,source:base.source,snapshotId:base.snapshotId,kind:packet.kind,revision:next.revision,previousCommitRef:base.commitRef,contentKey:key,page:copy(page),rawResponse:copy(packet.rawResponse||null),observations:observations,cursor:next};
    tx.commitRef=seal(tx);tx.cursor.commitRef=tx.commitRef;
    // seal excludes cursor.commitRef to avoid circular digest.
    return {replayed:false,transaction:tx,cursor:copy(tx.cursor)};
  }
  function txDigest(tx){var x=copy(tx);x.cursor.commitRef=x.previousCommitRef;return seal(x);}
  function apply(ledger,tx,options){
    C.assert(tx.protocol==='HOUSING53_STAGE_TX_V1'&&tx.namespace===NS&&tx.commitRef===txDigest(tx)&&tx.cursor.commitRef===tx.commitRef,'STAGE_INTEGRITY','transaction hash/namespace mismatch');
    var expected=ledger.cursor?ledger.cursor.revision+1:1;
    C.assert(tx.revision===expected&&tx.previousCommitRef===(ledger.cursor?ledger.cursor.commitRef:null),'STAGE_INTEGRITY','journal chain/gap mismatch');
    var base=ledger.cursor||initial(tx.source,tx.snapshotId,tx.cursor.mode);
    var candidate=copy(tx.cursor);candidate.revision=base.revision;candidate.commitRef=base.commitRef;candidate.idSetSha256=base.idSetSha256;
    var packet={kind:tx.kind,baseCursor:base,candidateCursor:candidate,page:tx.page,rawResponse:tx.rawResponse};
    var plan=prepare(ledger,packet);
    C.assert(plan.transaction.commitRef===tx.commitRef&&same(plan.transaction.observations,tx.observations),'STAGE_INTEGRITY','transaction invariants/observations mismatch');
    (tx.page?tx.page.records:[]).forEach(function(r){ledger.ids[r.sourceNoticeKey]=true;});ledger.transactions.push(options&&options.compact?{revision:tx.revision,commitRef:tx.commitRef,previousCommitRef:tx.previousCommitRef,contentKey:tx.contentKey,cursor:copy(tx.cursor)}:copy(tx));ledger.cursor=copy(tx.cursor);return ledger;
  }
  function memory(options){
    var opts=options||{},ledgers=Object.create(null);
    function get(source,id){validIdentity(source,id);var k=source+':'+id;return ledgers[k]||(ledgers[k]=empty());}
    var sink={namespace:NS,loadCursor:function(source,id){var s=get(source,id).cursor;return s?copy(s):null;},
      commit:function(packet){var ledger=get(packet.baseCursor.source,packet.baseCursor.snapshotId),p=prepare(ledger,packet);if(!p.replayed){if(opts.fault)opts.fault('BEFORE_PUBLISH',p.transaction);apply(ledger,p.transaction);if(opts.fault)opts.fault('AFTER_PUBLISH_BEFORE_ACK',p.transaction);}return {committed:true,replayed:p.replayed,cursor:copy(p.cursor),commitRef:p.transaction.commitRef};},
      transactions:function(source,id){return copy(get(source,id).transactions);},
      records:function(source,id){return get(source,id).transactions.reduce(function(a,t){return a.concat(copy(t.observations));},[]);},
      exportJournal:function(source,id){return copy(get(source,id).transactions);},
      importJournal:function(transactions){transactions.forEach(function(tx){apply(get(tx.source,tx.snapshotId),tx);});}
    };return sink;
  }
  // Store already-parsed operator/local observations atomically, isolated from list cursors.
  // This is a batch snapshot, NOT a claim of full-source enumeration or official total.
  function stageObservations(sink,source,snapshotId,records,options){
    var o=options||{};C.assert(['NANUM','ONEROOF','MZIP','PAJU','UUC'].indexOf(source)>=0,'STAGE_IDENTITY','use list collector for SOCO/HUG');C.assert(Array.isArray(records),'STAGE_SCHEMA','observation array required');
    return stageBatch(sink,source,snapshotId,records,o,'OBSERVATION_BATCH_ONLY');
  }
  // Separate capture IDs keep detail publications out of the official list cursor.
  function stageDetails(sink,source,snapshotId,records,options){
    C.assert(Array.isArray(records)&&records.length===1,'STAGE_SCHEMA','one detail observation required');
    return stageBatch(sink,source,snapshotId,records,options||{},'DETAIL_OBSERVATION_ONLY');
  }
  function stageBatch(sink,source,snapshotId,records,o,coverage){
    C.assert(sink&&sink.namespace===NS&&typeof sink.commit==='function','STAGE_SINK','isolated sink required');
    var base=initial(source,snapshotId,o.mode),next=copy(base),size=Math.max(1,records.length);
    next.nextPage=2;next.total=records.length;next.totalPages=records.length?1:0;next.pageSize=size;next.observedCount=records.length;next.uniqueCount=records.length;next.status='COMPLETE';
    return sink.commit({kind:'PAGE',baseCursor:base,candidateCursor:next,page:{pageIndex:1,total:records.length,totalPages:next.totalPages,pageSize:size,count:records.length,records:records,coverage:coverage,totalProvenance:'CALLER_BATCH_NOT_OFFICIAL_TOTAL'},rawResponse:o.rawResponse||null});
  }
  return {NAMESPACE:NS,stageDetails:stageDetails,stageObservations:stageObservations,initial:initial,assertCursor:assertCursor,envelope:envelope,empty:empty,prepare:prepare,apply:apply,createMemory:memory,hash:H,copy:copy};
})(typeof module!=='undefined'&&module.exports?require('./housing_core'):HA53Core,typeof module!=='undefined'&&module.exports?require('./hash53'):HA53Hash);
if(typeof module!=='undefined'&&module.exports)module.exports=HA53Stage;

'use strict';
/** Verified compact metadata checkpoint; never contains raw pages/observations. */
var HA53Index=(function(C,T,H){
  function pack(ledger,refs){return {format:'HA53_COMPACT_INDEX_V1',cursor:T.copy(ledger.cursor),ids:Object.keys(ledger.ids).sort(),receipts:T.copy(ledger.transactions),refs:T.copy(refs)};}
  function restore(x,source,id){
    C.assert(x&&x.format==='HA53_COMPACT_INDEX_V1','STAGE_INDEX','index format');T.assertCursor(x.cursor);
    C.assert(x.cursor.source===source&&x.cursor.snapshotId===id&&x.ids.length===x.cursor.uniqueCount&&new Set(x.ids).size===x.ids.length&&H.digest(x.ids.slice().sort())===x.cursor.idSetSha256,'STAGE_INDEX','index identity/ID summary');
    C.assert(x.receipts.length===x.cursor.revision&&x.refs.length===x.receipts.length,'STAGE_INDEX','receipt count');
    var prev=null;x.receipts.forEach(function(r,i){T.assertCursor(r.cursor);C.assert(r.revision===i+1&&r.previousCommitRef===prev&&r.cursor.commitRef===r.commitRef&&r.cursor.source===source&&r.cursor.snapshotId===id&&r.cursor.revision===r.revision,'STAGE_INDEX','receipt chain');prev=r.commitRef;});
    C.assert(H.canonical(x.receipts[x.receipts.length-1].cursor)===H.canonical(x.cursor),'STAGE_INDEX','head cursor differs');
    var ledger=T.empty();x.ids.forEach(function(k){ledger.ids[k]=true;});ledger.cursor=T.copy(x.cursor);ledger.transactions=T.copy(x.receipts);return {ledger:ledger,refs:T.copy(x.refs)};
  }
  return {pack:pack,restore:restore};
})(typeof module!=='undefined'&&module.exports?require('./housing_core'):HA53Core,typeof module!=='undefined'&&module.exports?require('./staging53'):HA53Stage,typeof module!=='undefined'&&module.exports?require('./hash53'):HA53Hash);
if(typeof module!=='undefined'&&module.exports)module.exports=HA53Index;

'use strict';
/** GAS Drive immutable blob + final small receipt, serialized by one project's ScriptLock.
 * Default OFF. No folder creation, SpreadsheetApp, PropertiesService, triggers, HTTP or senders.
 * LIVE_TEST is implemented but must NOT be invoked before separate user approval.
 */
var HA53Gas=(function(C,T,H,I){
  function bytes(s){return encodeURIComponent(s).replace(/%[a-f0-9]{2}|./gi,'x').length;}
  function split(s,max){var parts=[],start=0,size=0;for(var i=0;i<s.length;){var n=s.charCodeAt(i),len=n>=0xD800&&n<=0xDBFF?2:1,point=s.slice(i,i+len),b=bytes(point);if(size+b>max){parts.push(s.slice(start,i));start=i;size=0;}size+=b;i+=len;}if(start<s.length)parts.push(s.slice(start));return parts;}
  function defaults(c){var x=Object.assign({mode:'OFF',writeEnabled:false,chunkBytes:262144,maxTransactionBytes:8388608,maxIndexBytes:1048576,maxControlBytes:8192,maxPages:2000,lockWaitMs:5000},c||{});C.assert(['OFF','DRY_RUN','LIVE_TEST'].indexOf(x.mode)>=0,'GAS_CONFIG','unsupported mode');['chunkBytes','maxTransactionBytes','maxIndexBytes','maxControlBytes','maxPages','lockWaitMs'].forEach(function(k){C.assert(Number.isSafeInteger(x[k])&&x[k]>0,'GAS_CONFIG','positive integer '+k);});C.assert(x.chunkBytes>=256&&x.chunkBytes<=1048576,'GAS_CONFIG','chunk size 256..1048576');return x;}
  function authorize(c){
    C.assert(c.writeEnabled===true&&typeof c.testFolderId==='string'&&c.testFolderId&&Array.isArray(c.allowedTestFolderIds)&&c.allowedTestFolderIds.indexOf(c.testFolderId)>=0,'GAS_TEST_ONLY','explicit allowlisted test folder required');
    C.assert(c.markerFileId&&c.expectedScriptId&&c.confirmation==='TEST_STORE_ONLY_NO_OPERATIONAL_WRITES','GAS_TEST_ONLY','marker/script/confirmation required');
    C.assert(!c.spreadsheetId&&!c.operationalSpreadsheetId&&!c.productionFolderId,'GAS_TEST_ONLY','operational configuration not accepted');
  }
  function driveIo(c,services){
    // No service is evaluated at module load, OFF or DRY_RUN construction.
    var s=services||{DriveApp:DriveApp,Utilities:Utilities,LockService:LockService,ScriptApp:ScriptApp},folder=null;
    function guard(){
      C.assert(s.ScriptApp.getScriptId()===c.expectedScriptId,'GAS_TEST_ONLY','wrong Apps Script project');
      folder=s.DriveApp.getFolderById(c.testFolderId);C.assert(/^Housing53_TEST_/.test(folder.getName()),'GAS_TEST_ONLY','folder name prefix required');
      var marker=s.DriveApp.getFileById(c.markerFileId),parents=marker.getParents(),inside=false;while(parents.hasNext())if(parents.next().getId()===c.testFolderId)inside=true;
      C.assert(inside,'GAS_TEST_ONLY','marker outside test root');var m=JSON.parse(marker.getBlob().getDataAsString('UTF-8'));
      C.assert(m.purpose==='HOUSING53_TEST_ONLY'&&m.namespace===T.NAMESPACE&&m.folderId===c.testFolderId&&m.scriptId===c.expectedScriptId,'GAS_TEST_ONLY','test marker mismatch');
    }
    function values(name){var it=folder.getFilesByName(name),out=[];while(it.hasNext())out.push(it.next());return out;}
    function read(name){var files=values(name);C.assert(files.length,'GAS_MISSING_BLOB','missing '+name);var text=files[0].getBlob().getDataAsString('UTF-8');files.slice(1).forEach(function(f){C.assert(f.getBlob().getDataAsString('UTF-8')===text,'GAS_DUPLICATE_CONFLICT','different bytes for same immutable name');});return text;}
    return {withLock:function(fn){var lock=s.LockService.getScriptLock();C.assert(lock.tryLock(c.lockWaitMs),'GAS_LOCK_BUSY','test store locked');try{guard();return fn();}finally{lock.releaseLock();}},
      list:function(prefix){var it=folder.getFiles(),names={};while(it.hasNext()){var n=it.next().getName();if(n.indexOf(prefix)===0)names[n]=true;}return Object.keys(names).sort();},get:read,
      put:function(name,text){var files=values(name);if(files.length){C.assert(read(name)===text,'GAS_DUPLICATE_CONFLICT','immutable blob differs');return;}folder.createFile(s.Utilities.newBlob(text,'application/json',name));C.assert(read(name)===text,'GAS_WRITE_VERIFY','read-back differs');}
    };
  }
  function createSink(config,services){
    var c=defaults(config),sink={namespace:T.NAMESPACE,executionMode:c.mode};
    if(c.mode!=='LIVE_TEST'){
      sink.loadCursor=function(){return null;};sink.commit=function(packet){if(c.mode==='OFF')C.fail('GAS_WRITE_OFF','GAS persistence is OFF');var p=T.prepare(T.empty(),packet);return {committed:false,dryRun:true,proposedTransactionBytes:bytes(JSON.stringify(p.transaction)),cursorNotAdvanced:true};};return sink;
    }
    authorize(c);var io=driveIo(c,services);
    function prefix(source,id){T.initial(source,id);return 'c__'+source+'__'+H.sha256(id)+'__';}
    function store(text,limit){C.assert(bytes(text)<=limit,'GAS_SIZE_LIMIT','blob exceeds configured byte budget');var ref={sha256:H.sha256(text),bytes:bytes(text),parts:[]};split(text,c.chunkBytes).forEach(function(part){var sha=H.sha256(part),name='b__'+sha+'.json';io.put(name,part);ref.parts.push({name:name,sha256:sha,bytes:bytes(part)});});return ref;}
    function read(ref){C.assert(ref&&Array.isArray(ref.parts),'GAS_INTEGRITY','blob ref missing');var text=ref.parts.map(function(p){var body=io.get(p.name);C.assert(H.sha256(body)===p.sha256&&bytes(body)===p.bytes,'GAS_INTEGRITY','blob chunk hash/size differs');return body;}).join('');C.assert(H.sha256(text)===ref.sha256&&bytes(text)===ref.bytes,'GAS_INTEGRITY','whole blob hash/size differs');return text;}
    function loaded(source,id){
      var pr=prefix(source,id),names=io.list(pr),heads=[],byRevision={};
      names.forEach(function(n){var suffix=n.slice(pr.length),m=suffix.match(/^(\d{10})__([a-f0-9]{64})\.json$/);C.assert(m,'GAS_INTEGRITY','malformed receipt name');var rev=Number(m[1]);C.assert(!byRevision[rev],'GAS_CONCURRENT_CONFLICT','two receipts for same revision');byRevision[rev]=true;heads.push({name:n,revision:rev,sha:m[2]});});
      if(!heads.length)return {ledger:T.empty(),refs:[],descriptor:null};
      heads.sort(function(a,b){return a.revision-b.revision;});heads.forEach(function(h,i){C.assert(h.revision===i+1,'GAS_INTEGRITY','receipt sequence gap');});
      var latest=heads[heads.length-1],body=io.get(latest.name);C.assert(bytes(body)<=c.maxControlBytes&&H.sha256(body)===latest.sha,'GAS_INTEGRITY','receipt checksum/size');var d=JSON.parse(body);
      C.assert(d.protocol==='HA53_DRIVE_RECEIPT_V1'&&d.source===source&&d.snapshotId===id&&d.revision===latest.revision,'GAS_INTEGRITY','receipt identity');
      var x=I.restore(JSON.parse(read(d.indexRef)),source,id);C.assert(H.canonical(x.ledger.cursor)===H.canonical(d.cursor)&&x.ledger.cursor.commitRef===d.commitRef,'GAS_INTEGRITY','index/receipt head differs');
      heads.forEach(function(h,i){C.assert(x.ledger.transactions[i].revision===h.revision,'GAS_INTEGRITY','receipt/index count');});
      return {ledger:x.ledger,refs:x.refs,descriptor:d};
    }
    sink.loadCursor=function(source,id){return io.withLock(function(){var l=loaded(source,id);return l.ledger.cursor?T.copy(l.ledger.cursor):null;});};
    sink.commit=function(packet){return io.withLock(function(){
      var base=packet.baseCursor,l=loaded(base.source,base.snapshotId),plan=T.prepare(l.ledger,packet);
      if(plan.replayed)return {committed:true,replayed:true,cursor:plan.cursor,commitRef:plan.transaction.commitRef};
      C.assert((plan.cursor.totalPages||0)<=c.maxPages,'GAS_PAGE_LIMIT','official page budget exceeded; no page publication');
      var tx=plan.transaction,body=JSON.stringify(tx);C.assert(bytes(body)<=c.maxTransactionBytes,'GAS_SIZE_LIMIT','transaction too large; no cursor advance');
      var txRef=store(body,c.maxTransactionBytes);if(services&&services.fault)services.fault('AFTER_BLOBS_BEFORE_RECEIPT',tx);
      T.apply(l.ledger,tx,{compact:true});l.refs.push(txRef);var indexText=JSON.stringify(I.pack(l.ledger,l.refs));var indexRef=store(indexText,c.maxIndexBytes);
      var d={protocol:'HA53_DRIVE_RECEIPT_V1',source:base.source,snapshotId:base.snapshotId,revision:tx.revision,commitRef:tx.commitRef,previousCommitRef:tx.previousCommitRef,cursor:plan.cursor,indexRef:indexRef};
      var control=JSON.stringify(d);C.assert(bytes(control)<=c.maxControlBytes,'GAS_SIZE_LIMIT','control descriptor too large');
      if(services&&services.fault)services.fault('BEFORE_PUBLISH',tx);
      var name=prefix(base.source,base.snapshotId)+String(tx.revision).padStart(10,'0')+'__'+H.sha256(control)+'.json';
      io.put(name,control);if(services&&services.fault)services.fault('AFTER_PUBLISH_BEFORE_ACK',tx);
      return {committed:true,replayed:false,cursor:T.copy(plan.cursor),commitRef:tx.commitRef};
    });};
    // Read only the desired list page, using the existing verified receipt index.
    sink.readPage=function(source,id,page){
      return io.withLock(function(){
        var l=loaded(source,id);
        var index=l.ledger.transactions.findIndex(function(r,i){
          var prev=i?l.ledger.transactions[i-1].cursor.nextPage:1;
          return prev===page&&r.cursor.nextPage===page+1;
        });
        if(index<0)return null;
        var tx=JSON.parse(read(l.refs[index])),receipt=l.ledger.transactions[index];
        C.assert(tx.kind==='PAGE'&&tx.page.pageIndex===page&&tx.commitRef===receipt.commitRef&&
          tx.source===source&&tx.snapshotId===id,'GAS_INTEGRITY','page receipt identity differs');
        return tx;
      });
    };
    sink.audit=function(source,id){return io.withLock(function(){var l=loaded(source,id),full=T.empty(),all=[];io.list(prefix(source,id)).forEach(function(name){var body=io.get(name),sha=name.slice(-69,-5);C.assert(H.sha256(body)===sha,'GAS_INTEGRITY','historical receipt checksum');});l.refs.forEach(function(ref){var tx=JSON.parse(read(ref));T.apply(full,tx,{compact:true});all.push(tx);});C.assert(H.canonical(full.cursor)===H.canonical(l.ledger.cursor),'GAS_INTEGRITY','audited cursor differs');return {cursor:full.cursor,transactions:all};});};
    sink.transactions=function(source,id){return sink.audit(source,id).transactions;};sink.records=function(source,id){return sink.transactions(source,id).reduce(function(a,t){return a.concat(t.observations);},[]);};
    return sink;
  }
  return {createSink:createSink,utf8Bytes:bytes,splitUtf8:split};
})(typeof module!=='undefined'&&module.exports?require('./housing_core'):HA53Core,typeof module!=='undefined'&&module.exports?require('./staging53'):HA53Stage,typeof module!=='undefined'&&module.exports?require('./hash53'):HA53Hash,typeof module!=='undefined'&&module.exports?require('./staging_index53'):HA53Index);
if(typeof module!=='undefined'&&module.exports)module.exports=HA53Gas;

'use strict';
/** Evidence-preserving integration contract, deliberately NOT an event builder. */
var HA53Handoff=(function(T,H){
  function convert(record,options){
    if(!record||typeof (record.observation||record).sourceNoticeKey!=='string'||!(record.observation||record).sourceNoticeKey)throw new Error('HANDOFF_SOURCE_ID_REQUIRED');
    var o=record.observation||record,stage=record.stage||{},opt=options||{},holds=['NO_DELIVERY_CAPABILITY'],schedule=o.schedule||{status:'UNVERIFIED',claims:[],resolvedWindows:[]};
    if(stage.notificationDisposition==='SUPPRESSED_INITIAL_BACKFILL')holds.push('INITIAL_BACKFILL');
    if(!o.recruitmentRoundKey)holds.push('ROUND_ID_UNRESOLVED');
    if(schedule.status==='SCHEDULE_CONFLICT')holds.push('OFFICIAL_DEADLINE_CONFLICT');else if(!schedule.deadlineDateResolved)holds.push('APPLICATION_WINDOW_UNCONFIRMED');
    var regionEvidence=opt.regionEvidence||[];if(!regionEvidence.length)holds.push('OFFICIAL_REGION_NOT_NORMALIZED');
    if(/CORRECTION_CANDIDATE/.test(o.correctionSignal||''))holds.push('CHANGE_UNCLASSIFIED');
    if(!opt.validRecruitmentVerified)holds.push('VALID_RECRUITMENT_UNCONFIRMED');
    var supply=o.sector||o.sectorHint||opt.supplyType||null;if(!supply)holds.push('SUPPLY_TYPE_UNCONFIRMED');
    return {schema:'HA53_CANONICAL_HANDOFF_V1',original:{sourceNoticeKey:o.sourceNoticeKey,sourceId:o.sourceId||null,url:o.url||o.detailUrl||null,snapshotId:stage.snapshotId||null,observationSha256:H.digest(o),sourceResponseSha256:opt.sourceResponseSha256||null,fixtureSha256:opt.fixtureSha256||null},canonicalRecruitment:{roundKey:o.recruitmentRoundKey||null,title:o.title||null,supplyType:supply,supplyTypeEvidence:opt.supplyTypeEvidence||null,roundHint:o.roundHint||null,region:{normalizationStatus:regionEvidence.length?'CALLER_VERIFIED_EVIDENCE':'UNVERIFIED',evidence:regionEvidence},exactExclusiveAreaSqm:null},windows:{status:schedule.status,claims:schedule.claims||[],resolved:schedule.resolvedWindows||[],deadlineDateResolved:!!schedule.deadlineDateResolved,deadlineTimeResolved:!!schedule.reminderReady},evidence:{facts:o.facts||[],pdfEvidence:o.pdfEvidence||[],attachments:o.attachments||[],regionEvidence:regionEvidence},disposition:'HOLD',holdReasons:holds,eventEmissionAllowed:false,deliveryCapability:'NONE'};
  }
  return {convert:convert};
})(typeof module!=='undefined'&&module.exports?require('./staging53'):HA53Stage,typeof module!=='undefined'&&module.exports?require('./hash53'):HA53Hash);
if(typeof module!=='undefined'&&module.exports)module.exports=HA53Handoff;

'use strict';
/*
 * SOCO youth public recruitment-list adapter, isolated read-only parser v0.1.
 * GAS V8-compatible plain JavaScript. No spreadsheet/trigger/Telegram writes.
 * Observed Work fixture contract (2026-11-02):
 * POST /youth/pgm/home/yohome/bbsListJson.json, bbsId=BMSR00015.
 */
var SOCO53_BASE = 'https://soco.seoul.go.kr';
var SOCO53_BOARD = 'BMSR00015';

function soco53Fail(code, message) {
  throw new Error('SOCO53_' + code + ': ' + message);
}
function soco53Int(value, field, min) {
  if (!Number.isSafeInteger(value) || value < min) soco53Fail('SCHEMA', field + ' must be integer >= ' + min);
  return value;
}
function soco53IsoDay(x) {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return '';
  var d = new Date(x + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === x ? x : '';
}
function soco53EpochKst(x) {
  if (x == null || x === '') return null;
  var n = Number(x);
  if (!Number.isSafeInteger(n) || n < 0 || n > 9999999999999) soco53Fail('SCHEMA', 'bad epoch millis');
  return new Date(n + 9 * 3600000).toISOString().slice(0, 19).replace('T', ' ') + ' KST';
}
function soco53Request(page, options) {
  soco53Int(page, 'pageIndex', 1);
  var opts = options || {};
  // Only Work-verified filter values; default is the unfiltered source of truth.
  var sectorFilter = opts.sector || '';
  var roundFilter = opts.round || '';
  if (['', '1', '2'].indexOf(sectorFilter) < 0 || ['', '1', '2'].indexOf(roundFilter) < 0) {
    soco53Fail('ARGUMENT', 'invalid optn2/optn5 filter');
  }
  var payload = {
    bbsId: SOCO53_BOARD, pageIndex: String(page), searchAdresGu: '',
    searchCondition: '', searchKeyword: '', optn2: sectorFilter, optn5: roundFilter
  };
  return {
    url: SOCO53_BASE + '/youth/pgm/home/yohome/bbsListJson.json',
    method: 'post', contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
    payload: payload, muteHttpExceptions: true, followRedirects: true
  };
}
function soco53NormalizeRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) soco53Fail('SCHEMA', 'record object missing');
  var id = raw.boardId;
  if (!Number.isSafeInteger(id) || id <= 0 || raw.bbsId !== SOCO53_BOARD) soco53Fail('SCHEMA', 'record key mismatch');
  if (typeof raw.nttSj !== 'string' || !raw.nttSj.trim()) soco53Fail('SCHEMA', 'notice title missing');
  if (['1','2'].indexOf(raw.optn2) < 0) soco53Fail('SCHEMA', 'unknown sector optn2=' + raw.optn2);
  if (raw.optn5 !== null && raw.optn5 !== undefined && ['1','2'].indexOf(raw.optn5) < 0) {
    soco53Fail('SCHEMA', 'unknown round optn5=' + raw.optn5);
  }
  var displayed = soco53IsoDay(raw.optn1);
  if (raw.optn1 && !displayed) soco53Fail('SCHEMA', 'invalid posted date');
  var applicationHint = soco53IsoDay(raw.optn4);
  if (raw.optn4 && !applicationHint) soco53Fail('SCHEMA', 'invalid application display date');
  return {
    sourceNoticeKey: 'SOCO_YOUTH:' + SOCO53_BOARD + ':' + id,
    sourceId: 'SOCO_YOUTH', boardId: id, boardNamespace: SOCO53_BOARD,
    title: raw.nttSj.trim(),
    postedDateDisplay: displayed || null,
    applicationDateDisplayHint: applicationHint || null, // NOT the confirmed closing date.
    sectorHint: raw.optn2 === '1' ? 'PUBLIC_RENT' : 'PRIVATE_RENT',
    roundHint: raw.optn5 === '1' ? 'FIRST' : raw.optn5 === '2' ? 'ADDITIONAL' : null,
    supplierNameHint: raw.optn3 || null,
    registeredAtKst: soco53EpochKst(raw.regDate), modifiedAtKst: soco53EpochKst(raw.modDate),
    attachmentGroupId: raw.atchFileId || null,
    detailUrl: SOCO53_BASE + '/youth/bbs/' + SOCO53_BOARD + '/view.do?boardId=' + id + '&menuNo=400008',
    recruitmentClassification: 'UNCONFIRMED_REQUIRES_DETAIL',
    scheduleStatus: 'UNCONFIRMED_REQUIRES_DETAIL_AND_ATTACHMENT',
    // Caller must store complete original observation separately; this is only a normalized view.
    raw: raw
  };
}
function soco53ParsePage(text, requestedPage, httpStatus) {
  soco53Int(requestedPage, 'requestedPage', 1);
  if (httpStatus !== 200) soco53Fail('HTTP', 'non-200 response ' + httpStatus);
  var body;
  try { body = JSON.parse(text); } catch (_) { soco53Fail('PARSE', 'non-JSON/invalid response'); }
  if (!body || !Array.isArray(body.resultList) || !body.pagingInfo) soco53Fail('SCHEMA', 'missing resultList/pagingInfo');
  var p = body.pagingInfo;
  var page = soco53Int(p.pageIndex, 'pageIndex', 1);
  var total = soco53Int(p.totRow, 'totRow', 0);
  var pages = soco53Int(p.totPage, 'totPage', 0);
  var perPage = soco53Int(p.rowCount, 'rowCount', 1);
  if (page !== requestedPage || p.bbsId !== SOCO53_BOARD) soco53Fail('SCHEMA', 'page or board mismatch');
  if (pages !== Math.ceil(total / perPage)) soco53Fail('SCHEMA', 'totRow/totPage/rowCount inconsistent');
  if (body.resultList.length > perPage) soco53Fail('SCHEMA', 'page exceeds rowCount');
  if (requestedPage <= pages && body.resultList.length !== Math.min(perPage,total-(requestedPage-1)*perPage)) soco53Fail('PARTIAL', 'unexpected empty page');
  if (requestedPage > pages && body.resultList.length) soco53Fail('PARTIAL', 'unexpected rows after last page');
  var records = body.resultList.map(soco53NormalizeRecord);
  var ids = records.map(function(r){return r.sourceNoticeKey;});
  if (new Set(ids).size !== ids.length) soco53Fail('PARTIAL', 'duplicate source ID within page');
  return {pageIndex:page, total:total, totalPages:pages, pageSize:perPage, records:records,
          count:records.length, completePage:true};
}
function soco53ParseGASResponse(response, requestedPage) {
  if (!response || typeof response.getResponseCode !== 'function') soco53Fail('ARGUMENT', 'GAS HTTPResponse expected');
  return soco53ParsePage(response.getContentText('UTF-8'), requestedPage, response.getResponseCode());
}
function soco53FetchOneGAS(page, options) {
  // READ-ONLY public listing. Must only be called by explicitly approved integration or clone.
  var rq = soco53Request(page, options);
  var response = UrlFetchApp.fetch(rq.url, {
    method:rq.method,contentType:rq.contentType,payload:rq.payload,
    muteHttpExceptions:rq.muteHttpExceptions,followRedirects:rq.followRedirects
  });
  return soco53ParseGASResponse(response, page);
}
function soco53ValidateSnapshot(pages) {
  if (!Array.isArray(pages) || !pages.length) soco53Fail('PARTIAL', 'no pages');
  var first = pages[0], exp = {total:first.total,pages:first.totalPages,pageSize:first.pageSize};
  var keys = new Set(), rows = [], types = {PUBLIC_RENT:0,PRIVATE_RENT:0}, rounds = {FIRST:0,ADDITIONAL:0,NULL:0};
  if (pages.length !== exp.pages) soco53Fail('PARTIAL', 'incomplete pages: ' + pages.length + '/' + exp.pages);
  pages.forEach(function(p,i){
    if (p.pageIndex !== i+1 || p.total !== exp.total || p.totalPages !== exp.pages || p.pageSize !== exp.pageSize) {
      soco53Fail('PARTIAL', 'page sequence or header changed at ' + (i+1));
    }
    p.records.forEach(function(r){
      if (keys.has(r.sourceNoticeKey)) soco53Fail('PARTIAL', 'duplicate source ID across pages: ' + r.sourceNoticeKey);
      keys.add(r.sourceNoticeKey);rows.push(r);
      types[r.sectorHint]++;rounds[r.roundHint || 'NULL']++;
    });
  });
  if (keys.size !== exp.total) soco53Fail('PARTIAL', 'official total/unique ID mismatch: ' + keys.size + '/' + exp.total);
  // 536 is a historical observed listing total; no claim that all are current recruitments.
  return {complete:true,sourceId:'SOCO_YOUTH',observedListedRows:keys.size,pages:exp.pages,bySector:types,byRoundHint:rounds,records:rows};
}
if (typeof module !== 'undefined' && module.exports) module.exports = {
  soco53Request, soco53NormalizeRecord, soco53ParsePage,
  soco53ParseGASResponse, soco53FetchOneGAS, soco53ValidateSnapshot
};

/* v0.2 additions. Existing v0.1 exports and list schema stay compatible. */
var SOCO53Core = typeof module !== 'undefined' && module.exports ? require('./housing_core') : HA53Core;
function soco53ParseDetail(response, record) {
  var C=SOCO53Core;
  C.assert(record&&record.sourceNoticeKey==='SOCO_YOUTH:BMSR00015:'+record.boardId,'IDENTITY','SOCO list record required');
  C.assert(C.query(response.url,'boardId')===String(record.boardId),'IDENTITY','detail URL/list ID mismatch');
  var root=C.response(response), scope=C.byClass(root,'board_cont'),ls=C.lines(scope), body=C.text(scope).trim();
  var at=C.anchors(root,response.url,function(h){return /\/coHouse\/cmmn\/file\/fileDown\.do\?/.test(h);}).map(function(a){
    a.attachmentGroupId=C.query(a.url,'atchFileId');a.fileSn=C.query(a.url,'fileSn');
    C.assert(a.attachmentGroupId&&/^\d+$/.test(a.fileSn||''),'SCHEMA','SOCO attachment IDs missing');
    C.assert(!record.attachmentGroupId||a.attachmentGroupId===record.attachmentGroupId,'IDENTITY','attachment group differs from list');return a;
  });
  var schedules=C.schedules(ls,record.postedDateDisplay&&record.postedDateDisplay.slice(0,4),{url:response.url,layer:'WEB_BODY'});
  var o=C.observation('SOCO_YOUTH','BMSR00015:'+record.boardId,record.title,response.url,body,at,schedules.claims);
  o.listRecord=record;o.sector=record.sectorHint;o.roundHint=record.roundHint;o.scheduleUnparsed=schedules.unparsed;
  o.facts=ls.filter(function(l){return /주택위치|단지명|사업주체|공급호수/.test(l);}).map(function(l){return {quote:l,origin:{url:response.url,layer:'WEB_BODY'},status:'RAW_OFFICIAL_CLAIM'};});
  return o;
}
if(typeof module!=='undefined'&&module.exports)module.exports.soco53ParseDetail=soco53ParseDetail;

'use strict';
var HA53Hug=(function(C){
  var base='https://www.khug.or.kr',path='/jeonse/web/s07/s070301.jsp';
  function request(page){C.assert(Number.isSafeInteger(page)&&page>0,'ARGUMENT','page integer required');return {url:base+path+'?currentPage='+page+'&id=1295&mode=L',method:'get',charset:'EUC-KR',followRedirects:false};}
  function parseList(r,page){
    var root=C.response(r),meta=C.norm(C.text(C.byClass(root,'pageNum'))),pm=meta.match(/총\s*([\d,]+)건\s*현재 페이지\s*(\d+)\/(\d+)/);C.assert(pm&&Number(pm[2])===page,'PARTIAL','HUG page metadata mismatch');var rows=C.find(root,function(n){return n.tag==='tr'&&C.find(n,function(x){return x.tag==='a'&&/articleId=/.test(x.attrs.href||'');}).length>0;});
    C.assert(rows.length,'LAYOUT','HUG notice rows missing, not an empty result');var seen={};
    var records=rows.map(function(tr){var a=C.one(tr,function(n){return n.tag==='a'&&/articleId=/.test(n.attrs.href||'');},'article link');var id=C.query(a.attrs.href,'articleId');C.assert(/^\d+$/.test(id||'')&&!seen[id],'SCHEMA','HUG invalid/duplicate ID');seen[id]=true;
      var date=C.norm(C.text(C.byClass(tr,'data')));C.assert(/^\d{4}-\d{2}-\d{2}$/.test(date),'DATE','HUG date missing');
      var url=C.absolute(base,a.attrs.href).replace(/%20(?=&|$)/gi,'');return {sourceNoticeKey:'HUG_NOTICE:1295:'+id,articleId:id,title:C.norm(C.text(a)),postedDate:date,detailUrl:url,classification:C.category(C.text(a))};});
    C.assert(Number(pm[3])===Math.ceil(Number(pm[1].replace(/,/g,''))/10)&&records.length===Math.min(10,Number(pm[1].replace(/,/g,''))-(page-1)*10),'PARTIAL','HUG row count/header mismatch');
    var links=C.anchors(root,r.url,function(h){return /s070301\.jsp/.test(h)&&/currentPage=/.test(h)&&! /articleId=/.test(h);});
    var pages=links.map(function(a){return Number(C.query(a.url,'currentPage'));}).filter(function(n){return Number.isSafeInteger(n)&&n>0;});
    return {sourceId:'HUG_NOTICE',pageIndex:page,records:records,count:records.length,pageSize:10,total:Number(pm[1].replace(/,/g,'')),totalPages:Number(pm[3]),paginationLinks:links,maxLinkedPage:pages.length?Math.max.apply(null,pages):null,coverage:'OBSERVED_PAGE_ONLY'};
  }
  function validateWindow(pages,expectedPages){C.assert(pages.length===expectedPages,'PARTIAL','HUG requested window incomplete');var seen={};pages.forEach(function(p,i){C.assert(p.pageIndex===i+1&&p.total===pages[0].total&&p.totalPages===pages[0].totalPages,'PARTIAL','HUG page sequence/header');p.records.forEach(function(r){C.assert(!seen[r.articleId],'PARTIAL','HUG duplicate ID');seen[r.articleId]=true;});});C.assert(Object.keys(seen).length===Math.min(expectedPages*10,pages[0].total),'PARTIAL','HUG requested rows incomplete');return {observedRows:Object.keys(seen).length,ids:Object.keys(seen),completeRequestedWindow:true,wholeSourceComplete:expectedPages===pages[0].totalPages&&Object.keys(seen).length===pages[0].total};}
  function parseDetail(r){
    var id=C.query(r.url,'articleId');C.assert(/^\d+$/.test(id||''),'IDENTITY','HUG article ID required');
    var root=C.response(r),top=C.byClass(C.byClass(root,'viewTypeA'),'viewTop'),body=C.byClass(root,'fr-view');
    var titleNodes=C.find(top,function(n){return /^(h[1-6])$/.test(n.tag)||C.cls(n,'tit')||C.cls(n,'subject');});
    var title=titleNodes.length?C.norm(C.text(titleNodes[0])):C.lines(top)[0];
    C.assert(title,'LAYOUT','HUG title missing');
    var at=C.anchors(root,r.url,function(h){return /\/khugcms\/board\/skin_jeonse\/download\.jsp\?/.test(h);}).map(function(a){a.fileId=C.query(a.url,'fileId');a.boardId=C.query(a.url,'id');C.assert(a.boardId==='1295'&&/^\d+$/.test(a.fileId||''),'SCHEMA','HUG file key');return a;});
    var o=C.observation('HUG_NOTICE','1295:'+id,title,r.url,C.text(body).trim(),at,[]);o.postedDateTime=C.norm(C.text(C.byClass(top,'date')));return o;
  }
  function protectedShell(r){var root=C.response(r);C.assert(/startWebGate\(16812\)/.test(r.text),'LAYOUT','expected WebGate shell');return {sourceId:'HUG_PROTECTED_RECRUIT',status:'GATED_UNVERIFIED',observedSupplyCount:null,requestAllowed:false,attachments:C.anchors(root,r.url,function(h){return /\/hug\/homepage_file_upload\/jeonse_notice_[\d]+\.pdf/.test(h);})};}
  return {request:request,parseList:parseList,validateWindow:validateWindow,parseDetail:parseDetail,protectedShell:protectedShell};
})(typeof module!=='undefined'&&module.exports?require('./housing_core'):HA53Core);
if(typeof module!=='undefined'&&module.exports)module.exports=HA53Hug;

'use strict';
var HA53Operators=(function(C){
  function nanum(r){
    C.assert(C.query(r.url,'bo_table')==='notice'&&/^\d+$/.test(C.query(r.url,'wr_id')||''),'IDENTITY','Nanum key required');
    var root=C.response(r),body=C.byId(root,'bo_v_con');
    var titleNode=C.one(root,function(n){return n.attrs.id==='bo_v_title'||C.cls(n,'bo_v_tit');},'Nanum title');
    var title=C.norm(C.text(titleNode)),sc=C.schedules(C.lines(body),((title.match(/20\d{2}/)||C.text(body).match(/20\d{2}/)||[])[0]),{url:r.url,layer:'WEB_BODY'});
    var at=C.anchors(root,r.url,function(h){return /\/bbs\/download\.php\?/.test(h);}).map(function(a){a.wrId=C.query(a.url,'wr_id');a.fileNo=C.query(a.url,'no');a.requestContext={referer:r.url,publicCookieJar:'MAY_BE_NEEDED_NOT_STORED'};return a;});
    var o=C.observation('NANUM','notice:'+C.query(r.url,'wr_id'),title,r.url,C.text(body).trim(),at,sc.claims);o.scheduleUnparsed=sc.unparsed;o.facts=C.lines(body).filter(function(l){return /주택 위치|오피스텔|코워킹|커뮤니티/.test(l);}).map(function(l){return {quote:l,origin:{url:r.url,layer:'WEB_BODY'}};});return o;
  }
  function roof(r){
    var root=C.response(r),nodes=C.find(root,function(n){return C.cls(n,'acd_collapse')&&n.attrs['data-code'];});C.assert(nodes.length,'LAYOUT','OneRoof accordion posts missing');var seen={};
    var records=nodes.map(function(n){var id=n.attrs['data-code'];C.assert(/^p[a-z0-9]+$/.test(id)&&!seen[id],'IDENTITY','OneRoof duplicate post');seen[id]=true;
      var dom=n.attrs.id,heading=C.find(root,function(x){return x.attrs.id===dom.replace('collapse_','collapse_header_');})[0];
      var title=heading?C.norm(C.text(heading)):null;C.assert(title,'LAYOUT','OneRoof title link');
      var date=C.find(C.byClass(n,'date'),function(x){return /^20\d\d-\d\d-\d\d/.test(x.attrs.title||'');})[0];C.assert(date,'LAYOUT','OneRoof timestamp');
      var body=C.byClass(n,'acd_body'),sc=C.schedules(C.lines(body),date.attrs.title.slice(0,4),{url:r.url,postCode:id,layer:'WEB_BODY'});
      var at=C.anchors(body,r.url,function(h){return /(?:download|file)/i.test(h)&&! /forms\.gle/.test(h);});
      var o=C.observation('ONEROOF','b2023121043e88ea0e0d85:'+id,title,r.url,C.text(body).trim(),at,sc.claims);o.postedDateTime=date.attrs.title;o.imageEvidence=C.find(body,function(x){return x.tag==='img'&&! /profile|avatar/.test(x.attrs.src||'');}).map(function(x){return {url:C.absolute(r.url,x.attrs.src),requiresOCR:true};});return o;
    });
    var nav=C.byClass(root,'paging-block');var links=C.anchors(nav,r.url,function(h){return /[?&]page=\d+/.test(h);});
    return {sourceId:'ONEROOF',records:records,paginationLinks:links,complete:false,lastPage:null,coverage:'OBSERVED_PAGE_ONLY'};
  }
  function mzipList(r){var root=C.response(r),links=C.anchors(root,r.url,function(h){return /\/o\/mzip\/recruitments\/[0-9a-f-]{36}(?:$|\?)/.test(h);});C.assert(links.length,'LAYOUT','MZIP recruitment cards');return {records:links.map(function(a){return {sourceNoticeKey:'MZIP:'+a.url.match(/recruitments\/([0-9a-f-]{36})/)[1],title:a.label,detailUrl:a.url};}),complete:false,paginationStatus:'UNVERIFIED'};}
  function mzip(r){
    var id=(r.url.match(/\/recruitments\/([0-9a-f-]{36})(?:$|\?)/)||[])[1];C.assert(id,'IDENTITY','MZIP UUID');
    var root=C.response(r),h=C.one(root,function(n){return n.tag==='h1';},'MZIP h1');var main=C.find(root,function(n){return n.tag==='main';})[0]||root;
    var ls=C.lines(main),body=C.text(main).trim(),year=null;
    // Body schedule uses standard labelled lines. Hero remains a separate claim.
    var sc=C.schedules(ls,year,{url:r.url,layer:'WEB_BODY'});year=sc.claims.length?sc.claims[0].start.date.slice(0,4):null;var flat=C.norm(body),hero=flat.match(/모집 기간\s*(\d{1,2})월\s*(\d{1,2})일\s*[–~]\s*(\d{1,2})월\s*(\d{1,2})일\s*(\d{1,2})시/);
    if(hero){C.assert(year,'DATE','MZIP year context missing');var raw=year+'.'+hero[1]+'.'+hero[2]+' ~ '+hero[3]+'.'+hero[4]+' '+hero[5]+':00';var c=C.claim(raw,year,{url:r.url,layer:'WEB_HERO'},'APPLICATION_WINDOW');c.evidence.quote=hero[0];sc.claims.push(c);}
    var at=C.anchors(main,r.url,function(h){return /\/storage\/v1\/object\/public\/recruitment-files\//.test(h);});
    var o=C.observation('MZIP',id,C.norm(C.text(h)),r.url,body,at,sc.claims);o.scheduleUnparsed=sc.unparsed;o.facts=ls.filter(function(l){return /주택위치|공급호수|사업주체/.test(l);}).map(function(l){return {quote:l,origin:{url:r.url,layer:'WEB_BODY'}};});return o;
  }
  function gh(r){
    var root=C.response(r),id=C.query(r.url,'pbancNo');C.assert(/^\d+$/.test(id||''),'IDENTITY','GH pbancNo');
    var at=C.anchors(root,r.url,function(h){return /download|fileDown|downloadFile/i.test(h);});
    var all=C.find(root,function(n){return n.tag==='tr';}).map(function(n){return C.norm(C.text(n));}),sc=C.schedules(all,(C.text(root).match(/2026/)||[])[0],{url:r.url,layer:'WEB_BODY'});
    return {sourceNoticeKey:'GH:'+id,attachments:at,schedule:C.reconcile(sc.claims),operatorLinks:(C.norm(C.text(root)).match(/https:\/\/www\.yesnanum\.org\/bbs\/board\.php\?bo_table=notice&wr_id=\d+|한지붕\.kr\/65/g)||[]).map(function(u){return {url:u.indexOf('https:')===0?u:'https://www.xn--9r3bn6tz4i.kr/65',evidence:u,linkedFrom:r.url,relation:'OFFICIAL_TEXT_REFERENCE'};}),relationsStatus:'DIRECT_LINK_ONLY_PRESERVE_BOTH_SOURCE_KEYS'};
  }
  return {nanum:nanum,roof:roof,mzip:mzip,mzipList:mzipList,gh:gh};
})(typeof module!=='undefined'&&module.exports?require('./housing_core'):HA53Core);
if(typeof module!=='undefined'&&module.exports)module.exports=HA53Operators;

'use strict';
var HA54Local=(function(C){
  function pajuRequest(page,keyword){C.assert(Number.isSafeInteger(page)&&page>0,'ARGUMENT','Paju page');return {method:'get',url:'https://www.paju.go.kr/user/board/BD_board.list.do?bbsCd=1022&q_ctgCd=4063&q_currPage='+page+(keyword?'&q_searchKeyType=TITLE___1002&q_searchVal='+encodeURIComponent(keyword):'')};}
  function pajuList(r,page){
    var root=C.response(r),m=C.norm(C.text(C.byClass(root,'total'))).match(/총\s*([\d,]+)건,?\s*페이지\s*(\d+)\s*\/\s*([\d,]+)/);C.assert(m&&Number(m[2])===page,'PARTIAL','Paju page metadata');
    var seen={},rs=C.find(root,function(n){return n.tag==='tr'&&C.find(n,function(a){return /jsView\(/.test(a.attrs.onclick||'');}).length;}).map(function(tr){var a=C.one(tr,function(x){return x.tag==='a'&&/jsView\(/.test(x.attrs.onclick||'');},'Paju onclick'),k=a.attrs.onclick.match(/jsView\(\s*'(\d+)'\s*,\s*'(\d+)'/);C.assert(k&&k[1]==='1022'&&!seen[k[2]],'IDENTITY','Paju key');seen[k[2]]=true;return {sourceNoticeKey:'PAJU:1022:'+k[2],seq:k[2],title:C.norm(C.text(a)),detailUrl:'https://www.paju.go.kr/user/board/BD_board.view.do?bbsCd=1022&seq='+k[2],classification:C.category(C.text(a))};});
    C.assert(rs.length||Number(m[1])===0,'LAYOUT','Paju rows missing');return {pageIndex:page,total:Number(m[1].replace(/,/g,'')),totalPages:Number(m[3].replace(/,/g,'')),records:rs,complete:false};
  }
  function pajuDetail(r){var root=C.response(r),seq=C.query(r.url,'seq');C.assert(C.query(r.url,'bbsCd')==='1022'&&/^\d+$/.test(seq||''),'IDENTITY','Paju seq required');var body=C.byClass(root,'article-body'),head=C.byClass(root,'article-header'),title=C.norm(C.text(C.byClass(head,'article-subject')));var ls=C.lines(body),claims=[];
    ls.filter(function(l){return /신청접수는/.test(l);}).forEach(function(l){var c=C.claim(l,null,{url:r.url,layer:'WEB_BODY'},'APPLICATION_WINDOW','ONSITE');if(c)claims.push(c);});
    var o=C.observation('PAJU','1022:'+seq,title,r.url,C.text(body).trim(),C.anchors(head,r.url,function(h){return /\/component\/file\/ND_fileDownload\.do\?id=/.test(h);}).map(function(a){a.fileId=C.query(a.url,'id');return a;}),claims);o.sector='PUBLIC_RENT';return o;}
  function uucRequest(page,keyword){C.assert(Number.isSafeInteger(page)&&page>0,'ARGUMENT','UUC page');return {method:'get',url:'https://uuc.or.kr/base/board/list?boardManagementNo=17&menuNo=36&page='+page+(keyword?'&searchType=total&searchWord='+encodeURIComponent(keyword):'')};}
  function uucList(r,page){var root=C.response(r),nav=C.byClass(root,'pagination'),active=C.one(nav,function(n){return C.cls(n,'active');},'UUC active page');C.assert(parseInt(C.norm(C.text(active)),10)===page,'PARTIAL','UUC page mismatch');var links=C.anchors(nav,r.url,function(h){return /[?&]page=/.test(h);});var rows=C.find(root,function(n){return n.tag==='tr'&&C.find(n,function(a){return a.tag==='a'&&/boardNo=/.test(a.attrs.href||'');}).length;});C.assert(rows.length,'LAYOUT','UUC rows missing');var seen={};return {pageIndex:page,paginationLinks:links,lastLinkedPage:links.length?Math.max.apply(null,links.map(function(a){return Number(C.query(a.url,'page'));})):page,complete:false,records:rows.map(function(tr){var a=C.one(tr,function(x){return x.tag==='a'&&/boardNo=/.test(x.attrs.href||'');},'UUC link'),id=C.query(a.attrs.href,'boardNo');C.assert(/^\d+$/.test(id||'')&&!seen[id]&&C.query(a.attrs.href,'boardManagementNo')==='17','IDENTITY','UUC board key');seen[id]=true;return {sourceNoticeKey:'UUC:17:'+id,boardNo:id,title:C.norm(C.text(a)),postedDate:C.norm(C.text(C.byClass(tr,'date'))),detailUrl:C.absolute(r.url,a.attrs.href),classification:C.category(C.text(a))};})};}
  function uucDetail(r){var root=C.response(r),id=C.query(r.url,'boardNo');C.assert(C.query(r.url,'boardManagementNo')==='17'&&/^\d+$/.test(id||''),'IDENTITY','UUC board key');var body=C.byClass(root,'board_view_con'),head=C.byClass(root,'board_view_top'),sc=C.schedules(C.lines(body),null,{url:r.url,layer:'WEB_BODY'});var o=C.observation('UUC','17:'+id,C.norm(C.text(C.byClass(head,'tit'))),r.url,C.text(body).trim(),C.anchors(C.byClass(root,'board_view_file'),r.url,function(h){return /\/download\/BASIC_ATTACH\?storageNo=/.test(h);}).map(function(a){a.storageNo=C.query(a.url,'storageNo');return a;}),sc.claims);o.scheduleUnparsed=sc.unparsed;o.unitTypeHints=(o.bodyText.match(/59[AB]/g)||[]);o.exactExclusiveAreaSqm=null;return o;}
  return {pajuRequest:pajuRequest,pajuList:pajuList,pajuDetail:pajuDetail,uucRequest:uucRequest,uucList:uucList,uucDetail:uucDetail};
})(typeof module!=='undefined'&&module.exports?require('./housing_core'):HA53Core);
if(typeof module!=='undefined'&&module.exports)module.exports=HA54Local;

'use strict';
/** Parses injected page text. PDF bytes -> text extraction is LOCAL Python, not GAS. */
var HA53Pdf=(function(C){
  function parse(doc,source){
    C.assert(doc&&/^https:\/\//.test(doc.url)&&/^[a-f0-9]{64}$/.test(doc.sha256)&&Array.isArray(doc.pages),'INPUT','PDF page text envelope required');
    var claims=[],evidence=[],unparsed=[],seenPages={};
    doc.pages.forEach(function(pg){C.assert(Number.isSafeInteger(pg.page)&&pg.page>0&&!seenPages[pg.page]&&typeof pg.text==='string','SCHEMA','unique PDF page required');seenPages[pg.page]=true;
      var s=C.norm(pg.text),origin={url:doc.url,sha256:doc.sha256,page:pg.page,layer:'PDF_TEXT',extractor:doc.extractor,extractionLimitations:doc.extractionLimitations||[]};
      // Only a directly labelled application row or a known supply-schedule section.
      var chunks=[],m,re=/(?:신청접수|신청·접수|청약신청\s*기간|청약\s*접수기간)\s*[:：]?\s*((?:20\d{2}|\d{1,2})\s*\.[\s\S]{0,300})/g;
      while((m=re.exec(s)))chunks.push(m[0].slice(0,230));
      if(/공급일정|모집일정/.test(s)&&/청약신청|신청접수/.test(s)){
        var start=s.search(/공급일정|모집일정/);chunks.push(s.slice(start,start+850));
      }
      chunks.forEach(function(chunk){
        var year=(s.match(/(?:모집\s*공고일|모집공고)\s*[:：(]?\s*(20\d{2})\s*\./)||[])[1]||(s.match(/[`‘'](\d{2})\s*\./)||[])[1];
        // Explicit year on the range takes precedence over context.
        var normalized=chunk.replace(/(\d{1,2})시(?:\s*마감)?/g,'$1:00').replace(/(\d{1,2}):(\d{2})시/g,'$1:$2');
        var c=C.claim(normalized,year,origin,'APPLICATION_WINDOW',source==='PAJU'?'ONSITE':'UNSPECIFIED');
        if(c){
          // A table row may specify closing time in a separate note directly after its date range.
          if(!c.end.time){var tail=normalized.slice(normalized.indexOf(c.evidence.matched)+c.evidence.matched.length);var tm=tail.match(/^\s*(?:온라인 접수\s*마감일\s*\([^)]*?\s)?(\d{1,2}):([0-5]\d)/);if(tm){c.end.time=String(tm[1]).padStart(2,'0')+':'+tm[2];c.end.precision='MINUTE';}}
          var k=JSON.stringify([c.start,c.end]);if(!claims.some(function(x){return x.evidence.origin.page===pg.page&&JSON.stringify([x.start,x.end])===k;}))claims.push(c);
        }else unparsed.push({origin:origin,quote:chunk,reason:'NO_UNAMBIGUOUS_APPLICATION_RANGE'});
      });
      // Preserve official housing facts as claims; never take community/total/supply area as unit-exclusive area.
      var facts=pg.text.split(/\n/).filter(function(l){return /공급주택\s*:|주택위치|전용면적|전유면적|코워킹|커뮤니티|공급대상 주택/.test(l);});
      facts.forEach(function(l){evidence.push({quote:l,origin:origin,interpretation:'RAW_OFFICIAL_CLAIM_REQUIRES_TABLE_CONTEXT'});});
    });
    return {sourceId:source,schedule:C.reconcile(claims),factClaims:evidence,unparsed:unparsed,pdf: {url:doc.url,sha256:doc.sha256,pages:doc.pages.length,extractionLimitations:doc.extractionLimitations},exactUnitAreas:'UNVERIFIED_REQUIRES_TABLE_PARSER'};
  }
  function attach(observation,pdf){C.assert(observation.attachments.some(function(a){return a.url===pdf.pdf.url;}),'IDENTITY','PDF must be linked by this observation; resolve attachment aliases explicitly upstream');var merged=JSON.parse(JSON.stringify(observation));merged.schedule=C.reconcile(observation.schedule.claims.concat(pdf.schedule.claims));merged.pdfEvidence=(merged.pdfEvidence||[]).concat([pdf]);return merged;}
  return {parse:parse,attach:attach};
})(typeof module!=='undefined'&&module.exports?require('./housing_core'):HA53Core);
if(typeof module!=='undefined'&&module.exports)module.exports=HA53Pdf;

'use strict';
/** v0.3 lightweight cursor + isolated transaction sink. No production storage/delivery. */
var HA53Collector=(function(C,S,H,T){
  function initial(source,snapshotId,mode){C.assert(['SOCO','HUG_NOTICE'].indexOf(source)>=0,'STAGE_IDENTITY','collector only supports SOCO/HUG public lists');return T.initial(source,snapshotId||('snapshot_'+Date.now()+'_'+Math.random().toString(36).slice(2)),mode);}
  function request(state){T.assertCursor(state);C.assert(['SOCO','HUG_NOTICE'].indexOf(state.source)>=0,'STAGE_IDENTITY','not a collector route');C.assert(['READY','RETRY_WAIT'].indexOf(state.status)>=0,'STATE','not collectable: '+state.status);return state.source==='SOCO'?S.soco53Request(state.nextPage):H.request(state.nextPage);}
  function sinkRequired(sink){C.assert(sink&&sink.namespace===T.NAMESPACE&&typeof sink.commit==='function'&&typeof sink.loadCursor==='function','STAGE_SINK','isolated v0.3 sink required; acknowledgement-only callback no longer accepted');}
  function committed(sink,packet){
    sinkRequired(sink);var receipt=sink.commit(packet);
    C.assert(receipt&&receipt.committed===true&&receipt.cursor,'ACK','cursor not advanced without durable transaction acknowledgement');
    T.assertCursor(receipt.cursor);C.assert(receipt.cursor.revision===packet.baseCursor.revision+1&&receipt.cursor.commitRef===receipt.commitRef,'ACK','invalid transaction receipt');
    return {state:T.copy(receipt.cursor),committed:packet.kind==='PAGE',checkpointCommitted:true,replayed:!!receipt.replayed,page:packet.page||null};
  }
  function control(state,next,sink){return committed(sink,{kind:'CONTROL',baseCursor:state,candidateCursor:next});}
  function failure(state,error,now,sink){
    var next=T.copy(state);next.attempts++;
    var integrity=/HA53_(?:PARTIAL|STAGE_DUPLICATE|STAGE_TOTAL)/.test(error.message||'');
    next.status=integrity?'RESTART_REQUIRED':next.attempts>=3?'STOPPED':'RETRY_WAIT';
    next.nextAttemptAt=now+Math.min(60000,1000*Math.pow(2,next.attempts-1));next.lastError=String(error.message||error).slice(0,240);
    var out=control(state,next,sink);out.error=next.lastError;return out;
  }
  function step(state,response,now,sink){
    T.assertCursor(state);C.assert(['SOCO','HUG_NOTICE'].indexOf(state.source)>=0,'STAGE_IDENTITY','not a collector route');sinkRequired(sink);
    C.assert(typeof now==='number'&&Number.isFinite(now),'ARGUMENT','explicit clock required');
    C.assert(['READY','RETRY_WAIT'].indexOf(state.status)>=0,'STATE','resume/restart required: '+state.status);C.assert(now>=state.nextAttemptAt,'STATE','retry is not due');
    var page,next;
    try{
      page=state.source==='SOCO'?S.soco53ParsePage(response.text,state.nextPage,response.status):H.parseList(response,state.nextPage);
      var size=page.pageSize||10;
      if(state.total!==null)C.assert(page.total===state.total&&page.totalPages===state.totalPages&&size===state.pageSize,'PARTIAL','official totals changed; restart snapshot');
      next=T.copy(state);next.total=page.total;next.totalPages=page.totalPages;next.pageSize=size;
      next.nextPage++;next.observedCount+=page.count;next.uniqueCount+=page.count;next.attempts=0;next.nextAttemptAt=0;next.lastError=null;
      // Official dynamic total, no historical 3-page upper limit.
      next.status=page.pageIndex===Math.max(1,page.totalPages)?'COMPLETE':'READY';
    }catch(e){return failure(state,e,now,sink);}
    var packet={kind:'PAGE',baseCursor:state,candidateCursor:next,page:page,rawResponse:{url:response.url||null,status:response.status,text:response.text,sha256:response.sha256||null,observedAt:response.observedAt||null}};
    if(response.fixtureSha256)packet.rawResponse.fixtureSha256=response.fixtureSha256;
    // Storage/CAS failures propagate. Caller must reload the journal before retrying.
    // Never misclassify an ambiguous storage ACK as an HTTP retry or advance a local cursor.
    return committed(sink,packet);
  }
  function resume(state,sink){T.assertCursor(state);C.assert(state.status==='STOPPED','STATE','only STOPPED can resume; changed totals require restart');var s=T.copy(state);s.status='READY';s.attempts=0;s.nextAttemptAt=0;s.lastError=null;return control(state,s,sink).state;}
  function restart(state,newSnapshotId){T.assertCursor(state);C.assert(newSnapshotId&&newSnapshotId!==state.snapshotId,'STATE','restart requires a fresh snapshot ID');return initial(state.source,newSnapshotId,state.mode);}
  function loadOrInitial(sink,source,snapshotId,mode){sinkRequired(sink);return sink.loadCursor(source,snapshotId)||initial(source,snapshotId,mode);}
  function runBatch(state,transport,sink,options){
    sinkRequired(sink);var o=options||{},clock=o.now||Date.now;C.assert(typeof clock==='function'&&(o.deadlineMs===undefined||Number.isFinite(o.deadlineMs)),'ARGUMENT','valid clock/deadline required');
    C.assert(Number.isSafeInteger(o.maxRequests)&&o.maxRequests>0&&o.maxRequests<=10000,'ARGUMENT','explicit bounded maxRequests required');C.assert(typeof transport==='function','ARGUMENT','injected read-only transport required');
    // Recover a commit whose ACK was lost before the caller updated its cursor.
    var restored=sink.loadCursor(state.source,state.snapshotId);if(restored)state=restored;
    var requests=0,reason='REQUEST_BUDGET';
    while(requests<o.maxRequests){
      if(state.status==='COMPLETE'){reason='COMPLETE';break;}
      if(['STOPPED','RESTART_REQUIRED'].indexOf(state.status)>=0){reason=state.status;break;}
      var now=clock();if(o.deadlineMs!==undefined&&now>=o.deadlineMs){reason='TIME_BUDGET';break;}
      if(now<state.nextAttemptAt){reason='RETRY_WAIT';break;}
      var rq=request(state),r;assertPublicRequest(rq);requests++;
      try{r=transport(rq);}catch(e){r={url:rq.url,status:0,text:'',transportError:String(e.message||e)};}
      C.assert(r&&typeof r.then!=='function','ARGUMENT','sync transport required (use step after awaited Node fetch)');
      state=step(state,r,clock(),sink).state;
    }
    if(['COMPLETE','STOPPED','RESTART_REQUIRED','RETRY_WAIT'].indexOf(state.status)>=0)reason=state.status;
    return {state:state,requests:requests,reason:reason,deliveryCapability:'NONE'};
  }
  function fetchGAS(rq){
    assertPublicRequest(rq);
    var r=UrlFetchApp.fetch(rq.url,{method:rq.method||'get',contentType:rq.contentType,payload:rq.payload,muteHttpExceptions:true,followRedirects:false});
    return {url:rq.url,status:r.getResponseCode(),text:r.getContentText(rq.charset||'UTF-8')};
  }
  function assertPublicRequest(rq){
    C.assert(rq&&typeof rq.url==='string','ARGUMENT','request required');
    var soco=/^https:\/\/soco\.seoul\.go\.kr\/youth\/pgm\/home\/yohome\/bbsListJson\.json$/.test(rq.url)&&rq.method==='post'&&rq.payload&&rq.payload.bbsId==='BMSR00015';
    var hug=/^https:\/\/www\.khug\.or\.kr\/jeonse\/web\/s07\/s070301\.jsp\?currentPage=\d+&id=1295&mode=L$/.test(rq.url)&&(rq.method||'get')==='get';
    C.assert(soco||hug,'NETWORK_SCOPE','only public SOCO list POST / HUG notice GET permitted');
  }
  return {initial:initial,request:request,step:step,resume:resume,restart:restart,loadOrInitial:loadOrInitial,runBatch:runBatch,fetchGAS:fetchGAS,assertPublicRequest:assertPublicRequest};
})(typeof module!=='undefined'&&module.exports?require('./housing_core'):HA53Core,typeof module!=='undefined'&&module.exports?require('./soco53_adapter'):{soco53Request:soco53Request,soco53ParsePage:soco53ParsePage},typeof module!=='undefined'&&module.exports?require('./hug53_adapter'):HA53Hug,typeof module!=='undefined'&&module.exports?require('./staging53'):HA53Stage);
if(typeof module!=='undefined'&&module.exports)module.exports=HA53Collector;

'use strict';
var HA53MvpRoutes = (function (C, A, H, O, L, S) {
  var paths = {
    SOCO: {detail:'soco.seoul.go.kr/youth/bbs/BMSR00015/view.do', file:'soco.seoul.go.kr/coHouse/cmmn/file/fileDown.do'},
    HUG_NOTICE: {detail:'www.khug.or.kr/jeonse/web/s07/s070301.jsp', file:'www.khug.or.kr/khugcms/board/skin_jeonse/download.jsp'},
    NANUM: {detail:'www.yesnanum.org/bbs/board.php', file:'www.yesnanum.org/bbs/download.php'},
    ONEROOF: {list:'www.xn--9r3bn6tz4i.kr/65', file:'www.xn--9r3bn6tz4i.kr/post_file_download.cm'},
    MZIP: {list:'mzip.kr/o/mzip/recruitments'},
    PAJU: {list:'paju.go.kr/user/board/BD_board.list.do', detail:'paju.go.kr/user/board/BD_board.view.do', file:'paju.go.kr/component/file/ND_fileDownload.do'},
    UUC: {list:'uuc.or.kr/base/board/list', detail:'uuc.or.kr/base/board/read', file:'uuc.or.kr/download/BASIC_ATTACH'}
  };
  var digits = /^\d+$/;
  function main(source) { return source==='SOCO'||source==='HUG_NOTICE'; }
  function known(source){return Object.prototype.hasOwnProperty.call(paths,source);}
  function get(source,kind,url) {
    return {source:source,kind:kind,url:url,method:'get',charset:source==='HUG_NOTICE'?'EUC-KR':'UTF-8'};
  }
  function endpoint(url){return url.split('?')[0].slice(8).replace(/^(uuc\.or\.kr):443\//,'$1/');}
  function authorize(r) {
    C.assert(r&&known(r.source)&&typeof r.url==='string'&&/^https:\/\/[a-z0-9.-]+(?::443)?\/[^\s#\\]*$/i.test(r.url),'MVP_URL','public HTTPS endpoint required');
    if(r.kind==='list'&&main(r.source)){
      A.assertPublicRequest(r);
      if(r.source==='SOCO') C.assert(JSON.stringify(r.payload)===JSON.stringify(S.request(Number(r.payload.pageIndex)).payload),'MVP_URL','unexpected SOCO filters');
      return;
    }
    C.assert(r.method==='get'&&!r.payload,'MVP_URL','public GET required');
    var p=paths[r.source],e=endpoint(r.url),q=function(k){return C.query(r.url,k)||'';};
    var ok=e===p[r.kind];
    if(r.source==='MZIP'&&r.kind==='detail')ok=/^mzip\.kr\/o\/mzip\/recruitments\/[0-9a-f-]{36}$/.test(e);
    if(r.source==='MZIP'&&r.kind==='file')ok=/^njhhtoiwnromrqrywmeo\.supabase\.co\/storage\/v1\/object\/public\/recruitment-files\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/i.test(e);
    C.assert(ok,'MVP_URL','unexpected source path');
    if(r.source==='SOCO') ok=r.kind==='detail'?digits.test(q('boardId'))&&q('menuNo')==='400008':/^[a-zA-Z0-9_-]+$/.test(q('atchFileId'))&&digits.test(q('fileSn'));
    if(r.source==='HUG_NOTICE') ok=r.kind==='detail'?q('mode')==='S'&&digits.test(q('articleId')):q('id')==='1295'&&digits.test(q('fileId'));
    if(r.source==='NANUM') ok=q('bo_table')==='notice'&&digits.test(q('wr_id'))&&(r.kind==='detail'||digits.test(q('no')));
    if(r.source==='ONEROOF'&&r.kind==='file')ok=/^[A-Za-z0-9+/=_-]+$/.test(q('c'));
    if(r.source==='PAJU') ok=r.kind==='list'?q('bbsCd')==='1022'&&q('q_ctgCd')==='4063'&&digits.test(q('q_currPage')):r.kind==='detail'?q('bbsCd')==='1022'&&digits.test(q('seq')):/^[a-f0-9-]{36}$/i.test(q('id'));
    if(r.source==='UUC')ok=r.kind==='file'?digits.test(q('storageNo')):q('boardManagementNo')==='17'&&(r.kind==='list'||digits.test(q('boardNo')));
    C.assert(ok,'MVP_URL','unexpected source parameters');
  }
  function discovery(source,page,nanumId) {
    switch(source){
      case 'NANUM':
        C.assert(page===1&&typeof nanumId==='string'&&digits.test(nanumId),'MVP_INPUT','NANUM requires a public wr_id and page 1');
        return get(source,'detail','https://'+paths.NANUM.detail+'?bo_table=notice&wr_id='+nanumId);
      case 'ONEROOF':
        C.assert(page===1,'MVP_INPUT','OneRoof pilot supports page 1');
        return get(source,'list','https://'+paths.ONEROOF.list);
      case 'MZIP':
        C.assert(page===1,'MVP_INPUT','MZIP pilot supports page 1');
        return get(source,'list','https://'+paths.MZIP.list);
      case 'PAJU': return get(source,'list',L.pajuRequest(page,'파인').url.replace('https://www.paju.go.kr/','https://paju.go.kr/'));
      case 'UUC': return get(source,'list',L.uucRequest(page,'행복주택').url);
      default: C.fail('MVP_INPUT','unknown discovery source');
    }
  }
  function rows(source,r,page) {
    switch(source){
      case 'NANUM': return [O.nanum(r)];
      case 'ONEROOF': return O.roof(r).records;
      case 'MZIP': return O.mzipList(r).records;
      case 'PAJU': return L.pajuList(r,page).records.filter(function(row){return /\bFINE\b|파인/.test(row.title)&&row.classification==='RECRUITMENT';});
      case 'UUC': return L.uucList(r,page).records.filter(function(row){return /행복주택/.test(row.title)&&row.classification==='RECRUITMENT';});
      default: C.fail('MVP_INPUT','unknown discovery source');
    }
  }
  function detailRequest(source,row) {
    var url=row.detailUrl;
    if(source==='PAJU')url='https://'+paths.PAJU.detail+'?bbsCd=1022&q_ctgCd=4063&seq='+row.seq;
    if(source==='UUC'){
      var id=C.query(url,'boardNo');
      C.assert(digits.test(id||'')&&C.query(url,'boardManagementNo')==='17','MVP_IDENTITY','unexpected UUC board ID');
      url='https://'+paths.UUC.detail+'?boardManagementNo=17&boardNo='+id+'&menuNo=36';
    }
    return get(source,'detail',url);
  }
  function detail(source,r,row) {
    switch(source){
      case 'SOCO': return S.detail(r,row);
      case 'HUG_NOTICE': {
        var o=H.parseDetail(r);
        if(o.classification!=='RECRUITMENT')return o;
        var schedule=C.schedules(o.bodyText.split(/\n/),row.postedDate.slice(0,4),{url:r.url,layer:'WEB_BODY'});
        o.schedule=C.reconcile(schedule.claims);
        o.scheduleUnparsed=schedule.unparsed;
        return o;
      }
      case 'MZIP': return O.mzip(r);
      case 'PAJU': return L.pajuDetail(r);
      case 'UUC': return L.uucDetail(r);
      default: C.fail('MVP_INPUT','unknown detail source');
    }
  }
  return {main:main,known:known,authorize:authorize,discovery:discovery,rows:rows,detailRequest:detailRequest,detail:detail,get:get};
})(
  typeof module!=='undefined'&&module.exports?require('./housing_core'):HA53Core,
  typeof module!=='undefined'&&module.exports?require('./collector53'):HA53Collector,
  typeof module!=='undefined'&&module.exports?require('./hug53_adapter'):HA53Hug,
  typeof module!=='undefined'&&module.exports?require('./operators53_adapter'):HA53Operators,
  typeof module!=='undefined'&&module.exports?require('./local54_adapter'):HA54Local,
  typeof module!=='undefined'&&module.exports?{request:require('./soco53_adapter').soco53Request,detail:require('./soco53_adapter').soco53ParseDetail}:{request:soco53Request,detail:soco53ParseDetail}
);
if(typeof module!=='undefined'&&module.exports) module.exports=HA53MvpRoutes;

'use strict';
var HA53MvpTransport = (function(C,R) {
  function hex(bytes) {
    return Array.prototype.map.call(bytes,function(b){return (b & 255).toString(16).padStart(2,'0');}).join('');
  }
  function create(services) {
    var s=services||{fetch:function(url,options){return UrlFetchApp.fetch(url,options);},utilities:Utilities};
    return function(request) {
      R.authorize(request);
      var options={method:request.method,muteHttpExceptions:true,followRedirects:false};
      if(request.payload){
        options.contentType=request.contentType;
        options.payload=Object.keys(request.payload).map(function(k){
          return encodeURIComponent(k)+'='+encodeURIComponent(request.payload[k]);
        }).join('&');
      }
      if(request.source==='SOCO'&&request.kind==='list'){
        options.headers={Referer:'https://soco.seoul.go.kr/youth/bbs/BMSR00015/list.do?menuNo=400008'};
      }
      if(request.referer){
        var parent=R.get(request.source,'detail',request.referer);
        if(request.source==='ONEROOF')parent.kind='list';
        R.authorize(parent);
        options.headers={Referer:request.referer};
      }
      if(request.source==='NANUM'&&request.kind==='file'&&request.session){
        options.headers=options.headers||{};
        options.headers.Cookie=request.session;
      }
      var response=s.fetch(request.url,options);
      var bytes=response.getContent(),headers=response.getAllHeaders(),status=response.getResponseCode();
      function header(name){
        var key=Object.keys(headers).find(function(k){return k.toLowerCase()===name;});
        return key?headers[key]:null;
      }
      var out={url:request.url,status:status,sha256:hex(s.utilities.computeDigest(s.utilities.DigestAlgorithm.SHA_256,bytes)),
        bytes:bytes.length,contentType:String(header('content-type')||''),observedAt:new Date().toISOString()};
      if(request.kind==='file'){
        out.magic=hex(bytes.slice(0,16));
        if(status===200&&bytes.length<=request.byteLimit)out.base64=s.utilities.base64Encode(bytes);
      }else if(bytes.length<=request.byteLimit){
        out.text=response.getContentText(request.charset||'UTF-8');
      }
      if(request.source==='NANUM'&&request.kind==='detail'){
        var cookies=header('set-cookie')||[];
        // Only the anonymous PHP session for this origin, carried to its own download link.
        out.session=[].concat(cookies).map(function(v){return String(v).split(';')[0].trim();})
          .filter(function(v){return /^PHPSESSID=[a-zA-Z0-9,-]{1,128}$/.test(v);})[0]||null;
      }
      return out;
    };
  }
  return {create:create};
})(typeof module!=='undefined'&&module.exports?require('./housing_core'):HA53Core,
   typeof module!=='undefined'&&module.exports?require('./mvp_routes53'):HA53MvpRoutes);
if(typeof module!=='undefined'&&module.exports) module.exports=HA53MvpTransport;

'use strict';
var HA53Mvp = (function(C,A,T,G,R,F,E,H,P) {
  function bounded(value,fallback,min,max){
    if(value===undefined)return fallback;
    C.assert(Number.isSafeInteger(value)&&value>=min&&value<=max,'MVP_INPUT','value outside pilot bounds');
    return value;
  }
  function captureId(kind,source,batch,key){
    return 'mvp_'+kind+'_'+H.digest([source,batch,key]).slice(0,40);
  }
  function evidence(r,body){
    var out={url:r.url,status:r.status,sha256:r.sha256||null,fixtureSha256:r.fixtureSha256||null,
      observedAt:r.observedAt||null,bytes:r.bytes,contentType:r.contentType||null};
    if(body&&typeof r.text==='string')out.text=r.text;
    return out;
  }
  function attachmentKind(magic,label){
    if(/^255044462d/i.test(magic))return 'PDF';
    if(/^d0cf11e0a1b11ae1/i.test(magic)&&/\.hwp\b/i.test(label))return 'HWP_CONTAINER';
    if(/^504b0304/i.test(magic)&&/\.(?:zip|hwpx|docx|xlsx)\b/i.test(label))return 'ZIP_CONTAINER';
    return null;
  }
  function optionsForHandoff(row,list,raw){
    var source=row.sourceId,quoteEvidence=[],known={};
    var labelled=/(?:주택\s*(?:위치|주소|소재지)|공급주택\s*(?:위치|주소|소재지)|대상주택|사업\s*위치|소재지|단지\s*주소)/;
    String(row.bodyText||'').split(/\n/).forEach(function(line){
      var q=C.norm(line);
      if(q.length>380||!labelled.test(q))return;
      var m=q.match(/(?:서울특별시|서울시)\s+([가-힣]+구)\s+([^;|]+)|경기도\s+([가-힣]+[시군])\s+([^;|]+)/);
      if(!m||!/[0-9]/.test(m[2]||m[4])||known[m[0]])return;
      known[m[0]]=true;
      quoteEvidence.push({sido:m[1]?'서울특별시':'경기도',sigungu:m[1]||m[3],quote:q,
        origin:{url:row.url,layer:'WEB_BODY'},status:'OFFICIAL_LITERAL_ADDRESS_EVIDENCE'});
    });
    var type=row.sector||row.sectorHint||null,typeEvidence=null;
    if(source==='SOCO_YOUTH'&&row.listRecord){
      typeEvidence={origin:{url:list.url,layer:'SOCO_LIST_JSON'},field:'optn2',
        value:row.listRecord.raw.optn2,basis:'OFFICIAL_LIST_FIELD_MAPPING'};
    }else{
      var lines=String(row.bodyText||'').split(/\n/),proof=lines.find(function(line){
        return /(?:공공임대주택|매입임대주택|행복주택|공공지원민간임대)/.test(line)&&line.length<500;
      });
      // Keep a jurisdiction-specific parser's explicit classification or a literal body statement.
      if(source==='UUC'&&proof&&/행복주택/.test(proof))type='PUBLIC_RENT';
      if((source==='NANUM'||source==='MZIP'||source==='ONEROOF')&&proof&&
        /(?:경기주택도시공사|한국토지주택공사|서울주택도시공사|\bLH\b|\bGH\b|\bSH\b)/.test(proof)&&/매입임대주택/.test(proof))type='PUBLIC_RENT';
      if(type&&proof)typeEvidence={quote:C.norm(proof),origin:{url:row.url,layer:'WEB_BODY'},basis:'OFFICIAL_BODY'};
      if(source==='PAJU'&&type&&!typeEvidence)
        typeEvidence={origin:{url:row.url,layer:'WEB_BODY'},basis:'FINE_OFFICIAL_PARSER'};
    }
    return {regionEvidence:quoteEvidence,sourceResponseSha256:raw.sha256,fixtureSha256:raw.fixtureSha256,
      supplyType:type,supplyTypeEvidence:typeEvidence};
  }
  function handoff(staged,raw){
    var result=E.convert(staged,raw.canonicalOptions),row=staged.observation;
    if(row.classification!=='RECRUITMENT')result.holdReasons.push('SOURCE_CLASSIFICATION_'+row.classification);
    if(row.attachments.some(function(a){return a.captureStatus!=='DOCUMENT_STAGED';}))result.holdReasons.push('ATTACHMENT_CAPTURE_INCOMPLETE');
    if(row.attachments.some(function(a){return a.documentKind==='PDF'&&!a.pdfTextParsed;}))result.holdReasons.push('ATTACHMENT_TEXT_UNVERIFIED');
    return result;
  }
  function checkInput(cfg) {
    C.assert(cfg&&R.known(cfg.source)&&typeof cfg.captureId==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(cfg.captureId),
      'MVP_INPUT','source and stable captureId required');
    var o=Object.assign({},cfg);
    o.page=bounded(o.page,1,1,2000);
    o.maxNotices=bounded(o.maxNotices,Array.isArray(o.noticeKeys)&&o.noticeKeys.length?o.noticeKeys.length:1,1,10);
    o.maxAttachments=bounded(o.maxAttachments,3,0,12);
    o.maxRequests=bounded(o.maxRequests,10,1,60);
    o.maxDocumentBytes=bounded(o.maxDocumentBytes,3145728,128,4194304);
    o.maxDocumentBytesPerNotice=bounded(o.maxDocumentBytesPerNotice,4194304,128,4194304);
    o.maxHtmlBytes=bounded(o.maxHtmlBytes,1048576,1024,1572864);
    o.timeBudgetMs=bounded(o.timeBudgetMs,90000,1000,230000);
    if(o.source==='NANUM')R.discovery(o.source,o.page,o.nanumNoticeId);
    if(o.noticeKeys!==undefined)C.assert(Array.isArray(o.noticeKeys)&&o.noticeKeys.length>0&&o.noticeKeys.length<=10&&new Set(o.noticeKeys).size===o.noticeKeys.length&&o.noticeKeys.every(function(k){return typeof k==='string'&&k.length<=160;}),'MVP_INPUT','unique noticeKeys required');
    return o;
  }
  function readTransactions(sink,source,id){return sink.transactions(source,id);}
  function run(config, deps){
    var cfg=checkInput(config),d=deps||{},source=cfg.source,start=(d.now||Date.now)(),clock=d.now||Date.now;
    var sink=d.sink,transport=d.transport;
    C.assert(sink&&sink.namespace===T.NAMESPACE&&typeof sink.transactions==='function'&&typeof transport==='function',
      'MVP_INPUT','staging sink and synchronous transport required');
    var requestCount=0,report={schema:'HA53_MVP_RUN_V1',source:source,captureId:cfg.captureId,page:cfg.page,list:null,
      details:[],canonical:[],errors:[],requests:0,complete:false,deliveryCapability:'NONE'};
    function fetch(request){
      if(requestCount>=cfg.maxRequests||clock()-start>=cfg.timeBudgetMs) C.fail('MVP_BUDGET','continue with the same captureId');
      R.authorize(request);
      request.byteLimit=request.byteLimit===undefined?cfg.maxHtmlBytes:request.byteLimit;
      requestCount++;
      var r=transport(request);
      C.assert(r&&r.url===request.url&&Number.isInteger(r.status)&&Number.isSafeInteger(r.bytes)&&r.bytes>=0,
        'MVP_RESPONSE','invalid response identity or length');
      if(r.status===200)C.assert(/^[a-f0-9]{64}$/.test(r.sha256||r.fixtureSha256||''),'MVP_RESPONSE','byte digest missing');
      return r;
    }
    function doWork(){
      var listId=captureId('list',source,cfg.captureId,R.main(source)?null:[cfg.page,cfg.nanumNoticeId||null]);
      var listTx,rows,listReceipt=false,session=null;
      if(R.main(source)){
        var state=A.loadOrInitial(sink,source,listId);
        if(state.nextPage===cfg.page&&['READY','RETRY_WAIT'].indexOf(state.status)>=0){
          if(clock()<state.nextAttemptAt){report.status='RETRY_WAIT';return;}
          var request=Object.assign(A.request(state),{source:source,kind:'list'});
          var response=fetch(request);
          if(response.status===200)C.assert(typeof response.text==='string'&&response.bytes<=cfg.maxHtmlBytes,'MVP_SIZE','list response too large');
          var outcome=A.step(state,response,clock(),sink);
          if(!outcome.committed){report.status=outcome.state.status;report.errors.push({stage:'LIST',error:outcome.error});return;}
          listReceipt=true;
        }else if(state.nextPage<=cfg.page){
          C.fail('MVP_PAGE','list page must follow the stored cursor: '+state.status+' '+state.nextPage);
        }
        listTx=sink.readPage?sink.readPage(source,listId,cfg.page):readTransactions(sink,source,listId).find(function(tx){
          return tx.page&&tx.page.pageIndex===cfg.page;
        });
        C.assert(listTx,'MVP_STAGING','list page unavailable');
        rows=listTx.page.records;
      }else{
        var existing=sink.loadCursor(source,listId);
        if(!existing){
          var discovered=fetch(R.discovery(source,cfg.page,cfg.nanumNoticeId));
          C.assert(discovered.status===200&&typeof discovered.text==='string'&&discovered.bytes<=cfg.maxHtmlBytes,'MVP_HTTP','discovery HTTP '+discovered.status+' or size limit');
          rows=R.rows(source,discovered,cfg.page);
          session=discovered.session||null;
          T.stageObservations(sink,source,listId,rows,{rawResponse:evidence(discovered,true)});
          listReceipt=true;
        }
        listTx=readTransactions(sink,source,listId)[0];
        C.assert(listTx&&listTx.page,'MVP_STAGING','discovery unavailable');
        rows=listTx.page.records;
      }
      var listRaw=listTx.rawResponse;
      report.list={snapshotId:listId,commitRef:listTx.commitRef,stored:listReceipt,recordCount:rows.length,
        officialTotal:R.main(source)?listTx.page.total:null,officialTotalPages:R.main(source)?listTx.page.totalPages:null};
      var selected=cfg.noticeKeys?cfg.noticeKeys.map(function(k){
        var hit=rows.find(function(x){return x.sourceNoticeKey===k;});
        C.assert(hit,'MVP_INPUT','requested notice is absent from saved list page: '+k);
        return hit;
      }):rows;
      selected=selected.slice(0,cfg.maxNotices);
      report.selectedCount=selected.length;report.unselectedCount=rows.length-selected.length;
      selected.forEach(function(row){
        var detailId=captureId('detail',source,cfg.captureId,[listId,row.sourceNoticeKey]);
        if(sink.loadCursor(source,detailId)){
          var saved=readTransactions(sink,source,detailId)[0];
          report.details.push({sourceNoticeKey:row.sourceNoticeKey,snapshotId:detailId,commitRef:saved.commitRef,stored:false});
          report.canonical.push(handoff(saved.observations[0],saved.rawResponse));
          return;
        }
        var response,parsed;
        try{
          if(source==='NANUM'||source==='ONEROOF'){
            response=listRaw;parsed=T.copy(row);
            // A resumed Nanum run obtains a fresh anonymous session from the same detail URL.
            if(source==='NANUM'&&!listReceipt&&parsed.attachments.length&&cfg.maxAttachments){
              var fresh=fetch(R.discovery(source,cfg.page,cfg.nanumNoticeId));
              C.assert(fresh.status===200&&typeof fresh.text==='string','MVP_HTTP','Nanum detail refresh failed');
              parsed=R.rows(source,fresh,cfg.page)[0];
              response=fresh;session=fresh.session||null;
            }
          } else {
            response=fetch(R.detailRequest(source,row));
            C.assert(response.status===200&&typeof response.text==='string'&&response.bytes<=cfg.maxHtmlBytes,
              'MVP_HTTP','detail HTTP '+response.status+' or size limit');
            parsed=R.detail(source,response,row);
          }
          C.assert(parsed.sourceNoticeKey===row.sourceNoticeKey,'MVP_IDENTITY','list/detail ID differs');
        }catch(err){
          if(/HA53_MVP_BUDGET/.test(String(err.message)))throw err;
          report.errors.push({stage:'DETAIL',sourceNoticeKey:row.sourceNoticeKey,error:String(err.message).slice(0,220)});
          return;
        }
        var raw=evidence(response,true),remaining=cfg.maxDocumentBytesPerNotice;
        raw.listReference={snapshotId:listId,commitRef:listTx.commitRef,sha256:listRaw.sha256||null,fixtureSha256:listRaw.fixtureSha256||null};
        raw.documents=[];
        var seen={};
        parsed.attachments.forEach(function(attachment,index){
          if(index>=cfg.maxAttachments){attachment.captureStatus='ATTACHMENT_COUNT_LIMIT';return;}
          if(remaining<=0){attachment.captureStatus='ATTACHMENT_BYTE_BUDGET';return;}
          var fileRequest=R.get(source,'file',attachment.url);
          fileRequest.byteLimit=Math.min(cfg.maxDocumentBytes,remaining);
          if(source==='NANUM'||source==='ONEROOF')fileRequest.referer=parsed.url;
          if(source==='NANUM')fileRequest.session=session;
          try{
            if(seen[attachment.url]){
              Object.assign(attachment,seen[attachment.url]);return;
            }
            var file=fetch(fileRequest),kind=attachmentKind(file.magic||'',attachment.label||'');
            var info={httpStatus:file.status,sha256:file.sha256||null,bytes:file.bytes,documentKind:kind};
            if(file.status!==200)info.captureStatus='ATTACHMENT_HTTP_'+file.status;
            else if(file.bytes>fileRequest.byteLimit)info.captureStatus='ATTACHMENT_SIZE_LIMIT';
            else if(!kind||!file.base64)info.captureStatus='ATTACHMENT_UNVERIFIED_BYTES';
            else{
              info.captureStatus='DOCUMENT_STAGED';
              raw.documents.push(Object.assign(evidence(file,false),{encoding:'base64',data:file.base64,kind:kind}));
              remaining-=file.bytes;
            }
            seen[attachment.url]=info;
            Object.assign(attachment,info);
          }catch(err){
            if(/HA53_MVP_BUDGET/.test(String(err.message)))throw err;
            attachment.captureStatus=/HA53_MVP_URL/.test(String(err.message))?'ATTACHMENT_ENDPOINT_UNVERIFIED':'ATTACHMENT_REQUEST_FAILED';
          }
        });
        // Optional offline PDF text can be attached only to the fetched PDF's exact byte hash.
        parsed.attachments.forEach(function(att){
          var pages=d.pdfTextBySha256&&d.pdfTextBySha256[att.sha256];
          if(att.captureStatus!=='DOCUMENT_STAGED'||att.documentKind!=='PDF'||!pages)return;
          C.assert(pages.sha256===att.sha256&&pages.url===att.url,'MVP_PDF','PDF text evidence hash/URL mismatch');
          var pdf=P.parse(pages,source);
          if(source==='HUG_NOTICE'&&parsed.classification!=='RECRUITMENT'){
            // The original recruitment PDF can be linked from a result notice.
            // Retain its evidence without treating its windows as this notice's windows.
            parsed.pdfEvidence=(parsed.pdfEvidence||[]).concat([pdf]);
          }else{
            parsed=P.attach(parsed,pdf);
          }
          parsed.attachments.find(function(a){return a.url===att.url;}).pdfTextParsed=true;
        });
        raw.canonicalOptions=optionsForHandoff(parsed,listRaw,raw);
        var receipt=T.stageDetails(sink,source,detailId,[parsed],{rawResponse:raw});
        C.assert(receipt&&receipt.committed,'MVP_STAGING','detail receipt not committed');
        report.details.push({sourceNoticeKey:row.sourceNoticeKey,snapshotId:detailId,commitRef:receipt.commitRef,stored:!receipt.replayed});
        report.canonical.push(handoff(T.envelope(parsed,receipt.cursor),raw));
      });
      report.complete=report.errors.length===0&&report.details.length===selected.length&&report.unselectedCount===0&&
        report.canonical.every(function(x){return !x.holdReasons.includes('ATTACHMENT_CAPTURE_INCOMPLETE');});
      report.status=!rows.length?'NO_MATCHES_ON_PAGE':report.complete?'OBSERVED_PAGE':'PARTIAL_PAGE';
    }
    try{doWork();}catch(err){
      if(!/HA53_MVP_BUDGET/.test(String(err.message)))throw err;
      report.status='CONTINUE_BUDGET';
    }
    report.requests=requestCount;
    report.newListObservations=report.list&&report.list.stored?report.list.recordCount:0;
    report.newDetailObservations=report.details.filter(function(r){return r.stored;}).length;
    return report;
  }
  function gasSink(config){
    checkInput(config);
    C.assert(config.storage&&config.storage.mode==='LIVE_TEST'&&config.storage.writeEnabled===true,
      'MVP_OFF','storage is OFF; use an approved dedicated test project and folder');
    return G.createSink(config.storage);
  }
  function runGAS(config){
    var sink=gasSink(config);
    return run(config,{sink:sink,transport:F.create()});
  }
  function readCanonical(source,ids,sink){
    C.assert(R.known(source)&&Array.isArray(ids)&&ids.length<=10&&ids.every(function(id){
      return typeof id==='string'&&/^mvp_detail_[a-f0-9]{40}$/.test(id);
    }),'MVP_INPUT','saved detail snapshot IDs required');
    return ids.map(function(id){
      var saved=readTransactions(sink,source,id)[0];
      C.assert(saved&&saved.page&&saved.page.coverage==='DETAIL_OBSERVATION_ONLY','MVP_STAGING','detail snapshot not found');
      return handoff(saved.observations[0],saved.rawResponse);
    });
  }
  function canonicalGAS(config,detailSnapshotIds){
    return readCanonical(config.source,detailSnapshotIds,gasSink(config));
  }
  return {run:run,runGAS:runGAS,readCanonical:readCanonical,canonicalGAS:canonicalGAS};
})(
  typeof module!=='undefined'&&module.exports?require('./housing_core'):HA53Core,
  typeof module!=='undefined'&&module.exports?require('./collector53'):HA53Collector,
  typeof module!=='undefined'&&module.exports?require('./staging53'):HA53Stage,
  typeof module!=='undefined'&&module.exports?require('./staging_gas53'):HA53Gas,
  typeof module!=='undefined'&&module.exports?require('./mvp_routes53'):HA53MvpRoutes,
  typeof module!=='undefined'&&module.exports?require('./mvp_gas_transport53'):HA53MvpTransport,
  typeof module!=='undefined'&&module.exports?require('./handoff53'):HA53Handoff,
  typeof module!=='undefined'&&module.exports?require('./hash53'):HA53Hash,
  typeof module!=='undefined'&&module.exports?require('./pdf53_adapter'):HA53Pdf
);
if(typeof module!=='undefined'&&module.exports) module.exports=HA53Mvp;

'use strict';
// Edit this configuration only in the approved standalone test project.
function housing53MvpConfig() {
  return {
    source:'SOCO',
    captureId:'pilot_soco_01',
    page:1,
    maxNotices:1,
    maxAttachments:3,
    maxRequests:10,
    timeBudgetMs:90000,
    storage:{
      mode:'OFF',
      writeEnabled:false,
      testFolderId:'',
      allowedTestFolderIds:[],
      markerFileId:'',
      expectedScriptId:'',
      confirmation:''
    }
  };
}

// Apps Script editor: select housing53MvpRun and run manually after approval.
function housing53MvpRun() {
  var report=HA53Mvp.runGAS(housing53MvpConfig());
  // The canonical array is returned to the caller. Log metadata only.
  console.log(JSON.stringify({schema:report.schema,source:report.source,captureId:report.captureId,page:report.page,
    status:report.status,requests:report.requests,newListObservations:report.newListObservations,
    newDetailObservations:report.newDetailObservations,details:report.details,errors:report.errors}));
  return report;
}

// Programmatic, read-only export. Pass the detail snapshot IDs returned by the run.
function housing53MvpCanonical(config,detailSnapshotIds) {
  return HA53Mvp.canonicalGAS(config,detailSnapshotIds);
}

// Manual one-page verification for an approved test project. Fresh captureId
// exercises the first write. Repeating the same ID exercises recovery.
function housing53MvpVerify() {
  var cfg=housing53MvpConfig();
  var first=HA53Mvp.runGAS(cfg);
  if(!first.list||!first.details.length||first.errors.length){
    var failed={result:'INCOMPLETE',status:first.status,requests:first.requests,errors:first.errors};
    console.log(JSON.stringify(failed));
    return failed;
  }
  var ids=first.details.map(function(x){return x.snapshotId;});
  var recovered=housing53MvpCanonical(cfg,ids);
  var replay=HA53Mvp.runGAS(cfg);
  var stable=HA53Hash.digest(first.canonical)===HA53Hash.digest(recovered)&&
    HA53Hash.digest(recovered)===HA53Hash.digest(replay.canonical);
  var savedAttachments=recovered.reduce(function(n,row){
    return n+row.evidence.attachments.filter(function(a){return a.captureStatus==='DOCUMENT_STAGED';}).length;
  },0);
  var zero=stable&&replay.requests===0&&replay.newListObservations===0&&replay.newDetailObservations===0;
  var result={result:zero&&savedAttachments?'PASS':'INCOMPLETE',source:cfg.source,
    firstRequests:first.requests,listRows:first.list.recordCount,detailRows:ids.length,savedAttachments:savedAttachments,
    replayRequests:replay.requests,replayNewObservations:replay.newListObservations+replay.newDetailObservations,
    canonicalStable:stable,detailSnapshotIds:ids,canonical:recovered};
  var log=Object.assign({},result);
  delete log.canonical;
  console.log(JSON.stringify(log));
  return result;
}
