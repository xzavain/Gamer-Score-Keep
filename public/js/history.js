/* GamerScore Keep — history: filterable archive with expandable game detail */
(function(){
'use strict';
let cache=[], openId=null, filters={};

async function render(){
  const view=document.getElementById('view');
  view.innerHTML='<div class="dash-head"><h1 class="grow" style="margin:0">History</h1></div>'+
    '<div class="card"><div class="filters">'+
      '<input class="input" type="date" id="hf-from" title="From date"><input class="input" type="date" id="hf-to" title="To date">'+
      '<select class="input" id="hf-type"><option value="">All types</option>'+
        GSK_Themes.PRESET_ORDER.map(t=>{ const th=GSK_Themes.get(t); return '<option value="'+t+'">'+th.emoji+' '+GSK.escapeHtml(th.name)+'</option>'; }).join('')+
      '</select>'+
      '<input class="input" id="hf-winner" placeholder="Winner name…">'+
      '<button class="btn btn-ghost btn-sm" id="hf-clear">Clear</button>'+
    '</div><div id="hist-list"></div></div>';
  const list=view.querySelector('#hist-list');
  const applyFilters=()=>{
    filters={from:view.querySelector('#hf-from').value,to:view.querySelector('#hf-to').value,
      game_type:view.querySelector('#hf-type').value,winner:view.querySelector('#hf-winner').value.trim()};
    load();
  };
  ['#hf-from','#hf-to','#hf-type'].forEach(s=>view.querySelector(s).addEventListener('change',applyFilters));
  let deb; view.querySelector('#hf-winner').addEventListener('input',()=>{clearTimeout(deb);deb=setTimeout(applyFilters,400);});
  view.querySelector('#hf-clear').addEventListener('click',()=>{ view.querySelector('#hf-from').value='';view.querySelector('#hf-to').value='';view.querySelector('#hf-type').value='';view.querySelector('#hf-winner').value=''; applyFilters(); });
  load();

  async function load(){
    list.innerHTML='<div class="empty"><span class="big spin">🎲</span></div>';
    const q={family_id:GSK.state.familyId};
    if(filters.from)q.from=filters.from; if(filters.to)q.to=filters.to;
    if(filters.game_type)q.game_type=filters.game_type;
    // winner filter is free text: filter client-side by winner_name (no player id available here)
    try{
      let data=await GSK.api.history(q);
      cache=data||[];
      if(filters.winner) cache=cache.filter(h=>(h.winner_name||'').toLowerCase().includes(filters.winner.toLowerCase()));
      paintList();
    }catch(e){ list.innerHTML='<div class="empty">'+GSK.escapeHtml(e.message)+'</div>'; }
  }
  function paintList(){
    if(!cache.length){ list.innerHTML='<div class="empty"><span class="big">🕘</span><p>No games match those filters.</p></div>'; return; }
    list.innerHTML=cache.map(h=>{
      const th=GSK_Themes.get(h.game_type);
      return '<div class="list-row hist-item" data-h="'+h.id+'"><div class="grow"><strong>'+th.emoji+' '+GSK.escapeHtml(h.name)+'</strong>'+
      '<div class="small muted">'+GSK.fmtDate(h.completed_at||h.created_at)+' · '+GSK.escapeHtml(th.name)+' · '+(h.rounds&&h.rounds.length?h.rounds.length+' rounds':'')+'</div></div>'+
      (h.winner_name?'<span class="badge green">🏆 '+GSK.escapeHtml(h.winner_name)+'</span>':'')+
      '<button class="icon-btn" data-hdel="'+h.id+'" title="Delete game" style="flex:none">🗑</button>'+
      '<span class="muted">'+(String(openId)===String(h.id)?'▲':'▼')+'</span></div>'+
      (String(openId)===String(h.id)?'<div class="hist-detail" id="hist-detail"></div>':'');
    }).join('');
    list.querySelectorAll('.hist-item').forEach(r=>r.addEventListener('click',async(e)=>{
      if(e.target.closest('[data-hdel]')) return;
      openId=String(openId)===r.dataset.h?null:r.dataset.h; paintList();
      if(openId) await loadDetail(list.querySelector('#hist-detail'),openId);
    }));
    list.querySelectorAll('[data-hdel]').forEach(b=>b.addEventListener('click',async e=>{
      e.stopPropagation();
      await GSK_Dashboard.deleteGameFlow(b.dataset.hdel, ()=>{ openId=null; load(); });
    }));
    if(openId&&list.querySelector('#hist-detail')) loadDetail(list.querySelector('#hist-detail'),openId);
  }
  async function loadDetail(el,id){
    el.innerHTML='<div class="small muted">Loading detail…</div>';
    try{
      const d=await GSK.api.game(id);
      const players=d.players||[], rounds=d.rounds||[], engines=(d.engines||[]).filter(e=>e.played);
      el.innerHTML='<div class="sk-split"><div>'+
        '<h3>Round breakdown</h3><div class="score-grid"><table class="scores"><thead><tr><th>Rd</th>'+players.map(p=>'<th>'+GSK.escapeHtml(p.name)+'</th>').join('')+'</tr></thead><tbody>'+
        rounds.map(r=>'<tr><td class="round-cell">R'+r.round_number+'</td>'+players.map(p=>'<td>'+(r.scores&&r.scores[p.id]!=null?r.scores[p.id]:'<span class="muted">–</span>')+'</td>').join('')+'</tr>').join('')+
        '<tr style="font-weight:800;border-top:2px solid var(--line)"><td>Total</td>'+players.map(p=>'<td>'+p.total+'</td>').join('')+'</tr>'+
        '</tbody></table></div>'+
        (engines.length?'<h3 style="margin-top:12px">🚂 Engines played</h3><div class="row" style="flex-wrap:wrap;gap:6px">'+engines.map(e=>'<span class="badge">Double '+e.double_value+(e.round_number!=null?' · R'+e.round_number:'')+'</span>').join('')+'</div>':'')+
        '</div><div class="chart-wrap"><h3>📈 Trajectory</h3><canvas></canvas></div></div>';
      GSK_Charts.drawTrajectory(el.querySelector('canvas'),rounds,players);
    }catch(e){ el.innerHTML='<div class="small muted">'+GSK.escapeHtml(e.message)+'</div>'; }
  }
}
window.GSK_History={render};
})();
