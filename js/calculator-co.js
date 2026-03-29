async function loadCOBenefitsConfig() {
    try {
        const { data, error } = await supabaseClient
            .from('benefits_config')
            .select('*')
            .eq('market', 'CO')
            .order('sort_order');
        if (error) throw error;
        coBenefitsConfig = data || [];
    } catch(e) {
        console.warn('Could not load CO benefits config:', e.message);
        coBenefitsConfig = [];
    }
}

async function initCalculatorCO() {
    // Reuse calcFXData (already loaded by main initCalculator or load now)
    if (!calcFXData.length) await loadCalcFXRates();
    coFXData = calcFXData; // alias
    populateCOExchangeRateDropdown();
    // Load hardware into CO dropdown (reuse calcHardwareData)
    if (!calcHardwareData.length) await loadCalcHardware();
    populateCOHardwareDropdown();
    // Load price books into CO dropdown (reuse pbCache)
    populateCOPriceBookDropdown();
    // Load CO salary roles
    await loadCOSalaryRoles();
    // Load CO HMO rate
    await loadCOHMO();
    // Night meals (reuse)
    if (!calcNightMealsData.length) await loadCalcNightMeals();
    populateCONightMealsDropdown();
    // Load CO benefits config for formula evaluation
    await loadCOBenefitsConfig();
    calculateCO();
}

function populateCOExchangeRateDropdown() {
    const sel = document.getElementById('coExchangeRateDate');
    if (!sel || !coFXData.length) return;
    const isAdmin = currentUser && currentUser.role === 'Admin';
    // CO calc: only CO rows (market='CO')
    let coRows = coFXData.filter(r => r.market === 'CO');
    if (!coRows.length) coRows = coFXData; // fallback: show all if no market column yet
    if (!isAdmin) coRows = coRows.slice(0, 2);
    buildFXDropdown(sel, coRows);
}

function populateCOHardwareDropdown() {
    const sel = document.getElementById('coMpcHardware');
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
    // Default to mPC Office 5 Laptop on every fresh load
    const office5 = calcHardwareData.find(p => p.name && p.name.includes('Office 5'));
    if (office5) sel.value = office5.id;
}

function populateCOPriceBookDropdown() {
    const sel = document.getElementById('coPriceBook');
    if (!sel) return;
    // Reuse pbCache (loaded with PH calculator)
    const keys = Object.keys(pbCache);
    if (!keys.length) {
        // If not loaded yet, try again shortly
        setTimeout(populateCOPriceBookDropdown, 500);
        return;
    }
    sel.innerHTML = '';
    const groups = {};
    keys.forEach(k => {
        const pb = pbCache[k];
        const g = pb.group_name || inferGroup(k);
        if (!groups[g]) groups[g] = [];
        groups[g].push(k);
    });
    Object.keys(groups).sort().forEach(g => {
        const og = document.createElement('optgroup');
        og.label = g;
        groups[g].forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = k;
            og.appendChild(opt);
        });
        sel.appendChild(og);
    });
    // Default to Current ELEVATE WFH if available
    if (pbCache['Current ELEVATE WFH']) sel.value = 'Current ELEVATE WFH';
}

function populateCONightMealsDropdown() {
    const sel = document.getElementById('coNightMealsProduct');
    if (!sel) return;
    sel.innerHTML = '';
    calcNightMealsData.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        sel.appendChild(opt);
    });
    // Default to "No Night Meals"
    const noMeals = calcNightMealsData.find(m => m.name && m.name.toLowerCase().includes('no night'));
    if (noMeals) sel.value = noMeals.id;
}


// =====================================================
// NIGHT MEALS / SEPARATION DEFAULTS (CO)
// Mirrors PH logic: onPriceBookChange / updateNightMealsDefault
// =====================================================
function onCOPriceBookChange() {
    updateCONightMealsDefault();
    calculateCO();
}

function updateCONightMealsDefault() {
    const priceBook  = document.getElementById('coPriceBook').value;
    const nightHours = parseInt(document.getElementById('coNightDiffHours').value) || 0;
    const isWFO      = priceBook.includes('WFO');
    const sel        = document.getElementById('coNightMealsProduct');
    if (!sel || !calcNightMealsData.length) return;
    if (isWFO && nightHours > 0) {
        // Auto-select Planet Yum Level A Standard Night Meal
        const levelA = calcNightMealsData.find(m => m.name && m.name.toLowerCase().includes('level a'));
        if (levelA) sel.value = levelA.id;
    } else {
        // Revert to No Night Meals
        const noMeals = calcNightMealsData.find(m => m.name && m.name.toLowerCase().includes('no night'));
        if (noMeals) sel.value = noMeals.id;
    }
}

async function loadCOSalaryRoles() {
    try {
        // Paginate — salary_ranges may have many CO rows after publish
        let all = [], offset = 0;
        while (true) {
            const { data, error } = await supabaseClient
                .from('salary_ranges')
                .select('id, jpid_level, job_title, category, years_experience, low_salary, median_salary, high_salary')
                .eq('market', 'CO')
                .order('category')
                .order('job_title')
                .range(offset, offset + 999);
            if (error) throw error;
            all = all.concat(data || []);
            if (!data || data.length < 1000) break;
            offset += 1000;
        }
        // Normalise field names to match what the role search functions expect
        coSalaryRolesData = all.map(r => ({
            ...r,
            salary_low:  r.low_salary,
            salary_high: r.high_salary,
            experience:  r.years_experience,
        }));
        populateCORoleBrowseCategories();
    } catch(e) {
        console.warn('CO salary roles not loaded:', e.message);
        coSalaryRolesData = [];
    }
}

async function loadCOHMO() {
    try {
        const { data, error } = await supabaseClient
            .from('hmo_rates')
            .select('*')
            .eq('is_active', true)
            .eq('market', 'CO')
            .limit(1);
        if (error) throw error;
        if (data && data.length > 0) {
            coHMORate = parseFloat(data[0].monthly_rate) || CO_DEFAULTS.hmo_cop;
            const badge = document.getElementById('coHmoInfoBadge');
            if (badge) badge.textContent = (data[0].provider || 'Keralty') + ' — ' + (data[0].plan_name || 'HMO') + ' Active';
        } else {
            coHMORate = CO_DEFAULTS.hmo_cop;
        }
    } catch(e) {
        coHMORate = CO_DEFAULTS.hmo_cop;
    }
}

function getCOSelectedFXRates() {
    const sel = document.getElementById('coExchangeRateDate');
    if (!sel || !sel.value) return null;
    const id = parseInt(sel.value);
    return coFXData.find(r => r.id === id) || coFXData[0] || null;
}

// =====================================================
// COLOMBIA ROLES SEARCH
// =====================================================
function populateCORoleBrowseCategories() {
    const sel = document.getElementById('coRoleBrowseCategory');
    if (!sel || !coSalaryRolesData.length) return;
    const cats = [...new Set(coSalaryRolesData.map(d => d.category).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">Browse by Category…</option>' +
        cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

function onCORoleCategoryChange() {
    const cat = document.getElementById('coRoleBrowseCategory').value;
    const roleSel = document.getElementById('coRoleBrowseRole');
    roleSel.innerHTML = '<option value="">Select role…</option>';
    if (!cat) { roleSel.classList.remove('visible'); return; }
    const roles = [...new Set(
        coSalaryRolesData.filter(d => d.category === cat).map(d => d.job_title)
    )].sort();
    roles.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r;
        roleSel.appendChild(opt);
    });
    roleSel.classList.add('visible');
}

function onCORoleBrowseSelect() {
    const cat = document.getElementById('coRoleBrowseCategory').value;
    const role = document.getElementById('coRoleBrowseRole').value;
    if (!role) return;
    const matches = coSalaryRolesData.filter(d => d.category === cat && d.job_title === role);
    if (matches.length === 0) return;
    // Use the first match; if multiple experience levels, pick the first
    const match = matches[0];
    document.getElementById('coRoleSearchInput').value = match.job_title;
    document.getElementById('coSelectedRoleId').value = match.id;
    document.getElementById('coRoleName').value = '';
    // Set salary range from low/high
    if (match.salary_low)  document.getElementById('coBaseSalaryFrom').value = match.salary_low;
    if (match.salary_high) document.getElementById('coBaseSalaryTo').value   = match.salary_high;
    // Show hint
    const hint = document.getElementById('coSalaryRangeHint');
    if (hint && matches.length > 0) {
        const expLabels = matches.map(m => m.experience || '').filter(Boolean);
        const medianStr = match.median_salary ? ' · Median: COP ' + parseInt(match.median_salary).toLocaleString() : '';
        hint.textContent = (expLabels.length ? `${match.category} · ${expLabels.join(' / ')}` : match.category) + medianStr;
        hint.style.display = 'block';
    }
    // Update pill
    const pill = document.getElementById('coSelectedRolePill');
    if (pill) {
        pill.textContent = match.job_title + ' ×';
        pill.classList.remove('hidden');
        pill.onclick = () => {
            document.getElementById('coRoleSearchInput').value = '';
            document.getElementById('coSelectedRoleId').value = '';
            pill.classList.add('hidden');
            if (hint) hint.style.display = 'none';
            calculateCO();
        };
    }
    calculateCO();
}

function onCORoleSearch() {
    const q = document.getElementById('coRoleSearchInput').value.toLowerCase().trim();
    const dd = document.getElementById('coRoleDropdown');
    dd.innerHTML = '';
    if (!q || q.length < 2) { dd.classList.remove('open'); return; }
    const matches = coSalaryRolesData.filter(d => d.job_title && d.job_title.toLowerCase().includes(q)).slice(0, 12);
    if (!matches.length) { dd.classList.remove('open'); return; }
    matches.forEach(role => {
        const div = document.createElement('div');
        div.className = 'role-option';
        div.innerHTML = `<span>${role.job_title}</span><small>${role.category || ''}</small>`;
        div.addEventListener('click', () => selectCORole(role));
        dd.appendChild(div);
    });
    dd.classList.add('open');
}

function selectCORole(role) {
    document.getElementById('coRoleSearchInput').value = role.job_title;
    document.getElementById('coSelectedRoleId').value = role.id;
    document.getElementById('coRoleName').value = '';
    document.getElementById('coRoleDropdown').classList.remove('open');
    if (role.salary_low)  document.getElementById('coBaseSalaryFrom').value = role.salary_low;
    if (role.salary_high) document.getElementById('coBaseSalaryTo').value   = role.salary_high;
    const hint = document.getElementById('coSalaryRangeHint');
    if (hint) {
        const medianStr = role.median_salary ? ' · Median: COP ' + parseInt(role.median_salary).toLocaleString() : '';
        hint.textContent = (role.category || '') + (role.experience ? ' · ' + role.experience : '') + medianStr;
        hint.style.display = 'block';
    }
    const pill = document.getElementById('coSelectedRolePill');
    if (pill) {
        pill.textContent = role.job_title + ' ×';
        pill.classList.remove('hidden');
        pill.onclick = () => {
            document.getElementById('coRoleSearchInput').value = '';
            document.getElementById('coSelectedRoleId').value = '';
            pill.classList.add('hidden');
            if (hint) hint.style.display = 'none';
            calculateCO();
        };
    }
    calculateCO();
}

document.addEventListener('click', (e) => {
    const dd = document.getElementById('coRoleDropdown');
    if (dd && !dd.contains(e.target) && e.target.id !== 'coRoleSearchInput') {
        dd.classList.remove('open');
    }
});

// =====================================================
// COLOMBIA MAIN CALCULATION
// =====================================================
function calculateCO() {
    // Use selected FX row, or fall back to Jan 2026 actuals so page always renders
    const fxRow = getCOSelectedFXRates() || {
        cop_aud: 2552.83,  // 1 AUD = 2,552.83 COP
        cop_usd: 3669.75,  // 1 USD = 3,669.75 COP
        cop_gbp: 5019.38,
        cop_hkd: 469.881,
        cop_sgd: 2887.33,
        cop_eur: 4345.43,
        cop_cad: 2692.2,
        cop_nzd: 2207.21,
        period_label: 'Jan 2026 (default)'
    };

    const currency = document.getElementById('coCurrency').value;
    const priceBook = document.getElementById('coPriceBook').value;
    const hardwareId = document.getElementById('coMpcHardware').value;
    const baseSalaryFrom = parseFloat(document.getElementById('coBaseSalaryFrom').value) || 4000000;
    const baseSalaryTo   = parseFloat(document.getElementById('coBaseSalaryTo').value)   || baseSalaryFrom;
    const nightDiffHours = parseFloat(document.getElementById('coNightDiffHours').value)  || 0;
    const nightDiffRate  = 0.35; // fixed for Colombia
    const mealId = document.getElementById('coNightMealsProduct').value;
    const separationOverride = document.getElementById('coSeparationOverride').value;
    const candidateName = document.getElementById('coCandidateName').value.trim();
    const roleDisplay = document.getElementById('coRoleName').value.trim() ||
                        document.getElementById('coRoleSearchInput').value.trim();

    // FX: cop_aud = COP per 1 AUD (e.g. 2552.83 means 1 AUD = 2,552.83 COP)
    const audToCOP = parseFloat(fxRow.cop_aud) || 2552.83;
    const copToAUD = 1 / audToCOP;

    function copToCurr(copAmt) {
        if (currency === 'AUD') return copAmt * copToAUD;
        // cop_usd, cop_gbp etc. store COP per 1 foreign unit
        const colName = 'cop_' + currency.toLowerCase();
        const fxVal = parseFloat(fxRow[colName]) || parseFloat(fxRow.cop_usd) || 3670;
        return copAmt / fxVal;
    }
    function audToCurr(audAmt) {
        if (currency === 'AUD') return audAmt;
        // AUD → COP → billing currency
        const colName = 'cop_' + currency.toLowerCase();
        const fxVal = parseFloat(fxRow[colName]) || parseFloat(fxRow.cop_usd) || 3670;
        return audAmt * audToCOP / fxVal;
    }

    // Night meals: from calcNightMealsData, stored per currency
    const nightMealsCurrencyVal = getNightMealPrice(mealId, currency);
    // Convert to COP for PHP totals
    const nightMealsCOP = currency === 'AUD'
        ? nightMealsCurrencyVal * audToCOP
        : nightMealsCurrencyVal * (parseFloat(fxRow[currency.toLowerCase()]) || 1);

    function calcCOForSalary(baseSalary) {
        // Build formula evaluation context
        const formulaVars = {
            baseSalary: baseSalary,
            nightDiffHours: nightDiffHours,
            nightDiffRate: nightDiffRate,
            minWage: CO_MIN_WAGE,
            _nightMealsCOP: nightMealsCOP,
            _hmoCOP: coHMORate > 0 ? coHMORate : CO_DEFAULTS.hmo_cop,
        };

        // If CO benefits loaded from table, evaluate dynamically; else use CO_DEFAULTS fallback
        const useDynamic = coBenefitsConfig.length > 0;

        function evalBenefit(name, fallback) {
            if (!useDynamic) return fallback;
            const row = coBenefitsConfig.find(b => b.name === name);
            if (!row) return fallback;
            if (row.formula_expression) {
                return evaluateBenefitFormula(row.formula_expression, formulaVars);
            }
            return row.value || fallback;
        }

        // Night differential
        const nightDiffCOP = evalBenefit('Night Differential',
            nightDiffHours > 0 ? (baseSalary * 12 / 260 / 8) * nightDiffRate * (nightDiffHours * 22) : 0);

        // Government Benefits
        const eps          = evalBenefit('State Health (EPS)', baseSalary >= 17509050 ? baseSalary * 0.085 : 0);
        const afp          = evalBenefit('Pension (AFP)', baseSalary * 0.12);
        const arl          = evalBenefit('Work Risk Insurance (ARL)', baseSalary * 0.00522);
        const sena         = evalBenefit('SENA', baseSalary >= 17509050 ? baseSalary * 0.02 : 0);
        const icbf         = evalBenefit('ICBF', baseSalary >= 14000000 ? baseSalary * 0.03 : 0);
        const caja         = evalBenefit('Family Compensation Fund (Caja)', baseSalary * 0.04);
        const cesantias    = evalBenefit('Cesantías (Severance Pay)', baseSalary * 0.0833);
        const separationBenefit = evalBenefit('Separation Benefit (Cloudstaff)', baseSalary * 0.0833);
        const liquidation  = evalBenefit('Liquidation', 0);
        const intereses    = evalBenefit('Intereses de Cesantías', baseSalary * 0.01);
        const prima        = evalBenefit('Prima (Legal Bonuses Jun & Dec)', baseSalary * 0.0833);
        const vacaciones   = evalBenefit('Vacaciones', baseSalary * 0.0417);
        const addlPension  = evalBenefit('Additional Pension Contribution', 0);

        const govBenefitsCOP = eps + afp + arl + sena + icbf + caja +
                               cesantias + liquidation + intereses + prima + vacaciones;

        // Tenure Costs (separate from gov benefits)
        const tenureCOP = separationBenefit;

        const excludeSeparation = separationOverride === 'exclude';
        const adjustedGovCOP = excludeSeparation
            ? govBenefitsCOP - cesantias - intereses
            : govBenefitsCOP;
        const adjustedTenureCOP = excludeSeparation ? 0 : tenureCOP;

        // CS Benefits
        const hmo         = evalBenefit('HMO Medical Insurance (Keralty)', coHMORate > 0 ? coHMORate : CO_DEFAULTS.hmo_cop);
        const pharmacy    = evalBenefit('Company Pharmacy', CO_DEFAULTS.pharmacy_cop);
        const lifeIns     = evalBenefit('Life Insurance', CO_DEFAULTS.life_ins_cop);
        const addlPensionCS = addlPension;
        const teamBuild   = evalBenefit('Annual Team Building', CO_DEFAULTS.team_build_cop);
        const xmas        = evalBenefit('Annual XMAS Party', CO_DEFAULTS.xmas_cop);
        const socialClub  = evalBenefit('Social Club', CO_DEFAULTS.social_club_cop);
        const csBenefitsCOP = hmo + pharmacy + lifeIns + addlPensionCS + teamBuild + xmas + socialClub;

        // Technology Costs
        const microsoftCOPLocal = evalBenefit('Technology Charge (Microsoft)', CO_DEFAULTS.microsoft_cop);
        const cib         = evalBenefit('CIB/Staffcentral/Timekeeping', CO_DEFAULTS.cib_cop);
        const payroll     = evalBenefit('Payroll', CO_DEFAULTS.payroll_cop);
        const internet    = evalBenefit('WFH Internet / Transport Allowance', baseSalary <= (1750905 * 2) ? 249095 : 67900);
        const techCOP     = microsoftCOPLocal + cib + payroll + internet;

        // Misc Costs
        const uniform     = evalBenefit('Uniforms', CO_DEFAULTS.uniform_cop);
        const workids     = evalBenefit('Work IDs', CO_DEFAULTS.workids_cop);
        const furniture   = evalBenefit('WFH Furniture Allowance', CO_DEFAULTS.furniture_cop);
        const profInd     = evalBenefit('Professional Indemnity Insurance', CO_DEFAULTS.prof_ind_cop);
        const pubLiab     = evalBenefit('Public Liability Insurance', CO_DEFAULTS.pub_liab_cop);
        const compIns     = evalBenefit('Comprehensive Insurance', CO_DEFAULTS.comp_ins_cop);
        const miscCOP     = uniform + workids + furniture + profInd + pubLiab + compIns;

        // Category totals
        const basicSalaryCOP = baseSalary + nightDiffCOP + nightMealsCOP;
        const edcCOP = basicSalaryCOP + adjustedGovCOP + adjustedTenureCOP + csBenefitsCOP + techCOP + miscCOP;

        // Convert to billing currency
        const basicSalaryCurr = copToCurr(baseSalary) + copToCurr(nightDiffCOP) + nightMealsCurrencyVal;
        const govCurr         = copToCurr(adjustedGovCOP);
        const tenureCurr      = copToCurr(adjustedTenureCOP);
        const csBenefitsCurr  = copToCurr(csBenefitsCOP);
        const techCurr        = copToCurr(microsoftCOPLocal) + copToCurr(cib) + copToCurr(payroll) + copToCurr(internet);
        const miscCurr        = copToCurr(uniform) + copToCurr(workids) + copToCurr(furniture) + copToCurr(profInd) + copToCurr(pubLiab) + copToCurr(compIns);
        const edcCurr         = basicSalaryCurr + govCurr + tenureCurr + csBenefitsCurr + techCurr + miscCurr;

        return {
            baseSalary, nightDiffCOP, nightMealsCOP, nightMealsCurrencyVal,
            eps, afp, arl, caja, icbf, sena, cesantias, separationBenefit, liquidation, intereses, prima, vacaciones, addlPension,
            govBenefitsCOP: adjustedGovCOP, tenureCOP: adjustedTenureCOP, excludeSeparation,
            hmo, pharmacy, lifeIns, addlPensionCS, teamBuild, xmas, socialClub, csBenefitsCOP,
            cib, payroll, internet, techCOP, microsoftCOP: microsoftCOPLocal,
            uniform, workids, furniture, profInd, pubLiab, compIns, miscCOP,
            basicSalaryCOP, edcCOP,
            basicSalaryCurr, govCurr, tenureCurr, csBenefitsCurr, techCurr, miscCurr, edcCurr,
            copToCurr, audToCurr
        };
    }

    const cFrom = calcCOForSalary(baseSalaryFrom);
    const cTo   = calcCOForSalary(baseSalaryTo);
    const isRange = baseSalaryFrom !== baseSalaryTo;

    // CS Fee and hardware (same as PH)
    const pb = pbCache[priceBook] || PRICE_BOOKS[priceBook];
    const csFee = pb ? (pb[currency] || 0) : 0;
    const isElevate = pb ? (pb.is_elevate || pb.isElevate || false) : false;
    const mpcFee = getHardwarePrice(hardwareId, currency, isElevate);
    const setupFee = SETUP_FEES[currency] || 399;

    const totalMonthlyFrom = cFrom.edcCurr + csFee + mpcFee;
    const totalMonthlyTo   = cTo.edcCurr   + csFee + mpcFee;
    const depositFrom = cFrom.edcCurr + csFee - cFrom.nightMealsCurrencyVal;
    const depositTo   = cTo.edcCurr   + csFee - cTo.nightMealsCurrencyVal;
    const dayRateFrom = (totalMonthlyFrom * 12) / 260;
    const dayRateTo   = (totalMonthlyTo   * 12) / 260;
    const easyLeaveFrom = dayRateFrom * 0.958;
    const easyLeaveTo   = dayRateTo   * 0.958;

    const validDate = new Date();
    validDate.setDate(validDate.getDate() + 30);

    // --- Update DOM ---
    const sel = (id) => document.getElementById(id);

    sel('coResultCandidateName').textContent = candidateName || 'To Be Advised';
    sel('coResultRoleName').textContent      = roleDisplay   || 'To Be Advised';
    sel('coResultBaseSalary').textContent    = isRange
        ? fmtCurr(baseSalaryFrom, 'COP') + ' to ' + fmtCurr(baseSalaryTo, 'COP')
        : fmtCurr(baseSalaryFrom, 'COP');

    sel('coResultEDC').textContent          = fmtRange(cFrom.edcCurr, cTo.edcCurr, currency);
    sel('coResultCSFee').textContent        = fmtCurr(csFee, currency);
    sel('coResultMPC').textContent          = fmtCurr(mpcFee, currency);
    const hwRow = calcHardwareData.find(p => p.id === parseInt(hardwareId));
    sel('coResultMPCProduct').textContent   = hwRow ? hwRow.name : 'No Hardware';
    sel('coResultTotalMonthly').textContent = fmtRange(totalMonthlyFrom, totalMonthlyTo, currency);
    sel('coResultSetup').textContent        = fmtCurr(setupFee, currency);
    sel('coResultDeposit').textContent      = fmtRange(depositFrom, depositTo, currency);
    sel('coResultEasyLeave').textContent    = fmtRange(easyLeaveFrom, easyLeaveTo, currency);
    sel('coResultDayRate').textContent      = fmtRange(dayRateFrom, dayRateTo, currency);
    sel('coResultHourlyRate').textContent   = fmtRange(dayRateFrom/8, dayRateTo/8, currency);
    sel('coQuoteValidity').textContent      = validDate.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

    // FX tile
    if (currency === 'AUD') {
        sel('coResultFXRate').textContent = `1 AUD = ${audToCOP.toFixed(2)} COP`;
        sel('coResultFXDesc').textContent = `COP to AUD: ${copToAUD.toFixed(8)}`;
    } else {
        const fxVal = parseFloat(fxRow[currency.toLowerCase()]) || 1;
        sel('coResultFXRate').textContent = `1 ${currency} = ${fxVal.toFixed(2)} COP`;
        sel('coResultFXDesc').textContent = `AUD: 1 AUD = ${audToCOP.toFixed(2)} COP`;
    }
    sel('coResultFXDate').textContent = fxRow.month_name || '';
    sel('coBenefitsCurrencyHeader').textContent = currency;

    // EDC tiles
    sel('coEdcBasicSalary').textContent     = fmtRange(cFrom.basicSalaryCurr, cTo.basicSalaryCurr, currency);
    sel('coEdcBasicSalaryCOP').textContent  = fmtRange(cFrom.basicSalaryCOP, cTo.basicSalaryCOP, 'COP');
    sel('coEdcGovBenefits').textContent     = fmtRange(cFrom.govCurr, cTo.govCurr, currency);
    sel('coEdcGovBenefitsCOP').textContent  = fmtRange(cFrom.govBenefitsCOP, cTo.govBenefitsCOP, 'COP');
    sel('coEdcCSBenefits').textContent      = fmtRange(cFrom.csBenefitsCurr, cTo.csBenefitsCurr, currency);
    sel('coEdcCSBenefitsCOP').textContent   = fmtRange(cFrom.csBenefitsCOP, cTo.csBenefitsCOP, 'COP');
    const cloudstafferFrom = cFrom.techCurr + cFrom.miscCurr;
    const cloudstafferTo   = cTo.techCurr + cTo.miscCurr;
    const cloudstafferCOPFrom = cFrom.techCOP + cFrom.miscCOP;
    const cloudstafferCOPTo   = cTo.techCOP + cTo.miscCOP;
    sel('coEdcCloudstafferCosts').textContent    = fmtRange(cloudstafferFrom, cloudstafferTo, currency);
    sel('coEdcCloudstafferCostsCOP').textContent = fmtRange(cloudstafferCOPFrom, cloudstafferCOPTo, 'COP');
    sel('coEdcGrandTotal').textContent      = fmtRange(cFrom.edcCurr, cTo.edcCurr, currency);
    sel('coEdcGrandTotalCOP').textContent   = fmtRange(cFrom.edcCOP, cTo.edcCOP, 'COP');

    // Detailed breakdown
    const fmtR = (a, b, c) => fmtRange(a, b, c);
    sel('coBfBaseSalaryCOP').textContent    = fmtR(cFrom.baseSalary, cTo.baseSalary, 'COP');
    sel('coBfBaseSalary').textContent       = fmtR(cFrom.copToCurr(cFrom.baseSalary), cTo.copToCurr(cTo.baseSalary), currency);
    sel('coBfNightDiffCOP').textContent     = fmtR(cFrom.nightDiffCOP, cTo.nightDiffCOP, 'COP');
    sel('coBfNightDiff').textContent        = fmtR(cFrom.copToCurr(cFrom.nightDiffCOP), cTo.copToCurr(cTo.nightDiffCOP), currency);
    sel('coBfNightMealsCOP').textContent    = fmtCurr(cFrom.nightMealsCOP, 'COP');
    sel('coBfNightMeals').textContent       = fmtCurr(cFrom.nightMealsCurrencyVal, currency);
    sel('coBfBasicSalarySubCOP').textContent= fmtR(cFrom.basicSalaryCOP, cTo.basicSalaryCOP, 'COP');
    sel('coBfBasicSalarySub').textContent   = fmtR(cFrom.basicSalaryCurr, cTo.basicSalaryCurr, currency);

    sel('coBfEPSCOP').textContent           = fmtR(cFrom.eps, cTo.eps, 'COP');
    sel('coBfEPS').textContent              = fmtR(cFrom.copToCurr(cFrom.eps), cTo.copToCurr(cTo.eps), currency);
    sel('coBfAFPCOP').textContent           = fmtR(cFrom.afp, cTo.afp, 'COP');
    sel('coBfAFP').textContent              = fmtR(cFrom.copToCurr(cFrom.afp), cTo.copToCurr(cTo.afp), currency);
    sel('coBfARLCOP').textContent           = fmtR(cFrom.arl, cTo.arl, 'COP');
    sel('coBfARL').textContent              = fmtR(cFrom.copToCurr(cFrom.arl), cTo.copToCurr(cTo.arl), currency);
    sel('coBfCajaCOP').textContent          = fmtR(cFrom.caja, cTo.caja, 'COP');
    sel('coBfCaja').textContent             = fmtR(cFrom.copToCurr(cFrom.caja), cTo.copToCurr(cTo.caja), currency);
    sel('coBfICBFCOP').textContent          = fmtR(cFrom.icbf, cTo.icbf, 'COP');
    sel('coBfICBF').textContent             = fmtR(cFrom.copToCurr(cFrom.icbf), cTo.copToCurr(cTo.icbf), currency);
    sel('coBfSENACOP').textContent          = fmtR(cFrom.sena, cTo.sena, 'COP');
    sel('coBfSENA').textContent             = fmtR(cFrom.copToCurr(cFrom.sena), cTo.copToCurr(cTo.sena), currency);
    sel('coBfCesantiasCOP').textContent     = fmtR(cFrom.cesantias, cTo.cesantias, 'COP');
    sel('coBfCesantias').textContent        = fmtR(cFrom.copToCurr(cFrom.cesantias), cTo.copToCurr(cTo.cesantias), currency);
    sel('coBfSeparationCOP').textContent    = fmtR(cFrom.separationBenefit, cTo.separationBenefit, 'COP');
    sel('coBfSeparation').textContent       = fmtR(cFrom.copToCurr(cFrom.separationBenefit), cTo.copToCurr(cTo.separationBenefit), currency);
    sel('coBfTenureSubCOP').textContent     = fmtR(cFrom.tenureCOP, cTo.tenureCOP, 'COP');
    sel('coBfTenureSub').textContent        = fmtR(cFrom.tenureCurr, cTo.tenureCurr, currency);
    sel('coBfLiquidationCOP').textContent   = fmtCurr(0, 'COP');
    sel('coBfLiquidation').textContent      = fmtCurr(0, currency);
    sel('coBfInteresesCOP').textContent     = fmtR(cFrom.intereses, cTo.intereses, 'COP');
    sel('coBfIntereses').textContent        = fmtR(cFrom.copToCurr(cFrom.intereses), cTo.copToCurr(cTo.intereses), currency);
    sel('coBfPrimaCOP').textContent         = fmtR(cFrom.prima, cTo.prima, 'COP');
    sel('coBfPrima').textContent            = fmtR(cFrom.copToCurr(cFrom.prima), cTo.copToCurr(cTo.prima), currency);
    sel('coBfVacacionesCOP').textContent    = fmtR(cFrom.vacaciones, cTo.vacaciones, 'COP');
    sel('coBfVacaciones').textContent       = fmtR(cFrom.copToCurr(cFrom.vacaciones), cTo.copToCurr(cTo.vacaciones), currency);
    sel('coBfGovBenefitsSubCOP').textContent= fmtR(cFrom.govBenefitsCOP, cTo.govBenefitsCOP, 'COP');
    sel('coBfGovBenefitsSub').textContent   = fmtR(cFrom.govCurr, cTo.govCurr, currency);

    sel('coBfHMOCOP').textContent           = fmtCurr(cFrom.hmo, 'COP');
    sel('coBfHMO').textContent              = fmtCurr(cFrom.copToCurr(cFrom.hmo), currency);
    sel('coBfPharmacyCOP').textContent      = fmtCurr(cFrom.pharmacy, 'COP');
    sel('coBfPharmacy').textContent         = fmtCurr(cFrom.copToCurr(cFrom.pharmacy), currency);
    sel('coBfLifeInsCOP').textContent       = fmtCurr(cFrom.lifeIns, 'COP');
    sel('coBfLifeIns').textContent          = fmtCurr(cFrom.copToCurr(cFrom.lifeIns), currency);
    sel('coBfAddlPensionCOP').textContent   = fmtCurr(0, 'COP');
    sel('coBfAddlPension').textContent      = fmtCurr(0, currency);
    sel('coBfTeamBuildingCOP').textContent  = fmtCurr(cFrom.teamBuild, 'COP');
    sel('coBfTeamBuilding').textContent     = fmtCurr(cFrom.copToCurr(cFrom.teamBuild), currency);
    sel('coBfXMASCOP').textContent          = fmtCurr(cFrom.xmas, 'COP');
    sel('coBfXMAS').textContent             = fmtCurr(cFrom.copToCurr(cFrom.xmas), currency);
    sel('coBfSocialClubCOP').textContent    = fmtCurr(cFrom.socialClub, 'COP');
    sel('coBfSocialClub').textContent       = fmtCurr(cFrom.copToCurr(cFrom.socialClub), currency);
    sel('coBfCSBenefitsSubCOP').textContent = fmtCurr(cFrom.csBenefitsCOP, 'COP');
    sel('coBfCSBenefitsSub').textContent    = fmtCurr(cFrom.csBenefitsCurr, currency);

    sel('coBfMicrosoftCOP').textContent     = fmtCurr(cFrom.microsoftCOP, 'COP');
    sel('coBfMicrosoft').textContent        = fmtCurr(cFrom.copToCurr(cFrom.microsoftCOP), currency);
    sel('coBfCIBCOP').textContent           = fmtCurr(cFrom.cib, 'COP');
    sel('coBfCIB').textContent              = fmtCurr(cFrom.copToCurr(cFrom.cib), currency);
    sel('coBfPayrollCOP').textContent       = fmtCurr(cFrom.payroll, 'COP');
    sel('coBfPayroll').textContent          = fmtCurr(cFrom.copToCurr(cFrom.payroll), currency);
    sel('coBfInternetCOP').textContent      = fmtCurr(cFrom.internet, 'COP');
    sel('coBfInternet').textContent         = fmtCurr(cFrom.copToCurr(cFrom.internet), currency);
    sel('coBfTechSubCOP').textContent       = fmtCurr(cFrom.techCOP, 'COP');
    sel('coBfTechSub').textContent          = fmtCurr(cFrom.techCurr, currency);

    sel('coBfUniformCOP').textContent       = fmtCurr(cFrom.uniform, 'COP');
    sel('coBfUniform').textContent          = fmtCurr(cFrom.copToCurr(cFrom.uniform), currency);
    sel('coBfWorkIDsCOP').textContent       = fmtCurr(cFrom.workids, 'COP');
    sel('coBfWorkIDs').textContent          = fmtCurr(cFrom.copToCurr(cFrom.workids), currency);
    sel('coBfFurnitureCOP').textContent     = fmtCurr(cFrom.furniture, 'COP');
    sel('coBfFurniture').textContent        = fmtCurr(cFrom.copToCurr(cFrom.furniture), currency);
    sel('coBfIndemnityInsCOP').textContent  = fmtCurr(cFrom.profInd, 'COP');
    sel('coBfIndemnityIns').textContent     = fmtCurr(cFrom.copToCurr(cFrom.profInd), currency);
    sel('coBfPublicLiabCOP').textContent    = fmtCurr(cFrom.pubLiab, 'COP');
    sel('coBfPublicLiab').textContent       = fmtCurr(cFrom.copToCurr(cFrom.pubLiab), currency);
    sel('coBfComprehensiveCOP').textContent = fmtCurr(cFrom.compIns, 'COP');
    sel('coBfComprehensive').textContent    = fmtCurr(cFrom.copToCurr(cFrom.compIns), currency);
    sel('coBfMiscSubCOP').textContent       = fmtCurr(cFrom.miscCOP, 'COP');
    sel('coBfMiscSub').textContent          = fmtCurr(cFrom.miscCurr, currency);

    sel('coBfTotalCOP').textContent         = fmtR(cFrom.edcCOP, cTo.edcCOP, 'COP');
    sel('coBfTotal').textContent            = fmtR(cFrom.edcCurr, cTo.edcCurr, currency);
}

// =====================================================
// COLOMBIA EDITING BANNER
// =====================================================
function showEditingBannerCO(quoteName, qqNumber) {
    document.getElementById('editingBannerCO').classList.remove('hidden');
    document.getElementById('editingQuoteNameCO').textContent = quoteName || '--';
    document.getElementById('editingQuoteNumberCO').textContent = qqNumber || '--';
}
function hideEditingBannerCO() {
    document.getElementById('editingBannerCO').classList.add('hidden');
}

// =====================================================
// COLOMBIA SAVE QUOTE
// =====================================================
function showSaveQuoteModalCO() {
    const modal = document.getElementById('saveQuoteModal');
    modal.classList.add('active');
    modal.setAttribute('data-market', 'CO');

    const userName = currentUser ? (currentUser.name || currentUser.email || 'Unknown') : 'Unknown';
    const roleName = document.getElementById('coRoleSearchInput')?.value?.trim()
                  || document.getElementById('coRoleName')?.value?.trim()
                  || 'To Be Advised';
    const autoName = `${userName} — ${roleName}`;
    document.getElementById('quoteNamePreview').textContent = autoName;

    if (currentEditingQuoteIdCO) {
        const existing = allQuotesData.find(q => q.id === currentEditingQuoteIdCO);
        document.getElementById('quoteDescription').value = existing ? (existing.description || '') : '';
    } else {
        document.getElementById('quoteDescription').value = '';
    }
    setTimeout(() => document.getElementById('quoteDescription').focus(), 100);
}

async function saveQuoteCO() {
    const quoteName = document.getElementById('quoteNamePreview').textContent.trim()
                   || (currentUser ? (currentUser.name || currentUser.email) : 'Unknown') + ' — To Be Advised';
    const description = document.getElementById('quoteDescription').value.trim();

    const quoteData = {
        market: 'CO',
        quote_name: quoteName,
        description: description || null,
        candidate_name: document.getElementById('coCandidateName').value || 'To Be Advised',
        role_name: document.getElementById('coRoleSearchInput').value || document.getElementById('coRoleName').value || 'To Be Advised',
        custom_role_name: document.getElementById('coRoleName').value || null,
        base_salary_from: parseFloat(document.getElementById('coBaseSalaryFrom').value) || 4000000,
        base_salary_to: parseFloat(document.getElementById('coBaseSalaryTo').value) || 4000000,
        currency: document.getElementById('coCurrency').value,
        price_book: document.getElementById('coPriceBook').value,
        night_diff_hours: parseInt(document.getElementById('coNightDiffHours').value) || 0,
        night_diff_rate: 0.35,
        separation_override: document.getElementById('coSeparationOverride').value,
        fx_month_id: parseInt(document.getElementById('coExchangeRateDate').value) || null,
        hardware_id: parseInt(document.getElementById('coMpcHardware').value) || null,
        night_meal_id: parseInt(document.getElementById('coNightMealsProduct').value) || null,
        total_monthly: document.getElementById('coResultTotalMonthly').textContent,
        created_by: currentUser ? (currentUser.name || currentUser.email || 'Unknown') : 'Unknown',
    };

    try {
        if (currentEditingQuoteIdCO) {
            quoteData.updated_at = new Date().toISOString();
            const { error } = await supabaseClient
                .from('quotes')
                .update(quoteData)
                .eq('id', currentEditingQuoteIdCO);
            if (error) throw error;
            hideSaveQuoteModal();
            hideEditingBannerCO();
            currentEditingQuoteIdCO = null;
            await loadQuotes();
            alert(`Quote updated: ${quoteName}`);
        } else {
            const { data: existing } = await supabaseClient
                .from('quotes')
                .select('quote_number')
                .order('id', { ascending: false })
                .limit(1);
            let nextNum = 1;
            if (existing && existing.length > 0 && existing[0].quote_number) {
                const last = existing[0].quote_number.replace('QQ-', '');
                nextNum = parseInt(last) + 1;
            }
            quoteData.quote_number = 'QQ-' + String(nextNum).padStart(4, '0');
            quoteData.created_at = new Date().toISOString();
            const { error } = await supabaseClient
                .from('quotes')
                .insert([quoteData]);
            if (error) throw error;
            hideSaveQuoteModal();
            await loadQuotes();
            alert(`Quote saved: ${quoteData.quote_number} — ${quoteName}`);
        }
    } catch(e) {
        console.error('Save CO quote error:', e);
        alert('Error saving quote: ' + e.message);
    }
}

// Load a CO quote back into the Colombia calculator
function loadQuoteIntoCalcCO(quote) {
    currentEditingQuoteIdCO = quote.id;
    document.getElementById('coCandidateName').value = quote.candidate_name || '';
    document.getElementById('coRoleSearchInput').value = quote.role_name || '';
    document.getElementById('coRoleName').value = quote.custom_role_name || '';
    document.getElementById('coBaseSalaryFrom').value = quote.base_salary_from || 4000000;
    document.getElementById('coBaseSalaryTo').value = quote.base_salary_to || 4000000;
    document.getElementById('coCurrency').value = quote.currency || 'AUD';
    document.getElementById('coPriceBook').value = quote.price_book || 'Current ELEVATE WFH';
    document.getElementById('coNightDiffHours').value = quote.night_diff_hours || '0';
    document.getElementById('coSeparationOverride').value = quote.separation_override || 'include';
    if (quote.fx_month_id) {
        const sel = document.getElementById('coExchangeRateDate');
        const opt = Array.from(sel.options).find(o => o.value == quote.fx_month_id);
        if (opt) sel.value = quote.fx_month_id;
    }
    if (quote.hardware_id) {
        const sel = document.getElementById('coMpcHardware');
        const opt = Array.from(sel.options).find(o => o.value == quote.hardware_id);
        if (opt) sel.value = quote.hardware_id;
    }
    if (quote.night_meal_id) {
        const sel = document.getElementById('coNightMealsProduct');
        const opt = Array.from(sel.options).find(o => o.value == quote.night_meal_id);
        if (opt) sel.value = quote.night_meal_id;
    }
    const isOwner = currentUser && (currentUser.name === quote.created_by || currentUser.email === quote.created_by);
    const isAdmin = currentUser && currentUser.role === 'Admin';
    const canSave = isAdmin || isOwner;
    const saveBtn = document.getElementById('coSaveQuoteBtn');
    if (saveBtn) {
        saveBtn.disabled = !canSave;
        saveBtn.style.opacity = canSave ? '1' : '0.5';
        saveBtn.style.cursor = canSave ? 'pointer' : 'not-allowed';
        saveBtn.title = canSave ? '' : 'You can only save quotes you created';
    }
    showEditingBannerCO(quote.quote_name, quote.quote_number);
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('[data-page="calculator-co"]').classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-calculator-co').classList.add('active');
    calculateCO();
}

// =====================================================
// COLOMBIA PDF GENERATION
// =====================================================
function generatePDFCO() {
    const candidateName = document.getElementById('coCandidateName').value || 'To Be Advised';
    const roleName = document.getElementById('coRoleSearchInput').value || document.getElementById('coRoleName').value || 'To Be Advised';
    const currency = document.getElementById('coCurrency').value;
    const priceBook = document.getElementById('coPriceBook').value;
    const fxDate    = document.getElementById('coResultFXDate').textContent;
    const fxRate    = document.getElementById('coResultFXRate').textContent;
    const baseSalary= document.getElementById('coResultBaseSalary').textContent;
    const edc       = document.getElementById('coResultEDC').textContent;
    const csFee     = document.getElementById('coResultCSFee').textContent;
    const mpcFee    = document.getElementById('coResultMPC').textContent;
    const mpcProduct= document.getElementById('coResultMPCProduct').textContent;
    const totalMonthly = document.getElementById('coResultTotalMonthly').textContent;
    const setupFee  = document.getElementById('coResultSetup').textContent;
    const deposit   = document.getElementById('coResultDeposit').textContent;
    const easyLeave = document.getElementById('coResultEasyLeave').textContent;
    const validity  = document.getElementById('coQuoteValidity').textContent;
    const dayRate   = document.getElementById('coResultDayRate').textContent;
    const hourlyRate= document.getElementById('coResultHourlyRate').textContent;
    const userName  = currentUser ? (currentUser.name || currentUser.email || 'Cloudstaff') : 'Cloudstaff';
    const genDate   = new Date().toLocaleDateString('en-AU', {day:'numeric', month:'long', year:'numeric'});

    const pdfHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Quote For Supply Of Outsourcing Services — ${candidateName} (Colombia)</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
  body { font-family:'Inter',sans-serif; max-width:750px; margin:0 auto; padding:28px 28px 20px; color:#1e293b; font-size:12px; line-height:1.45; }
  .hdr { display:flex; justify-content:space-between; align-items:center; padding-bottom:14px; border-bottom:2px solid #e2e8f0; margin-bottom:16px; }
  .hdr-logo img { height:36px; width:auto; }
  .hdr-meta { text-align:right; }
  .hdr-meta .doc-title { font-size:15px; font-weight:700; color:#1e293b; margin-bottom:2px; }
  .hdr-meta .doc-date { font-size:10px; color:#64748b; }
  .country-badge { display:inline-block; background:#fef9c3; border:1px solid #fde047; border-radius:4px; padding:2px 8px; font-size:9px; font-weight:700; color:#854d0e; margin-top:3px; }
  .preamble { background:#f8fafc; border-left:3px solid #059669; border-radius:0 8px 8px 0; padding:12px 16px; margin-bottom:16px; }
  .preamble p { color:#334155; font-size:11.5px; line-height:1.6; }
  .preamble .regards { margin-top:10px; color:#334155; font-size:11.5px; }
  .preamble .regards strong { display:block; margin-top:3px; color:#1e293b; font-size:12px; }
  .info-band { background:linear-gradient(135deg,#065f46 0%,#059669 100%); border-radius:8px; padding:12px 16px; margin-bottom:14px; display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  .info-band .item .lbl { font-size:8px; text-transform:uppercase; letter-spacing:.07em; color:rgba(255,255,255,.65); font-weight:600; margin-bottom:2px; }
  .info-band .item .val { font-size:12.5px; font-weight:700; color:#fff; }
  .sec { margin-bottom:12px; }
  .stitle { font-size:8.5px; text-transform:uppercase; letter-spacing:.07em; color:#94a3b8; font-weight:700; margin-bottom:6px; padding-bottom:3px; border-bottom:1px solid #f1f5f9; }
  .grid4 { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
  .grid2 { display:grid; grid-template-columns:repeat(2,1fr); gap:6px; }
  .tile { background:#f8fafc; border:1px solid #e2e8f0; border-radius:7px; padding:9px 11px; }
  .tile.green { background:linear-gradient(135deg,#065f46,#059669); border:none; }
  .tile.dark-green { background:linear-gradient(135deg,#14532d,#166534); border:none; }
  .tile .tl { font-size:8.5px; font-weight:600; margin-bottom:3px; color:#64748b; }
  .tile.green .tl, .tile.dark-green .tl { color:rgba(255,255,255,.75); }
  .tile .tv { font-size:13px; font-weight:700; font-family:'Courier New',monospace; color:#1e293b; }
  .tile.green .tv, .tile.dark-green .tv { color:#fff; }
  .validity { background:#f0fdf4; border:1px solid #86efac; border-radius:7px; padding:9px 14px; display:flex; justify-content:space-between; align-items:center; margin-top:6px; }
  .validity span:first-child { font-size:11px; font-weight:600; color:#166534; }
  .validity span:last-child { font-family:'Courier New',monospace; font-weight:700; color:#166534; font-size:12px; }
  .footer { margin-top:16px; padding-top:10px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; }
  .footer-left { font-size:9px; color:#94a3b8; }
  .footer-right img { height:18px; opacity:0.45; }
  @media print { @page { margin:10mm 12mm; size:A4; } body { padding:0; } }
</style>
</head>
<body>
<div class="hdr">
  <div class="hdr-logo">
    <img src="https://info.cloudstaff.com/hubfs/001%20SALES/Tools/Cloudstaff-No%20Tagline-Landscape-Color-Positive-No%20Keyline.png" alt="Cloudstaff" crossorigin="anonymous">
  </div>
  <div class="hdr-meta">
    <div class="doc-title">Quote For Supply Of Outsourcing Services</div>
    <div class="doc-date">Generated ${genDate}</div>
    <div class="country-badge">🌎 Colombia</div>
  </div>
</div>
<div class="preamble">
  <p>Thank you for your interest in Cloudstaff. The following quote has been prepared based on our discussions to date. The quote is indicative only. Base Salary is presented as a low to high range and will be updated once individual candidates are identified through our rigorous recruitment process. If you have questions, please feel free to reach out to me directly. Thanks again.</p>
  <div class="regards">Kind Regards<strong>${userName}</strong></div>
</div>
<div class="info-band">
  <div class="item"><div class="lbl">Candidate</div><div class="val">${candidateName}</div></div>
  <div class="item"><div class="lbl">Role</div><div class="val">${roleName}</div></div>
  <div class="item"><div class="lbl">Base Salary Range (COP)</div><div class="val">${baseSalary}</div></div>
  <div class="item"><div class="lbl">Currency</div><div class="val">${currency}</div></div>
  <div class="item"><div class="lbl">Price Book</div><div class="val">${priceBook}</div></div>
  <div class="item"><div class="lbl">Hardware</div><div class="val">${mpcProduct}</div></div>
</div>
<div class="sec">
  <div class="stitle">Monthly Recurring Costs</div>
  <div class="grid4">
    <div class="tile green"><div class="tl">Monthly EDC</div><div class="tv">${edc}</div></div>
    <div class="tile green"><div class="tl">Monthly CS Fee</div><div class="tv">${csFee}</div></div>
    <div class="tile green"><div class="tl">Monthly mPC Fee</div><div class="tv">${mpcFee}</div></div>
    <div class="tile dark-green"><div class="tl">Total Monthly</div><div class="tv">${totalMonthly}</div></div>
  </div>
</div>
<div class="sec">
  <div class="stitle">Once-Off Charges</div>
  <div class="grid2">
    <div class="tile"><div class="tl">Setup Fee</div><div class="tv">${setupFee}</div></div>
    <div class="tile"><div class="tl">Deposit</div><div class="tv">${deposit}</div></div>
  </div>
</div>
<div class="sec">
  <div class="stitle">Indicative Rates</div>
  <div class="grid2">
    <div class="tile"><div class="tl">Daily Rate</div><div class="tv">${dayRate}</div></div>
    <div class="tile"><div class="tl">Hourly Rate</div><div class="tv">${hourlyRate}</div></div>
  </div>
</div>
<div class="sec">
  <div class="stitle">FX Rate Applied</div>
  <div class="tile"><div class="tl">${fxDate}</div><div class="tv">${fxRate}</div></div>
</div>
<div class="validity">
  <span>Quote Valid Until</span>
  <span>${validity}</span>
</div>
<div class="footer">
  <div class="footer-left">Confidential — For authorised use only. Cloudstaff Resource Rate Pricing Tool · Colombia</div>
  <div class="footer-right"><img src="https://info.cloudstaff.com/hubfs/001%20SALES/Tools/Cloudstaff-No%20Tagline-Landscape-Color-Positive-No%20Keyline.png" alt="Cloudstaff"></div>
</div>
</body></html>`;

    const w = window.open('', '_blank');
    w.document.write(pdfHtml);
    w.document.close();
    setTimeout(() => w.print(), 600);
}

