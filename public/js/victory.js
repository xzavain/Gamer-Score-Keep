/* GamerScore Keep — victory modal: confetti, podium, highlights, badges, share card */
(function(){
'use strict';

async function show(completeData, priorG){
  // completeData: {game, standings:[playerIds], badges_awarded:[{badge_key,player_id,player_name}]}
  const {game,standings,badges_awarded}=completeData;
  const byId={}; ((priorG&&priorG.players)||[]).forEach(p=>{ byId[p.id]=p; });
  const players=(standings||[]).map(id=>byId[id]).filter(Boolean);
  const rounds=(priorG&&priorG.rounds)||[];
  const top=players.slice(0,3);
  let catalog=[];
  try{ catalog=await GSK.api.badgeCatalog(); }catch(e){}
  const catByKey={}; catalog.forEach(c=>{ catByKey[c.key]=c; });
  const badgeItems=(badges_awarded||[]).map(b=>Object.assign({},catByKey[b.badge_key]||{name:b.badge_key},b));

  const highlights=computeHighlights(game,players,rounds);

  const html='<div class="victory-modal"><canvas class="confetti-canvas" id="confetti"></canvas>'+
    '<div style="position:relative">'+
    '<div class="crown" style="font-size:3rem">👑</div>'+
    '<h1 style="margin:4px 0">'+GSK.escapeHtml(game.name)+'</h1>'+
    '<div class="muted">Final results · '+GSK.fmtDate(game.completed_at||game.updated_at)+'</div>'+
    '<div class="podium">'+top.map((p,i)=>podiumSpot(p,i)).join('')+'</div>'+
    (players.length>3?'<div class="small muted">'+players.slice(3).map(p=>'#'+(p.rank)+' '+GSK.escapeHtml(p.name)+' ('+p.total+')').join(' · ')+'</div>':'')+
    '<div class="card" style="text-align:left;margin-top:14px"><h3>✨ Highlights</h3>'+highlights+'</div>'+
    (badgeItems.length?'<div class="card" style="text-align:left"><h3>🏅 Badges earned</h3>'+badgeItems.map(b=>'<div class="trophy"><span style="font-size:1.6rem">🏅</span><div><strong>'+GSK.escapeHtml(b.name||b.badge_key)+'</strong><div class="small muted">'+GSK.escapeHtml(b.description||'')+' — '+GSK.escapeHtml(b.player_name||'')+'</div></div></div>').join('')+'</div>':'')+
    '<div class="row" style="margin-top:16px"><button class="btn btn-ghost grow" id="vic-close">Close</button>'+
    '<button class="btn grow" id="vic-share">📤 Share results</button></div>'+
    '</div></div>';
  const bd=GSK.openModal(html);
  runConfetti(bd.querySelector('#confetti'));
  bd.querySelector('#vic-close').addEventListener('click',()=>{ GSK.closeModal(); GSK_Game.refresh(); });
  bd.querySelector('#vic-share').addEventListener('click',()=>shareCard(game,players,highlights));
}

function podiumSpot(p,i){
  const cls=['p1','p2','p3'][i]||'p1';
  return '<div class="podium-spot '+cls+'">'+(i===0?'<div class="crown">👑</div>':'')+
    GSK.avatarHtml(p,'lg')+'<strong>'+GSK.escapeHtml(p.name)+'</strong>'+
    '<div class="podium-bar">'+p.total+'</div></div>';
}

function computeHighlights(game,players,rounds){
  const items=[];
  if(game.created_at&&game.completed_at) items.push(['⏱','Duration',GSK.fmtDuration(new Date(game.completed_at)-new Date(game.created_at))]);
  // biggest single round
  let best=null;
  rounds.forEach(r=>{ Object.entries(r.scores||{}).forEach(([pid,v])=>{ const p=players.find(x=>String(x.id)===String(pid));
    if(p&&(!best||v>best.v)) best={v,p}; }); });
  if(best) items.push(['🔥','Biggest single round',best.v+' by '+best.p.name]);
  // Comeback Kid: biggest rank climb from round 1 to final
  const ck=comebackKid(players,rounds,game.scoring_mode);
  if(ck) items.push(['🚀','Comeback Kid',ck.name+' (climbed '+ck.climb+' spots)']);
  // fewest/most consistent? keep it tight
  if(!items.length) items.push(['🎲','Game complete','Well played, everyone!']);
  return items.map(([ico,t,v])=>'<div class="list-row"><span style="font-size:1.4rem">'+ico+'</span><div><strong>'+t+'</strong><div class="small muted">'+GSK.escapeHtml(String(v))+'</div></div></div>').join('');
}
function rankList(totals,mode){
  const sorted=[...totals].sort((a,b)=>mode==='lowest'?a.total-b.total:b.total-a.total);
  return sorted.map(t=>t.id);
}
function comebackKid(players,rounds,mode){
  if(rounds.length<2||players.length<2) return null;
  const r1=rounds[0], mode2=mode||'lowest';
  const t1=players.map(p=>({id:p.id,total:(r1.scores&&r1.scores[p.id])||0}));
  const fin=players.map(p=>({id:p.id,total:p.total}));
  const r1r=rankList(t1,mode2), fr=rankList(fin,mode2);
  let best=null;
  players.forEach(p=>{ const climb=r1r.indexOf(p.id)-fr.indexOf(p.id); if(climb>0&&(!best||climb>best.climb)) best={name:p.name,climb}; });
  return best;
}

/* ---------- confetti ---------- */
function runConfetti(canvas){
  const dpr=window.devicePixelRatio||1;
  const w=canvas.parentElement.clientWidth, h=canvas.parentElement.clientHeight;
  canvas.width=w*dpr; canvas.height=h*dpr;
  const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
  const colors=['#6366F1','#10B981','#F59E0B','#EF4444','#06B6D4','#EC4899'];
  const parts=Array.from({length:130},()=>({x:Math.random()*w,y:-20-Math.random()*h*.5,s:4+Math.random()*6,
    vy:1.5+Math.random()*2.5,vx:-1+Math.random()*2,c:colors[Math.floor(Math.random()*colors.length)],r:Math.random()*Math.PI,vr:-.1+Math.random()*.2}));
  let frames=0; const maxFrames=320;
  (function tick(){
    ctx.clearRect(0,0,w,h);
    parts.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.r+=p.vr;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.r); ctx.fillStyle=p.c; ctx.fillRect(-p.s/2,-p.s/2,p.s,p.s*.6); ctx.restore(); });
    if(++frames<maxFrames&&document.body.contains(canvas)) requestAnimationFrame(tick);
  })();
}

/* ---------- share card (1200x630) ---------- */
function shareCard(game,players,highlightsHtml){
  const c=document.createElement('canvas'); c.width=1200; c.height=630;
  const x=c.getContext('2d');
  const grd=x.createLinearGradient(0,0,1200,630); grd.addColorStop(0,'#141824'); grd.addColorStop(1,'#0D0F12');
  x.fillStyle=grd; x.fillRect(0,0,1200,630);
  x.strokeStyle='rgba(99,102,241,.5)'; x.lineWidth=3; x.strokeRect(24,24,1152,582);
  x.textAlign='center';
  x.font='90px sans-serif'; x.fillText('🎲',600,140);
  x.fillStyle='#fff'; x.font='800 64px sans-serif';
  x.fillText('GamerScore Keep',600,220);
  x.fillStyle='#9AA3B2'; x.font='500 40px sans-serif';
  const nm=game.name.length>34?game.name.slice(0,33)+'…':game.name;
  x.fillText(nm,600,285);
  const top=players.slice(0,3);
  const medals=['🥇','🥈','🥉'];
  const cols=[380,600,820];
  top.forEach((p,i)=>{
    x.font='64px sans-serif'; x.fillText(medals[i],cols[i],400);
    x.fillStyle='#fff'; x.font='800 44px sans-serif';
    const n=p.name.length>12?p.name.slice(0,11)+'…':p.name;
    x.fillText(n,cols[i],455);
    x.fillStyle='#10B981'; x.font='800 52px sans-serif'; x.fillText(String(p.total),cols[i],520);
  });
  x.fillStyle='#6366F1'; x.font='600 30px sans-serif';
  x.fillText('Family game night · scored with GamerScore Keep',600,580);
  c.toBlob(async blob=>{
    const file=new File([blob],'gamerscore-results.png',{type:'image/png'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      try{ await navigator.share({files:[file],title:'GamerScore Keep results'}); return; }catch(e){ if(e.name==='AbortError')return; }
    }
    // fallback: download
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='gamerscore-results.png'; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    GSK.toast('Share card downloaded','ok');
  },'image/png');
}

window.GSK_Victory={show};
})();
