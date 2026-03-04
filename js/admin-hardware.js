// =====================================================
// HARDWARE CRUD
// =====================================================
let allHardwareData = [];

function renderHardwareTable(data) {
    const currencies = ['AUD','USD','GBP','HKD','SGD','CAD','EUR','NZD'];
    const fmt = (v) => v != null && v !== '' ? parseFloat(v).toFixed(2) : '-';
    const tbody = document.getElementById('hardwareTableBody');
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="22" style="text-align:center;color:var(--text-muted);padding:2rem;">No products match your filters.</td></tr>';
        return;
    }
    tbody.innerHTML = data.map(item => `
        <tr>
            <td><strong>${item.name}</strong></td>
            <td>${item.category || '-'}</td>
            <td title="${item.sku || ''}">${item.sku || '-'}</td>
            ${currencies.map(c => `
            <td>${fmt(item['price_' + c.toLowerCase() + '_rrp'])}</td>
            <td>${fmt(item['price_' + c.toLowerCase() + '_elevate'])}</td>
            `).join('')}
            <td class="actions">
                <button class="btn btn-secondary btn-sm" onclick="editHardware(${item.id})">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteHardware(${item.id})">Delete</button>
            </td>
        </tr>
    `).join('');
}

function populateHardwareCategoryFilter(data) {
    const sel = document.getElementById('hardwareCategoryFilter');
    const current = sel.value;
    const cats = [...new Set(data.map(d => d.category).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">All Categories</option>' +
        cats.map(c => `<option value="${c}"${c === current ? ' selected' : ''}>${c}</option>`).join('');
}

function filterHardware() {
    const search = (document.getElementById('hardwareSearch').value || '').toLowerCase().trim();
    const category = document.getElementById('hardwareCategoryFilter').value;
    const currencies = ['AUD','USD','GBP','HKD','SGD','CAD','EUR','NZD'];

    let filtered = allHardwareData;

    if (category) {
        filtered = filtered.filter(d => d.category === category);
    }

    if (search) {
        filtered = filtered.filter(d => {
            if ((d.name || '').toLowerCase().includes(search)) return true;
            if ((d.sku || '').toLowerCase().includes(search)) return true;
            if ((d.category || '').toLowerCase().includes(search)) return true;
            // Search prices
            for (const c of currencies) {
                const rrp = d['price_' + c.toLowerCase() + '_rrp'];
                const elv = d['price_' + c.toLowerCase() + '_elevate'];
                if (rrp != null && String(parseFloat(rrp).toFixed(2)).includes(search)) return true;
                if (elv != null && String(parseFloat(elv).toFixed(2)).includes(search)) return true;
            }
            return false;
        });
    }

    renderHardwareTable(filtered);

    const total = allHardwareData.length;
    const shown = filtered.length;
    const countEl = document.getElementById('hardwareFilterCount');
    const clearBtn = document.getElementById('hardwareClearBtn');
    countEl.textContent = (search || category) ? `Showing ${shown} of ${total}` : `${total} products`;
    clearBtn.style.display = (search || category) ? 'inline-block' : 'none';
}

function clearHardwareFilters() {
    document.getElementById('hardwareSearch').value = '';
    document.getElementById('hardwareCategoryFilter').value = '';
    filterHardware();
}

async function loadHardware() {
    try {
        const { data, error } = await supabaseClient
            .from('hardware_products')
            .select('*')
            .order('name');
        
        if (error) throw error;

        allHardwareData = data;

        const tbody = document.getElementById('hardwareTableBody');
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="22" style="text-align:center;color:var(--text-muted);">No hardware products found. Click "+ Add Product" to add one.</td></tr>';
            return;
        }

        populateHardwareCategoryFilter(data);
        filterHardware();
        
    } catch (error) {
        console.error('Error loading hardware:', error);
        document.getElementById('hardwareStatus').innerHTML = `<div class="status-message error">Error loading hardware: ${error.message}</div>`;
    }
}

function showAddHardwareModal() {
    const currencies = ['AUD','USD','GBP','HKD','SGD','CAD','EUR','NZD'];
    document.getElementById('newHardwareName').value = '';
    document.getElementById('newHardwareCategory').value = '';
    document.getElementById('newHardwareSku').value = '';
    currencies.forEach(c => {
        document.getElementById(`newHardware${c}Rrp`).value = '';
        document.getElementById(`newHardware${c}Elevate`).value = '';
    });
    document.getElementById('addHardwareModal').classList.add('active');
}

async function addHardware() {
    const currencies = ['AUD','USD','GBP','HKD','SGD','CAD','EUR','NZD'];
    const name = document.getElementById('newHardwareName').value.trim();
    const category = document.getElementById('newHardwareCategory').value.trim();
    const sku = document.getElementById('newHardwareSku').value.trim();
    
    if (!name) {
        alert('Product name is required');
        return;
    }
    
    const record = { name, category, sku };
    currencies.forEach(c => {
        const rrp = document.getElementById(`newHardware${c}Rrp`).value;
        const elev = document.getElementById(`newHardware${c}Elevate`).value;
        record[`price_${c.toLowerCase()}_rrp`] = rrp !== '' ? parseFloat(rrp) : null;
        record[`price_${c.toLowerCase()}_elevate`] = elev !== '' ? parseFloat(elev) : null;
    });
    
    try {
        const { data, error } = await supabaseClient
            .from('hardware_products')
            .insert([record])
            .select();
        
        if (error) throw error;
        
        hideModal('addHardwareModal');
        loadHardware();
        document.getElementById('hardwareStatus').innerHTML = `<div class="status-message success">Product "${name}" added successfully!</div>`;
        setTimeout(() => document.getElementById('hardwareStatus').innerHTML = '', 3000);
        
    } catch (error) {
        console.error('Error adding hardware:', error);
        alert('Error adding hardware: ' + error.message);
    }
}

async function deleteHardware(id) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    
    try {
        const { error } = await supabaseClient
            .from('hardware_products')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        loadHardware();
        document.getElementById('hardwareStatus').innerHTML = `<div class="status-message success">Product deleted successfully!</div>`;
        setTimeout(() => document.getElementById('hardwareStatus').innerHTML = '', 3000);
        
    } catch (error) {
        console.error('Error deleting hardware:', error);
        alert('Error deleting hardware: ' + error.message);
    }
}

async function editHardware(id) {
    const currencies = ['AUD','USD','GBP','HKD','SGD','CAD','EUR','NZD'];
    try {
        const { data, error } = await supabaseClient
            .from('hardware_products')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        
        document.getElementById('editHardwareId').value = data.id;
        document.getElementById('editHardwareName').value = data.name;
        document.getElementById('editHardwareCategory').value = data.category || '';
        document.getElementById('editHardwareSku').value = data.sku || '';
        currencies.forEach(c => {
            const rrpVal = data[`price_${c.toLowerCase()}_rrp`];
            const elevVal = data[`price_${c.toLowerCase()}_elevate`];
            document.getElementById(`editHardware${c}Rrp`).value = rrpVal != null ? rrpVal : '';
            document.getElementById(`editHardware${c}Elevate`).value = elevVal != null ? elevVal : '';
        });
        document.getElementById('editHardwareModal').classList.add('active');
        
    } catch (error) {
        console.error('Error loading hardware:', error);
        alert('Error loading hardware: ' + error.message);
    }
}

async function saveHardware() {
    const currencies = ['AUD','USD','GBP','HKD','SGD','CAD','EUR','NZD'];
    const id = document.getElementById('editHardwareId').value;
    const name = document.getElementById('editHardwareName').value.trim();
    const category = document.getElementById('editHardwareCategory').value.trim();
    const sku = document.getElementById('editHardwareSku').value.trim();
    
    if (!name) {
        alert('Product name is required');
        return;
    }
    
    const record = { name, category, sku };
    currencies.forEach(c => {
        const rrp = document.getElementById(`editHardware${c}Rrp`).value;
        const elev = document.getElementById(`editHardware${c}Elevate`).value;
        record[`price_${c.toLowerCase()}_rrp`] = rrp !== '' ? parseFloat(rrp) : null;
        record[`price_${c.toLowerCase()}_elevate`] = elev !== '' ? parseFloat(elev) : null;
    });
    
    try {
        const { error } = await supabaseClient
            .from('hardware_products')
            .update(record)
            .eq('id', id);
        
        if (error) throw error;
        
        hideModal('editHardwareModal');
        loadHardware();
        document.getElementById('hardwareStatus').innerHTML = `<div class="status-message success">Product updated successfully!</div>`;
        setTimeout(() => document.getElementById('hardwareStatus').innerHTML = '', 3000);
        
    } catch (error) {
        console.error('Error updating hardware:', error);
        alert('Error updating hardware: ' + error.message);
    }
}

