import { useState, useEffect, useRef, useCallback } from "react";

// ── Persistence (localStorage para persistir entre sessões) ───────────────────
const BLANK = { tasks: [], reminders: [], notes: [], messages: [], cobrancas: [], reunioes: [], gcalAccounts: [] };
const load = () => {
  try { const s = localStorage.getItem("nexus_v1"); return s ? { ...BLANK, ...JSON.parse(s) } : BLANK; }
  catch { return BLANK; }
};
const save = (d) => { try { localStorage.setItem("nexus_v1", JSON.stringify(d)); } catch {} };

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);
const fdt = (d) => d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const fdtShort = (d) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";
const clk = () => new Date().toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const daysUntil = (d) => Math.ceil((new Date(d) - new Date()) / 86400000);

// ── Google Calendar link builder ──────────────────────────────────────────────
const buildGCalLink = (title, description, dateStr, account) => {
  if (!dateStr) return null;
  const start = new Date(dateStr);
  const end = new Date(start.getTime() + 60 * 60 * 1000); // +1h
  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    details: description || "",
    dates: `${fmt(start)}/${fmt(end)}`,
  });
  if (account) params.set("authuser", account);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

// ── Claude API ────────────────────────────────────────────────────────────────
async function askClaude(messages, system) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514", max_tokens: 1000,
      system: system || "Você é o Nexus, assistente pessoal inteligente. Responda sempre em português brasileiro, de forma clara e objetiva.",
      messages,
    }),
  });
  const d = await r.json();
  return d.content?.map(b => b.text || "").join("") || "Erro na resposta.";
}

// ── CSS ───────────────────────────────────────────────────────────────────────
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
`;

// ─────────────────────────────────────────────────────────────────────────────
// Google Calendar Button Component
// ─────────────────────────────────────────────────────────────────────────────
const ACCOUNT_COLORS = ["#5b8af0", "#3dd68c", "#e06bf0", "#f0b84a", "#f06b6b"];

function GCalBtn({ title, description, dateStr, accounts }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!dateStr) return null;

  const defaultAccounts = accounts?.length ? accounts : [{ name: "Google Agenda", email: "", color: ACCOUNT_COLORS[0] }];

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button className="ib ibcal" title="Adicionar ao Google Agenda" onClick={() => setOpen(o => !o)}>📅</button>
      {open && (
        <div className="gcal-popup">
          <div style={{ fontFamily: "'Fira Code',monospace", fontSize: 9, color: "var(--mut)", padding: "4px 10px 8px", letterSpacing: "1px", textTransform: "uppercase" }}>Adicionar ao Google Agenda</div>
          {defaultAccounts.map((acc, i) => {
            const link = buildGCalLink(title, description, dateStr, acc.email);
            return (
              <a key={i} className="gcal-item" href={link} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                <div className="gcal-dot" style={{ background: acc.color || ACCOUNT_COLORS[i % ACCOUNT_COLORS.length] }} />
                {acc.name || acc.email || "Agenda"}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(load);
  const [tab, setTab] = useState("dash");
  const [clock, setClock] = useState(clk());

  // Cobrança form
  const [cbModal, setCbModal] = useState(null);
  const [cbPessoa, setCbPessoa] = useState("");
  const [cbTarefa, setCbTarefa] = useState("");
  const [cbDate, setCbDate] = useState("");
  const [cbPrio, setCbPrio] = useState("normal");
  const [cbDias, setCbDias] = useState(1);

  // Note modal
  const [noteModal, setNoteModal] = useState(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");

  // Reunião modal
  const [reuModal, setReuModal] = useState(null);
  const [reuTitle, setReuTitle] = useState("");
  const [reuPartic, setReuPartic] = useState("");
  const [reuText, setReuText] = useState("");
  const [reuDetail, setReuDetail] = useState(null);

  // Recording
  const [recording, setRecording] = useState(false);
  const [recTime, setRecTime] = useState(0);
  const [transcript, setTranscript] = useState("");
  const recTimerRef = useRef(null);
  const recogRef = useRef(null);

  // Tasks / Reminders
  const [taskText, setTaskText] = useState("");
  const [taskPrio, setTaskPrio] = useState("media");
  const [remText, setRemText] = useState("");
  const [remDate, setRemDate] = useState("");

  // Chat
  const [chatInput, setChatInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const msgsEnd = useRef(null);

  // Settings
  const [newAccName, setNewAccName] = useState("");
  const [newAccEmail, setNewAccEmail] = useState("");

  // Resumindo reunião
  const [resumindo, setResumindo] = useState(false);

  useEffect(() => { save(data); }, [data]);
  useEffect(() => { const t = setInterval(() => setClock(clk()), 30000); return () => clearInterval(t); }, []);
  useEffect(() => { if (tab === "chat") msgsEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [data.messages, tab, aiLoading]);

  const upd = useCallback((key, val) => setData(d => ({ ...d, [key]: val })), []);

  const dueAlerts = data.cobrancas.filter(c => {
    if (c.status === "entregue") return false;
    const days = daysUntil(c.date);
    return c.date && days <= (c.diasAviso || 1) && days >= -30;
  });

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const addTask = () => {
    if (!taskText.trim()) return;
    upd("tasks", [{ id: uid(), text: taskText.trim(), prio: taskPrio, done: false, created: Date.now() }, ...data.tasks]);
    setTaskText(""); setTaskPrio("media");
  };

  // ── Reminders ─────────────────────────────────────────────────────────────
  const addRem = () => {
    if (!remText.trim() || !remDate) return;
    upd("reminders", [{ id: uid(), text: remText.trim(), date: remDate, created: Date.now() }, ...data.reminders]);
    setRemText(""); setRemDate("");
  };

  // ── Cobranças ─────────────────────────────────────────────────────────────
  const openCb = (obj) => {
    if (obj === "new") { setCbPessoa(""); setCbTarefa(""); setCbDate(""); setCbPrio("normal"); setCbDias(1); }
    else { setCbPessoa(obj.pessoa); setCbTarefa(obj.tarefa); setCbDate(obj.date || ""); setCbPrio(obj.prio); setCbDias(obj.diasAviso || 1); }
    setCbModal(obj);
  };
  const saveCb = () => {
    if (!cbPessoa.trim() || !cbTarefa.trim()) return;
    const item = { id: cbModal?.id || uid(), pessoa: cbPessoa.trim(), tarefa: cbTarefa.trim(), date: cbDate, prio: cbPrio, diasAviso: Number(cbDias), status: cbModal?.status || "pendente", created: cbModal?.created || Date.now() };
    if (cbModal === "new") upd("cobrancas", [item, ...data.cobrancas]);
    else upd("cobrancas", data.cobrancas.map(c => c.id === item.id ? item : c));
    setCbModal(null);
  };

  // ── Notes ────────────────────────────────────────────────────────────────
  const saveNote = () => {
    if (!noteTitle.trim() && !noteBody.trim()) return;
    if (noteModal && noteModal !== "new") upd("notes", data.notes.map(n => n.id === noteModal.id ? { ...n, title: noteTitle, body: noteBody, updated: Date.now() } : n));
    else upd("notes", [{ id: uid(), title: noteTitle || "Sem título", body: noteBody, created: Date.now(), updated: Date.now() }, ...data.notes]);
    setNoteModal(null); setNoteTitle(""); setNoteBody("");
  };

  // ── Reuniões ──────────────────────────────────────────────────────────────
  const saveReu = () => {
    if (!reuTitle.trim()) return;
    upd("reunioes", [{ id: uid(), title: reuTitle.trim(), participantes: reuPartic.trim(), texto: reuText.trim(), created: Date.now() }, ...data.reunioes]);
    setReuModal(null); setReuTitle(""); setReuPartic(""); setReuText(""); setTranscript("");
  };

  const startRecording = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Use o Chrome para gravar com transcrição automática."); return; }
    const recog = new SR();
    recog.lang = "pt-BR"; recog.continuous = true; recog.interimResults = true;
    recog.onresult = (e) => {
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
      }
      setTranscript(prev => prev + final);
    };
    recog.start(); recogRef.current = recog;
    setRecording(true); setRecTime(0);
    recTimerRef.current = setInterval(() => setRecTime(t => t + 1), 1000);
  };
  const stopRecording = () => {
    recogRef.current?.stop();
    clearInterval(recTimerRef.current);
    setRecording(false);
  };
  const fmtTimer = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const resumirReu = async () => {
    if (!transcript.trim()) return;
    setResumindo(true);
    try {
      const r = await askClaude([{ role: "user", content: `Resuma esta transcrição de reunião de forma estruturada com: tópicos discutidos, decisões tomadas e próximas ações:\n\n${transcript}` }]);
      setReuText(r);
    } catch {}
    setResumindo(false);
  };

  // ── Chat ──────────────────────────────────────────────────────────────────
  const sendMsg = async () => {
    const txt = chatInput.trim();
    if (!txt || aiLoading) return;
    const nm = { id: uid(), role: "user", content: txt, ts: Date.now() };
    const updated = [...data.messages, nm];
    upd("messages", updated);
    setChatInput(""); setAiLoading(true);
    try {
      const history = updated.map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
      const reply = await askClaude(history);
      upd("messages", [...updated, { id: uid(), role: "ai", content: reply, ts: Date.now() }]);
    } catch { upd("messages", [...updated, { id: uid(), role: "ai", content: "Erro. Tente novamente.", ts: Date.now() }]); }
    setAiLoading(false);
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `nexus_${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };

  const pending = data.tasks.filter(t => !t.done).length;
  const upcoming = data.reminders.filter(r => new Date(r.date) > new Date()).length;
  const cbPending = data.cobrancas.filter(c => c.status !== "entregue").length;
  const accounts = data.gcalAccounts || [];

  const navItems = [
    { id: "dash",      icon: "⊞", label: "Início" },
    { id: "cobrancas", icon: "👤", label: "Cobranças", badge: cbPending, bc: "bw" },
    { id: "tasks",     icon: "✓",  label: "Tarefas",   badge: pending,   bc: "ba" },
    { id: "reminders", icon: "◷",  label: "Lembretes", badge: upcoming,  bc: "bg" },
    { id: "reunioes",  icon: "🎙", label: "Reuniões",  badge: data.reunioes.length, bc: "bp" },
    { id: "notes",     icon: "◈",  label: "Notas" },
    { id: "chat",      icon: "◎",  label: "Chat IA" },
    { id: "config",    icon: "⚙",  label: "Agendas" },
  ];

  // ─── PANELS ───────────────────────────────────────────────────────────────
  const Dash = () => (
    <div>
      <div className="ph"><div><div className="pt">Bom dia ✦</div><div className="ps">Resumo do seu dia</div></div></div>
      {dueAlerts.map(c => (
        <div key={c.id} className="alert-strip">⚠ Cobrança: <strong>{c.pessoa}</strong> — {c.tarefa} ({daysUntil(c.date) <= 0 ? "VENCIDO" : `em ${daysUntil(c.date)}d`})</div>
      ))}
      <div className="dg">
        <div className="st sa"><div className="sn">{data.cobrancas.filter(c => c.status === "pendente").length}</div><div className="sl">Cobranças pendentes</div></div>
        <div className="st sw"><div className="sn">{pending}</div><div className="sl">Tarefas abertas</div></div>
        <div className="st sg"><div className="sn">{upcoming}</div><div className="sl">Lembretes futuros</div></div>
        <div className="st sp"><div className="sn">{data.reunioes.length}</div><div className="sl">Reuniões salvas</div></div>
      </div>
      <div className="fsec">Cobranças urgentes</div>
      <div className="cl">
        {data.cobrancas.filter(c => c.prio === "urgente" && c.status !== "entregue").slice(0, 3).map(c => (
          <div key={c.id} className="card">
            <div className="pd pu" />
            <div className="cb"><div className="ct">{c.pessoa} — {c.tarefa}</div><div className="cm">{c.date ? fdtShort(c.date) : "Sem data"}</div></div>
            <span className={`pill ${c.status === "pendente" ? "pend" : c.status === "cobrado" ? "cobr" : "entr"}`}>{c.status}</span>
          </div>
        ))}
        {!data.cobrancas.filter(c => c.prio === "urgente" && c.status !== "entregue").length && <div className="empty">Nenhuma cobrança urgente.</div>}
      </div>
    </div>
  );

  const Cobrancas = () => (
    <div>
      <div className="ph">
        <div><div className="pt">Cobranças 👤</div><div className="ps">{cbPending} pendente{cbPending !== 1 ? "s" : ""}</div></div>
        <button className="btn bsm" onClick={() => openCb("new")}>+ Nova cobrança</button>
      </div>
      <div className="cl">
        {data.cobrancas.map(c => {
          const days = c.date ? daysUntil(c.date) : null;
          const dClass = days === null ? "" : days < 0 ? "days-over" : days <= 2 ? "days-warn" : "days-ok";
          const initials = c.pessoa.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
          return (
            <div key={c.id} className={`pcard ${c.status === "entregue" ? "dn" : ""}`}>
              <div className="pcard-top">
                <div className="pcard-av">{initials}</div>
                <div className="pcard-info">
                  <div className="pcard-name">{c.pessoa}</div>
                  <div className="pcard-task">{c.tarefa}</div>
                </div>
                <div className="ca">
                  <GCalBtn title={`Cobrar: ${c.pessoa}`} description={c.tarefa} dateStr={c.date} accounts={accounts} />
                  <button className="ib" onClick={() => openCb(c)}>✎</button>
                  <button className="ib ibdel" onClick={() => upd("cobrancas", data.cobrancas.filter(x => x.id !== c.id))}>✕</button>
                </div>
              </div>
              <div className="pcard-bottom">
                <span className={`urg-badge ${c.prio === "urgente" ? "urg-u" : "urg-n"}`}>{c.prio === "urgente" ? "🔴 Urgente" : "🟢 Normal"}</span>
                {c.date && <span className={`days-chip ${dClass}`}>{days < 0 ? `${Math.abs(days)}d atrasado` : days === 0 ? "Hoje!" : `${days}d restantes`}</span>}
                {c.date && <span className="cm">Entrega: {fdtShort(c.date)}</span>}
                <div style={{ marginLeft: "auto", display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {["pendente", "cobrado", "entregue"].map(s => (
                    <span key={s} className={`pill ${s === "pendente" ? "pend" : s === "cobrado" ? "cobr" : "entr"}`}
                      style={{ opacity: c.status === s ? 1 : .3 }}
                      onClick={() => upd("cobrancas", data.cobrancas.map(x => x.id === c.id ? { ...x, status: s } : x))}>{s}</span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        {!data.cobrancas.length && <div className="empty">Nenhuma cobrança ainda. Clique em "+ Nova cobrança".</div>}
      </div>
    </div>
  );

  const Tasks = () => (
    <div>
      <div className="ph"><div><div className="pt">Tarefas</div><div className="ps">{pending} pendente{pending !== 1 ? "s" : ""}</div></div></div>
      <div className="frow">
        <div className="fg"><input value={taskText} onChange={e => setTaskText(e.target.value)} onKeyDown={e => e.key === "Enter" && addTask()} placeholder="Nova tarefa..." /></div>
        <select value={taskPrio} onChange={e => setTaskPrio(e.target.value)} style={{ width: "auto" }}>
          <option value="alta">🔴 Alta</option>
          <option value="media">🟡 Média</option>
          <option value="baixa">🟢 Baixa</option>
        </select>
        <button className="btn" onClick={addTask}>+</button>
      </div>
      <div className="cl">
        {data.tasks.map(t => (
          <div key={t.id} className={`card ${t.done ? "dn" : ""}`}>
            <div className={`pd ${t.prio === "alta" ? "pu" : "pn"}`} />
            <div className="cb">
              <div className="ct">{t.text}</div>
              <div className="cm"><span className={`tg ${t.prio === "alta" ? "tu" : t.prio === "media" ? "tn2" : "tp"}`}>{t.prio}</span>· {fdt(t.created)}</div>
            </div>
            <div className="ca">
              <div className={`chk ${t.done ? "on" : ""}`} onClick={() => upd("tasks", data.tasks.map(x => x.id === t.id ? { ...x, done: !x.done } : x))}>{t.done ? "✓" : ""}</div>
              <button className="ib ibdel" onClick={() => upd("tasks", data.tasks.filter(x => x.id !== t.id))}>✕</button>
            </div>
          </div>
        ))}
        {!data.tasks.length && <div className="empty">Nenhuma tarefa ainda.</div>}
      </div>
    </div>
  );

  const Reminders = () => (
    <div>
      <div className="ph"><div><div className="pt">Lembretes</div><div className="ps">{upcoming} futuro{upcoming !== 1 ? "s" : ""}</div></div></div>
      <div className="frow">
        <div className="fg"><input value={remText} onChange={e => setRemText(e.target.value)} placeholder="Novo lembrete..." /></div>
        <input type="datetime-local" value={remDate} onChange={e => setRemDate(e.target.value)} style={{ width: "auto" }} />
        <button className="btn" onClick={addRem}>+</button>
      </div>
      <div className="cl">
        {[...data.reminders].sort((a, b) => new Date(a.date) - new Date(b.date)).map(r => {
          const past = new Date(r.date) <= new Date();
          return (
            <div key={r.id} className={`card ${past ? "dn" : ""}`}>
              <span style={{ fontSize: 15 }}>◷</span>
              <div className="cb">
                <div className="ct">{r.text}</div>
                <div className="cm"><span className={`tg ${past ? "tu" : "tc"}`}>{past ? "Expirado" : "Agendado"}</span>{fdt(r.date)}</div>
              </div>
              <div className="ca">
                <GCalBtn title={r.text} description="Lembrete do Nexus" dateStr={r.date} accounts={accounts} />
                <button className="ib ibdel" onClick={() => upd("reminders", data.reminders.filter(x => x.id !== r.id))}>✕</button>
              </div>
            </div>
          );
        })}
        {!data.reminders.length && <div className="empty">Nenhum lembrete ainda.</div>}
      </div>
    </div>
  );

  const Reunioes = () => (
    <div>
      <div className="ph">
        <div><div className="pt">Reuniões 🎙</div><div className="ps">{data.reunioes.length} salva{data.reunioes.length !== 1 ? "s" : ""}</div></div>
        <button className="btn bsm" onClick={() => { setReuTitle(""); setReuPartic(""); setReuText(""); setTranscript(""); setReuModal("new"); }}>+ Nova reunião</button>
      </div>
      <div className="cl">
        {data.reunioes.map(r => (
          <div key={r.id} className="rcard" onClick={() => setReuDetail(r)}>
            <div className="rcard-head">
              <div><div className="rcard-title">{r.title}</div>{r.participantes && <div className="rcard-meta">👥 {r.participantes}</div>}</div>
              <div style={{ display: "flex", gap: 5 }}>
                <div className="cm">{fdt(r.created)}</div>
                <button className="ib ibdel" onClick={e => { e.stopPropagation(); upd("reunioes", data.reunioes.filter(x => x.id !== r.id)); }}>✕</button>
              </div>
            </div>
            <div className="rcard-prev">{r.texto || <span style={{ fontStyle: "italic", color: "var(--mut)" }}>Sem transcrição</span>}</div>
          </div>
        ))}
        {!data.reunioes.length && <div className="empty">Nenhuma reunião salva ainda.</div>}
      </div>
    </div>
  );

  const Notes = () => (
    <div>
      <div className="ph">
        <div><div className="pt">Notas</div><div className="ps">{data.notes.length} nota{data.notes.length !== 1 ? "s" : ""}</div></div>
        <button className="btn bsm" onClick={() => { setNoteTitle(""); setNoteBody(""); setNoteModal("new"); }}>+ Nova nota</button>
      </div>
      <div className="ng">
        {data.notes.map(n => (
          <div key={n.id} className="nc" onClick={() => { setNoteModal(n); setNoteTitle(n.title); setNoteBody(n.body); }}>
            <div className="nct">{n.title || "Sem título"}</div>
            <div className="ncp">{n.body || <span style={{ fontStyle: "italic" }}>Vazio</span>}</div>
            <div className="ncd">{fdt(n.updated)}</div>
            <button className="ib ibdel ncdel bsm" onClick={e => { e.stopPropagation(); upd("notes", data.notes.filter(x => x.id !== n.id)); }}>✕</button>
          </div>
        ))}
        {!data.notes.length && <div className="empty">Nenhuma nota ainda.</div>}
      </div>
    </div>
  );

  const Chat = () => (
    <div className="csh">
      <div className="ph" style={{ flexShrink: 0 }}><div><div className="pt">Chat IA ✦</div><div className="ps">Converse com o Nexus</div></div></div>
      <div className="cms">
        {!data.messages.length && (
          <div className="msg ai"><div className="av">N</div><div><div className="bbl">Olá! Sou o Nexus. Posso ajudar com tarefas, cobranças, reuniões e muito mais. 👋</div><div className="mt">agora</div></div></div>
        )}
        {data.messages.map(m => (
          <div key={m.id} className={`msg ${m.role === "user" ? "u" : "ai"}`}>
            <div className="av">{m.role === "user" ? "V" : "N"}</div>
            <div><div className="bbl" style={{ whiteSpace: "pre-wrap" }}>{m.content}</div><div className="mt">{fdt(m.ts)}</div></div>
          </div>
        ))}
        {aiLoading && <div className="msg ai"><div className="av">N</div><div className="bbl"><div className="dots"><span /><span /><span /></div></div></div>}
        <div ref={msgsEnd} />
      </div>
      <div className="cin">
        <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMsg()} placeholder="Digite sua mensagem..." disabled={aiLoading} />
        <button className="btn" onClick={sendMsg} disabled={aiLoading || !chatInput.trim()}>↑</button>
      </div>
    </div>
  );

  const Config = () => (
    <div>
      <div className="ph"><div><div className="pt">Contas Google ⚙</div><div className="ps">Gerencie suas agendas conectadas</div></div></div>
      <div style={{ background: "rgba(91,138,240,.06)", border: "1px solid rgba(91,138,240,.2)", borderRadius: "var(--r10)", padding: "14px 16px", marginBottom: 20, fontSize: 13, lineHeight: 1.6, color: "var(--sub)" }}>
        📅 Adicione suas contas do Google abaixo. O botão <strong>📅</strong> em lembretes e cobranças vai mostrar um menu para escolher em qual agenda criar o evento.
      </div>
      <div style={{ marginBottom: 20 }}>
        <div className="frow" style={{ marginBottom: 10 }}>
          <div className="fg"><input value={newAccName} onChange={e => setNewAccName(e.target.value)} placeholder="Nome da conta (ex: Lhamascred)" /></div>
        </div>
        <div className="frow">
          <div className="fg"><input value={newAccEmail} onChange={e => setNewAccEmail(e.target.value)} placeholder="E-mail Google (ex: nome@gmail.com)" type="email" /></div>
          <button className="btn" onClick={() => {
            if (!newAccName.trim() || !newAccEmail.trim()) return;
            const colors = ACCOUNT_COLORS;
            const acc = { id: uid(), name: newAccName.trim(), email: newAccEmail.trim(), color: colors[accounts.length % colors.length] };
            upd("gcalAccounts", [...accounts, acc]);
            setNewAccName(""); setNewAccEmail("");
          }}>+ Adicionar</button>
        </div>
      </div>
      <div className="cl">
        {accounts.map((acc, i) => (
          <div key={acc.id} className="acc-card">
            <div className="acc-dot" style={{ background: acc.color || ACCOUNT_COLORS[i % ACCOUNT_COLORS.length] }} />
            <div className="acc-info">
              <div className="acc-name">{acc.name}</div>
              <div className="acc-email">{acc.email}</div>
            </div>
            <button className="ib ibdel" onClick={() => upd("gcalAccounts", accounts.filter(a => a.id !== acc.id))}>✕</button>
          </div>
        ))}
        {!accounts.length && <div className="empty">Nenhuma conta adicionada ainda. Adicione suas contas do Google acima.</div>}
      </div>
    </div>
  );

  const panels = { dash: Dash, cobrancas: Cobrancas, tasks: Tasks, reminders: Reminders, reunioes: Reunioes, notes: Notes, chat: Chat, config: Config };
  const Panel = panels[tab];

  return (
    <>
      <style>{CSS}</style>
      <div className="shell">
        <header className="topbar">
          <div className="logo">✦ Nexus</div>
          <div className="clk">{clock}</div>
          <button className="expbtn" onClick={exportData}>⬇ Exportar</button>
        </header>
        <div className="layout">
          <nav className="sidebar">
            <div className="nsec">Menu</div>
            {navItems.map(n => (
              <div key={n.id} className={`ni ${tab === n.id ? "on" : ""}`} onClick={() => setTab(n.id)}>
                <span className="nic">{n.icon}</span>{n.label}
                {n.badge > 0 && <span className={`bdg ${n.bc}`}>{n.badge}</span>}
              </div>
            ))}
          </nav>
          <main className="main"><Panel /></main>
        </div>
        <nav className="botnav">
          {navItems.map(n => (
            <div key={n.id} className={`bni ${tab === n.id ? "on" : ""}`} onClick={() => setTab(n.id)}>
              <div className="ic">{n.icon}</div><span>{n.label}</span>
            </div>
          ))}
        </nav>
      </div>

      {/* Modal Cobrança */}
      {cbModal !== null && (
        <div className="mov" onClick={() => setCbModal(null)}>
          <div className="mod" onClick={e => e.stopPropagation()}>
            <div className="mh"><div className="mtt">{cbModal === "new" ? "Nova cobrança" : "Editar cobrança"}</div><button className="ib ibdel" onClick={() => setCbModal(null)}>✕</button></div>
            <div><label>Nome da pessoa *</label><input value={cbPessoa} onChange={e => setCbPessoa(e.target.value)} placeholder="Ex: João Silva" /></div>
            <div><label>O que ela deve fazer / entregar *</label><textarea value={cbTarefa} onChange={e => setCbTarefa(e.target.value)} placeholder="Ex: Entregar relatório mensal" style={{ minHeight: 70 }} /></div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 140 }}><label>Data combinada</label><input type="datetime-local" value={cbDate} onChange={e => setCbDate(e.target.value)} /></div>
              <div style={{ flex: 1, minWidth: 110 }}><label>Prioridade</label><select value={cbPrio} onChange={e => setCbPrio(e.target.value)}><option value="urgente">🔴 Urgente</option><option value="normal">🟢 Normal</option></select></div>
              <div style={{ flex: 1, minWidth: 110 }}><label>Avisar X dias antes</label><input type="number" min={0} max={30} value={cbDias} onChange={e => setCbDias(e.target.value)} /></div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {cbModal !== "new" && <button className="btn bdng bsm" onClick={() => { upd("cobrancas", data.cobrancas.filter(x => x.id !== cbModal.id)); setCbModal(null); }}>Excluir</button>}
              <button className="btn bsec bsm" onClick={() => setCbModal(null)}>Cancelar</button>
              <button className="btn bsm" onClick={saveCb}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reunião */}
      {reuModal === "new" && (
        <div className="mov" onClick={() => { setReuModal(null); stopRecording(); }}>
          <div className="mod" onClick={e => e.stopPropagation()} style={{ width: "min(680px,100%)" }}>
            <div className="mh"><div className="mtt">Nova reunião 🎙</div><button className="ib ibdel" onClick={() => { setReuModal(null); stopRecording(); }}>✕</button></div>
            <div><label>Título *</label><input value={reuTitle} onChange={e => setReuTitle(e.target.value)} placeholder="Ex: Reunião de alinhamento" /></div>
            <div><label>Participantes</label><input value={reuPartic} onChange={e => setReuPartic(e.target.value)} placeholder="Ex: João, Maria, Pedro" /></div>
            <div style={{ background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: "var(--r10)", padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                <button className={`rec-btn ${recording ? "recording" : "idle"}`} onClick={recording ? stopRecording : startRecording}>
                  <div className="rdot" />{recording ? "Parar gravação" : "🎙 Iniciar gravação"}
                </button>
                {recording && <div className="rec-timer">{fmtTimer(recTime)}</div>}
                {!recording && transcript && <button className="btn bsm bap" onClick={resumirReu} disabled={resumindo}>{resumindo ? "Resumindo..." : "✦ Resumir com IA"}</button>}
              </div>
              {(transcript || recording) && (
                <div><label>Transcrição</label><div className="transcript-box">{transcript || <span style={{ fontStyle: "italic" }}>Aguardando fala...</span>}</div></div>
              )}
            </div>
            <div><label>Anotações / Resumo</label><textarea value={reuText} onChange={e => setReuText(e.target.value)} placeholder="Anotações manuais ou resumo gerado pela IA..." style={{ minHeight: 100 }} /></div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn bsec bsm" onClick={() => { setReuModal(null); stopRecording(); }}>Cancelar</button>
              <button className="btn bsm" onClick={() => { stopRecording(); saveReu(); }}>Salvar reunião</button>
            </div>
          </div>
        </div>
      )}

      {/* Detalhe Reunião */}
      {reuDetail && (
        <div className="mov" onClick={() => setReuDetail(null)}>
          <div className="mod" onClick={e => e.stopPropagation()}>
            <div className="mh"><div className="mtt">{reuDetail.title}</div><button className="ib ibdel" onClick={() => setReuDetail(null)}>✕</button></div>
            {reuDetail.participantes && <div className="cm">👥 {reuDetail.participantes}</div>}
            <div className="cm">📅 {fdt(reuDetail.created)}</div>
            <div className="transcript-box" style={{ minHeight: 120, marginTop: 8 }}>{reuDetail.texto || <span style={{ fontStyle: "italic" }}>Sem anotações.</span>}</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn bdng bsm" onClick={() => { upd("reunioes", data.reunioes.filter(x => x.id !== reuDetail.id)); setReuDetail(null); }}>Excluir</button>
              <button className="btn bsec bsm" onClick={() => setReuDetail(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nota */}
      {noteModal !== null && (
        <div className="mov" onClick={() => setNoteModal(null)}>
          <div className="mod" onClick={e => e.stopPropagation()}>
            <div className="mh"><div className="mtt">{noteModal === "new" ? "Nova nota" : "Editar nota"}</div><button className="ib ibdel" onClick={() => setNoteModal(null)}>✕</button></div>
            <input value={noteTitle} onChange={e => setNoteTitle(e.target.value)} placeholder="Título..." />
            <textarea value={noteBody} onChange={e => setNoteBody(e.target.value)} placeholder="Conteúdo..." style={{ minHeight: 150 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {noteModal !== "new" && <button className="btn bdng bsm" onClick={() => { upd("notes", data.notes.filter(x => x.id !== noteModal.id)); setNoteModal(null); }}>Excluir</button>}
              <button className="btn bsec bsm" onClick={() => setNoteModal(null)}>Cancelar</button>
              <button className="btn bsm" onClick={saveNote}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
