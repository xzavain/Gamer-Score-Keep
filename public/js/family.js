/* GamerScore Keep — family: members, trophy cabinet, room code, settings */
(function(){
'use strict';
async function render(){
  const view=document.getElementById('view');
  view.innerHTML='<div class="dash-head"><h1 class="grow" style="margin:0">Family</h1></div><div id="fam-body"><div class="card empty"><span class="big spin">🎲</span></div></div>';
  const body=view.querySelector('#fam-body');
  try{
    const fam=GSK.state.family||await GSK.api.family(GSK.state.familyId);
    GSK.state.family=fam;
    const family=fam.family||fam;
    const members=fam.members||[];
    let badges=[], catalog={};
    try{ badges=await GSK.api.familyBadges(family.id); }catch(e){}
    try{ const cat=await GSK.api.badgeCatalog(); (cat||[]).forEach(b=>catalog[b.key]=b); }catch(e){}
    // group badges by player
    const byPlayer={};
    (badges||[]).forEach(b=>{ const k=b.player_key||b.player_name||'?'; (byPlayer[k]=byPlayer[k]||{name:b.player_name||b.player_key||'?',list:[]}).list.push(b); });

    body.innerHTML=
      '<div class="card"><h3>👨‍👩‍👧‍👦 '+GSK.escapeHtml(family.name)+'</h3>'+
        '<div class="row" style="flex-wrap:wrap;gap:12px"><div class="room-code" title="Family room code"><span id="room-code-txt">'+GSK.escapeHtml(family.room_code||'—')+'</span><button class="btn btn-sm" id="copy-code">📋 Copy</button></div></div>'+
        '<div class="small muted" style="margin-top:8px">Share this code so family members can join from their own accounts.</div>'+
        '<div class="row" style="margin-top:12px;flex-wrap:wrap">'+
          '<button class="btn btn-ghost btn-sm" id="fam-rename">✏️ Rename family</button>'+
          '<button class="btn btn-ghost btn-sm" id="fam-theme">🌓 Toggle theme</button>'+
          '<button class="btn btn-ghost btn-sm" id="fam-switch">🔀 Switch / join family</button>'+
          '<button class="btn btn-ghost btn-sm" id="fam-logout">🚪 Log out</button>'+
        '</div></div>'+
      '<div class="card"><h3>Members ('+members.length+')</h3>'+
        (members.length?members.map(m=>'<div class="member-card">'+GSK.avatarHtml({avatar_emoji:'🙂',avatar_color:'#6366F1'})+
          '<div class="grow"><strong>'+GSK.escapeHtml(m.display_name||m.email)+'</strong><div class="small muted">'+GSK.escapeHtml(m.email||'')+'</div></div>'+
          (m.id===GSK.state.user.id?'<span class="badge">you</span>':'')+'</div>').join(''):'<p class="muted">No members found.</p>')+'</div>'+
      '<div class="card"><h3>🏆 Trophy cabinet</h3>'+
        (Object.keys(byPlayer).length?Object.values(byPlayer).map(g=>'<div class="trophy-sec"><strong>'+GSK.escapeHtml(g.name)+'</strong>'+
          g.list.map(b=>{ const c=catalog[b.badge_key||b.key]||{};
            return '<div class="trophy"><span style="font-size:1.5rem">🏅</span><div><strong>'+GSK.escapeHtml(b.badge_name||b.name||c.name||b.badge_key||b.key)+'</strong>'+
            '<div class="small muted">'+GSK.escapeHtml(b.description||c.description||'')+(b.awarded_at?' · '+GSK.fmtDate(b.awarded_at):'')+'</div></div></div>'; }).join('')+'</div>').join('')
        :'<p class="muted">No badges earned yet — finish a game to start collecting.</p>')+'</div>';

    body.querySelector('#copy-code').addEventListener('click',async()=>{
      const code=family.room_code||'';
      try{ await navigator.clipboard.writeText(code); GSK.toast('Room code copied!','ok'); }
      catch(e){ const t=document.createElement('textarea'); t.value=code; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); GSK.toast('Room code copied!','ok'); }
    });
    body.querySelector('#fam-rename').addEventListener('click',()=>{
      const m=GSK.openModal(GSK.modalHead('Rename family')+'<label class="field"><span>Family name</span><input class="input" id="rn-v" value="'+GSK.escapeHtml(family.name)+'"></label><button class="btn" id="rn-go" style="width:100%">Save</button>');
      m.querySelector('#rn-go').addEventListener('click',async()=>{
        const name=m.querySelector('#rn-v').value.trim(); if(!name)return;
        try{ await GSK.api.renameFamily(family.id,name); GSK.state.families=await GSK.api.families(); GSK.state.family=null; GSK.closeModal(); GSK.toast('Renamed!','ok'); render(); }
        catch(e){ GSK.toast(e.message,'err'); }
      });
    });
    body.querySelector('#fam-theme').addEventListener('click',()=>GSK_toggleTheme());
    body.querySelector('#fam-switch').addEventListener('click',()=>{
      const m=GSK.openModal(GSK.modalHead('Families')+
        '<div class="small muted" style="margin-bottom:8px">Your families</div>'+
        GSK.state.families.map(f=>'<div class="list-row"><div class="grow"><strong>'+GSK.escapeHtml(f.name)+'</strong><div class="small muted">'+(f.member_count!=null?f.member_count+' members · ':'')+'code '+GSK.escapeHtml(f.room_code||'')+'</div></div>'+(String(f.id)===String(GSK.state.familyId)?'<span class="badge green">current</span>':'<button class="btn btn-sm btn-ghost" data-sw="'+f.id+'">Switch</button>')+'</div>').join('')+
        '<div class="row" style="margin-top:12px"><button class="btn btn-ghost grow" id="fs-new">＋ New family</button><button class="btn btn-ghost grow" id="fs-join">🔑 Join with code</button></div>');
      m.querySelectorAll('[data-sw]').forEach(b=>b.addEventListener('click',()=>{ GSK.setFamily(b.dataset.sw); GSK.closeModal(); location.hash='#/dashboard'; }));
      m.querySelector('#fs-new').addEventListener('click',()=>{ GSK.closeModal(); GSK_Dashboard.createFamilyFlow(); });
      m.querySelector('#fs-join').addEventListener('click',()=>{ GSK.closeModal(); GSK_Dashboard.joinFamilyFlow(); });
    });
    body.querySelector('#fam-logout').addEventListener('click',()=>{ if(confirm('Log out?')) GSK.logout(); });
  }catch(e){ body.innerHTML='<div class="card empty">'+GSK.escapeHtml(e.message)+'</div>'; }
}
window.GSK_Family={render};
})();
