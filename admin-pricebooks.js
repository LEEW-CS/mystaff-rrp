// =====================================================
// PRICE BOOKS CRUD
// =====================================================

// Groups match the old app exactly — 8 groups, same order, same headerClass logic
const PB_GROUPS = [
    { name: 'Current WFO',  headerClass: 'current', isElevate: false },
    { name: 'Stack Shift - WFO',  headerClass: 'current', isElevate: false },
    { name: 'Hybrid',       headerClass: 'hybrid',  isElevate: false },
    { name: 'CS Elevate',   headerClass: 'elevate', isElevate: true, badge: 'Uses Elevate mPC Prices' },
    { name: 'Legacy WFO',   headerClass: 'legacy',  isElevate: false },
    { name: 'Legacy COVID', headerClass: 'covid',   isElevate: false },
    { name: 'CS Now',       headerClass: 'csnow',   isElevate: false }
];

const PB_CURRENCIES = ['USD', 'AUD', 'GBP', 'HKD', 'SGD', 'EUR', 'CAD', 'NZD'];
const PB_CURR_CLASS = { USD:'pb-th-usd', AUD:'pb-th-aud', GBP:'pb-th-gbp', HKD:'pb-th-hkd', SGD:'pb-th-sgd', EUR:'pb-th-eur', CAD:'pb-th-cad', NZD:'pb-th-nzd' };

// Live cache: { 'Price Book Name': { USD, AUD, GBP, HKD, SGD, EUR, CAD, NZD, id, is_elevate, group_name } }
let pbCache = {};
let pbHasUnsavedChanges = false;

// ── Load ──────────────────────────────────────────────
async function loadPriceBooks() {

    try {
        const { data, error } = await supabaseClient
            .from('price_books')
            .select('*')
            .order('sort_order');
        if (error) throw error;

        pbCache = {};
        (data || []).forEach(row => {
            pbCache[row.name] = {
                id:         row.id,
                is_elevate: row.is_elevate || false,
                group_name: row.group_name,
                USD: parseFloat(row.fee_usd) || 0,
                AUD: parseFloat(row.fee_aud) || 0,
                GBP: parseFloat(row.fee_gbp) || 0,
                HKD: parseFloat(row.fee_hkd) || 0,
                SGD: parseFloat(row.fee_sgd) || 0,
                EUR: parseFloat(row.fee_eur) || 0,
                CAD: parseFloat(row.fee_cad) || 0,
                NZD: parseFloat(row.fee_nzd) || 0,
            };
        });

        // If DB is empty, seed from PRICE_BOOKS defaults so editor shows values
        if ((data || []).length === 0) seedPBFromDefaults();

        renderPriceBookPage();
        populatePriceBookDropdown(); // keep calculator dropdown in sync

    } catch(e) {
        console.error('Price books load error:', e);
        const el = document.getElementById('pbGroups');
        if (el) el.innerHTML = `<div class="status-message error">Error loading price books: ${e.message}</div>`;
    }
}

function seedPBFromDefaults() {
    // Seed pbCache from the hardcoded PRICE_BOOKS constant (initial values for new installs)
    Object.keys(PRICE_BOOKS).forEach(name => {
        const pb = PRICE_BOOKS[name];
        pbCache[name] = {
            id: null,
            is_elevate: pb.isElevate || false,
            group_name: inferGroup(name),
            USD: pb.USD || 0, AUD: pb.AUD || 0, GBP: pb.GBP || 0,
            HKD: pb.HKD || 0, SGD: pb.SGD || 0, EUR: pb.EUR || 0,
            CAD: pb.CAD || 0, NZD: pb.NZD || 0,
        };
    });
}

// ── Populate calculator dropdown from live pbCache ────
function populatePriceBookDropdown() {
    const sel = document.getElementById('priceBook');
    if (!sel) return;
    const currentVal = sel.value;

    // Build optgroups from PB_GROUPS order
    const groupOptgroups = {};
    PB_GROUPS.forEach(g => { groupOptgroups[g.name] = []; });

    // Assign each pbCache entry to its group
    Object.keys(pbCache).forEach(name => {
        const entry = pbCache[name];
        const grp   = entry.group_name || inferGroup(name);
        if (groupOptgroups[grp] !== undefined) {
            groupOptgroups[grp].push(name);
        } else {
            // Unknown group — put in first group as fallback
            groupOptgroups[PB_GROUPS[0].name].push(name);
        }
    });

    const OPTGROUP_LABELS = {
        'Current WFO':  '── CURRENT WFO ──',
        'Stack Shift - WFO':  '── STACK SHIFT - WFO ──',
        'Hybrid':       '── HYBRID ──',
        'CS Elevate':   '── ELEVATE ──',
        'Legacy WFO':   '── LEGACY WFO ──',
        'Legacy COVID': '── LEGACY COVID ──',
        'CS Now':       '── CS NOW (Ad Hoc) ──'
    };

    sel.innerHTML = '';
    let defaultSet = false;
    PB_GROUPS.forEach(g => {
        const names = groupOptgroups[g.name];
        if (!names || names.length === 0) return;
        const og = document.createElement('optgroup');
        og.label = OPTGROUP_LABELS[g.name] || g.name;
        names.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            // Default selection: prefer "Current ELEVATE WFH" (legacy behaviour)
            if (name === 'Current ELEVATE WFH' && !defaultSet) {
                opt.selected = true;
                defaultSet = true;
            }
            og.appendChild(opt);
        });
        sel.appendChild(og);
    });

    // Restore previous selection if still available
    if (currentVal && sel.querySelector(`option[value="${CSS.escape(currentVal)}"]`)) {
        sel.value = currentVal;
    }
}

function inferGroup(name) {
    if (name.includes('ELEVATE') || name.includes('Elevate')) return 'CS Elevate';
    if (name.includes('STACK SHIFT') || name.includes('Stack Shift')) return 'Stack Shift - WFO';
    if (name.includes('CS EVERYWHERE') || name.includes('CS Everywhere') || name.includes('EVERYWHERE')) return 'Hybrid';
    if (name.includes('CS Now') || name.includes('CS NOW')) return 'CS Now';
    if (name.includes('OfficeFLEX') || name.includes('Staff On Fiber') || name.includes('OFFICEFLEX')) return 'Legacy COVID';
    if (name.includes('Legacy') || name.includes('LEGACY')) return 'Legacy WFO';
    return 'Current WFO';
}

// ── Render price books page ───────────────────────────
function renderPriceBookPage() {
    const container = document.getElementById('pbGroups');
    if (!container) return;
    container.innerHTML = '';

    const TH_CLASS = { USD:'th-usd', AUD:'th-aud', GBP:'th-gbp', HKD:'th-hkd', SGD:'th-sgd', EUR:'th-eur', CAD:'th-cad', NZD:'th-nzd' };
    const fmt = v => (v != null && v !== 0) ? parseFloat(v).toFixed(2) : '<span style="color:#be123c;font-weight:600;">—</span>';

    PB_GROUPS.forEach(group => {
        const filteredEntries = Object.entries(pbCache)
            .filter(([name, v]) => (v.group_name === group.name) || (!v.group_name && inferGroup(name) === group.name))
            .sort(([, a], [, b]) => ((a.id || 9999) - (b.id || 9999)));

        const section = document.createElement('div');
        section.className = 'pb-group-section';
        section.dataset.group = group.name;

        // Coloured group header bar with Add Row button
        const label = document.createElement('div');
        label.className = `pb-group-label ${group.headerClass}`;
        label.innerHTML = `
            <h3>${group.name}${group.badge ? ` <span class="pb-elevate-badge">(${group.badge})</span>` : ''}</h3>
            <button class="btn-add" onclick="showAddPBModal('${group.name.replace(/'/g,"\'")}')">+ Add Row</button>
        `;
        section.appendChild(label);

        const wrap = document.createElement('div');
        wrap.className = 'table-scroll-wrapper'; wrap.style.marginBottom = '0.5rem';

        const table = document.createElement('table');
        table.className = 'data-table';

        // Single header row with coloured currency headers
        let thead = '<thead><tr><th style="text-align:left;min-width:180px;">Price Book</th>';
        PB_CURRENCIES.forEach(curr => {
            thead += `<th class="${TH_CLASS[curr]}" style="text-align:right;white-space:nowrap;">${curr}</th>`;
        });
        thead += '<th style="text-align:center;">Actions</th></tr></thead>';
        table.innerHTML = thead;

        const tbody = document.createElement('tbody');

        if (filteredEntries.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${PB_CURRENCIES.length + 2}" style="text-align:center;color:var(--text-muted);padding:1rem;font-size:0.875rem;">No rows yet — click + Add Row to add one.</td></tr>`;
        } else {
            filteredEntries.forEach(([pbName, cached]) => {
                const tr = document.createElement('tr');
                let html = `<td><strong>${pbName}</strong></td>`;
                PB_CURRENCIES.forEach(curr => {
                    const val = cached[curr] || 0;
                    html += `<td style="text-align:right;font-family:'Space Mono',monospace;font-size:0.8125rem;white-space:nowrap;">${fmt(val)}</td>`;
                });
                html += `<td class="actions">
                    <button class="btn btn-secondary btn-sm" onclick="showEditPBModal('${pbName.replace(/'/g,"\'")}')">Edit</button>
                    <button class="btn btn-secondary btn-sm" onclick="renamePBRow('${pbName.replace(/'/g,"\'")}')">✎</button>
                    <button class="btn btn-danger btn-sm" onclick="deletePBRow('${pbName.replace(/'/g,"\'")}')">✕</button>
                </td>`;
                tr.innerHTML = html;
                tbody.appendChild(tr);
            });
        }

        table.appendChild(tbody);
        wrap.appendChild(table);
        section.appendChild(wrap);
        container.appendChild(section);
    });
}

// ── Open Edit modal for a price book row ─────────────
function showEditPBModal(pbName) {
    const cached = pbCache[pbName];
    if (!cached) return;
    document.getElementById('editPBOrigName').value = pbName;
    document.getElementById('editPBNameLabel').textContent = pbName;
    PB_CURRENCIES.forEach(curr => {
        const el = document.getElementById('editPB_' + curr);
        if (el) el.value = (cached[curr] || 0).toFixed(2);
    });
    showModal('editPBModal');
}

// ── Save edits from Edit modal ─────────────────────────
async function saveEditPBRow() {
    const pbName = document.getElementById('editPBOrigName').value;
    const cached = pbCache[pbName];
    if (!cached) return;

    const fees = {};
    PB_CURRENCIES.forEach(curr => {
        const el = document.getElementById('editPB_' + curr);
        fees[curr] = el ? (parseFloat(el.value) || 0) : 0;
    });

    const btn = document.querySelector('#editPBModal .btn-primary');
    const orig = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loading"></span> Saving…'; }

    try {
        if (cached.id) {
            const { error } = await supabaseClient
                .from('price_books')
                .update({
                    fee_usd: fees.USD, fee_aud: fees.AUD, fee_gbp: fees.GBP,
                    fee_hkd: fees.HKD, fee_sgd: fees.SGD, fee_eur: fees.EUR,
                    fee_cad: fees.CAD, fee_nzd: fees.NZD,
                })
                .eq('id', cached.id);
            if (error) throw error;
        }
        // Update cache
        PB_CURRENCIES.forEach(curr => { pbCache[pbName][curr] = fees[curr]; });
        hideModal('editPBModal');
        renderPriceBookPage();
        populatePriceBookDropdown();
        calculate();
        showPBSuccess(`"${pbName}" saved`);
    } catch(e) {
        console.error('Edit PB save error:', e);
        alert('Error saving: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    }
}

// ── Save all ─────────────────────────────────────────
async function savePriceBooks() {
    const btn = null; // save bar removed — saves happen via Edit modal
    const orig = '';

    try {
        let sortOrder = 0;
        const rows = [];
        PB_GROUPS.forEach(group => {
            Object.entries(pbCache)
                .filter(([name, v]) => (v.group_name === group.name) || (!v.group_name && inferGroup(name) === group.name))
                .sort(([,a],[,b]) => ((a.id||9999)-(b.id||9999)))
                .forEach(([name, cached]) => {
                    const row = {
                        name,
                        group_name:  group.name,
                        is_elevate:  group.isElevate,
                        sort_order:  sortOrder++,
                        fee_usd: cached.USD || 0,
                        fee_aud: cached.AUD || 0,
                        fee_gbp: cached.GBP || 0,
                        fee_hkd: cached.HKD || 0,
                        fee_sgd: cached.SGD || 0,
                        fee_eur: cached.EUR || 0,
                        fee_cad: cached.CAD || 0,
                        fee_nzd: cached.NZD || 0,
                    };
                    if (cached.id) row.id = cached.id;
                    rows.push(row);
                });
        });

        const { error } = await supabaseClient
            .from('price_books')
            .upsert(rows, { onConflict: 'name' });
        if (error) throw error;

        await loadPriceBooks();
        showPBSuccess('All price books saved successfully');

    } catch(e) {
        console.error('Save price books error:', e);
        alert('Error saving: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    }
}

function showPBSuccess(msg) {
    const bar = document.getElementById('pbSaveBar');
    if (!bar) return;
    const flash = document.createElement('div');
    flash.style.cssText = 'color:#166534;font-size:0.8125rem;font-weight:600;display:flex;align-items:center;gap:0.4rem;';
    flash.innerHTML = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> ${msg}`;
    bar.insertBefore(flash, bar.firstChild);
    setTimeout(() => flash.remove(), 3000);
}

// ── Add new price book GROUP ──────────────────────────
function showAddPBGroupModal() {
    document.getElementById('pbNewGroupName').value = '';
    document.getElementById('pbNewGroupStyle').value = 'current';
    document.getElementById('pbNewGroupElevate').checked = false;
    showModal('pbAddGroupModal');
}

function addPBGroup() {
    const name = document.getElementById('pbNewGroupName').value.trim();
    if (!name) { alert('Group name is required.'); return; }
    if (PB_GROUPS.find(g => g.name === name)) { alert('A group with that name already exists.'); return; }

    const headerClass = document.getElementById('pbNewGroupStyle').value;
    const isElevate   = document.getElementById('pbNewGroupElevate').checked;

    PB_GROUPS.push({ name, headerClass, isElevate });
    hideModal('pbAddGroupModal');
    renderPriceBookPage();
    populatePriceBookDropdown();
    showPBSuccess(`Group "${name}" created — use + Add Row to add price books to it`);
}

// ── Add new price book row ────────────────────────────
let pbAddingGroup = '';
function showAddPBModal(groupName) {
    pbAddingGroup = groupName;
    document.getElementById('pbNewName').value = '';
    PB_CURRENCIES.forEach(curr => {
        const el = document.getElementById('pbNew_' + curr);
        if (el) el.value = '0.00';
    });
    document.getElementById('pbAddGroupLabel').textContent = groupName;
    showModal('pbAddModal');
}

async function addPBRow() {
    const name = document.getElementById('pbNewName').value.trim();
    if (!name) { alert('Price book name is required.'); return; }
    if (pbCache[name]) { alert('A price book with that name already exists.'); return; }

    const fees = {};
    PB_CURRENCIES.forEach(curr => {
        const el = document.getElementById('pbNew_' + curr);
        fees[curr] = el ? (parseFloat(el.value) || 0) : 0;
    });

    const group = PB_GROUPS.find(g => g.name === pbAddingGroup) || PB_GROUPS[0];
    const maxSort = Math.max(0, ...Object.values(pbCache).map(v => v.id || 0));

    try {
        const { data, error } = await supabaseClient
            .from('price_books')
            .insert([{
                name,
                group_name:  group.name,
                is_elevate:  group.isElevate,
                sort_order:  maxSort + 1,
                fee_usd: fees.USD, fee_aud: fees.AUD, fee_gbp: fees.GBP,
                fee_hkd: fees.HKD, fee_sgd: fees.SGD, fee_eur: fees.EUR,
                fee_cad: fees.CAD, fee_nzd: fees.NZD,
            }])
            .select()
            .single();
        if (error) throw error;

        pbCache[name] = { id: data.id, is_elevate: group.isElevate, group_name: group.name, ...fees };
        hideModal('pbAddModal');
        renderPriceBookPage();
        populatePriceBookDropdown();
        showPBSuccess(`"${name}" added`);

    } catch(e) {
        console.error('Add PB error:', e);
        alert('Error adding price book: ' + e.message);
    }
}

// ── Rename price book row ─────────────────────────────
async function renamePBRow(oldName) {
    const newName = prompt('Rename price book:', oldName);
    if (!newName || newName.trim() === oldName) return;
    const trimmed = newName.trim();
    if (pbCache[trimmed]) { alert('A price book with that name already exists.'); return; }

    const cached = pbCache[oldName];
    if (!cached || !cached.id) {
        // Not yet in DB — just rename in cache
        pbCache[trimmed] = { ...cached };
        delete pbCache[oldName];
        renderPriceBookPage();
        populatePriceBookDropdown();
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('price_books')
            .update({ name: trimmed })
            .eq('id', cached.id);
        if (error) throw error;

        pbCache[trimmed] = { ...cached };
        delete pbCache[oldName];
        renderPriceBookPage();
        populatePriceBookDropdown();
        showPBSuccess(`Renamed to "${trimmed}"`);

    } catch(e) {
        console.error('Rename PB error:', e);
        alert('Error renaming: ' + e.message);
    }
}

// ── Delete price book row ─────────────────────────────
async function deletePBRow(name) {
    if (!confirm(`Delete price book "${name}"?\n\nThis cannot be undone.`)) return;

    const cached = pbCache[name];
    if (!cached || !cached.id) {
        // Not in DB — just remove from cache
        delete pbCache[name];
        renderPriceBookPage();
        populatePriceBookDropdown();
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('price_books')
            .delete()
            .eq('id', cached.id);
        if (error) throw error;

        delete pbCache[name];
        renderPriceBookPage();
        populatePriceBookDropdown();
        showPBSuccess(`"${name}" deleted`);

    } catch(e) {
        console.error('Delete PB error:', e);
        alert('Error deleting: ' + e.message);
    }
}

// ── Reset to hardcoded defaults ───────────────────────
async function resetPBToDefaults() {
    if (!confirm('Reset ALL price books to their hardcoded default values?\n\nThis will overwrite any custom values you have saved.')) return;
    seedPBFromDefaults();
    renderPriceBookPage();
    populatePriceBookDropdown();
    if (confirm('Defaults loaded. Save all to database now?')) {
        await savePriceBooks();
    }
}

        // ── Keep PRICE_BOOKS constant in sync (fallback only) ─
function syncPriceBooksToCalc() {
    Object.entries(pbCache).forEach(([name, cached]) => {
        if (!PRICE_BOOKS[name]) PRICE_BOOKS[name] = {};
        PRICE_BOOKS[name].USD = cached.USD || 0;
        PRICE_BOOKS[name].AUD = cached.AUD || 0;
        PRICE_BOOKS[name].GBP = cached.GBP || 0;
        PRICE_BOOKS[name].HKD = cached.HKD || 0;
        PRICE_BOOKS[name].SGD = cached.SGD || 0;
        PRICE_BOOKS[name].EUR = cached.EUR || 0;
        PRICE_BOOKS[name].CAD = cached.CAD || 0;
        PRICE_BOOKS[name].NZD = cached.NZD || 0;
        PRICE_BOOKS[name].isElevate = cached.is_elevate || false;
    });
}

