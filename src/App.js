import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const NexusCtx = createContext({});

// ── Supabase ──────────────────────────────────────────────────────────────────
const SUPA_URL = "https://mbcngigdnlnojsklydfi.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iY25naWdkbmxub2pza2x5ZGZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODc4NDcsImV4cCI6MjA4ODU2Mzg0N30.LRhTQjOR8UQtA_Dk1uQjWNIDVY1SCvtCHKzQ-u2yl5k";
const sb = createClient(SUPA_URL, SUPA_KEY);

// ── Google OAuth ──────────────────────────────────────────────────────────────
const GCAL_CLIENT_ID = "188108397931-rb06rvfof53tsbhd9c3sjokduoe2538n.apps.googleusercontent.com";
const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar";

const loadGapi = () => new Promise((resolve) => {
  if (window.gapi) { resolve(window.gapi); return; }
  const s = document.createElement("script");
  s.src = "https://apis.google.com/js/api.js";
  s.onload = () => window.gapi.load("client:auth2", async () => {
    await window.gapi.client.init({ clientId: GCAL_CLIENT_ID, scope: GCAL_SCOPE, discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"] });
    resolve(window.gapi);
  });
  document.head.appendChild(s);
});

const gcalSignIn = async () => {
  const gapi = await loadGapi();
  if (!gapi.auth2.getAuthInstance().isSignedIn.get()) await gapi.auth2.getAuthInstance().signIn();
  return gapi;
};

const gcalListEvents = async (calendarId="primary", maxResults=20) => {
  const gapi = await gcalSignIn();
  const now = new Date().toISOString();
  const res = await gapi.client.calendar.events.list({ calendarId, timeMin: now, maxResults, singleEvents: true, orderBy: "startTime" });
  return res.result.items || [];
};

const gcalListCalendars = async () => {
  const gapi = await gcalSignIn();
  const res = await gapi.client.calendar.calendarList.list();
  return res.result.items || [];
};

const gcalCreateEvent = async (calendarId, title, description, startISO, endISO) => {
  const gapi = await gcalSignIn();
  const res = await gapi.client.calendar.events.insert({ calendarId, resource: { summary: title, description, start: { dateTime: startISO }, end: { dateTime: endISO } } });
  return res.result;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const BLANK = { tasks:[], reminders:[], notes:[], messages:[], cobrancas:[], reunioes:[], gcalAccounts:[], rotina:[], habitos:[], semana:{} };
const uid = () => Math.random().toString(36).slice(2,10);
const fdt = (d) => d ? new Date(d).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}) : "—";
const fdtShort = (d) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";
const clk = () => new Date().toLocaleString("pt-BR",{weekday:"short",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
const daysUntil = (d) => Math.ceil((new Date(d)-new Date())/86400000);
const saudacao = () => { const h = new Date().getHours(); return h<12?"Bom dia":h<18?"Boa tarde":"Boa noite"; };
const loadLocal = () => { try { const s=localStorage.getItem("nexus_v1"); return s?{...BLANK,...JSON.parse(s)}:BLANK; } catch { return BLANK; } };
const saveLocal = (d) => { try { localStorage.setItem("nexus_v1",JSON.stringify(d)); } catch {} };

// ── Google Calendar ───────────────────────────────────────────────────────────
const buildGCalLink = (title,description,dateStr,account) => {
  if(!dateStr) return null;
  const start=new Date(dateStr), end=new Date(start.getTime()+3600000);
  const fmt=(d)=>d.toISOString().replace(/[-:]/g,"").split(".")[0]+"Z";
  const p=new URLSearchParams({action:"TEMPLATE",text:title,details:description||"",dates:`${fmt(start)}/${fmt(end)}`});
  if(account) p.set("authuser",account);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
};

// ── Claude API ────────────────────────────────────────────────────────────────
async function askClaude(messages,system) {
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,
      system:system||"Você é o Nexus, assistente pessoal inteligente. Responda sempre em português brasileiro, de forma clara e objetiva.",messages})});
  const d=await r.json();
  return d.content?.map(b=>b.text||"").join("")||"Erro na resposta.";
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Fira+Code:wght@300;400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#07080f;--s1:#0f1018;--s2:#161722;--s3:#1e1f2e;--s4:#272840;
  --b1:#2c2d44;--b2:#3d3e5c;
  --ac:#5b8af0;--ag:#3dd68c;--ap:#e06bf0;--aw:#f0b84a;--ar:#f06b6b;
  --tx:#dde1f0;--sub:#8890b0;--mut:#4a4e6a;
  --r6:6px;--r10:10px;--r14:14px;
}
html,body,#root{height:100%;overflow:hidden}
body{background:var(--bg);color:var(--tx);font-family:'Outfit',sans-serif;-webkit-font-smoothing:antialiased}
.shell{display:flex;flex-direction:column;height:100vh;overflow:hidden}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:0 18px;height:54px;min-height:54px;flex-shrink:0;background:var(--s1);border-bottom:1px solid var(--b1);gap:12px;z-index:20}
.layout{display:flex;flex:1;overflow:hidden}
.sidebar{width:215px;min-width:215px;background:var(--s1);border-right:1px solid var(--b1);display:flex;flex-direction:column;overflow-y:auto;padding:14px 10px;gap:2px;flex-shrink:0}
.main{flex:1;overflow-y:auto;padding:26px 30px;min-width:0}
.botnav{display:none;background:var(--s1);border-top:1px solid var(--b1);flex-shrink:0;padding:4px 0}
.bni{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:7px 2px;cursor:pointer;font-size:9px;font-weight:600;color:var(--mut);transition:color .15s;letter-spacing:.3px}
.bni .ic{font-size:20px;line-height:1}
.bni.on{color:var(--ac)}
.logo{font-size:18px;font-weight:800;letter-spacing:-.6px;background:linear-gradient(120deg,var(--ac),var(--ap));-webkit-background-clip:text;-webkit-text-fill-color:transparent;white-space:nowrap}
.clk{font-family:'Fira Code',monospace;font-size:11px;color:var(--mut);line-height:1.5}
.expbtn{background:var(--s3);border:1px solid var(--b1);color:var(--ag);font-family:'Outfit',sans-serif;font-size:11px;font-weight:600;padding:5px 12px;border-radius:var(--r6);cursor:pointer;white-space:nowrap;transition:background .2s}
.expbtn:hover{background:var(--s4)}
.nsec{font-family:'Fira Code',monospace;font-size:9px;color:var(--mut);letter-spacing:1.5px;text-transform:uppercase;padding:14px 8px 5px}
.ni{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:var(--r10);cursor:pointer;font-size:13px;font-weight:600;color:var(--sub);transition:all .15s;border:1px solid transparent}
.ni:hover{color:var(--tx);background:var(--s2)}
.ni.on{color:var(--tx);background:var(--s2);border-color:var(--b1)}
.ni .nic{font-size:15px}
.bdg{margin-left:auto;font-family:'Fira Code',monospace;font-size:9px;padding:1px 6px;border-radius:10px}
.ba{background:var(--ac);color:#fff}.bg{background:var(--ag);color:#000}.bp{background:var(--ap);color:#fff}.bw{background:var(--aw);color:#000}.br{background:var(--ar);color:#fff}
.ph{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:22px;gap:12px;flex-wrap:wrap}
.pt{font-size:21px;font-weight:800;letter-spacing:-.5px;margin-bottom:3px}
.ps{font-family:'Fira Code',monospace;font-size:10px;color:var(--mut)}
.frow{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
.frow .fg{flex:1;min-width:120px}
input,textarea,select{background:var(--s2);border:1px solid var(--b1);color:var(--tx);font-family:'Outfit',sans-serif;font-size:13px;padding:9px 12px;border-radius:var(--r10);outline:none;transition:border-color .2s;width:100%}
input:focus,textarea:focus,select:focus{border-color:var(--ac)}
textarea{resize:vertical;min-height:90px}
select option{background:var(--s2)}
input[type="datetime-local"]{color-scheme:dark}
.btn{background:var(--ac);color:#fff;border:none;font-family:'Outfit',sans-serif;font-size:13px;font-weight:700;padding:9px 18px;border-radius:var(--r10);cursor:pointer;transition:filter .2s;white-space:nowrap;flex-shrink:0}
.btn:hover{filter:brightness(1.12)}
.btn:disabled{opacity:.4;cursor:not-allowed}
.bsec{background:var(--s3);border:1px solid var(--b1);color:var(--tx)}
.bdng{background:var(--ar)}
.bsm{padding:6px 12px;font-size:12px}
.bag{background:var(--ag);color:#000}
.bap{background:var(--ap)}
.cl{display:flex;flex-direction:column;gap:8px}
.card{background:var(--s1);border:1px solid var(--b1);border-radius:var(--r14);padding:13px 15px;display:flex;align-items:flex-start;gap:10px;transition:border-color .2s}
.card:hover{border-color:var(--b2)}
.card.dn{opacity:.4}
.card.dn .ct{text-decoration:line-through}
.cb{flex:1;min-width:0}
.ct{font-size:13px;font-weight:600;margin-bottom:3px}
.cm{font-family:'Fira Code',monospace;font-size:10px;color:var(--mut);margin-top:2px}
.ca{display:flex;gap:5px;flex-shrink:0;align-items:flex-start}
.ib{background:var(--s2);border:1px solid var(--b1);color:var(--mut);font-size:12px;width:27px;height:27px;border-radius:var(--r6);cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:center;flex-shrink:0;text-decoration:none}
.ib:hover{color:var(--tx);border-color:var(--b2)}
.ibdel:hover{color:var(--ar)!important;border-color:var(--ar)!important}
.ibcal:hover{color:var(--ag)!important;border-color:var(--ag)!important}
.chk{width:17px;height:17px;min-width:17px;border:2px solid var(--b1);border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;margin-top:3px;transition:all .15s;font-size:10px;flex-shrink:0}
.chk.on{background:var(--ag);border-color:var(--ag);color:#000}
.pd{width:7px;height:7px;min-width:7px;border-radius:50%;margin-top:5px;flex-shrink:0}
.pu{background:var(--ar)}.pn{background:var(--aw)}
.tg{display:inline-block;font-family:'Fira Code',monospace;font-size:9px;padding:2px 7px;border-radius:4px;margin-right:3px;margin-top:3px}
.tu{background:rgba(240,107,107,.12);color:var(--ar);border:1px solid rgba(240,107,107,.25)}
.tn2{background:rgba(240,184,74,.12);color:var(--aw);border:1px solid rgba(240,184,74,.25)}
.tp{background:rgba(61,214,140,.12);color:var(--ag);border:1px solid rgba(61,214,140,.25)}
.tc{background:rgba(91,138,240,.12);color:var(--ac);border:1px solid rgba(91,138,240,.25)}
.pill{display:inline-flex;align-items:center;gap:4px;font-family:'Fira Code',monospace;font-size:9px;padding:3px 9px;border-radius:20px;font-weight:500;cursor:pointer;transition:all .15s}
.pend{background:rgba(240,184,74,.12);color:var(--aw);border:1px solid rgba(240,184,74,.3)}
.cobr{background:rgba(91,138,240,.12);color:var(--ac);border:1px solid rgba(91,138,240,.3)}
.entr{background:rgba(61,214,140,.12);color:var(--ag);border:1px solid rgba(61,214,140,.3)}
.urg-badge{display:inline-block;font-family:'Fira Code',monospace;font-size:9px;padding:2px 8px;border-radius:4px}
.urg-u{background:rgba(240,107,107,.15);color:var(--ar);border:1px solid rgba(240,107,107,.3);animation:pulse 2s infinite}
.urg-n{background:rgba(61,214,140,.1);color:var(--ag);border:1px solid rgba(61,214,140,.2)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
.dg{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:24px}
.st{background:var(--s1);border:1px solid var(--b1);border-radius:var(--r14);padding:16px;text-align:center}
.sn{font-size:30px;font-weight:800;letter-spacing:-1px}
.sl{font-family:'Fira Code',monospace;font-size:9px;color:var(--mut);margin-top:3px}
.st.sa .sn{color:var(--ac)}.st.sg .sn{color:var(--ag)}.st.sp .sn{color:var(--ap)}.st.sw .sn{color:var(--aw)}
.fsec{font-family:'Fira Code',monospace;font-size:9px;color:var(--mut);letter-spacing:1.5px;text-transform:uppercase;padding:12px 0 6px}
.empty{color:var(--mut);font-size:13px;padding:16px 0;font-style:italic}
.alert-strip{background:rgba(240,107,107,.08);border:1px solid rgba(240,107,107,.2);border-radius:var(--r10);padding:10px 14px;margin-bottom:10px;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ar)}
.csh{display:flex;flex-direction:column;height:100%}
.cms{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding-bottom:8px;min-height:0;scrollbar-width:thin;scrollbar-color:var(--b1) transparent}
.msg{display:flex;gap:8px;align-items:flex-start;max-width:80%}
.msg.u{align-self:flex-end;flex-direction:row-reverse}
.av{width:27px;height:27px;min-width:27px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}
.msg.u .av{background:linear-gradient(135deg,var(--ac),var(--ap));color:#fff}
.msg.ai .av{background:var(--s3);border:1px solid var(--b1);color:var(--ag)}
.bbl{background:var(--s1);border:1px solid var(--b1);border-radius:10px;padding:9px 13px;font-size:13px;line-height:1.65}
.msg.u .bbl{background:var(--s2);border-color:var(--ac)}
.mt{font-family:'Fira Code',monospace;font-size:9px;color:var(--mut);margin-top:3px}
.msg.ai .mt{text-align:left}.msg.u .mt{text-align:right}
.cin{display:flex;gap:8px;padding-top:12px;border-top:1px solid var(--b1);flex-shrink:0}
.dots{display:flex;gap:4px;align-items:center;padding:2px 0}
.dots span{width:5px;height:5px;border-radius:50%;background:var(--mut);animation:db 1.2s infinite}
.dots span:nth-child(2){animation-delay:.2s}.dots span:nth-child(3){animation-delay:.4s}
@keyframes db{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
.ng{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
.nc{background:var(--s1);border:1px solid var(--b1);border-radius:var(--r14);padding:14px;cursor:pointer;transition:all .2s;position:relative}
.nc:hover{border-color:var(--ap);transform:translateY(-2px)}
.nct{font-size:13px;font-weight:700;margin-bottom:5px}
.ncp{font-size:11px;color:var(--mut);line-height:1.5;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.ncd{font-family:'Fira Code',monospace;font-size:9px;color:var(--mut);margin-top:8px}
.ncdel{position:absolute;top:8px;right:8px;opacity:0;transition:opacity .15s}
.nc:hover .ncdel{opacity:1}
.rcard{background:var(--s1);border:1px solid var(--b1);border-radius:var(--r14);padding:14px 16px;transition:border-color .2s;cursor:pointer}
.rcard:hover{border-color:var(--b2)}
.rcard-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:6px}
.rcard-title{font-size:13px;font-weight:700}
.rcard-meta{font-family:'Fira Code',monospace;font-size:10px;color:var(--mut)}
.rcard-prev{font-size:12px;color:var(--sub);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rec-btn{display:flex;align-items:center;gap:8px;padding:10px 18px;border-radius:var(--r10);font-family:'Outfit',sans-serif;font-size:13px;font-weight:700;cursor:pointer;border:none;transition:all .2s}
.rec-btn.idle{background:var(--s3);border:1px solid var(--b1);color:var(--tx)}
.rec-btn.recording{background:rgba(240,107,107,.15);border:1px solid var(--ar);color:var(--ar)}
.rdot{width:10px;height:10px;border-radius:50%;background:var(--mut)}
.rec-btn.recording .rdot{background:var(--ar);animation:rp .8s infinite}
@keyframes rp{0%,100%{opacity:1}50%{opacity:.2}}
.rec-timer{font-family:'Fira Code',monospace;font-size:22px;font-weight:500;color:var(--tx);letter-spacing:2px}
.transcript-box{background:var(--s2);border:1px solid var(--b1);border-radius:var(--r10);padding:14px;font-size:13px;line-height:1.7;color:var(--sub);min-height:80px;white-space:pre-wrap;word-break:break-word}
.mov{position:fixed;inset:0;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;z-index:200;backdrop-filter:blur(8px);padding:16px}
.mod{background:var(--s1);border:1px solid var(--b1);border-radius:16px;padding:24px;width:min(620px,100%);max-height:88vh;overflow-y:auto;display:flex;flex-direction:column;gap:12px}
.mh{display:flex;justify-content:space-between;align-items:center;margin-bottom:2px}
.mtt{font-size:17px;font-weight:800}
label{font-size:12px;font-weight:600;color:var(--sub);display:block;margin-bottom:4px}
.pcard{background:var(--s1);border:1px solid var(--b1);border-radius:var(--r14);padding:14px 16px;transition:all .2s}
.pcard:hover{border-color:var(--b2)}
.pcard.dn{opacity:.4}
.pcard-top{display:flex;align-items:flex-start;gap:10px;margin-bottom:8px}
.pcard-av{width:34px;height:34px;min-width:34px;border-radius:50%;background:linear-gradient(135deg,var(--ac),var(--ap));display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0}
.pcard-info{flex:1;min-width:0}
.pcard-name{font-size:14px;font-weight:700;margin-bottom:2px}
.pcard-task{font-size:12px;color:var(--sub);line-height:1.4}
.pcard-bottom{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.days-chip{font-family:'Fira Code',monospace;font-size:10px;padding:3px 8px;border-radius:20px}
.days-ok{background:rgba(61,214,140,.1);color:var(--ag);border:1px solid rgba(61,214,140,.2)}
.days-warn{background:rgba(240,184,74,.1);color:var(--aw);border:1px solid rgba(240,184,74,.2)}
.days-over{background:rgba(240,107,107,.1);color:var(--ar);border:1px solid rgba(240,107,107,.2)}

/* Google Calendar popup */
.gcal-popup{position:absolute;top:32px;right:0;background:var(--s2);border:1px solid var(--b1);border-radius:var(--r10);padding:8px;min-width:200px;z-index:50;box-shadow:0 8px 32px rgba(0,0,0,.5)}
.gcal-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--r6);cursor:pointer;font-size:12px;font-weight:600;transition:background .15s;text-decoration:none;color:var(--tx)}
.gcal-item:hover{background:var(--s3)}
.gcal-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}

/* Settings */
.acc-card{background:var(--s2);border:1px solid var(--b1);border-radius:var(--r10);padding:14px;display:flex;align-items:center;gap:10px}
.acc-dot{width:10px;height:10px;border-radius:50%}
.acc-info{flex:1}
.acc-name{font-size:13px;font-weight:700}
.acc-email{font-family:'Fira Code',monospace;font-size:10px;color:var(--mut)}

/* Calendar Picker */
.cal-wrap{position:relative;width:100%}
.cal-input-btn{background:var(--s2);border:1px solid var(--b1);color:var(--tx);font-family:'Outfit',sans-serif;font-size:13px;padding:9px 12px;border-radius:var(--r10);width:100%;cursor:pointer;text-align:left;display:flex;align-items:center;gap:8px;transition:border-color .2s}
.cal-input-btn:hover,.cal-input-btn.open{border-color:var(--ac)}
.cal-input-btn .placeholder{color:var(--mut)}
.cal-popup{position:absolute;top:calc(100% + 6px);left:0;z-index:100;background:var(--s2);border:1px solid var(--b1);border-radius:var(--r14);padding:16px;box-shadow:0 12px 40px rgba(0,0,0,.6);min-width:280px;width:300px}
.cal-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.cal-month{font-size:14px;font-weight:700;letter-spacing:-.3px}
.cal-nav{background:var(--s3);border:1px solid var(--b1);color:var(--tx);width:28px;height:28px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;transition:background .15s;line-height:1}
.cal-nav:hover{background:var(--s4)}
.cal-days-head{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:6px}
.cal-dh{font-family:'Fira Code',monospace;font-size:9px;color:var(--mut);text-align:center;padding:3px 0;text-transform:uppercase}
.cal-days{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
.cal-day{aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:500;border-radius:6px;cursor:pointer;transition:all .15s;border:1px solid transparent}
.cal-day:hover{background:var(--s3);color:var(--tx)}
.cal-day.today{border-color:var(--ac);color:var(--ac)}
.cal-day.selected{background:var(--ac)!important;color:#fff!important;font-weight:700}
.cal-day.empty{cursor:default;pointer-events:none}
.cal-time{display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--b1)}
.cal-time label{font-family:'Fira Code',monospace;font-size:10px;color:var(--mut);white-space:nowrap;margin:0;min-width:30px}
.cal-time input{background:var(--s3);border:1px solid var(--b1);color:var(--tx);font-family:'Fira Code',monospace;font-size:13px;padding:6px 10px;border-radius:var(--r6);width:100%;outline:none;color-scheme:dark}
.cal-time input:focus{border-color:var(--ac)}
.cal-confirm{margin-top:10px;width:100%;padding:8px}


/* Rotina */
.rotina-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.rotina-block{background:var(--s1);border:1px solid var(--b1);border-radius:var(--r14);padding:16px}
.rotina-block-title{font-size:12px;font-weight:700;color:var(--sub);letter-spacing:.5px;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;gap:6px}
.timeline{display:flex;flex-direction:column;gap:4px}
.tl-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--r10);cursor:pointer;transition:all .15s;border:1px solid transparent}
.tl-item:hover{background:var(--s2);border-color:var(--b1)}
.tl-item.done-tl{opacity:.5}
.tl-item.done-tl .tl-title{text-decoration:line-through}
.tl-item.current{background:rgba(91,138,240,.08);border-color:rgba(91,138,240,.2)}
.tl-time{font-family:'Fira Code',monospace;font-size:10px;color:var(--mut);min-width:40px;text-align:right}
.tl-dot{width:8px;height:8px;min-width:8px;border-radius:50%;background:var(--b2)}
.tl-item.current .tl-dot{background:var(--ac);animation:pulse 2s infinite}
.tl-item.done-tl .tl-dot{background:var(--ag)}
.tl-title{font-size:13px;font-weight:500;flex:1}
.tl-cat{font-family:'Fira Code',monospace;font-size:9px;padding:1px 6px;border-radius:4px}
.hab-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
.hab-card{background:var(--s2);border:1px solid var(--b1);border-radius:var(--r10);padding:12px;text-align:center;cursor:pointer;transition:all .2s;position:relative}
.hab-card.done-h{background:rgba(61,214,140,.08);border-color:rgba(61,214,140,.3)}
.hab-card.done-h .hab-icon{filter:none}
.hab-icon{font-size:22px;margin-bottom:6px;filter:grayscale(0.5)}
.hab-name{font-size:11px;font-weight:600;color:var(--sub)}
.hab-card.done-h .hab-name{color:var(--ag)}
.hab-streak{font-family:'Fira Code',monospace;font-size:9px;color:var(--mut);margin-top:3px}
.hab-check{position:absolute;top:6px;right:6px;font-size:10px;color:var(--ag)}
.prog-bar{background:var(--s3);border-radius:20px;height:6px;overflow:hidden;margin-top:6px}
.prog-fill{height:100%;border-radius:20px;transition:width .5s ease;background:linear-gradient(90deg,var(--ac),var(--ag))}
.week-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.week-day{background:var(--s2);border:1px solid var(--b1);border-radius:var(--r10);padding:10px 6px;text-align:center;cursor:pointer;transition:all .2s;min-height:80px}
.week-day.today-w{border-color:var(--ac)}
.week-day.has-items{background:rgba(91,138,240,.05)}
.week-day-name{font-family:'Fira Code',monospace;font-size:9px;color:var(--mut);text-transform:uppercase;margin-bottom:4px}
.week-day-num{font-size:14px;font-weight:700;margin-bottom:6px}
.week-day.today-w .week-day-num{color:var(--ac)}
.week-dot{width:5px;height:5px;border-radius:50%;background:var(--ac);margin:2px auto}
.relatorio{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.rel-card{background:var(--s2);border:1px solid var(--b1);border-radius:var(--r10);padding:14px;text-align:center}
.rel-num{font-size:26px;font-weight:800;letter-spacing:-1px}
.rel-lbl{font-family:'Fira Code',monospace;font-size:9px;color:var(--mut);margin-top:2px}
.cat-work{background:rgba(91,138,240,.12);color:var(--ac);border:1px solid rgba(91,138,240,.2)}
.cat-saude{background:rgba(61,214,140,.12);color:var(--ag);border:1px solid rgba(61,214,140,.2)}
.cat-pessoal{background:rgba(224,107,240,.12);color:var(--ap);border:1px solid rgba(224,107,240,.2)}
.cat-pausa{background:rgba(240,184,74,.12);color:var(--aw);border:1px solid rgba(240,184,74,.2)}
@media(max-width:650px){.rotina-grid{grid-template-columns:1fr}.week-grid{grid-template-columns:repeat(7,1fr);gap:3px}.week-day{padding:6px 3px;min-height:60px}.week-day-num{font-size:12px}}
@media(max-width:650px){
  .sidebar{display:none}
  .botnav{display:flex}
  .main{padding:14px 13px}
  .csh{height:calc(100vh - 54px - 60px - 42px)}
  .pt{font-size:18px}
  .ng{grid-template-columns:1fr 1fr}
  .dg{grid-template-columns:1fr 1fr}
  .clk{display:none}
  .msg{max-width:90%}
  .frow{flex-direction:column}
  .frow .fg{min-width:0}
}
@media(max-width:380px){.ng{grid-template-columns:1fr}}
.gcal-panel{display:grid;grid-template-columns:280px 1fr;gap:16px;height:calc(100vh - 200px)}
.gcal-sidebar{display:flex;flex-direction:column;gap:8px;overflow-y:auto}
.gcal-cal-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--r10);cursor:pointer;border:1px solid transparent;transition:all .15s}
.gcal-cal-item:hover{background:var(--s2);border-color:var(--b1)}
.gcal-cal-item.sel{background:var(--s2);border-color:var(--ac)}
.gcal-cal-dot{width:10px;height:10px;min-width:10px;border-radius:50%}
.gcal-cal-name{font-size:13px;font-weight:600;flex:1}
.gcal-cal-count{font-family:'Fira Code',monospace;font-size:10px;color:var(--mut)}
.gcal-events{overflow-y:auto;display:flex;flex-direction:column;gap:8px}
.gcal-event{background:var(--s2);border:1px solid var(--b1);border-radius:var(--r10);padding:12px 14px;border-left:3px solid var(--ac);transition:all .15s}
.gcal-event:hover{border-color:var(--ac);background:var(--s3)}
.gcal-event-title{font-size:13px;font-weight:600;margin-bottom:4px}
.gcal-event-time{font-family:'Fira Code',monospace;font-size:11px;color:var(--sub)}
.gcal-event-loc{font-size:11px;color:var(--mut);margin-top:3px}
.gcal-signin-box{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:60px 20px;text-align:center}
.gcal-connect-btn{display:flex;align-items:center;gap:10px;background:#fff;color:#333;border:none;border-radius:10px;padding:12px 20px;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;box-shadow:0 2px 8px rgba(0,0,0,.3)}
.gcal-connect-btn:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(0,0,0,.4)}
.gcal-new-event{background:var(--s2);border:1px solid var(--b1);border-radius:var(--r14);padding:16px;margin-bottom:16px}
.gcal-new-title{font-size:12px;font-weight:700;color:var(--sub);letter-spacing:.5px;text-transform:uppercase;margin-bottom:12px}
@media(max-width:650px){.gcal-panel{grid-template-columns:1fr;height:auto}}
`;

// ── Account Colors ────────────────────────────────────────────────────────────
const ACCOUNT_COLORS = ["#5b8af0","#3dd68c","#e06bf0","#f0b84a","#f06b6b"];

// ── GCalBtn ───────────────────────────────────────────────────────────────────
function GCalBtn({title,description,dateStr,accounts}) {
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{ const h=(e)=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);}; document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h); },[]);
  if(!dateStr) return null;
  const accs=accounts?.length?accounts:[{name:"Google Agenda",email:"",color:ACCOUNT_COLORS[0]}];
  return(<div style={{position:"relative"}} ref={ref}>
    <button className="ib ibcal" title="Adicionar ao Google Agenda" onClick={()=>setOpen(o=>!o)}>📅</button>
    {open&&(<div className="gcal-popup">
      <div style={{fontFamily:"'Fira Code',monospace",fontSize:9,color:"var(--mut)",padding:"4px 10px 8px",letterSpacing:"1px",textTransform:"uppercase"}}>Adicionar ao Google Agenda</div>
      {accs.map((acc,i)=>(<a key={i} className="gcal-item" href={buildGCalLink(title,description,dateStr,acc.email)} target="_blank" rel="noopener noreferrer" onClick={()=>setOpen(false)}>
        <div className="gcal-dot" style={{background:acc.color||ACCOUNT_COLORS[i%ACCOUNT_COLORS.length]}}/>{acc.name||acc.email||"Agenda"}
      </a>))}
    </div>)}
  </div>);
}

// ── DatePicker ────────────────────────────────────────────────────────────────
const MONTHS_PT=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DAYS_PT=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function DatePicker({value,onChange,placeholder="Selecionar data e hora",showTime=true}) {
  const [open,setOpen]=useState(false);
  const [viewDate,setViewDate]=useState(()=>value?new Date(value):new Date());
  const [selDate,setSelDate]=useState(value?new Date(value):null);
  const [time,setTime]=useState(()=>{ if(value){const d=new Date(value);return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;} return "09:00"; });
  const ref=useRef(null);
  useEffect(()=>{ const h=(e)=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);}; document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h); },[]);
  useEffect(()=>{ if(value){setSelDate(new Date(value));const d=new Date(value);setTime(`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`);} else setSelDate(null); },[value]);
  const getDays=()=>{ const y=viewDate.getFullYear(),m=viewDate.getMonth(),first=new Date(y,m,1).getDay(),total=new Date(y,m+1,0).getDate(),days=[]; for(let i=0;i<first;i++)days.push(null); for(let i=1;i<=total;i++)days.push(new Date(y,m,i)); return days; };
  const confirm=(d)=>{ if(!d)return; const[h,m]=time.split(":").map(Number); const r=new Date(d); r.setHours(h||0,m||0,0,0); onChange(r.toISOString().slice(0,16)); setOpen(false); };
  const today=new Date(); today.setHours(0,0,0,0);
  const fmtVal=(d)=>d?d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"})+(showTime?` ${time}`:""):null;
  return(<div className="cal-wrap" ref={ref}>
    <button type="button" className={`cal-input-btn ${open?"open":""}`} onClick={()=>setOpen(o=>!o)}>
      <span>📅</span>
      {selDate?<span>{fmtVal(selDate)}</span>:<span className="placeholder">{placeholder}</span>}
      {selDate&&<span style={{marginLeft:"auto",fontSize:11,color:"var(--mut)",cursor:"pointer"}} onClick={e=>{e.stopPropagation();onChange("");setSelDate(null);}}>✕</span>}
    </button>
    {open&&(<div className="cal-popup">
      <div className="cal-header">
        <button className="cal-nav" onClick={()=>setViewDate(d=>new Date(d.getFullYear(),d.getMonth()-1,1))}>‹</button>
        <div className="cal-month">{MONTHS_PT[viewDate.getMonth()]} {viewDate.getFullYear()}</div>
        <button className="cal-nav" onClick={()=>setViewDate(d=>new Date(d.getFullYear(),d.getMonth()+1,1))}>›</button>
      </div>
      <div className="cal-days-head">{DAYS_PT.map(d=><div key={d} className="cal-dh">{d}</div>)}</div>
      <div className="cal-days">{getDays().map((d,i)=>{ if(!d)return<div key={`e${i}`} className="cal-day empty"/>; const isT=d.getTime()===today.getTime(),isS=selDate&&d.toDateString()===selDate.toDateString(); return(<div key={i} className={`cal-day ${isT?"today":""} ${isS?"selected":""}`} onClick={()=>{setSelDate(d);if(!showTime)confirm(d);}}>{d.getDate()}</div>); })}</div>
      {showTime&&(<div className="cal-time"><label>Hora</label><input type="time" value={time} onChange={e=>setTime(e.target.value)}/></div>)}
      {showTime&&selDate&&(<button className="btn cal-confirm" onClick={()=>confirm(selDate)}>Confirmar</button>)}
    </div>)}
  </div>);
}

// ── Login Screen ──────────────────────────────────────────────────────────────
function LoginScreen() {
  const [email,setEmail]=useState("");
  const [senha,setSenha]=useState("");
  const [erro,setErro]=useState("");
  const [loading,setLoading]=useState(false);
  const entrar=async()=>{ if(!email.trim()||!senha.trim())return; setLoading(true);setErro(""); const{error}=await sb.auth.signInWithPassword({email:email.trim(),password:senha}); if(error)setErro("E-mail ou senha incorretos."); setLoading(false); };
  return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--bg)",padding:20}}>
    <style>{CSS}</style>
    <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:20,padding:"40px 36px",width:"100%",maxWidth:380}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{fontSize:32,marginBottom:8}}>✦</div>
        <div style={{fontSize:26,fontWeight:800,letterSpacing:-1}}>Nexus</div>
        <div style={{fontSize:13,color:"var(--sub)",marginTop:4}}>Seu assistente pessoal</div>
      </div>
      {erro&&<div style={{background:"rgba(240,107,107,.1)",border:"1px solid rgba(240,107,107,.3)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"var(--ar)",marginBottom:16}}>{erro}</div>}
      <div style={{marginBottom:14}}><label style={{fontSize:11,color:"var(--sub)",fontFamily:"Fira Code,monospace",letterSpacing:.5,textTransform:"uppercase"}}>E-mail</label><input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&entrar()} placeholder="seu@email.com" type="email" style={{marginTop:6,width:"100%"}} autoComplete="email"/></div>
      <div style={{marginBottom:24}}><label style={{fontSize:11,color:"var(--sub)",fontFamily:"Fira Code,monospace",letterSpacing:.5,textTransform:"uppercase"}}>Senha</label><input value={senha} onChange={e=>setSenha(e.target.value)} onKeyDown={e=>e.key==="Enter"&&entrar()} placeholder="••••••••" type="password" style={{marginTop:6,width:"100%"}} autoComplete="current-password"/></div>
      <button className="btn" style={{width:"100%",padding:"11px",fontSize:14,fontWeight:700}} onClick={entrar} disabled={loading}>{loading?"Entrando...":"Entrar →"}</button>
    </div>
  </div>);
}

// ── Panels (outside App to prevent re-mount on state change) ──────────────────
function Dash() {
  const {data,setTab,dueAlerts,pending,upcoming,cbPending}=useContext(NexusCtx);
  return(<div>
    <div className="ph"><div>
      <div className="pt">{saudacao()} ✦</div>
      <div className="ps">Resumo do seu dia</div>
    </div></div>
    {dueAlerts.map(c=>(<div key={c.id} className="alert-strip">⚠ Cobrança: <strong>{c.pessoa}</strong> — {c.tarefa} ({daysUntil(c.date)<=0?"VENCIDO":`em ${daysUntil(c.date)}d`})</div>))}
    <div className="dg">
      <div className="st sa" style={{cursor:"pointer"}} onClick={()=>setTab("cobrancas")}><div className="sn">{data.cobrancas.filter(c=>c.status==="pendente").length}</div><div className="sl">Cobranças pendentes</div></div>
      <div className="st sw" style={{cursor:"pointer"}} onClick={()=>setTab("tasks")}><div className="sn">{pending}</div><div className="sl">Tarefas abertas</div></div>
      <div className="st sg" style={{cursor:"pointer"}} onClick={()=>setTab("reminders")}><div className="sn">{upcoming}</div><div className="sl">Lembretes futuros</div></div>
      <div className="st sp" style={{cursor:"pointer"}} onClick={()=>setTab("reunioes")}><div className="sn">{data.reunioes.length}</div><div className="sl">Reuniões salvas</div></div>
    </div>
    <div className="fsec">Cobranças urgentes</div>
    <div className="cl">
      {data.cobrancas.filter(c=>c.prio==="urgente"&&c.status!=="entregue").slice(0,3).map(c=>(
        <div key={c.id} className="card" style={{cursor:"pointer"}} onClick={()=>setTab("cobrancas")}>
          <div className="pd pu"/>
          <div className="cb"><div className="ct">{c.pessoa} — {c.tarefa}</div><div className="cm">{c.date?fdtShort(c.date):"Sem data"}</div></div>
          <span className={`pill ${c.status==="pendente"?"pend":c.status==="cobrado"?"cobr":"entr"}`}>{c.status}</span>
        </div>
      ))}
      {!data.cobrancas.filter(c=>c.prio==="urgente"&&c.status!=="entregue").length&&<div className="empty">Nenhuma cobrança urgente.</div>}
    </div>
    <div className="fsec" style={{marginTop:20}}>Tarefas pendentes</div>
    <div className="cl">
      {data.tasks.filter(t=>!t.done).slice(0,5).map(t=>(
        <div key={t.id} className="card" style={{cursor:"pointer"}} onClick={()=>setTab("tasks")}>
          <div className={`pd ${t.prio==="alta"?"pu":"pn"}`}/>
          <div className="cb"><div className="ct">{t.text}</div><div className="cm"><span className={`tg ${t.prio==="alta"?"tu":t.prio==="media"?"tn2":"tp"}`}>{t.prio}</span></div></div>
        </div>
      ))}
      {!data.tasks.filter(t=>!t.done).length&&<div className="empty">Nenhuma tarefa pendente.</div>}
    </div>
  </div>);
}

function Cobrancas() {
  const {data,upd,accounts,cbPending,openCb}=useContext(NexusCtx);
  return(<div>
    <div className="ph"><div><div className="pt">Cobranças 👤</div><div className="ps">{cbPending} pendente{cbPending!==1?"s":""}</div></div><button className="btn bsm" onClick={()=>openCb("new")}>+ Nova cobrança</button></div>
    <div className="cl">
      {data.cobrancas.map(c=>{ const days=c.date?daysUntil(c.date):null; const dClass=days===null?"":days<0?"days-over":days<=2?"days-warn":"days-ok"; const initials=c.pessoa.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase(); return(
        <div key={c.id} className={`pcard ${c.status==="entregue"?"dn":""}`}>
          <div className="pcard-top">
            <div className="pcard-av">{initials}</div>
            <div className="pcard-info"><div className="pcard-name">{c.pessoa}</div><div className="pcard-task">{c.tarefa}</div></div>
            <div className="ca">
              <GCalBtn title={`Cobrar: ${c.pessoa}`} description={c.tarefa} dateStr={c.date} accounts={accounts}/>
              <button className="ib" onClick={()=>openCb(c)}>✎</button>
              <button className="ib ibdel" onClick={()=>upd("cobrancas",data.cobrancas.filter(x=>x.id!==c.id))}>✕</button>
            </div>
          </div>
          <div className="pcard-bottom">
            <span className={`urg-badge ${c.prio==="urgente"?"urg-u":"urg-n"}`}>{c.prio==="urgente"?"🔴 Urgente":"🟢 Normal"}</span>
            {c.date&&<span className={`days-chip ${dClass}`}>{days<0?`${Math.abs(days)}d atrasado`:days===0?"Hoje!":`${days}d restantes`}</span>}
            {c.date&&<span className="cm">Entrega: {fdtShort(c.date)}</span>}
            <div style={{marginLeft:"auto",display:"flex",gap:5,flexWrap:"wrap"}}>
              {["pendente","cobrado","entregue"].map(s=>(<span key={s} className={`pill ${s==="pendente"?"pend":s==="cobrado"?"cobr":"entr"}`} style={{opacity:c.status===s?1:.3}} onClick={()=>upd("cobrancas",data.cobrancas.map(x=>x.id===c.id?{...x,status:s}:x))}>{s}</span>))}
            </div>
          </div>
        </div>
      );})}
      {!data.cobrancas.length&&<div className="empty">Nenhuma cobrança ainda.</div>}
    </div>
  </div>);
}

function Tasks() {
  const {data,upd,taskText,setTaskText,taskPrio,setTaskPrio,addTask,pending}=useContext(NexusCtx);
  return(<div>
    <div className="ph"><div><div className="pt">Tarefas</div><div className="ps">{pending} pendente{pending!==1?"s":""}</div></div></div>
    <div className="frow">
      <div className="fg"><input value={taskText} onChange={e=>setTaskText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTask()} placeholder="Nova tarefa..."/></div>
      <select value={taskPrio} onChange={e=>setTaskPrio(e.target.value)} style={{width:"auto"}}><option value="alta">🔴 Alta</option><option value="media">🟡 Média</option><option value="baixa">🟢 Baixa</option></select>
      <button className="btn" onClick={addTask}>+</button>
    </div>
    <div className="cl">
      {data.tasks.map(t=>(<div key={t.id} className={`card ${t.done?"dn":""}`}>
        <div className={`pd ${t.prio==="alta"?"pu":"pn"}`}/>
        <div className="cb"><div className="ct">{t.text}</div><div className="cm"><span className={`tg ${t.prio==="alta"?"tu":t.prio==="media"?"tn2":"tp"}`}>{t.prio}</span>· {fdt(t.created)}</div></div>
        <div className="ca">
          <div className={`chk ${t.done?"on":""}`} onClick={()=>upd("tasks",data.tasks.map(x=>x.id===t.id?{...x,done:!x.done}:x))}>{t.done?"✓":""}</div>
          <button className="ib ibdel" onClick={()=>upd("tasks",data.tasks.filter(x=>x.id!==t.id))}>✕</button>
        </div>
      </div>))}
      {!data.tasks.length&&<div className="empty">Nenhuma tarefa ainda.</div>}
    </div>
  </div>);
}

function Reminders() {
  const {data,upd,accounts,remText,setRemText,remDate,setRemDate,addRem,upcoming}=useContext(NexusCtx);
  return(<div>
    <div className="ph"><div><div className="pt">Lembretes</div><div className="ps">{upcoming} futuro{upcoming!==1?"s":""}</div></div></div>
    <div className="frow">
      <div className="fg"><input value={remText} onChange={e=>setRemText(e.target.value)} placeholder="Novo lembrete..."/></div>
      <div className="fg"><DatePicker value={remDate} onChange={setRemDate} placeholder="Data e hora"/></div>
      <button className="btn" onClick={addRem}>+</button>
    </div>
    <div className="cl">
      {[...data.reminders].sort((a,b)=>new Date(a.date)-new Date(b.date)).map(r=>{ const past=new Date(r.date)<=new Date(); return(
        <div key={r.id} className={`card ${past?"dn":""}`}>
          <span style={{fontSize:15}}>◷</span>
          <div className="cb"><div className="ct">{r.text}</div><div className="cm"><span className={`tg ${past?"tu":"tc"}`}>{past?"Expirado":"Agendado"}</span>{fdt(r.date)}</div></div>
          <div className="ca">
            <GCalBtn title={r.text} description="Lembrete do Nexus" dateStr={r.date} accounts={accounts}/>
            <button className="ib ibdel" onClick={()=>upd("reminders",data.reminders.filter(x=>x.id!==r.id))}>✕</button>
          </div>
        </div>
      );})}
      {!data.reminders.length&&<div className="empty">Nenhum lembrete ainda.</div>}
    </div>
  </div>);
}

function Reunioes() {
  const {data,upd,setReuModal,setReuTitle,setReuPartic,setReuText,setTranscript,setReuDetail}=useContext(NexusCtx);
  return(<div>
    <div className="ph"><div><div className="pt">Reuniões 🎙</div><div className="ps">{data.reunioes.length} salva{data.reunioes.length!==1?"s":""}</div></div><button className="btn bsm" onClick={()=>{setReuTitle("");setReuPartic("");setReuText("");setTranscript("");setReuModal("new");}}>+ Nova reunião</button></div>
    <div className="cl">
      {data.reunioes.map(r=>(<div key={r.id} className="rcard" onClick={()=>setReuDetail(r)}>
        <div className="rcard-head">
          <div><div className="rcard-title">{r.title}</div>{r.participantes&&<div className="rcard-meta">👥 {r.participantes}</div>}</div>
          <div style={{display:"flex",gap:5}}><div className="cm">{fdt(r.created)}</div><button className="ib ibdel" onClick={e=>{e.stopPropagation();upd("reunioes",data.reunioes.filter(x=>x.id!==r.id));}}>✕</button></div>
        </div>
        <div className="rcard-prev">{r.texto||<span style={{fontStyle:"italic",color:"var(--mut)"}}>Sem transcrição</span>}</div>
      </div>))}
      {!data.reunioes.length&&<div className="empty">Nenhuma reunião salva ainda.</div>}
    </div>
  </div>);
}

function Notes() {
  const {data,upd,setNoteModal,setNoteTitle,setNoteBody}=useContext(NexusCtx);
  return(<div>
    <div className="ph"><div><div className="pt">Notas</div><div className="ps">{data.notes.length} nota{data.notes.length!==1?"s":""}</div></div><button className="btn bsm" onClick={()=>{setNoteTitle("");setNoteBody("");setNoteModal("new");}}>+ Nova nota</button></div>
    <div className="ng">
      {data.notes.map(n=>(<div key={n.id} className="nc" onClick={()=>{setNoteModal(n);setNoteTitle(n.title);setNoteBody(n.body);}}>
        <div className="nct">{n.title||"Sem título"}</div>
        <div className="ncp">{n.body||<span style={{fontStyle:"italic"}}>Vazio</span>}</div>
        <div className="ncd">{fdt(n.updated)}</div>
        <button className="ib ibdel ncdel bsm" onClick={e=>{e.stopPropagation();upd("notes",data.notes.filter(x=>x.id!==n.id));}}>✕</button>
      </div>))}
      {!data.notes.length&&<div className="empty">Nenhuma nota ainda.</div>}
    </div>
  </div>);
}

function Chat() {
  const {data,upd,chatInput,setChatInput,aiLoading,sendMsg,msgsEnd}=useContext(NexusCtx);
  return(<div className="csh">
    <div className="ph" style={{flexShrink:0}}><div><div className="pt">Chat IA ✦</div><div className="ps">Converse com o Nexus</div></div></div>
    <div className="cms">
      {!data.messages.length&&(<div className="msg ai"><div className="av">N</div><div><div className="bbl">Olá! Sou o Nexus. Posso ajudar com tarefas, cobranças, reuniões e muito mais. 👋</div><div className="mt">agora</div></div></div>)}
      {data.messages.map(m=>(<div key={m.id} className={`msg ${m.role==="user"?"u":"ai"}`}><div className="av">{m.role==="user"?"V":"N"}</div><div><div className="bbl" style={{whiteSpace:"pre-wrap"}}>{m.content}</div><div className="mt">{fdt(m.ts)}</div></div></div>))}
      {aiLoading&&<div className="msg ai"><div className="av">N</div><div className="bbl"><div className="dots"><span/><span/><span/></div></div></div>}
      <div ref={msgsEnd}/>
    </div>
    <div className="cin">
      <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendMsg()} placeholder="Digite sua mensagem..." disabled={aiLoading}/>
      <button className="btn" onClick={sendMsg} disabled={aiLoading||!chatInput.trim()}>↑</button>
    </div>
  </div>);
}

function Config() {
  const {data,upd}=useContext(NexusCtx);
  const [gcalSigned,setGcalSigned]=useState(false);
  const [calendars,setCalendars]=useState([]);
  const [selCal,setSelCal]=useState(null);
  const [events,setEvents]=useState([]);
  const [loadingCals,setLoadingCals]=useState(false);
  const [loadingEvts,setLoadingEvts]=useState(false);
  const [gapiReady,setGapiReady]=useState(false);
  const [newEvt,setNewEvt]=useState({title:"",date:"",cal:""});
  const [creatingEvt,setCreatingEvt]=useState(false);
  const [configTab,setConfigTab]=useState("agenda");

  const loadEvents=async(calId)=>{
    setLoadingEvts(true);
    try{ const evts=await gcalListEvents(calId,30); setEvents(evts); }
    catch(e){console.error(e);}
    setLoadingEvts(false);
  };

  const loadCalendars=async()=>{
    setLoadingCals(true);
    try{
      const cals=await gcalListCalendars();
      setCalendars(cals);
      if(cals.length>0){setSelCal(cals[0].id);loadEvents(cals[0].id);}
    }catch(e){console.error(e);}
    setLoadingCals(false);
  };

  // Check if already have token on mount
  useEffect(()=>{
    setGapiReady(true);
    if(_gcalToken&&_gcalToken.expires_at>Date.now()){
      setGcalSigned(true);
      loadCalendars();
    }
  // eslint-disable-next-line
  },[]);

  const handleSignIn=async()=>{
    try{
      // Extra protection: backup Supabase keys to sessionStorage
      const supaKeys = Object.keys(localStorage).filter(k => k.includes("supabase") || k.includes("nexus"));
      const supaBackup = {};
      supaKeys.forEach(k => { supaBackup[k] = localStorage.getItem(k); sessionStorage.setItem("_bk_"+k, localStorage.getItem(k)); });
      
      await gcalGetToken();
      
      // Restore any lost keys
      supaKeys.forEach(k => { if (!localStorage.getItem(k) && supaBackup[k]) localStorage.setItem(k, supaBackup[k]); });
      
      setGcalSigned(true);
      loadCalendars();
    }catch(e){console.error("GCal signin error",e);}
  };

  const handleSignOut=()=>{
    gcalSignOut();
    setGcalSigned(false);
    
    setCalendars([]);
    setEvents([]);
  };

  const handleCreateEvent=async()=>{
    if(!newEvt.title.trim()||!newEvt.date||!newEvt.cal)return;
    setCreatingEvt(true);
    try{
      const start=new Date(newEvt.date);
      const end=new Date(start.getTime()+3600000);
      await gcalCreateEvent(newEvt.cal,newEvt.title,"Criado pelo Nexus",start.toISOString(),end.toISOString());
      setNewEvt({title:"",date:"",cal:newEvt.cal});
      loadEvents(selCal||newEvt.cal);
      alert("Evento criado com sucesso! ✅");
    }catch(e){alert("Erro ao criar evento: "+e.message);}
    setCreatingEvt(false);
  };

  const fmtEvtTime=(evt)=>{
    if(evt.start?.dateTime) return new Date(evt.start.dateTime).toLocaleString("pt-BR",{weekday:"short",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
    if(evt.start?.date) return new Date(evt.start.date+"T00:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"long"});
    return "—";
  };

  const calColor=(cal)=>cal.backgroundColor||"#5b8af0";

  // Sync calendars to Nexus accounts
  const syncToNexus=()=>{
    const existing=data.gcalAccounts||[];
    const newAccs=calendars
      .filter(c=>!existing.some(e=>e.email===c.id||e.email===c.summary))
      .map((c,i)=>({id:c.id,name:c.summary,email:c.id,color:c.backgroundColor||ACCOUNT_COLORS[(existing.length+i)%ACCOUNT_COLORS.length]}));
    const merged=[...existing,...newAccs];
    upd("gcalAccounts",merged);
    alert(newAccs.length>0?`${newAccs.length} nova(s) agenda(s) adicionada(s) ao Nexus! ✅`:"Todas as agendas já estavam sincronizadas. ✅");
  };

  return(<div>
    <div className="ph">
      <div><div className="pt">Google Agenda 📅</div><div className="ps">{gcalSigned?"Google conectado ✓":"Conecte sua conta Google"}</div></div>
      {gcalSigned&&<div style={{display:"flex",gap:8}}>
        <button className="btn bsec bsm" onClick={syncToNexus} title="Sincronizar agendas com o Nexus">↻ Sync</button>
        <button className="btn bdng bsm" onClick={handleSignOut}>Desconectar</button>
      </div>}
    </div>

    {!gcalSigned&&(<div className="gcal-signin-box">
      <div style={{fontSize:48}}>📅</div>
      <div style={{fontSize:16,fontWeight:700}}>Conecte sua conta Google</div>
      <div style={{fontSize:13,color:"var(--sub)",maxWidth:320}}>Visualize e crie eventos em todas as suas agendas diretamente do Nexus.</div>
      {gapiReady
        ?<button className="gcal-connect-btn" onClick={handleSignIn}>
          <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
          Entrar com Google
        </button>
        :<div style={{color:"var(--mut)",fontSize:13}}>Carregando...</div>
      }
    </div>)}

    {gcalSigned&&(<div>
      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:20,borderBottom:"1px solid var(--b1)",paddingBottom:12}}>
        {[{id:"agenda",label:"📅 Agenda"},{id:"novo",label:"➕ Novo evento"}].map(t=>(<button key={t.id} className={"btn bsm "+(configTab===t.id?"":"bsec")} onClick={()=>setConfigTab(t.id)}>{t.label}</button>))}
      </div>

      {configTab==="agenda"&&(<div className="gcal-panel">
        {/* Calendar list */}
        <div className="gcal-sidebar">
          <div style={{fontSize:11,fontWeight:700,color:"var(--mut)",letterSpacing:.5,textTransform:"uppercase",marginBottom:4}}>Suas agendas</div>
          {loadingCals&&<div style={{color:"var(--mut)",fontSize:13}}>Carregando...</div>}
          {calendars.map(cal=>(<div key={cal.id} className={"gcal-cal-item"+(selCal===cal.id?" sel":"")} onClick={()=>{setSelCal(cal.id);loadEvents(cal.id);}}>
            <div className="gcal-cal-dot" style={{background:calColor(cal)}}/>
            <div className="gcal-cal-name">{cal.summary}</div>
          </div>))}
        </div>
        {/* Events list */}
        <div>
          <div style={{fontSize:11,fontWeight:700,color:"var(--mut)",letterSpacing:.5,textTransform:"uppercase",marginBottom:12}}>
            Próximos eventos {selCal&&calendars.find(c=>c.id===selCal)&&`— ${calendars.find(c=>c.id===selCal).summary}`}
          </div>
          {loadingEvts&&<div style={{color:"var(--mut)",fontSize:13}}>Carregando eventos...</div>}
          <div className="gcal-events">
            {events.map(evt=>(<div key={evt.id} className="gcal-event" style={{borderLeftColor:selCal&&calendars.find(c=>c.id===selCal)?calColor(calendars.find(c=>c.id===selCal)):"var(--ac)"}}>
              <div className="gcal-event-title">{evt.summary||"(Sem título)"}</div>
              <div className="gcal-event-time">{fmtEvtTime(evt)}</div>
              {evt.location&&<div className="gcal-event-loc">📍 {evt.location}</div>}
              {evt.description&&<div style={{fontSize:11,color:"var(--mut)",marginTop:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{evt.description}</div>}
            </div>))}
            {!loadingEvts&&!events.length&&<div className="empty">Nenhum evento próximo nesta agenda.</div>}
          </div>
        </div>
      </div>)}

      {configTab==="novo"&&(<div style={{maxWidth:480}}>
        <div className="gcal-new-event">
          <div className="gcal-new-title">➕ Criar novo evento</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div><label>Agenda</label>
              <select value={newEvt.cal} onChange={e=>setNewEvt(x=>({...x,cal:e.target.value}))}>
                <option value="">Selecione uma agenda...</option>
                {calendars.filter(c=>c.accessRole==="owner"||c.accessRole==="writer").map(c=>(<option key={c.id} value={c.id}>{c.summary}</option>))}
              </select>
            </div>
            <div><label>Título do evento *</label><input value={newEvt.title} onChange={e=>setNewEvt(x=>({...x,title:e.target.value}))} placeholder="Ex: Reunião com equipe"/></div>
            <div><label>Data e hora *</label><DatePicker value={newEvt.date} onChange={v=>setNewEvt(x=>({...x,date:v}))} placeholder="Selecionar data e hora"/></div>
            <button className="btn" style={{marginTop:4}} onClick={handleCreateEvent} disabled={creatingEvt||!newEvt.title||!newEvt.date||!newEvt.cal}>{creatingEvt?"Criando...":"Criar evento no Google Agenda"}</button>
          </div>
        </div>
        <div style={{background:"rgba(91,138,240,.06)",border:"1px solid rgba(91,138,240,.2)",borderRadius:"var(--r10)",padding:"14px 16px",fontSize:13,color:"var(--sub)",lineHeight:1.6}}>
          💡 Clique em <strong>↻ Sync</strong> para importar suas agendas conectadas para o botão 📅 nos lembretes e cobranças.
        </div>
      </div>)}
    </div>)}
  </div>);
}

function Rotina() {
  const {data,upd,todayKey,todayStr,rotinaModal,setRotinaModal,habModal,setHabModal,rotinaItem,setRotinaItem,habItem,setHabItem,rotinaTab,setRotinaTab,toggleHabito,toggleRotina,habDone,rotDone,habsFeitos,rotFeitos,totalHabs,totalRot,getWeekStats,getWeekDates,getNowMinutes,timeToMin}=useContext(NexusCtx);
  const WEEK_DAYS_R=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  const CAT_COLORS={trabalho:"cat-work",saude:"cat-saude",pessoal:"cat-pessoal",pausa:"cat-pausa"};
  const CAT_ICONS={trabalho:"💼",saude:"💪",pessoal:"🌟",pausa:"☕"};
  const HAB_ICONS_LIST=["💧","🏃","📚","🧘","🥗","😴","✍️","🎯","🚴","🎵"];
  const nowMin=getNowMinutes();
  const sorted=[...(data.rotina||[])].sort((a,b)=>timeToMin(a.hora)-timeToMin(b.hora));
  const weekDates=getWeekDates();
  return(<div>
    <div className="ph">
      <div><div className="pt">Rotina 🌅</div><div className="ps">{todayStr}</div></div>
      <div style={{display:"flex",gap:8}}>
        <button className="btn bsec bsm" onClick={()=>setHabModal(true)}>+ Hábito</button>
        <button className="btn bsm" onClick={()=>setRotinaModal(true)}>+ Atividade</button>
      </div>
    </div>
    <div style={{display:"flex",gap:6,marginBottom:20,borderBottom:"1px solid var(--b1)",paddingBottom:12}}>
      {[{id:"hoje",label:"📋 Hoje"},{id:"semana",label:"📅 Semana"},{id:"relatorio",label:"📊 Relatório"}].map(t=>(<button key={t.id} className={"btn bsm "+(rotinaTab===t.id?"":"bsec")} onClick={()=>setRotinaTab(t.id)}>{t.label}</button>))}
    </div>
    {rotinaTab==="hoje"&&(<div className="rotina-grid">
      <div>
        <div className="rotina-block-title">⏱ Linha do tempo</div>
        {totalRot>0&&(<div style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--mut)",marginBottom:4}}><span>Progresso</span><span style={{fontFamily:"Fira Code,monospace"}}>{rotFeitos}/{totalRot}</span></div><div className="prog-bar"><div className="prog-fill" style={{width:(totalRot?rotFeitos/totalRot*100:0)+"%"}}/></div></div>)}
        <div className="timeline">
          {sorted.map(item=>{ const isDone=rotDone(item.id),isCur=timeToMin(item.hora)<=nowMin&&timeToMin(item.hora)>=nowMin-60; return(<div key={item.id} className={"tl-item"+(isDone?" done-tl":"")+(isCur&&!isDone?" current":"")} onClick={()=>toggleRotina(item.id)}>
            <div className="tl-time">{item.hora}</div><div className="tl-dot"/>
            <div className="tl-title">{item.titulo}</div>
            <span className={"tl-cat "+(CAT_COLORS[item.categoria]||"cat-work")}>{CAT_ICONS[item.categoria]}</span>
            <button className="ib ibdel" style={{width:20,height:20,fontSize:10}} onClick={e=>{e.stopPropagation();upd("rotina",(data.rotina||[]).filter(r=>r.id!==item.id));}}>✕</button>
          </div>);})}
          {!sorted.length&&<div className="empty">Nenhuma atividade ainda.</div>}
        </div>
      </div>
      <div>
        <div className="rotina-block-title">✦ Hábitos de hoje</div>
        {totalHabs>0&&(<div style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--mut)",marginBottom:4}}><span>Concluídos</span><span style={{fontFamily:"Fira Code,monospace"}}>{habsFeitos}/{totalHabs}</span></div><div className="prog-bar"><div className="prog-fill" style={{width:(totalHabs?habsFeitos/totalHabs*100:0)+"%",background:"linear-gradient(90deg,var(--ag),var(--ac))"}}/></div></div>)}
        <div className="hab-grid">
          {(data.habitos||[]).map(h=>(<div key={h.id} className={"hab-card"+(habDone(h.id)?" done-h":"")} onClick={()=>toggleHabito(h.id)}>{habDone(h.id)&&<div className="hab-check">✓</div>}<div className="hab-icon">{h.icon}</div><div className="hab-name">{h.nome}</div></div>))}
          {!(data.habitos||[]).length&&<div className="empty">Nenhum hábito ainda.</div>}
        </div>
      </div>
    </div>)}
    {rotinaTab==="semana"&&(<div>
      <div className="rotina-block-title" style={{marginBottom:12}}>📅 Esta semana</div>
      <div className="week-grid">
        {weekDates.map((d,i)=>{ const key=d.toISOString().slice(0,10),isToday=key===todayKey,rots=(data.rotina||[]).filter(r=>data.semana?.["rot_"+key]?.[r.id]),habs=(data.habitos||[]).filter(h=>data.semana?.[key]?.[h.id]); return(<div key={key} className={"week-day"+(isToday?" today-w":"")+((rots.length||habs.length)?" has-items":"")}>
          <div className="week-day-name">{WEEK_DAYS_R[i]}</div><div className="week-day-num">{d.getDate()}</div>
          {rots.slice(0,2).map(r=><div key={r.id} className="week-dot" style={{background:"var(--ac)"}}/>)}
          {habs.slice(0,2).map(h=><div key={h.id} className="week-dot" style={{background:"var(--ag)"}}/>)}
        </div>);})}
      </div>
      <div style={{marginTop:12,display:"flex",gap:12,fontSize:11,color:"var(--mut)"}}><span>🔵 Atividades</span><span>🟢 Hábitos</span></div>
    </div>)}
    {rotinaTab==="relatorio"&&(<div>
      <div className="rotina-block-title" style={{marginBottom:12}}>📊 Relatório semanal</div>
      <div className="relatorio">
        <div className="rel-card"><div className="rel-num" style={{color:"var(--ac)"}}>{getWeekStats().rotDays}</div><div className="rel-lbl">Dias com atividades</div></div>
        <div className="rel-card"><div className="rel-num" style={{color:"var(--ag)"}}>{getWeekStats().habDays}</div><div className="rel-lbl">Dias com hábitos</div></div>
        <div className="rel-card"><div className="rel-num" style={{color:"var(--ap)"}}>{totalHabs}</div><div className="rel-lbl">Hábitos ativos</div></div>
        <div className="rel-card"><div className="rel-num" style={{color:"var(--aw)"}}>{totalRot}</div><div className="rel-lbl">Atividades na rotina</div></div>
      </div>
      <div style={{marginTop:20}}>
        <div className="rotina-block-title" style={{marginBottom:10}}>Consistência por hábito (7 dias)</div>
        <div className="cl">
          {(data.habitos||[]).map(h=>{ const wk=getWeekDates().map(d=>d.toISOString().slice(0,10)),cnt=wk.filter(d=>data.semana?.[d]?.[h.id]).length; return(<div key={h.id} className="card" style={{padding:"10px 14px"}}><span style={{fontSize:18}}>{h.icon}</span><div className="cb"><div className="ct">{h.nome}</div><div className="prog-bar" style={{marginTop:6}}><div className="prog-fill" style={{width:(cnt/7*100)+"%",background:"linear-gradient(90deg,var(--ag),var(--ac))"}}/></div></div><div style={{fontFamily:"Fira Code,monospace",fontSize:11,color:"var(--ag)",flexShrink:0}}>{cnt}/7</div><button className="ib ibdel" onClick={()=>upd("habitos",(data.habitos||[]).filter(hh=>hh.id!==h.id))}>✕</button></div>);})}
          {!(data.habitos||[]).length&&<div className="empty">Adicione hábitos para ver o relatório.</div>}
        </div>
      </div>
    </div>)}
    {rotinaModal&&(<div className="mov" onClick={()=>setRotinaModal(false)}><div className="mod" onClick={e=>e.stopPropagation()}>
      <div className="mh"><div className="mtt">Nova atividade</div><button className="ib ibdel" onClick={()=>setRotinaModal(false)}>✕</button></div>
      <div><label>Horário</label><input type="time" value={rotinaItem.hora} onChange={e=>setRotinaItem(x=>({...x,hora:e.target.value}))}/></div>
      <div><label>Atividade *</label><input value={rotinaItem.titulo} onChange={e=>setRotinaItem(x=>({...x,titulo:e.target.value}))} placeholder="Ex: Academia, Reunião, Almoço..."/></div>
      <div><label>Categoria</label><select value={rotinaItem.categoria} onChange={e=>setRotinaItem(x=>({...x,categoria:e.target.value}))}><option value="trabalho">💼 Trabalho</option><option value="saude">💪 Saúde</option><option value="pessoal">🌟 Pessoal</option><option value="pausa">☕ Pausa</option></select></div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
        <button className="btn bsec bsm" onClick={()=>setRotinaModal(false)}>Cancelar</button>
        <button className="btn bsm" onClick={()=>{if(!rotinaItem.titulo.trim())return;upd("rotina",[...(data.rotina||[]),{id:uid(),...rotinaItem}]);setRotinaItem({hora:"08:00",titulo:"",categoria:"trabalho"});setRotinaModal(false);}}>Salvar</button>
      </div>
    </div></div>)}
    {habModal&&(<div className="mov" onClick={()=>setHabModal(false)}><div className="mod" onClick={e=>e.stopPropagation()}>
      <div className="mh"><div className="mtt">Novo hábito</div><button className="ib ibdel" onClick={()=>setHabModal(false)}>✕</button></div>
      <div><label>Nome *</label><input value={habItem.nome} onChange={e=>setHabItem(x=>({...x,nome:e.target.value}))} placeholder="Ex: Beber água, Exercício, Leitura..."/></div>
      <div><label>Ícone</label><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>
        {HAB_ICONS_LIST.map(ic=>(<div key={ic} onClick={()=>setHabItem(x=>({...x,icon:ic}))} style={{width:38,height:38,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,cursor:"pointer",background:habItem.icon===ic?"var(--s4)":"var(--s2)",border:"1px solid "+(habItem.icon===ic?"var(--ac)":"var(--b1)")}}>{ic}</div>))}
      </div></div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
        <button className="btn bsec bsm" onClick={()=>setHabModal(false)}>Cancelar</button>
        <button className="btn bsm" onClick={()=>{if(!habItem.nome.trim())return;upd("habitos",[...(data.habitos||[]),{id:uid(),...habItem}]);setHabItem({nome:"",icon:"💧"});setHabModal(false);}}>Salvar</button>
      </div>
    </div></div>)}
  </div>);
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [session,setSession]=useState(null);
  const [perfil,setPerfil]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [data,setData]=useState(loadLocal);
  const [tab,setTab]=useState("dash");
  const [clock,setClock]=useState(clk());

  // Cobrança form
  const [cbModal,setCbModal]=useState(null);
  const [cbPessoa,setCbPessoa]=useState("");
  const [cbTarefa,setCbTarefa]=useState("");
  const [cbDate,setCbDate]=useState("");
  const [cbPrio,setCbPrio]=useState("normal");
  const [cbDias,setCbDias]=useState(1);

  // Note modal
  const [noteModal,setNoteModal]=useState(null);
  const [noteTitle,setNoteTitle]=useState("");
  const [noteBody,setNoteBody]=useState("");

  // Reunião modal
  const [reuModal,setReuModal]=useState(null);
  const [reuTitle,setReuTitle]=useState("");
  const [reuPartic,setReuPartic]=useState("");
  const [reuText,setReuText]=useState("");
  const [reuDetail,setReuDetail]=useState(null);

  // Recording
  const [recording,setRecording]=useState(false);
  const [recTime,setRecTime]=useState(0);
  const [transcript,setTranscript]=useState("");
  const recTimerRef=useRef(null);
  const recogRef=useRef(null);

  // Tasks / Reminders
  const [taskText,setTaskText]=useState("");
  const [taskPrio,setTaskPrio]=useState("media");
  const [remText,setRemText]=useState("");
  const [remDate,setRemDate]=useState("");

  // Chat
  const [chatInput,setChatInput]=useState("");
  const [aiLoading,setAiLoading]=useState(false);
  const msgsEnd=useRef(null);

  // Config
  const [newAccName,setNewAccName]=useState("");
  const [newAccEmail,setNewAccEmail]=useState("");
  const [resumindo,setResumindo]=useState(false);

  // Rotina
  const todayKey=new Date().toISOString().slice(0,10);
  const todayStr=new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"});
  const [rotinaModal,setRotinaModal]=useState(false);
  const [habModal,setHabModal]=useState(false);
  const [rotinaItem,setRotinaItem]=useState({hora:"08:00",titulo:"",categoria:"trabalho"});
  const [habItem,setHabItem]=useState({nome:"",icon:"💧"});
  const [rotinaTab,setRotinaTab]=useState("hoje");

  // Auth
  useEffect(()=>{
    sb.auth.getSession().then(({data:{session}})=>{setSession(session);setAuthLoading(false);});
    const {data:{subscription}}=sb.auth.onAuthStateChange((_e,session)=>{setSession(session);if(!session){setPerfil(null);}});
    return()=>subscription.unsubscribe();
  },[]);

  // Load from Supabase
  useEffect(()=>{
    if(!session)return;
    const userId=session.user.id;
    const load=async()=>{
      const[{data:prof},{data:tasks},{data:reminders},{data:cobrancas},{data:notes},{data:reunioes},{data:rotina},{data:habitos},{data:gcal},{data:registros}]=await Promise.all([
        sb.from("profiles").select("*").eq("id",userId).single(),
        sb.from("tasks").select("*").eq("user_id",userId).order("created_at",{ascending:false}),
        sb.from("reminders").select("*").eq("user_id",userId).order("date"),
        sb.from("cobrancas").select("*").eq("user_id",userId).order("created_at",{ascending:false}),
        sb.from("notes").select("*").eq("user_id",userId).order("updated_at",{ascending:false}),
        sb.from("reunioes").select("*").eq("user_id",userId).order("created_at",{ascending:false}),
        sb.from("rotina").select("*").eq("user_id",userId),
        sb.from("habitos").select("*").eq("user_id",userId),
        sb.from("gcal_accounts").select("*").eq("user_id",userId),
        sb.from("registros_diarios").select("*").eq("user_id",userId),
      ]);
      setPerfil(prof);
      const semana={};
      (registros||[]).forEach(r=>{
        if(r.tipo==="habito"){if(!semana[r.data])semana[r.data]={};semana[r.data][r.item_id]=r.feito;}
        if(r.tipo==="rotina"){const k="rot_"+r.data;if(!semana[k])semana[k]={};semana[k][r.item_id]=r.feito;}
      });
      setData(d=>({...d,tasks:tasks||[],reminders:reminders||[],cobrancas:cobrancas||[],notes:notes||[],reunioes:reunioes||[],rotina:rotina||[],habitos:habitos||[],gcalAccounts:gcal||[],semana}));
    };
    load();
  },[session]);

  useEffect(()=>{saveLocal(data);},[data]);
  useEffect(()=>{const t=setInterval(()=>setClock(clk()),30000);return()=>clearInterval(t);},[]);
  useEffect(()=>{if(tab==="chat")msgsEnd.current?.scrollIntoView({behavior:"smooth"});},[data.messages,tab,aiLoading]);

  const upd=useCallback((key,val)=>setData(d=>({...d,[key]:val})),[]);
  const accounts=data.gcalAccounts||[];

  const dueAlerts=data.cobrancas.filter(c=>{const days=daysUntil(c.date);return c.date&&days<=(c.diasAviso||1)&&days>=-30;});
  const pending=data.tasks.filter(t=>!t.done).length;
  const upcoming=data.reminders.filter(r=>new Date(r.date)>new Date()).length;
  const cbPending=data.cobrancas.filter(c=>c.status!=="entregue").length;

  const addTask=()=>{if(!taskText.trim())return;upd("tasks",[{id:uid(),text:taskText.trim(),prio:taskPrio,done:false,created:Date.now()},...data.tasks]);setTaskText("");setTaskPrio("media");};
  const addRem=()=>{if(!remText.trim()||!remDate)return;upd("reminders",[{id:uid(),text:remText.trim(),date:remDate,created:Date.now()},...data.reminders]);setRemText("");setRemDate("");};

  const openCb=(obj)=>{ if(obj==="new"){setCbPessoa("");setCbTarefa("");setCbDate("");setCbPrio("normal");setCbDias(1);} else{setCbPessoa(obj.pessoa);setCbTarefa(obj.tarefa);setCbDate(obj.date||"");setCbPrio(obj.prio);setCbDias(obj.diasAviso||1);} setCbModal(obj); };
  const saveCb=()=>{ if(!cbPessoa.trim()||!cbTarefa.trim())return; const item={id:cbModal?.id||uid(),pessoa:cbPessoa.trim(),tarefa:cbTarefa.trim(),date:cbDate,prio:cbPrio,diasAviso:Number(cbDias),status:cbModal?.status||"pendente",created:cbModal?.created||Date.now()}; if(cbModal==="new")upd("cobrancas",[item,...data.cobrancas]); else upd("cobrancas",data.cobrancas.map(c=>c.id===item.id?item:c)); setCbModal(null); };
  const saveNote=()=>{ if(!noteTitle.trim()&&!noteBody.trim())return; if(noteModal&&noteModal!=="new")upd("notes",data.notes.map(n=>n.id===noteModal.id?{...n,title:noteTitle,body:noteBody,updated:Date.now()}:n)); else upd("notes",[{id:uid(),title:noteTitle||"Sem título",body:noteBody,created:Date.now(),updated:Date.now()},...data.notes]); setNoteModal(null); };

  const sendMsg=async()=>{ const txt=chatInput.trim(); if(!txt||aiLoading)return; const nm={id:uid(),role:"user",content:txt,ts:Date.now()}; const updated=[...data.messages,nm]; upd("messages",updated); setChatInput("");setAiLoading(true); try{const history=updated.map(m=>({role:m.role==="user"?"user":"assistant",content:m.content}));const reply=await askClaude(history);upd("messages",[...updated,{id:uid(),role:"ai",content:reply,ts:Date.now()}]);}catch{upd("messages",[...updated,{id:uid(),role:"ai",content:"Erro. Tente novamente.",ts:Date.now()}]);} setAiLoading(false); };

  const exportData=()=>{ const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}); const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`nexus_${new Date().toISOString().slice(0,10)}.json`;a.click(); };

  // Recording
  const startRecording=()=>{ if(!("webkitSpeechRecognition"in window||"SpeechRecognition"in window)){alert("Seu navegador não suporta gravação. Use o Chrome.");return;} const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition; const recog=new SpeechRecognition(); recog.lang="pt-BR";recog.continuous=true;recog.interimResults=false; recog.onresult=(e)=>{let final="";for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)final+=e.results[i][0].transcript+" ";}setTranscript(prev=>prev+final);}; recog.start();recogRef.current=recog;setRecording(true);setRecTime(0); recTimerRef.current=setInterval(()=>setRecTime(t=>t+1),1000); };
  const stopRecording=()=>{ recogRef.current?.stop();clearInterval(recTimerRef.current);setRecording(false); };
  const fmtTimer=(s)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  const resumirReu=async()=>{ if(!transcript.trim())return;setResumindo(true);try{const r=await askClaude([{role:"user",content:`Resuma esta transcrição de reunião de forma estruturada com: tópicos discutidos, decisões tomadas e próximas ações:\n\n${transcript}`}]);setReuText(r);}catch{}setResumindo(false); };

  // Rotina helpers
  const getNowMinutes=()=>{const n=new Date();return n.getHours()*60+n.getMinutes();};
  const timeToMin=(t)=>{const[h,m]=(t||"00:00").split(":").map(Number);return h*60+m;};
  const getWeekDates=()=>{const today=new Date();today.setHours(0,0,0,0);const dow=today.getDay();return Array.from({length:7},(_,i)=>{const d=new Date(today);d.setDate(today.getDate()-dow+i);return d;});};
  const habDone=(id)=>!!(data.semana?.[todayKey]?.[id]);
  const rotDone=(id)=>!!(data.semana?.["rot_"+todayKey]?.[id]);
  const habsFeitos=(data.habitos||[]).filter(h=>habDone(h.id)).length;
  const rotFeitos=(data.rotina||[]).filter(r=>rotDone(r.id)).length;
  const totalHabs=(data.habitos||[]).length;
  const totalRot=(data.rotina||[]).length;
  const getWeekStats=()=>{const dates=getWeekDates().map(d=>d.toISOString().slice(0,10));const habDays=dates.filter(d=>(data.habitos||[]).some(h=>data.semana?.[d]?.[h.id])).length;const rotDays=dates.filter(d=>(data.rotina||[]).some(r=>data.semana?.["rot_"+d]?.[r.id])).length;return{habDays,rotDays};};
  const toggleHabito=(id)=>{const semana={...(data.semana||{})};const dayHabs={...(semana[todayKey]||{})};dayHabs[id]=!dayHabs[id];semana[todayKey]=dayHabs;upd("semana",semana);};
  const toggleRotina=(id)=>{const semana={...(data.semana||{})};const key="rot_"+todayKey;const dayRot={...(semana[key]||{})};dayRot[id]=!dayRot[id];semana[key]=dayRot;upd("semana",semana);};

  const navItems=[
    {id:"dash",icon:"⊞",label:"Início"},
    {id:"cobrancas",icon:"👤",label:"Cobranças",badge:cbPending,bc:"bw"},
    {id:"tasks",icon:"✓",label:"Tarefas",badge:pending,bc:"ba"},
    {id:"reminders",icon:"◷",label:"Lembretes",badge:upcoming,bc:"bg"},
    {id:"reunioes",icon:"🎙",label:"Reuniões",badge:data.reunioes.length,bc:"bp"},
    {id:"notes",icon:"◈",label:"Notas"},
    {id:"chat",icon:"◎",label:"Chat IA"},
    {id:"rotina",icon:"🌅",label:"Rotina"},
    {id:"config",icon:"📅",label:"Agenda"},
  ];

  const ctxValue={
    data,upd,setTab,accounts,dueAlerts,pending,upcoming,cbPending,openCb,
    addTask,addRem,taskText,setTaskText,taskPrio,setTaskPrio,
    remText,setRemText,remDate,setRemDate,
    setReuModal,setReuTitle,setReuPartic,setReuText,setTranscript,setReuDetail,
    setNoteModal,setNoteTitle,setNoteBody,
    chatInput,setChatInput,aiLoading,sendMsg,msgsEnd,
    newAccName,setNewAccName,newAccEmail,setNewAccEmail,
    rotinaModal,setRotinaModal,habModal,setHabModal,
    rotinaItem,setRotinaItem,habItem,setHabItem,rotinaTab,setRotinaTab,
    toggleHabito,toggleRotina,habDone,rotDone,habsFeitos,rotFeitos,
    totalHabs,totalRot,getWeekStats,getWeekDates,getNowMinutes,timeToMin,
    todayKey,todayStr,
  };

  const panels={dash:Dash,cobrancas:Cobrancas,tasks:Tasks,reminders:Reminders,reunioes:Reunioes,notes:Notes,chat:Chat,rotina:Rotina,config:Config};
  const Panel=panels[tab]||Dash;

  if(authLoading)return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--bg)"}}><style>{CSS}</style><div style={{textAlign:"center",color:"var(--sub)"}}><div style={{fontSize:32,marginBottom:12}}>✦</div><div style={{fontFamily:"Fira Code,monospace",fontSize:13}}>carregando...</div></div></div>);
  if(!session)return(<><style>{CSS}</style><LoginScreen/></>);

  return(<NexusCtx.Provider value={ctxValue}>
    <style>{CSS}</style>
    <div className="shell">
      <header className="topbar">
        <div className="logo">✦ Nexus</div>
        <div className="clk">{clock}</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {perfil&&<span style={{fontFamily:"Fira Code,monospace",fontSize:11,color:"var(--sub)",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{perfil.nome}</span>}
          <button className="expbtn" onClick={exportData} title="Exportar dados">⬇</button>
          <button className="expbtn" onClick={()=>sb.auth.signOut()} title="Sair" style={{color:"var(--ar)"}}>⏻</button>
        </div>
      </header>
      <div className="layout">
        <nav className="sidebar">
          <div className="nsec">Menu</div>
          {navItems.map(n=>(<div key={n.id} className={`ni ${tab===n.id?"on":""}`} onClick={()=>setTab(n.id)}><span className="nic">{n.icon}</span>{n.label}{n.badge>0&&<span className={`bdg ${n.bc}`}>{n.badge}</span>}</div>))}
        </nav>
        <main className="main"><Panel/></main>
      </div>
      <nav className="botnav">
        {navItems.map(n=>(<div key={n.id} className={`bni ${tab===n.id?"on":""}`} onClick={()=>setTab(n.id)}><div className="ic">{n.icon}</div><span>{n.label}</span></div>))}
      </nav>
    </div>

    {/* Modal Cobrança */}
    {cbModal!==null&&(<div className="mov" onClick={()=>setCbModal(null)}><div className="mod" onClick={e=>e.stopPropagation()}>
      <div className="mh"><div className="mtt">{cbModal==="new"?"Nova cobrança":"Editar cobrança"}</div><button className="ib ibdel" onClick={()=>setCbModal(null)}>✕</button></div>
      <div><label>Nome da pessoa *</label><input value={cbPessoa} onChange={e=>setCbPessoa(e.target.value)} placeholder="Ex: João Silva"/></div>
      <div><label>O que ela deve fazer / entregar *</label><textarea value={cbTarefa} onChange={e=>setCbTarefa(e.target.value)} placeholder="Ex: Entregar relatório mensal" style={{minHeight:70}}/></div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:140}}><label>Data combinada</label><DatePicker value={cbDate} onChange={setCbDate} placeholder="Selecionar data"/></div>
        <div style={{flex:1,minWidth:110}}><label>Prioridade</label><select value={cbPrio} onChange={e=>setCbPrio(e.target.value)}><option value="urgente">🔴 Urgente</option><option value="normal">🟢 Normal</option></select></div>
        <div style={{flex:1,minWidth:110}}><label>Avisar X dias antes</label><input type="number" min={0} max={30} value={cbDias} onChange={e=>setCbDias(e.target.value)}/></div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
        {cbModal!=="new"&&<button className="btn bdng bsm" onClick={()=>{upd("cobrancas",data.cobrancas.filter(x=>x.id!==cbModal.id));setCbModal(null);}}>Excluir</button>}
        <button className="btn bsec bsm" onClick={()=>setCbModal(null)}>Cancelar</button>
        <button className="btn bsm" onClick={saveCb}>Salvar</button>
      </div>
    </div></div>)}

    {/* Modal Nota */}
    {noteModal!==null&&(<div className="mov" onClick={()=>setNoteModal(null)}><div className="mod" onClick={e=>e.stopPropagation()}>
      <div className="mh"><div className="mtt">{noteModal==="new"?"Nova nota":"Editar nota"}</div><button className="ib ibdel" onClick={()=>setNoteModal(null)}>✕</button></div>
      <div><label>Título</label><input value={noteTitle} onChange={e=>setNoteTitle(e.target.value)} placeholder="Título da nota"/></div>
      <div><label>Conteúdo</label><textarea value={noteBody} onChange={e=>setNoteBody(e.target.value)} placeholder="Escreva aqui..." style={{minHeight:120}}/></div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
        {noteModal!=="new"&&<button className="btn bdng bsm" onClick={()=>{upd("notes",data.notes.filter(x=>x.id!==noteModal.id));setNoteModal(null);}}>Excluir</button>}
        <button className="btn bsec bsm" onClick={()=>setNoteModal(null)}>Cancelar</button>
        <button className="btn bsm" onClick={saveNote}>Salvar</button>
      </div>
    </div></div>)}

    {/* Modal Reunião */}
    {reuModal!==null&&(<div className="mov" onClick={()=>setReuModal(null)}><div className="mod" onClick={e=>e.stopPropagation()}>
      <div className="mh"><div className="mtt">Nova reunião</div><button className="ib ibdel" onClick={()=>setReuModal(null)}>✕</button></div>
      <div><label>Título *</label><input value={reuTitle} onChange={e=>setReuTitle(e.target.value)} placeholder="Ex: Reunião semanal"/></div>
      <div><label>Participantes</label><input value={reuPartic} onChange={e=>setReuPartic(e.target.value)} placeholder="Ex: Carlos, Maria, João"/></div>
      <div><label>Transcrição / Notas</label>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <button className={`btn bsm ${recording?"bdng":""}`} onClick={recording?stopRecording:startRecording}>{recording?`⏹ ${fmtTimer(recTime)}`:"🎙 Gravar"}</button>
          {transcript&&<button className="btn bsec bsm" onClick={resumirReu} disabled={resumindo}>{resumindo?"Resumindo...":"✦ Resumir com IA"}</button>}
          {transcript&&<button className="btn bsec bsm" onClick={()=>setTranscript("")}>Limpar</button>}
        </div>
        <textarea value={reuText||transcript} onChange={e=>setReuText(e.target.value)} placeholder="Transcrição aparecerá aqui..." style={{minHeight:100}}/>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
        <button className="btn bsec bsm" onClick={()=>setReuModal(null)}>Cancelar</button>
        <button className="btn bsm" onClick={()=>{ if(!reuTitle.trim())return; upd("reunioes",[{id:uid(),title:reuTitle.trim(),participantes:reuPartic,texto:reuText||transcript,created:Date.now()},...data.reunioes]); setReuModal(null); }}>Salvar</button>
      </div>
    </div></div>)}

    {/* Detalhe Reunião */}
    {reuDetail&&(<div className="mov" onClick={()=>setReuDetail(null)}><div className="mod" style={{maxWidth:600}} onClick={e=>e.stopPropagation()}>
      <div className="mh"><div className="mtt">{reuDetail.title}</div><button className="ib ibdel" onClick={()=>setReuDetail(null)}>✕</button></div>
      {reuDetail.participantes&&<div style={{fontSize:12,color:"var(--sub)",marginBottom:10}}>👥 {reuDetail.participantes}</div>}
      <div style={{fontSize:12,color:"var(--mut)",marginBottom:12}}>{fdt(reuDetail.created)}</div>
      <div style={{whiteSpace:"pre-wrap",fontSize:13,lineHeight:1.7,maxHeight:400,overflowY:"auto"}}>{reuDetail.texto||"Sem transcrição."}</div>
    </div></div>)}

  </NexusCtx.Provider>);
}
