'use strict';
// No dependencies and no source transformations: exact UTF-8 assembly.
const fs=require('fs'),path=require('path'),root=path.join(__dirname,'..');
const files=['DeliveryCore.js','AppsScriptStore.gs','MockEntry.gs'];
const content='/* 5.2-B MOCK-ONLY complete Apps Script bundle. Not a production deployment. */\n'+files.map(f=>'\n/* SOURCE: '+f+' */\n'+fs.readFileSync(path.join(root,'src',f),'utf8')).join('');
fs.mkdirSync(path.join(root,'scripts'),{recursive:true});
for(const name of ['HousingB11_Mock.gs','HousingB11_Mock.gs.txt'])fs.writeFileSync(path.join(root,'scripts',name),content,'utf8');
const testSource='TelegramApprovedTest.gs';
const testContent=content+'\n/* SOURCE: '+testSource+' */\n'+fs.readFileSync(path.join(root,'src',testSource),'utf8');
fs.writeFileSync(path.join(root,'scripts','HousingB11_CloneWithTelegramTest.gs'),testContent,'utf8');
console.log('Built full Apps Script bundle; no Google calls.');

fs.mkdirSync(path.join(root,'scripts/parts'),{recursive:true});
for(const file of files.concat(['FileStore.cjs']))fs.copyFileSync(path.join(root,'src',file),path.join(root,'scripts/parts',file.replace(/\.js$/,'.gs')+'.txt'));
