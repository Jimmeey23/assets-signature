import assert from 'node:assert/strict';
import fs from 'node:fs';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
process.env.VERCEL = '1';
process.env.KV_REST_API_URL = 'https://redis.test';
process.env.KV_REST_API_TOKEN = 'test-token';
process.env.MAILTRAP_API_TOKEN = 'test-mail-token';
process.env.MAILTRAP_FROM = 'test@example.com';
process.env.ADMIN_CODE = 'test-access';
process.env.APP_URL = 'https://app.test';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
const values = new Map(); const hashes = new Map(); const mails = []; let mailFail = false;
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://redis.test');
  const [command, key, ...args] = JSON.parse(options.body); let result;
  if (command === 'HGET') result = hashes.get(key)?.get(args[0]) ?? null;
  else if (command === 'HSET') { if (!hashes.has(key)) hashes.set(key,new Map()); hashes.get(key).set(args[0],args[1]); result=1; }
  else if (command === 'HVALS') result = [...(hashes.get(key)?.values() || [])];
  else if (command === 'GET') result = values.get(key) ?? null;
  else if (command === 'SET') { if (args.includes('NX') && values.has(key)) result=null; else { values.set(key,args[0]); result='OK'; } }
  else if (command === 'DEL') result = values.delete(key) ? 1 : 0;
  else if (command === 'INCR') { result=Number(values.get(key) || 0)+1; values.set(key,result); }
  else if (command === 'EXPIRE') result=1;
  else if (command === 'EVAL') { const lock=args[1], token=args[2]; result=values.get(lock) === token ? (values.delete(lock),1) : 0; }
  else throw new Error(`Unexpected command ${command}`);
  return { ok:true, json:async()=>({result}) };
};
https.request = (_, callback) => {
  const req=new EventEmitter(); req.setTimeout=()=>{};
  req.write = body => mails.push(JSON.parse(body));
  req.end=()=>{ const res=new EventEmitter();res.statusCode=mailFail?401:200;callback(res);queueMicrotask(()=>{res.emit('data',Buffer.from(JSON.stringify(mailFail?{success:false,message:'Test rejection'}:{success:true,message_ids:['test-message']})));res.emit('end');}); };
  return req;
};
const { handleAdmin: admin, handleFormConfig: formConfig, handleInvitation: invitation, handleWorkflowSubmit: submit } = await import('../server/workflow.mjs');
const image=`data:image/png;base64,${fs.readFileSync(new URL('../src/assets/physique57-logo.png',import.meta.url)).toString('base64')}`;
const sig = name => ({sig:{method:'type',image,text:name},name,date:'2026-10-08',signedAt:null});
const empty = () => ({sig:null,name:'',date:'',signedAt:null});
const document = {
  fields:{refNo:'TEST',employeeName:'',employeeId:'',designation:'',department:'',issueDate:'2026-10-08T15:00',declName:''},
  introRest:', acknowledge receipt.',objective:'Test objective',scope:'Test scope',declaration1:'Test undertaking',declaration2:'Test terms',
  assets:[{id:1,name:'Test laptop',serial:'TEST-001',condition:'New',remarks:''}],terms:[{id:1,text:'Test clause'}],
  sigs:{employee:empty(),handover:sig('Test Handover'),admin:sig('Test Verification')},
};
let cookie='';
async function call(handler,url,method='GET',body,authenticated=true,origin='https://app.test') {
  let result;
  const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(value){result={status:this.status,headers:this.headers,body:typeof value==='string'?JSON.parse(value):value};}};
  await handler({url,method,body,headers:{host:'app.test',origin,...(authenticated?{cookie}:{}),'x-forwarded-for':'127.0.0.1'}},res);
  return result;
}
test('Protected admin, pre-signing, bulk invite, recipient submission and live shared records', async () => {
  assert.equal((await call(admin,'/api/admin?action=list','GET',undefined,false)).status,401);
  assert.equal((await call(admin,'/api/admin?action=login','POST',{code:'wrong'},false)).status,401);
  const login=await call(admin,'/api/admin?action=login','POST',{code:'test-access'},false);
  assert.equal(login.status,200);assert.match(login.headers['Set-Cookie'],/HttpOnly/);assert.match(login.headers['Set-Cookie'],/Secure/);
  cookie=login.headers['Set-Cookie'].split(';')[0];
  assert.equal((await call(admin,'/api/admin?action=save','POST',{document},true,'https://evil.test')).status,403);
  const draft=await call(admin,'/api/admin?action=save','POST',{document});
  assert.equal(draft.status,200);assert.equal(draft.body.item.status,'Draft');
  const template=draft.body.item;
  assert.equal((await call(admin,'/api/admin?action=save','POST',{id:template.id,revision:0,document})).status,409);
  const bulk=await call(admin,'/api/admin?action=invite','POST',{id:template.id,revision:template.revision,batchId:'TEST-BATCH',recipients:[{employeeId:'0006',email:'recipient@example.com'}]});
  assert.equal(bulk.status,200);assert.equal(bulk.body.results[0].failed,0);
  const assigned=bulk.body.results[0].item;
  assert.equal(assigned.status,'Awaiting employee signature');assert.equal(assigned.document.fields.employeeName,'Jimmeey Gondaa');
  assert.equal(assigned.document.fields.designation,'Head - Sales & Client Services');
  assert.equal(assigned.document.sigs.employee.sig,null);
  assert.equal(assigned.document.sigs.handover.sig.image,image);
  assert.equal(mails.length,1);assert.equal(mails[0].to[0].email,'recipient@example.com');assert.equal(mails[0].attachments[0].type,'application/pdf');
  const token=mails[0].text.match(/#\/sign\/([^\s]+)/)[1];
  assert.equal((await call(invitation,`/api/invitation?token=${assigned.id}.forged`)).status,404);
  const opened=await call(invitation,`/api/invitation?token=${token}`);
  assert.equal(opened.body.item.status,'Opened · awaiting signature');
  const incoming=structuredClone(opened.body.item.document);incoming.sigs.employee=sig('Test Employee');
  const tampered=structuredClone(incoming);tampered.assets[0].serial='MODIFIED';
  assert.equal((await call(submit,'/api/submit','POST',{document:tampered,invitationToken:token},false)).status,409);
  // Recipient attempts to overwrite admin signatures: authoritative stored signatures are retained.
  incoming.sigs.admin=sig('Forged Admin');
  const complete=await call(submit,'/api/submit','POST',{document:incoming,invitationToken:token},false);
  assert.equal(complete.status,200);assert.equal(complete.body.notificationStatus,'Accepted');
  const list=await call(admin,'/api/admin?action=list');
  const row=list.body.documents.find(d=>d.id===assigned.id);
  assert.equal(row.status,'Complete');assert.ok(row.signatures.employee);assert.equal(row.emails.length,3);
  const saved=await call(admin,`/api/admin?action=document&id=${assigned.id}`);
  assert.equal(saved.body.item.document.sigs.admin.name,'Test Verification');
  assert.equal(saved.body.item.document.sigs.employee.name,'Jimmeey Gondaa');
  assert.equal([...hashes.get('p57:asset-declaration:submissions').values()].length,1);
  const mailCount=mails.length;
  assert.equal((await call(submit,'/api/submit','POST',{document:incoming,invitationToken:token},false)).body.alreadySubmitted,true);
  assert.equal(mails.length,mailCount);
  // Submitted PDFs can be viewed inline or downloaded from the admin center.
  const inline=await call(admin,`/api/admin?action=pdf&id=${assigned.id}&inline=1`);
  assert.equal(inline.status,200);assert.match(inline.headers['Content-Disposition'],/^inline;/);assert.equal(inline.body.subarray(0,4).toString(),'%PDF');
  assert.match((await call(admin,`/api/admin?action=pdf&id=${assigned.id}`)).headers['Content-Disposition'],/^attachment;/);
  // Signature presets are saved, validated and returned for prefilling new declarations.
  assert.deepEqual((await call(admin,'/api/admin?action=presets')).body.presets,{handover:null,admin:null});
  assert.equal((await call(admin,'/api/admin?action=presets','POST',{presets:{handover:{name:'',sig:sig('X').sig}}})).status,422);
  assert.equal((await call(admin,'/api/admin?action=presets','POST',{presets:{handover:{name:'Bad',sig:{method:'draw',image:'data:text/html,x'}}}})).status,422);
  const preset=await call(admin,'/api/admin?action=presets','POST',{presets:{handover:{name:'Test Handover',sig:sig('Test Handover').sig},admin:{name:'Test Ops',sig:null}}});
  assert.equal(preset.status,200);assert.equal(preset.body.presets.handover.sig.image,image);assert.equal(preset.body.presets.admin.name,'Test Ops');
  assert.equal((await call(admin,'/api/admin?action=presets')).body.presets.handover.name,'Test Handover');
  assert.equal((await call(admin,'/api/admin?action=presets','GET',undefined,false)).status,401);
  // Admin form settings drive dropdowns, required columns and preset values for everyone.
  const defaults=await call(formConfig,'/api/form-config','GET',undefined,false);
  assert.equal(defaults.status,200);assert.deepEqual(defaults.body.config.columns.condition.options,['New','Good','Fair','Needs repair']);
  assert.equal((await call(admin,'/api/admin?action=form-config','POST',{config:{}},false)).status,401);
  const configured=await call(admin,'/api/admin?action=form-config','POST',{config:{defaultAssets:['Laptop',' Laptop ',''],columns:{name:{required:false},serial:{required:true,options:[],preset:''},condition:{required:true,options:['Sealed','Used'],preset:'Sealed'},remarks:{required:false,options:[],preset:'Issued at studio'}}}});
  assert.equal(configured.status,200);assert.deepEqual(configured.body.config.defaultAssets,['Laptop']);assert.equal(configured.body.config.columns.name.required,true);
  assert.equal((await call(formConfig,'/api/form-config','GET',undefined,false)).body.config.columns.remarks.preset,'Issued at studio');
  const noSerial=structuredClone(document);noSerial.assets[0].serial='';noSerial.assets[0].condition='Sealed';
  const noSerialDraft=(await call(admin,'/api/admin?action=save','POST',{document:noSerial})).body.item;
  const blockedInvite=await call(admin,'/api/admin?action=invite','POST',{id:noSerialDraft.id,revision:noSerialDraft.revision,batchId:'TEST-REQUIRED',recipients:[{employeeId:'0006',email:'recipient@example.com'}]});
  assert.equal(blockedInvite.status,422);assert.match(blockedInvite.body.error,/Asset \/ Serial No\./);
  const publicMissing=structuredClone(noSerial);publicMissing.sigs={employee:sig('Test'),handover:empty(),admin:empty()};publicMissing.fields={...publicMissing.fields,refNo:'REQ-TEST',employeeName:'Test',employeeId:'TEST',declName:'Test',designation:'Test',department:'Test'};
  assert.equal((await call(submit,'/api/submit','POST',{document:publicMissing},false)).status,422);
  await call(admin,'/api/admin?action=form-config','POST',{config:{columns:{name:{required:true,options:[],preset:''},serial:{required:false,options:[],preset:''},condition:{required:false,options:[],preset:''},remarks:{required:false,options:[],preset:''}}}});
  const publicForgery=structuredClone(document);publicForgery.fields={...publicForgery.fields,refNo:'PUBLIC-TEST',employeeName:'Test',employeeId:'TEST',declName:'Test',designation:'Test',department:'Test'};publicForgery.sigs.employee=sig('Test');
  assert.equal((await call(submit,'/api/submit','POST',{document:publicForgery},false)).status,403);
  // A notification failure must not erase the signed submission.
  publicForgery.sigs.handover=empty();publicForgery.sigs.admin=empty();mailFail=true;
  const failedMail=await call(submit,'/api/submit','POST',{document:publicForgery},false);
  assert.equal(failedMail.status,200);assert.equal(failedMail.body.notificationStatus,'Failed');
  assert.equal((await call(admin,'/api/admin?action=list')).body.documents.find(d=>d.ref==='PUBLIC-TEST').emails[0].status,'Failed');
  mailFail=false;
  // Countersign a saved employee submission, preserve their signature, then email it.
  const pending=(await call(admin,'/api/admin?action=list')).body.documents.find(d=>d.ref==='PUBLIC-TEST');
  const pendingDoc=(await call(admin,`/api/admin?action=document&id=${pending.id}`)).body.item;
  assert.equal(pendingDoc.status,'Awaiting admin signatures');
  pendingDoc.document.sigs.handover=sig('Test Handover');pendingDoc.document.sigs.admin=sig('Test Verification');
  const countersigned=await call(admin,'/api/admin?action=save','POST',{id:pending.id,revision:pendingDoc.revision,document:pendingDoc.document});
  assert.equal(countersigned.status,200);assert.equal(countersigned.body.item.status,'Complete');
  assert.equal(countersigned.body.item.document.sigs.employee.name,'Test');
  const sent=await call(admin,'/api/admin?action=email','POST',{id:pending.id,revision:countersigned.body.item.revision,recipients:['completed@example.com']});
  assert.equal(sent.body.failed,0);const afterSend=mails.length;
  await call(admin,'/api/admin?action=email','POST',{id:pending.id,revision:countersigned.body.item.revision,recipients:['completed@example.com']});
  assert.equal(mails.length,afterSend);
  // Retrying the same bulk batch never sends a second successful invitation.
  const repeated=await call(admin,'/api/admin?action=invite','POST',{id:template.id,revision:template.revision,batchId:'TEST-BATCH',recipients:[{employeeId:'0006',email:'recipient@example.com'}]});
  assert.equal(repeated.body.results[0].item.id,assigned.id);assert.equal(mails.length,afterSend);
  const second=await call(admin,'/api/admin?action=invite','POST',{id:template.id,revision:template.revision,batchId:'TEST-RESEND',recipients:[{employeeId:'0006',email:'recipient@example.com'}]});
  const secondItem=second.body.results[0].item;
  const oldToken=mails.slice(-1)[0].text.match(/#\/sign\/([^\s]+)/)[1];
  const resent=await call(admin,'/api/admin?action=reinvite','POST',{id:secondItem.id,revision:secondItem.revision});
  assert.equal(resent.status,200);assert.equal(resent.body.failed,0);
  const newToken=mails.slice(-1)[0].text.match(/#\/sign\/([^\s]+)/)[1];
  assert.notEqual(oldToken,newToken);
  assert.equal((await call(invitation,`/api/invitation?token=${oldToken}`)).status,404);
  assert.equal((await call(invitation,`/api/invitation?token=${newToken}`)).status,200);
  // Historical records remain visible without inventing their full document.
  hashes.get('p57:asset-declaration:submissions').set('LEGACY',JSON.stringify({ref:'LEGACY',employeeName:'Earlier employee',employeeId:'OLD',submittedAt:'2026-01-01T00:00:00.000Z',assets:[],signatures:[{key:'employee',signed:true},{key:'handover',signed:false},{key:'admin',signed:false}]}));
  assert.equal((await call(admin,'/api/admin?action=list')).body.documents.find(d=>d.ref==='LEGACY').legacy,true);
  await call(admin,'/api/admin?action=logout','POST',{});
  assert.equal((await call(admin,'/api/admin?action=list')).status,401);
  for(let i=0;i<5;i++) await call(admin,'/api/admin?action=login','POST',{code:'wrong'},false);
  assert.equal((await call(admin,'/api/admin?action=login','POST',{code:'wrong'},false)).status,429);
});
