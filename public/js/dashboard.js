/* GamerScore Keep — dashboard: active games, new-game modal, family preview */
(function(){
'use strict';
const EMOJIS=['😀','😎','🤩','🥳','😜','🤖','👾','🐶','🐱','🦊','🐼','🦁','🐸','🦄','🐝','🍕','⚽','🎮','🚀','🌟'];
const COLORS=['#6366F1','#10B981','#F59E0B','#EF4444','#06B6D4','#EC4899','#8B5CF6','#F97316','#14B8A6','#A855F7'];

function emojiPicker(el, cb){ el.innerHTML=EMOJIS.map(e=>'<button type="button" class="emoji-opt" data-e="'+e+'">'+e+'</button>').join('');
  el.querySelectorAll('.emoji-opt').forEach(b=>b.addEventListener('click',()=>{ el.querySelectorAll('.emoji-opt').forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); cb(b.dataset.e); })); }
function colorPicker(el, cb){ el.innerHTML=COLORS.map(c=>'<button type="button" class="color-opt" data-c="'+c+'" style="background:'+c+'"></button>').join('');
  el.querySelectorAll('.color-opt').forEach(b=>b.addEventListener('click',()=>{ el.querySelectorAll('.color-opt').forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); cb(b.dataset.c); })); }

function statusBadge(s){ if(s==='completed')return '<span class="badge green">Completed</span>'; if(s==='paused')return '<span class="badge gold">Paused</span>'; return '<span class="badge">In progress</span>'; }

function gameCard(g, players){
  const pls=players||[];
  const th=GSK_Themes.get(g.game_type);
  const contenders=pls.filter(p=>!p.eliminated);
  const sorted=contenders.slice().sort((a,b)=>(g.win_condition==='lowest'?a.total-b.total:b.total-a.total));
  const leader=sorted[0];
  const scoreFmt=th.money?GSK.fmtMoney:(v=>v);
  return '<div class="card game-card '+(g.status==='paused'?'paused':'')+(th.badge?' no-mercy':'')+'" data-id="'+g.id+'" style="--theme-c:'+th.color+'">'+
    '<span class="theme-strip"></span>'+
    (g.status!=='completed'?'<button class="icon-btn card-del" data-del="'+g.id+'" title="Delete game">🗑</button>':'')+
    '<div class="row"><div class="grow"><strong>'+th.emoji+' '+GSK.escapeHtml(g.name)+'</strong></div>'+statusBadge(g.status)+'</div>'+
    '<div class="small muted" style="margin:6px 0">'+GSK.escapeHtml(th.name)+(g.target_score?' · target '+g.target_score:'')+(th.badge?' · <span class="no-mercy-badge">'+th.badge+'</span>':'')+'</div>'+
    '<div class="row"><div class="row">'+pls.slice(0,4).map(p=>GSK.avatarHtml(p)).join('')+
    (pls.length>4?'<span class="small muted">+'+(pls.length-4)+'</span>':'')+'</div>'+
    (leader?'<div class="grow"></div><div><div class="small muted">Leader</div><div class="score-pill">'+scoreFmt(leader.total)+'</div><div class="small">'+GSK.escapeHtml(leader.name)+'</div></div>':'')+
    '</div></div>';
}
function gameTypeLabel(t){ return GSK_Themes.get(t).name; }

/* ---------- new game modal ---------- */
let roster=[]; // [{name,avatar_emoji,avatar_color,user_id}]
function openNewGameModal(familyId, memberOptions){
  roster=[];
  const html=GSK.modalHead('Start New Game')+
    '<label class="field"><span>Game name</span><input class="input" id="ng-name" placeholder="Friday Night Dominoes" required></label>'+
    '<label class="field"><span>Preset</span><select class="input" id="ng-preset">'+
      GSK_Themes.PRESET_ORDER.map(t=>{ const th=GSK_Themes.get(t);
        return '<option value="'+t+'">'+th.emoji+' '+GSK.escapeHtml(th.name)+'</option>'; }).join('')+
    '</select></label><div class="small muted" id="ng-hint" style="margin:-4px 0 6px"></div>'+
    '<div class="grid2">'+
      '<label class="field"><span>Win condition</span><select class="input" id="ng-win"><option value="lowest">Lowest score wins</option><option value="highest">Highest score wins</option></select></label>'+
      '<label class="field"><span>Scoring mode</span><select class="input" id="ng-scoring"><option value="rounds">Round-by-round</option><option value="quick">Quick-tap</option></select></label>'+
    '</div><div class="grid2">'+
      '<label class="field"><span>Target score (optional)</span><input class="input" id="ng-target" type="number" min="1" placeholder="e.g. 250"></label>'+
      '<label class="field" id="ng-set-wrap"><span>Domino set</span><select class="input" id="ng-set"><option value="double12">Double-12</option><option value="double9">Double-9</option><option value="double15">Double-15</option></select></label>'+
    '</div>'+
    '<label class="field"><span>Players</span></label><div id="ng-roster"></div>'+
    '<div class="row" style="margin-top:6px">'+
      '<button class="btn btn-ghost btn-sm" id="ng-add">＋ Add player</button>'+
      (memberOptions&&memberOptions.length?'<select class="input" id="ng-addfam" style="width:auto"><option value="">Add from family…</option>'+memberOptions.map(m=>'<option value="'+m.id+'">'+GSK.escapeHtml(m.display_name||m.email)+'</option>').join('')+'</select>':'')+
    '</div>'+
    '<button class="btn btn-emerald" id="ng-create" style="width:100%;margin-top:16px">🎲 Deal me in!</button>';
  const bd=GSK.openModal(html);

  const presetSel=bd.querySelector('#ng-preset'), setWrap=bd.querySelector('#ng-set-wrap'), hintEl=bd.querySelector('#ng-hint');
  const syncPreset=()=>{ const th=GSK_Themes.get(presetSel.value);
    const mt=presetSel.value==='mexican_train'; setWrap.style.display=mt?'':'none';
    bd.querySelector('#ng-name').placeholder=th.namePlaceholder||'Game night';
    bd.querySelector('#ng-win').value=th.defaults.win_condition;
    bd.querySelector('#ng-scoring').value=th.defaults.scoring_mode;
    bd.querySelector('#ng-target').value=th.defaults.target_score===''?'':th.defaults.target_score;
    hintEl.textContent=th.hint||'';
  };
  presetSel.addEventListener('change',syncPreset); syncPreset();

  const rosterEl=bd.querySelector('#ng-roster');
  function renderRoster(){
    rosterEl.innerHTML=roster.map((p,i)=>
      '<div class="roster-row">'+GSK.avatarHtml(p)+
      '<input class="input" data-i="'+i+'" value="'+GSK.escapeHtml(p.name)+'" placeholder="Player '+(i+1)+' name">'+
      '<button class="icon-btn" data-edit="'+i+'" title="Avatar">🎨</button>'+
      '<button class="icon-btn" data-del="'+i+'" title="Remove">✕</button></div>').join('')||
      '<div class="small muted">No players yet — add at least one.</div>';
    rosterEl.querySelectorAll('input[data-i]').forEach(inp=>inp.addEventListener('input',()=>{ roster[+inp.dataset.i].name=inp.value; }));
    rosterEl.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',()=>{ roster.splice(+b.dataset.del,1); renderRoster(); }));
    rosterEl.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>openAvatarEditor(+b.dataset.edit)));
  }
  function openAvatarEditor(i){
    const p=roster[i];
    const m=GSK.openModal(GSK.modalHead('Avatar for '+GSK.escapeHtml(p.name||('Player '+(i+1))))+
      '<label class="field"><span>Emoji</span><div class="picker-row" id="ae-emojis"></div></label>'+
      '<label class="field"><span>Color</span><div class="picker-row" id="ae-colors"></div></label>'+
      '<button class="btn" id="ae-done" style="width:100%;margin-top:10px">Done</button>');
    emojiPicker(m.querySelector('#ae-emojis'),e=>p.avatar_emoji=e);
    colorPicker(m.querySelector('#ae-colors'),c=>p.avatar_color=c);
    m.querySelector('#ae-done').addEventListener('click',()=>{ GSK.closeModal(); renderRoster(); });
  }
  bd.querySelector('#ng-add').addEventListener('click',()=>{
    roster.push({name:'',avatar_emoji:EMOJIS[roster.length%EMOJIS.length],avatar_color:COLORS[roster.length%COLORS.length]}); renderRoster();
  });
  const addFam=bd.querySelector('#ng-addfam');
  if(addFam) addFam.addEventListener('change',()=>{ if(!addFam.value) return;
    const m=memberOptions.find(x=>String(x.id)===addFam.value);
    roster.push({name:m.display_name||m.email.split('@')[0],avatar_emoji:'🙂',avatar_color:COLORS[roster.length%COLORS.length],user_id:m.id});
    addFam.value=''; renderRoster(); });

  bd.querySelector('#ng-create').addEventListener('click',async()=>{
    const name=bd.querySelector('#ng-name').value.trim();
    const players=roster.map(r=>({name:r.name.trim()||'Player',avatar_emoji:r.avatar_emoji,avatar_color:r.avatar_color,user_id:r.user_id})).filter(p=>p.name);
    if(!name){ GSK.toast('Give the game a name','err'); return; }
    if(players.length<1){ GSK.toast('Add at least one player','err'); return; }
    const preset=presetSel.value;
    const body={family_id:familyId,name,game_type:preset,scoring_mode:bd.querySelector('#ng-scoring').value,
      win_condition:bd.querySelector('#ng-win').value,players};
    const t=bd.querySelector('#ng-target').value; if(t) body.target_score=+t;
    if(preset==='mexican_train') body.domino_set=bd.querySelector('#ng-set').value;
    const btn=bd.querySelector('#ng-create'); btn.disabled=true; btn.textContent='Creating…';
    try{ const d=await GSK.api.createGame(body); GSK.closeAllModals(); GSK.toast('Game created!','ok'); location.hash='#/game/'+d.game.id; }
    catch(e){ GSK.toast(e.message,'err'); btn.disabled=false; btn.textContent='🎲 Deal me in!'; }
  });
  renderRoster();
}

/* ---------- shared delete flow ---------- */
async function deleteGameFlow(gameId, after){
  const ok=await GSK.confirmDanger({
    title:'Delete this game?',
    body:'This permanently deletes the game, its rounds, badges earned from it, and its leaderboard impact. This cannot be undone.',
    confirmText:'Delete game'});
  if(!ok) return;
  try{ await GSK.api.deleteGame(gameId); GSK.toast('Game deleted','ok'); if(after) after(); }
  catch(e){ GSK.toast(e.message,'err'); }
}
function wireCardActions(body, refreshFn){
  body.querySelectorAll('.game-card').forEach(c=>c.addEventListener('click',()=>{location.hash='#/game/'+c.dataset.id;}));
  body.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',async e=>{
    e.stopPropagation(); await deleteGameFlow(b.dataset.del, refreshFn);
  }));
}

/* ---------- dashboard render ---------- */
async function render(){
  const view=document.getElementById('view');
  if(!GSK.state.familyId){
    view.innerHTML='<div class="card empty fade-in"><span class="big">👨‍👩‍👧‍👦</span><h2>No family yet</h2><p>Create a family or join one with a room code to start scoring.</p>'+
      '<div class="row" style="justify-content:center"><button class="btn" id="mk-fam">Create family</button><button class="btn btn-ghost" id="jn-fam">Join with code</button></div></div>';
    view.querySelector('#mk-fam').addEventListener('click',createFamilyFlow);
    view.querySelector('#jn-fam').addEventListener('click',joinFamilyFlow);
    return;
  }
  view.innerHTML='<div class="dash-head fade-in"><h1 class="grow" style="margin:0">Game Night</h1>'+
    '<div class="fam-switch"><select class="input" id="fam-sel" style="width:auto">'+GSK.state.families.map(f=>'<option value="'+f.id+'"'+(String(f.id)===String(GSK.state.familyId)?' selected':'')+'>'+GSK.escapeHtml(f.name)+'</option>').join('')+'</select></div></div>'+
    '<div id="dash-body"><div class="empty"><span class="big spin">🎲</span><p>Loading…</p></div></div>';
  view.querySelector('#fam-sel').addEventListener('change',e=>{ GSK.setFamily(e.target.value); render(); });
  const body=view.querySelector('#dash-body');
  try{
    const [games,lb,hist]=await Promise.all([
      GSK.api.games({family_id:GSK.state.familyId}),
      GSK.api.leaderboard(GSK.state.familyId).catch(()=>null),
      GSK.api.history({family_id:GSK.state.familyId}).catch(()=>[]),
    ]);
    const active=games.filter(g=>g.status!=='completed');
    const recent=hist.slice(0,5);
    // resolve player pills for active games (list endpoint carries counts only)
    const pmap={};
    await Promise.all(active.map(async g=>{ try{ const d=await GSK.api.game(g.id); pmap[g.id]=d.players||[]; }catch(e){ pmap[g.id]=[]; } }));
    body.innerHTML=
      '<button class="card cta-banner" id="cta-new"><span class="cta-ico">🎲</span><span><span class="cta-t">Start New Game</span><br><span class="small">Mexican Train, custom scoring & more</span></span></button>'+
      '<h2>Active games</h2>'+
      (active.length?'<div class="games-carousel">'+active.map(g=>gameCard(g,pmap[g.id])).join('')+'</div>':'<div class="card empty"><span class="big">🃏</span><p>No active games. Start one above!</p></div>')+
      '<div class="grid2" style="margin-top:6px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">'+
        '<div class="card"><h3>🏆 Family leaders</h3><div id="dash-lb">'+(lb&&lb.players.length?lb.players.slice(0,3).map((p,i)=>'<div class="list-row">'+GSK.avatarHtml(p)+'<div class="grow"><strong>'+GSK.escapeHtml(p.name)+'</strong><div class="small muted">'+p.wins+' wins · '+Math.round((p.win_rate||0)*100)+'%</div></div><span class="rank-badge rank-'+(i+1)+'">#'+(i+1)+'</span></div>').join(''):'<p class="muted small">No completed games yet.</p>')+'</div><button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="location.hash=\'#/leaders\'">Full leaderboard</button></div>'+
        '<div class="card"><h3>🕘 Recent games</h3>'+(recent.length?recent.map(h=>'<div class="list-row" data-h="'+h.id+'" style="cursor:pointer"><div class="grow"><strong>'+GSK.escapeHtml(h.name)+'</strong><div class="small muted">'+GSK.fmtDate(h.completed_at||h.created_at)+'</div></div><span class="badge green">🏆 '+GSK.escapeHtml(h.winner_name||'?')+'</span></div>').join(''):'<p class="muted small">Nothing finished yet.</p>')+'<button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="location.hash=\'#/history\'">All history</button></div>'+
      '</div>';
    wireCardActions(body, render);
    body.querySelectorAll('[data-h]').forEach(r=>r.addEventListener('click',()=>{location.hash='#/history';}));
    let famMembers=[]; try{ const f=await GSK.api.family(GSK.state.familyId); famMembers=f.members||[]; }catch(e){}
    body.querySelector('#cta-new').addEventListener('click',()=>openNewGameModal(GSK.state.familyId,famMembers));
  }catch(e){ body.innerHTML='<div class="card empty"><span class="big">⚠️</span><p>'+GSK.escapeHtml(e.message)+'</p></div>'; }
}

/* ---------- game list (Games tab) ---------- */
async function renderList(){
  const view=document.getElementById('view');
  view.innerHTML='<div class="dash-head"><h1 class="grow" style="margin:0">Games</h1><button class="btn" id="new-game-btn">＋ New game</button></div><div id="gl-body"><div class="empty"><span class="big spin">🎲</span></div></div>';
  const body=view.querySelector('#gl-body');
  try{
    const games=await GSK.api.games({family_id:GSK.state.familyId});
    const active=games.filter(g=>g.status!=='completed'), done=games.filter(g=>g.status==='completed');
    const pmap={};
    await Promise.all(games.map(async g=>{ try{ const d=await GSK.api.game(g.id); pmap[g.id]=d.players||[]; }catch(e){ pmap[g.id]=[]; } }));
    const card=g=>gameCard(g,pmap[g.id]);
    body.innerHTML='<h2>Active ('+active.length+')</h2>'+(active.length?'<div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">'+active.map(card).join('')+'</div>':'<div class="card empty"><p>No active games.</p></div>')+
      '<h2 style="margin-top:18px">Completed ('+done.length+')</h2>'+(done.length?'<div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">'+done.map(card).join('')+'</div>':'<div class="card empty"><p>None yet.</p></div>');
    wireCardActions(body, renderList);
  }catch(e){ body.innerHTML='<div class="card empty">'+GSK.escapeHtml(e.message)+'</div>'; }
  let famMembers=[]; try{ const f=await GSK.api.family(GSK.state.familyId); famMembers=f.members||[]; }catch(e){}
  view.querySelector('#new-game-btn').addEventListener('click',()=>openNewGameModal(GSK.state.familyId,famMembers));
}

function createFamilyFlow(){
  const m=GSK.openModal(GSK.modalHead('Create family')+
    '<label class="field"><span>Family name</span><input class="input" id="cf-name" placeholder="The Smiths"></label>'+
    '<button class="btn" id="cf-go" style="width:100%">Create</button>');
  m.querySelector('#cf-go').addEventListener('click',async()=>{
    const name=m.querySelector('#cf-name').value.trim(); if(!name){GSK.toast('Name your family','err');return;}
    try{ const d=await GSK.api.createFamily(name); GSK.state.families=await GSK.api.families(); GSK.setFamily(d.family.id); GSK.closeAllModals(); GSK.toast('Family created!','ok'); render(); }
    catch(e){ GSK.toast(e.message,'err'); }
  });
}
function joinFamilyFlow(){
  const m=GSK.openModal(GSK.modalHead('Join family')+
    '<label class="field"><span>Room code</span><input class="input" id="jf-code" placeholder="ABC123" style="text-transform:uppercase;letter-spacing:2px"></label>'+
    '<button class="btn" id="jf-go" style="width:100%">Join</button>');
  m.querySelector('#jf-go').addEventListener('click',async()=>{
    const code=m.querySelector('#jf-code').value.trim().toUpperCase(); if(!code){GSK.toast('Enter a room code','err');return;}
    try{ const d=await GSK.api.joinFamily(code); GSK.state.families=await GSK.api.families(); GSK.setFamily(d.family.id); GSK.closeAllModals(); GSK.toast('Joined '+d.family.name+'!','ok'); render(); }
    catch(e){ GSK.toast(e.message,'err'); }
  });
}

window.GSK_Dashboard={render,renderList,openNewGameModal,createFamilyFlow,joinFamilyFlow,emojiPicker,colorPicker,EMOJIS,COLORS,gameTypeLabel,deleteGameFlow};
})();
