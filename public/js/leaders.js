/* GamerScore Keep — leaders: full leaderboard, head-to-head matrix, streaks */
(function(){
'use strict';
async function render(){
  const view=document.getElementById('view');
  view.innerHTML='<div class="dash-head"><h1 class="grow" style="margin:0">Leaderboard</h1></div><div id="lb-body"><div class="card empty"><span class="big spin">🎲</span></div></div>';
  const body=view.querySelector('#lb-body');
  try{
    const d=await GSK.api.leaderboard(GSK.state.familyId);
    const players=(d.players||[]).slice().sort((a,b)=>(b.wins-a.wins)||((b.win_rate||0)-(a.win_rate||0)));
    const h2h=d.head_to_head||[];
    body.innerHTML=
      '<div class="card"><h3>🏆 Standings</h3><div style="overflow-x:auto"><table class="table"><thead><tr><th>#</th><th>Player</th><th>W</th><th>GP</th><th>Win %</th><th>Avg score</th><th>Streak</th></tr></thead><tbody>'+
      (players.length?players.map((p,i)=>'<tr><td><span class="rank-badge rank-'+(i+1)+'">#'+(i+1)+'</span></td>'+
        '<td><div class="row">'+GSK.avatarHtml(p)+'<strong>'+GSK.escapeHtml(p.name)+'</strong></div></td>'+
        '<td>'+p.wins+'</td><td>'+p.games+'</td><td>'+Math.round((p.win_rate||0)*100)+'%</td>'+
        '<td>'+(p.avg_score!=null?Math.round(p.avg_score*10)/10:'–')+'</td>'+
        '<td>'+streakBadge(p.streak)+'</td></tr>').join(''):'<tr><td colspan="7" class="muted">No completed games yet.</td></tr>')+
      '</tbody></table></div></div>'+
      '<div class="card"><h3>⚔️ Head-to-head</h3><div class="h2h"><table class="table">'+
      '<thead><tr><th></th>'+players.map(p=>'<th>'+GSK.escapeHtml(p.name)+'</th>').join('')+'</tr></thead><tbody>'+
      players.map(a=>'<tr><th style="text-align:left">'+GSK.escapeHtml(a.name)+'</th>'+players.map(b=>{
        if(a.key===b.key||a.name===b.name) return '<td class="muted">–</td>';
        const m=h2h.find(x=>(x.a===a.key&&x.b===b.key)||(x.a===a.name&&x.b===b.name));
        if(!m) return '<td class="muted">0–0</td>';
        const aw=(m.a===a.key||m.a===a.name)?m.a_wins:m.b_wins, bw=(m.a===a.key||m.a===b.name)?m.b_wins:m.a_wins;
        return '<td><strong>'+aw+'</strong><span class="muted">–'+bw+'</span></td>';
      }).join('')+'</tr>').join('')+'</tbody></table></div>'+
      '<div class="small muted" style="margin-top:8px">Rows show wins vs each column opponent.</div></div>';
  }catch(e){ body.innerHTML='<div class="card empty">'+GSK.escapeHtml(e.message)+'</div>'; }
}
function streakBadge(s){
  if(!s) return '<span class="muted">–</span>';
  const n=Math.abs(s);
  return s>0?'<span class="badge green">🔥 W'+n+'</span>':'<span class="badge">L'+n+'</span>';
}
window.GSK_Leaders={render};
})();
