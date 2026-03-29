// ================================================================
// CLOUDSTAFF TEAM BUILDER WIDGET — teambuilder-widget.js
// Loaded as part of the RRP Calculator app (after config.js).
// Uses SUPABASE_URL + SUPABASE_KEY globals from config.js.
// Also exposes tbSwitchTab(), tbCopyEmbed(), tbSaveStubs()
// for the RRP admin page.
// ================================================================

// ================================================================
// PRICE BOOKS — maps to DB price_books table names
// ================================================================
const TB_PRICEBOOK_MAP = {
  office: 'Current ELEVATE WFO',
  hybrid: 'Current ELEVATE Hybrid',
  wfh:    'Current ELEVATE WFH',
};

// ================================================================
// HARDWARE — maps to hardware_products table names
// ================================================================
const TB_HW_MAP = {
  basic: 'mPC Office 5 Laptop',
  power: 'mPC Power 7 Laptop',
};

// ================================================================
// CURRENCY CONFIG
// ================================================================
const TB_CURRENCIES = [
  { code:'USD', sym:'US$',  label:'USD — US Dollar'         },
  { code:'AUD', sym:'A$',   label:'AUD — Australian Dollar' },
  { code:'GBP', sym:'£',    label:'GBP — British Pound'     },
  { code:'HKD', sym:'HK$',  label:'HKD — Hong Kong Dollar'  },
  { code:'SGD', sym:'S$',   label:'SGD — Singapore Dollar'  },
  { code:'EUR', sym:'€',    label:'EUR — Euro'              },
  { code:'CAD', sym:'CA$',  label:'CAD — Canadian Dollar'   },
  { code:'NZD', sym:'NZ$',  label:'NZD — New Zealand Dollar'},
];

// ================================================================
// STAFF COUNTRIES
// ================================================================
const TB_COUNTRIES = [
  { code:'PH', label:'🇵🇭  Philippines', market:'PH', stub:false },
  { code:'CO', label:'🇨🇴  Colombia',    market:'CO', stub:false },
  { code:'IN', label:'🇮🇳  India',        market:'IN', stub:true  },
  { code:'KE', label:'🇰🇪  Kenya',        market:'KE', stub:true  },
];

// ================================================================
// LOCATION OPTIONS
// ================================================================
const TB_LOCATIONS = [
  { code:'office', label:'🏢 Work From Office' },
  { code:'hybrid', label:'🔄 Hybrid'           },
  { code:'wfh',    label:'🏠 Work From Home'   },
];

// ================================================================
// ONSHORE COMPARISON STUBS (AUD/month per person)
// Replace when AU salary research is published.
// Admins can override via Settings tab in RRP → Team Builder.
// ================================================================
let TB_ONSHORE_AUD = {
  DEFAULT: { Junior: 5800, Mid: 7500, Senior: 9800 }
};

// ================================================================
// RUNTIME STATE
// ================================================================
let tbRoles      = {};   // { PH:[...], CO:[...], IN:[], KE:[] }
let tbPriceBooks = {};   // { 'Current ELEVATE WFO':{ usd,aud,... }, ... }
let tbHardware   = {};   // { 'mPC Office 5 Laptop':{ usd,aud,... }, ... }
let tbFxRates    = {};   // latest fx row per market: { PH:{usd,aud,...}, CO:{...} }
let tbFxAudRates = {};   // base→AUD rate per market { PH: phpPerAud, CO: copPerAud }

let tbTeam       = [];
let tbCurrency   = 'USD';
let tbLocation   = 'office';
let tbCountry    = 'PH';
let tbExp        = 'Mid';
let tbHW         = 'basic';
let tbLoaded     = false;
let tbWidgetMounted = false;

// ================================================================
// FETCH HELPER (plain fetch, no supabase client to avoid clone issues)
// ================================================================
async function tbGet(path, extraHeaders = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Accept': 'application/json',
      ...extraHeaders,
    }
  });
  if (!res.ok) throw new Error(`tbGet ${path} → ${res.status}`);
  return res.json();
}

// ================================================================
// DATA LOADERS
// ================================================================
async function tbLoadData() {
  try {
    await Promise.all([
      tbLoadAllRoles(),
      tbLoadPriceBooks(),
      tbLoadHardware(),
      tbLoadFX(),
    ]);
  } catch(e) {
    console.warn('[TeamBuilder] DB load error, using demo data:', e.message);
    tbLoadDemoData();
  }
  tbLoaded = true;
}

async function tbLoadAllRoles() {
  const markets = TB_COUNTRIES.filter(c => !c.stub).map(c => c.market);
  await Promise.all(markets.map(async market => {
    let all = [], from = 0;
    while (true) {
      const data = await tbGet(
        `salary_ranges?select=id,job_title,category,jpid_level,low_salary,median_salary,high_salary` +
        `&market=eq.${market}&order=category.asc,job_title.asc`,
        { 'Range': `${from}-${from+999}`, 'Range-Unit': 'items', 'Prefer': 'count=none' }
      );
      if (!data || !data.length) break;
      all = all.concat(data);
      from += 1000;
      if (data.length < 1000) break;
    }
    tbRoles[market] = all;
  }));
  TB_COUNTRIES.filter(c => c.stub).forEach(c => { tbRoles[c.market] = []; });
}

async function tbLoadPriceBooks() {
  const data = await tbGet(
    `price_books?select=name,usd,aud,gbp,hkd,sgd,eur,cad,nzd`
  );
  data.forEach(pb => { tbPriceBooks[pb.name] = pb; });
}

async function tbLoadHardware() {
  // Columns use price_CURRENCY_elevate naming: price_usd_elevate, price_aud_elevate, etc.
  const data = await tbGet(
    `hardware_products?select=name,price_usd_elevate,price_aud_elevate,price_gbp_elevate,price_hkd_elevate,price_sgd_elevate,price_eur_elevate,price_cad_elevate,price_nzd_elevate`
  );
  data.forEach(hw => {
    // Normalise to simple currency keys for lookup
    tbHardware[hw.name] = {
      usd: hw.price_usd_elevate,
      aud: hw.price_aud_elevate,
      gbp: hw.price_gbp_elevate,
      hkd: hw.price_hkd_elevate,
      sgd: hw.price_sgd_elevate,
      eur: hw.price_eur_elevate,
      cad: hw.price_cad_elevate,
      nzd: hw.price_nzd_elevate,
    };
  });
}

async function tbLoadFX() {
  // PH base currency: PHP. fxRow.usd = PHP per 1 USD.
  const ph = await tbGet(
    `fx_monthly_rates?select=aud,usd,gbp,hkd,sgd,eur,cad,nzd&market=eq.PH&order=month_date.desc&limit=1`
  );
  if (ph && ph[0]) {
    tbFxRates.PH = ph[0];
    tbFxAudRates.PH = ph[0].aud ? parseFloat(ph[0].aud) : 37.92; // PHP per 1 AUD
  }
  try {
    const co = await tbGet(
      `fx_monthly_rates?select=aud,usd,gbp,hkd,sgd,eur,cad,nzd&market=eq.CO&order=month_date.desc&limit=1`
    );
    if (co && co[0]) {
      tbFxRates.CO = co[0];
      tbFxAudRates.CO = co[0].aud ? parseFloat(co[0].aud) : 4032; // COP per 1 AUD
    }
  } catch(e) { tbFxAudRates.CO = 4032; }
}

function tbLoadDemoData() {
  tbRoles.PH = [
    {job_title:'Accountant',          category:'Finance & Accounting', jpid_level:'Accountant Level 1',       low_salary:28000, median_salary:33000, high_salary:42000},
    {job_title:'Accountant',          category:'Finance & Accounting', jpid_level:'Accountant Level 2',       low_salary:35000, median_salary:42000, high_salary:52000},
    {job_title:'Accountant',          category:'Finance & Accounting', jpid_level:'Accountant Senior',        low_salary:52000, median_salary:62000, high_salary:78000},
    {job_title:'Front-End Developer', category:'Technology',           jpid_level:'Front-End Developer Level 1', low_salary:35000, median_salary:42000, high_salary:55000},
    {job_title:'Front-End Developer', category:'Technology',           jpid_level:'Front-End Developer Level 2', low_salary:45000, median_salary:55000, high_salary:70000},
    {job_title:'Front-End Developer', category:'Technology',           jpid_level:'Front-End Developer Senior',  low_salary:60000, median_salary:75000, high_salary:95000},
    {job_title:'Customer Service Rep',category:'Customer Service',     jpid_level:'CSR Level 1',              low_salary:22000, median_salary:27000, high_salary:33000},
    {job_title:'Graphic Designer',    category:'Creative & Design',    jpid_level:'Graphic Designer Level 2', low_salary:30000, median_salary:36000, high_salary:46000},
    {job_title:'Virtual Assistant',   category:'Administration',       jpid_level:'VA Level 1',               low_salary:20000, median_salary:24000, high_salary:30000},
  ];
  tbRoles.CO = [];
  tbRoles.IN = [];
  tbRoles.KE = [];
  tbPriceBooks['Current ELEVATE WFO']    = {usd:699,  aud:999,  gbp:549,  hkd:5445, sgd:952,  eur:644,  cad:952,  nzd:1176};
  tbPriceBooks['Current ELEVATE Hybrid'] = {usd:680,  aud:850,  gbp:530,  hkd:4995, sgd:924,  eur:626,  cad:924,  nzd:1140};
  tbPriceBooks['Current ELEVATE WFH']    = {usd:599,  aud:770,  gbp:467,  hkd:3000, gbp:467,  eur:551,  cad:814,  nzd:1005};
  tbHardware['mPC Office 5 Laptop']      = {usd:39,   aud:59.50,gbp:30.50,hkd:309,  sgd:53,   eur:36,   cad:53,   nzd:65  };
  tbHardware['mPC Power 7 Laptop']       = {usd:59,   aud:89,   gbp:46,   hkd:464,  sgd:80,   eur:54,   cad:80,   nzd:97  };
  tbFxRates.PH  = {aud:37.92, usd:56.18, gbp:44.28, hkd:439.1, sgd:75.6, eur:60.4, cad:77.2, nzd:97.6};
  tbFxAudRates.PH = 37.92;
  tbFxAudRates.CO = 4032;
}

// ================================================================
// COST CALCULATION
// ================================================================
function tbCurrKey(cur) { return cur.toLowerCase(); }

function tbGetCSFee(currency) {
  const pbName = TB_PRICEBOOK_MAP[tbLocation];
  const pb     = tbPriceBooks[pbName];
  if (!pb) return 0;
  return parseFloat(pb[tbCurrKey(currency)]) || 0;
}

function tbGetHWFee(hw, currency) {
  const hwName = TB_HW_MAP[hw];
  const hwAlt  = hw === 'power' ? 'mPC Office 7 Laptop' : null;
  const hwRow  = tbHardware[hwName] || (hwAlt && tbHardware[hwAlt]);
  if (!hwRow) return 0;
  return parseFloat(hwRow[tbCurrKey(currency)]) || 0;
}

// Convert native salary → target currency
// fxRow[cur] = nativeUnits per 1 targetCurrency
// So: nativeSalary / fxRow[targetCur] = targetCurrencyAmount
function tbNativeToTarget(nativeSalary, market, targetCurrency) {
  const fxRow = tbFxRates[market];
  if (!fxRow) {
    // AUD fallback: use audRate (native per AUD) then convert AUD→target via PH rates
    const audAmt = nativeSalary / (tbFxAudRates[market] || 37.92);
    if (targetCurrency === 'AUD') return audAmt;
    const phFx = tbFxRates.PH;
    if (!phFx) return audAmt;
    const audInPhp = tbFxAudRates.PH || 37.92;
    const tarInPhp = parseFloat(phFx[tbCurrKey(targetCurrency)]) || 1;
    return audAmt * (audInPhp / tarInPhp);
  }
  const fxVal = parseFloat(fxRow[tbCurrKey(targetCurrency)]);
  if (!fxVal) return 0;
  return nativeSalary / fxVal;
}

// EDC approximation matching calculator-ph.js simplified for consumer use
function tbCalcEDCNative(nativeBase) {
  const gov    = nativeBase * 0.16;   // SSS + PHIC + PAGIBIG + 13th month
  const tenure = nativeBase * 0.042;  // separation/tenure
  const csBen  = nativeBase * 0.09;   // HMO, rice subsidy, team building, social club
  const csCost = nativeBase * 0.035;  // insurance, Microsoft, indemnity
  return nativeBase + gov + tenure + csBen + csCost;
}

// Strip level suffixes from job_title for clean display
function tbStripLevel(title) {
  return title
    .replace(/\s+(Level\s+\d+|Senior|Junior|Lead|Principal|Specialist)\s*$/i, '')
    .trim();
}

// Map experience → level number for DB matching
function tbExpToLevel(exp) {
  return exp === 'Junior' ? 1 : exp === 'Senior' ? 3 : 2;
}

// Extract level number from a full jpid_level string
function tbGetLevelNum(jpidLevel) {
  if (!jpidLevel) return 2;
  const lc = jpidLevel.toLowerCase();
  if (lc.includes('level 1') || lc.includes('junior') || lc.includes('entry')) return 1;
  if (lc.includes('senior') || lc.includes('lead') || lc.includes('principal')) return 3;
  if (lc.includes('level 2') || lc.includes('mid') || lc.includes('intermediate')) return 2;
  return 2;
}

function tbComputeCost(roleName, exp, hw, qty) {
  const market   = TB_COUNTRIES.find(c => c.code === tbCountry)?.market || 'PH';
  const allRoles = tbRoles[market] || [];
  if (!allRoles.length) return null;

  // Find all rows where stripped job_title matches
  const baseName   = tbStripLevel(roleName);
  const candidates = allRoles.filter(r => tbStripLevel(r.job_title) === baseName);
  if (!candidates.length) return null;

  // Sort by median salary ascending, pick by experience level
  const sorted = [...candidates].sort((a,b) => (a.median_salary||0) - (b.median_salary||0));
  const targetLevel = tbExpToLevel(exp);

  let match;
  if (sorted.length === 1) {
    match = sorted[0];
  } else if (sorted.length === 2) {
    match = targetLevel === 1 ? sorted[0] : sorted[1];
  } else {
    // 3+ rows: find closest level match
    const byLevel = sorted.map(r => ({ r, lvl: tbGetLevelNum(r.jpid_level) }));
    const exact = byLevel.find(x => x.lvl === targetLevel);
    match = exact ? exact.r : (targetLevel === 1 ? sorted[0] : targetLevel === 3 ? sorted[sorted.length-1] : sorted[Math.floor(sorted.length/2)]);
  }

  const nativeBase  = match.median_salary || match.low_salary || 30000;
  const edcNative   = tbCalcEDCNative(nativeBase);
  const edcTarget   = tbNativeToTarget(edcNative, market, tbCurrency);

  const csFee    = tbGetCSFee(tbCurrency);
  const hwFee    = tbGetHWFee(hw, tbCurrency);
  const csTotal1 = edcTarget + csFee + hwFee;
  const csTotal  = csTotal1 * qty;

  // Onshore comparison in target currency (stubs in AUD)
  const stubs   = TB_ONSHORE_AUD[roleName] || TB_ONSHORE_AUD.DEFAULT;
  const onshAUD = stubs[exp] || stubs.Mid || 7500;

  let onsh1;
  if (tbCurrency === 'AUD') {
    onsh1 = onshAUD;
  } else {
    // AUD → target via PH FX table as reference rates
    const phFx = tbFxRates.PH;
    if (phFx) {
      const audInPhp = tbFxAudRates.PH || 37.92;
      const tarInPhp = parseFloat(phFx[tbCurrKey(tbCurrency)]) || 56.18;
      onsh1 = onshAUD * (audInPhp / tarInPhp);
    } else {
      onsh1 = onshAUD;
    }
  }
  const onshoreTotal = onsh1 * qty;
  const saving       = Math.max(0, onshoreTotal - csTotal);

  return {
    edcTarget, csFee, hwFee,
    csTotal, csTotal1,
    onshoreTotal, onsh1,
    saving, qty,
    nativeBase, match,
    pbName: TB_PRICEBOOK_MAP[tbLocation],
    hwName: TB_HW_MAP[hw],
  };
}

// ================================================================
// FORMAT HELPERS
// ================================================================
function tbSym(cur) {
  return TB_CURRENCIES.find(c => c.code === cur)?.sym || '$';
}
function tbFmt(n, cur) {
  if (n == null || isNaN(n)) return '—';
  const sym = tbSym(cur || tbCurrency);
  return sym + Math.round(n).toLocaleString('en-AU');
}

// ================================================================
// ROLE HELPERS
// ================================================================
function tbGetCategories(market) {
  const roles = tbRoles[market] || [];
  return [...new Set(roles.map(r => r.category).filter(Boolean))].sort();
}

function tbGetRolesForCategory(cat, market) {
  const roles = tbRoles[market] || [];
  const seen  = new Set();
  const out   = [];
  roles.filter(r => r.category === cat).forEach(r => {
    const name = tbStripLevel(r.job_title);
    if (!seen.has(name)) { seen.add(name); out.push(name); }
  });
  return out.sort();
}

// ================================================================
// WIDGET HTML TEMPLATE
// ================================================================
function tbWidgetHTML() {
  return `
<style>
#cs-team-builder*,#cs-team-builder *::before,#cs-team-builder *::after{box-sizing:border-box;margin:0;padding:0;}
#cs-team-builder{
  --blue:#0099ff;--blue-dk:#0077cc;--navy:#0a1628;--teal:#00b4a0;--teal-lt:#00d4be;
  --gold:#f59e0b;--red:#ef4444;--green:#10b981;--pink:#f472b6;
  --surf:#fff;--bg:#f8fafd;--bdr:#e2eaf4;--txt:#0a1628;--muted:#64748b;
  --r:14px;--rs:8px;
  font-family:'Inter','DM Sans','Segoe UI',system-ui,sans-serif;
  background:var(--bg);border-radius:var(--r);max-width:1160px;
  margin:0 auto;color:var(--txt);overflow:hidden;
  box-shadow:0 4px 32px rgba(10,22,40,0.12);
}
#cs-team-builder .tbh{
  background:linear-gradient(135deg,#0077cc 0%,#0099ff 60%,#22c1e0 100%);
  padding:28px 32px 24px;position:relative;overflow:hidden;
}
#cs-team-builder .tbh::before{
  content:'';position:absolute;right:-40px;top:-40px;width:280px;height:280px;
  background:radial-gradient(circle,rgba(255,255,255,.12) 0%,transparent 70%);
  border-radius:50%;pointer-events:none;
}
#cs-team-builder .tbh::after{
  content:'';position:absolute;left:40%;bottom:-20px;width:200px;height:200px;
  background:radial-gradient(circle,rgba(245,166,35,.15) 0%,transparent 70%);
  border-radius:50%;pointer-events:none;
}
#cs-team-builder .tbh-inner{position:relative;z-index:1;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px;}
#cs-team-builder .tbh h2{font-size:1.55rem;font-weight:800;color:#fff;line-height:1.2;letter-spacing:-.02em;}
#cs-team-builder .tbh h2 span{color:#ffd166;}
#cs-team-builder .tbh p{color:rgba(255,255,255,.7);font-size:.875rem;margin-top:5px;max-width:460px;}
#cs-team-builder .sav-badge{background:rgba(255,255,255,.15);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.25);border-radius:10px;padding:12px 18px;text-align:right;white-space:nowrap;}
#cs-team-builder .sav-badge .sbl{font-size:.65rem;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.7);font-weight:600;}
#cs-team-builder .sav-badge .sbv{font-size:1.45rem;font-weight:800;color:#ffd166;line-height:1.1;font-variant-numeric:tabular-nums;}
#cs-team-builder .sav-badge .sbs{font-size:.65rem;color:rgba(255,255,255,.5);margin-top:2px;}
#cs-team-builder .cfg-bar{background:#f0f7ff;border-bottom:1px solid #cce5ff;padding:12px 32px;display:flex;align-items:center;flex-wrap:wrap;gap:20px;}
#cs-team-builder .cfg-group{display:flex;align-items:center;gap:8px;}
#cs-team-builder .cfg-label{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);}
#cs-team-builder .cfg-sel{border:1.5px solid var(--bdr);border-radius:var(--rs);padding:6px 10px;font-size:.82rem;color:var(--txt);background:#fff;font-family:inherit;cursor:pointer;}
#cs-team-builder .cfg-sel:focus{outline:none;border-color:var(--blue);}
#cs-team-builder .loc-pills{display:flex;gap:4px;}
#cs-team-builder .loc-pill{padding:5px 12px;border:1.5px solid var(--bdr);border-radius:20px;font-size:.75rem;font-weight:600;background:#fff;color:var(--muted);cursor:pointer;transition:all .15s;font-family:inherit;}
#cs-team-builder .loc-pill.active{background:var(--blue);color:#fff;border-color:var(--blue);}
#cs-team-builder .loc-pill:hover:not(.active){border-color:var(--blue);color:var(--blue);}
#cs-team-builder .tb-body{display:grid;grid-template-columns:1fr 360px;}
@media(max-width:820px){#cs-team-builder .tb-body{grid-template-columns:1fr;}}
#cs-team-builder .add-panel{padding:24px 28px;border-right:1px solid var(--bdr);background:var(--surf);}
#cs-team-builder .panel-title{font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--blue);margin-bottom:16px;border-left:3px solid var(--blue);padding-left:8px;}
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
#cs-team-builder .seg button.active.exp-j{background:var(--green);color:#fff;border-color:var(--green);}
#cs-team-builder .seg button.active.exp-m{background:var(--blue);color:#fff;border-color:var(--blue);}
#cs-team-builder .seg button.active.exp-s{background:var(--pink);color:#fff;border-color:var(--pink);}
#cs-team-builder .seg button:hover:not(.active){background:var(--bg);}
#cs-team-builder .cost-preview{margin-top:12px;background:var(--bg);border:1px solid var(--bdr);border-radius:var(--rs);padding:12px 14px;display:none;}
#cs-team-builder .cp-title{font-size:.65rem;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700;margin-bottom:8px;}
#cs-team-builder .cp-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;}
#cs-team-builder .cp-cell .cpl{font-size:.63rem;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px;}
#cs-team-builder .cp-cell .cpv{font-size:.95rem;font-weight:800;color:var(--txt);font-variant-numeric:tabular-nums;}
#cs-team-builder .cp-cell.cs .cpv{color:var(--blue);}
#cs-team-builder .cp-cell.sv .cpv{color:var(--green);}
#cs-team-builder .btn-add{margin-top:14px;width:100%;padding:11px;background:var(--blue);border:none;border-radius:var(--rs);color:#fff;font-size:.875rem;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit;}
#cs-team-builder .btn-add:hover{background:var(--blue-dk);transform:translateY(-1px);}
#cs-team-builder .btn-add:active{transform:translateY(0);}
#cs-team-builder .btn-add:disabled{opacity:.4;cursor:not-allowed;transform:none;}
#cs-team-builder .stub-note{margin-top:10px;background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.22);border-radius:var(--rs);padding:7px 12px;font-size:.7rem;color:#92400e;display:flex;align-items:flex-start;gap:6px;line-height:1.5;}
#cs-team-builder .team-panel{padding:24px;background:#fafbfd;display:flex;flex-direction:column;}
#cs-team-builder .team-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
#cs-team-builder .team-hdr-title{font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);}
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
#cs-team-builder .tag-exp{background:rgba(0,153,255,.1);color:var(--blue);}
#cs-team-builder .tag-hw{background:rgba(0,180,160,.1);color:#007a6e;}
#cs-team-builder .tag-cty{background:rgba(245,158,11,.12);color:#92400e;}
#cs-team-builder .ti-del{background:none;border:none;cursor:pointer;color:#cbd5e1;padding:2px 3px;font-size:.95rem;transition:color .15s;flex-shrink:0;}
#cs-team-builder .ti-del:hover{color:var(--red);}
#cs-team-builder .ti-body{display:grid;grid-template-columns:1fr 1fr;}
#cs-team-builder .ti-cost{padding:7px 10px;border-right:1px solid var(--bdr);}
#cs-team-builder .ti-cost:last-child{border-right:none;}
#cs-team-builder .tc-lbl{font-size:.62rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600;margin-bottom:1px;}
#cs-team-builder .tc-val{font-size:.85rem;font-weight:700;font-variant-numeric:tabular-nums;}
#cs-team-builder .ti-cost.hl .tc-val{color:var(--green);}
#cs-team-builder .ti-cost.dm .tc-val{color:var(--muted);font-size:.78rem;}
#cs-team-builder .tb-summary{background:#f0f7ff;padding:18px 32px;display:grid;grid-template-columns:repeat(4,1fr);border-top:3px solid var(--blue);}
@media(max-width:700px){#cs-team-builder .tb-summary{grid-template-columns:1fr 1fr;}}
#cs-team-builder .sum-item{padding:4px 16px 4px 0;border-right:1px solid #cce5ff;}
#cs-team-builder .sum-item:first-child{padding-left:0;}
#cs-team-builder .sum-item:last-child{border-right:none;}
#cs-team-builder .si-lbl{font-size:.65rem;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;font-weight:600;margin-bottom:3px;}
#cs-team-builder .si-val{font-size:1.1rem;font-weight:800;color:#0a2540;font-variant-numeric:tabular-nums;letter-spacing:-.02em;}
#cs-team-builder .sum-item.ac .si-val{color:var(--blue);}
#cs-team-builder .sum-item.gd .si-val{color:var(--green);}
#cs-team-builder .tb-cta{background:#fff;padding:16px 32px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;border-top:1px solid var(--bdr);}
#cs-team-builder .tb-cta p{font-size:.78rem;color:var(--muted);max-width:520px;line-height:1.5;}
#cs-team-builder .tb-cta p strong{color:var(--txt);}
#cs-team-builder .btn-cta{padding:11px 26px;background:var(--blue);border:none;border-radius:30px;color:#fff;font-size:.85rem;font-weight:700;cursor:pointer;font-family:inherit;transition:background .15s;white-space:nowrap;}
#cs-team-builder .btn-cta:hover{background:var(--blue-dk);}
#cs-team-builder .tb-loading{text-align:center;padding:40px 20px;color:var(--muted);}
#cs-team-builder .spinner{width:26px;height:26px;border:3px solid var(--bdr);border-top-color:var(--blue);border-radius:50%;animation:tbspin .7s linear infinite;display:inline-block;margin-bottom:10px;}
@keyframes tbspin{to{transform:rotate(360deg);}}
</style>

<div class="tbh">
  <div class="tbh-inner">
    <div>
      <h2>Build Your <span>Cloudstaff</span> Team</h2>
      <p>Get an instant cost estimate and see how much you save versus hiring onshore.</p>
    </div>
    <div class="sav-badge">
      <div class="sbl">Estimated Annual Saving</div>
      <div class="sbv" id="tb-hdr-saving">—</div>
      <div class="sbs">vs. hiring onshore</div>
    </div>
  </div>
</div>

<div class="cfg-bar">
  <div class="cfg-group">
    <span class="cfg-label">Currency</span>
    <select class="cfg-sel" id="tb-currency" onchange="tbSetCurrency(this.value)"></select>
  </div>
  <div class="cfg-group">
    <span class="cfg-label">Staff Country</span>
    <select class="cfg-sel" id="tb-country" onchange="tbSetCountry(this.value)"></select>
  </div>
  <div class="cfg-group">
    <span class="cfg-label">Work Arrangement</span>
    <div class="loc-pills">
      <button class="loc-pill active" data-loc="office" onclick="tbSetLocation('office')">🏢 Office</button>
      <button class="loc-pill"        data-loc="hybrid" onclick="tbSetLocation('hybrid')">🔄 Hybrid</button>
      <button class="loc-pill"        data-loc="wfh"    onclick="tbSetLocation('wfh')">🏠 WFH</button>
    </div>
  </div>
</div>

<div class="tb-body">
  <div class="add-panel">
    <div class="panel-title">➕ Add a Role</div>
    <div id="tb-form-wrap">
      <div class="tb-loading"><div class="spinner"></div><br>Loading roles…</div>
    </div>
  </div>
  <div class="team-panel">
    <div class="team-hdr">
      <div class="team-hdr-title">Your Team</div>
      <span class="team-badge" id="tb-team-count">0</span>
    </div>
    <div id="tb-team-items">
      <div class="team-empty"><span class="tei">👥</span>Add roles using the form.</div>
    </div>
  </div>
</div>

<div class="tb-summary">
  <div class="sum-item">
    <div class="si-lbl">Team Size</div>
    <div class="si-val" id="tb-sum-staff">0 staff</div>
  </div>
  <div class="sum-item ac">
    <div class="si-lbl">Hire with Cloudstaff</div>
    <div class="si-val" id="tb-sum-cs">—</div>
  </div>
  <div class="sum-item">
    <div class="si-lbl">Onshore Estimate ⚠️</div>
    <div class="si-val" id="tb-sum-onshore">—</div>
  </div>
  <div class="sum-item gd">
    <div class="si-lbl">Annual Saving</div>
    <div class="si-val" id="tb-sum-saving">—</div>
  </div>
</div>

<div class="tb-cta">
  <p><strong>These are indicative estimates.</strong> Your Cloudstaff BDM will prepare a detailed, personalised proposal — typically within one business day.</p>
  <button class="btn-cta" onclick="window.location.href='https://www.cloudstaff.com/au/contact/'">
    Get a Detailed Quote →
  </button>
</div>`;
}

// ================================================================
// RENDER FORM (inside the widget)
// ================================================================
function tbRenderForm() {
  const wrap   = document.getElementById('tb-form-wrap');
  if (!wrap) return;
  const market = TB_COUNTRIES.find(c => c.code === tbCountry)?.market || 'PH';
  const cats   = tbGetCategories(market);
  const isStub = TB_COUNTRIES.find(c => c.code === tbCountry)?.stub;

  wrap.innerHTML = `
    ${isStub ? `<div class="stub-note">⚠️ Salary data for this country is coming soon. Switch to Philippines or Colombia to build your team.</div>` : ''}
    <div class="fg-grid">
      <div class="fg sp2">
        <label>Job Category</label>
        <select id="tb-cat" onchange="tbOnCatChange()" ${isStub?'disabled':''}>
          <option value="">— Select a category —</option>
          ${cats.map(c=>`<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div class="fg sp2">
        <label>Role</label>
        <select id="tb-role" disabled onchange="tbPreviewCost()">
          <option value="">— Select a category first —</option>
        </select>
      </div>
      <div class="fg">
        <label>Quantity</label>
        <input type="number" id="tb-qty" value="1" min="1" max="50" oninput="tbPreviewCost()">
      </div>
      <div class="fg">
        <label>Experience Level</label>
        <div class="seg">
          <button id="tbe-Junior" class="exp-j ${tbExp==='Junior'?'active':''}" onclick="tbSetExp('Junior')">Junior</button>
          <button id="tbe-Mid"    class="exp-m ${tbExp==='Mid'   ?'active':''}" onclick="tbSetExp('Mid')">Mid</button>
          <button id="tbe-Senior" class="exp-s ${tbExp==='Senior'?'active':''}" onclick="tbSetExp('Senior')">Senior</button>
        </div>
      </div>
      <div class="fg sp2">
        <label>Laptop</label>
        <div class="seg">
          <button id="tbh-basic" class="${tbHW==='basic'?'active exp-m':''}" onclick="tbSetHW('basic')">💻 Basic Laptop</button>
          <button id="tbh-power" class="${tbHW==='power'?'active exp-s':''}" onclick="tbSetHW('power')">⚡ Power Laptop</button>
        </div>
      </div>
    </div>
    <div class="cost-preview" id="tb-preview">
      <div class="cp-title">Cost Preview · per month · ${tbCurrency}</div>
      <div class="cp-grid" id="tb-preview-cells"></div>
    </div>
    <div class="stub-note" style="margin-top:10px;">
      ⚠️ Onshore comparison is an estimate (AU market rates). Figures updated when AU salary research is complete.
    </div>
    <button class="btn-add" id="tb-add-btn" onclick="tbAddRole()" disabled>+ Add to Team</button>
  `;
}

// ================================================================
// INTERACTION HANDLERS
// ================================================================
function tbOnCatChange() {
  const cat    = document.getElementById('tb-cat')?.value;
  const roleEl = document.getElementById('tb-role');
  if (!roleEl) return;
  const market = TB_COUNTRIES.find(c => c.code === tbCountry)?.market || 'PH';
  if (!cat) {
    roleEl.innerHTML = '<option value="">— Select a category first —</option>';
    roleEl.disabled = true;
    return;
  }
  const roles = tbGetRolesForCategory(cat, market);
  roleEl.innerHTML = '<option value="">— Select a role —</option>' +
    roles.map(r => `<option value="${r}">${r}</option>`).join('');
  roleEl.disabled = false;
  const addBtn = document.getElementById('tb-add-btn');
  if (addBtn) addBtn.disabled = true;
  const preview = document.getElementById('tb-preview');
  if (preview) preview.style.display = 'none';
}

function tbPreviewCost() {
  const roleName = document.getElementById('tb-role')?.value;
  const qty      = parseInt(document.getElementById('tb-qty')?.value) || 1;
  const addBtn   = document.getElementById('tb-add-btn');
  const preview  = document.getElementById('tb-preview');
  if (!roleName) {
    if (addBtn)  addBtn.disabled = true;
    if (preview) preview.style.display = 'none';
    return;
  }
  const costs = tbComputeCost(roleName, tbExp, tbHW, qty);
  if (!costs) { if (addBtn) addBtn.disabled = true; return; }
  if (addBtn)  addBtn.disabled = false;
  if (preview) preview.style.display = 'block';
  const cells = document.getElementById('tb-preview-cells');
  if (cells) {
    cells.innerHTML = `
      <div class="cp-cell cs"><div class="cpl">Hire w/ Cloudstaff</div><div class="cpv">${tbFmt(costs.csTotal)}/mo</div></div>
      <div class="cp-cell"><div class="cpl">Onshore Est. ⚠️</div><div class="cpv" style="color:var(--muted)">${tbFmt(costs.onshoreTotal)}/mo</div></div>
      <div class="cp-cell sv"><div class="cpl">Monthly Saving</div><div class="cpv">${tbFmt(costs.saving)}/mo</div></div>`;
  }
}

function tbSetExp(exp) {
  tbExp = exp;
  ['Junior','Mid','Senior'].forEach(e => {
    const el = document.getElementById(`tbe-${e}`);
    if (!el) return;
    const cls = e === 'Junior' ? 'exp-j' : e === 'Mid' ? 'exp-m' : 'exp-s';
    el.className = `${cls}${e === exp ? ' active' : ''}`;
  });
  tbPreviewCost();
}

function tbSetHW(hw) {
  tbHW = hw;
  const bEl = document.getElementById('tbh-basic');
  const pEl = document.getElementById('tbh-power');
  if (bEl) bEl.className = hw === 'basic' ? 'active exp-m' : '';
  if (pEl) pEl.className = hw === 'power' ? 'active exp-s' : '';
  tbPreviewCost();
}

function tbSetLocation(loc) {
  tbLocation = loc;
  document.querySelectorAll('#cs-team-builder .loc-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.loc === loc);
  });
  tbTeam = tbTeam.map(t => {
    const c = tbComputeCost(t.roleName, t.exp, t.hw, t.qty);
    return c ? {...t, costs:c, location:loc} : t;
  });
  tbRenderTeam();
  tbRenderSummary();
  tbPreviewCost();
}

function tbSetCurrency(cur) {
  tbCurrency = cur;
  tbTeam = tbTeam.map(t => {
    const c = tbComputeCost(t.roleName, t.exp, t.hw, t.qty);
    return c ? {...t, costs:c} : t;
  });
  tbRenderTeam();
  tbRenderSummary();
  const pt = document.querySelector('#tb-preview .cp-title');
  if (pt) pt.textContent = `Cost Preview · per month · ${cur}`;
  tbPreviewCost();
}

function tbSetCountry(cty) {
  tbCountry = cty;
  tbTeam = [];
  tbRenderForm();
  tbRenderTeam();
  tbRenderSummary();
}

function tbAddRole() {
  const roleName = document.getElementById('tb-role')?.value;
  const cat      = document.getElementById('tb-cat')?.value;
  const qty      = parseInt(document.getElementById('tb-qty')?.value) || 1;
  if (!roleName) return;
  const costs = tbComputeCost(roleName, tbExp, tbHW, qty);
  if (!costs) return;
  tbTeam.push({ id:Date.now(), cat, roleName, qty, exp:tbExp, hw:tbHW, country:tbCountry, costs });
  tbRenderTeam();
  tbRenderSummary();
  // Reset form selectors
  const catEl = document.getElementById('tb-cat');
  if (catEl) catEl.value = '';
  const roleEl = document.getElementById('tb-role');
  if (roleEl) { roleEl.innerHTML='<option value="">— Select a category first —</option>'; roleEl.disabled=true; }
  const addBtn = document.getElementById('tb-add-btn');
  if (addBtn) addBtn.disabled = true;
  const preview = document.getElementById('tb-preview');
  if (preview) preview.style.display = 'none';
  const qtyEl = document.getElementById('tb-qty');
  if (qtyEl) qtyEl.value = 1;
}

function tbRemoveRole(id) {
  tbTeam = tbTeam.filter(t => t.id !== id);
  tbRenderTeam();
  tbRenderSummary();
}

// ================================================================
// RENDER TEAM LIST
// ================================================================
function tbRenderTeam() {
  const wrap  = document.getElementById('tb-team-items');
  const badge = document.getElementById('tb-team-count');
  if (!wrap) return;
  const totalStaff = tbTeam.reduce((s,t) => s + t.qty, 0);
  if (badge) badge.textContent = totalStaff;
  if (!tbTeam.length) {
    wrap.innerHTML = `<div class="team-empty"><span class="tei">👥</span>Add roles using the form — your team appears here.</div>`;
    return;
  }
  wrap.innerHTML = tbTeam.map(t => {
    const ctyInfo = TB_COUNTRIES.find(c => c.code === t.country);
    return `
    <div class="ti">
      <div class="ti-hdr">
        <div class="ti-qty">${t.qty}</div>
        <div class="ti-role">${t.roleName}</div>
        <div class="ti-tags">
          <span class="tag tag-exp">${t.exp}</span>
          <span class="tag tag-hw">${t.hw==='power'?'⚡':'💻'}</span>
          <span class="tag tag-cty">${ctyInfo?.code||''}</span>
        </div>
        <button class="ti-del" onclick="tbRemoveRole(${t.id})" title="Remove">✕</button>
      </div>
      <div class="ti-body">
        <div class="ti-cost hl"><div class="tc-lbl">Hire w/ Cloudstaff</div><div class="tc-val">${tbFmt(t.costs.csTotal)}<span style="font-size:.6rem;font-weight:500;color:var(--muted);">/mo</span></div></div>
        <div class="ti-cost dm"><div class="tc-lbl">Onshore Est. ⚠️</div><div class="tc-val">${tbFmt(t.costs.onshoreTotal)}/mo</div></div>
      </div>
    </div>`;
  }).join('');
}

// ================================================================
// RENDER SUMMARY BAR
// ================================================================
function tbRenderSummary() {
  const totalCS      = tbTeam.reduce((s,t) => s + t.costs.csTotal, 0);
  const totalOnshore = tbTeam.reduce((s,t) => s + t.costs.onshoreTotal, 0);
  const totalSaving  = Math.max(0, totalOnshore - totalCS);
  const totalStaff   = tbTeam.reduce((s,t) => s + t.qty, 0);
  const annualSaving = totalSaving * 12;
  const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set('tb-sum-staff',   `${totalStaff} staff`);
  set('tb-sum-cs',      tbFmt(totalCS) + '/mo');
  set('tb-sum-onshore', tbFmt(totalOnshore) + '/mo');
  set('tb-sum-saving',  tbFmt(annualSaving) + '/yr');
  set('tb-hdr-saving',  tbFmt(annualSaving));
}

// ================================================================
// MOUNT WIDGET INTO A TARGET DIV
// ================================================================
async function tbMountWidget(targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.id = 'cs-team-builder';
  el.innerHTML = tbWidgetHTML();

  // Populate currency select
  const curSel = document.getElementById('tb-currency');
  if (curSel) {
    TB_CURRENCIES.forEach(c => {
      const o = document.createElement('option');
      o.value = c.code; o.textContent = c.label;
      if (c.code === tbCurrency) o.selected = true;
      curSel.appendChild(o);
    });
  }

  // Populate country select
  const ctySel = document.getElementById('tb-country');
  if (ctySel) {
    TB_COUNTRIES.forEach(c => {
      const o = document.createElement('option');
      o.value = c.code; o.textContent = c.label + (c.stub ? ' (coming soon)' : '');
      if (c.code === tbCountry) o.selected = true;
      ctySel.appendChild(o);
    });
  }

  // Load data if not already loaded
  if (!tbLoaded) {
    await tbLoadData();
  }

  tbRenderForm();
  tbRenderTeam();
  tbRenderSummary();
  tbWidgetMounted = true;
}

// ================================================================
// RRP ADMIN PAGE CONTROLLERS
// Called by index.html page buttons
// ================================================================

// Switch tabs on the Team Builder admin page
function tbSwitchTab(tab) {
  ['preview','embed','settings'].forEach(t => {
    const panel = document.getElementById(`tb-panel-${t}`);
    const btn   = document.getElementById(`tb-tab-${t}`);
    if (!panel || !btn) return;
    const active = t === tab;
    panel.style.display = active ? '' : 'none';
    btn.style.borderBottomColor = active ? 'var(--accent)' : 'transparent';
    btn.style.color = active ? 'var(--accent)' : 'var(--text-muted)';
  });

  // Mount widget when preview tab is activated
  if (tab === 'preview') {
    const mount = document.getElementById('tb-widget-mount');
    if (mount && !tbWidgetMounted) {
      tbMountWidget('tb-widget-mount');
    }
  }

  // Populate embed code
  if (tab === 'embed') {
    const codeEl = document.getElementById('tb-embed-code');
    if (codeEl) {
      codeEl.textContent =
`<!-- Cloudstaff Team Builder Widget -->
<!-- 1. Include the widget script (already in js/ folder) -->
<script src="/js/teambuilder-widget.js"><\/script>

<!-- 2. Paste this div where you want the widget to appear -->
<div id="cs-team-builder-widget"></div>

<!-- 3. Initialise after DOM ready -->
<script>
document.addEventListener('DOMContentLoaded', function() {
  tbMountWidget('cs-team-builder-widget');
});
<\/script>

<!-- Note: The Supabase client must be loaded before teambuilder-widget.js -->
<!-- Add to page <head>: -->
<!-- <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"><\/script> -->`;
    }
  }
}

// Copy embed code to clipboard
function tbCopyEmbed() {
  const codeEl = document.getElementById('tb-embed-code');
  if (!codeEl) return;
  navigator.clipboard.writeText(codeEl.textContent).then(() => {
    const fb = document.getElementById('tb-copy-feedback');
    if (fb) { fb.style.display = 'block'; setTimeout(() => fb.style.display = 'none', 2500); }
  });
}

// Save onshore stub values from Settings tab
function tbSaveStubs() {
  const j = parseFloat(document.getElementById('tb-stub-junior')?.value) || 5800;
  const m = parseFloat(document.getElementById('tb-stub-mid')?.value)    || 7500;
  const s = parseFloat(document.getElementById('tb-stub-senior')?.value) || 9800;
  TB_ONSHORE_AUD.DEFAULT = { Junior: j, Mid: m, Senior: s };
  // Recalculate any existing team items
  tbTeam = tbTeam.map(t => {
    const c = tbComputeCost(t.roleName, t.exp, t.hw, t.qty);
    return c ? {...t, costs:c} : t;
  });
  if (tbWidgetMounted) { tbRenderTeam(); tbRenderSummary(); }
  const saved = document.getElementById('tb-stubs-saved');
  if (saved) { saved.style.display = 'inline'; setTimeout(() => saved.style.display = 'none', 2500); }
}

// ================================================================
// AUTO-INIT: if page-team-builder is the active page on nav, mount
// Called by app.js navigation handler after page switch
// ================================================================
function tbOnPageActivated() {
  // Activate preview tab by default
  tbSwitchTab('preview');
}

// ================================================================
// SELF-INIT via IntersectionObserver — same pattern as salary-research.js
// Fires automatically when page-team-builder becomes visible.
// app.js does NOT need modification.
// ================================================================
(function() {
  function tbTryInit() {
    const page = document.getElementById('page-team-builder');
    if (!page) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          obs.disconnect();
          tbOnPageActivated();
        }
      });
    }, { threshold: 0.01 });
    obs.observe(page);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tbTryInit);
  } else {
    tbTryInit();
  }
})();
