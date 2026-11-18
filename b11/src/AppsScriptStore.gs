/* Approved CLONE store only. No execution, tab creation, trigger or secret access on load. */
var HousingB11GasStore = (function(){
  'use strict';
  const header=['transaction','part','count','sha256','payload','time'];
  function hash(text){
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8).map(n=>('0'+((n+256)%256).toString(16)).slice(-2)).join('');
  }
  function validTarget(c){
    if(!c||c.approved!==true||c.mode!=='MOCK_ONLY'||!c.projectId||!c.sheetId||!c.blockedOperatingSheetId||c.sheetId===c.blockedOperatingSheetId)throw Error('CLONE_APPROVAL_REQUIRED');
    if(ScriptApp.getScriptId()!==c.projectId)throw Error('CLONE_PROJECT_MISMATCH');
  }
  function create(c){
    validTarget(c);
    const ss=SpreadsheetApp.openById(c.sheetId),sheet=ss.getSheetByName('_B11_JOURNAL');
    if(!sheet)throw Error('CLONE_JOURNAL_SCHEMA_REQUIRED');
    const check=()=>{
      if(JSON.stringify(sheet.getRange(1,1,1,6).getValues()[0])!==JSON.stringify(header))throw Error('LEDGER_HEADER');
    }
    ;
 function read(){
      check();
      const rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,6).getValues():[],groups=new Map(),state=HousingB11.empty();
      for(const row of rows){
        if(!row[0])continue;
        if(row[1]!=='COMMIT'){
          if(!groups.has(row[0]))groups.set(row[0],[]);
          groups.get(row[0]).push(row);
          continue;
        }
        const parts=groups.get(row[0])||[];
        if(parts.length!==row[2])throw Error('LEDGER_COMMITTED_PARTS_MISSING');
        parts.sort((a,b)=>a[1]-b[1]);
        if(parts.some((p,i)=>p[1]!==i||p[2]!==row[2]||p[3]!==row[3]||!String(p[4]).startsWith('J:')))throw Error('LEDGER_CHUNK_IDENTITY');
        const payload=parts.map(p=>p[4].slice(2)).join('');
        if('H:'+hash(payload)!==row[3])throw Error('LEDGER_CHECKSUM');
        const tx=JSON.parse(payload);
        if(tx.baseRevision!==state.revision||tx.revision!==state.revision+1)throw Error('LEDGER_REVISION');
        for(const change of tx.changes){
          if(change.section==='baseline')state.baseline=change.value;
          else{
            if(!['events','deliveries','requests','reviews'].includes(change.section))throw Error('LEDGER_SECTION');
            state[change.section][change.key]=change.value;
          }
        }
        state.revision=tx.revision;
        groups.delete(row[0]);
      }
      return state;
    }
 function transaction(fn){
      validTarget(c);
      const lock=LockService.getScriptLock();
      if(!lock.tryLock(1000))throw Error('STORE_BUSY');
      try{
        const before=read(),next=JSON.parse(JSON.stringify(before)),value=fn(next),changes=[];
        if(JSON.stringify(before.baseline)!==JSON.stringify(next.baseline))changes.push({
          section:'baseline',value:next.baseline
        }
        );
        for(const section of ['events','deliveries','requests','reviews']){
          for(const key of Object.keys(before[section]))if(!(key in next[section]))throw Error('LEDGER_DELETE_FORBIDDEN');
          for(const key of Object.keys(next[section]))if(JSON.stringify(next[section][key])!==JSON.stringify(before[section][key]))changes.push({
            section,key,value:next[section][key]
          }
          );
        }
        if(!changes.length)return value===undefined?null:JSON.parse(JSON.stringify(value));
        const payload=JSON.stringify({
          baseRevision:before.revision,revision:before.revision+1,changes
        }
        );
        if(Utilities.newBlob(payload).getBytes().length>1048576)throw Error('LEDGER_TRANSACTION_CAPACITY');
        const parts=[];
        for(let i=0;
        i<payload.length;
        ){
          let end=Math.min(i+20000,payload.length);
          if(end<payload.length&&/[\uD800-\uDBFF]/.test(payload[end-1]))end--;
          parts.push(payload.slice(i,end));
          i=end;
        }
        const txid=Utilities.getUuid(),digest='H:'+hash(payload),at=sheet.getLastRow()+1,rows=parts.map((p,i)=>[txid,i,parts.length,digest,'J:'+p,Date.now()]);
        if(at+rows.length>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),at+rows.length-sheet.getMaxRows());
        sheet.getRange(at,1,rows.length,6).setValues(rows);
        SpreadsheetApp.flush();
        sheet.getRange(at+rows.length,1,1,6).setValues([[txid,'COMMIT',parts.length,digest,'',Date.now()]]);
        SpreadsheetApp.flush();
        return value===undefined?null:JSON.parse(JSON.stringify(value));
      }
      finally{
        lock.releaseLock();
      }
    }
 return Object.freeze({
      read,transaction
    }
    );
  }
  return Object.freeze({
    create,hash,header
  }
  );
}
)();
