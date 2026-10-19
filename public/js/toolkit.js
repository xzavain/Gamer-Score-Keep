/* GamerScore Keep — toolkit: first-player wheel, dice roller, coin flip, countdown timer */
(function(){
'use strict';

function render(){ // full view
  const view=document.getElementById('view');
  view.innerHTML='<div class="dash-head"><h1 class="grow" style="margin:0">🧰 Toolkit</h1></div>'+
    '<div class="tool-grid">'+
      '<div class="card tool-card" data-tool="wheel"><span class="tool-ico">🎡</span><strong>First-player spinner</strong><div class="small muted">Spin the wheel</div></div>'+
      '<div class="card tool-card" data-tool="dice"><span class="tool-ico">🎲</span><strong>Dice roller</strong><div class="small muted">2 dice, honest random</div></div>'+
      '<div class="card tool-card" data-tool="coin"><span class="tool-ico">🪙</span><strong>Coin flip</strong><div class="small muted">Heads or tails</div></div>'+
      '<div class="card tool-card" data-tool="timer"><span class="tool-ico">⏱️</span><strong>Round timer</strong><div class="small muted">Countdown + buzzer</div></div>'+
    '</div><div id="tool-stage" style="margin-top:14px"></div>';
  view.querySelectorAll('[data-tool]').forEach(c=>c.addEventListener('click',()=>{
    const stage=view.querySelector('#tool-stage');
    ({wheel:toolWheel,dice:toolDice,coin:toolCoin,timer:toolTimer})[c.dataset.tool](stage);
    stage.scrollIntoView({behavior:'smooth',block:'nearest'});
  }));
}
function open(){ // modal (from scorekeeper)
  const m=GSK.openModal(GSK.modalHead('🧰 Toolkit')+
    '<div class="tool-grid">'+
    '<div class="card tool-card" data-tool="wheel"><span class="tool-ico">🎡</span><strong>Spinner</strong></div>'+
    '<div class="card tool-card" data-tool="dice"><span class="tool-ico">🎲</span><strong>Dice</strong></div>'+
    '<div class="card tool-card" data-tool="coin"><span class="tool-ico">🪙</span><strong>Coin</strong></div>'+
    '<div class="card tool-card" data-tool="timer"><span class="tool-ico">⏱️</span><strong>Timer</strong></div>'+
    '</div><div id="tool-stage" style="margin-top:12px"></div>');
  m.querySelectorAll('[data-tool]').forEach(c=>c.addEventListener('click',()=>{
    ({wheel:toolWheel,dice:toolDice,coin:toolCoin,timer:toolTimer})[c.dataset.tool](m.querySelector('#tool-stage'));
  }));
}

/* ---------- wheel ---------- */
function wheelNames(cb){
  // names from active roster if in a game, else prompt
  const names=cb||[];
  const m=GSK.openModal(GSK.modalHead('Who spins?')+
    '<label class="field"><span>Player names (one per line)</span><textarea class="input" id="wn-t" rows="5" placeholder="Alex\nSam\nJordan"></textarea></label>'+
    '<button class="btn" id="wn-go" style="width:100%">Spin!</button>');
  m.querySelector('#wn-go').addEventListener('click',()=>{
    const list=m.querySelector('#wn-t').value.split('\n').map(s=>s.trim()).filter(Boolean);
    if(list.length<2){ GSK.toast('Enter at least 2 names','err'); return; }
    GSK.closeModal(); startWheel(list);
  });
  // _stageTarget set by caller
  function startWheel(list){ const st=window._toolStage; if(st) toolWheel(st,list); }
}
function toolWheel(stage,names){
  window._toolStage=stage;
  if(!names){ wheelNames(); return; }
  stage.innerHTML='<div class="card"><canvas id="wheel-canvas" width="340" height="340"></canvas><div class="spin-result" id="wheel-res">Tap spin!</div><button class="btn btn-emerald" id="wheel-go" style="width:100%">🎡 SPIN</button></div>';
  const cv=stage.querySelector('#wheel-canvas'), ctx=cv.getContext('2d');
  const cols=['#6366F1','#10B981','#F59E0B','#EF4444','#06B6D4','#EC4899','#8B5CF6','#F97316'];
  let angle=0, spinning=false;
  function draw(){
    const R=160,cx=170,cy=170,n=names.length,arc=Math.PI*2/n;
    ctx.clearRect(0,0,340,340);
    names.forEach((nm,i)=>{
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,R,angle+i*arc,angle+(i+1)*arc); ctx.closePath();
      ctx.fillStyle=cols[i%cols.length]; ctx.fill(); ctx.strokeStyle='#0D0F12'; ctx.lineWidth=2; ctx.stroke();
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(angle+(i+.5)*arc); ctx.textAlign='right'; ctx.fillStyle='#fff';
      ctx.font='700 15px sans-serif'; ctx.fillText(nm.length>14?nm.slice(0,13)+'…':nm,R-12,5); ctx.restore();
    });
    ctx.beginPath(); ctx.arc(cx,cy,26,0,7); ctx.fillStyle='#161920'; ctx.fill(); ctx.strokeStyle='#fff'; ctx.stroke();
    // pointer at top
    ctx.beginPath(); ctx.moveTo(cx-12,2); ctx.lineTo(cx+12,2); ctx.lineTo(cx,26); ctx.closePath(); ctx.fillStyle='#F59E0B'; ctx.fill();
  }
  draw();
  stage.querySelector('#wheel-go').addEventListener('click',()=>{
    if(spinning) return; spinning=true;
    const n=names.length, arc=Math.PI*2/n;
    const targetIdx=Math.floor(Math.random()*n);
    // pointer at top (-PI/2). choose final angle so slice center lands there, plus 5-7 full turns
    const turns=(5+Math.random()*2)*Math.PI*2;
    const final=-Math.PI/2-(targetIdx+.5)*arc;
    const startA=angle, delta=((final-startA)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)+turns;
    const dur=3200, t0=performance.now();
    (function anim(t){
      const p=Math.min((t-t0)/dur,1), ease=1-Math.pow(1-p,4);
      angle=startA+delta*ease; draw();
      if(p<1) requestAnimationFrame(anim);
      else{ spinning=false; stage.querySelector('#wheel-res').textContent='🎉 '+names[targetIdx]+' goes first!'; buzz(660,.12); }
    })(t0);
  });
}

/* ---------- dice ---------- */
/* NOTE: this is a 2D canvas animation of tumbling dice, not a physics engine.
   The final faces are chosen with Math.random() when the roll starts; the
   animation below is purely cosmetic and does not influence the outcome. */
function toolDice(stage){
  stage.innerHTML='<div class="card" style="text-align:center"><canvas id="dice-canvas" width="340" height="200"></canvas><div class="spin-result" id="dice-res">Tap roll!</div><button class="btn btn-emerald" id="dice-go" style="width:100%">🎲 ROLL</button></div>';
  const cv=stage.querySelector('#dice-canvas'), ctx=cv.getContext('2d');
  const SIZE=92, FLOOR=158, CX1=95, CX2=245;
  let d1=1,d2=1, dice=[], rolling=false, rafId=null;

  function dieFace(x,y,size,v,rot,scalePop){
    ctx.save(); ctx.translate(x,y); ctx.rotate(rot||0);
    const s=scalePop||1; ctx.scale(s,s);
    ctx.fillStyle='#EDEBE4'; roundRect(-size/2,-size/2,size,size,14); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,.25)'; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='#1B1E26';
    const o=size*.28;
    const pos={1:[[0,0]],2:[[-o,-o],[o,o]],3:[[-o,-o],[0,0],[o,o]],4:[[-o,-o],[o,-o],[-o,o],[o,o]],5:[[-o,-o],[o,-o],[0,0],[-o,o],[o,o]],6:[[-o,-o],[o,-o],[-o,0],[o,0],[-o,o],[o,o]]}[v];
    pos.forEach(([px,py])=>{ ctx.beginPath(); ctx.arc(px,py,size*.075,0,7); ctx.fill(); });
    ctx.restore();
  }
  function roundRect(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
  function drawShadow(x,hgt){
    // shadow shrinks/fades as the die rises off the floor
    const k=Math.max(0,1-hgt/110);
    ctx.save(); ctx.globalAlpha=.12+.28*k;
    ctx.fillStyle='#000';
    ctx.beginPath(); ctx.ellipse(x,FLOOR+SIZE/2+8,SIZE*.42*(0.6+0.4*k),10,0,0,7); ctx.fill();
    ctx.restore();
  }
  function drawStatic(){ ctx.clearRect(0,0,340,200); drawShadow(CX1,0); drawShadow(CX2,0); dieFace(CX1,FLOOR,SIZE,d1); dieFace(CX2,FLOOR,SIZE,d2); }
  drawStatic();

  function makeDie(cx,finalFace,delayMs){
    return { cx, x:cx+(Math.random()-.5)*30, y:26, vx:(Math.random()-.5)*6.5, vy:-1-Math.random()*2.5,
      rot:Math.random()*6.28, vr:(Math.random()-.5)*.45, face:1+((Math.random()*6)|0), final:finalFace,
      born:performance.now()+delayMs, settled:false, pop:0, lastCycle:0 };
  }
  stage.querySelector('#dice-go').addEventListener('click',()=>{
    if(rolling) return; rolling=true;
    if(rafId) cancelAnimationFrame(rafId);
    d1=1+Math.floor(Math.random()*6); d2=1+Math.floor(Math.random()*6);
    stage.querySelector('#dice-res').textContent='Rolling…';
    dice=[makeDie(CX1,d1,0),makeDie(CX2,d2,260)]; // staggered settle: die 2 launches later
    const GRAV=.62;
    (function frame(){
      const now=performance.now();
      ctx.clearRect(0,0,340,200);
      let allDone=true;
      dice.forEach(d=>{
        if(now<d.born){ allDone=false; return; }
        if(!d.settled){
          allDone=false;
          d.vy+=GRAV; d.x+=d.vx; d.y+=d.vy; d.rot+=d.vr;
          if(d.x<SIZE/2+6){d.x=SIZE/2+6;d.vx=Math.abs(d.vx)*.6;}
          if(d.x>340-SIZE/2-6){d.x=340-SIZE/2-6;d.vx=-Math.abs(d.vx)*.6;}
          if(d.y>=FLOOR){
            d.y=FLOOR;
            if(Math.abs(d.vy)>1.6){ d.vy*=-.52; d.vx*=.68; d.vr*=.55; } // bounce with damping
            else{
              d.settled=true; d.face=d.final; d.pop=1;
              buzz(150,.16); // landing thump
            }
          }
          // faces visibly cycle while tumbling
          if(!d.settled&&now-d.lastCycle>85){ d.face=1+((Math.random()*6)|0); d.lastCycle=now; }
        } else if(d.pop>0){
          allDone=false;
          d.pop=Math.max(0,d.pop-.06); // settle pop: 1 -> 0
        }
        const hgt=Math.max(0,FLOOR-d.y);
        drawShadow(d.x,hgt);
        const popScale=d.pop>0?1+.16*Math.sin(d.pop*Math.PI):1;
        dieFace(d.x,d.y,SIZE,d.face,d.rot,popScale);
      });
      if(!allDone){ rafId=requestAnimationFrame(frame); }
      else{
        rolling=false;
        stage.querySelector('#dice-res').textContent='🎲 '+d1+' + '+d2+' = '+(d1+d2);
        buzz(520,.1);
      }
    })();
  });
  GSK.onTeardown(()=>{ if(rafId)cancelAnimationFrame(rafId); rolling=false; });
}

/* ---------- coin ---------- */
function toolCoin(stage){
  stage.innerHTML='<div class="card" style="text-align:center"><canvas id="coin-canvas" width="340" height="200"></canvas><div class="spin-result" id="coin-res">Tap flip!</div><button class="btn btn-emerald" id="coin-go" style="width:100%">🪙 FLIP</button></div>';
  const cv=stage.querySelector('#coin-canvas'), ctx=cv.getContext('2d');
  function drawCoin(scaleX,label){
    ctx.clearRect(0,0,340,200);
    ctx.save(); ctx.translate(170,100); ctx.scale(Math.max(Math.abs(scaleX),.08),1);
    ctx.beginPath(); ctx.arc(0,0,70,0,7);
    const g=ctx.createLinearGradient(-70,-70,70,70); g.addColorStop(0,'#FCD34D'); g.addColorStop(1,'#B45309');
    ctx.fillStyle=g; ctx.fill(); ctx.lineWidth=6; ctx.strokeStyle='#92400E'; ctx.stroke();
    ctx.fillStyle='#78350F'; ctx.font='800 44px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(label,0,2); ctx.restore();
  }
  drawCoin(1,'?');
  stage.querySelector('#coin-go').addEventListener('click',()=>{
    const heads=Math.random()<.5, t0=performance.now(), dur=1400;
    (function anim(t){
      const p=Math.min((t-t0)/dur,1);
      const flips=6, w=Math.cos(p*flips*Math.PI)*(1-p*.3);
      drawCoin(w,p<.5?'?':(heads?'H':'T'));
      if(p<1) requestAnimationFrame(anim);
      else{ drawCoin(1,heads?'H':'T'); stage.querySelector('#coin-res').textContent=heads?'👑 Heads!':'🔄 Tails!'; buzz(heads?700:440,.12); }
    })(t0);
  });
}

/* ---------- timer ---------- */
let timerInt=null;
function toolTimer(stage){
  clearInterval(timerInt);
  stage.innerHTML='<div class="card"><div class="timer-display" id="tm-d">05:00</div>'+
    '<div class="row" style="margin:12px 0"><input class="input" id="tm-m" type="number" min="0" max="99" value="5" style="text-align:center"><span class="muted">:</span><input class="input" id="tm-s" type="number" min="0" max="59" value="0" style="text-align:center"></div>'+
    '<div class="row"><button class="btn btn-emerald grow" id="tm-start">▶ Start</button><button class="btn btn-ghost" id="tm-stop">⏹</button><button class="btn btn-ghost" id="tm-reset">↺</button></div></div>';
  const dEl=stage.querySelector('#tm-d');
  let remaining=5*60;
  const fmt=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
  const sync=()=>{ remaining=Math.max(0,(+stage.querySelector('#tm-m').value||0)*60+(+stage.querySelector('#tm-s').value||0)); dEl.textContent=fmt(remaining); };
  stage.querySelector('#tm-m').addEventListener('input',sync);
  stage.querySelector('#tm-s').addEventListener('input',sync);
  stage.querySelector('#tm-start').addEventListener('click',()=>{
    clearInterval(timerInt); sync();
    if(remaining<=0){ GSK.toast('Set a time first','err'); return; }
    const end=Date.now()+remaining*1000;
    timerInt=setInterval(()=>{
      remaining=Math.max(0,Math.round((end-Date.now())/1000));
      dEl.textContent=fmt(remaining);
      if(remaining<=0){ clearInterval(timerInt); dEl.textContent="⏰ TIME!"; buzz(880,.5); setTimeout(()=>buzz(880,.5),600); GSK.toast("Time's up!",'ok'); }
    },250);
  });
  stage.querySelector('#tm-stop').addEventListener('click',()=>clearInterval(timerInt));
  stage.querySelector('#tm-reset').addEventListener('click',()=>{ clearInterval(timerInt); sync(); });
  GSK.onTeardown(()=>clearInterval(timerInt));
}

/* ---------- buzzer (WebAudio) ---------- */
let actx=null;
function buzz(freq,dur){
  try{
    actx=actx||new (window.AudioContext||window.webkitAudioContext)();
    const o=actx.createOscillator(), g=actx.createGain();
    o.type='square'; o.frequency.value=freq||880;
    g.gain.setValueAtTime(.18,actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,actx.currentTime+(dur||.3));
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime+(dur||.3));
  }catch(e){}
}

window.GSK_Toolkit={render,open,toolWheel,toolDice,toolCoin,toolTimer};
})();
