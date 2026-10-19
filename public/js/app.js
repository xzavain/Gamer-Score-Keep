/* GamerScore Keep — core: API client, auth, router, theme, toasts, modals, family context */
(function(){
'use strict';

const TOKEN_KEY='gsk_token', THEME_KEY='gsk_theme', FAMILY_KEY='gsk_family';

/* ---------------- API client ---------------- */
const api = {
  token: localStorage.getItem(TOKEN_KEY) || null,
  async req(method, url, body){
    const headers={'Content-Type':'application/json'};
    if(this.token) headers['Authorization']='Bearer '+this.token;
    const res = await fetch(url,{method,headers,body:body?JSON.stringify(body):undefined});
    let data=null;
    try{ data=await res.json(); }catch(e){ /* non-json */ }
    if(!res.ok) throw Object.assign(new Error((data&&data.error)||('Request failed ('+res.status+')')),{status:res.status,data});
    return data;
  },
  get:(u)=>api.req('GET',u), post:(u,b)=>api.req('POST',u,b), put:(u,b)=>api.req('PUT',u,b), del:(u)=>api.req('DELETE',u),
  // auth
  register:(b)=>api.post('/api/auth/register',b),
  login:(b)=>api.post('/api/auth/login',b),
  logout:()=>api.post('/api/auth/logout'),
  me:()=>api.get('/api/me'),
  // families
  families:()=>api.get('/api/families'),
  createFamily:(name)=>api.post('/api/families',{name}),
  joinFamily:(room_code)=>api.post('/api/families/join',{room_code}),
  family:(id)=>api.get('/api/families/'+id),
  renameFamily:(id,name)=>api.put('/api/families/'+id,{name}),
  familyBadges:(id)=>api.get('/api/families/'+id+'/badges'),
  badgeCatalog:()=>api.get('/api/badges'),
  // games
  games:(q)=>api.get('/api/games'+(q?'?'+new URLSearchParams(q):'')),
  createGame:(b)=>api.post('/api/games',b),
  game:(id)=>api.get('/api/games/'+id),
  updateGame:(id,b)=>api.put('/api/games/'+id,b),
  submitRound:(id,scores)=>api.post('/api/games/'+id+'/rounds',{scores}),
  updateRoundScores:(id,round,scores)=>api.put('/api/games/'+id+'/rounds/'+round,{scores}),
  tap:(id,player_id,points)=>api.post('/api/games/'+id+'/tap',{player_id,points}),
  toggleEngine:(id,double_value,round_number)=>api.post('/api/games/'+id+'/engines',{double_value,round_number}),
  updatePlayer:(id,pid,b)=>api.put('/api/games/'+id+'/players/'+pid,b),
  nextTurn:(id)=>api.post('/api/games/'+id+'/turn'),
  completeGame:(id)=>api.post('/api/games/'+id+'/complete'),
  deleteGame:(id)=>api.del('/api/games/'+id),
  // history & leaders
  history:(q)=>api.get('/api/history'+(q?'?'+new URLSearchParams(q):'')),
  leaderboard:(family_id)=>api.get('/api/leaderboard?family_id='+encodeURIComponent(family_id)),
  stream:(id)=>new EventSource('/api/games/'+id+'/stream?token='+encodeURIComponent(api.token||'')),
};

/* ---------------- state ---------------- */
const state = {
  user:null, families:[], familyId:localStorage.getItem(FAMILY_KEY)||null, family:null,
  route:null, routeParams:[],
};
function currentFamily(){ return state.families.find(f=>String(f.id)===String(state.familyId))||null; }
function setFamily(id){ state.familyId=id?String(id):null; id?localStorage.setItem(FAMILY_KEY,id):localStorage.removeItem(FAMILY_KEY); state.family=null; }

/* ---------------- theme ---------------- */
function applyTheme(t){ document.documentElement.setAttribute('data-theme',t); localStorage.setItem(THEME_KEY,t);
  const b=document.getElementById('theme-toggle'); if(b) b.textContent = t==='light'?'☀️':'🌙'; }
function initTheme(){ applyTheme(localStorage.getItem(THEME_KEY)||'dark'); }
window.GSK_toggleTheme = ()=>applyTheme(document.documentElement.getAttribute('data-theme')==='light'?'dark':'light');

/* ---------------- toast ---------------- */
function toast(msg,kind){ const r=document.getElementById('toast-root'); const d=document.createElement('div');
  d.className='toast'+(kind?' '+kind:''); d.textContent=msg; r.appendChild(d); setTimeout(()=>{d.style.opacity='0'; setTimeout(()=>d.remove(),300);},2600); }

/* ---------------- modal & sheet ---------------- */
function openModal(html,{wide}={}){
  const root=document.getElementById('modal-root');
  const bd=document.createElement('div'); bd.className='modal-backdrop';
  bd.innerHTML='<div class="modal" role="dialog" aria-modal="true">'+html+'</div>';
  bd.addEventListener('mousedown',e=>{ if(e.target===bd) closeModal(); });
  root.appendChild(bd);
  const esc=e=>{ if(e.key==='Escape'){ closeModal(); document.removeEventListener('keydown',esc);} };
  document.addEventListener('keydown',esc);
  return bd;
}
function closeModal(){ const r=document.getElementById('modal-root'); if(r.lastChild) r.lastChild.remove(); }
function closeAllModals(){ document.getElementById('modal-root').innerHTML=''; }
function openSheet(html){
  const root=document.getElementById('sheet-root');
  const bd=document.createElement('div'); bd.className='sheet-backdrop';
  bd.innerHTML='<div class="sheet" role="dialog" aria-modal="true">'+html+'</div>';
  bd.addEventListener('mousedown',e=>{ if(e.target===bd) closeSheet(); });
  root.appendChild(bd);
  const esc=e=>{ if(e.key==='Escape'){ closeSheet(); document.removeEventListener('keydown',esc);} };
  document.addEventListener('keydown',esc);
  return bd;
}
function closeSheet(){ const r=document.getElementById('sheet-root'); if(r.lastChild) r.lastChild.remove(); }
function modalHead(title){ return '<div class="modal-head"><h2 style="margin:0">'+escapeHtml(title)+'</h2><button class="icon-btn" onclick="GSK.closeModal()" aria-label="Close">✕</button></div>'; }
/* Red destructive-action confirmation. Resolves true when confirmed. */
function confirmDanger({title, body, confirmText}){
  return new Promise((resolve)=>{
    const bd=openModal(
      '<div class="danger-modal">'+
      '<div class="danger-ico">⚠️</div>'+
      '<h2 style="margin:6px 0 10px">'+escapeHtml(title)+'</h2>'+
      '<div class="muted" style="margin-bottom:18px">'+body+'</div>'+
      '<div class="row"><button class="btn btn-ghost grow" id="cd-no">Cancel</button>'+
      '<button class="btn btn-danger grow" id="cd-yes">'+escapeHtml(confirmText||'Delete')+'</button></div>'+
      '</div>');
    bd.querySelector('#cd-no').addEventListener('click',()=>{ closeModal(); resolve(false); });
    bd.querySelector('#cd-yes').addEventListener('click',()=>{ closeModal(); resolve(true); });
  });
}
function fmtMoney(n){
  const v=Number(n)||0;
  return '$'+v.toLocaleString('en-US',{maximumFractionDigits:2});
}
window.GSK = Object.assign(window.GSK||{},{closeModal,closeAllModals,closeSheet,openSheet,modalHead,confirmDanger,fmtMoney,toast});

/* ---------------- helpers ---------------- */
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function avatarHtml(p,cls){ cls=cls||''; const em=p.avatar_emoji||'🙂', col=p.avatar_color||'#6366F1';
  return '<span class="avatar '+cls+'" style="background:'+escapeHtml(col)+'">'+escapeHtml(em)+'</span>'; }
function fmtDate(iso){ if(!iso) return ''; const d=new Date(iso); return d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})+' '+d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}); }
function fmtDuration(ms){ if(!ms&&ms!==0) return ''; const s=Math.round(ms/1000); const m=Math.floor(s/60), h=Math.floor(m/60);
  return h? h+'h '+(m%60)+'m' : m? m+'m '+(s%60)+'s' : s+'s'; }
function initials(name){ return (name||'?').trim().charAt(0).toUpperCase(); }
window.GSK = Object.assign(window.GSK,{escapeHtml,avatarHtml,fmtDate,fmtDuration,initials,api,state,setFamily,currentFamily,openModal});

/* ---------------- auth ---------------- */
async function bootAuth(){
  if(!api.token) return false;
  try{ const d=await api.me(); state.user=d.user; return true; }catch(e){ api.token=null; localStorage.removeItem(TOKEN_KEY); return false; }
}
async function afterAuth(token,user){
  api.token=token; localStorage.setItem(TOKEN_KEY,token); state.user=user;
  try{ state.families=await api.families(); }catch(e){ state.families=[]; }
  if(!state.familyId || !state.families.some(f=>String(f.id)===String(state.familyId))){
    setFamily(state.families.length?state.families[0].id:null);
  }
  route();
}
function authView(tab,opts){
  opts=opts||{};
  const view=document.getElementById('view');
  view.innerHTML =
  '<div class="auth-wrap"><div class="card auth-card fade-in">'+
    '<div class="auth-brand">🎲</div><div class="auth-title">GamerScore Keep</div>'+
    '<div class="muted small">Family game night, scored beautifully.</div>'+
    '<div class="auth-tabs"><button class="btn '+(tab==='login'?'on':'')+'" data-tab="login">Log in</button>'+
    '<button class="btn '+(tab==='register'?'on':'')+'" data-tab="register">Sign up</button></div>'+
    '<form id="auth-form">'+
      '<label class="field" style="text-align:left"><span>Display name</span><input class="input" id="auth-name" placeholder="Alex" '+(tab==='login'?'disabled style="display:none"':'required')+'></label>'+
      '<label class="field" style="text-align:left"><span>Email</span><input class="input" id="auth-email" type="email" required placeholder="you@example.com"></label>'+
      '<label class="field" style="text-align:left"><span>Password</span><input class="input" id="auth-pass" type="password" required minlength="4" placeholder="••••••••"></label>'+
      (tab==='register'?'<label class="field" style="text-align:left"><span>Family room code <span class="muted">(optional — join a family right away)</span></span><input class="input" id="auth-code" placeholder="ABC123" style="text-transform:uppercase"></label>':'')+
      '<button class="btn" style="width:100%;margin-top:12px" type="submit">'+(tab==='login'?'Log in':'Create account')+'</button>'+
    '</form>'+
    '<div class="small muted" style="margin-top:14px">No family yet? Create one after signing in.</div>'+
  '</div></div>';
  view.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>authView(b.dataset.tab)));
  view.querySelector('#auth-form').addEventListener('submit',async e=>{
    e.preventDefault();
    const email=view.querySelector('#auth-email').value.trim(), password=view.querySelector('#auth-pass').value;
    try{
      if(tab==='login'){ const d=await api.login({email,password}); await afterAuth(d.token,d.user); toast('Welcome back, '+d.user.display_name+'!','ok'); }
      else{
        const display_name=view.querySelector('#auth-name').value.trim();
        const codeEl=view.querySelector('#auth-code'); const room_code=codeEl?codeEl.value.trim().toUpperCase():'';
        const d=await api.register({email,password,display_name});
        await afterAuth(d.token,d.user);
        if(room_code){ try{ const f=await api.joinFamily(room_code); state.families=await api.families(); setFamily(f.family.id); toast('Joined '+f.family.name+'!','ok'); }catch(err){ toast('Account created, but room code failed: '+err.message,'err'); } }
        else toast('Account created — welcome!','ok');
      }
    }catch(err){ toast(err.message,'err'); }
  });
}
window.GSK.logout = async ()=>{ try{ await api.logout(); }catch(e){} api.token=null; localStorage.removeItem(TOKEN_KEY); state.user=null; location.hash='#/dashboard'; route(); };

/* ---------------- router ---------------- */
const routes = {
  '/dashboard':()=>window.GSK_Dashboard?GSK_Dashboard.render():null,
  '/game-list':()=>window.GSK_Dashboard?GSK_Dashboard.renderList():null,
  '/game':(id)=>window.GSK_Game?GSK_Game.render(id):null,
  '/history':()=>window.GSK_History?GSK_History.render():null,
  '/leaders':()=>window.GSK_Leaders?GSK_Leaders.render():null,
  '/family':()=>window.GSK_Family?GSK_Family.render():null,
  '/toolkit':()=>window.GSK_Toolkit?GSK_Toolkit.render():null,
};
let teardownFns=[];
function onTeardown(fn){ teardownFns.push(fn); }
function runTeardown(){ teardownFns.forEach(fn=>{try{fn();}catch(e){}}); teardownFns=[]; }
window.GSK = Object.assign(window.GSK,{onTeardown});

function setActiveNav(path){
  const key=path.startsWith('/game/')?'/game-list':path;
  document.querySelectorAll('.nav-item').forEach(b=>{
    const r=b.dataset.route; b.classList.toggle('active', r==='#'+key || (key==='/dashboard'&&r==='#/dashboard'));
  });
}
function route(){
  runTeardown();
  document.getElementById('live-dot').classList.add('hidden');
  const hash=location.hash||'#/dashboard';
  const parts=hash.replace(/^#\/?/,'').split('/');
  const path='/'+parts[0];
  const params=parts.slice(1).map(decodeURIComponent);
  const render=routes[path]||routes['/dashboard'];
  const show=async()=>{
    if(!state.user && api.token){ await bootAuth(); }
    if(!state.user){ setActiveNav('/dashboard'); authView('login'); return; }
    if(state.familyId && !state.family){ try{ state.family=await api.family(state.familyId); }catch(e){} }
    setActiveNav(path);
    try{ await render.apply(null,params); }catch(err){ document.getElementById('view').innerHTML='<div class="card"><h2>Something went wrong</h2><p class="muted">'+escapeHtml(err.message)+'</p></div>'; }
  };
  show();
}
window.addEventListener('hashchange',route);

/* ---------------- boot ---------------- */
document.addEventListener('DOMContentLoaded',()=>{
  initTheme();
  document.getElementById('theme-toggle').addEventListener('click',window.GSK_toggleTheme);
  document.getElementById('brand').addEventListener('click',()=>{location.hash='#/dashboard';});
  document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{location.hash=b.dataset.route;}));
  (async()=>{ if(await bootAuth()){ try{ state.families=await api.families(); }catch(e){}
      if(!state.familyId || !state.families.some(f=>String(f.id)===String(state.familyId))) setFamily(state.families.length?state.families[0].id:null);
    } route(); })();
});
})();
