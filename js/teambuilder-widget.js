// ================================================================
// CLOUDSTAFF TEAM BUILDER WIDGET — teambuilder-widget.js
// Loaded by the RRP Calculator app after config.js.
// Uses supabaseClient global from config.js — same as all other modules.
// No credentials stored here.
// ================================================================

const TB_PB = {
  office: { name:'Current ELEVATE WFO',    USD:699, AUD:999, GBP:533, HKD:5445, SGD:943, EUR:695, CAD:945, NZD:1145 },
  hybrid: { name:'Current ELEVATE Hybrid', USD:680, AUD:850, GBP:500, HKD:4995, SGD:864, EUR:590, CAD:805, NZD:975  },
  wfh:    { name:'Current ELEVATE WFH',    USD:599, AUD:770, GBP:400, HKD:3000, SGD:700, EUR:520, CAD:710, NZD:860  },
};

const TB_CURR = [
  { code:'USD', sym:'$',    label:'USD — US Dollar'         },
  { code:'AUD', sym:'A$',   label:'AUD — Australian Dollar' },
  { code:'GBP', sym:'£',    label:'GBP — British Pound'     },
  { code:'HKD', sym:'HK$',  label:'HKD — Hong Kong Dollar'  },
  { code:'SGD', sym:'S$',   label:'SGD — Singapore Dollar'  },
  { code:'EUR', sym:'€',    label:'EUR — Euro'              },
  { code:'CAD', sym:'C$',   label:'CAD — Canadian Dollar'   },
  { code:'NZD', sym:'NZ$',  label:'NZD — New Zealand Dollar'},
];

const TB_COUNTRIES = [
  { code:'PH', label:'🇵🇭  Philippines', market:'PH', stub:false },
  { code:'CO', label:'🇨🇴  Colombia',    market:'CO', stub:false },
  { code:'IN', label:'🇮🇳  India',        market:'IN', stub:true  },
  { code:'KE', label:'🇰🇪  Kenya',        market:'KE', stub:true  },
];

const TB_ONSHORE_AUD = { DEFAULT:{ Junior:5800, Mid:7500, Senior:9800 } };

let tbRoles    = { PH:[], CO:[], IN:[], KE:[] };
let tbHardware = [];
let tbFxRow    = {};
let tbFxRowCO  = {};
let tbTeam     = [];
let tbCurrency = 'USD';
let tbLocation = 'office';
let tbCountry  = 'PH';
let tbExp      = 'Mid';
let tbHW       = 'basic';
let tbWidgetMounted = false;

async function tbInit() {
  try {
    await Promise.all([ tbLoadRoles(), tbLoadHardware(), tbLoadFX() ]);
  } catch(e) {
    console.warn('[TB] DB load issue, using demo data:', e.message);
    tbLoadDemo();
  }
  tbRenderForm(); tbRenderTeam(); tbRenderSummary();
}

async function tbLoadRoles() {
  await Promise.all(['PH','CO'].map(async m => {
    let all = [], from = 0;
    while(true) {
      const { data, error } = await supabaseClient
        .from('salary_ranges')
        .select('id,job_title,category,jpid_level,low_salary,median_salary,high_salary')
        .eq('market', m)
        .order('category', { ascending:true })
        .order('job_title', { ascending:true })
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      if (!data || !data.length) break;
      all = all.concat(data); from += 1000;
      if (data.length < 1000) break;
    }
    tbRoles[m] = all;
  }));
}

async function tbLoadHardware() {
  const { data, error } = await supabaseClient
    .from('hardware_products')
    .select('id,name,category,price_usd_elevate,price_aud_elevate,price_gbp_elevate,price_hkd_elevate,price_sgd_elevate,price_eur_elevate,price_cad_elevate,price_nzd_elevate')
    .order('name', { ascending:true });
  if (error) throw new Error(error.message);
  tbHardware = data || [];
}

async function tbLoadFX() {
  const { data:ph, error:phErr } = await supabaseClient
    .from('fx_monthly_rates')
    .select('php,usd,gbp,hkd,sgd,eur,cad,nzd')
    .eq('market', 'PH')
    .order('month_date', { ascending:false })
    .limit(1);
  if (phErr) throw new Error(phErr.message);
  if (ph && ph[0]) tbFxRow = ph[0];

  try {
    const { data:co } = await supabaseClient
      .from('fx_monthly_rates')
      .select('cop,usd,gbp,hkd,sgd,eur,cad,nzd')
      .eq('market', 'CO')
      .order('month_date', { ascending:false })
      .limit(1);
    if (co && co[0]) tbFxRowCO = co[0];
  } catch(e) {}
}

function tbLoadDemo() {
  tbRoles.PH = [
    {id:1, job_title:'Accountant Level 1',          category:'Finance & Accounting', jpid_level:'Accountant Level 1',        low_salary:28000, median_salary:33000},
    {id:2, job_title:'Accountant Level 2',          category:'Finance & Accounting', jpid_level:'Accountant Level 2',        low_salary:35000, median_salary:42000},
    {id:3, job_title:'Accountant Senior',           category:'Finance & Accounting', jpid_level:'Accountant Senior',         low_salary:52000, median_salary:63000},
    {id:4, job_title:'Bookkeeper Level 1',          category:'Finance & Accounting', jpid_level:'Bookkeeper Level 1',        low_salary:28000, median_salary:33000},
    {id:5, job_title:'Financial Analyst Level 2',   category:'Finance & Accounting', jpid_level:'Financial Analyst Level 2', low_salary:40000, median_salary:48000},
    {id:6, job_title:'Front-End Developer Level 1', category:'Technology',           jpid_level:'Developer Level 1',         low_salary:35000, median_salary:42000},
    {id:7, job_title:'Front-End Developer Level 2', category:'Technology',           jpid_level:'Developer Level 2',         low_salary:45000, median_salary:55000},
    {id:8, job_title:'Front-End Developer Senior',  category:'Technology',           jpid_level:'Developer Senior',          low_salary:60000, median_salary:75000},
    {id:9, job_title:'Customer Service Rep Level 1',category:'Customer Service',     jpid_level:'CSR Level 1',               low_salary:22000, median_salary:27000},
    {id:10,job_title:'Graphic Designer Level 2',    category:'Creative & Design',    jpid_level:'Designer Level 2',          low_salary:30000, median_salary:36000},
    {id:11,job_title:'Virtual Assistant Level 1',   category:'Administration',       jpid_level:'Admin Level 1',             low_salary:20000, median_salary:24000},
  ];
  tbRoles.CO = [
    {id:101,job_title:'Accountant Level 2',          category:'Finance & Accounting', jpid_level:'Accountant Level 2', low_salary:3200000, median_salary:3800000},
    {id:102,job_title:'Software Developer Level 2',  category:'Technology',           jpid_level:'Developer Level 2',  low_salary:4500000, median_salary:5500000},
    {id:103,job_title:'Customer Service Rep Level 1',category:'Customer Service',     jpid_level:'CSR Level 1',        low_salary:2000000, median_salary:2400000},
  ];
  tbHardware = [
    {id:1, name:'mPC Office 5 Laptop', price_usd_elevate:39,  price_aud_elevate:59.50, price_gbp_elevate:31, price_hkd_elevate:309, price_sgd_elevate:53, price_eur_elevate:36, price_cad_elevate:53, price_nzd_elevate:65},
    {id:2, name:'mPC Power 7 Laptop',  price_usd_elevate:59,  price_aud_elevate:89.00, price_gbp_elevate:47, price_hkd_elevate:464, price_sgd_elevate:80, price_eur_elevate:54, price_cad_elevate:80, price_nzd_elevate:97},
  ];
  tbFxRow   = { php:41.07, usd:58.91, gbp:74.32, hkd:7.56,  sgd:43.80, eur:63.20, cad:43.20, nzd:36.10 };
  tbFxRowCO = { cop:14.07, usd:4100,  gbp:5200,  hkd:525,   sgd:3050,  eur:4420,  cad:3010,  nzd:2510  };
}

// ── Cost calculation ─────────────────────────────────────────────
function tbPhpToTarget(phpAmt, cur) {
  if (cur==='AUD') return phpAmt / (parseFloat(tbFxRow.php)||41.07);
  const v=parseFloat(tbFxRow[cur.toLowerCase()]); return v?phpAmt/v:phpAmt/41.07;
}
function tbCopToTarget(copAmt, cur) {
  if (cur==='AUD') return copAmt/(parseFloat(tbFxRowCO.cop)||2552);
  const v=parseFloat(tbFxRowCO[cur.toLowerCase()]); return v?copAmt/v:copAmt/4000;
}
function tbCalcEDC(nativeSalary, market, targetCurrency) {
  const edc = nativeSalary * (1 + 0.160 + 0.042 + 0.090 + 0.035);
  if (market==='PH') return tbPhpToTarget(edc, targetCurrency);
  if (market==='CO') return tbCopToTarget(edc, targetCurrency);
  return 0;
}
function tbHWPrice(hwCode, currency) {
  const names={basic:['mPC Office 5 Laptop','Office 5'],power:['mPC Power 7 Laptop','mPC Office 7 Laptop','Power 7']};
  const row=tbHardware.find(h=>names[hwCode]?.some(n=>h.name&&h.name.includes(n)));
  if (!row) return 0;
  return parseFloat(row[`price_${currency.toLowerCase()}_elevate`])||0;
}
function tbCSFee(currency) { const pb=TB_PB[tbLocation]; return pb?(pb[currency]||0):0; }
function tbOnshoreInCurrency(exp, currency) {
  const audAmt=TB_ONSHORE_AUD.DEFAULT[exp]||TB_ONSHORE_AUD.DEFAULT.Mid;
  if (currency==='AUD') return audAmt;
  const audToPhp=parseFloat(tbFxRow.php)||41.07;
  const targetFx=parseFloat(tbFxRow[currency.toLowerCase()]);
  return targetFx?(audAmt*audToPhp)/targetFx:audAmt;
}

// ── Level stripping ───────────────────────────────────────────────
function tbStripLevel(title) {
  return title.replace(/\s+(Level\s+\d+|Senior|Junior|Lead|Principal)\s*$/i,'').trim();
}
function tbExpToLevel(exp) { return {Junior:1,Mid:2,Senior:3}[exp]||2; }
function tbGetLevelNum(title) {
  const m=title.match(/Level\s+(\d+)/i); if(m) return parseInt(m[1]);
  if (/\b(Senior|Lead|Principal)\b/i.test(title)) return 3;
  if (/\b(Junior|Entry)\b/i.test(title)) return 1;
  return 2;
}

function tbComputeCost(roleName, exp, hwCode, qty) {
  const market=TB_COUNTRIES.find(c=>c.code===tbCountry)?.market||'PH';
  const roles=tbRoles[market]||[];
  if (!roles.length) return null;
  const candidates=roles.filter(r=>tbStripLevel(r.job_title)===roleName);
  if (!candidates.length) return null;
  const targetLevel=tbExpToLevel(exp);
  let match=candidates.find(r=>tbGetLevelNum(r.job_title)===targetLevel);
  if (!match) {
    const sorted=[...candidates].sort((a,b)=>Math.abs(tbGetLevelNum(a.job_title)-targetLevel)-Math.abs(tbGetLevelNum(b.job_title)-targetLevel));
    match=sorted[0];
  }
  const nativeBase=match.median_salary||match.low_salary||30000;
  const edcTarget=tbCalcEDC(nativeBase,market,tbCurrency);
  const csFee=tbCSFee(tbCurrency), hwFee=tbHWPrice(hwCode,tbCurrency);
  const cs1=edcTarget+csFee+hwFee, csTotal=cs1*qty;
  const onsh1=tbOnshoreInCurrency(exp,tbCurrency), onshTotal=onsh1*qty;
  return {edcTarget,csFee,hwFee,cs1,csTotal,onsh1,onshTotal,saving:Math.max(0,onshTotal-csTotal),qty,match};
}

function tbSym(cur){return TB_CURR.find(c=>c.code===(cur||tbCurrency))?.sym||'$';}
function tbFmt(n,cur){if(n==null||isNaN(n)||n===0)return tbSym(cur)+'0';return tbSym(cur)+Math.round(n).toLocaleString('en-US');}

// ── Form render ───────────────────────────────────────────────────
function tbRenderForm() {
  const wrap=document.getElementById('tb-form-wrap'); if(!wrap)return;
  const market=TB_COUNTRIES.find(c=>c.code===tbCountry)?.market||'PH';
  const isStub=TB_COUNTRIES.find(c=>c.code===tbCountry)?.stub;
  const cats=[...new Set((tbRoles[market]||[]).map(r=>r.category).filter(Boolean))].sort();
  wrap.innerHTML=`
    ${isStub?`<div class="stub-note">⚠️ Salary data for this country is coming soon. Select Philippines or Colombia.</div>`:''}
    <div class="fg-grid">
      <div class="fg sp2"><label>Job Category</label>
        <select id="tb-cat" onchange="tbOnCat()" ${isStub?'disabled':''}><option value="">— Select a category —</option>${cats.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div>
      <div class="fg sp2"><label>Role</label>
        <select id="tb-role" disabled onchange="tbPreview()"><option value="">— Select a category first —</option></select></div>
      <div class="fg"><label>Quantity</label>
        <input type="number" id="tb-qty" value="1" min="1" max="50" oninput="tbPreview()"></div>
      <div class="fg"><label>Experience Level</label>
        <div class="seg">
          <button id="tbe-Junior" onclick="tbSetExp('Junior')" ${tbExp==='Junior'?'class="active"':''}>Junior</button>
          <button id="tbe-Mid"    onclick="tbSetExp('Mid')"    ${tbExp==='Mid'   ?'class="active"':''}>Mid</button>
          <button id="tbe-Senior" onclick="tbSetExp('Senior')" ${tbExp==='Senior'?'class="active"':''}>Senior</button>
        </div></div>
      <div class="fg sp2"><label>Laptop</label>
        <div class="seg">
          <button id="tbh-basic" onclick="tbSetHW('basic')" ${tbHW==='basic'?'class="active"':''}>💻 Basic Laptop</button>
          <button id="tbh-power" onclick="tbSetHW('power')" ${tbHW==='power'?'class="active"':''}>⚡ Power Laptop</button>
        </div></div>
    </div>
    <div class="cost-preview" id="tb-preview">
      <div class="cp-title" id="tb-prev-title">Cost Preview · per month · ${tbCurrency}</div>
      <div class="cp-grid" id="tb-preview-cells"></div>
    </div>
    <div class="stub-note">⚠️ Onshore comparison uses estimated AU market rates. Updated when AU salary research is complete.</div>
    <button class="btn-add" id="tb-add-btn" onclick="tbAdd()" disabled>+ Add to Team</button>`;
}

function tbOnCat() {
  const cat=document.getElementById('tb-cat')?.value;
  const roleEl=document.getElementById('tb-role'); if(!roleEl)return;
  const market=TB_COUNTRIES.find(c=>c.code===tbCountry)?.market||'PH';
  if(!cat){roleEl.innerHTML='<option value="">— Select a category first —</option>';roleEl.disabled=true;return;}
  const baseNames=[...new Set((tbRoles[market]||[]).filter(r=>r.category===cat).map(r=>tbStripLevel(r.job_title)))].sort();
  roleEl.innerHTML='<option value="">— Select a role —</option>'+baseNames.map(n=>`<option value="${n}">${n}</option>`).join('');
  roleEl.disabled=false;
  document.getElementById('tb-add-btn').disabled=true;
  document.getElementById('tb-preview').style.display='none';
}
function tbPreview() {
  const role=document.getElementById('tb-role')?.value;
  const qty=parseInt(document.getElementById('tb-qty')?.value)||1;
  const addBtn=document.getElementById('tb-add-btn'), prev=document.getElementById('tb-preview');
  if(!role){if(addBtn)addBtn.disabled=true;if(prev)prev.style.display='none';return;}
  const c=tbComputeCost(role,tbExp,tbHW,qty); if(!c)return;
  if(addBtn)addBtn.disabled=false; if(prev)prev.style.display='block';
  const pt=document.getElementById('tb-prev-title'); if(pt)pt.textContent=`Cost Preview · per month · ${tbCurrency}`;
  const cells=document.getElementById('tb-preview-cells');
  if(cells)cells.innerHTML=`
    <div class="cp-cell cs"><div class="cpl">Hire w/ Cloudstaff</div><div class="cpv">${tbFmt(c.csTotal)}/mo</div></div>
    <div class="cp-cell"><div class="cpl">Onshore Est. ⚠️</div><div class="cpv" style="color:var(--muted)">${tbFmt(c.onshTotal)}/mo</div></div>
    <div class="cp-cell sv"><div class="cpl">Monthly Saving</div><div class="cpv">${tbFmt(c.saving)}/mo</div></div>`;
}
function tbSetExp(exp){tbExp=exp;['Junior','Mid','Senior'].forEach(e=>{const el=document.getElementById(`tbe-${e}`);if(el)el.className=e===exp?'active':'';});tbPreview();}
function tbSetHW(hw){tbHW=hw;['basic','power'].forEach(h=>{const el=document.getElementById(`tbh-${h}`);if(el)el.className=h===hw?'active':'';});tbPreview();}
function tbSetLocation(loc){tbLocation=loc;document.querySelectorAll('#cs-team-builder .loc-pill').forEach(p=>p.classList.toggle('active',p.dataset.loc===loc));tbRecalcTeam();tbPreview();}
function tbSetCurrency(cur){tbCurrency=cur;tbRecalcTeam();tbPreview();}
function tbSetCountry(cty){tbCountry=cty;tbTeam=[];tbRenderForm();tbRenderTeam();tbRenderSummary();}
function tbRecalcTeam(){tbTeam=tbTeam.map(t=>{const c=tbComputeCost(t.roleName,t.exp,t.hw,t.qty);return c?{...t,costs:c}:t;});tbRenderTeam();tbRenderSummary();}
function tbAdd(){
  const cat=document.getElementById('tb-cat')?.value, role=document.getElementById('tb-role')?.value;
  const qty=parseInt(document.getElementById('tb-qty')?.value)||1; if(!role)return;
  const c=tbComputeCost(role,tbExp,tbHW,qty); if(!c)return;
  tbTeam.push({id:Date.now(),cat,roleName:role,qty,exp:tbExp,hw:tbHW,country:tbCountry,costs:c});
  tbRenderTeam();tbRenderSummary();
  document.getElementById('tb-cat').value='';
  const re=document.getElementById('tb-role');if(re){re.innerHTML='<option value="">— Select a category first —</option>';re.disabled=true;}
  document.getElementById('tb-add-btn').disabled=true;
  document.getElementById('tb-preview').style.display='none';
  document.getElementById('tb-qty').value=1;
}
function tbRemove(id){tbTeam=tbTeam.filter(t=>t.id!==id);tbRenderTeam();tbRenderSummary();}

function tbRenderTeam(){
  const wrap=document.getElementById('tb-team-items'), badge=document.getElementById('tb-team-count');
  if(!wrap)return;
  const total=tbTeam.reduce((s,t)=>s+t.qty,0); if(badge)badge.textContent=total;
  if(!tbTeam.length){wrap.innerHTML=`<div class="team-empty"><span class="tei">👥</span>Add roles using the form — your team appears here.</div>`;return;}
  wrap.innerHTML=tbTeam.map(t=>`
    <div class="ti">
      <div class="ti-hdr">
        <div class="ti-qty">${t.qty}</div><div class="ti-role">${t.roleName}</div>
        <div class="ti-tags"><span class="tag tag-exp">${t.exp}</span><span class="tag tag-hw">${t.hw==='power'?'⚡':'💻'}</span><span class="tag tag-cty">${t.country}</span></div>
        <button class="ti-del" onclick="tbRemove(${t.id})" title="Remove">✕</button>
      </div>
      <div class="ti-body">
        <div class="ti-cost hl"><div class="tc-lbl">Hire w/ Cloudstaff</div><div class="tc-val">${tbFmt(t.costs.csTotal)}<span style="font-size:.6rem;font-weight:500;color:var(--muted);">/mo</span></div></div>
        <div class="ti-cost dm"><div class="tc-lbl">Onshore Est. ⚠️</div><div class="tc-val">${tbFmt(t.costs.onshTotal)}/mo</div></div>
      </div></div>`).join('');
}

function tbRenderSummary(){
  const totalCS=tbTeam.reduce((s,t)=>s+t.costs.csTotal,0);
  const totalOnsh=tbTeam.reduce((s,t)=>s+t.costs.onshTotal,0);
  const totalStaff=tbTeam.reduce((s,t)=>s+t.qty,0);
  const annualSav=Math.max(0,totalOnsh-totalCS)*12;
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('tb-sum-staff',`${totalStaff} staff`);
  set('tb-sum-cs',tbFmt(totalCS)+'/mo');
  set('tb-sum-onsh',tbFmt(totalOnsh)+'/mo');
  set('tb-sum-saving',tbFmt(annualSav)+'/yr');
  set('tb-hdr-saving',tbFmt(annualSav));
}

// ================================================================
// MOUNT — inject CSS + HTML into target div, then init
// ================================================================
function tbMountWidget(targetId) {
  const el=document.getElementById(targetId);
  if(!el||tbWidgetMounted)return;

  if(!document.getElementById('tb-widget-styles')){
    const s=document.createElement('style');s.id='tb-widget-styles';
    s.textContent=`#cs-team-builder*,#cs-team-builder *::before,#cs-team-builder *::after{box-sizing:border-box;margin:0;padding:0;}
#cs-team-builder{--navy:#0a2540;--blue:#0099ff;--blue-dk:#0077cc;--teal:#0099ff;--teal-lt:#4db8ff;--green:#00c48c;--green-bg:#e8fdf6;--gold:#f5a623;--gold-bg:#fff8ec;--pink:#ff6b9d;--red:#ff4757;--surf:#ffffff;--bg:#f8fafd;--bdr:#e5e7eb;--txt:#0a2540;--muted:#6b7280;--r:16px;--rs:10px;font-family:'Inter','DM Sans','Segoe UI',system-ui,sans-serif;background:var(--bg);border-radius:var(--r);max-width:1160px;margin:0 auto;color:var(--txt);overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,.08);}
#cs-team-builder .tbh{background:linear-gradient(135deg,#0077cc 0%,#0099ff 55%,#33aaff 100%);padding:28px 32px 24px;position:relative;overflow:hidden;}
#cs-team-builder .tbh::after{content:'';position:absolute;right:-60px;top:-60px;width:320px;height:320px;background:radial-gradient(circle,rgba(255,255,255,.12) 0%,transparent 70%);border-radius:50%;pointer-events:none;}
#cs-team-builder .tbh::before{content:'';position:absolute;left:0;bottom:0;width:100%;height:100%;background:linear-gradient(135deg,transparent 60%,rgba(245,166,35,.12) 100%);pointer-events:none;}
#cs-team-builder .tbh-inner{position:relative;z-index:1;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px;}
#cs-team-builder .tbh h2{font-size:1.55rem;font-weight:800;color:#fff;line-height:1.2;letter-spacing:-.02em;}
#cs-team-builder .tbh h2 span{color:#fff;text-shadow:0 0 30px rgba(255,255,255,.4);}
#cs-team-builder .tbh p{color:rgba(255,255,255,.6);font-size:.875rem;margin-top:5px;max-width:460px;}
#cs-team-builder .sav-badge{background:rgba(245,166,35,.18);border:1px solid rgba(245,166,35,.45);border-radius:10px;padding:12px 18px;text-align:right;white-space:nowrap;}
#cs-team-builder .sav-badge .sbl{font-size:.65rem;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.5);font-weight:600;}
#cs-team-builder .sav-badge .sbv{font-size:1.45rem;font-weight:800;color:#ffd166;line-height:1.1;font-variant-numeric:tabular-nums;}
#cs-team-builder .sav-badge .sbs{font-size:.65rem;color:rgba(255,255,255,.4);margin-top:2px;}
#cs-team-builder .cfg-bar{background:#f0f7ff;border-bottom:2px solid #d0e7ff;padding:12px 32px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;}
#cs-team-builder .cfg-group{display:flex;align-items:center;gap:8px;}
#cs-team-builder .cfg-label{font-size:.67rem;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;font-weight:700;white-space:nowrap;}
#cs-team-builder .cfg-sel{background:#fff;border:1.5px solid #d0e7ff;border-radius:6px;color:#0a2540;font-size:.8rem;font-weight:600;padding:5px 28px 5px 10px;appearance:none;-webkit-appearance:none;cursor:pointer;font-family:inherit;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%230099ff' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;}
#cs-team-builder .cfg-sel:focus{outline:none;border-color:var(--blue);box-shadow:0 0 0 3px rgba(0,153,255,.1);}
#cs-team-builder .cfg-sel option{background:#fff;color:#0a2540;}
#cs-team-builder .loc-pills{display:flex;gap:6px;}
#cs-team-builder .loc-pill{padding:5px 14px;border-radius:20px;font-size:.75rem;font-weight:600;border:1.5px solid #cce5ff;background:#fff;color:#6b7280;cursor:pointer;transition:all .15s;font-family:inherit;white-space:nowrap;}
#cs-team-builder .loc-pill:hover{border-color:var(--blue);color:var(--blue);}
#cs-team-builder .loc-pill.active{background:var(--blue);border-color:var(--blue);color:#fff;}
#cs-team-builder .tb-body{display:grid;grid-template-columns:1fr 360px;}
@media(max-width:820px){#cs-team-builder .tb-body{grid-template-columns:1fr;}}
#cs-team-builder .add-panel{padding:24px 28px;border-right:1px solid var(--bdr);background:var(--surf);}
#cs-team-builder .panel-title{font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--blue);margin-bottom:16px;padding-left:10px;border-left:3px solid var(--blue);}
#cs-team-builder .fg-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
#cs-team-builder .fg-grid .sp2{grid-column:span 2;}
@media(max-width:560px){#cs-team-builder .fg-grid{grid-template-columns:1fr;}#cs-team-builder .fg-grid .sp2{grid-column:span 1;}}
#cs-team-builder .fg{display:flex;flex-direction:column;gap:4px;}
#cs-team-builder .fg label{font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);}
#cs-team-builder .fg select,#cs-team-builder .fg input[type=number]{border:1.5px solid var(--bdr);border-radius:var(--rs);padding:8px 11px;font-size:.85rem;color:var(--txt);background:#fff;appearance:none;-webkit-appearance:none;transition:border-color .15s;font-family:inherit;}
#cs-team-builder .fg select:focus,#cs-team-builder .fg input[type=number]:focus{outline:none;border-color:var(--blue);box-shadow:0 0 0 3px rgba(0,153,255,.1);}
#cs-team-builder .fg select:disabled{background:var(--bg);color:var(--muted);}
#cs-team-builder .seg{display:flex;border:1.5px solid var(--bdr);border-radius:var(--rs);overflow:hidden;}
#cs-team-builder .seg button{flex:1;padding:8px 4px;border:none;background:#fff;font-size:.75rem;font-weight:600;color:var(--muted);cursor:pointer;transition:all .15s;font-family:inherit;border-right:1px solid var(--bdr);}
#cs-team-builder .seg button:last-child{border-right:none;}
#cs-team-builder .seg button.active{background:var(--blue);color:#fff;border-color:var(--blue);}
#cs-team-builder #tbe-Junior.active{background:var(--green);border-color:var(--green);}
#cs-team-builder #tbe-Senior.active{background:var(--pink);border-color:var(--pink);}
#cs-team-builder .seg button:hover:not(.active){background:var(--bg);}
#cs-team-builder .cost-preview{margin-top:12px;background:var(--gold-bg);border:1px solid #fde8b0;border-radius:var(--rs);padding:12px 14px;display:none;}
#cs-team-builder .cp-title{font-size:.65rem;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700;margin-bottom:8px;}
#cs-team-builder .cp-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;}
#cs-team-builder .cp-cell .cpl{font-size:.63rem;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px;}
#cs-team-builder .cp-cell .cpv{font-size:.95rem;font-weight:800;color:var(--txt);font-variant-numeric:tabular-nums;}
#cs-team-builder .cp-cell.cs .cpv{color:var(--teal);}
#cs-team-builder .cp-cell.sv .cpv{color:var(--green);}
#cs-team-builder .btn-add{margin-top:14px;width:100%;padding:11px;background:linear-gradient(135deg,#0099ff 0%,#0077cc 100%);border:none;border-radius:30px;color:#fff;font-size:.875rem;font-weight:700;cursor:pointer;transition:opacity .15s,transform .1s;font-family:inherit;}
#cs-team-builder .btn-add:hover{opacity:.9;transform:translateY(-1px);}
#cs-team-builder .btn-add:active{transform:translateY(0);}
#cs-team-builder .btn-add:disabled{opacity:.4;cursor:not-allowed;transform:none;}
#cs-team-builder .stub-note{margin-top:10px;background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.22);border-radius:var(--rs);padding:7px 12px;font-size:.7rem;color:#92400e;display:flex;align-items:flex-start;gap:6px;line-height:1.5;}
#cs-team-builder .team-panel{padding:24px;background:var(--surf);display:flex;flex-direction:column;}
#cs-team-builder .team-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
#cs-team-builder .team-hdr-title{font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--blue);}
#cs-team-builder .team-badge{background:var(--gold);color:#fff;font-size:.68rem;font-weight:700;padding:2px 9px;border-radius:10px;}
#cs-team-builder .team-empty{text-align:center;padding:28px 12px;color:var(--muted);font-size:.8rem;line-height:1.6;}
#cs-team-builder .team-empty .tei{font-size:2rem;display:block;margin-bottom:6px;}
#cs-team-builder .ti{border:1px solid var(--bdr);border-radius:var(--rs);margin-bottom:7px;overflow:hidden;transition:box-shadow .15s;}
#cs-team-builder .ti:hover{box-shadow:0 2px 10px rgba(10,22,40,.07);}
#cs-team-builder .ti-hdr{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg);border-bottom:1px solid var(--bdr);}
#cs-team-builder .ti-qty{background:var(--blue);color:#fff;border-radius:5px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:800;flex-shrink:0;}
#cs-team-builder .ti-role{flex:1;font-size:.8rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#cs-team-builder .ti-tags{display:flex;gap:3px;flex-shrink:0;}
#cs-team-builder .tag{font-size:.6rem;font-weight:700;padding:2px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:.03em;}
#cs-team-builder .tag-exp{background:rgba(15,52,96,.1);color:var(--blue);}
#cs-team-builder .tag-hw{background:rgba(0,180,160,.1);color:#007a6e;}
#cs-team-builder .tag-cty{background:rgba(245,158,11,.12);color:#92400e;}
#cs-team-builder .ti-del{background:none;border:none;cursor:pointer;color:#cbd5e1;padding:2px 3px;font-size:.95rem;transition:color .15s;flex-shrink:0;}
#cs-team-builder .ti-del:hover{color:var(--red);}
#cs-team-builder .ti-body{display:grid;grid-template-columns:1fr 1fr;}
#cs-team-builder .ti-cost{padding:7px 10px;border-right:1px solid var(--bdr);}
#cs-team-builder .ti-cost:last-child{border-right:none;}
#cs-team-builder .tc-lbl{font-size:.62rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600;margin-bottom:1px;}
#cs-team-builder .tc-val{font-size:.85rem;font-weight:700;font-variant-numeric:tabular-nums;}
#cs-team-builder .ti-cost.hl{background:var(--green-bg);}
#cs-team-builder .ti-cost.hl .tc-val{color:var(--green);font-weight:800;}
#cs-team-builder .ti-cost.dm .tc-val{color:var(--muted);font-size:.78rem;}
#cs-team-builder .tb-summary{background:linear-gradient(90deg,#f0f7ff 0%,#f0fdf7 100%);padding:18px 32px;display:grid;grid-template-columns:repeat(4,1fr);border-top:3px solid var(--blue);}
@media(max-width:700px){#cs-team-builder .tb-summary{grid-template-columns:1fr 1fr;}}
#cs-team-builder .sum-item{padding:4px 16px 4px 0;border-right:1px solid #cce5ff;}
#cs-team-builder .sum-item:first-child{padding-left:0;}#cs-team-builder .sum-item:last-child{border-right:none;}
#cs-team-builder .si-lbl{font-size:.65rem;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;font-weight:600;margin-bottom:3px;}
#cs-team-builder .si-val{font-size:1.1rem;font-weight:800;color:#0a2540;font-variant-numeric:tabular-nums;letter-spacing:-.02em;}
#cs-team-builder .sum-item.ac .si-val{color:var(--blue);}
#cs-team-builder .sum-item.gd .si-val{color:var(--gold);font-size:1.25rem;}
#cs-team-builder .tb-cta{background:#fff;padding:16px 32px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;border-top:3px solid var(--gold);}
#cs-team-builder .tb-cta p{font-size:.78rem;color:var(--muted);max-width:520px;line-height:1.5;}
#cs-team-builder .tb-cta p strong{color:var(--txt);}
#cs-team-builder .btn-cta{padding:11px 26px;background:var(--blue);border:none;border-radius:30px;color:#fff;font-size:.85rem;font-weight:700;cursor:pointer;font-family:inherit;transition:background .15s;white-space:nowrap;}
#cs-team-builder .btn-cta:hover{background:#0077cc;}
#cs-team-builder .tb-loading{text-align:center;padding:40px 20px;color:var(--muted);}
#cs-team-builder .spinner{width:26px;height:26px;border:3px solid var(--bdr);border-top-color:var(--teal);border-radius:50%;animation:tbspin .7s linear infinite;display:inline-block;margin-bottom:10px;}
@keyframes tbspin{to{transform:rotate(360deg);}}`;
    document.head.appendChild(s);
  }

  el.id='cs-team-builder';
  el.innerHTML=`
<div class="tbh"><div class="tbh-inner"><div><h2>Build Your <span>Cloudstaff</span> Team</h2><p>Get an instant cost estimate and see how much you save versus hiring onshore.</p></div><div class="sav-badge"><div class="sbl">Estimated Annual Saving</div><div class="sbv" id="tb-hdr-saving">—</div><div class="sbs">vs. hiring onshore</div></div></div></div>
<div class="cfg-bar">
  <div class="cfg-group"><span class="cfg-label">Currency</span><select class="cfg-sel" id="tb-currency-sel" onchange="tbSetCurrency(this.value)"></select></div>
  <div class="cfg-group"><span class="cfg-label">Staff Country</span><select class="cfg-sel" id="tb-country-sel" onchange="tbSetCountry(this.value)"></select></div>
  <div class="cfg-group"><span class="cfg-label">Work Arrangement</span><div class="loc-pills"><button class="loc-pill active" data-loc="office" onclick="tbSetLocation('office')">🏢 Office</button><button class="loc-pill" data-loc="hybrid" onclick="tbSetLocation('hybrid')">🔄 Hybrid</button><button class="loc-pill" data-loc="wfh" onclick="tbSetLocation('wfh')">🏠 WFH</button></div></div>
</div>
<div class="tb-body">
  <div class="add-panel"><div class="panel-title">➕ Add a Role</div><div id="tb-form-wrap"><div class="tb-loading"><div class="spinner"></div><br>Loading roles…</div></div></div>
  <div class="team-panel"><div class="team-hdr"><div class="team-hdr-title">Your Team</div><span class="team-badge" id="tb-team-count">0</span></div><div id="tb-team-items"><div class="team-empty"><span class="tei">👥</span>Add roles using the form.</div></div></div>
</div>
<div class="tb-summary">
  <div class="sum-item"><div class="si-lbl">Team Size</div><div class="si-val" id="tb-sum-staff">0 staff</div></div>
  <div class="sum-item ac"><div class="si-lbl">Hire with Cloudstaff</div><div class="si-val" id="tb-sum-cs">—</div></div>
  <div class="sum-item"><div class="si-lbl">Onshore Estimate ⚠️</div><div class="si-val" id="tb-sum-onsh">—</div></div>
  <div class="sum-item gd"><div class="si-lbl">Annual Saving</div><div class="si-val" id="tb-sum-saving">—</div></div>
</div>
<div class="tb-cta"><p><strong>These are indicative estimates.</strong> Your Cloudstaff BDM will prepare a detailed, personalised proposal — typically within one business day.</p><button class="btn-cta" onclick="window.location.href='https://www.cloudstaff.com/au/contact/'">Get a Detailed Quote →</button></div>`;

  const cs=document.getElementById('tb-currency-sel');
  TB_CURR.forEach(c=>{const o=document.createElement('option');o.value=c.code;o.textContent=c.label;if(c.code==='USD')o.selected=true;cs.appendChild(o);});
  const ct=document.getElementById('tb-country-sel');
  TB_COUNTRIES.forEach(c=>{const o=document.createElement('option');o.value=c.code;o.textContent=c.label+(c.stub?' (coming soon)':'');if(c.code==='PH')o.selected=true;ct.appendChild(o);});

  tbWidgetMounted=true;
  tbInit();
}

// ================================================================
// RRP ADMIN PAGE CONTROLLERS
// ================================================================
function tbSwitchTab(tab) {
  ['preview','embed','settings'].forEach(t=>{
    const panel=document.getElementById(`tb-panel-${t}`), btn=document.getElementById(`tb-tab-${t}`);
    if(!panel||!btn)return;
    const active=t===tab;
    panel.style.display=active?'':'none';
    btn.style.borderBottomColor=active?'var(--accent)':'transparent';
    btn.style.color=active?'var(--accent)':'var(--text-muted)';
  });
  if(tab==='preview') tbMountWidget('tb-widget-mount');
  if(tab==='embed'){
    const el=document.getElementById('tb-embed-code');
    if(el) el.textContent=`<!-- Cloudstaff Team Builder Widget -->
<script src="js/teambuilder-widget.js"><\/script>
<div id="tb-widget-mount"></div>
<script>document.addEventListener('DOMContentLoaded',()=>tbMountWidget('tb-widget-mount'));<\/script>`;
  }
}

function tbCopyEmbed(){
  const el=document.getElementById('tb-embed-code'); if(!el)return;
  navigator.clipboard.writeText(el.textContent).then(()=>{
    const fb=document.getElementById('tb-copy-feedback');
    if(fb){fb.style.display='block';setTimeout(()=>fb.style.display='none',2500);}
  });
}

function tbSaveStubs(){
  const j=parseFloat(document.getElementById('tb-stub-junior')?.value)||5800;
  const m=parseFloat(document.getElementById('tb-stub-mid')?.value)||7500;
  const s=parseFloat(document.getElementById('tb-stub-senior')?.value)||9800;
  TB_ONSHORE_AUD.DEFAULT={Junior:j,Mid:m,Senior:s};
  if(tbWidgetMounted)tbRecalcTeam();
  const saved=document.getElementById('tb-stubs-saved');
  if(saved){saved.style.display='inline';setTimeout(()=>saved.style.display='none',2500);}
}

// ================================================================
// SELF-INIT — fires when page-team-builder becomes visible
// Same IntersectionObserver pattern as salary-research.js
// ================================================================
(function(){
  function tbTryInit(){
    const page=document.getElementById('page-team-builder'); if(!page)return;
    const obs=new IntersectionObserver((entries)=>{
      entries.forEach(e=>{if(e.isIntersecting){obs.disconnect();tbSwitchTab('preview');}});
    },{threshold:0.01});
    obs.observe(page);
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',tbTryInit);}
  else{tbTryInit();}
})();
