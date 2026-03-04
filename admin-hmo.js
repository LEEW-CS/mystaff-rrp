// =====================================================
// HMO RATES CRUD
// =====================================================
let currentHMOMarket = 'PH';

function switchHMOMarket(market) {
    currentHMOMarket = market;
    ['PH','CO','IN','KE'].forEach(m => {
        const btn = document.getElementById('hmoTab' + m);
        if (btn) btn.className = 'btn btn-sm ' + (m === market ? 'btn-primary' : 'btn-secondary');
    });
    // Update rate column header
    const curr = MARKET_LABELS[market]?.currency || 'PHP';
    const hdr = document.getElementById('hmoRateHeader');
    if (hdr) hdr.textContent = 'Monthly Rate (' + curr + ')';
    loadHMORates();
}

async function loadHMORates() {
    try {
        const { data, error } = await supabaseClient
            .from('hmo_rates')
            .select('*')
            .eq('market', currentHMOMarket)
            .order('effective_date', { ascending: false });

        if (error) throw error;

        const tbody = document.getElementById('hmoTableBody');
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No HMO rates configured yet.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(item => {
            const activeBadge = item.is_active
                ? '<span style="background:#dcfce7;color:#166534;padding:0.2rem 0.6rem;border-radius:4px;font-size:0.75rem;font-weight:600;">✅ Active</span>'
                : '<span style="background:#f1f5f9;color:#64748b;padding:0.2rem 0.6rem;border-radius:4px;font-size:0.75rem;">Inactive</span>';
            const localCurr = MARKET_LABELS[currentHMOMarket]?.currency || 'PHP';
            const rateVal = currentHMOMarket === 'PH' ? parseFloat(item.monthly_rate_php) : parseFloat(item.monthly_rate);
            const rateDisplay = (!rateVal || rateVal === 0)
                ? '<span style="color:#ef4444;font-weight:600;">⚠ Rate not set</span>'
                : `<strong>${fmtLocalCurrency(rateVal, localCurr)}</strong>`;
            return `<tr>
                <td><strong>${item.provider}</strong></td>
                <td>${item.plan_name}</td>
                <td>${rateDisplay}</td>
                <td>${new Date(item.effective_date).toLocaleDateString('en-AU', {day:'2-digit',month:'short',year:'numeric'})}</td>
                <td>${activeBadge}</td>
                <td style="font-size:0.8rem;color:var(--text-muted);max-width:200px;white-space:normal;">${item.notes || '—'}</td>
                <td class="actions">
                    ${!item.is_active ? `<button class="btn btn-secondary btn-sm" onclick="setActiveHMO(${item.id})">Set Active</button>` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="editHMORate(${item.id})">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteHMORate(${item.id})">Delete</button>
                </td>
            </tr>`;
        }).join('');

    } catch (error) {
        console.error('Error loading HMO rates:', error);
        document.getElementById('hmoStatus').innerHTML = `<div class="status-message error">Error loading HMO rates: ${error.message}</div>`;
    }
}

function showAddHMOModal() {
    document.getElementById('newHMOProvider').value  = '';
    document.getElementById('newHMOPlan').value      = '';
    document.getElementById('newHMORate').value      = '';
    document.getElementById('newHMODate').value      = new Date().toISOString().split('T')[0];
    document.getElementById('newHMONotes').value     = '';
    document.getElementById('newHMOActive').checked  = false;
    // Update rate label for current market
    const curr = MARKET_LABELS[currentHMOMarket]?.currency || 'PHP';
    const rateLabel = document.querySelector('#addHMOModal label[for="newHMORate"]');
    if (rateLabel) rateLabel.textContent = 'Monthly Rate (' + curr + ') *';
    document.getElementById('addHMOModal').classList.add('active');
}

async function addHMORate() {
    const provider         = document.getElementById('newHMOProvider').value.trim();
    const plan_name        = document.getElementById('newHMOPlan').value.trim();
    const monthly_rate_php = parseFloat(document.getElementById('newHMORate').value) || 0;
    const effective_date   = document.getElementById('newHMODate').value;
    const notes            = document.getElementById('newHMONotes').value.trim();
    const is_active        = document.getElementById('newHMOActive').checked;

    if (!provider || !plan_name || !effective_date) {
        alert('Provider, Plan Name and Effective Date are required.');
        return;
    }

    try {
        // If setting active, deactivate all others in this market first
        if (is_active) {
            await supabaseClient.from('hmo_rates').update({ is_active: false }).eq('market', currentHMOMarket);
        }

        const monthly_rate = currentHMOMarket === 'PH' ? monthly_rate_php : monthly_rate_php;
        const { error } = await supabaseClient
            .from('hmo_rates')
            .insert([{ provider, plan_name, monthly_rate_php: currentHMOMarket === 'PH' ? monthly_rate_php : 0, monthly_rate: monthly_rate_php, effective_date, notes, is_active, market: currentHMOMarket }]);

        if (error) throw error;

        hideModal('addHMOModal');
        loadHMORates();
        document.getElementById('hmoStatus').innerHTML = `<div class="status-message success">HMO rate added successfully!</div>`;
        setTimeout(() => document.getElementById('hmoStatus').innerHTML = '', 3000);

    } catch (error) {
        console.error('Error adding HMO rate:', error);
        alert('Error adding HMO rate: ' + error.message);
    }
}

async function editHMORate(id) {
    try {
        const { data, error } = await supabaseClient
            .from('hmo_rates').select('*').eq('id', id).single();
        if (error) throw error;

        const mkt = data.market || 'PH';
        const rateVal = mkt === 'PH' ? data.monthly_rate_php : (data.monthly_rate || data.monthly_rate_php);
        document.getElementById('editHMOId').value       = data.id;
        document.getElementById('editHMOProvider').value = data.provider;
        document.getElementById('editHMOPlan').value     = data.plan_name;
        document.getElementById('editHMORate').value     = rateVal;
        document.getElementById('editHMODate').value     = data.effective_date;
        document.getElementById('editHMONotes').value    = data.notes || '';
        document.getElementById('editHMOActive').checked = data.is_active;
        // Update rate label
        const curr = MARKET_LABELS[mkt]?.currency || 'PHP';
        const rateLabel = document.querySelector('#editHMOModal label[for="editHMORate"]');
        if (rateLabel) rateLabel.textContent = 'Monthly Rate (' + curr + ') *';
        document.getElementById('editHMOModal').classList.add('active');

    } catch (error) {
        console.error('Error loading HMO rate:', error);
        alert('Error loading HMO rate: ' + error.message);
    }
}

async function saveHMORate() {
    const id               = document.getElementById('editHMOId').value;
    const provider         = document.getElementById('editHMOProvider').value.trim();
    const plan_name        = document.getElementById('editHMOPlan').value.trim();
    const monthly_rate_php = parseFloat(document.getElementById('editHMORate').value) || 0;
    const effective_date   = document.getElementById('editHMODate').value;
    const notes            = document.getElementById('editHMONotes').value.trim();
    const is_active        = document.getElementById('editHMOActive').checked;

    if (!provider || !plan_name || !effective_date) {
        alert('Provider, Plan Name and Effective Date are required.');
        return;
    }

    try {
        if (is_active) {
            await supabaseClient.from('hmo_rates').update({ is_active: false }).eq('market', currentHMOMarket).neq('id', id);
        }

        const { error } = await supabaseClient
            .from('hmo_rates')
            .update({ provider, plan_name, monthly_rate_php: currentHMOMarket === 'PH' ? monthly_rate_php : 0, monthly_rate: monthly_rate_php, effective_date, notes, is_active })
            .eq('id', id);

        if (error) throw error;

        hideModal('editHMOModal');
        loadHMORates();
        document.getElementById('hmoStatus').innerHTML = `<div class="status-message success">HMO rate updated successfully!</div>`;
        setTimeout(() => document.getElementById('hmoStatus').innerHTML = '', 3000);

    } catch (error) {
        console.error('Error updating HMO rate:', error);
        alert('Error updating HMO rate: ' + error.message);
    }
}

async function setActiveHMO(id) {
    try {
        await supabaseClient.from('hmo_rates').update({ is_active: false }).eq('market', currentHMOMarket);
        const { error } = await supabaseClient.from('hmo_rates').update({ is_active: true }).eq('id', id);
        if (error) throw error;
        loadHMORates();
        document.getElementById('hmoStatus').innerHTML = `<div class="status-message success">Active HMO rate updated!</div>`;
        setTimeout(() => document.getElementById('hmoStatus').innerHTML = '', 3000);
    } catch (error) {
        console.error('Error setting active HMO:', error);
        alert('Error: ' + error.message);
    }
}

async function deleteHMORate(id) {
    if (!confirm('Are you sure you want to delete this HMO rate?')) return;
    try {
        const { error } = await supabaseClient.from('hmo_rates').delete().eq('id', id);
        if (error) throw error;
        loadHMORates();
        document.getElementById('hmoStatus').innerHTML = `<div class="status-message success">HMO rate deleted.</div>`;
        setTimeout(() => document.getElementById('hmoStatus').innerHTML = '', 3000);
    } catch (error) {
        console.error('Error deleting HMO rate:', error);
        alert('Error deleting HMO rate: ' + error.message);
    }
}

// =====================================================
