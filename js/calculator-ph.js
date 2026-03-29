// =====================================================
// CALCULATOR INIT
// =====================================================
async function initCalculator() {
    await Promise.all([
        loadCalcFXRates(),
        loadCalcHardware(),
        loadCalcNightMeals(),
        loadCalcBenefits(),
        loadCalcSSS(),
        loadCalcHMO()
    ]);
    calculate();
}

async function loadCalcFXRates() {
    try {
        const { data, error } = await supabaseClient
            .from('fx_monthly_rates')
            .select('*')
            .order('month_date', { ascending: false });
        if (error) throw error;
        calcFXData = data || [];
        populateExchangeRateDropdown();
    } catch(e) { console.error('FX load error:', e); }
}

function buildFXDropdown(sel, rows) {
    const byYear = {};
    rows.forEach(r => {
        const yr = r.month_date ? r.month_date.substring(0,4) : '2025';
        if (!byYear[yr]) byYear[yr] = [];
        byYear[yr].push(r);
    });
    sel.innerHTML = '';
    Object.keys(byYear).sort().reverse().forEach(yr => {
        const og = document.createElement('optgroup');
        og.label = yr;
        byYear[yr].forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = r.month_name;
            og.appendChild(opt);
        });
        sel.appendChild(og);
    });
    if (sel.options.length > 0) sel.selectedIndex = 0;
}

function populateExchangeRateDropdown() {
    const sel = document.getElementById('exchangeRateDate');
    if (!sel || !calcFXData.length) return;
    const isAdmin = currentUser && currentUser.role === 'Admin';
    // PH calc: only PH rows (market='PH' or legacy rows with no market)
    let phRows = calcFXData.filter(r => !r.market || r.market === 'PH');
    if (!isAdmin) phRows = phRows.slice(0, 2);
    buildFXDropdown(sel, phRows);
}

function getSelectedFXRates() {
    const sel = document.getElementById('exchangeRateDate');
    if (!sel || !sel.value) return null;
    const id = parseInt(sel.value);
    return calcFXData.find(r => r.id === id) || calcFXData[0] || null;
}

async function loadCalcHardware() {
    try {
        const { data, error } = await supabaseClient
            .from('hardware_products')
            .select('id, name, category, price_aud_rrp, price_aud_elevate, price_usd_rrp, price_usd_elevate, price_gbp_rrp, price_gbp_elevate, price_hkd_rrp, price_hkd_elevate, price_sgd_rrp, price_sgd_elevate, price_eur_rrp, price_eur_elevate, price_cad_rrp, price_cad_elevate, price_nzd_rrp, price_nzd_elevate')
            .order('category')
            .order('name');
        if (error) throw error;
        calcHardwareData = data || [];
        populateHardwareDropdown();
    } catch(e) { console.error('Hardware load error:', e); }
}

function populateHardwareDropdown() {
    const sel = document.getElementById('mpcHardware');
    if (!sel) return;
    sel.innerHTML = '<option value="">No Hardware / BYO PC</option>';
    // Group by category
    const byCategory = {};
    calcHardwareData.forEach(p => {
        const cat = p.category || 'Other';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(p);
    });
    Object.keys(byCategory).sort().forEach(cat => {
        const og = document.createElement('optgroup');
        og.label = cat;
        byCategory[cat].forEach(p => {
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

function getHardwarePrice(hardwareId, currency, isElevate) {
    if (!hardwareId) return 0;
    const id = parseInt(hardwareId);
    const hw = calcHardwareData.find(p => p.id === id);
    if (!hw) return 0;
    const curr = currency.toLowerCase();
    const tier = isElevate ? 'elevate' : 'rrp';
    return parseFloat(hw[`price_${curr}_${tier}`]) || 0;
}

async function loadCalcNightMeals() {
    try {
        const { data, error } = await supabaseClient
            .from('night_meals_config')
            .select('*')
            .order('id');
        if (error) throw error;
        calcNightMealsData = data || [];
        populateNightMealsDropdown();
    } catch(e) { console.error('Night meals load error:', e); }
}

function populateNightMealsDropdown() {
    const sel = document.getElementById('nightMealsProduct');
    if (!sel) return;
    sel.innerHTML = '';
    calcNightMealsData.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        if (m.is_default) opt.selected = true;
        sel.appendChild(opt);
    });
    // First option = no meals
    if (calcNightMealsData.length > 0 && sel.options.length > 0) sel.value = calcNightMealsData[0].id;
}

function getNightMealPrice(mealId, currency) {
    if (!mealId) return 0;
    const id = parseInt(mealId);
    const meal = calcNightMealsData.find(m => m.id === id);
    if (!meal) return 0;
    const curr = currency.toLowerCase();
    return parseFloat(meal[`price_${curr}`]) || 0;
}

async function loadCalcBenefits() {
    try {
        const { data, error } = await supabaseClient
            .from('benefits_config')
            .select('*')
            .order('category')
            .order('sort_order');
        if (error) throw error;
        // PH calc: only PH rows (market='PH' or legacy rows with no market)
        calcBenefitsData = (data || []).filter(r => !r.market || r.market === 'PH');
    } catch(e) { console.error('Benefits load error:', e); }
}

async function loadCalcSSS() {
    try {
        // Prefer live sss_table_brackets
        const { data: tables } = await supabaseClient
            .from('sss_tables')
            .select('id')
            .eq('is_live', true)
            .single();
        if (tables && tables.id) {
            const { data: brackets } = await supabaseClient
                .from('sss_table_brackets')
                .select('*')
                .eq('table_id', tables.id)
                .order('range_start', { ascending: false });
            if (brackets && brackets.length) { calcSSSData = brackets; return; }
        }
        // Fallback: sss_contributions
        const { data, error } = await supabaseClient
            .from('sss_contributions')
            .select('*')
            .order('range_start', { ascending: false });
        if (!error && data) calcSSSData = data;
    } catch(e) { console.error('SSS load error:', e); }
}

async function loadCalcHMO() {
    try {
        const { data, error } = await supabaseClient
            .from('hmo_rates')
            .select('monthly_rate_php, provider, plan_name')
            .eq('is_active', true)
            .single();
        if (!error && data) {
            calcHMORate = parseFloat(data.monthly_rate_php) || 0;
            const badge = document.getElementById('hmoInfoBadge');
            if (badge) badge.textContent = `${data.provider} ${data.plan_name} — Active HMO`;
        }
    } catch(e) { console.error('HMO load error:', e); }
}

// SSS lookup
function getSSS(salary) {
    if (!calcSSSData.length) {
        // Fallback hardcoded
        if (salary >= 30000) return 2880;
        const bracket = Math.floor((salary - 10500) / 500);
        return Math.max(0, 1027.5 + bracket * 47.5);
    }
    for (const row of calcSSSData) {
        if (salary >= parseFloat(row.range_start) && salary <= parseFloat(row.range_end)) {
            return parseFloat(row.er_share) || 0;
        }
    }
    return parseFloat(calcSSSData[0]?.er_share) || 2880;
}

// PHIC lookup
function getPHIC(salary) {
    if (salary > 100000) return 2500;
    if (salary > 10000) return Math.min(salary * 0.025, 2500);
    return 250;
}

// Evaluate benefit formula
function evalBenefit(formula, baseSalary, nightDiffPHP, audToPhpRate) {
    if (!formula) return 0;
    const f = formula.trim();
    if (!f) return 0;

    // Named lookup shortcuts
    if (f === 'SSS_LOOKUP' || f.toLowerCase().includes('sss_contributions') || f.toLowerCase().includes('sss_lookup')) return getSSS(baseSalary);
    if (f === 'PHIC_LOOKUP' || f.toLowerCase().includes('phic')) return getPHIC(baseSalary);

    // Evaluate as a JS expression with all named variables in scope via Function constructor.
    // This avoids the fragile regex test that blocked valid expressions from evaluating.
    try {
        const annualSalary = baseSalary * 12;
        const dailyRate    = annualSalary / 260;
        const hourlyRate   = dailyRate / 8;
        const fn = new Function(
            'baseSalary', 'annualSalary', 'dailyRate', 'hourlyRate',
            'nightDiffPHP', 'audToPhpRate',
            'return (' + f + ');'
        );
        const result = fn(baseSalary, annualSalary, dailyRate, hourlyRate, nightDiffPHP, audToPhpRate);
        return isFinite(result) ? result : 0;
    } catch(e) {
        const n = parseFloat(f);
        return isFinite(n) ? n : 0;
    }
}

// =====================================================
// MAIN CALCULATE FUNCTION
// =====================================================
function calculate() {
    const fxRow = getSelectedFXRates();
    if (!fxRow) return; // not loaded yet

    const currency = document.getElementById('currency').value;
    const priceBook = document.getElementById('priceBook').value;
    const hardwareId = document.getElementById('mpcHardware').value;
    const baseSalaryFrom = parseFloat(document.getElementById('baseSalaryFrom').value) || 35000;
    const baseSalaryTo = parseFloat(document.getElementById('baseSalaryTo').value) || baseSalaryFrom;
    const nightDiffHours = parseFloat(document.getElementById('nightDiffHours').value) || 0;
    const nightDiffRate = parseFloat(document.getElementById('nightDiffRate').value) || 0.10;
    const mealId = document.getElementById('nightMealsProduct').value;
    const separationOverride = document.getElementById('separationOverride').value;
    const candidateName = document.getElementById('candidateName').value.trim();
    const roleDisplay = document.getElementById('roleName').value.trim() ||
                        document.getElementById('roleSearchInput').value.trim();

    const isLegacyWFO = LEGACY_WFO.includes(priceBook);
    const excludeSeparation = isLegacyWFO || separationOverride === 'exclude';

    // FX rates: fx_monthly_rates column "php" = how many PHP per 1 AUD
    // e.g. fxRow.php = 41.07 means 1 AUD = 41.07 PHP (so 1 PHP = 1/41.07 AUD)
    //      fxRow.usd = 0.65  means 1 PHP = 0.65 USD?? NO — need to verify other columns
    // For the "php" column specifically: it's PHP per 1 AUD.
    // For other currency columns (usd, gbp etc): these are also "per 1 unit of that currency"
    //   e.g. fxRow.usd = 58.91 means 1 USD = 58.91 PHP
    // So to convert PHP → foreign: divide by fxVal
    // To convert foreign → PHP: multiply by fxVal
    const audToPhp = parseFloat(fxRow.php) || 41;   // 1 AUD = X PHP
    const phpToAud = 1 / audToPhp;                    // 1 PHP = X AUD

    function phpToCurr(phpAmt) {
        if (currency === 'AUD') return phpAmt / audToPhp;
        const fxVal = parseFloat(fxRow[currency.toLowerCase()]) || 1;
        // fxVal = how many PHP per 1 foreign unit, so foreign = PHP / fxVal
        return phpAmt / fxVal;
    }
    function audToCurr(audAmt) {
        if (currency === 'AUD') return audAmt;
        const fxVal = parseFloat(fxRow[currency.toLowerCase()]) || 1;
        // AUD → PHP → foreign: (audAmt × audToPhp) / fxVal
        return (audAmt * audToPhp) / fxVal;
    }

    // Night meals: stored per currency (e.g. AUD price from night_meals table)
    const nightMealsCurrencyVal = getNightMealPrice(mealId, currency);
    // Convert to PHP: foreign amount × fxVal (PHP per 1 foreign unit) = PHP
    const nightMealsPHP = currency === 'AUD'
        ? nightMealsCurrencyVal * audToPhp
        : nightMealsCurrencyVal * (parseFloat(fxRow[currency.toLowerCase()]) || 1);

    function calcForSalary(baseSalary) {
        const hourlyBase = (baseSalary * 12) / 260 / 8;
        const nightDiffPHP = hourlyBase * nightDiffRate * (nightDiffHours * 22);

        // Get benefit values by category name match
        // Priority: DB row formula → DB row fixed value → hardcoded defaultFn
        const getBenefitVal = (nameKey, defaultFn) => {
            const b = calcBenefitsData.find(x =>
                x.name && x.name.toLowerCase().includes(nameKey.toLowerCase())
            );
            if (!b) return defaultFn();

            const bType = (b.type || '').trim().toLowerCase();
            const isFixed = bType === 'fixed';
            const isAUD   = (b.currency || 'PHP').trim().toUpperCase() === 'AUD';
            const formulaStr = (b.formula || '').trim();

            let phpVal;

            if (isFixed) {
                // Fixed PHP or AUD amount
                phpVal = parseFloat(b.value) || 0;
                if (isAUD) phpVal = phpVal * audToPhp;
            } else {
                // Formula row
                if (formulaStr) {
                    const computed = evalBenefit(formulaStr, baseSalary, nightDiffPHP, audToPhp);
                    phpVal = isAUD ? computed * audToPhp : computed;
                } else {
                    // Formula field is blank in DB — fall back to default
                    return defaultFn();
                }
            }

            // If result is still 0 after all the above, trust the hardcoded default
            // (prevents a bad/empty DB row from zeroing out the calculation)
            if (phpVal === 0 && !isFixed) return defaultFn();

            return phpVal;
        };

        const thirteenthMonth = getBenefitVal('13th Month', () => baseSalary / 12);
        const sss = getSSS(baseSalary);
        const phic = getPHIC(baseSalary);
        const hdmf = getBenefitVal('HDMF', () => 200);
        const pension = getBenefitVal('Pension', () => (baseSalary * 12) / 260);
        const riceSubsidy = getBenefitVal('Rice', () => 1500);
        const rawSeparation = getBenefitVal('Separation', () => baseSalary * 0.085);
        const separation = excludeSeparation ? 0 : rawSeparation;
        const hmo = calcHMORate > 0 ? calcHMORate : getBenefitVal('HMO', () => 3366.72);
        const pharmacy = getBenefitVal('Pharmacy', () => 184.73);
        const teamBuilding = getBenefitVal('Team Building', () => 763.56);
        const xmasParty = getBenefitVal('End of Year', () => 763.56);
        // AUD-linked benefits: read the AUD value directly from the DB `value` field.
        // Formula: AUD amount × audToPhp = PHP  →  phpToCurr() or audToCurr() for display.
        // getAUDBenefitAUD() reads b.value as AUD (fixed rows) or evaluates b.formula
        // (formula rows). Falls back to the hardcoded default if the DB row is missing or zero.
        const getAUDBenefitAUD = (nameKey, defaultAUD) => {
            const b = calcBenefitsData.find(x =>
                x.name && x.name.toLowerCase().includes(nameKey.toLowerCase())
            );
            if (!b) return defaultAUD;
            const bType = (b.type || '').trim().toLowerCase();
            let audVal;
            if (bType === 'fixed') {
                audVal = parseFloat(b.value) || 0;
            } else {
                const formulaStr = (b.formula || '').trim();
                audVal = formulaStr ? evalBenefit(formulaStr, baseSalary, nightDiffPHP, audToPhp) : 0;
            }
            // If result is zero, fall back to hardcoded default so display is never $0
            return audVal > 0 ? audVal : defaultAUD;
        };

        const socialClubAUD    = getAUDBenefitAUD('social club', 38);
        const microsoftAUD     = getAUDBenefitAUD('microsoft',   17.5);
        const indemnityAUD     = getAUDBenefitAUD('indemnity',   2.75);
        const comprehensiveAUD = getAUDBenefitAUD('comprehensive', 4.10);

        const uniform = getBenefitVal('Uniform', () => 246.3);
        const cib     = getBenefitVal('CIB',     () => 635);

        // PHP values = AUD amount × live AUD→PHP rate
        const socialClubPHP    = socialClubAUD    * audToPhp;
        const microsoftPHP     = microsoftAUD     * audToPhp;
        const indemnityPHP     = indemnityAUD     * audToPhp;
        const comprehensivePHP = comprehensiveAUD * audToPhp;

        // Category totals (PHP)
        const basicSalaryPHP = baseSalary + nightDiffPHP + nightMealsPHP;
        const govBenefitsPHP = thirteenthMonth + sss + phic + hdmf + pension + riceSubsidy;
        const tenurePHP = separation;
        const csBenefitsPHP = hmo + pharmacy + teamBuilding + xmasParty + socialClubPHP;
        const csCostsPHP = uniform + microsoftPHP + cib + indemnityPHP + comprehensivePHP;
        const edcPHP = basicSalaryPHP + govBenefitsPHP + tenurePHP + csBenefitsPHP + csCostsPHP;

        // Convert to selected currency
        // AUD-linked items: convert from AUD directly (not via PHP) for maximum accuracy
        const bfSocialClub    = audToCurr(socialClubAUD);
        const bfMicrosoft     = audToCurr(microsoftAUD);
        const bfIndemnity     = audToCurr(indemnityAUD);
        const bfComprehensive = audToCurr(comprehensiveAUD);
        const basicSalaryCurr = phpToCurr(baseSalary) + phpToCurr(nightDiffPHP) + nightMealsCurrencyVal;
        const govCurr         = phpToCurr(govBenefitsPHP);
        const tenureCurr      = phpToCurr(tenurePHP);
        const csBenefitsCurr  = phpToCurr(hmo) + phpToCurr(pharmacy) + phpToCurr(teamBuilding) + phpToCurr(xmasParty) + bfSocialClub;
        const csCostsCurr     = phpToCurr(uniform) + bfMicrosoft + phpToCurr(cib) + bfIndemnity + bfComprehensive;
        const edcCurr         = basicSalaryCurr + govCurr + tenureCurr + csBenefitsCurr + csCostsCurr;

        return {
            baseSalary, nightDiffPHP, nightMealsPHP, nightMealsCurrencyVal,
            thirteenthMonth, sss, phic, hdmf, pension, riceSubsidy, separation,
            hmo, pharmacy, teamBuilding, xmasParty,
            socialClubAUD, socialClubPHP, microsoftAUD, microsoftPHP,
            indemnityAUD, indemnityPHP, comprehensiveAUD, comprehensivePHP,
            uniform, cib,
            basicSalaryPHP, govBenefitsPHP, tenurePHP, csBenefitsPHP, csCostsPHP, edcPHP,
            basicSalaryCurr, govCurr, tenureCurr, csBenefitsCurr, csCostsCurr, edcCurr,
            bfSocialClub, bfMicrosoft, bfIndemnity, bfComprehensive, excludeSeparation,
            phpToCurr, audToCurr
        };
    }

    const cFrom = calcForSalary(baseSalaryFrom);
    const cTo = calcForSalary(baseSalaryTo);
    const isRange = baseSalaryFrom !== baseSalaryTo;

    // CS fee sourced from live pbCache (synced from price_books table)
    // Falls back to PRICE_BOOKS constant (hardcoded defaults) if DB not yet loaded
    const pb = pbCache[priceBook] || PRICE_BOOKS[priceBook];
    const csFee = pb ? (pb[currency] || 0) : 0;
    const isElevate = pb ? (pb.is_elevate || pb.isElevate || false) : false;

    const mpcFee = getHardwarePrice(hardwareId, currency, isElevate);
    const setupFee = SETUP_FEES[currency] || 399;

    const totalMonthlyFrom = cFrom.edcCurr + csFee + mpcFee;
    const totalMonthlyTo = cTo.edcCurr + csFee + mpcFee;
    const depositFrom = cFrom.edcCurr + csFee - cFrom.nightMealsCurrencyVal;
    const depositTo = cTo.edcCurr + csFee - cTo.nightMealsCurrencyVal;
    const dayRateFrom = (totalMonthlyFrom * 12) / 260;
    const dayRateTo = (totalMonthlyTo * 12) / 260;
    const easyLeaveFrom = dayRateFrom * 0.958;
    const easyLeaveTo = dayRateTo * 0.958;

    const validDate = new Date();
    validDate.setDate(validDate.getDate() + 30);

    // --- Update DOM ---
    const sel = (id) => document.getElementById(id);

    sel('resultCandidateName').textContent = candidateName || 'To Be Advised';
    sel('resultRoleName').textContent = roleDisplay || 'To Be Advised';
    sel('resultBaseSalary').textContent = isRange
        ? fmtCurr(baseSalaryFrom, 'PHP') + ' to ' + fmtCurr(baseSalaryTo, 'PHP')
        : fmtCurr(baseSalaryFrom, 'PHP');

    sel('resultEDC').textContent = fmtRange(cFrom.edcCurr, cTo.edcCurr, currency);
    sel('resultCSFee').textContent = fmtCurr(csFee, currency);
    sel('resultMPC').textContent = fmtCurr(mpcFee, currency);
    const hwRow = calcHardwareData.find(p => p.id === parseInt(hardwareId));
    sel('resultMPCProduct').textContent = hwRow ? hwRow.name : 'No Hardware';
    sel('resultTotalMonthly').textContent = fmtRange(totalMonthlyFrom, totalMonthlyTo, currency);
    sel('resultSetup').textContent = fmtCurr(setupFee, currency);
    sel('resultDeposit').textContent = fmtRange(depositFrom, depositTo, currency);
    sel('resultEasyLeave').textContent = fmtRange(easyLeaveFrom, easyLeaveTo, currency);
    sel('resultDayRate').textContent = fmtRange(dayRateFrom, dayRateTo, currency);
    sel('resultHourlyRate').textContent = fmtRange(dayRateFrom/8, dayRateTo/8, currency);
    sel('quoteValidity').textContent = validDate.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

    // FX tile
    if (currency === 'AUD') {
        sel('resultFXRate').textContent = `1 PHP = ${phpToAud.toFixed(6)} AUD`;
        sel('resultFXDesc').textContent = `1 AUD = ${audToPhp.toFixed(4)} PHP`;
    } else {
        const fxVal = parseFloat(fxRow[currency.toLowerCase()]) || 1;
        // fxVal = PHP per 1 foreign unit, so 1 PHP = 1/fxVal foreign
        sel('resultFXRate').textContent = `1 PHP = ${(1/fxVal).toFixed(6)} ${currency}`;
        sel('resultFXDesc').textContent = `1 ${currency} = ${fxVal.toFixed(4)} PHP`;
    }
    sel('resultFXDate').textContent = fxRow.month_name || '';
    sel('benefitsCurrencyHeader').textContent = currency;

    // EDC tiles
    sel('edcBasicSalary').textContent = fmtRange(cFrom.basicSalaryCurr, cTo.basicSalaryCurr, currency);
    sel('edcBasicSalaryPHP').textContent = fmtRange(cFrom.basicSalaryPHP, cTo.basicSalaryPHP, 'PHP');
    sel('edcGovBenefits').textContent = fmtRange(cFrom.govCurr, cTo.govCurr, currency);
    sel('edcGovBenefitsPHP').textContent = fmtRange(cFrom.govBenefitsPHP, cTo.govBenefitsPHP, 'PHP');
    sel('edcTenure').textContent = fmtRange(cFrom.tenureCurr, cTo.tenureCurr, currency);
    sel('edcTenurePHP').textContent = fmtRange(cFrom.tenurePHP, cTo.tenurePHP, 'PHP');
    const td = sel('edcTenureDesc');
    if (excludeSeparation) {
        td.textContent = 'Monthly PAYG Separation Benefits DISABLED. Client pays all Separation costs on Disengagement.';
        td.style.color = '#dc2626';
    } else {
        td.textContent = '8.5% Monthly accrual of base salary for Separation Costs';
        td.style.color = '';
    }
    sel('edcCSBenefits').textContent = fmtRange(cFrom.csBenefitsCurr, cTo.csBenefitsCurr, currency);
    sel('edcCSBenefitsPHP').textContent = fmtRange(cFrom.csBenefitsPHP, cTo.csBenefitsPHP, 'PHP');
    sel('edcCSCosts').textContent = fmtRange(cFrom.csCostsCurr, cTo.csCostsCurr, currency);
    sel('edcCSCostsPHP').textContent = fmtRange(cFrom.csCostsPHP, cTo.csCostsPHP, 'PHP');
    sel('edcGrandTotal').textContent = fmtRange(cFrom.edcCurr, cTo.edcCurr, currency);
    sel('edcGrandTotalPHP').textContent = fmtRange(cFrom.edcPHP, cTo.edcPHP, 'PHP');

    // Detailed breakdown (use From values)
    const c = cFrom;
    sel('bfBaseSalaryPHP').textContent = fmtRange(cFrom.baseSalary, cTo.baseSalary, 'PHP');
    sel('bfNightDiffPHP').textContent = fmtRange(cFrom.nightDiffPHP, cTo.nightDiffPHP, 'PHP');
    sel('bfNightMealsPHP').textContent = fmtCurr(c.nightMealsPHP, 'PHP');
    sel('bfBasicSalarySubPHP').textContent = fmtRange(cFrom.basicSalaryPHP, cTo.basicSalaryPHP, 'PHP');
    sel('bfBaseSalary').textContent = fmtRange(cFrom.phpToCurr(cFrom.baseSalary), cTo.phpToCurr(cTo.baseSalary), currency);
    sel('bfNightDiff').textContent = fmtRange(cFrom.phpToCurr(cFrom.nightDiffPHP), cTo.phpToCurr(cTo.nightDiffPHP), currency);
    sel('bfNightMeals').textContent = fmtCurr(c.nightMealsCurrencyVal, currency);
    sel('bfBasicSalarySub').textContent = fmtRange(cFrom.basicSalaryCurr, cTo.basicSalaryCurr, currency);
    sel('bf13thMonthPHP').textContent = fmtRange(cFrom.thirteenthMonth, cTo.thirteenthMonth, 'PHP');
    sel('bfSSSPHP').textContent = fmtRange(cFrom.sss, cTo.sss, 'PHP');
    sel('bfPHICPHP').textContent = fmtRange(cFrom.phic, cTo.phic, 'PHP');
    sel('bfHDMFPHP').textContent = fmtRange(cFrom.hdmf, cTo.hdmf, 'PHP');
    sel('bfPensionPHP').textContent = fmtRange(cFrom.pension, cTo.pension, 'PHP');
    sel('bfRicePHP').textContent = fmtRange(cFrom.riceSubsidy, cTo.riceSubsidy, 'PHP');
    sel('bfGovBenefitsSubPHP').textContent = fmtRange(cFrom.govBenefitsPHP, cTo.govBenefitsPHP, 'PHP');
    sel('bf13thMonth').textContent = fmtRange(cFrom.phpToCurr(cFrom.thirteenthMonth), cTo.phpToCurr(cTo.thirteenthMonth), currency);
    sel('bfSSS').textContent = fmtRange(cFrom.phpToCurr(cFrom.sss), cTo.phpToCurr(cTo.sss), currency);
    sel('bfPHIC').textContent = fmtRange(cFrom.phpToCurr(cFrom.phic), cTo.phpToCurr(cTo.phic), currency);
    sel('bfHDMF').textContent = fmtRange(cFrom.phpToCurr(cFrom.hdmf), cTo.phpToCurr(cTo.hdmf), currency);
    sel('bfPension').textContent = fmtRange(cFrom.phpToCurr(cFrom.pension), cTo.phpToCurr(cTo.pension), currency);
    sel('bfRice').textContent = fmtRange(cFrom.phpToCurr(cFrom.riceSubsidy), cTo.phpToCurr(cTo.riceSubsidy), currency);
    sel('bfGovBenefitsSub').textContent = fmtRange(cFrom.govCurr, cTo.govCurr, currency);
    sel('bfSeparationPHP').textContent = fmtRange(cFrom.separation, cTo.separation, 'PHP');
    sel('bfTenureSubPHP').textContent = fmtRange(cFrom.tenurePHP, cTo.tenurePHP, 'PHP');
    sel('bfSeparation').textContent = fmtRange(cFrom.phpToCurr(cFrom.separation), cTo.phpToCurr(cTo.separation), currency);
    sel('bfTenureSub').textContent = fmtRange(cFrom.tenureCurr, cTo.tenureCurr, currency);
    sel('bfHMOPHP').textContent = fmtRange(cFrom.hmo, cTo.hmo, 'PHP');
    sel('bfPharmacyPHP').textContent = fmtRange(cFrom.pharmacy, cTo.pharmacy, 'PHP');
    sel('bfTeamBuildingPHP').textContent = fmtRange(cFrom.teamBuilding, cTo.teamBuilding, 'PHP');
    sel('bfXMASPHP').textContent = fmtRange(cFrom.xmasParty, cTo.xmasParty, 'PHP');
    sel('bfSocialClubPHP').textContent = fmtRange(cFrom.socialClubPHP, cTo.socialClubPHP, 'PHP');
    sel('bfCSBenefitsSubPHP').textContent = fmtRange(cFrom.csBenefitsPHP, cTo.csBenefitsPHP, 'PHP');
    sel('bfHMO').textContent = fmtRange(cFrom.phpToCurr(cFrom.hmo), cTo.phpToCurr(cTo.hmo), currency);
    sel('bfPharmacy').textContent = fmtRange(cFrom.phpToCurr(cFrom.pharmacy), cTo.phpToCurr(cTo.pharmacy), currency);
    sel('bfTeamBuilding').textContent = fmtRange(cFrom.phpToCurr(cFrom.teamBuilding), cTo.phpToCurr(cTo.teamBuilding), currency);
    sel('bfXMAS').textContent = fmtRange(cFrom.phpToCurr(cFrom.xmasParty), cTo.phpToCurr(cTo.xmasParty), currency);
    sel('bfSocialClub').textContent = fmtRange(cFrom.bfSocialClub, cTo.bfSocialClub, currency);
    sel('bfCSBenefitsSub').textContent = fmtRange(cFrom.csBenefitsCurr, cTo.csBenefitsCurr, currency);
    sel('bfUniformPHP').textContent = fmtRange(cFrom.uniform, cTo.uniform, 'PHP');
    sel('bfMicrosoftPHP').textContent = fmtRange(cFrom.microsoftPHP, cTo.microsoftPHP, 'PHP');
    sel('bfCIBPHP').textContent = fmtRange(cFrom.cib, cTo.cib, 'PHP');
    sel('bfIndemnityPHP').textContent = fmtRange(cFrom.indemnityPHP, cTo.indemnityPHP, 'PHP');
    sel('bfComprehensivePHP').textContent = fmtRange(cFrom.comprehensivePHP, cTo.comprehensivePHP, 'PHP');
    sel('bfCSCostsSubPHP').textContent = fmtRange(cFrom.csCostsPHP, cTo.csCostsPHP, 'PHP');
    sel('bfUniform').textContent = fmtRange(cFrom.phpToCurr(cFrom.uniform), cTo.phpToCurr(cTo.uniform), currency);
    sel('bfMicrosoft').textContent = fmtRange(cFrom.bfMicrosoft, cTo.bfMicrosoft, currency);
    sel('bfCIB').textContent = fmtRange(cFrom.phpToCurr(cFrom.cib), cTo.phpToCurr(cTo.cib), currency);
    sel('bfIndemnity').textContent = fmtRange(cFrom.bfIndemnity, cTo.bfIndemnity, currency);
    sel('bfComprehensive').textContent = fmtRange(cFrom.bfComprehensive, cTo.bfComprehensive, currency);
    sel('bfCSCostsSub').textContent = fmtRange(cFrom.csCostsCurr, cTo.csCostsCurr, currency);
    sel('bfTotalPHP').textContent = fmtRange(cFrom.edcPHP, cTo.edcPHP, 'PHP');
    sel('bfTotal').textContent = fmtRange(cFrom.edcCurr, cTo.edcCurr, currency);
}

// =====================================================
// NIGHT MEALS / SEPARATION DEFAULTS
// =====================================================
function onPriceBookChange() {
    const priceBook = document.getElementById('priceBook').value;
    const isLegacy = LEGACY_WFO.includes(priceBook);
    if (isLegacy) {
        document.getElementById('separationOverride').value = 'exclude';
    } else {
        document.getElementById('separationOverride').value = 'include';
    }
    updateNightMealsDefault();
}

function updateNightMealsDefault() {
    const priceBook = document.getElementById('priceBook').value;
    const nightHours = parseInt(document.getElementById('nightDiffHours').value) || 0;
    const isWFO = priceBook.includes('WFO') || priceBook.includes('CS Now WFO');
    const sel = document.getElementById('nightMealsProduct');
    if (isWFO && nightHours > 0 && sel && calcNightMealsData.length > 1) {
        // Select Planet Yum Level A Standard (index 1 usually)
        const levelA = calcNightMealsData.find(m => m.name && m.name.toLowerCase().includes('level a'));
        if (levelA) sel.value = levelA.id;
    } else if (sel && calcNightMealsData.length > 0) {
        const noMeals = calcNightMealsData.find(m => m.name && m.name.toLowerCase().includes('no night'));
        if (noMeals) sel.value = noMeals.id;
    }
    calculate();
}

// =====================================================
// ROLE SEARCH
// =====================================================

// ── Populate category browse dropdown from loaded salary data ──
function populateRoleBrowseCategories() {
    const sel = document.getElementById('roleBrowseCategory');
    if (!sel || !salaryAllData || !salaryAllData.length) return;
    const cats = [...new Set(salaryAllData.map(d => d.category).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">Browse by Category…</option>' +
        cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

// ── Category selected → populate role dropdown ──
function onRoleCategoryChange() {
    const cat = document.getElementById('roleBrowseCategory').value;
    const roleSelect = document.getElementById('roleBrowseRole');

    if (!cat) {
        roleSelect.innerHTML = '<option value="">Select role…</option>';
        roleSelect.classList.remove('visible');
        return;
    }

    // Filter roles for this category, sorted by JPID then job title
    const roles = (salaryAllData || [])
        .filter(r => r.category === cat)
        .sort((a, b) => {
            const aj = a.jpid_level || '', bj = b.jpid_level || '';
            return aj.localeCompare(bj) || a.job_title.localeCompare(b.job_title);
        });

    roleSelect.innerHTML = '<option value="">Select role…</option>' +
        roles.map(r => {
            const label = r.jpid_level ? `${r.jpid_level} — ${r.job_title}` : r.job_title;
            const exp   = r.years_experience ? ` (${r.years_experience})` : '';
            return `<option value="${r.id}" data-title="${r.job_title}">${label}${exp}</option>`;
        }).join('');

    roleSelect.classList.add('visible');
}

// ── Role selected from browse dropdown ──
function onRoleBrowseSelect() {
    const roleSelect = document.getElementById('roleBrowseRole');
    const id = parseInt(roleSelect.value);
    if (!id) return;

    const role = (salaryAllData || []).find(r => r.id === id);
    if (!role) return;

    // Clear the text search so there's no conflict
    document.getElementById('roleSearchInput').value = '';
    document.getElementById('roleDropdown').classList.remove('open');

    selectRole(role);
}

async function onRoleSearch() {
    const q = document.getElementById('roleSearchInput').value.trim();
    clearTimeout(roleSearchTimeout);
    if (q.length < 2) {
        document.getElementById('roleDropdown').classList.remove('open');
        return;
    }
    // Clear browse selects when user types in search
    document.getElementById('roleBrowseCategory').value = '';
    document.getElementById('roleBrowseRole').innerHTML = '<option value="">Select role…</option>';
    document.getElementById('roleBrowseRole').classList.remove('visible');

    roleSearchTimeout = setTimeout(async () => {
        try {
            const { data, error } = await supabaseClient
                .from('salary_ranges')
                .select('id, job_title, jpid_level, category, years_experience, low_salary, median_salary, high_salary, conf_low, conf_median, conf_high')
                .eq('market', 'PH')
                .ilike('job_title', `%${q}%`)
                .limit(15);
            if (error) throw error;
            showRoleDropdown(data || []);
        } catch(e) { console.error('Role search error:', e); }
    }, 300);
}

function showRoleDropdown(roles) {
    const dd = document.getElementById('roleDropdown');
    if (!roles.length) { dd.classList.remove('open'); return; }
    dd.innerHTML = '';
    roles.forEach(role => {
        const div = document.createElement('div');
        div.className = 'role-option';
        const jpid = role.jpid_level ? `<span style="font-family:'Space Mono',monospace;font-size:0.68rem;color:var(--text-muted);margin-right:0.35rem;">${role.jpid_level}</span>` : '';
        div.innerHTML = `
            <div class="ro-title">${jpid}${role.job_title}</div>
            <div class="ro-meta">${role.category} · ${role.years_experience || ''}</div>
            <div class="ro-salary">₱${role.low_salary != null ? Number(role.low_salary).toLocaleString() : '—'} – ₱${role.median_salary != null ? Number(role.median_salary).toLocaleString() : '—'} – ₱${role.high_salary != null ? Number(role.high_salary).toLocaleString() : '—'}</div>
        `;
        div.addEventListener('click', () => selectRole(role));
        dd.appendChild(div);
    });
    dd.classList.add('open');
}

function buildSalaryHintPH(role) {
    const fmt   = n => n != null ? '₱' + Number(n).toLocaleString() : '—';
    const confBadge = (c, label) => {
        if (!c) return `<span style="color:var(--text-muted);font-size:0.72rem;">${label}: —</span>`;
        const col = c === 'High' ? '#22c55e' : c === 'Medium' ? '#f59e0b' : '#ef4444';
        return `<span style="font-size:0.72rem;">${label}: <strong style="color:${col};">${c}</strong></span>`;
    };
    return `
        <div style="font-size:0.78rem;font-weight:600;margin-bottom:0.35rem;color:var(--text-muted);">Salary range from database:</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.4rem;">
            <div style="background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:0.35rem 0.5rem;">
                <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:0.15rem;">25th percentile (Low)</div>
                <div style="font-family:'Space Mono',monospace;font-weight:600;font-size:0.82rem;">${fmt(role.low_salary)}</div>
                <div style="margin-top:0.15rem;">${confBadge(role.conf_low, 'Conf')}</div>
            </div>
            <div style="background:var(--bg);border:2px solid var(--accent);border-radius:5px;padding:0.35rem 0.5rem;">
                <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:0.15rem;">50th percentile (Median)</div>
                <div style="font-family:'Space Mono',monospace;font-weight:600;font-size:0.82rem;">${fmt(role.median_salary)}</div>
                <div style="margin-top:0.15rem;">${confBadge(role.conf_median, 'Conf')}</div>
            </div>
            <div style="background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:0.35rem 0.5rem;">
                <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:0.15rem;">75th percentile (High)</div>
                <div style="font-family:'Space Mono',monospace;font-weight:600;font-size:0.82rem;">${fmt(role.high_salary)}</div>
                <div style="margin-top:0.15rem;">${confBadge(role.conf_high, 'Conf')}</div>
            </div>
        </div>`;
}

function selectRole(role) {
    document.getElementById('roleSearchInput').value = role.job_title;
    document.getElementById('selectedRoleId').value = role.id;
    if (document.getElementById('selectedRoleYears')) document.getElementById('selectedRoleYears').value = role.years_experience || '';
    document.getElementById('roleDropdown').classList.remove('open');
    // Auto-fill salary with low/high
    document.getElementById('baseSalaryFrom').value = role.low_salary || role.median_salary;
    document.getElementById('baseSalaryTo').value = role.high_salary || role.median_salary;
    // Show pill
    const jpidPrefix = role.jpid_level ? `${role.jpid_level} — ` : '';
    const pill = document.getElementById('selectedRolePill');
    pill.innerHTML = `<span>${jpidPrefix}${role.job_title}</span><span class="role-pill-clear" onclick="clearSelectedRole()">×</span>`;
    pill.classList.remove('hidden');
    // Show salary hint with confidence levels
    const hint = document.getElementById('salaryRangeHint');
    hint.innerHTML = buildSalaryHintPH(role);
    hint.style.display = 'block';
    calculate();
}

function clearSelectedRole() {
    document.getElementById('roleSearchInput').value = '';
    document.getElementById('selectedRoleId').value = '';
    if (document.getElementById('selectedRoleYears')) document.getElementById('selectedRoleYears').value = '';
    document.getElementById('selectedRolePill').classList.add('hidden');
    document.getElementById('salaryRangeHint').style.display = 'none';
    // Also reset browse dropdowns
    document.getElementById('roleBrowseCategory').value = '';
    document.getElementById('roleBrowseRole').innerHTML = '<option value="">Select role…</option>';
    document.getElementById('roleBrowseRole').classList.remove('visible');
    calculate();
}

// Close role dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.role-search-wrapper')) {
        document.getElementById('roleDropdown')?.classList.remove('open');
    }
});

// =====================================================
// NEW QUOTE / LOAD QUOTE
// =====================================================
function newQuote() {
    currentEditingQuoteId = null;
    document.getElementById('candidateName').value = '';
    document.getElementById('roleSearchInput').value = '';
    document.getElementById('selectedRoleId').value = '';
    document.getElementById('selectedRolePill').classList.add('hidden');
    document.getElementById('salaryRangeHint').style.display = 'none';
    document.getElementById('roleName').value = '';
    // Reset category/role browse dropdowns
    document.getElementById('roleBrowseCategory').value = '';
    document.getElementById('roleBrowseRole').innerHTML = '<option value="">Select role…</option>';
    document.getElementById('roleBrowseRole').classList.remove('visible');
    document.getElementById('baseSalaryFrom').value = 35000;
    document.getElementById('baseSalaryTo').value = 45000;
    document.getElementById('currency').value = 'AUD';
    document.getElementById('priceBook').value = 'Current ELEVATE WFH';
    document.getElementById('nightDiffHours').value = '0';
    document.getElementById('nightDiffRate').value = '0.10';
    document.getElementById('separationOverride').value = 'include';
    if (calcNightMealsData.length > 0) {
        const noMeals = calcNightMealsData.find(m => m.name && m.name.toLowerCase().includes('no night'));
        if (noMeals) document.getElementById('nightMealsProduct').value = noMeals.id;
    }
    const saveBtn = document.getElementById('saveQuoteBtn');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1'; saveBtn.style.cursor = 'pointer'; saveBtn.title = ''; }
    hideEditingBanner();
    // Switch to calculator page
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('[data-page="calculator"]').classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-calculator').classList.add('active');
    calculate();
}

function loadQuoteIntoCalc(quote) {
    currentEditingQuoteId = quote.id;
    document.getElementById('candidateName').value = quote.candidate_name || '';
    document.getElementById('roleSearchInput').value = quote.role_name || '';
    document.getElementById('roleName').value = quote.custom_role_name || '';
    document.getElementById('baseSalaryFrom').value = quote.base_salary_from || 35000;
    document.getElementById('baseSalaryTo').value = quote.base_salary_to || 35000;
    document.getElementById('currency').value = quote.currency || 'AUD';
    document.getElementById('priceBook').value = quote.price_book || 'Current ELEVATE WFH';
    document.getElementById('nightDiffHours').value = quote.night_diff_hours || '0';
    document.getElementById('nightDiffRate').value = quote.night_diff_rate || '0.10';
    document.getElementById('separationOverride').value = quote.separation_override || 'include';
    // FX
    if (quote.fx_month_id) {
        const sel = document.getElementById('exchangeRateDate');
        const opt = Array.from(sel.options).find(o => o.value == quote.fx_month_id);
        if (opt) sel.value = quote.fx_month_id;
    }
    // Hardware
    if (quote.hardware_id) {
        const sel = document.getElementById('mpcHardware');
        const opt = Array.from(sel.options).find(o => o.value == quote.hardware_id);
        if (opt) sel.value = quote.hardware_id;
    }
    // Meals
    if (quote.night_meal_id) {
        const sel = document.getElementById('nightMealsProduct');
        const opt = Array.from(sel.options).find(o => o.value == quote.night_meal_id);
        if (opt) sel.value = quote.night_meal_id;
    }
    // Check save permissions
    const isOwner = currentUser && (currentUser.name === quote.created_by || currentUser.email === quote.created_by);
    const isAdmin = currentUser && currentUser.role === 'Admin';
    const canSave = isAdmin || isOwner;
    const saveBtn = document.getElementById('saveQuoteBtn');
    if (saveBtn) {
        saveBtn.disabled = !canSave;
        saveBtn.style.opacity = canSave ? '1' : '0.5';
        saveBtn.style.cursor = canSave ? 'pointer' : 'not-allowed';
        saveBtn.title = canSave ? '' : 'You can only save quotes you created';
    }
    showEditingBanner(quote.quote_name, quote.quote_number);
    // Switch to calculator
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('[data-page="calculator"]').classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-calculator').classList.add('active');
    calculate();
}

function showEditingBanner(quoteName, qqNumber) {
    document.getElementById('editingBanner').classList.remove('hidden');
    document.getElementById('editingQuoteName').textContent = quoteName || '--';
    document.getElementById('editingQuoteNumber').textContent = qqNumber || '--';
}

function hideEditingBanner() {
    document.getElementById('editingBanner').classList.add('hidden');
}

// =====================================================
// SAVE QUOTE (Supabase)
// =====================================================
function showSaveQuoteModal() {
    const modal = document.getElementById('saveQuoteModal');
    modal.classList.add('active');
    modal.setAttribute('data-market', 'PH');

    // Auto-generate quote name from logged-in user + role
    const userName = currentUser ? (currentUser.name || currentUser.email || 'Unknown') : 'Unknown';
    const roleName = document.getElementById('roleSearchInput')?.value?.trim()
                  || document.getElementById('roleName')?.value?.trim()
                  || 'To Be Advised';
    const autoName = `${userName} — ${roleName}`;
    document.getElementById('quoteNamePreview').textContent = autoName;

    if (currentEditingQuoteId) {
        const existing = allQuotesData.find(q => q.id === currentEditingQuoteId);
        document.getElementById('quoteDescription').value = existing ? (existing.description || '') : '';
    } else {
        document.getElementById('quoteDescription').value = '';
    }
    setTimeout(() => document.getElementById('quoteDescription').focus(), 100);
}

function hideSaveQuoteModal() {
    const modal = document.getElementById('saveQuoteModal');
    modal.classList.remove('active');
    modal.removeAttribute('data-market');
}

function saveQuoteRouter() {
    const modal = document.getElementById('saveQuoteModal');
    const market = modal.getAttribute('data-market');
    if (market === 'CO') {
        saveQuoteCO();
    } else if (market === 'IN') {
        saveQuoteIN();
    } else {
        saveQuote();
    }
}

async function saveQuote() {
    const quoteName = document.getElementById('quoteNamePreview').textContent.trim()
                   || (currentUser ? (currentUser.name || currentUser.email) : 'Unknown') + ' — To Be Advised';
    const description = document.getElementById('quoteDescription').value.trim();

    const quoteData = {
        market: 'PH',
        quote_name: quoteName,
        description: description || null,
        candidate_name: document.getElementById('candidateName').value || 'To Be Advised',
        role_name: document.getElementById('roleSearchInput').value || document.getElementById('roleName').value || 'To Be Advised',
        custom_role_name: document.getElementById('roleName').value || null,
        base_salary_from: parseFloat(document.getElementById('baseSalaryFrom').value) || 35000,
        base_salary_to: parseFloat(document.getElementById('baseSalaryTo').value) || 35000,
        currency: document.getElementById('currency').value,
        price_book: document.getElementById('priceBook').value,
        night_diff_hours: parseInt(document.getElementById('nightDiffHours').value) || 0,
        night_diff_rate: parseFloat(document.getElementById('nightDiffRate').value) || 0.10,
        separation_override: document.getElementById('separationOverride').value,
        fx_month_id: parseInt(document.getElementById('exchangeRateDate').value) || null,
        hardware_id: parseInt(document.getElementById('mpcHardware').value) || null,
        night_meal_id: parseInt(document.getElementById('nightMealsProduct').value) || null,
        edc_amount:      parseFloat(document.getElementById('resultEDC').textContent.replace(/[^0-9.-]/g,'')) || null,
        edc_amount_to:   (() => { const t = document.getElementById('resultEDC').textContent; const m = t.match(/[\d,]+\.?\d*/g); return m && m.length > 1 ? parseFloat(m[m.length-1].replace(/,/g,'')) : null; })(),
        mpc_amount:      parseFloat(document.getElementById('resultMPC').textContent.replace(/[^0-9.-]/g,'')) || null,
        mpc_name:        (() => { const s = document.getElementById('mpcHardware'); return s && s.selectedIndex >= 0 ? s.options[s.selectedIndex].text : null; })(),
        mgmt_fee_amount: parseFloat(document.getElementById('resultCSFee').textContent.replace(/[^0-9.-]/g,'')) || null,
        setup_fee_amount: parseFloat(document.getElementById('resultSetup').textContent.replace(/[^0-9.-]/g,'')) || null,
        total_monthly: document.getElementById('resultTotalMonthly').textContent,
        total_monthly_to: (() => { const t = document.getElementById('resultTotalMonthly').textContent; const m = t.match(/[\d,]+\.?\d*/g); return m && m.length > 1 ? parseFloat(m[m.length-1].replace(/,/g,'')) : null; })(),
        years_experience: document.getElementById('selectedRoleYears')?.value || null,
        created_by: currentUser ? (currentUser.name || currentUser.email || 'Unknown') : 'Unknown',
    };

    try {
        if (currentEditingQuoteId) {
            // Update existing
            quoteData.updated_at = new Date().toISOString();
            const { error } = await supabaseClient
                .from('quotes')
                .update(quoteData)
                .eq('id', currentEditingQuoteId);
            if (error) throw error;
            hideSaveQuoteModal();
            hideEditingBanner();
            await loadQuotes();
            alert(`Quote updated: ${quoteName}`);
        } else {
            // Generate QQ number
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
        console.error('Save quote error:', e);
        alert('Error saving quote: ' + e.message);
    }
}

