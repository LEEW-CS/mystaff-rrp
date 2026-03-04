// =====================================================
// BENEFITS ADMIN — MARKET STATE
// =====================================================
let currentBenefitsMarket = 'PH';

const BENEFIT_CATEGORIES = [
    { name: 'Monthly Base Salary',          key: 'base' },
    { name: 'Monthly Government Benefits',  key: 'gov' },
    { name: 'Monthly Tenure Costs',         key: 'tenure' },
    { name: 'Monthly Cloudstaffer Benefits',key: 'cs-benefits' },
    { name: 'Monthly Cloudstaffer Costs',   key: 'cs-costs' }
];

// Cached data for editBenefit lookups
let benefitsCache = [];

function catKey(categoryName) {
    const match = BENEFIT_CATEGORIES.find(c => c.name === categoryName);
    return match ? match.key : 'base';
}

function fmtPHP(v) {
    return '₱' + Number(v).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtLocalCurrency(v, currency) {
    const symbols = { PHP: '₱', COP: 'COP ', INR: '₹', KES: 'KES ' };
    const sym = symbols[currency] || currency + ' ';
    return sym + Number(v).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MARKET_LABELS = {
    PH: { flag: '🇵🇭', name: 'Philippines', currency: 'PHP', hint: 'Benefits in PHP. Formulas use <code>baseSalary</code> (monthly PHP).' },
    CO: { flag: '🌎', name: 'Colombia', currency: 'COP', hint: 'Benefits in COP. Formulas use <code>baseSalary</code> (monthly COP), <code>nightDiffHours</code>, <code>nightDiffRate</code>.' },
    IN: { flag: '🇮🇳', name: 'India', currency: 'INR', hint: 'Benefits in INR. Formulas use <code>baseSalary</code> (monthly INR).' },
    KE: { flag: '🇰🇪', name: 'Kenya', currency: 'KES', hint: 'Benefits in KES. Formulas use <code>baseSalary</code> (monthly KES).' },
};

function switchBenefitsMarket(market) {
    currentBenefitsMarket = market;
    // Update tab styling
    ['PH','CO','IN','KE'].forEach(m => {
        const btn = document.getElementById('benefitsTab' + m);
        if (btn) btn.className = 'btn btn-sm ' + (m === market ? 'btn-primary' : 'btn-secondary');
    });
    // Update info banner
    const ml = MARKET_LABELS[market];
    document.getElementById('benefitsMarketLabel').innerHTML =
        `<strong>${ml.flag} ${ml.name}</strong> — ${ml.hint}`;
    loadBenefits();
}

async function loadBenefits() {
    try {
        const { data, error } = await supabaseClient
            .from('benefits_config')
            .select('*')
            .eq('market', currentBenefitsMarket)
            .order('sort_order');

        if (error) throw error;

        benefitsCache = data || [];
        const localCurr = MARKET_LABELS[currentBenefitsMarket]?.currency || 'PHP';

        // Clear all tbodies
        BENEFIT_CATEGORIES.forEach(cat => {
            document.getElementById('benefitsBody-' + cat.key).innerHTML =
                '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No benefits in this category.</td></tr>';
        });

        if (data.length === 0) return;

        // Group by category
        const groups = {};
        BENEFIT_CATEGORIES.forEach(c => { groups[c.name] = []; });
        data.forEach(item => {
            if (groups[item.category] !== undefined) {
                groups[item.category].push(item);
            } else {
                groups['Monthly Base Salary'].push(item);
            }
        });

        // Render each group
        BENEFIT_CATEGORIES.forEach(cat => {
            const tbody = document.getElementById('benefitsBody-' + cat.key);
            const items = groups[cat.name];
            if (items.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No benefits in this category yet.</td></tr>';
                return;
            }
            tbody.innerHTML = items.map((item, i) => {
                const hasFormulaExpr = item.formula_expression && item.formula_expression !== '0' && item.formula_expression !== String(item.value);
                const isStatic = !hasFormulaExpr && (item.type === 'fixed' || item.type === 'static');
                let valuePill;
                if (isStatic) {
                    valuePill = `<span style="display:inline-block;background:#dcfce7;color:#166534;padding:0.2rem 0.6rem;border-radius:4px;font-size:0.78rem;font-weight:600;">${fmtLocalCurrency(item.value, localCurr)}</span>`;
                } else if (hasFormulaExpr) {
                    valuePill = `<code style="display:inline-block;background:#ede9fe;color:#5b21b6;padding:0.2rem 0.6rem;border-radius:4px;font-size:0.72rem;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(item.formula_expression||'').replace(/"/g,'&quot;')}">${item.formula_expression}</code>`;
                } else {
                    valuePill = `<code style="display:inline-block;background:#ede9fe;color:#5b21b6;padding:0.2rem 0.6rem;border-radius:4px;font-size:0.78rem;">${item.formula || item.description || '-'}</code>`;
                }
                return `<tr>
                    <td style="color:var(--text-muted);width:36px;">${i + 1}</td>
                    <td><strong>${item.name}</strong></td>
                    <td style="font-size:0.82rem;color:var(--text-muted);font-style:italic;">${item.description || '-'}</td>
                    <td>${valuePill}</td>
                    <td class="actions">
                        <button class="btn btn-secondary btn-sm" onclick="editBenefit(${item.id})">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteBenefit(${item.id})">Delete</button>
                    </td>
                </tr>`;
            }).join('');
        });

    } catch (error) {
        console.error('Error loading benefits:', error);
        document.getElementById('benefitsStatus').innerHTML = `<div class="status-message error">Error loading benefits: ${error.message}</div>`;
    }
}

// Toggle static/formula UI in add or edit modal
function setBenefitValueType(mode, type) {
    const prefix = mode === 'add' ? 'new' : 'edit';
    const isStatic = type === 'static';
    document.getElementById(prefix + 'StaticRow').style.display  = isStatic ? '' : 'none';
    document.getElementById(prefix + 'FormulaRow').style.display = isStatic ? 'none' : '';
    document.getElementById(prefix + 'TypeStaticBtn').className  = 'btn btn-sm ' + (isStatic ? 'btn-primary' : 'btn-secondary');
    document.getElementById(prefix + 'TypeFormulaBtn').className = 'btn btn-sm ' + (isStatic ? 'btn-secondary' : 'btn-primary');
    document.getElementById(prefix + 'TypeStaticBtn').style.flex = '1';
    document.getElementById(prefix + 'TypeFormulaBtn').style.flex = '1';
}

function showAddBenefitModal(defaultCategory) {
    document.getElementById('newBenefitCategory').value = defaultCategory || 'Monthly Government Benefits';
    document.getElementById('newBenefitName').value    = '';
    document.getElementById('newBenefitDesc').value    = '';
    document.getElementById('newBenefitValue').value   = '';
    document.getElementById('newBenefitFormula').value = '';
    // Update static value label to show current market currency
    const localCurr = MARKET_LABELS[currentBenefitsMarket]?.currency || 'PHP';
    const staticLabel = document.querySelector('#newStaticRow label');
    if (staticLabel) staticLabel.textContent = localCurr + ' Amount';
    const staticBtn = document.getElementById('newTypeStaticBtn');
    if (staticBtn) staticBtn.textContent = '$ Static Value (' + localCurr + ')';
    setBenefitValueType('add', 'static');
    document.getElementById('addBenefitModal').classList.add('active');
}

async function addBenefit() {
    const category    = document.getElementById('newBenefitCategory').value;
    const name        = document.getElementById('newBenefitName').value.trim();
    const description = document.getElementById('newBenefitDesc').value.trim();
    const isStatic    = document.getElementById('newStaticRow').style.display !== 'none';
    const value       = isStatic ? (parseFloat(document.getElementById('newBenefitValue').value) || 0) : 0;
    const formula     = !isStatic ? document.getElementById('newBenefitFormula').value.trim() : null;
    const type        = isStatic ? 'fixed' : 'formula';
    const localCurr   = MARKET_LABELS[currentBenefitsMarket]?.currency || 'PHP';
    const formulaExpr = isStatic ? String(value) : (formula || '0');

    if (!name) { alert('Benefit name is required'); return; }

    try {
        const { error } = await supabaseClient
            .from('benefits_config')
            .insert([{ market: currentBenefitsMarket, category, name, type, value, formula, formula_expression: formulaExpr, currency: localCurr, local_currency: localCurr, description, sort_order: 99 }]);

        if (error) throw error;

        hideModal('addBenefitModal');
        loadBenefits();
        document.getElementById('benefitsStatus').innerHTML = `<div class="status-message success">Benefit "${name}" added successfully!</div>`;
        setTimeout(() => document.getElementById('benefitsStatus').innerHTML = '', 3000);

    } catch (error) {
        console.error('Error adding benefit:', error);
        alert('Error adding benefit: ' + error.message);
    }
}

async function deleteBenefit(id) {
    if (!confirm('Are you sure you want to delete this benefit?')) return;

    try {
        const { error } = await supabaseClient
            .from('benefits_config')
            .delete()
            .eq('id', id);

        if (error) throw error;

        loadBenefits();
        document.getElementById('benefitsStatus').innerHTML = `<div class="status-message success">Benefit deleted successfully!</div>`;
        setTimeout(() => document.getElementById('benefitsStatus').innerHTML = '', 3000);

    } catch (error) {
        console.error('Error deleting benefit:', error);
        alert('Error deleting benefit: ' + error.message);
    }
}

async function editBenefit(id) {
    // Try cache first, fall back to fresh fetch
    let data = benefitsCache.find(b => b.id === id);
    if (!data) {
        try {
            const { data: fetched, error } = await supabaseClient
                .from('benefits_config').select('*').eq('id', id).single();
            if (error) throw error;
            data = fetched;
        } catch (error) {
            alert('Error loading benefit: ' + error.message);
            return;
        }
    }

    const isStatic = data.type === 'fixed' || data.type === 'static' || (!data.formula_expression && !data.formula && data.value != null);

    document.getElementById('editBenefitId').value       = data.id;
    document.getElementById('editBenefitCategory').value = data.category;
    document.getElementById('editBenefitName').value     = data.name;
    document.getElementById('editBenefitDesc').value     = data.description || '';
    document.getElementById('editBenefitValue').value    = data.value ?? '';
    document.getElementById('editBenefitFormula').value  = data.formula_expression || data.formula || '';
    // Update labels for current market currency
    const localCurr = data.local_currency || MARKET_LABELS[currentBenefitsMarket]?.currency || 'PHP';
    const staticLabel = document.querySelector('#editStaticRow label');
    if (staticLabel) staticLabel.textContent = localCurr + ' Amount';
    const staticBtn = document.getElementById('editTypeStaticBtn');
    if (staticBtn) staticBtn.textContent = '$ Static Value (' + localCurr + ')';
    setBenefitValueType('edit', isStatic ? 'static' : 'formula');
    document.getElementById('editBenefitModal').classList.add('active');
}

async function saveBenefit() {
    const id          = document.getElementById('editBenefitId').value;
    const category    = document.getElementById('editBenefitCategory').value;
    const name        = document.getElementById('editBenefitName').value.trim();
    const description = document.getElementById('editBenefitDesc').value.trim();
    const isStatic    = document.getElementById('editStaticRow').style.display !== 'none';
    const value       = isStatic ? (parseFloat(document.getElementById('editBenefitValue').value) || 0) : 0;
    const formula     = !isStatic ? document.getElementById('editBenefitFormula').value.trim() : null;
    const type        = isStatic ? 'fixed' : 'formula';
    const localCurr   = MARKET_LABELS[currentBenefitsMarket]?.currency || 'PHP';
    const formulaExpr = isStatic ? String(value) : (formula || '0');

    if (!name) { alert('Benefit name is required'); return; }

    try {
        const { error } = await supabaseClient
            .from('benefits_config')
            .update({ category, name, type, value, formula, formula_expression: formulaExpr, currency: localCurr, local_currency: localCurr, description })
            .eq('id', id);

        if (error) throw error;

        hideModal('editBenefitModal');
        loadBenefits();
        document.getElementById('benefitsStatus').innerHTML = `<div class="status-message success">Benefit updated successfully!</div>`;
        setTimeout(() => document.getElementById('benefitsStatus').innerHTML = '', 3000);

    } catch (error) {
        console.error('Error updating benefit:', error);
        alert('Error updating benefit: ' + error.message);
    }
}

// =====================================================
