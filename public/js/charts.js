/* GamerScore Keep — trajectory chart (canvas): cumulative score per player across rounds */
(function(){
'use strict';
const PALETTE=['#6366F1','#10B981','#F59E0B','#EF4444','#06B6D4','#EC4899','#8B5CF6','#F97316'];

function cumulativeSeries(rounds, players){
  // rounds: [{round_number, scores:{playerId:points}}]; players: [{id,name,...}]
  const totals={}; players.forEach(p=>totals[p.id]=0);
  const series=players.map(p=>({player:p, points:[0]}));
  const sorted=[...rounds].sort((a,b)=>a.round_number-b.round_number);
  sorted.forEach(r=>{ series.forEach(s=>{ const v=(r.scores&&r.scores[s.player.id])||0; totals[s.player.id]+=Number(v)||0; s.points.push(totals[s.player.id]); }); });
  return {series, labels:sorted.map(r=>'R'+r.round_number)};
}

function drawTrajectory(canvas, rounds, players, opts){
  opts=opts||{};
  const dpr=window.devicePixelRatio||1;
  const cssW=canvas.clientWidth||canvas.parentElement.clientWidth||300;
  const cssH=opts.height||220;
  canvas.width=cssW*dpr; canvas.height=cssH*dpr;
  const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,cssW,cssH);
  const {series}=cumulativeSeries(rounds, players);
  const padL=44,padR=12,padT=14,padB=26;
  const W=cssW-padL-padR, H=cssH-padT-padB;
  if(!series.length||!series[0].points.length){ ctx.fillStyle='#9AA3B2'; ctx.font='12px sans-serif'; ctx.fillText('No rounds yet',padL,padT+20); return; }
  let min=Infinity,max=-Infinity;
  series.forEach(s=>s.points.forEach(v=>{ if(v<min)min=v; if(v>max)max=v; }));
  if(min===max){ min-=5; max+=5; }
  const pad=(max-min)*0.08||1; min-=pad; max+=pad;
  const X=i=>padL+W*i/(series[0].points.length-1||1);
  const Y=v=>padT+H*(1-(v-min)/(max-min));
  const dark=document.documentElement.getAttribute('data-theme')!=='light';
  const gridCol=dark?'rgba(255,255,255,.08)':'rgba(0,0,0,.08)';
  const txtCol=dark?'#9AA3B2':'#5B6472';
  // gridlines + y labels
  ctx.strokeStyle=gridCol; ctx.fillStyle=txtCol; ctx.font='10px sans-serif'; ctx.lineWidth=1;
  for(let g=0; g<=4; g++){ const v=min+(max-min)*g/4; const y=Y(v);
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(padL+W,y); ctx.stroke();
    ctx.fillText(Math.round(v),6,y+3); }
  // x labels
  series[0].points.forEach((_,i)=>{ if(i%Math.ceil(series[0].points.length/8)===0||i===series[0].points.length-1){ ctx.fillText(i===0?'Start':'R'+i, X(i)-8, cssH-8); } });
  // lines
  series.forEach((s,idx)=>{
    const col=PALETTE[idx%PALETTE.length];
    ctx.strokeStyle=col; ctx.lineWidth=2.4; ctx.lineJoin='round'; ctx.beginPath();
    s.points.forEach((v,i)=>{ const x=X(i),y=Y(v); i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
    ctx.stroke();
    s.points.forEach((v,i)=>{ ctx.fillStyle=col; ctx.beginPath(); ctx.arc(X(i),Y(v),3,0,7); ctx.fill(); });
  });
  if(opts.legend!==false){
    const lg=document.createElement('div'); lg.className='legend';
    series.forEach((s,idx)=>{ const col=PALETTE[idx%PALETTE.length];
      const d=document.createElement('span'); d.innerHTML='<i style="background:'+col+'"></i>'+GSK.escapeHtml(s.player.name); lg.appendChild(d); });
    const wrap=canvas.parentElement; const old=wrap.querySelector('.legend'); if(old) old.remove(); wrap.appendChild(lg);
  }
}
window.GSK_Charts={drawTrajectory,cumulativeSeries,PALETTE};
})();
