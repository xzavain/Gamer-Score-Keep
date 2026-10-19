/* GamerScore Keep — scorekeeper: grid, rounds, quick-tap, turns, SSE live sync */
(function(){
'use strict';
let G=null;            // full game payload {game,players,rounds,engines,...}
let es=null, backoff=1000, esTimer=null;
let pendingScores={};  // current round-entry values {playerId: value}
let qtPlayer=null;     // selected player for pip calc apply

function sortedPlayers(){ return [...(G.players||[])].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)); }
function isMexican(){ return G && G.game && G.game.game_type==='mexican_train'; }
function scoringMode(){ return (G&&G.game&&G.game.scoring_mode)||'rounds'; }
function rankOf(total){
  // fallback rank computation if backend didn't provide
  const vals=G.players.map(p=>p.total);
  const sorted=[...vals].sort((a,b)=>scoringMode()==='lowest'?a-b:b-a);
  return sorted.indexOf(total)+1;
}

async function render(id){
  const view=document.getElementById('view');
  view.innerHTML='<div class="empty"><span class="big spin">🎲</span><p>Loading game…</p></div>';
  try{ G=await GSK.api.game(id); }
  catch(e){ view.innerHTML='<div class="card empty"><span class="big">⚠️</span><p>'+GSK.escapeHtml(e.message)+'</p><button class="btn btn-ghost" onclick="location.hash=\'#/dashboard\'">Back</button></div>'; return; }
  pendingScores={};
  paint();
  openStream(id);
  attachKeys();
  GSK.onTeardown(()=>{ closeStream(); document.removeEventListener('keydown',keyHandler); });
}

function paint(){
  const view=document.getElementById('view');
  const g=G.game, rounds=G.rounds||[];
  const players=[...(G.players||[])].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  const isDone=g.status==='completed';
  const me=GSK.state.user;
  const isKeeper=!g.scorekeeper_user_id||String(g.scorekeeper_user_id)===String(me&&me.id);
  const th=GSK_Themes.get(g.game_type);
  const fmtV=th.money?GSK.fmtMoney:(v=>v);
  const editable=!isDone&&scoringMode()==='rounds';
  const isMonopoly=g.game_type==='monopoly';

  const turnPlayer=players[g.turn_index%Math.max(players.length,1)];
  const dealer=players[g.dealer_index%Math.max(players.length,1)];

  view.innerHTML=
  '<div class="sk-banner fade-in" style="--theme-c:'+th.color+'">'+
    '<span class="sk-banner-ico">'+th.emoji+'</span>'+
    '<div class="grow"><strong style="font-size:1.15rem">'+GSK.escapeHtml(g.name)+'</strong>'+
    '<div class="small muted">'+GSK.escapeHtml(th.name)+(g.target_score?' · target '+g.target_score:'')+(g.domino_set?' · '+g.domino_set:'')+'</div>'+
    (th.hint&&!isDone?'<div class="small" style="margin-top:4px;opacity:.92">'+GSK.escapeHtml(th.hint)+'</div>':'')+'</div>'+
    (th.badge?'<span class="no-mercy-badge">'+th.badge+'</span>':'')+
    (turnPlayer&&!isDone?'<span class="turn-pill">🎯 '+GSK.escapeHtml(turnPlayer.name)+'\'s turn</span>':'')+
  '</div>'+
  '<div class="sk-head"><div class="sk-title-row">'+
    '<button class="icon-btn" onclick="location.hash=\'#/dashboard\'" title="Back">←</button>'+
    '<div class="grow small muted">'+(isDone?'Completed game':'Scorekeeper')+(editable?' · <span title="Tap any round score to correct it">✏️ tap a score to edit</span>':'')+'</div>'+
  '</div><div class="sk-actions" style="margin-top:10px">'+
    (isDone?'<span class="badge green">Completed</span>':
      (g.status==='paused'?'<button class="btn btn-sm" id="sk-resume">▶ Resume</button>':'<button class="btn btn-ghost btn-sm" id="sk-pause">⏸ Pause</button>')+
      '<button class="btn btn-ghost btn-sm" id="sk-turn">⏭ Next turn</button>'+
      (isKeeper?'':'<button class="btn btn-ghost btn-sm" id="sk-takeover">✋ Take over scoring</button>')+
      '<button class="btn btn-emerald btn-sm" id="sk-round">＋ Enter round</button>'+
      '<button class="btn btn-sm" id="sk-complete">🏁 Complete</button>')+
    '<button class="btn btn-ghost btn-sm" id="sk-toolkit">🧰 Toolkit</button>'+
    '<button class="btn btn-ghost btn-sm" id="sk-delete" title="Delete game">🗑</button>'+
  '</div></div>'+

  '<div class="sk-split">'+
    '<div>'+
      '<div class="card"><h3>Scoreboard</h3><div class="score-grid"><table class="scores"><thead><tr><th>Round</th>'+
        players.map(p=>'<th class="'+(p.eliminated?'p-elim':'')+'"><div class="player-head">'+GSK.avatarHtml(p)+
          '<span>'+GSK.escapeHtml(p.name)+(p.eliminated?' 💀':'')+'</span>'+
          '<span class="row" style="gap:4px">'+
            (isMexican()?'<button class="train-btn '+(p.train_open?'open':'')+'" data-train="'+p.id+'" title="Toggle train">🚂</button>':'')+
            (isMonopoly&&!isDone?'<button class="elim-btn '+(p.eliminated?'on':'')+'" data-elim="'+p.id+'" title="Toggle eliminated (bankrupt)">💀</button>':'')+
            (dealer&&dealer.id===p.id?'<span class="badge gold" title="Dealer">🃏</span>':'')+
          '</span></div></th>').join('')+
      '</tr></thead><tbody>'+
        rounds.map(r=>'<tr><td class="round-cell">R'+r.round_number+'</td>'+players.map(p=>'<td class="'+(editable?'score-edit':'')+'"'+(editable?' data-rn="'+r.round_number+'" data-pid="'+p.id+'" title="Tap to edit this score"':'')+'>'+scoreCell(r.scores&&r.scores[p.id],fmtV)+'</td>').join('')+'</tr>').join('')+
        '<tr style="font-weight:800;border-top:2px solid var(--line)"><td>Total</td>'+players.map(p=>'<td>'+fmtV(p.total)+'</td>').join('')+'</tr>'+
        '<tr><td class="muted small">Rank</td>'+players.map(p=>{const rk=p.rank||rankOf(p.total);return '<td><span class="rank-badge rank-'+rk+'">'+(p.eliminated?'💀':'#'+rk)+'</span></td>';}).join('')+'</tr>'+
      '</tbody></table></div></div>'+

      (isDone?'':'<div class="card"><h3>⚡ Quick tap</h3><div class="quicktap-grid">'+
        players.map(p=>'<div class="card quicktap-card" style="margin:0">'+GSK.avatarHtml(p)+'<div><strong>'+GSK.escapeHtml(p.name)+'</strong></div>'+
          '<div class="score-pill">'+fmtV(p.total)+'</div><div class="qt-btns">'+
          [1,5,10].map(v=>'<button class="qt-btn" data-qt="'+p.id+':'+v+'">+'+v+'</button>').join('')+
          '<button class="qt-btn" data-qtc="'+p.id+'">±</button></div></div>').join('')+'</div></div>')+
    '</div>'+
    '<div>'+
      (isMexican()?'<div class="card"><div class="row"><h3 class="grow" style="margin:0">🚂 Engines</h3><span class="small muted">tap a tile to toggle</span></div><div id="engine-grid" style="margin-top:10px"></div></div>':'')+
      (isMexican()?'<div class="card"><h3>🧮 Quick-pip calculator</h3><div id="pipcalc"></div></div>':'')+
      '<div class="card chart-wrap"><h3>📈 Trajectory</h3><canvas id="traj"></canvas></div>'+
    '</div>'+
  '</div>';

  // engines + pip calc delegated to dominoes module
  if(isMexican()){ GSK_Dominoes.renderEngines(document.getElementById('engine-grid'),G,refresh); GSK_Dominoes.renderPipCalc(document.getElementById('pipcalc'),players,v=>applyPip(v)); }
  GSK_Charts.drawTrajectory(view.querySelector('#traj'),rounds,players);

  // wire buttons
  if(!isDone){
    const q=s=>view.querySelector(s);
    const pauseBtn=q('#sk-pause'), resumeBtn=q('#sk-resume');
    if(pauseBtn) pauseBtn.addEventListener('click',()=>mutate('PUT',{status:'paused'},'Paused'));
    if(resumeBtn) resumeBtn.addEventListener('click',()=>mutate('PUT',{status:'active'},'Resumed'));
    q('#sk-turn').addEventListener('click',async()=>{ try{ await GSK.api.nextTurn(g.id); toast2('Turn advanced'); }catch(e){ toast2(e.message,'err'); } });
    const to=q('#sk-takeover'); if(to) to.addEventListener('click',()=>mutate('PUT',{scorekeeper_user_id:GSK.state.user.id},'You are now scorekeeper'));
    q('#sk-round').addEventListener('click',openRoundEntry);
    q('#sk-complete').addEventListener('click',confirmComplete);
    view.querySelectorAll('[data-train]').forEach(b=>b.addEventListener('click',async()=>{
      const pid=b.dataset.train; const p=players.find(x=>String(x.id)===String(pid));
      try{ await GSK.api.updatePlayer(g.id,pid,{train_open:!p.train_open}); }catch(e){ toast2(e.message,'err'); }
    }));
    view.querySelectorAll('[data-elim]').forEach(b=>b.addEventListener('click',async()=>{
      const pid=b.dataset.elim; const p=players.find(x=>String(x.id)===String(pid));
      try{ await GSK.api.updatePlayer(g.id,pid,{eliminated:!p.eliminated}); toast2(p.eliminated?p.name+' is back in!':p.name+' eliminated 💀','ok'); }
      catch(e){ toast2(e.message,'err'); }
    }));
    view.querySelectorAll('.score-edit').forEach(td=>td.addEventListener('click',()=>openRoundEdit(+td.dataset.rn)));
    view.querySelectorAll('[data-qt]').forEach(b=>b.addEventListener('click',async()=>{
      const [pid,v]=b.dataset.qt.split(':');
      try{ await GSK.api.tap(g.id,pid,+v); }catch(e){ toast2(e.message,'err'); }
    }));
    view.querySelectorAll('[data-qtc]').forEach(b=>b.addEventListener('click',()=>{
      const pid=b.dataset.qtc;
      const m=GSK.openModal(GSK.modalHead('Custom points')+'<label class="field"><span>Points (use negative to subtract)</span><input class="input" id="cq-v" type="number" style="font-size:1.4rem;text-align:center"></label><button class="btn" id="cq-go" style="width:100%">Apply</button>');
      m.querySelector('#cq-v').focus();
      m.querySelector('#cq-go').addEventListener('click',async()=>{
        const v=+m.querySelector('#cq-v').value; if(!v){GSK.toast('Enter points','err');return;}
        try{ await GSK.api.tap(g.id,pid,v); GSK.closeModal(); }catch(e){ GSK.toast(e.message,'err'); }
      });
    }));
  }
  view.querySelector('#sk-toolkit').addEventListener('click',()=>GSK_Toolkit.open());
  view.querySelector('#sk-delete').addEventListener('click',async()=>{
    await GSK_Dashboard.deleteGameFlow(g.id, ()=>{ location.hash='#/dashboard'; });
  });
}

function scoreCell(v,fmt){ if(v===undefined||v===null||v==='')return '<span class="muted">–</span>'; const f=fmt||(x=>x); return GSK.escapeHtml(f(v)); }
function gameTypeLabel2(t){ return GSK_Themes.get(t).name; }
function toast2(m,k){ GSK.toast(m,k); }

async function mutate(kind,body,msg){
  try{ if(kind==='PUT') await GSK.api.updateGame(G.game.id,body); if(msg)toast2(msg,'ok'); }
  catch(e){ toast2(e.message,'err'); }
}
async function refresh(){ try{ G=await GSK.api.game(G.game.id); paint(); }catch(e){} }

/* ---------- edit a previously entered round ---------- */
function openRoundEdit(rn){
  const players=sortedPlayers();
  const round=(G.rounds||[]).find(r=>r.round_number===rn);
  const html=GSK.modalHead('Edit round '+rn)+
    '<div class="round-entry-grid">'+players.map(p=>{
      const cur=round&&round.scores&&round.scores[p.id]!=null?round.scores[p.id]:'';
      return '<div class="re-field"><div class="row" style="justify-content:center">'+GSK.avatarHtml(p)+'</div>'+
        '<input class="input re-input" data-pid="'+p.id+'" inputmode="numeric" value="'+cur+'">'+
        '<div class="small muted" style="text-align:center">'+GSK.escapeHtml(p.name)+'</div></div>';
    }).join('')+'</div>'+
    '<div class="small muted" style="margin:10px 0">✏️ Edits are logged and synced to all family devices instantly.</div>'+
    '<button class="btn btn-emerald" id="re-save" style="width:100%">Save changes</button>';
  const bd=GSK.openModal(html);
  bd.querySelector('#re-save').addEventListener('click',async()=>{
    const scores={};
    bd.querySelectorAll('.re-input').forEach(inp=>{ const v=inp.value.trim(); scores[inp.dataset.pid]=v===''?'0':String(+v||0); });
    const btn=bd.querySelector('#re-save'); btn.disabled=true; btn.textContent='Saving…';
    try{
      const d=await GSK.api.updateRoundScores(G.game.id,rn,scores);
      GSK.closeModal();
      toast2(d.changes&&d.changes.length?('Round '+rn+' updated ('+d.changes.length+' change'+(d.changes.length>1?'s':'')+')'):'No changes','ok');
      refresh();
    }catch(e){ toast2(e.message,'err'); btn.disabled=false; btn.textContent='Save changes'; }
  });
}

/* ---------- round entry (modal desktop / sheet mobile) ---------- */
function openRoundEntry(){
  const players=sortedPlayers();
  const isMobile=window.innerWidth<768;
  const html='<div class="modal-head"><h2 style="margin:0">Enter round '+(G.rounds.length+1)+'</h2>'+
    (isMobile?'':'<button class="icon-btn" onclick="GSK.closeModal()" aria-label="Close">✕</button>')+
    (isMobile?'<button class="icon-btn" onclick="GSK.closeSheet()" aria-label="Close">✕</button>':'')+'</div>'+
    (G.game.game_type==='bingo'?'<div class="card" style="margin-bottom:12px"><div class="small" style="margin-bottom:8px">👑 <strong>Round winner</strong> — tap to award 1 point</div><div class="row" style="flex-wrap:wrap">'+players.map(p=>'<button class="btn btn-ghost btn-sm" data-winner="'+p.id+'">'+GSK.avatarHtml(p)+'&nbsp;'+GSK.escapeHtml(p.name)+'</button>').join('')+'</div></div>':'')+
    '<div class="round-entry-grid">'+players.map((p,i)=>'<div class="re-field" data-rf="'+p.id+'">'+
      '<div class="row" style="justify-content:center">'+GSK.avatarHtml(p)+'</div>'+
      '<input class="input re-input" data-pid="'+p.id+'" data-idx="'+i+'" inputmode="numeric" pattern="-?[0-9]*" placeholder="0" value="'+(pendingScores[p.id]??'')+'">'+
      '<div class="small muted" style="text-align:center">'+GSK.escapeHtml(p.name)+'</div></div>').join('')+'</div>'+
    '<div class="small muted" style="margin:10px 0">⌨️ Keys 1–'+Math.min(players.length,9)+' jump between players · Enter moves on · Ctrl+Enter submits</div>'+
    '<button class="btn btn-emerald" id="re-submit" style="width:100%">Submit round</button>';
  const bd=isMobile?GSK.openSheet(html):GSK.openModal(html);
  const inputs=[...bd.querySelectorAll('.re-input')];
  inputs.forEach(inp=>{
    inp.addEventListener('input',()=>{ pendingScores[inp.dataset.pid]=inp.value; });
    inp.addEventListener('focus',()=>{ inp.closest('.re-field').classList.add('focused'); });
    inp.addEventListener('blur',()=>{ inp.closest('.re-field').classList.remove('focused'); });
    inp.addEventListener('keydown',e=>{
      if(e.key==='Enter'&&!e.ctrlKey){ e.preventDefault(); const n=inputs[+inp.dataset.idx+1]; (n||bd.querySelector('#re-submit')).focus(); }
      if(e.key==='Enter'&&e.ctrlKey){ e.preventDefault(); submitRound(); }
    });
  });
  bd._reInputs=inputs;
  bd.querySelector('#re-submit').addEventListener('click',submitRound);
  bd.querySelectorAll('[data-winner]').forEach(b=>b.addEventListener('click',()=>{
    const pid=b.dataset.winner;
    players.forEach(p=>{ pendingScores[p.id]=String(p.id)===String(pid)?1:0; });
    bd.querySelectorAll('.re-input').forEach(inp=>{ inp.value=pendingScores[inp.dataset.pid]; });
    toast2('👑 Winner marked — submit the round','ok');
  }));
  if(inputs[0]) setTimeout(()=>inputs[0].focus(),80);
  window._reSheet=bd;
}
async function submitRound(){
  const players=sortedPlayers();
  const scores={};
  players.forEach(p=>{ const raw=pendingScores[p.id]; const v=raw===''||raw==null?0:parseInt(raw,10); scores[p.id]=isNaN(v)?0:v; });
  const bd=window._reSheet; const btn=bd&&bd.querySelector('#re-submit');
  if(btn){btn.disabled=true;btn.textContent='Submitting…';}
  try{
    await GSK.api.submitRound(G.game.id,scores);
    pendingScores={};
    if(window.innerWidth<768) GSK.closeSheet(); else GSK.closeModal();
    toast2('Round '+(G.rounds.length+1)+' scored!','ok');
  }catch(e){ toast2(e.message,'err'); if(btn){btn.disabled=false;btn.textContent='Submit round';} }
}
function applyPip(sum){
  // "Apply to <selected player>" — pip calc asks which player
  const players=sortedPlayers();
  if(!players.length) return;
  if(!qtPlayer||!players.some(p=>String(p.id)===String(qtPlayer))) qtPlayer=players[0].id;
  const m=GSK.openModal(GSK.modalHead('Apply '+sum+' pips')+
    '<div class="picker-row" style="flex-direction:column;align-items:stretch">'+players.map(p=>'<button class="btn btn-ghost" data-ap="'+p.id+'" style="justify-content:flex-start">'+GSK.avatarHtml(p)+'&nbsp; '+GSK.escapeHtml(p.name)+'</button>').join('')+'</div>');
  m.querySelectorAll('[data-ap]').forEach(b=>b.addEventListener('click',()=>{
    qtPlayer=b.dataset.ap; pendingScores[qtPlayer]=sum;
    GSK.closeModal(); openRoundEntry();
    toast2('Filled '+sum+' for player','ok');
  }));
}

/* ---------- complete ---------- */
function confirmComplete(){
  const m=GSK.openModal(GSK.modalHead('Finish game?')+
    '<p>Complete <strong>'+GSK.escapeHtml(G.game.name)+'</strong> and crown a winner?</p>'+
    '<div class="row"><button class="btn btn-ghost grow" id="cc-no">Keep playing</button><button class="btn btn-emerald grow" id="cc-yes">🏁 Complete</button></div>');
  m.querySelector('#cc-no').addEventListener('click',()=>GSK.closeModal());
  m.querySelector('#cc-yes').addEventListener('click',async()=>{
    m.querySelector('#cc-yes').disabled=true;
    try{ const d=await GSK.api.completeGame(G.game.id); GSK.closeAllModals(); GSK_Victory.show(d,G); }
    catch(e){ GSK.toast(e.message,'err'); GSK.closeModal(); }
  });
}

/* ---------- SSE live sync ---------- */
function openStream(id){
  closeStream(); backoff=1000;
  const dot=document.getElementById('live-dot');
  const connect=()=>{
    try{ es=GSK.api.stream(id); }catch(e){ schedule(); return; }
    es.addEventListener('game_update',e=>{
      try{ const data=JSON.parse(e.data);
        // backend sends full game JSON as the event payload
        G=data.game?data:(data.payload||data);
        if(G&&G.game) paint();
      }catch(err){}
    });
    es.onopen=()=>{ dot.classList.remove('hidden'); backoff=1000; };
    es.onerror=()=>{ dot.classList.add('hidden'); try{es.close();}catch(e){} schedule(); };
  };
  const schedule=()=>{ clearTimeout(esTimer); esTimer=setTimeout(connect,backoff); backoff=Math.min(backoff*2,30000); };
  connect();
  GSK.onTeardown(()=>closeStream());
}
function closeStream(){ if(es){try{es.close();}catch(e){} es=null;} clearTimeout(esTimer); }

/* ---------- keyboard shortcuts (desktop) ---------- */
function keyHandler(e){
  const bd=window._reSheet;
  if(!bd||!document.body.contains(bd)) return;
  const inputs=bd._reInputs||[];
  if(/^[1-9]$/.test(e.key)&&!e.ctrlKey&&!e.metaKey){
    const i=+e.key-1; if(inputs[i]){ e.preventDefault(); inputs[i].focus(); inputs[i].select(); }
  }
}
function attachKeys(){ document.addEventListener('keydown',keyHandler); }

window.GSK_Game={render,refresh};
})();
