// =====================================================
// SSS CONTRIBUTIONS CRUD
// =====================================================
async function loadSSS() {
    try {
        const { data, error } = await supabaseClient
            .from('sss_contributions')
            .select('*')
            .order('range_start', { ascending: false });
        
        if (error) throw error;

        allSSSData = data;
        
        const tbody = document.getElementById('sssTableBody');
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No SSS brackets configured.</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.map(item => {
            const sc = parseFloat(item.range_start);
            const salaryCredit = item.range_start >= 30000 ? 30000 : sc;
            const rangeEndDisplay = item.range_end >= 9999999 ? 'No limit' : '₱' + parseFloat(item.range_end).toLocaleString();
            return `<tr>
                <td>₱${parseFloat(item.range_start).toLocaleString()}</td>
                <td>${rangeEndDisplay}</td>
                <td style="font-weight:600;">₱${salaryCredit.toLocaleString()}</td>
                <td style="color:#166534;">₱${parseFloat(item.ee_share).toLocaleString()}</td>
                <td style="color:#1e40af;">₱${parseFloat(item.er_share).toLocaleString()}</td>
                <td class="actions">
                    <button class="btn btn-secondary btn-sm" onclick="editSSS(${item.id})">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteSSS(${item.id})">Delete</button>
                </td>
            </tr>`;
        }).join('');
        
    } catch (error) {
        console.error('Error loading SSS:', error);
        document.getElementById('sssStatus').innerHTML = `<div class="status-message error">Error loading SSS table: ${error.message}</div>`;
    }
}

function showAddSSSModal() {
    document.getElementById('newSSSStart').value = '';
    document.getElementById('newSSSEnd').value = '';
    document.getElementById('newSSSEE').value = '';
    document.getElementById('newSSSER').value = '';
    document.getElementById('addSSSModal').classList.add('active');
}

async function addSSSBracket() {
    const range_start = parseFloat(document.getElementById('newSSSStart').value) || 0;
    const range_end = parseFloat(document.getElementById('newSSSEnd').value) || 0;
    const ee_share = parseFloat(document.getElementById('newSSSEE').value) || 0;
    const er_share = parseFloat(document.getElementById('newSSSER').value) || 0;
    
    try {
        const { data, error } = await supabaseClient
            .from('sss_contributions')
            .insert([{ range_start, range_end, ee_share, er_share }])
            .select();
        
        if (error) throw error;
        
        hideModal('addSSSModal');
        loadSSS();
        document.getElementById('sssStatus').innerHTML = `<div class="status-message success">SSS bracket added successfully!</div>`;
        setTimeout(() => document.getElementById('sssStatus').innerHTML = '', 3000);
        
    } catch (error) {
        console.error('Error adding SSS bracket:', error);
        alert('Error adding SSS bracket: ' + error.message);
    }
}

// Store SSS data for edit lookups
let allSSSData = [];

function editSSS(id) {
    const item = allSSSData.find(d => d.id === id);
    if (!item) return;
    document.getElementById('editSSSId').value = item.id;
    document.getElementById('editSSSStart').value = item.range_start;
    document.getElementById('editSSSEnd').value = item.range_end >= 9999999 ? '' : item.range_end;
    document.getElementById('editSSSEE').value = item.ee_share;
    document.getElementById('editSSSER').value = item.er_share;
    document.getElementById('editSSSModal').classList.add('active');
}

async function updateSSSBracket() {
    const id = parseInt(document.getElementById('editSSSId').value);
    const range_start = parseFloat(document.getElementById('editSSSStart').value) || 0;
    const range_endRaw = document.getElementById('editSSSEnd').value;
    const range_end = range_endRaw === '' ? 10000000 : parseFloat(range_endRaw) || 0;
    const ee_share = parseFloat(document.getElementById('editSSSEE').value) || 0;
    const er_share = parseFloat(document.getElementById('editSSSER').value) || 0;

    try {
        const { error } = await supabaseClient
            .from('sss_contributions')
            .update({ range_start, range_end, ee_share, er_share })
            .eq('id', id);

        if (error) throw error;

        hideModal('editSSSModal');
        loadSSS();
        document.getElementById('sssStatus').innerHTML = `<div class="status-message success">SSS bracket updated successfully!</div>`;
        setTimeout(() => document.getElementById('sssStatus').innerHTML = '', 3000);

    } catch (error) {
        console.error('Error updating SSS bracket:', error);
        alert('Error updating SSS bracket: ' + error.message);
    }
}

async function deleteSSS(id) {
    if (!confirm('Are you sure you want to delete this SSS bracket?')) return;
    
    try {
        const { error } = await supabaseClient
            .from('sss_contributions')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        loadSSS();
        document.getElementById('sssStatus').innerHTML = `<div class="status-message success">SSS bracket deleted successfully!</div>`;
        setTimeout(() => document.getElementById('sssStatus').innerHTML = '', 3000);
        
    } catch (error) {
        console.error('Error deleting SSS bracket:', error);
        alert('Error deleting SSS bracket: ' + error.message);
    }
}

// =====================================================
// SSS TABLES MANAGEMENT (Saved Tables)
// =====================================================
let currentEditingSSSTableId = null; // null = not editing a saved table

async function loadSSSTablesList() {
    try {
        const { data, error } = await supabaseClient
            .from('sss_tables')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;

        const tbody = document.getElementById('sssTablesListBody');
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No saved SSS tables. Save the current brackets to create one.</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(table => {
            const isLive = table.is_live;
            const modDate = table.updated_at ? new Date(table.updated_at).toLocaleDateString('en-AU', { year:'numeric', month:'short', day:'numeric' }) : '—';
            const liveBadge = isLive ? '<span class="sss-live-badge">● LIVE</span>' : '';
            return `<tr>
                <td style="text-align:center;"><input type="radio" class="sss-list-table live-toggle" name="liveSSSTable" ${isLive ? 'checked' : ''} onchange="setLiveSSSTable(${table.id})"></td>
                <td><strong>${table.name}</strong>${liveBadge}</td>
                <td style="color:var(--text-muted);">${table.bracket_count || '—'} brackets</td>
                <td style="font-size:0.8rem;color:var(--text-muted);">${modDate}</td>
                <td style="display:flex;gap:0.5rem;">
                    <button class="btn btn-secondary btn-sm" onclick="loadSSSTableForEdit(${table.id})">Edit</button>
                    <button class="btn btn-danger btn-sm" data-id="${table.id}" data-live="${isLive}" onclick="deleteSSSTableById(this)">Delete</button>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        console.error('Error loading SSS tables list:', err);
    }
}

async function loadSSSTableForEdit(tableId) {
    try {
        const { data, error } = await supabaseClient
            .from('sss_table_brackets')
            .select('*')
            .eq('table_id', tableId)
            .order('range_start');
        if (error) throw error;

        // Get table name
        const { data: tableData } = await supabaseClient.from('sss_tables').select('name').eq('id', tableId).single();

        currentEditingSSSTableId = tableId;
        allSSSData = data.map(b => ({
            id: b.id, range_start: b.range_start, range_end: b.range_end,
            ee_share: b.ee_share, er_share: b.er_share
        }));

        // Re-render the bracket table
        const tbody = document.getElementById('sssTableBody');
        if (allSSSData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">No brackets in this table.</td></tr>';
        } else {
            tbody.innerHTML = allSSSData.map(item => {
                const sc = Math.min(parseFloat(item.range_start), 30000);
                const rangeEndDisplay = item.range_end >= 9999999 ? 'No limit' : '₱' + parseFloat(item.range_end).toLocaleString();
                return `<tr>
                    <td>₱${parseFloat(item.range_start).toLocaleString()}</td>
                    <td>${rangeEndDisplay}</td>
                    <td style="font-weight:600;">₱${sc.toLocaleString()}</td>
                    <td style="color:#166534;">₱${parseFloat(item.ee_share).toLocaleString()}</td>
                    <td style="color:#1e40af;">₱${parseFloat(item.er_share).toLocaleString()}</td>
                    <td class="actions">
                        <button class="btn btn-secondary btn-sm" onclick="editSSS(${item.id})">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteSSS(${item.id})">Delete</button>
                    </td>
                </tr>`;
            }).join('');
        }

        document.getElementById('editingSSSTitleBadge').textContent = tableData ? `Editing: ${tableData.name}` : '';
        document.getElementById('updateCurrentSSSBtn').style.display = 'inline-flex';
        document.getElementById('sssStatus').innerHTML = `<div class="status-message success">Loaded table for editing: <strong>${tableData?.name}</strong></div>`;
        setTimeout(() => document.getElementById('sssStatus').innerHTML = '', 3000);
    } catch (err) {
        console.error('Error loading SSS table for edit:', err);
        alert('Error loading SSS table: ' + err.message);
    }
}

function showSaveSSSTableModal() {
    document.getElementById('newSSSTableName').value = '';
    document.getElementById('saveSSSTableModal').classList.add('active');
}

async function saveSSSTableToDB() {
    const name = document.getElementById('newSSSTableName').value.trim();
    if (!name) { alert('Please enter a table name'); return; }

    try {
        // Create the table record
        const { data: newTable, error: tableErr } = await supabaseClient
            .from('sss_tables')
            .insert([{ name, is_live: false, bracket_count: allSSSData.length }])
            .select()
            .single();
        if (tableErr) throw tableErr;

        // Copy current brackets into sss_table_brackets
        if (allSSSData.length > 0) {
            const brackets = allSSSData.map(b => ({
                table_id: newTable.id,
                range_start: b.range_start,
                range_end: b.range_end,
                ee_share: b.ee_share,
                er_share: b.er_share
            }));
            const { error: bErr } = await supabaseClient.from('sss_table_brackets').insert(brackets);
            if (bErr) throw bErr;
        }

        currentEditingSSSTableId = newTable.id;
        hideModal('saveSSSTableModal');
        loadSSSTablesList();
        document.getElementById('editingSSSTitleBadge').textContent = `Editing: ${name}`;
        document.getElementById('updateCurrentSSSBtn').style.display = 'inline-flex';
        document.getElementById('sssStatus').innerHTML = `<div class="status-message success">SSS Table "<strong>${name}</strong>" saved successfully!</div>`;
        setTimeout(() => document.getElementById('sssStatus').innerHTML = '', 3000);
    } catch (err) {
        console.error('Error saving SSS table:', err);
        alert('Error saving SSS table: ' + err.message);
    }
}

async function updateCurrentSSSTableInDB() {
    if (!currentEditingSSSTableId) {
        alert('No table selected. Please save as a new table first.');
        return;
    }
    try {
        // Delete old brackets for this table
        const { error: delErr } = await supabaseClient.from('sss_table_brackets').delete().eq('table_id', currentEditingSSSTableId);
        if (delErr) throw delErr;

        // Re-insert current brackets
        if (allSSSData.length > 0) {
            const brackets = allSSSData.map(b => ({
                table_id: currentEditingSSSTableId,
                range_start: b.range_start,
                range_end: b.range_end,
                ee_share: b.ee_share,
                er_share: b.er_share
            }));
            const { error: insErr } = await supabaseClient.from('sss_table_brackets').insert(brackets);
            if (insErr) throw insErr;
        }
        // Update table metadata
        await supabaseClient.from('sss_tables').update({ bracket_count: allSSSData.length, updated_at: new Date().toISOString() }).eq('id', currentEditingSSSTableId);

        loadSSSTablesList();
        document.getElementById('sssStatus').innerHTML = `<div class="status-message success">Table updated successfully!</div>`;
        setTimeout(() => document.getElementById('sssStatus').innerHTML = '', 3000);
    } catch (err) {
        console.error('Error updating SSS table:', err);
        alert('Error updating SSS table: ' + err.message);
    }
}

async function setLiveSSSTable(tableId) {
    try {
        // Set all to false
        await supabaseClient.from('sss_tables').update({ is_live: false }).neq('id', 0);
        // Set selected to true
        const { error } = await supabaseClient.from('sss_tables').update({ is_live: true }).eq('id', tableId);
        if (error) throw error;
        loadSSSTablesList();
        document.getElementById('sssStatus').innerHTML = `<div class="status-message success">Live SSS table updated!</div>`;
        setTimeout(() => document.getElementById('sssStatus').innerHTML = '', 3000);
    } catch (err) {
        console.error('Error setting live SSS table:', err);
        alert('Error: ' + err.message);
    }
}

function deleteSSSTableById(btn) {
    const tableId = parseInt(btn.dataset.id);
    const isLive = btn.dataset.live === 'true';
    // Find name from allSSSTableData or from the row
    const nameEl = btn.closest('tr').querySelector('td:nth-child(2) strong');
    const tableName = nameEl ? nameEl.textContent : 'this table';
    deleteSSSTable(tableId, tableName, isLive);
}

async function deleteSSSTable(tableId, tableName, isLive) {
    if (isLive) { alert('Cannot delete the live table. Please set another table as live first.'); return; }
    if (!confirm(`Delete SSS table "${tableName}"? This cannot be undone.`)) return;
    try {
        await supabaseClient.from('sss_table_brackets').delete().eq('table_id', tableId);
        const { error } = await supabaseClient.from('sss_tables').delete().eq('id', tableId);
        if (error) throw error;
        if (currentEditingSSSTableId === tableId) {
            currentEditingSSSTableId = null;
            document.getElementById('editingSSSTitleBadge').textContent = '';
            document.getElementById('updateCurrentSSSBtn').style.display = 'none';
        }
        loadSSSTablesList();
        document.getElementById('sssStatus').innerHTML = `<div class="status-message success">Table "${tableName}" deleted.</div>`;
        setTimeout(() => document.getElementById('sssStatus').innerHTML = '', 3000);
    } catch (err) {
        console.error('Error deleting SSS table:', err);
        alert('Error: ' + err.message);
    }
}

// =====================================================
