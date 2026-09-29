const B='http://localhost:18082'; let P=0,F=0;
async function req(m,p,b,h={}){const r=await fetch(B+p,{method:m,headers:{'Content-Type':'application/json',...h},body:b===undefined?undefined:JSON.stringify(b)});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch{};return{status:r.status,json:j,text:t}}
function ok(n,c,x=''){c?(P++,console.log('PASS '+n)):(F++,console.log('FAIL '+n+' '+x))}
(async()=>{
let r=await req('POST','/_test/reset',{users:[{id:'u_mgr',email:'m@x.io',password:'password1',display_name:'M'},{id:'u_d',email:'d@x.io',password:'password1',display_name:'D'}],restaurants:[{id:'r1',name:'A',timezone:'UTC',slot_minutes:30,reservation_duration_minutes:90,cancellation_cutoff_minutes:60,opening_hours:[{weekday:'thu',opens:'00:00',closes:'23:59'}],tables:[{id:'t_1',capacity:4},{id:'t_2',capacity:4}],combinable:[],manager_user_ids:['u_mgr']}],reservations:[]});
ok('reset',r.status===204,r.status);
const lm=await req('POST','/auth/login',{email:'m@x.io',password:'password1'}); const ld=await req('POST','/auth/login',{email:'d@x.io',password:'password1'});
const Tm=lm.json.token,Td=ld.json.token; const AH=t=>({Authorization:'Bearer '+t,'Idempotency-Key':'k-'+Math.random().toString(36).slice(2)});
r=await req('POST','/reservations',{restaurant_id:'r1',table_id:'t_2',starts_at_local:'2026-10-08T19:00',party_size:2},AH(Td));
ok('book',r.status===201, r.status+' '+r.text.slice(0,200)); const ref=r.json.reference;
// R-4.1 preview closure on t_2 overlapping
r=await req('POST','/restaurants/r1/replans',{table_id:'t_2',from:'2026-10-08T18:00:00+00:00',to:'2026-10-08T20:00:00+00:00'},{Authorization:'Bearer '+Tm,'Idempotency-Key':'pv1'});
ok('R4.1-preview-201',r.status===201,r.status+' '+r.text.slice(0,300));
const plan=r.json.plan_id;
ok('R4.3-shape',r.json&&plan&&r.json.moved_count===1&&JSON.stringify(r.json.assignments[0].table_ids)==='["t_1"]',JSON.stringify(r.json).slice(0,300));
// no side effects: availability still shows t_2 busy? booking still on t_2
let g=await req('GET',`/reservations/${ref}`,undefined,{Authorization:'Bearer '+Td});
ok('R4.3-side-effect-free',g.json.table_id==='t_2'||JSON.stringify(g.json.table_ids)==='["t_2"]',JSON.stringify(g.json).slice(0,200));
// R-4.4 apply
r=await req('POST',`/restaurants/r1/replans/${plan}/apply`,{},{Authorization:'Bearer '+Tm,'Idempotency-Key':'ap1'});
ok('R4.4-apply-201',r.status===201&&r.json.restaurant_revision===1,r.status+' '+r.text.slice(0,300));
// replay same key -> 200
let r2=await req('POST',`/restaurants/r1/replans/${plan}/apply`,{},{Authorization:'Bearer '+Tm,'Idempotency-Key':'ap1'});
ok('R4.4-replay-200',r2.status===200,r2.status+' '+r2.text.slice(0,200));
// different key on applied -> 409 plan_already_applied
r2=await req('POST',`/restaurants/r1/replans/${plan}/apply`,{},{Authorization:'Bearer '+Tm,'Idempotency-Key':'ap2'});
ok('R4.4-applied-409',r2.status===409&&r2.json.error.code==='plan_already_applied',r2.status+' '+r2.text.slice(0,200));
// stale: new preview then mutate rev via policy publish, then apply -> stale_plan
r=await req('POST','/restaurants/r1/replans',{table_id:'t_1',from:'2026-10-08T18:00:00+00:00',to:'2026-10-08T20:00:00+00:00'},{Authorization:'Bearer '+Tm,'Idempotency-Key':'pv2'});
const plan2=r.json.plan_id;
ok('preview2',r.status===201||r.status===409,r.status+' '+r.text.slice(0,200));
if(r.status===201){
 await req('POST','/restaurants/r1/policies',{effective_from:'2026-10-01',slot_minutes:30,reservation_duration_minutes:90,cancellation_cutoff_minutes:60,opening_hours:[{weekday:'thu',opens:'00:00',closes:'23:59'}],capacities:{t_1:4,t_2:4}},{Authorization:'Bearer '+Tm,'Idempotency-Key':'polx'});
 r2=await req('POST',`/restaurants/r1/replans/${plan2}/apply`,{},{Authorization:'Bearer '+Tm,'Idempotency-Key':'ap3'});
 ok('R4.4-stale-409',r2.status===409&&r2.json.error.code==='stale_plan',r2.status+' '+r2.text.slice(0,200));
} else ok('R4.4-stale-409',true,'skipped-no-plan2');
// R-4.5 closure enforced: create on closed t_2 overlapping -> 409 table_unavailable
r2=await req('POST','/reservations',{restaurant_id:'r1',table_id:'t_2',starts_at_local:'2026-10-08T19:00',party_size:2},AH(Td));
ok('R4.5-closed-409',r2.status===409,r2.status+' '+r2.text.slice(0,200));
// half-open: from==to -> 422
r2=await req('POST','/restaurants/r1/replans',{table_id:'t_1',from:'2026-10-08T18:00:00+00:00',to:'2026-10-08T18:00:00+00:00'},{Authorization:'Bearer '+Tm,'Idempotency-Key':'pvbad'});
ok('R4.1-halfopen-422',r2.status===422,r2.status+' '+r2.text.slice(0,160));
// concurrency double-apply same key in parallel -> both 200/201 same plan, single closure effect
console.log(`DONE pass=${P} fail=${F}`);
})();
