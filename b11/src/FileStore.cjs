'use strict';
const fs=require('fs'),path=require('path'),B=require('./DeliveryCore.js');
function syncDirectory(dir){
  const fd=fs.openSync(dir,'r');
  try{
    fs.fsyncSync(fd);
  }
  finally{
    fs.closeSync(fd);
  }
}
class FileStore {
 constructor(file,{
    maxBytes=8388608,fault=null
  }
  ={
  }
  ){
    this.file=path.resolve(file);
    this.maxBytes=maxBytes;
    this.fault=fault;
    fs.mkdirSync(path.dirname(this.file),{
      recursive:true
    }
    );
  }
 read(){
    if(!fs.existsSync(this.file))return B.empty();
    const text=fs.readFileSync(this.file,'utf8');
    if(Buffer.byteLength(text)>this.maxBytes)throw Error('LEDGER_CAPACITY');
    const envelope=JSON.parse(text);
    const hash=require('crypto').createHash('sha256').update(envelope.payload).digest('hex');
    if(hash!==envelope.sha256)throw Error('LEDGER_CHECKSUM');
    const state=JSON.parse(envelope.payload);
    if(state.schema!==1||!Number.isInteger(state.revision))throw Error('LEDGER_SCHEMA');
    return state;
  }
 transaction(fn){
    const lock=this.file+'.lock';
    let fd;
    try{
      fd=fs.openSync(lock,'wx',0o600);
    }
    catch(e){
      if(e.code==='EEXIST')throw Error('STORE_BUSY_OR_STALE_LOCK');
      throw e;
    }
    let temp;
    try{
      fs.writeFileSync(fd,JSON.stringify({
        pid:process.pid,at:new Date().toISOString()
      }
      ));
      fs.fsyncSync(fd);
      const state=this.read(),before=JSON.stringify(state),result=fn(state);
      if(JSON.stringify(state)===before)return result===undefined?null:JSON.parse(JSON.stringify(result));
      state.revision++;
      const payload=JSON.stringify(state),bytes=JSON.stringify({
        sha256:require('crypto').createHash('sha256').update(payload).digest('hex'),payload
      }
      );
      if(Buffer.byteLength(bytes)>this.maxBytes)throw Error('LEDGER_CAPACITY');
      temp=this.file+'.tmp-'+process.pid+'-'+Math.random().toString(16).slice(2);
      const out=fs.openSync(temp,'wx',0o600);
      try{
        fs.writeFileSync(out,bytes);
        fs.fsyncSync(out);
      }
      finally{
        fs.closeSync(out);
      }
      if(this.fault)this.fault('BEFORE_RENAME',state);
      fs.renameSync(temp,this.file);
      temp=null;
      syncDirectory(path.dirname(this.file));
      if(this.fault)this.fault('AFTER_RENAME',state);
      return result===undefined?null:JSON.parse(JSON.stringify(result));
    }
    finally{
      if(temp&&fs.existsSync(temp))fs.unlinkSync(temp);
      fs.closeSync(fd);
      fs.unlinkSync(lock);
    }
  }
}
module.exports={
  FileStore
}
;
