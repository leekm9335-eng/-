'use strict';
const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),path=require('path');
const expected='c667e62150c0adae2f073208fd5f8285d73a3390df24d6e505baa449ac11138b';
function load(file=path.join(__dirname,'../../baseline/local6/Code.gs')){
 const text=fs.readFileSync(file,'utf8');
  if(crypto.createHash('sha256').update(text).digest('hex')!==expected)throw Error('A6_REFERENCE_CHANGED');
 const blocked=new Proxy({
  }
  , {
    get(){
      throw Error('GOOGLE_ACCESS_FORBIDDEN_IN_LOCAL_BRIDGE')
    }
  }
  ),context=vm.createContext({
    PropertiesService:blocked,SpreadsheetApp:blocked,UrlFetchApp:blocked,ScriptApp:blocked,LockService:blocked
  }
  );
 vm.runInContext(text,context,{
    timeout:5000
  }
  );
 return Object.freeze({
    sha256:expected,action:text=>context.recruitmentAction52A(text),noticeKind:(title,evidence)=>context.noticeKind52A(title,evidence),region:(row,detail)=>JSON.parse(JSON.stringify(context.regionV4(row,detail)))
  }
  );
}
module.exports={
  load
}
;
