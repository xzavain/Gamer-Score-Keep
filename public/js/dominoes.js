/* GamerScore Keep — Mexican Train module: engine checklist, CSS domino tiles, pip calculator */
(function(){
'use strict';

/* Pip positions per value, on a 3-col x 4-row grid per domino half: [col,row] */
const PIP3x4={
  0:[],
  1:[[2,2]],
  2:[[1,1],[3,3]],
  3:[[1,1],[2,2],[3,3]],
  4:[[1,1],[3,1],[1,3],[3,3]],
  5:[[1,1],[3,1],[2,2],[1,3],[3,3]],
  6:[[1,1],[3,1],[1,2],[3,2],[1,3],[3,3]],
  7:[[1,1],[3,1],[2,2],[1,3],[3,3],[1,4],[3,4]],
  8:[[1,1],[3,1],[1,2],[3,2],[1,3],[3,3],[1,4],[3,4]],
  9:[[1,1],[2,1],[3,1],[1,2],[3,2],[1,3],[3,3],[1,4],[3,4]],
  10:[[1,1],[2,1],[3,1],[1,2],[2,2],[3,2],[1,3],[3,3],[1,4],[3,4]],
  11:[[1,1],[2,1],[3,1],[1,2],[2,2],[3,2],[1,3],[2,3],[3,3],[1,4],[3,4]],
  12:[[1,1],[2,1],[3,1],[1,2],[2,2],[3,2],[1,3],[2,3],[3,3],[1,4],[2,4],[3,4]],
};
/* Scatter fill order on a 4x4 grid for values 13–15 (double-15 set) */
const SCATTER16=[[1,1],[4,1],[1,4],[4,4],[2,2],[3,3],[3,2],[2,3],[2,1],[3,1],[1,2],[4,2],[1,3],[4,3],[2,4],[3,4]];
function pipPositions(v){
  if(PIP3x4[v]) return {cells:PIP3x4[v],cols:3,rows:4};
  const cells=SCATTER16.slice(0,Math.min(v,16));
  return {cells,cols:4,rows:4};
}

function dominoHalf(value){
  const {cells,cols,rows}=pipPositions(value);
  let pips=cells.map(([c,r])=>'<span class="pip" style="grid-column:'+c+';grid-row:'+r+'"></span>').join('');
  return '<div class="dom-half" style="grid-template-columns:repeat('+cols+',1fr);grid-template-rows:repeat('+rows+',1fr)">'+pips+'</div>';
}
function dominoTile(value,played,roundNumber){
  return '<div class="domino'+(played?' played':'')+'" data-engine="'+value+'" role="button" tabindex="0" aria-label="Double '+value+(played?' played':'')+'">'+
    dominoHalf(value)+'<div class="dom-divider"></div>'+dominoHalf(value)+
    '<div class="dom-label">Double '+value+'</div>'+
    (played?'<span class="round-link">'+(roundNumber!=null?'R'+roundNumber:'played')+'</span>':'')+
  '</div>';
}
function setMax(dominoSet){
  const m=String(dominoSet||'double-12').match(/double-(\d+)/);
  return m?parseInt(m[1],10):12;
}

/* Render engine checklist into container. onToggle called after a successful toggle. */
function renderEngines(container,G,onToggle){
  if(!container) return;
  const max=setMax(G.game.domino_set);
  const engMap={}; (G.engines||[]).forEach(e=>{ engMap[e.double_value]=e; });
  container.className='engine-grid';
  container.innerHTML='';
  for(let v=max;v>=0;v--){
    const e=engMap[v];
    const wrap=document.createElement('div');
    wrap.innerHTML=dominoTile(v,!!(e&&e.played),e&&e.round_number);
    const tile=wrap.firstChild;
    const toggle=async()=>{
      tile.style.transform='scale(.93)';
      try{ await GSK.api.toggleEngine(G.game.id,v); if(onToggle)onToggle(); }
      catch(err){ GSK.toast(err.message,'err'); }
      finally{ tile.style.transform=''; }
    };
    tile.addEventListener('click',toggle);
    tile.addEventListener('keydown',ev=>{ if(ev.key==='Enter'||ev.key===' '){ ev.preventDefault(); toggle(); } });
    container.appendChild(tile);
  }
  const playedCount=(G.engines||[]).filter(e=>e.played).length;
  const note=document.createElement('div');
  note.className='small muted'; note.style.cssText='grid-column:1/-1;text-align:center';
  note.textContent=playedCount+' of '+(max+1)+' engines played — tap in any order';
  container.appendChild(note);
}

/* Quick-pip calculator: keypad 1–12, running sum, Clear, Apply-to-player */
function renderPipCalc(container,players,onApply){
  if(!container) return;
  let sum=0, seq=[];
  container.className='pipcalc';
  container.innerHTML='<div class="pip-display" id="pc-sum">0</div>'+
    '<div class="small muted" id="pc-seq" style="text-align:center;min-height:1.2em"></div>'+
    '<div class="pip-keys">'+Array.from({length:12},(_,i)=>'<button class="pip-key" data-pip="'+(i+1)+'">'+(i+1)+'</button>').join('')+'</div>'+
    '<div class="row"><button class="btn btn-ghost btn-sm grow" id="pc-clear">Clear</button>'+
    '<button class="btn btn-sm grow" id="pc-apply">Apply to player →</button></div>';
  const sumEl=container.querySelector('#pc-sum'), seqEl=container.querySelector('#pc-seq');
  const draw=()=>{ sumEl.textContent=sum; seqEl.textContent=seq.length?('＋ '+seq.join(' ＋ ')):'tap pip values'; };
  container.querySelectorAll('[data-pip]').forEach(b=>b.addEventListener('click',()=>{
    seq.push(+b.dataset.pip); sum+=+b.dataset.pip; draw();
    b.style.transform='scale(.88)'; setTimeout(()=>b.style.transform='',120);
  }));
  container.querySelector('#pc-clear').addEventListener('click',()=>{ sum=0; seq=[]; draw(); });
  container.querySelector('#pc-apply').addEventListener('click',()=>{
    if(!sum){ GSK.toast('Tap pip values first','err'); return; }
    if(onApply) onApply(sum);
  });
  draw();
}

window.GSK_Dominoes={renderEngines,renderPipCalc,dominoTile,pipPositions,setMax};
})();
