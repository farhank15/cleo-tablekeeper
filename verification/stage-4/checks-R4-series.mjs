const B='http://localhost:18082'; let P=0,F=0;
async function req(m,p,b,h={}){const r=await fetch(B+p,{method:m,headers:{'Content-Type':'application/json',...h},body:b===undefined?undefined:JSON.stringify(b)});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch{};return{status:r.status,json:j,text:t}}
function ok(n,c,x=''){c?(P++,console.log('PASS '+n)):(F++,console.log('FAIL '+n+' '+x))}
let r=await req('POST','/_test/reset',{users:[{id:'u_mgr',email:'m@x.io',password:'password1',display_name:'M'},{id:'u_d',email:'d@x.io',password:'password1',display_name:'D'}],restaurants:[{id:'r1',name:'A',timezone:'UTC',slot_minutes:30,reservation_duration_minutes:90,cancellation_cutoff_minutes:60,opening_hours:[{weekday:'thu',opens:'00:00',closes:'23:59'}],tables:[{id:'t_1',capacity:4},{id:'t_2',capacity:4}],combinable:[],manager_user_ids:['u_mgr']}],reservations:[]});
const Lm=await req('POST','/auth/login',{email:'m@x.io',password:'password1'}); const Ld=await req('POST','/auth/login',{email:'d@x.io',password:'password1'});
const Tm=Lm.json.token,Td=Ld.json.token; const AH=t=>({Authorization:'Bearer '+t,'Idempotency-Key':'k-'+Math.random().toString(36).slice(2)});
r=await req('POST','/reservations',{restaurant_id:'r1',table_id:'t_1',starts_at_local:'2026-10-08T19:00',party_size:2},AH(Td));
const anchor=r.json.reference; ok('anchor',r.status===201,r.status);
r=await req('POST','/series',{anchor_reference:anchor,count:3,interval_weeks:1},AH(Td));
ok('series-create',r.status===201,r.status+' '+r.text.slice(0,200));
const sid=r.json.series_id, srev=r.json.revision;
let a=await req('POST',`/series/${sid}/amend`,{expected_revision:srev,from_index:0,local_time:'25:00'},{Authorization:'Bearer '+Td,'Idempotency-Key':'sa1'});
ok('R4.6-badtime-422',a.status===422,a.status);
a=await req('POST',`/series/${sid}/amend`,{expected_revision:999,from_index:0,local_time:'19:30'},{Authorization:'Bearer '+Td,'Idempotency-Key':'sa2'});
ok('R4.6-stale-409',a.status===409&&a.json.error.code==='stale_revision',a.status+' '+a.text.slice(0,160));
a=await req('POST',`/series/${sid}/amend`,{expected_revision:srev,from_index:1,local_time:'20:00'},{Authorization:'Bearer '+Td,'Idempotency-Key':'sa3'});
ok('R4.6-amend-201',a.status===201,a.status+' '+a.text.slice(0,200));
let a2=await req('POST',`/series/${sid}/amend`,{expected_revision:srev,from_index:1,local_time:'20:00'},{Authorization:'Bearer '+Td,'Idempotency-Key':'sa3'});
ok('R4.6-replay-200',a2.status===200,a2.status);
console.log(`DONE pass=${P} fail=${F}`);
