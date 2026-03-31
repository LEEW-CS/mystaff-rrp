// =====================================================
// INDIA CALCULATOR — calculator-in.js
// Depends on: config.js, calculator-ph.js (shared caches),
//             admin-fx.js, admin-pricebooks.js
// =====================================================
// EDC formula source: 2022_RRP_Calc_-_ALL_LOCATIONS India Calc New EDC worksheet
// Key cells: F246 (monthlyBase), F247 (nightDiff), F299 (benefits), F249 (EDC)

// ── State ─────────────────────────────────────────
let inFXData          = [];   // fx_monthly_rates WHERE market='IN'
let inSalaryRolesData = [];   // salary_ranges WHERE market='IN'
let inHMORate         = 0;    // HMO base annual premium per life (INR)
let currentEditingQuoteIdIN = null;

// India-specific price books — subset from price_books table
// Names match the DB exactly. Populated dynamically from pbCache.
const IN_PRICE_BOOK_FILTER = [
    'India WFO 1-4 Seats (30 days termation)',
    'India WFO 5-8 Seats (30 days termation)',
    'India WFO 9-16 Seats (30 days termation)',
    'India WFO 17-24 Seats (30 days termation)',
    'India WFO 25-32 Seats (30 days termation)',
    'India WFO 33-40 Seats (30 days termation)',
    'India WFO 41-48 Seats (30 days termation)',
    'India WFO 49-75 Seats (30 days termation)',
    'India WFO 76-100 Seats (30 days termation)',
    'India WFO 101-150 Seats (30 days termation)',
    'India WFO STACK SHIFT',
    'India CS EVERYWHERE Monthly Commit',
    'India CS EVERYWHERE 1 Year Commit',
    'India CS EVERYWHERE 2 Year Commit',
    'India ELEVATE WFO',
    'India ELEVATE HYBRID',
    'India ELEVATE WFH',
];

// Benefit constants (INR/month) — sourced from spreadsheet
// These are fixed operational costs charged to the client's EDC
const IN_BENEFITS = {
    companyPharmacy:       260.94,   // F285
    uniformIds:            384.59,   // F287
    teamBuilding:         1077.20,   // F289 (annual/12)
    xmasParty:            1077.20,   // F290 (annual/12)
    socialClub:           2061.48,   // F291
    cibStaffcentral:       894.00,   // F294
    profIndemnity:         150.62,   // F295
    comprehensiveInsurance: 224.04,  // F296
    microsoftAUD:           12.68,   // F293 — converted to INR via FX at calc time
    hmoBaseAnnual:        55000,     // E284 — flat per-life annual premium (India: no dependent scaling)
    // hmoDepPerLife not used for India — HMO is flat rate per staff member
};

// ── Init ────────────────────────────────────────────
async function initCalculatorIN() {
    if (!calcFXData.length) await loadCalcFXRates();
    // Normalise India FX rows: DB stores inr_usd, inr_aud etc — map to plain usd, aud for inrToCurr()
    inFXData = calcFXData
        .filter(r => r.market === 'IN')
        .map(r => ({
            ...r,
            usd: r.inr_usd, aud: r.inr_aud, gbp: r.inr_gbp,
            eur: r.inr_eur, hkd: r.inr_hkd, sgd: r.inr_sgd,
            cad: r.inr_cad, nzd: r.inr_nzd, php: r.inr_php,
        }));
    populateINExchangeRateDropdown();
    if (!calcHardwareData.length) await loadCalcHardware();
    populateINHardwareDropdown();
    populateINPriceBookDropdown();
    await loadINSalaryRoles();
    populateINRoleBrowseCategories();
    calculateIN();
}

// ── FX ───────────────────────────────────────────────
function populateINExchangeRateDropdown() {
    const sel = document.getElementById('inExchangeRateDate');
    if (!sel) return;
    const isAdmin = currentUser && currentUser.role === 'Admin';
    let rows = inFXData;
    if (!rows.length) rows = calcFXData;
    if (!isAdmin) rows = rows.slice(0, 2);
    buildFXDropdown(sel, rows);
}

function getINSelectedFXRates() {
    const sel = document.getElementById('inExchangeRateDate');
    if (!sel || !sel.value) return null;
    const id = parseInt(sel.value);
    return inFXData.find(r => r.id === id) || inFXData[0] || null;
}

// ── Hardware ─────────────────────────────────────────
function populateINHardwareDropdown() {
    const sel = document.getElementById('inMpcHardware');
    if (!sel) return;
    sel.innerHTML = '<option value="">No Hardware / BYO PC</option>';
    const cats = {};
    calcHardwareData.forEach(p => {
        const c = p.category || 'Other';
        if (!cats[c]) cats[c] = [];
        cats[c].push(p);
    });
    Object.keys(cats).sort().forEach(c => {
        const og = document.createElement('optgroup');
        og.label = c;
        cats[c].forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            og.appendChild(opt);
        });
        sel.appendChild(og);
    });
    const office5 = calcHardwareData.find(p => p.name && p.name.includes('Office 5'));
    if (office5) sel.value = office5.id;
}

// ── Price Books ──────────────────────────────────────
function populateINPriceBookDropdown() {
    const sel = document.getElementById('inPriceBook');
    if (!sel) return;
    const keys = Object.keys(pbCache);
    if (!keys.length) { setTimeout(populateINPriceBookDropdown, 500); return; }

    sel.innerHTML = '';
    // Filter to India-relevant price books
    const inKeys = keys.filter(k => IN_PRICE_BOOK_FILTER.some(f => k.includes(f.split(' (')[0])));
    const allKeys = inKeys.length ? inKeys : keys; // fallback to all if filter yields nothing

    // Group by product line
    const groups = {};
    allKeys.forEach(k => {
        const pb = pbCache[k];
        const g = pb.group_name || inferINGroup(k);
        if (!groups[g]) groups[g] = [];
        groups[g].push(k);
    });
    Object.keys(groups).sort().forEach(g => {
        const og = document.createElement('optgroup');
        og.label = g;
        groups[g].forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            // Clean display name — remove "(Bangalore Only)" suffix
            opt.textContent = k.replace(/\s*\(Bangalore Only\)/gi, '').trim();
            og.appendChild(opt);
        });
        sel.appendChild(og);
    });
    // Default to ELEVATE WFH
    const defaults = ['India ELEVATE WFH', 'India CS EVERYWHERE Monthly Commit', allKeys[0]];
    for (const d of defaults) {
        if (pbCache[d]) { sel.value = d; break; }
    }
}

function inferINGroup(name) {
    if (/elevate/i.test(name))        return 'India ELEVATE';
    if (/everywhere/i.test(name))     return 'India CS Everywhere';
    if (/stack.?shift/i.test(name))   return 'India Stack Shift';
    if (/wfo/i.test(name))            return 'India WFO';
    return 'India';
}

// ── Salary Roles ─────────────────────────────────────
async function loadINSalaryRoles() {
    try {
        let all = [], from = 0;
        while (true) {
            const { data, error } = await supabaseClient
                .from('salary_ranges')
                .select('id,job_title,category,jpid_level,years_experience,low_salary,median_salary,high_salary,conf_low,conf_median,conf_high')
                .eq('market', 'IN')
                .order('category', { ascending: true })
                .order('job_title',  { ascending: true })
                .range(from, from + 999);
            if (error) throw error;
            if (!data || !data.length) break;
            all = all.concat(data);
            from += 1000;
            if (data.length < 1000) break;
        }
        inSalaryRolesData = all;
        populateINRoleBrowseCategories();
    } catch(e) {
        console.warn('Could not load India salary roles:', e.message);
    }
}

function populateINRoleBrowseCategories() {
    const sel = document.getElementById('inRoleBrowseCategory');
    if (!sel || !inSalaryRolesData.length) return;
    const cats = [...new Set(inSalaryRolesData.map(d => d.category).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">Browse by Category…</option>' +
        cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

function onINRoleCategoryChange() {
    const cat = document.getElementById('inRoleBrowseCategory').value;
    const roleSel = document.getElementById('inRoleBrowseRole');
    roleSel.innerHTML = '<option value="">Select role…</option>';
    if (!cat) { roleSel.classList.remove('visible'); return; }
    const roles = [...new Set(
        inSalaryRolesData.filter(d => d.category === cat).map(d => d.job_title)
    )].sort();
    roles.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r; opt.textContent = r;
        roleSel.appendChild(opt);
    });
    roleSel.classList.add('visible');
}

function onINRoleBrowseSelect() {
    const cat  = document.getElementById('inRoleBrowseCategory').value;
    const role = document.getElementById('inRoleBrowseRole').value;
    if (!role) return;
    const matches = inSalaryRolesData.filter(d => d.category === cat && d.job_title === role);
    if (!matches.length) return;
    const match = matches[0];
    document.getElementById('inRoleSearchInput').value = match.job_title;
    document.getElementById('inSelectedRoleId').value  = match.id;
    document.getElementById('inRoleName').value        = '';
    if (match.low_salary)    document.getElementById('inYearlyCTCFrom').value = match.low_salary;
    document.getElementById('inYearlyCTCTo').value   = match.low_salary;
    const hint = document.getElementById('inSalaryRangeHint');
    if (hint) { hint.innerHTML = buildSalaryHintIN(match); hint.style.display = 'block'; }
    updateINRolePill(match.job_title);
    calculateIN();
}

function onINRoleSearch() {
    const q  = document.getElementById('inRoleSearchInput').value.toLowerCase().trim();
    const dd = document.getElementById('inRoleDropdown');
    dd.innerHTML = '';
    if (!q || q.length < 2) { dd.classList.remove('open'); return; }
    const matches = inSalaryRolesData.filter(d => d.job_title && d.job_title.toLowerCase().includes(q)).slice(0, 12);
    if (!matches.length) { dd.classList.remove('open'); return; }
    matches.forEach(role => {
        const div = document.createElement('div');
        div.className = 'role-option';
        div.innerHTML = `<span>${role.job_title}</span><small>${role.category || ''}</small>`;
        div.addEventListener('click', () => selectINRole(role));
        dd.appendChild(div);
    });
    dd.classList.add('open');
}

function selectINRole(role) {
    document.getElementById('inRoleSearchInput').value = role.job_title;
    document.getElementById('inSelectedRoleId').value  = role.id;
    document.getElementById('inRoleName').value        = '';
    document.getElementById('inRoleDropdown').classList.remove('open');
    if (role.low_salary) document.getElementById('inYearlyCTCFrom').value = role.low_salary;
    document.getElementById('inYearlyCTCTo').value   = role.low_salary;
    const hint = document.getElementById('inSalaryRangeHint');
    if (hint) { hint.innerHTML = buildSalaryHintIN(role); hint.style.display = 'block'; }
    updateINRolePill(role.job_title);
    calculateIN();
}

function updateINRolePill(jobTitle) {
    const pill = document.getElementById('inSelectedRolePill');
    if (!pill) return;
    pill.textContent = jobTitle + ' ×';
    pill.classList.remove('hidden');
    pill.onclick = () => {
        document.getElementById('inRoleSearchInput').value = '';
        document.getElementById('inSelectedRoleId').value  = '';
        pill.classList.add('hidden');
        const hint = document.getElementById('inSalaryRangeHint');
        if (hint) hint.style.display = 'none';
        calculateIN();
    };
}

function buildSalaryHintIN(role) {
    const fmt = n => n != null ? '₹' + Number(n).toLocaleString('en-IN') : '—';
    const confBadge = (c, label) => {
        if (!c) return `<span style="color:var(--text-muted);font-size:0.72rem;">${label}: —</span>`;
        const col = c === 'High' ? '#22c55e' : c === 'Medium' ? '#f59e0b' : '#ef4444';
        return `<span style="font-size:0.72rem;">${label}: <strong style="color:${col};">${c}</strong></span>`;
    };
    return `
        <div style="font-size:0.78rem;font-weight:600;margin-bottom:0.35rem;color:var(--text-muted);">
            Yearly CTC from database (INR) — use as input above:
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.4rem;">
            <div style="background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:0.35rem 0.5rem;">
                <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:0.15rem;">25th pct (Low)</div>
                <div style="font-family:'Space Mono',monospace;font-weight:600;font-size:0.82rem;">${fmt(role.low_salary)}</div>
                <div style="margin-top:0.15rem;">${confBadge(role.conf_low,'Conf')}</div>
            </div>
            <div style="background:var(--bg);border:2px solid var(--accent);border-radius:5px;padding:0.35rem 0.5rem;">
                <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:0.15rem;">50th pct (Median)</div>
                <div style="font-family:'Space Mono',monospace;font-weight:600;font-size:0.82rem;">${fmt(role.median_salary)}</div>
                <div style="margin-top:0.15rem;">${confBadge(role.conf_median,'Conf')}</div>
            </div>
            <div style="background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:0.35rem 0.5rem;">
                <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:0.15rem;">75th pct (High)</div>
                <div style="font-family:'Space Mono',monospace;font-weight:600;font-size:0.82rem;">${fmt(role.high_salary)}</div>
                <div style="margin-top:0.15rem;">${confBadge(role.conf_high,'Conf')}</div>
            </div>
        </div>`;
}

document.addEventListener('click', (e) => {
    const dd = document.getElementById('inRoleDropdown');
    if (dd && !dd.contains(e.target) && e.target.id !== 'inRoleSearchInput') {
        dd.classList.remove('open');
    }
});

// ── INDIA MAIN CALCULATION ────────────────────────────
// Formula source: India Calc New EDC worksheet
// FX table: inr = INR per 1 foreign unit (e.g. row.usd = INR per 1 USD)
function calculateIN() {
    const fxRow = getINSelectedFXRates() || {
        // Fallback: March 2026 approximate rates (INR per 1 unit of foreign currency)
        usd: 86.5, aud: 64.80, gbp: 110.2, hkd: 11.1,
        sgd: 64.8, eur: 94.2, cad: 63.0, nzd: 52.3,
    };

    const currency       = document.getElementById('inCurrency').value;
    const priceBook      = document.getElementById('inPriceBook').value;
    const hardwareId     = document.getElementById('inMpcHardware').value;
    const yearlyCTCFrom  = parseFloat(document.getElementById('inYearlyCTCFrom').value) || 0;
    const yearlyCTCTo    = parseFloat(document.getElementById('inYearlyCTCTo').value)   || yearlyCTCFrom;
    const dependents     = parseInt(document.getElementById('inDependents').value)  || 3;
    const nightDiffHrs   = parseFloat(document.getElementById('inNightDiffHours').value) || 0;
    const isRange        = yearlyCTCFrom !== yearlyCTCTo;

    // ── FX conversion helper ─────────────────────────
    // FX table stores: INR per 1 foreign unit
    // So: INR → foreignCurrency = inrAmount / fxRow[currency.toLowerCase()]
    function inrToCurr(inrAmt) {
        if (!inrAmt) return 0;
        const key = currency.toLowerCase();
        const rate = parseFloat(fxRow[key]);
        return rate ? inrAmt / rate : 0;
    }

    // AUD rate needed for Microsoft cost conversion (INR per 1 AUD)
    const audRate = parseFloat(fxRow['aud']) || 64.80;

    // ── EDC formula for a given CTC ─────────────────
    function calcINForCTC(yearlyCTC) {
        // 1. BASE SALARY — F246: =ROUND(yearlyCtc / 12, 0)
        const monthlyBase = Math.round(yearlyCTC / 12);

        // 2. NIGHT DIFFERENTIAL — F247: unrounded
        // =(monthlyBase * 12 / 260 / 8) * 0.10 * (nightDiffHours * 22)
        const dayRateINR = monthlyBase * 12 / 260;
        const nightDiff  = nightDiffHrs > 0
            ? (dayRateINR / 8) * 0.10 * (nightDiffHrs * 22)
            : 0;

        // 3. PAY2 SALARY STRUCTURE (informational breakdown — all sum to CTC)
        const basicSalaryMonthly = yearlyCTC * 0.50 / 12;           // 50% of CTC / 12
        const hraMonthly         = basicSalaryMonthly * 0.40;        // 40% of basic
        const vehicleMonthly     = 21600 / 12;                       // Pay2 below 1600cc fixed
        const telephoneMonthly   = 12000 / 12;                       // Pay2 fixed
        const childrenEdMonthly  = 2400 / 12;                        // fixed
        const ltaMonthly         = basicSalaryMonthly / 12;          // 1 month basic / 12 months
        const sodexoMonthly      = 0;                                 // not modelled
        const booksMonthly       = 48000 / 12;                       // Pay2 fixed
        // Project Allowance = remainder after all named allowances + statutory
        const pfYearlyForPA      = yearlyCTC * 0.12;
        const esiYearlyForPA     = basicSalaryMonthly > 20000 ? 0 : yearlyCTC * 0.0325;
        const namedYearly        = (basicSalaryMonthly + hraMonthly + vehicleMonthly + telephoneMonthly
                                   + childrenEdMonthly + ltaMonthly + sodexoMonthly + booksMonthly) * 12;
        const projectMonthly     = (yearlyCTC - namedYearly - pfYearlyForPA - esiYearlyForPA) / 12;
        // Other allowances subtotal (excludes basic + HRA, matches spreadsheet "Employee is paid these" row)
        const otherAllowancesMonthly = vehicleMonthly + telephoneMonthly + childrenEdMonthly
                                     + ltaMonthly + sodexoMonthly + booksMonthly + projectMonthly;

        // Provident Fund — 12% of full CTC (employer contribution on monthly base)
        // E277: IF yearlyCtc <= 180000: min(yearlyCtc, 180000) * 12% ELSE yearlyCtc * 12%
        const pfYearly  = yearlyCTC <= 180000
            ? Math.min(yearlyCTC, 180000) * 0.12
            : yearlyCTC * 0.12;
        const pfMonthly = pfYearly / 12;

        // ESI — 3.25% of gross (only if monthly basic ≤ ₹21,000)
        // E278: IF monthlyBasic > 20000: 0 ELSE yearlyCtc * 3.25%
        const esiYearly  = basicSalaryMonthly > 20000 ? 0 : yearlyCTC * 0.0325;
        const esiMonthly = esiYearly / 12;

        // Gratuity — 4.165% of CTC (unrounded monthly)
        // E279: =(yearlyCtc / 100) * 4.165
        const gratuityMonthly = (yearlyCTC * 0.04165) / 12;

        // 4. REDUNDANCY INSURANCE — F283: monthlyBase * 8.5%
        const redundancyINR = monthlyBase * 0.085;

        // 5. HMO — F286: flat per-life annual premium (no dependent scaling for India)
        const hmoMonthly = IN_BENEFITS.hmoBaseAnnual / 12 + IN_BENEFITS.companyPharmacy;

        // 6. UNIFORM & IDs — F287
        const uniformINR = IN_BENEFITS.uniformIds;

        // 7. CS BENEFITS — F292
        const csBenefitsINR = IN_BENEFITS.teamBuilding
                            + IN_BENEFITS.xmasParty
                            + IN_BENEFITS.socialClub;

        // 8. CS COSTS / TECH — F297
        const microsoftINR = IN_BENEFITS.microsoftAUD * audRate;
        const csCostsINR   = microsoftINR
                           + IN_BENEFITS.cibStaffcentral
                           + IN_BENEFITS.profIndemnity
                           + IN_BENEFITS.comprehensiveInsurance;

        // 9. TOTAL BENEFITS — F299
        const totalBenefitsINR = redundancyINR + hmoMonthly + uniformINR + csBenefitsINR + csCostsINR;

        // 10. EDC — Base + Night Diff + Benefits only
        // Statutory (PF, ESI, Gratuity) sits OUTSIDE EDC — shown separately as employer contributions
        const edcINR  = monthlyBase + nightDiff + totalBenefitsINR;
        const edcCurr = inrToCurr(edcINR);

        const dayRateCurr    = inrToCurr(dayRateINR);
        const hourlyRateCurr = dayRateCurr / 8;
        const easyLeaveCurr  = dayRateCurr * 0.958;
        const statutoryINR   = pfMonthly + esiMonthly + gratuityMonthly;

        return {
            yearlyCTC, monthlyBase, nightDiff, dayRateINR,
            // Pay2 salary structure
            basicSalaryMonthly, hraMonthly, vehicleMonthly, telephoneMonthly,
            childrenEdMonthly, ltaMonthly, sodexoMonthly, booksMonthly,
            projectMonthly, otherAllowancesMonthly,
            // Statutory (employer contribution — outside EDC)
            pfMonthly, esiMonthly, gratuityMonthly, statutoryINR,
            // CS operational costs
            redundancyINR, hmoMonthly, uniformINR, csBenefitsINR, csCostsINR, microsoftINR,
            totalBenefitsINR, edcINR, edcCurr,
            dayRateCurr, hourlyRateCurr, easyLeaveCurr,
        };
    }

    // ── Run From / To ────────────────────────────────
    const cFrom = calcINForCTC(yearlyCTCFrom);
    const cTo   = calcINForCTC(yearlyCTCTo);

    // ── CS FEE & HARDWARE (shared) ───────────────────
    const pb      = pbCache[priceBook] || PRICE_BOOKS[priceBook];
    const csFee   = pb ? (pb[currency] || 0) : 0;
    const isElev  = pb ? (pb.is_elevate || pb.isElevate || false) : false;
    const mpcFee  = getHardwarePrice(hardwareId, currency, isElev);
    const hwRow   = calcHardwareData.find(p => p.id === parseInt(hardwareId));
    const mpcName = hwRow ? hwRow.name : 'No Hardware';

    // ── SETUP FEES ───────────────────────────────────
    const setupFee = SETUP_FEES[currency] || 399;

    // ── TOTALS ───────────────────────────────────────
    const totalMonthlyFrom = cFrom.edcCurr + csFee + mpcFee;
    const totalMonthlyTo   = cTo.edcCurr   + csFee + mpcFee;
    const depositFrom      = totalMonthlyFrom * 1.5;
    const depositTo        = totalMonthlyTo   * 1.5;

    // Quote validity (30 days)
    const validDate = new Date();
    validDate.setDate(validDate.getDate() + 30);

    // ── DOM helpers ───────────────────────────────────
    const sel   = id => document.getElementById(id);
    const fmt   = (n, curr) => fmtCurr(n, curr || currency);
    // INR display: unrounded (let fmtIN show decimals for accuracy)
    const fmtIN = n => n != null ? '₹' + Number(n.toFixed(2)).toLocaleString('en-IN') : '—';
    const t     = (id, v) => { const el = sel(id); if (el) el.textContent = v; };

    // ── RESULTS CARD ─────────────────────────────────
    // Base salary shown as From (monthly INR) to To range
    sel('inResultBaseSalary').textContent = isRange
        ? fmtIN(cFrom.monthlyBase) + ' to ' + fmtIN(cTo.monthlyBase)
        : fmtIN(cFrom.monthlyBase);
    sel('inResultEDC').textContent          = fmtRange(cFrom.edcCurr,          cTo.edcCurr,          currency);
    sel('inResultCSFee').textContent        = fmt(csFee);
    sel('inResultMPC').textContent          = fmt(mpcFee);
    sel('inResultMPCProduct').textContent   = mpcName;
    sel('inResultTotalMonthly').textContent = fmtRange(totalMonthlyFrom, totalMonthlyTo, currency);
    sel('inResultSetup').textContent        = fmt(setupFee);
    sel('inResultDeposit').textContent      = fmtRange(depositFrom,      depositTo,      currency);
    sel('inResultDayRate').textContent      = fmtRange(cFrom.dayRateCurr, cTo.dayRateCurr, currency);
    sel('inResultHourlyRate').textContent   = fmtRange(cFrom.hourlyRateCurr, cTo.hourlyRateCurr, currency);
    sel('inResultEasyLeave').textContent    = fmtRange(cFrom.easyLeaveCurr,   cTo.easyLeaveCurr,   currency);
    sel('inQuoteValidity').textContent      = validDate.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

    // FX display — show selected currency rate (INR per 1 unit of foreign currency)
    const fxVal = parseFloat(fxRow[currency.toLowerCase()]) || 1;
    sel('inResultFXRate').textContent = `1 ${currency} = ${fxVal.toFixed(4)} INR`;
    sel('inResultFXDesc').textContent = fxRow.month_name || '';
    sel('inResultFXDate').textContent = '';

    // ── EDC BREAKDOWN TILES & DETAILED BREAKDOWN ─────────────────────────
    const fmtRangeIN = (a, b) => isRange ? fmtIN(a) + ' – ' + fmtIN(b) : fmtIN(a);
    const c = cFrom; // line items use From value; subtotals/totals show range

    // ── TILES: 3 groups + total ──────────────────────────────────────────
    // Tile 1: Gross Salary = monthlyBase + nightDiff
    const grossFrom = cFrom.monthlyBase + cFrom.nightDiff;
    const grossTo   = cTo.monthlyBase   + cTo.nightDiff;
    t('inEdcBasicSalary',    fmtRange(inrToCurr(grossFrom), inrToCurr(grossTo), currency));
    t('inEdcBasicSalaryINR', fmtRangeIN(grossFrom, grossTo));

    // Tile 2: Employer Contribution = PF + ESI + Gratuity
    t('inEdcStatutory',    fmtRange(inrToCurr(cFrom.statutoryINR), inrToCurr(cTo.statutoryINR), currency));
    t('inEdcStatutoryINR', fmtRangeIN(cFrom.statutoryINR, cTo.statutoryINR));

    // Tile 3: CS Operational Cost = totalBenefitsINR
    t('inEdcCSBenefits',    fmtRange(inrToCurr(cFrom.totalBenefitsINR), inrToCurr(cTo.totalBenefitsINR), currency));
    t('inEdcCSBenefitsINR', fmtRangeIN(cFrom.totalBenefitsINR, cTo.totalBenefitsINR));

    // Tile 4: Total EDC
    t('inEdcTotal',    fmtRange(cFrom.edcCurr, cTo.edcCurr, currency));
    t('inEdcTotalINR', fmtRangeIN(cFrom.edcINR, cTo.edcINR));

    // ── DETAILED BREAKDOWN ───────────────────────────────────────────────

    // GROUP 1: Gross Salary — Take-Home
    t('inEdcBasicPayINR',       fmtRangeIN(c.basicSalaryMonthly,    cTo.basicSalaryMonthly));
    t('inEdcBasicPay',          fmtRange(inrToCurr(c.basicSalaryMonthly), inrToCurr(cTo.basicSalaryMonthly), currency));
    t('inEdcHRAINR',            fmtIN(c.hraMonthly));
    t('inEdcHRA',               fmt(inrToCurr(c.hraMonthly)));
    t('inEdcVehicleINR',        fmtIN(c.vehicleMonthly));
    t('inEdcVehicle',           fmt(inrToCurr(c.vehicleMonthly)));
    t('inEdcTelephoneINR',      fmtIN(c.telephoneMonthly));
    t('inEdcTelephone',         fmt(inrToCurr(c.telephoneMonthly)));
    t('inEdcChildrenEdINR',     fmtIN(c.childrenEdMonthly));
    t('inEdcChildrenEd',        fmt(inrToCurr(c.childrenEdMonthly)));
    t('inEdcLTAINR',            fmtIN(c.ltaMonthly));
    t('inEdcLTA',               fmt(inrToCurr(c.ltaMonthly)));
    t('inEdcSodexoINR',         fmtIN(c.sodexoMonthly));
    t('inEdcSodexo',            fmt(inrToCurr(c.sodexoMonthly)));
    t('inEdcBooksINR',          fmtIN(c.booksMonthly));
    t('inEdcBooks',             fmt(inrToCurr(c.booksMonthly)));
    t('inEdcProjectINR',        fmtRangeIN(c.projectMonthly, cTo.projectMonthly));
    t('inEdcProject',           fmtRange(inrToCurr(c.projectMonthly), inrToCurr(cTo.projectMonthly), currency));
    // "Other allowances" subtotal (vehicle → project, excludes basic + HRA)
    t('inBfOtherAllowSubINR',   fmtRangeIN(c.otherAllowancesMonthly, cTo.otherAllowancesMonthly));
    t('inBfOtherAllowSub',      fmtRange(inrToCurr(c.otherAllowancesMonthly), inrToCurr(cTo.otherAllowancesMonthly), currency));
    // Night diff + gross salary subtotal (re-uses monthlyBase which is CTC/12)
    t('inEdcNightDiffINR',      fmtRangeIN(c.nightDiff, cTo.nightDiff));
    t('inEdcNightDiff',         fmtRange(inrToCurr(c.nightDiff), inrToCurr(cTo.nightDiff), currency));
    t('inBfBasicSubINR',        fmtRangeIN(grossFrom, grossTo));
    t('inBfBasicSub',           fmtRange(inrToCurr(grossFrom), inrToCurr(grossTo), currency));

    // GROUP 2: Employer Contribution — Employer Pays
    t('inEdcPFINR',             fmtRangeIN(c.pfMonthly, cTo.pfMonthly));
    t('inEdcPF',                fmtRange(inrToCurr(c.pfMonthly), inrToCurr(cTo.pfMonthly), currency));
    t('inEdcESIINR',            fmtRangeIN(c.esiMonthly, cTo.esiMonthly));
    t('inEdcESI',               fmtRange(inrToCurr(c.esiMonthly), inrToCurr(cTo.esiMonthly), currency));
    t('inEdcGratuityINR',       fmtRangeIN(c.gratuityMonthly, cTo.gratuityMonthly));
    t('inEdcGratuity',          fmtRange(inrToCurr(c.gratuityMonthly), inrToCurr(cTo.gratuityMonthly), currency));
    t('inBfStatutorySubINR',    fmtRangeIN(c.statutoryINR, cTo.statutoryINR));
    t('inBfStatutorySub',       fmtRange(inrToCurr(c.statutoryINR), inrToCurr(cTo.statutoryINR), currency));

    // GROUP 3: CS Operational Cost — Cloudstaff Pays
    // Govt mandated subtotal = redundancy only
    t('inEdcRedundancyINR',        fmtRangeIN(c.redundancyINR, cTo.redundancyINR));
    t('inEdcRedundancy',           fmtRange(inrToCurr(c.redundancyINR), inrToCurr(cTo.redundancyINR), currency));
    t('inBfGovtMandatedSubINR',    fmtRangeIN(c.redundancyINR, cTo.redundancyINR));
    t('inBfGovtMandatedSub',       fmtRange(inrToCurr(c.redundancyINR), inrToCurr(cTo.redundancyINR), currency));
    // Medical subtotal = HMO + pharmacy (already combined in hmoMonthly)
    t('inEdcHMOINR',            fmtIN(c.hmoMonthly - IN_BENEFITS.companyPharmacy));
    t('inEdcHMO',               fmt(inrToCurr(c.hmoMonthly - IN_BENEFITS.companyPharmacy)));
    t('inEdcPharmacyINR',       fmtIN(IN_BENEFITS.companyPharmacy));
    t('inEdcPharmacy',          fmt(inrToCurr(IN_BENEFITS.companyPharmacy)));
    t('inBfMedicalSubINR',      fmtIN(c.hmoMonthly));
    t('inBfMedicalSub',         fmt(inrToCurr(c.hmoMonthly)));
    // Uniform
    t('inEdcUniformINR',        fmtIN(c.uniformINR));
    t('inEdcUniform',           fmt(inrToCurr(c.uniformINR)));
    // CPD Training Levy = 0
    t('inEdcCPDINR',            fmtIN(0));
    t('inEdcCPD',               fmt(0));
    // Employee Retention Program subtotal = team building + xmas + social
    t('inEdcTeamBuildingINR',   fmtIN(IN_BENEFITS.teamBuilding));
    t('inEdcTeamBuilding',      fmt(inrToCurr(IN_BENEFITS.teamBuilding)));
    t('inEdcXmasINR',           fmtIN(IN_BENEFITS.xmasParty));
    t('inEdcXmas',              fmt(inrToCurr(IN_BENEFITS.xmasParty)));
    t('inEdcSocialClubINR',     fmtIN(IN_BENEFITS.socialClub));
    t('inEdcSocialClub',        fmt(inrToCurr(IN_BENEFITS.socialClub)));
    t('inBfERPSubINR',          fmtIN(c.csBenefitsINR));
    t('inBfERPSub',             fmt(inrToCurr(c.csBenefitsINR)));
    // Flight Deck and SaaS subtotal = csCostsINR
    t('inEdcMicrosoftINR',      fmtIN(c.microsoftINR));
    t('inEdcMicrosoft',         fmt(inrToCurr(c.microsoftINR)));
    t('inEdcCIBINR',            fmtIN(IN_BENEFITS.cibStaffcentral));
    t('inEdcCIB',               fmt(inrToCurr(IN_BENEFITS.cibStaffcentral)));
    t('inEdcIndemnityINR',      fmtIN(IN_BENEFITS.profIndemnity));
    t('inEdcIndemnity',         fmt(inrToCurr(IN_BENEFITS.profIndemnity)));
    t('inEdcComprehensiveINR',  fmtIN(IN_BENEFITS.comprehensiveInsurance));
    t('inEdcComprehensive',     fmt(inrToCurr(IN_BENEFITS.comprehensiveInsurance)));
    t('inBfFlightDeckSubINR',   fmtIN(c.csCostsINR));
    t('inBfFlightDeckSub',      fmt(inrToCurr(c.csCostsINR)));
    // CS Operational Total
    t('inBfCSOpTotalINR',       fmtRangeIN(c.totalBenefitsINR, cTo.totalBenefitsINR));
    t('inBfCSOpTotal',          fmtRange(inrToCurr(c.totalBenefitsINR), inrToCurr(cTo.totalBenefitsINR), currency));

    // GRAND TOTAL
    t('inBfTotalINR', fmtRangeIN(c.edcINR, cTo.edcINR));
    t('inBfTotal',    fmtRange(c.edcCurr, cTo.edcCurr, currency));

    // Candidate/role summary
    t('inResultCandidateName', document.getElementById('inCandidateName')?.value || 'To Be Advised');
    t('inResultRoleName',      document.getElementById('inRoleSearchInput')?.value
                              || document.getElementById('inRoleName')?.value || 'To Be Advised');

    // Summary bar currency label
    const currLabel = sel('inBenefitsCurrencyHeader');
    if (currLabel) currLabel.textContent = currency;
}

// ── SAVE / LOAD QUOTE ────────────────────────────────
function showINSaveQuoteModal() {
    if (!currentUser) { alert('Please sign in to save quotes.'); return; }
    // Tag the modal so saveQuoteRouter knows to call saveQuoteIN()
    const modal = document.getElementById('saveQuoteModal');
    if (modal) modal.setAttribute('data-market', 'IN');
    const userName  = currentUser ? (currentUser.name || currentUser.email || 'Unknown') : 'Unknown';
    const roleDisplay = document.getElementById('inRoleSearchInput')?.value?.trim()
                      || document.getElementById('inRoleName')?.value?.trim()
                      || 'To Be Advised';
    const autoName = `${userName} — ${roleDisplay}`;
    document.getElementById('quoteNamePreview').textContent = autoName;
    if (currentEditingQuoteIdIN) {
        const existing = allQuotesData.find(q => q.id === currentEditingQuoteIdIN);
        document.getElementById('quoteDescription').value = existing ? (existing.description || '') : '';
    } else {
        document.getElementById('quoteDescription').value = '';
    }
    setTimeout(() => document.getElementById('quoteDescription').focus(), 100);
}

async function saveQuoteIN() {
    const quoteName   = document.getElementById('quoteNamePreview').textContent.trim()
                     || (currentUser ? (currentUser.name || currentUser.email) : 'Unknown') + ' — To Be Advised';
    const description = document.getElementById('quoteDescription').value.trim();
    const currency    = document.getElementById('inCurrency').value;
    const priceBook   = document.getElementById('inPriceBook').value;
    const hardwareId  = document.getElementById('inMpcHardware').value;
    const yearlyCTC      = parseFloat(document.getElementById('inYearlyCTCFrom').value) || 0;
    const yearlyCTCTo    = parseFloat(document.getElementById('inYearlyCTCTo').value)   || yearlyCTC;
    const dependents  = parseInt(document.getElementById('inDependents').value)  || 3;
    const nightDiffHours = parseFloat(document.getElementById('inNightDiffHours').value) || 0;

    const fxRow   = getINSelectedFXRates();
    const pb      = pbCache[priceBook] || PRICE_BOOKS[priceBook];
    const csFee   = pb ? (pb[currency] || 0) : 0;
    const isElev  = pb ? (pb.is_elevate || pb.isElevate || false) : false;
    const mpcFee  = getHardwarePrice(hardwareId, currency, isElev);
    const setupFee = SETUP_FEES[currency] || 399;
    const hwRow   = calcHardwareData.find(p => p.id === parseInt(hardwareId));
    const mpcName = hwRow ? hwRow.name : 'No Hardware';

    const parseResultNum = (id) => {
        const text = (document.getElementById(id)?.textContent || '').replace(/,/g, '').replace(/[^0-9.]/g, ' ').trim();
        const nums = text.split(/\s+/).filter(Boolean).map(Number).filter(n => !isNaN(n) && n > 0);
        return nums[0] || null;
    };

    const quoteData = {
        market:          'IN',
        quote_name:      quoteName,
        description:     description || null,
        candidate_name:  document.getElementById('inCandidateName').value || 'To Be Advised',
        role_name:       document.getElementById('inRoleSearchInput')?.value?.trim()
                      || document.getElementById('inRoleName')?.value?.trim()
                      || 'To Be Advised',
        custom_role_name: document.getElementById('inRoleName')?.value?.trim() || null,
        base_salary_from: yearlyCTC,
        base_salary_to:   yearlyCTCTo,
        currency,
        price_book:      priceBook,
        night_diff_hours: nightDiffHours,
        night_diff_rate:  0.10,
        separation_override: 'include',
        fx_month_id:     fxRow ? fxRow.id : null,
        hardware_id:     hardwareId ? parseInt(hardwareId) : null,
        edc_amount:      parseResultNum('inResultEDC'),
        mpc_amount:      parseResultNum('inResultMPC'),
        mpc_name:        mpcName,
        mgmt_fee_amount: csFee || null,
        setup_fee_amount: setupFee || null,
        total_monthly:   document.getElementById('inResultTotalMonthly')?.textContent || null,
        years_experience: document.getElementById('inSelectedRoleId')?.value ? null : null,
        created_by:      currentUser ? (currentUser.name || currentUser.email) : 'Unknown',
    };

    try {
        if (currentEditingQuoteIdIN) {
            const { error } = await supabaseClient
                .from('quotes')
                .update({ ...quoteData, updated_at: new Date().toISOString() })
                .eq('id', currentEditingQuoteIdIN);
            if (error) throw error;
            hideSaveQuoteModal();
            await loadQuotes();
            alert(`Quote updated: ${quoteName}`);
        } else {
            const nextNum = await getNextQuoteNumber();
            quoteData.quote_number = nextNum;
            const { error } = await supabaseClient.from('quotes').insert([quoteData]);
            if (error) throw error;
            hideSaveQuoteModal();
            await loadQuotes();
            alert(`Quote saved: ${nextNum} — ${quoteName}`);
        }
    } catch(e) {
        console.error('Save IN quote error:', e);
        alert('Error saving quote: ' + e.message);
    }
}

function loadQuoteIntoCalcIN(quote) {
    currentEditingQuoteIdIN = quote.id;
    document.getElementById('inCandidateName').value    = quote.candidate_name || '';
    document.getElementById('inRoleSearchInput').value  = quote.role_name || '';
    document.getElementById('inRoleName').value         = quote.custom_role_name || '';
    document.getElementById('inYearlyCTCFrom').value = quote.base_salary_from || 0;
    document.getElementById('inYearlyCTCTo').value   = quote.base_salary_to   || quote.base_salary_from || 0;
    document.getElementById('inCurrency').value         = quote.currency || 'AUD';
    document.getElementById('inPriceBook').value        = quote.price_book || '';
    document.getElementById('inNightDiffHours').value   = quote.night_diff_hours || 0;
    if (quote.fx_month_id) {
        const sel = document.getElementById('inExchangeRateDate');
        const opt = Array.from(sel.options).find(o => o.value == quote.fx_month_id);
        if (opt) sel.value = quote.fx_month_id;
    }
    if (quote.hardware_id) {
        const sel = document.getElementById('inMpcHardware');
        const opt = Array.from(sel.options).find(o => o.value == quote.hardware_id);
        if (opt) sel.value = quote.hardware_id;
    }
    const isOwner = currentUser && (currentUser.name === quote.created_by || currentUser.email === quote.created_by);
    const isAdmin = currentUser && currentUser.role === 'Admin';
    const canSave = isAdmin || isOwner;
    const saveBtn = document.getElementById('inSaveQuoteBtn');
    if (saveBtn) {
        saveBtn.disabled = !canSave;
        saveBtn.style.opacity = canSave ? '1' : '0.5';
        saveBtn.style.cursor  = canSave ? 'pointer' : 'not-allowed';
        saveBtn.title = canSave ? '' : 'You can only save quotes you created';
    }
    showEditingBannerIN(quote.quote_name, quote.quote_number);
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('[data-page="calculator-in"]').classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-calculator-in').classList.add('active');
    calculateIN();
}

function showEditingBannerIN(name, number) {
    const banner = document.getElementById('editingBannerIN');
    if (banner) {
        banner.classList.remove('hidden');
        const nameEl = document.getElementById('editingQuoteNameIN');
        const numEl  = document.getElementById('editingQuoteNumberIN');
        if (nameEl) nameEl.textContent = name;
        if (numEl)  numEl.textContent  = number;
    }
}

function clearEditingBannerIN() {
    currentEditingQuoteIdIN = null;
    const banner = document.getElementById('editingBannerIN');
    if (banner) banner.classList.add('hidden');
}

// ── PDF ───────────────────────────────────────────────
function generatePDFIN() {
    const currency      = document.getElementById('inCurrency').value;
    const candidateName = document.getElementById('inCandidateName').value || 'To Be Advised';
    const roleName      = document.getElementById('inRoleSearchInput').value
                       || document.getElementById('inRoleName').value || 'To Be Advised';
    const fxDate        = document.getElementById('inResultFXDate').textContent;
    const fxRate        = document.getElementById('inResultFXRate').textContent;
    const baseSalary    = document.getElementById('inResultBaseSalary').textContent;
    const edc           = document.getElementById('inResultEDC').textContent;
    const csFee         = document.getElementById('inResultCSFee').textContent;
    const mpcFee        = document.getElementById('inResultMPC').textContent;
    const mpcProduct    = document.getElementById('inResultMPCProduct').textContent;
    const totalMonthly  = document.getElementById('inResultTotalMonthly').textContent;
    const setupFee      = document.getElementById('inResultSetup').textContent;
    const deposit       = document.getElementById('inResultDeposit').textContent;
    const dayRate       = document.getElementById('inResultDayRate').textContent;
    const hourlyRate    = document.getElementById('inResultHourlyRate').textContent;
    const validity      = document.getElementById('inQuoteValidity').textContent;
    const userName      = currentUser ? (currentUser.name || currentUser.email || 'Cloudstaff') : 'Cloudstaff';
    const priceBook     = document.getElementById('inPriceBook').value;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>India RRP Quote</title>
<style>
  body{font-family:'DM Sans','Segoe UI',sans-serif;font-size:11pt;color:#1a1a2e;margin:0;padding:2cm;}
  h1{font-size:18pt;color:#0f3460;margin-bottom:4px;}
  h2{font-size:12pt;color:#0f3460;margin:16px 0 6px;}
  .meta{font-size:9pt;color:#64748b;margin-bottom:18px;}
  table{width:100%;border-collapse:collapse;margin-bottom:14px;}
  td,th{padding:6px 10px;font-size:10pt;}
  th{background:#0f3460;color:#fff;text-align:left;}
  tr:nth-child(even) td{background:#f0f7ff;}
  .total-row td{font-weight:700;background:#0099ff!important;color:#fff;}
  .section{background:#f8fafd;border-left:4px solid #0099ff;padding:8px 12px;margin-bottom:10px;}
  .flag{font-size:14pt;margin-right:6px;}
  @media print{body{padding:1cm;}}
</style></head><body>
<h1><span class="flag">🇮🇳</span> Cloudstaff India RRP Quote</h1>
<div class="meta">
  Candidate: <strong>${candidateName}</strong> &nbsp;|&nbsp;
  Role: <strong>${roleName}</strong> &nbsp;|&nbsp;
  Price Book: <strong>${priceBook}</strong><br>
  FX Rate: ${fxRate} (${fxDate}) &nbsp;|&nbsp; Valid until: ${validity}
</div>
<h2>Monthly Recurring Costs</h2>
<table>
  <tr><th>Component</th><th>Amount (${currency})</th></tr>
  <tr><td>Monthly Base Salary</td><td>${baseSalary} INR</td></tr>
  <tr><td>Employee Direct Cost (EDC)</td><td>${edc}</td></tr>
  <tr><td>Cloudstaff Fee (${priceBook})</td><td>${csFee}</td></tr>
  <tr><td>${mpcProduct}</td><td>${mpcFee}</td></tr>
  <tr class="total-row"><td>Total Monthly</td><td>${totalMonthly}</td></tr>
</table>
<h2>Rates &amp; Once-Off Costs</h2>
<table>
  <tr><th>Item</th><th>Amount (${currency})</th></tr>
  <tr><td>Day Rate</td><td>${dayRate}</td></tr>
  <tr><td>Hourly Rate</td><td>${hourlyRate}</td></tr>
  <tr><td>Establishment Fee</td><td>${setupFee}</td></tr>
  <tr><td>Deposit (1.5 months)</td><td>${deposit}</td></tr>
</table>
<div class="section">
  <strong>Prepared by:</strong> ${userName} &nbsp;|&nbsp;
  <strong>Cloudstaff India</strong> — indicative quote, subject to final confirmation.
</div>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.print(); }
}
