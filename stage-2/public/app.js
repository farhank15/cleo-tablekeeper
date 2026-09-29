const $=id=>document.getElementById(id);
const store={get token(){return localStorage.getItem('tk_token')},set token(v){v?localStorage.setItem('tk_token',v):localStorage.removeItem('tk_token')},get name(){return localStorage.getItem('tk_name')},set name(v){v?localStorage.setItem('tk_name',v):localStorage.removeItem('tk_name')}};
let restaurants=[],restMap={},searchSeq=0,currentSearch=null,sel=null,lastKey=null,lastBody=null,lastRef=null;
function authH(){return store.token?{Authorization:'Bearer '+store.token,'Content-Type':'application/json'}:{'Content-Type':'application/json'}}
function showAuth(){const cu=$('current-user'),lo=$('logout-button');if(store.token){cu.hidden=false;cu.textContent=store.name||'Signed in';lo.hidden=false}else{cu.hidden=true;lo.hidden=true}}
function route(){const p=location.pathname;for(const s of document.querySelectorAll('main>section'))s.hidden=true;$('screen-search').hidden=false;if(p==='/signup')$('screen-signup').hidden=false;else if(p==='/login')$('screen-login').hidden=false;else if(p==='/lookup')$('screen-lookup').hidden=false;showAuth()}
document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a)return;const u=new URL(a.href,location.origin);if(u.origin===location.origin&&['/','/signup','/login','/lookup'].includes(u.pathname)){e.preventDefault();history.pushState({},'',u.pathname);route()}});
addEventListener('popstate',route);
async function loadRestaurants(){const r=await fetch('/restaurants');const j=await r.json();restaurants=j.restaurants||[];const selEl=$('restaurant-select');selEl.innerHTML='';for(const x of restaurants){const o=document.createElement('option');o.value=x.id;o.textContent=x.name||x.id;selEl.appendChild(o)}for(const x of restaurants){try{const d=await(await fetch('/restaurants/'+encodeURIComponent(x.id))).json();restMap[x.id]=d}catch{}}}
function setErr(el,msg){if(!msg){el.hidden=true;el.textContent='';}else{el.hidden=false;el.textContent=msg}}
async function doSearch(){const rid=$('restaurant-select').value,date=$('date-input').value,ps=parseInt($('party-size-input').value,10);const my=++searchSeq;const st=$('search-status');st.textContent='Searching…';$('search-button').disabled=true;
try{const r=await fetch(`/availability?restaurant_id=${encodeURIComponent(rid)}&date=${encodeURIComponent(date)}&party_size=${ps}`);const j=await r.json();if(my!==searchSeq)return;currentSearch={rid,date,ps};renderSlots(j,rid,ps);}catch(e){if(my!==searchSeq)return;st.textContent='Search failed.'}finally{if(my===searchSeq)$('search-button').disabled=false}}
function tableLabel(rest,id){const t=(rest.tables||[]).find(t=>t.id===id);return t?(t.label||t.name||id):id}
function renderSlots(j,rid,ps){const grid=$('availability-grid'),no=$('no-slots'),st=$('search-status');grid.innerHTML='';const rest=restMap[rid]||{};const slots=j.slots||[];
if(!slots.length){grid.hidden=true;grid.style.display='none';no.hidden=false;st.textContent='';return}
no.hidden=true;grid.hidden=false;grid.style.display='';st.textContent=`${slots.length} time slots`;
// Build option lookup from available_options if present
for(const s of slots){const hh=s.starts_at_local.slice(11,16);const avail=s.available_table_ids||[];const opts=s.available_options||null;
 const cells=[];
 if(opts){for(const o of opts){const ids=o.table_ids;if(ids.length===1)cells.push({ids,avail:avail.includes(ids[0])});else cells.push({ids,avail:true});}}
 else{for(const t of (rest.tables||[]))cells.push({ids:[t.id],avail:avail.includes(t.id)});}
 // also ensure singles not in options still shown? options cover all singles per spec.
 for(const c of cells){const tid=c.ids.length===1?c.ids[0]:c.ids.join('+');const b=document.createElement('button');b.setAttribute('data-testid',`slot-${tid}-${hh}`);b.dataset.available=String(c.avail);b.className='slot'+(c.avail?'':' unavailable');const labels=c.ids.map(id=>tableLabel(rest,id)).join(' + ');b.textContent=`${labels} · ${hh}`;if(!c.avail)b.disabled=false; // keep clickable but no-op
  b.addEventListener('click',()=>{if(b.dataset.available!=='true')return;openBooking(rid,rest,c.ids,s,ps)});grid.appendChild(b)}}
}
function openBooking(rid,rest,ids,slot,ps){if(!store.token){const ae=$('auth-error');setErr(ae,'Please log in to book.');location.assign('/login');return}
sel={rid,rest,ids,slot};$('screen-booking').hidden=false;lastKey=crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random());lastBody=null;lastRef=null;
const labels=ids.map(id=>tableLabel(rest,id)).join(' + ');
$('booking-summary').textContent=`${rest.name||rid} · ${labels} · ${slot.starts_at_local}`;$('booking-party-size').value=ps;setErr($('booking-error'));setErr($('booking-uncertain'));$('confirmation').hidden=true;$('booking-key').value=lastKey;
$('screen-booking').scrollIntoView({behavior:'smooth'})}
async function doBook(){const be=$('booking-error'),un=$('booking-uncertain');if(!sel)return;const ps=parseInt($('booking-party-size').value,10);
const body={restaurant_id:sel.rid,starts_at_local:sel.slot.starts_at_local,party_size:ps};if(sel.ids.length===1)body.table_id=sel.ids[0];else body.table_ids=[...sel.ids];
const key=$('booking-key').value||lastKey;const bodyStr=JSON.stringify(body);
if(lastRef&&lastBody===bodyStr){return} // unchanged resubmit: keep same ref, no new booking
lastBody=bodyStr;
$('booking-submit').disabled=true;$('booking-submit').textContent='Booking…';
let res,txt;try{res=await fetch('/reservations',{method:'POST',headers:{...authH(),'Idempotency-Key':key},body:bodyStr});txt=await res.text()}catch(e){setErr(un,'Booking status uncertain — connection lost. Press Book again to retry with the same request.');$('booking-submit').disabled=false;$('booking-submit').textContent='Book table';return}
let j;try{j=JSON.parse(txt)}catch{j={}};
if(res.status===201||res.status===200){setErr(be);setErr(un);lastRef=j.reference;showConfirmation(j,sel);$('booking-submit').disabled=false;$('booking-submit').textContent='Book table';return}
if(res.status===409){setErr(be,'That table was just taken. Availability refreshed — please choose another.');setErr(un);$('confirmation').hidden=true;doSearch();$('booking-submit').disabled=false;$('booking-submit').textContent='Book table';return}
// ambiguous: treat network-ambiguous only via catch; other errors:
if(!res.ok){const code=(j.error&&j.error.code)||'Booking failed';if(res.status>=500){setErr(un,'Booking status uncertain — please retry.')}else setErr(be,code);$('booking-submit').disabled=false;$('booking-submit').textContent='Book table';return}}
function showConfirmation(j,sel){const rest=sel.rest;const ids=j.table_ids||(j.table_id?[j.table_id]:sel.ids);const labels=ids.map(id=>tableLabel(rest,id)).join(' + ');$('confirmation').hidden=false;$('confirmation-reference').textContent=j.reference;$('confirmation-details').textContent=`${rest.name||sel.rid} · ${labels} · ${j.starts_at_local}`;$('confirmation-tables').textContent=labels}
async function signup(){const e=$('signup-error');try{const r=await fetch('/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('signup-email').value,password:$('signup-password').value,display_name:$('signup-display-name').value})});const j=await r.json();if(!r.ok&&!r.token){setErr(e,(j.error&&j.error.code)||'Signup failed');return}setErr(e);store.token=j.token;store.name=j.display_name;route()}catch{setErr(e,'Signup failed')}}
async function login(){const e=$('login-error');try{const r=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('login-email').value,password:$('login-password').value})});const j=await r.json();if(!r.ok&&!r.token&&r.error){setErr(e,j.error.code);return}setErr(e);store.token=j.token;store.name=j.display_name;history.pushState({},'','/');route()}catch{setErr(e,'Login failed')}}
async function lookup(){const ref=$('lookup-reference-input').value.trim();const d=$('reservation-detail'),er=$('reservation-error');try{const r=await fetch('/reservations/'+encodeURIComponent(ref),{headers:authH()});const j=await r.json();if(!r.ok){d.hidden=true;er.hidden=false;er.textContent=(j.error&&j.error.code)||'not_found';return}er.hidden=true;er.textContent='';d.hidden=false;$('reservation-status').textContent=j.status;const rest=restMap[j.restaurant_id];let rn=j.restaurant_id,rl='';if(rest){rn=rest.name||rn;const ids=j.table_ids||(j.table_id?[j.table_id]:[]);rl=ids.map(id=>tableLabel(rest,id)).join(' + ')}$('reservation-info').textContent=`${rn} · ${rl} · ${j.starts_at_local}`;$('reservation-tables').textContent=rl;const cb=$('reservation-cancel-button');if(j.status==='cancelled'){cb.removeAttribute('data-testid');cb.hidden=true}else{cb.setAttribute('data-testid','reservation-cancel-button');cb.hidden=false;cb.onclick=cancelRef} }catch{er.hidden=false;er.textContent='lookup failed'}}
async function cancelRef(){const ref=$('lookup-reference-input').value.trim();const er=$('reservation-error');try{const r=await fetch('/reservations/'+encodeURIComponent(ref)+'/cancel',{method:'POST',headers:authH()});const j=await r.json();if(!r.ok){er.hidden=false;er.textContent=(j.error&&j.error.code)||'refused';return}lookup()}catch{er.hidden=false;er.textContent='cancel refused'}}
$('search-button').addEventListener('click',doSearch);
$('booking-submit').addEventListener('click',doBook);
$('signup-submit').addEventListener('click',signup);
$('login-submit').addEventListener('click',login);
$('lookup-submit').addEventListener('click',lookup);
$('logout-button').addEventListener('click',()=>{store.token=null;store.name=null;route()});
$('date-input').value='2026-09-24';
loadRestaurants().then(route);route();
