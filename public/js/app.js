/* GamerScore Keep — core: API client, auth, router, theme, toasts, modals, family context */
(function(){
'use strict';

const TOKEN_KEY='gsk_token', THEME_KEY='gsk_theme', FAMILY_KEY='gsk_family';

/* ---------------- API client ---------------- */
const api = {
  token: localStorage.getItem(TOKEN_KEY) || null,
  async req(method, url, body){
    const headers={'Content-Type':'application/json'};
    const hadToken=!!this.token;
    if(this.token) headers['Authorization']='Bearer '+this.token;
    const res = await fetch(url,{method,headers,body:body?JSON.stringify(body):undefined});
    let data=null;
    try{ data=await res.json(); }catch(e){ /* non-json */ }
    if(res.status===401 && hadToken){
      // Session expired or revoked mid-app: drop auth state and land cleanly on login.
      api.token=null; localStorage.removeItem(TOKEN_KEY);
      state.user=null; state.families=[]; setFamily(null);
      renderAccountBtn();
      if(typeof route==='function') route();
    }
    if(!res.ok) throw Object.assign(new Error((data&&data.error)||('Request failed ('+res.status+')')),{status:res.status,data});
    return data;
  },
  get:(u)=>api.req('GET',u), post:(u,b)=>api.req('POST',u,b), put:(u,b)=>api.req('PUT',u,b), del:(u)=>api.req('DELETE',u),
  // auth
  register:(b)=>api.post('/api/auth/register',b),
  login:(b)=>api.post('/api/auth/login',b),
  logout:()=>api.post('/api/auth/logout'),
  me:()=>api.get('/api/me'),
  updateMe:(b)=>api.put('/api/me',b),
  changePassword:(b)=>api.put('/api/me/password',b),
  forgot:(email)=>api.post('/api/auth/forgot',{email}),
  resetValidate:(token)=>api.get('/api/auth/reset/'+encodeURIComponent(token)),
  resetPassword:(token,password)=>api.post('/api/auth/reset',{token,password}),
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
  renderAccountBtn();
  route();
}
/* Password strength: 0-4. */
function pwStrength(pw){
  let s=0;
  if(pw.length>=8) s++;
  if(pw.length>=12) s++;
  if(/[a-z]/.test(pw)&&/[A-Z]/.test(pw)) s++;
  if(/\d/.test(pw)&&/[^a-zA-Z0-9]/.test(pw)) s++;
  return Math.min(s,4);
}
function pwStrengthLabel(pw){
  if(!pw) return '';
  const s=pwStrength(pw);
  return [['Weak','var(--red)'],['Fair','var(--amber)'],['Good','var(--indigo)'],['Strong','var(--emerald)']][Math.max(0,s-1)];
}
function authView(tab,opts){
  opts=opts||{};
  const view=document.getElementById('view');
  const isLogin=tab==='login', isReg=tab==='register', isForgot=tab==='forgot';
  view.innerHTML =
  '<div class="auth-wrap"><div class="card auth-card fade-in">'+
    '<div class="auth-brand">🎲</div><div class="auth-title">GamerScore Keep</div>'+
    '<div class="muted small">Family game night, scored beautifully.</div>'+
    (isForgot?'':'<div class="auth-tabs"><button class="btn '+(isLogin?'on':'')+'" data-tab="login">Log in</button>'+
    '<button class="btn '+(isReg?'on':'')+'" data-tab="register">Sign up</button></div>')+
    '<form id="auth-form">'+
      (isForgot?
        '<div class="auth-title" style="font-size:1.15rem;margin-bottom:4px">Reset your password</div>'+
        '<div class="muted small" style="margin-bottom:10px">Enter your account email and we\u2019ll create a one-time reset link.</div>'+
        '<label class="field" style="text-align:left"><span>Email</span><input class="input" id="auth-email" type="email" required placeholder="you@example.com" autocomplete="email"></label>'
      :
        (isReg?'<label class="field" style="text-align:left"><span>Display name</span><input class="input" id="auth-name" placeholder="Alex" required maxlength="60" autocomplete="nickname"></label>':'')+
        '<label class="field" style="text-align:left"><span>Email</span><input class="input" id="auth-email" type="email" required placeholder="you@example.com" autocomplete="email"></label>'+
        '<label class="field" style="text-align:left"><span>Password</span><input class="input" id="auth-pass" type="password" required minlength="'+(isReg?'8':'1')+'" placeholder="••••••••" autocomplete="'+(isLogin?'current-password':'new-password')+'"></label>'+
        (isReg?'<div class="small" id="pw-hint" style="text-align:left;min-height:1.2em"></div>':'')+
        (isReg?'<label class="field" style="text-align:left"><span>Family room code <span class="muted">(optional — join a family right away)</span></span><input class="input" id="auth-code" placeholder="482916" inputmode="numeric" maxlength="6"></label>':'')+
        (isForgot?'':'<label class="row small" style="justify-content:flex-start;gap:8px;margin:6px 0"><input type="checkbox" id="auth-remember" checked style="width:16px;height:16px;accent-color:var(--indigo)"><span>Remember me <span class="muted">(stay signed in for 30 days)</span></span></label>')
      )+
      '<button class="btn" style="width:100%;margin-top:12px" type="submit">'+(isLogin?'Log in':isReg?'Create account':'Send reset link')+'</button>'+
    '</form>'+
    (isLogin?'<div class="small" style="margin-top:12px"><a href="#/forgot" class="linklike">Forgot password?</a></div>':'')+
    (isForgot?'<div class="small" style="margin-top:12px"><a href="#/dashboard" class="linklike">← Back to log in</a></div>':'')+
    (isReg?'':'<div class="small muted" style="margin-top:14px">No family yet? Create one after signing in.</div>')+
    '<div id="auth-msg" style="margin-top:10px"></div>'+
  '</div></div>';
  const msg=(html)=>{ const m=view.querySelector('#auth-msg'); if(m) m.innerHTML=html; };
  if(!isForgot) view.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>authView(b.dataset.tab)));
  const passEl=view.querySelector('#auth-pass');
  if(isReg&&passEl){
    const hint=view.querySelector('#pw-hint');
    passEl.addEventListener('input',()=>{
      const v=passEl.value;
      if(!v){ hint.textContent=''; return; }
      const [label,color]=pwStrengthLabel(v);
      hint.innerHTML='Strength: <strong style="color:'+color+'">'+label+'</strong>'+(v.length<8?' <span class="muted">· needs 8+ characters</span>':'');
    });
  }
  view.querySelector('#auth-form').addEventListener('submit',async e=>{
    e.preventDefault(); msg('');
    const btn=e.target.querySelector('button[type=submit]'); btn.disabled=true;
    try{
      if(isForgot){
        const email=view.querySelector('#auth-email').value.trim();
        const d=await api.forgot(email);
        let html='<div class="muted small">'+escapeHtml(d.message)+'</div>';
        if(d.reset_path){
          const full=location.origin+d.reset_path;
          html+='<div class="reset-link-box"><div class="small" style="margin-bottom:6px"><strong>Your reset link</strong> <span class="muted">(valid 1 hour, one-time use — share it with the family member):</span></div>'+
            '<div class="row"><input class="input grow" id="reset-link" readonly value="'+escapeHtml(full)+'"><button class="btn btn-sm" id="copy-reset" type="button">📋 Copy</button></div></div>';
        }
        msg(html);
        const cp=view.querySelector('#copy-reset');
        if(cp) cp.addEventListener('click',async()=>{
          const inp=view.querySelector('#reset-link');
          try{ await navigator.clipboard.writeText(inp.value); toast('Reset link copied!','ok'); }
          catch(err){ inp.select(); document.execCommand('copy'); toast('Reset link copied!','ok'); }
        });
      }else if(isLogin){
        const email=view.querySelector('#auth-email').value.trim(), password=passEl.value;
        const remember=view.querySelector('#auth-remember').checked;
        const d=await api.login({email,password,remember_me:remember});
        await afterAuth(d.token,d.user); toast('Welcome back, '+d.user.display_name+'!','ok');
      }else{
        const display_name=view.querySelector('#auth-name').value.trim();
        const email=view.querySelector('#auth-email').value.trim(), password=passEl.value;
        if(password.length<8){ msg('<div class="small" style="color:var(--red)">Password needs at least 8 characters.</div>'); btn.disabled=false; return; }
        const remember=view.querySelector('#auth-remember').checked;
        const codeEl=view.querySelector('#auth-code'); const room_code=codeEl?codeEl.value.trim():'';
        const d=await api.register({email,password,display_name,remember_me:remember});
        await afterAuth(d.token,d.user);
        if(room_code){ try{ const f=await api.joinFamily(room_code); state.families=await api.families(); setFamily(f.family.id); renderAccountBtn(); toast('Joined '+f.family.name+'!','ok'); }catch(err){ toast('Account created, but room code failed: '+err.message,'err'); } }
        else toast('Account created — welcome!','ok');
      }
    }catch(err){ msg('<div class="small" style="color:var(--red)">'+escapeHtml(err.message)+'</div>'); }
    finally{ btn.disabled=false; }
  });
}
/* Reset-password page: public route #/reset/<token>. */
async function resetView(token){
  const view=document.getElementById('view');
  setActiveNav('/reset');
  view.innerHTML='<div class="auth-wrap"><div class="card auth-card fade-in"><div class="auth-brand">🔑</div>'+
    '<div class="auth-title" style="font-size:1.25rem">Set a new password</div><div id="reset-body"><div class="muted small">Checking your reset link…</div></div></div></div>';
  const body=view.querySelector('#reset-body');
  if(!token){ body.innerHTML='<div class="small" style="color:var(--red)">This reset link is invalid or has expired.</div><div class="small" style="margin-top:10px"><a href="#/forgot" class="linklike">Request a new one</a></div>'; return; }
  try{ await api.resetValidate(token); }
  catch(e){ body.innerHTML='<div class="small" style="color:var(--red)">'+escapeHtml(e.message)+'</div><div class="small" style="margin-top:10px"><a href="#/forgot" class="linklike">Request a new reset link</a></div>'; return; }
  body.innerHTML='<form id="reset-form">'+
    '<label class="field" style="text-align:left"><span>New password</span><input class="input" id="rp-pass" type="password" required minlength="8" placeholder="••••••••" autocomplete="new-password"></label>'+
    '<label class="field" style="text-align:left"><span>Confirm new password</span><input class="input" id="rp-pass2" type="password" required minlength="8" placeholder="••••••••" autocomplete="new-password"></label>'+
    '<button class="btn" style="width:100%;margin-top:12px" type="submit">Set new password</button></form><div id="rp-msg" style="margin-top:10px"></div>';
  body.querySelector('#reset-form').addEventListener('submit',async e=>{
    e.preventDefault();
    const p1=body.querySelector('#rp-pass').value, p2=body.querySelector('#rp-pass2').value;
    const m=body.querySelector('#rp-msg');
    if(p1!==p2){ m.innerHTML='<div class="small" style="color:var(--red)">Passwords don\u2019t match.</div>'; return; }
    if(p1.length<8){ m.innerHTML='<div class="small" style="color:var(--red)">Password needs at least 8 characters.</div>'; return; }
    try{
      await api.resetPassword(token,p1);
      body.innerHTML='<div class="small" style="color:var(--emerald)">✅ Password updated! You\u2019ve been signed out everywhere — please log in again.</div><div style="margin-top:12px"><a class="btn" href="#/dashboard" style="width:100%">Log in</a></div>';
      toast('Password reset — please log in','ok');
    }catch(err){ m.innerHTML='<div class="small" style="color:var(--red)">'+escapeHtml(err.message)+'</div>'; }
  });
}
/* Topbar account button: shows the signed-in user's avatar, routes to My Account. */
function renderAccountBtn(){
  const b=document.getElementById('account-btn');
  if(!b) return;
  if(state.user){
    b.innerHTML='<span class="avatar" style="background:'+escapeHtml(state.user.avatar_color||'#6366F1')+';width:24px;height:24px;font-size:.95rem">'+escapeHtml(state.user.avatar_emoji||'🙂')+'</span>';
    b.title='My Account ('+state.user.display_name+')';
    b.classList.remove('hidden');
  }else{ b.classList.add('hidden'); }
}
window.GSK.logout = async ()=>{ try{ await api.logout(); }catch(e){} api.token=null; localStorage.removeItem(TOKEN_KEY); state.user=null; state.families=[]; setFamily(null); renderAccountBtn(); location.hash='#/dashboard'; route(); };

/* My Account: profile, avatar, password, logout. */
const AVATAR_EMOJIS=['🎮','🐯','🐸','🦄','🐶','🐱','🦊','🐼','🦁','🐷','🐙','🦄','🚀','⭐','🎯','🎲','👾','🤖'];
const AVATAR_COLORS=['#6366F1','#10B981','#F59E0B','#EF4444','#EC4899','#8B5CF6','#06B6D4','#84CC16'];
async function accountView(){
  const view=document.getElementById('view');
  setActiveNav('/account');
  const u=state.user;
  view.innerHTML='<div class="dash-head"><h1 style="margin:0">My Account</h1></div>'+
    '<div class="card" style="max-width:560px"><div class="row" style="align-items:center;gap:14px">'+
      '<span class="acct-avatar" id="acct-preview" style="background:'+escapeHtml(u.avatar_color||'#6366F1')+'">'+escapeHtml(u.avatar_emoji||'🎮')+'</span>'+
      '<div><h2 style="margin:0">'+escapeHtml(u.display_name)+'</h2><div class="muted small">'+escapeHtml(u.email)+'</div></div></div>'+
    '<form id="acct-form">'+
      '<label class="field"><span>Display name</span><input class="input" id="acct-name" value="'+escapeHtml(u.display_name)+'" maxlength="60" required></label>'+
      '<div class="field"><span style="display:block;font-size:.8rem;font-weight:600;color:var(--muted);margin-bottom:6px">Avatar</span><div class="emoji-pick" id="acct-emoji"></div></div>'+
      '<div class="field"><span style="display:block;font-size:.8rem;font-weight:600;color:var(--muted);margin-bottom:6px">Avatar color</span><div class="color-pick" id="acct-color"></div></div>'+
      '<button class="btn" type="submit" style="width:100%;margin-top:8px">Save profile</button></form></div>'+
    '<div class="card" style="max-width:560px"><h3 style="margin-top:0">Change password</h3><form id="pw-form">'+
      '<label class="field"><span>Current password</span><input class="input" id="pw-cur" type="password" required autocomplete="current-password"></label>'+
      '<label class="field"><span>New password <span class="muted">(8+ characters)</span></span><input class="input" id="pw-new" type="password" required minlength="8" autocomplete="new-password"></label>'+
      '<label class="field"><span>Confirm new password</span><input class="input" id="pw-new2" type="password" required minlength="8" autocomplete="new-password"></label>'+
      '<button class="btn" type="submit" style="width:100%">Update password</button></form>'+
      '<div id="pw-msg" style="margin-top:8px"></div>'+
      '<div class="small muted" style="margin-top:6px">Changing your password signs you out on all other devices.</div></div>'+
    '<div class="card" style="max-width:560px"><button class="btn btn-danger" id="acct-logout" style="width:100%">🚪 Log out</button></div>';
  let emoji=u.avatar_emoji||'🎮', color=u.avatar_color||'#6366F1';
  const eq=view.querySelector('#acct-emoji'), cq=view.querySelector('#acct-color'), prev=view.querySelector('#acct-preview');
  const paint=()=>{ prev.textContent=emoji; prev.style.background=color;
    eq.querySelectorAll('button').forEach(b=>b.classList.toggle('sel',b.dataset.e===emoji));
    cq.querySelectorAll('button').forEach(b=>b.classList.toggle('sel',b.dataset.c===color)); };
  eq.innerHTML=AVATAR_EMOJIS.map(e=>'<button type="button" data-e="'+e+'">'+e+'</button>').join('');
  cq.innerHTML=AVATAR_COLORS.map(c=>'<button type="button" data-c="'+c+'" style="background:'+c+'"></button>').join('');
  eq.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{emoji=b.dataset.e;paint();}));
  cq.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{color=b.dataset.c;paint();}));
  paint();
  view.querySelector('#acct-form').addEventListener('submit',async e=>{
    e.preventDefault();
    const name=view.querySelector('#acct-name').value.trim();
    if(!name){ toast('Display name is required','err'); return; }
    try{ const d=await api.updateMe({display_name:name,avatar_emoji:emoji,avatar_color:color});
      state.user=d.user; renderAccountBtn(); toast('Profile saved!','ok'); accountView(); }
    catch(err){ toast(err.message,'err'); }
  });
  view.querySelector('#pw-form').addEventListener('submit',async e=>{
    e.preventDefault();
    const m=view.querySelector('#pw-msg');
    const cur=view.querySelector('#pw-cur').value, nw=view.querySelector('#pw-new').value, nw2=view.querySelector('#pw-new2').value;
    if(nw!==nw2){ m.innerHTML='<div class="small" style="color:var(--red)">New passwords don\u2019t match.</div>'; return; }
    if(nw.length<8){ m.innerHTML='<div class="small" style="color:var(--red)">New password needs at least 8 characters.</div>'; return; }
    try{ await api.changePassword({current_password:cur,new_password:nw});
      m.innerHTML='<div class="small" style="color:var(--emerald)">✅ Password updated — other devices were signed out.</div>';
      e.target.reset(); toast('Password updated!','ok'); }
    catch(err){ m.innerHTML='<div class="small" style="color:var(--red)">'+escapeHtml(err.message)+'</div>'; }
  });
  view.querySelector('#acct-logout').addEventListener('click',()=>{ if(confirm('Log out?')) GSK.logout(); });
}

/* ---------------- router ---------------- */
const routes = {
  '/dashboard':()=>window.GSK_Dashboard?GSK_Dashboard.render():null,
  '/game-list':()=>window.GSK_Dashboard?GSK_Dashboard.renderList():null,
  '/game':(id)=>window.GSK_Game?GSK_Game.render(id):null,
  '/history':()=>window.GSK_History?GSK_History.render():null,
  '/leaders':()=>window.GSK_Leaders?GSK_Leaders.render():null,
  '/family':()=>window.GSK_Family?GSK_Family.render():null,
  '/toolkit':()=>window.GSK_Toolkit?GSK_Toolkit.render():null,
  '/account':()=>accountView(),
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
    if(path==='/forgot'){ setActiveNav('/forgot'); authView('forgot'); return; }
    if(path==='/reset'){ await resetView(params[0]); return; }
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
  document.getElementById('account-btn').addEventListener('click',()=>{location.hash='#/account';});
  document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{location.hash=b.dataset.route;}));
  (async()=>{ if(await bootAuth()){ try{ state.families=await api.families(); }catch(e){}
      if(!state.familyId || !state.families.some(f=>String(f.id)===String(state.familyId))) setFamily(state.families.length?state.families[0].id:null);
    } renderAccountBtn(); route(); })();
});
})();
