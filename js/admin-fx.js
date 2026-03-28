// =====================================================
// FX RATES CRUD
// =====================================================
const FX_CURRENCIES_PH = ['php','usd','gbp','eur','hkd','sgd','cad','nzd','inr'];
const FX_CURRENCIES_CO = ['cop_usd','cop_aud','cop_gbp','cop_eur','cop_hkd','cop_sgd','cop_cad','cop_nzd','cop_php'];
const FX_CURRENCIES_CO_LABELS = ['USD','AUD','GBP','EUR','HKD','SGD','CAD','NZD','PHP'];
let fxCache = [];
let fxActiveMarket = 'PH';

const FX_MARKET_INFO = {
    PH: '<strong>🇵🇭 Philippines Rates:</strong> PHP → other currencies (e.g. PHP→AUD means 1 PHP = X AUD, so divide PHP amount by this value to get AUD).',
    CO: '<strong>🌎 Colombia Rates:</strong> COP → other currencies (e.g. COP→AUD means 1 COP = X AUD).',
    IN: '<strong>🇮🇳 India Rates:</strong> INR → other currencies (e.g. INR→AUD means 1 INR = X AUD).',
    KE: '<strong>🇰🇪 Kenya Rates:</strong> KES → other currencies (e.g. KES→AUD means 1 KES = X AUD).',
};

function switchFXMarket(market) {
    fxActiveMarket = market;
    // Update tab button styles
    ['PH','CO','IN','KE'].forEach(m => {
        const btn = document.getElementById('fxTab' + m);
        if (btn) btn.className = m === market ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    });
    // Update info banner
    const info = document.getElementById('fxMarketInfo');
    if (info) info.innerHTML = FX_MARKET_INFO[market] || '';
    // Re-render table for this market
    renderFXTable(market);
}

const FX_CURRENCIES_IN = ['inr_php','inr_aud','inr_gbp','inr_usd','inr_hkd','inr_sgd','inr_cad','inr_eur','inr_nzd'];
const FX_CURRENCIES_KE = ['kes_aud','kes_usd','kes_hkd','kes_sgd','kes_gbp','kes_cad','kes_eur','kes_nzd'];

function fxRateCols(item) {
    let cols;
    if (item.market === 'CO') cols = FX_CURRENCIES_CO;
    else if (item.market === 'IN') cols = FX_CURRENCIES_IN;
    else if (item.market === 'KE') cols = FX_CURRENCIES_KE;
    else cols = FX_CURRENCIES_PH;
    const colCount = 9; // PH/CO/IN all have 9 cols; KE has 8 — pad to 9
    const cells = cols.map(c => {
        const v = parseFloat(item[c]) || 0;
        return `<td style="text-align:center;font-family:'Space Mono',monospace;font-size:0.8rem;">${v === 0 ? '<span style="color:#94a3b8;">0</span>' : v.toFixed(4)}</td>`;
    }).join('');
    const pad = cols.length < colCount ? `<td style="text-align:center;color:#94a3b8;">—</td>`.repeat(colCount - cols.length) : '';
    return cells + pad + (item.market === 'PH' ? '<td style="text-align:center;color:#94a3b8;font-size:0.8rem;">—</td>' : '');
}

async function loadFXRates() {
    try {
        const { data, error } = await supabaseClient
            .from('fx_monthly_rates')
            .select('*')
            .order('month_date', { ascending: false });
        if (error) throw error;
        fxCache = data || [];
        renderFXTable(fxActiveMarket);
    } catch (err) {
        console.error('Error loading FX rates:', err);
        const statusEl = document.getElementById('fxStatus');
        if (statusEl) statusEl.innerHTML = `<div class="status-message error">Error loading FX rates: ${err.message}</div>`;
    }
}

function renderFXTable(market) {
    const container = document.getElementById('fxTablesContainer');
    if (!container) return;

    const COL_COLORS = ['#7c3aed','#059669','#dc2626','#db2777','#d97706','#2563eb','#0891b2','#ea580c','#16a34a'];
    const COL_DEFS = {
        PH: [{h:'PHP',sub:'PHP→AUD'},{h:'USD',sub:'PHP→USD'},{h:'GBP',sub:'PHP→GBP'},{h:'EUR',sub:'PHP→EUR'},{h:'HKD',sub:'PHP→HKD'},{h:'SGD',sub:'PHP→SGD'},{h:'CAD',sub:'PHP→CAD'},{h:'NZD',sub:'PHP→NZD'},{h:'INR',sub:'PHP→INR'}],
        CO: [{h:'USD',sub:'COP→USD'},{h:'AUD',sub:'COP→AUD'},{h:'GBP',sub:'COP→GBP'},{h:'EUR',sub:'COP→EUR'},{h:'HKD',sub:'COP→HKD'},{h:'SGD',sub:'COP→SGD'},{h:'CAD',sub:'COP→CAD'},{h:'NZD',sub:'COP→NZD'},{h:'PHP',sub:'COP→PHP'}],
        IN: [{h:'PHP',sub:'INR→PHP'},{h:'AUD',sub:'INR→AUD'},{h:'GBP',sub:'INR→GBP'},{h:'USD',sub:'INR→USD'},{h:'HKD',sub:'INR→HKD'},{h:'SGD',sub:'INR→SGD'},{h:'CAD',sub:'INR→CAD'},{h:'EUR',sub:'INR→EUR'},{h:'NZD',sub:'INR→NZD'}],
        KE: [{h:'AUD',sub:'KES→AUD'},{h:'USD',sub:'KES→USD'},{h:'HKD',sub:'KES→HKD'},{h:'SGD',sub:'KES→SGD'},{h:'GBP',sub:'KES→GBP'},{h:'CAD',sub:'KES→CAD'},{h:'EUR',sub:'KES→EUR'},{h:'NZD',sub:'KES→NZD'},{h:'—',sub:''}],
    };
    const COL_KEYS = {
        PH: ['php','usd','gbp','eur','hkd','sgd','cad','nzd','inr'],
        CO: ['cop_usd','cop_aud','cop_gbp','cop_eur','cop_hkd','cop_sgd','cop_cad','cop_nzd','cop_php'],
        IN: ['inr_php','inr_aud','inr_gbp','inr_usd','inr_hkd','inr_sgd','inr_cad','inr_eur','inr_nzd'],
        KE: ['kes_aud','kes_usd','kes_hkd','kes_sgd','kes_gbp','kes_cad','kes_eur','kes_nzd',null],
    };

    const rows = fxCache.filter(r => (!r.market || r.market === 'PH') ? market === 'PH' : r.market === market);
    const cols = COL_DEFS[market];
    const keys = COL_KEYS[market];

    if (!rows.length) {
        container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:2rem;">No FX rates saved yet for this market. Use the + Add FX Month button to add one.</div>';
        return;
    }

    const thCells = cols.map((c, i) => c.h === '—'
        ? `<th style="background:#e2e8f0;color:#94a3b8;text-align:center;font-size:0.68rem;padding:0.3rem 0.4rem;">—</th>`
        : `<th style="background:${COL_COLORS[i]};color:#fff;text-align:center;font-size:0.68rem;padding:0.3rem 0.4rem;">${c.h}<br><span style="opacity:0.8;font-weight:400;">${c.sub}</span></th>`
    ).join('');

    const dataRows = rows.map(item => {
        const cells = keys.map(k => {
            if (!k) return `<td style="text-align:center;color:#94a3b8;">—</td>`;
            const v = parseFloat(item[k]);
            return `<td style="text-align:center;font-family:'Space Mono',monospace;font-size:0.78rem;">${isNaN(v) || v === 0 ? '<span style="color:#94a3b8;">—</span>' : v.toFixed(4)}</td>`;
        }).join('');
        return `<tr>
            <td><strong style="font-size:0.82rem;">${item.month_name || item.month_date}</strong><div style="font-size:0.68rem;color:var(--text-muted);">${item.month_date}</div></td>
            ${cells}
            <td class="actions">
                <button class="btn btn-secondary btn-sm" onclick="editFXRate(${item.id})">Edit</button>
                <button class="btn btn-danger btn-sm" data-id="${item.id}" data-name="${(item.month_name||item.month_date).replace(/"/g,'&quot;')}" onclick="deleteFXMonthById(this)">Delete</button>
            </td>
        </tr>`;
    }).join('');

    container.innerHTML = `<div class="table-scroll-wrapper">
        <table class="data-table" style="margin-bottom:0;">
            <thead><tr><th style="font-size:0.78rem;">Month</th>${thCells}<th>Actions</th></tr></thead>
            <tbody>${dataRows}</tbody>
        </table>
    </div>`;
}

const FX_MARKET_CONFIG = {
    PH: { cols: ['php', 'usd', 'gbp', 'eur', 'hkd', 'sgd', 'cad', 'nzd', 'inr'], ids: ['PHP', 'USD', 'GBP', 'EUR', 'HKD', 'SGD', 'CAD', 'NZD', 'INR'] },
    CO: { cols: ['cop_usd', 'cop_aud', 'cop_gbp', 'cop_eur', 'cop_hkd', 'cop_sgd', 'cop_cad', 'cop_nzd', 'cop_php'], ids: ['COP_USD', 'COP_AUD', 'COP_GBP', 'COP_EUR', 'COP_HKD', 'COP_SGD', 'COP_CAD', 'COP_NZD', 'COP_PHP'] },
    IN: { cols: ['inr_php', 'inr_aud', 'inr_gbp', 'inr_usd', 'inr_hkd', 'inr_sgd', 'inr_cad', 'inr_eur', 'inr_nzd'], ids: ['INR_PHP', 'INR_AUD', 'INR_GBP', 'INR_USD', 'INR_HKD', 'INR_SGD', 'INR_CAD', 'INR_EUR', 'INR_NZD'] },
    KE: { cols: ['kes_aud', 'kes_usd', 'kes_hkd', 'kes_sgd', 'kes_gbp', 'kes_cad', 'kes_eur', 'kes_nzd'], ids: ['KES_AUD', 'KES_USD', 'KES_HKD', 'KES_SGD', 'KES_GBP', 'KES_CAD', 'KES_EUR', 'KES_NZD'] },
};
const FX_MARKETS = ['PH','CO','IN','KE'];

function fxModalClear(prefix, market) {
    document.getElementById(prefix + 'FXName').value = '';
    const cfg = FX_MARKET_CONFIG[market];
    if (!cfg) return;
    cfg.ids.forEach(id => {
        const el = document.getElementById(prefix + 'FX_' + id);
        if (el) el.value = '';
    });
}

function fxModalFill(prefix, item) {
    const market = item.market || 'PH';
    document.getElementById(prefix + 'FXName').value = item.month_name || '';
    document.getElementById(prefix + 'FXMarket').value = market;
    // Show correct field section, hide others
    FX_MARKETS.forEach(m => {
        const el = document.getElementById(prefix + 'FX_' + m + '_FIELDS');
        if (el) el.style.display = m === market ? 'grid' : 'none';
    });
    // Fill values
    const cfg = FX_MARKET_CONFIG[market];
    if (cfg) {
        cfg.cols.forEach((col, i) => {
            const el = document.getElementById(prefix + 'FX_' + cfg.ids[i]);
            if (el) el.value = item[col] != null ? item[col] : '';
        });
    }
}

function fxModalRead(prefix) {
    const market = document.getElementById(prefix + 'FXMarket').value || 'PH';
    const obj = { month_name: document.getElementById(prefix + 'FXName').value.trim(), market };
    const cfg = FX_MARKET_CONFIG[market];
    if (cfg) {
        cfg.cols.forEach((col, i) => {
            const el = document.getElementById(prefix + 'FX_' + cfg.ids[i]);
            obj[col] = el && el.value !== '' ? parseFloat(el.value) : null;
        });
    }
    return obj;
}

function fxParseDate(name) {
    const match = name.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (match) {
        const months = {january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',
                        july:'07',august:'08',september:'09',october:'10',november:'11',december:'12'};
        const mKey = match[2].toLowerCase();
        if (months[mKey]) return `${match[3]}-${months[mKey]}-${match[1].padStart(2,'0')}`;
    }
    return new Date().toISOString().split('T')[0];
}

function showAddFXModal() {
    var el = document.getElementById('newFXName');
    if (el) el.value = '';
    var modal = document.getElementById('addFXModal');
    if (modal) modal.classList.add('active');
}


function fxModalSetMarket(prefix, market) {
    document.getElementById(prefix + 'FXMarket').value = market;
    FX_MARKETS.forEach(m => {
        const fields = document.getElementById(prefix + 'FX_' + m + '_FIELDS');
        if (fields) fields.style.display = m === market ? 'grid' : 'none';
        if (prefix === 'new') {
            const btn = document.getElementById('newFXBtn' + m);
            if (btn) btn.className = m === market ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
        }
    });
}

async function saveNewFXMonth() {
    var nameEl = document.getElementById('newFXName');
    var monthName = nameEl ? nameEl.value.trim() : '';
    if (!monthName) { alert('Please enter a month name (e.g. "As at 28 February 2026")'); return; }
    var monthDate = fxParseDate(monthName);
    var markets = ['PH', 'CO', 'IN', 'KE'];
    var errors = [];
    for (var i = 0; i < markets.length; i++) {
        try {
            var row = { month_name: monthName, month_date: monthDate, market: markets[i], php: 0 };
            var result = await supabaseClient.from('fx_monthly_rates').insert([row]);
            if (result.error) errors.push(markets[i] + ': ' + result.error.message);
        } catch(e) {
            errors.push(markets[i] + ': ' + e.message);
        }
    }
    hideModal('addFXModal');
    loadFXRates();
    if (errors.length) {
        document.getElementById('fxStatus').innerHTML = '<div class="status-message error">Some rows failed: ' + errors.join(', ') + '</div>';
    } else {
        document.getElementById('fxStatus').innerHTML = '<div class="status-message success">Month "' + monthName + '" added for all countries. Click Edit to fill in the rates.</div>';
        setTimeout(function() { document.getElementById('fxStatus').innerHTML = ''; }, 5000);
    }
}


function editFXRate(id) {
    const item = fxCache.find(r => r.id === id);
    if (!item) { alert('FX record not found'); return; }
    document.getElementById('editFXId').value = item.id;
    fxModalFill('edit', item);
    document.getElementById('editFXModal').classList.add('active');
}

async function updateFXMonth() {
    const id = document.getElementById('editFXId').value;
    const fields = fxModalRead('edit');
    if (!fields.month_name) { alert('Month name is required'); return; }
    fields.month_date = fxParseDate(fields.month_name);
    try {
        const { error } = await supabaseClient.from('fx_monthly_rates').update(fields).eq('id', id);
        if (error) throw error;
        hideModal('editFXModal');
        loadFXRates();
        document.getElementById('fxStatus').innerHTML = `<div class="status-message success">FX Month updated successfully!</div>`;
        setTimeout(() => document.getElementById('fxStatus').innerHTML = '', 3000);
    } catch (err) {
        console.error('Error updating FX month:', err);
        alert('Error updating FX month: ' + err.message);
    }
}

function deleteFXMonthById(btn) {
    const id = parseInt(btn.dataset.id);
    const name = btn.dataset.name || 'this month';
    deleteFXMonth(id, name);
}

async function deleteFXMonth(id, name) {
    if (!confirm(`Delete FX Month "${name}"? This cannot be undone.`)) return;
    try {
        const { error } = await supabaseClient.from('fx_monthly_rates').delete().eq('id', id);
        if (error) throw error;
        loadFXRates();
        document.getElementById('fxStatus').innerHTML = `<div class="status-message success">FX Month "${name}" deleted.</div>`;
        setTimeout(() => document.getElementById('fxStatus').innerHTML = '', 3000);
    } catch (err) {
        console.error('Error deleting FX month:', err);
        alert('Error: ' + err.message);
    }
}

// =====================================================
