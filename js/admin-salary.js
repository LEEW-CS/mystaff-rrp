// =====================================================
// SALARY RANGES CRUD
// =====================================================
// =====================================================
// SALARY RANGES CRUD
// =====================================================
let salaryAllData = [];
let salaryFiltered = [];
let salaryCurrentPage = 1;
const SALARY_PAGE_SIZE = 50;

async function loadSalaryRanges() {
    try {
        // Paginate in batches of 500 to bypass Supabase server-side row limits
        const PAGE = 500;
        let allRows = [];
        let from = 0;
        let keepFetching = true;

        while (keepFetching) {
            const { data, error } = await supabaseClient
                .from('salary_ranges')
                .select('*')
                .order('category')
                .order('job_title')
                .range(from, from + PAGE - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                allRows = allRows.concat(data);
                from += PAGE;
                keepFetching = data.length === PAGE; // stop if fewer than PAGE returned
            } else {
                keepFetching = false;
            }
        }

        salaryAllData = allRows;
        salaryFiltered = allRows;

        // Populate category filter
        const cats = [...new Set(allRows.map(d => d.category).filter(Boolean))].sort();
        const sel = document.getElementById('salaryCategory');
        sel.innerHTML = '<option value="">All Categories</option>' +
            cats.map(c => `<option value="${c}">${c}</option>`).join('');

        salaryCurrentPage = 1;
        renderSalaryTable();

        // Also populate the calculator's category browse dropdown
        populateRoleBrowseCategories();

    } catch (error) {
        console.error('Error loading salary ranges:', error);
        document.getElementById('salaryStatus').innerHTML = `<div class="status-message error">Error loading salary data: ${error.message}</div>`;
    }
}

function filterSalaries() {
    const search = document.getElementById('salarySearch').value.toLowerCase();
    const cat = document.getElementById('salaryCategory').value;
    salaryFiltered = salaryAllData.filter(d => {
        const matchCat = !cat || d.category === cat;
        const matchSearch = !search || (d.job_title && d.job_title.toLowerCase().includes(search))
            || (d.jpid_level && d.jpid_level.toLowerCase().includes(search));
        return matchCat && matchSearch;
    });
    salaryCurrentPage = 1;
    renderSalaryTable();
}

function clearSalaryFilters() {
    document.getElementById('salarySearch').value = '';
    document.getElementById('salaryCategory').value = '';
    filterSalaries();
}

function changeSalaryPage(dir) {
    const totalPages = Math.ceil(salaryFiltered.length / SALARY_PAGE_SIZE);
    salaryCurrentPage = Math.max(1, Math.min(totalPages, salaryCurrentPage + dir));
    renderSalaryTable();
}

function renderSalaryTable() {
    const tbody = document.getElementById('salaryTableBody');
    const total = salaryFiltered.length;
    const totalPages = Math.ceil(total / SALARY_PAGE_SIZE);
    const start = (salaryCurrentPage - 1) * SALARY_PAGE_SIZE;
    const page = salaryFiltered.slice(start, start + SALARY_PAGE_SIZE);

    document.getElementById('salaryCount').textContent =
        `Showing ${start + 1}–${Math.min(start + SALARY_PAGE_SIZE, total)} of ${total.toLocaleString()} roles`;
    document.getElementById('salaryPageInfo').textContent =
        `Page ${salaryCurrentPage} of ${totalPages || 1}`;
    document.getElementById('salaryPrevBtn').disabled = salaryCurrentPage <= 1;
    document.getElementById('salaryNextBtn').disabled = salaryCurrentPage >= totalPages;

    // Show/hide CRUD controls based on role
    const salesMode = isSalesUser();
    const addRoleBtn = document.querySelector('#page-salary-ranges .btn-primary');
    if (addRoleBtn) addRoleBtn.style.display = salesMode ? 'none' : '';

    if (page.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${salesMode ? 7 : 8}" style="text-align:center; color:var(--text-muted);">No roles found.</td></tr>`;
        return;
    }

    const fmt = v => v != null ? '₱' + parseInt(v).toLocaleString() : '-';

    tbody.innerHTML = page.map(item => `
        <tr>
            <td><span style="font-size:0.75rem; background:var(--surface); padding:0.2rem 0.5rem; border-radius:4px; white-space:nowrap;">${item.category || '-'}</span></td>
            <td style="font-family:'Space Mono',monospace; font-size:0.75rem;">${item.jpid_level || '-'}</td>
            <td><strong>${item.job_title}</strong></td>
            <td style="font-size:0.8rem; color:var(--text-muted);">${item.years_experience || '-'}</td>
            <td style="text-align:right; font-size:0.85rem;">${fmt(item.low_salary)}</td>
            <td style="text-align:right; font-size:0.85rem; font-weight:600;">${fmt(item.median_salary)}</td>
            <td style="text-align:right; font-size:0.85rem;">${fmt(item.high_salary)}</td>
            ${salesMode ? '' : `<td class="actions">
                <button class="btn btn-secondary btn-sm" onclick="editSalary(${item.id})">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteSalary(${item.id})">Delete</button>
            </td>`}
        </tr>
    `).join('');

    // Show/hide Actions column header
    const actionsHeader = document.querySelector('#salaryTable thead th:last-child');
    if (actionsHeader) actionsHeader.style.display = salesMode ? 'none' : '';
}

function showAddSalaryModal() {
    ['newSalaryCategory','newSalaryJpid','newSalaryJobTitle','newSalaryYears',
     'newSalaryLow','newSalaryMedian','newSalaryHigh'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('addSalaryModal').classList.add('active');
}

async function addSalaryRange() {
    const category = document.getElementById('newSalaryCategory').value.trim();
    const jpid_level = document.getElementById('newSalaryJpid').value.trim();
    const job_title = document.getElementById('newSalaryJobTitle').value.trim();
    const years_experience = document.getElementById('newSalaryYears').value.trim();
    const low_salary = parseFloat(document.getElementById('newSalaryLow').value) || null;
    const median_salary = parseFloat(document.getElementById('newSalaryMedian').value) || null;
    const high_salary = parseFloat(document.getElementById('newSalaryHigh').value) || null;

    if (!job_title) { alert('Job Title is required'); return; }
    if (!category) { alert('Category is required'); return; }

    try {
        const { error } = await supabaseClient
            .from('salary_ranges')
            .insert([{ category, jpid_level, job_title, years_experience, low_salary, median_salary, high_salary }]);

        if (error) throw error;

        hideModal('addSalaryModal');
        loadSalaryRanges();
        document.getElementById('salaryStatus').innerHTML = `<div class="status-message success">Role "${job_title}" added successfully!</div>`;
        setTimeout(() => document.getElementById('salaryStatus').innerHTML = '', 3000);

    } catch (error) {
        console.error('Error adding role:', error);
        alert('Error adding role: ' + error.message);
    }
}

async function deleteSalary(id) {
    if (!confirm('Are you sure you want to delete this role?')) return;
    try {
        const { error } = await supabaseClient
            .from('salary_ranges')
            .delete()
            .eq('id', id);

        if (error) throw error;

        loadSalaryRanges();
        document.getElementById('salaryStatus').innerHTML = `<div class="status-message success">Role deleted successfully!</div>`;
        setTimeout(() => document.getElementById('salaryStatus').innerHTML = '', 3000);

    } catch (error) {
        console.error('Error deleting role:', error);
        alert('Error deleting role: ' + error.message);
    }
}

async function editSalary(id) {
    const item = salaryAllData.find(d => d.id === id);
    if (!item) { alert('Role not found'); return; }

    document.getElementById('editSalaryId').value = item.id;
    document.getElementById('editSalaryCategory').value = item.category || '';
    document.getElementById('editSalaryJpid').value = item.jpid_level || '';
    document.getElementById('editSalaryJobTitle').value = item.job_title || '';
    document.getElementById('editSalaryYears').value = item.years_experience || '';
    document.getElementById('editSalaryLow').value = item.low_salary ?? '';
    document.getElementById('editSalaryMedian').value = item.median_salary ?? '';
    document.getElementById('editSalaryHigh').value = item.high_salary ?? '';
    document.getElementById('editSalaryModal').classList.add('active');
}

async function saveSalaryRange() {
    const id = document.getElementById('editSalaryId').value;
    const category = document.getElementById('editSalaryCategory').value.trim();
    const jpid_level = document.getElementById('editSalaryJpid').value.trim();
    const job_title = document.getElementById('editSalaryJobTitle').value.trim();
    const years_experience = document.getElementById('editSalaryYears').value.trim();
    const low_salary = parseFloat(document.getElementById('editSalaryLow').value) || null;
    const median_salary = parseFloat(document.getElementById('editSalaryMedian').value) || null;
    const high_salary = parseFloat(document.getElementById('editSalaryHigh').value) || null;

    if (!job_title) { alert('Job Title is required'); return; }
    if (!category) { alert('Category is required'); return; }

    try {
        const { error } = await supabaseClient
            .from('salary_ranges')
            .update({ category, jpid_level, job_title, years_experience, low_salary, median_salary, high_salary })
            .eq('id', id);

        if (error) throw error;

        hideModal('editSalaryModal');
        loadSalaryRanges();
        document.getElementById('salaryStatus').innerHTML = `<div class="status-message success">Role updated successfully!</div>`;
        setTimeout(() => document.getElementById('salaryStatus').innerHTML = '', 3000);

    } catch (error) {
        console.error('Error updating role:', error);
        alert('Error updating role: ' + error.message);
    }
}

