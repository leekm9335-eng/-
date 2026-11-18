'use strict';
const path=require('path'),fs=require('fs'),crypto=require('crypto'),B=require('../../b11/src/DeliveryCore.js'),{
  FileStore
}
=require('../../b11/src/FileStore.cjs'),Bridge=require('./IntegrationBridge.js'),A6=require('./A6Port.cjs');
const Stage=require('../../vendor/work-v03/src/staging53.js'),Soco=require('../../vendor/work-v03/src/soco53_adapter.js'),Hug=require('../../vendor/work-v03/src/hug53_adapter.js'),Core=require('../../vendor/work-v03/src/housing_core.js');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function create({
  dir,baseline,clock,adapter,fault,workVersion='0.3',inputPolicy=null
}
={
}
){
 if(!dir||typeof clock!=='function')throw Error('EXPLICIT_LOCAL_OUTPUT_AND_CLOCK_REQUIRED');
  fs.mkdirSync(dir,{
    recursive:true
  }
  );
 if(!['0.3','0.4'].includes(workVersion))throw Error('UNSUPPORTED_WORK_VERSION');
 const modules=workVersion==='0.4'?{Stage:require('../../vendor/work-v04/src/staging53.js'),Soco:require('../../vendor/work-v04/src/soco53_adapter.js'),Hug:require('../../vendor/work-v04/src/hug53_adapter.js'),Core:require('../../vendor/work-v04/src/housing_core.js')}:{Stage,Soco,Hug,Core};
 const centralStore=new FileStore(path.join(dir,'central.json')),deliveryStore=new FileStore(path.join(dir,'delivery.json'));
 const gateKey='BRIDGE_INGEST_CONTROL',gate={
  enter(key,recover){
      return deliveryStore.transaction(s=>{
        const old=s.requests[gateKey];
        if(old&&old.state!=='READY'&&!(recover&&old.state==='FAILED'&&old.inputHash===key))throw Error('BRIDGE_INGEST_BUSY_OR_RECOVERY_REQUIRED');
        s.requests[gateKey]={
          id:gateKey,kind:'BRIDGE_CONTROL',state:'ACTIVE',inputHash:key,at:new Date(clock()).toISOString()
        }
        ;
      }
      );
    }
    ,
  finish(key){
      deliveryStore.transaction(s=>{
        const g=s.requests[gateKey];
        if(!g||g.inputHash!==key||g.state!=='ACTIVE')throw Error('BRIDGE_GATE_OWNERSHIP');
        g.state='READY';
      }
      );
    }
    ,
  fail(key,reason){
      deliveryStore.transaction(s=>{
        const g=s.requests[gateKey];
        if(g&&g.inputHash===key&&g.state==='ACTIVE'){
          g.state='FAILED';
          g.reason=reason.slice(0,240);
        }
      }
      );
    }
    ,
  recover(key){
      deliveryStore.transaction(s=>{
        const g=s.requests[gateKey];
        if(!g||g.inputHash!==key||!['ACTIVE','FAILED'].includes(g.state))throw Error('BRIDGE_RECOVERY_INPUT_MISMATCH');
        g.state='FAILED';
      }
      );
    }
    ,
  ready(){
      const g=deliveryStore.read().requests[gateKey];
      return !g||g.state==='READY';
    }
 
  }
  ;
 const models={
    get:id=>{
      if(!gate.ready())return null;
      const state=centralStore.read(),b=state.bridge,r=b&&b.canonical[id];
      if(r&&state.v04PendingHandoffs&&r.sourceNoticeIds.some(key=>state.v04PendingHandoffs[key]))return null;
      return r?JSON.parse(JSON.stringify(r)):null;
    }
  }
  ;
 const transport=adapter||B.createMockAdapter();
 const sender=B.engine({
    mode:'MOCK_ONLY',store:deliveryStore,models,hash,recipient:{
      kind:'PERSONAL',count:1,scope:'SELF'
    }
    ,clock,adapter:transport,fault
  }
  );
 sender.freezeBaseline(baseline);
 const bridge=Bridge.create({
    mode:'MOCK_ONLY',store:centralStore,sender,gate,inputPolicy,stage:modules.Stage,a6:A6.load(),clock,hash,stable:B.stable,windowReason:B.windowReason,parser:{
      normalizeContent:html=>modules.Core.text(modules.Core.html(html)).replace(/\s+/g,' ').trim(),soco:modules.Soco.soco53ParseDetail,hug:modules.Hug.parseDetail,reconcile:modules.Core.reconcile
    }
  }
  );
 return {
    bridge,sender,adapter:transport,centralStore,deliveryStore,models
  }
  ;
}
module.exports={
  create,hash,Stage
}
;
