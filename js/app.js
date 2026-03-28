// =====================================================
// BUILD VERSION
// =====================================================
const APP_VERSION = 'v13 r31 modular';
const APP_BUILD   = '2026-03-28';

(function setVersionStamps() {
    const stamp = `${APP_VERSION} · build ${APP_BUILD}`;
    const loginEl = document.getElementById('loginVersionStamp');
    if (loginEl) loginEl.textContent = stamp;
    const sidebarEl = document.getElementById('sidebarVersionStamp');
    if (sidebarEl) sidebarEl.textContent = stamp;
})();

// =====================================================
// APP INITIALIZATION
// =====================================================
function initializeApp() {
    const role = currentUser ? currentUser.role : '';
    const isAdmin = role === 'Admin';
    const isSales = role === 'Sales';

    // Update user info display
    document.getElementById('userInfo').innerHTML = `
        <div class="user-name">${currentUser.name || currentUser.email}</div>
        <div class="user-role">${role}</div>
    `;

    // ── Nav visibility ────────────────────────────────
    // admin-only: visible to Admin only
    document.querySelectorAll('.admin-only').forEach(el => {
        el.classList.toggle('visible', isAdmin);
    });
    // sales-visible: visible to both Admin and Sales (Salary Ranges nav item)
    document.querySelectorAll('.sales-visible').forEach(el => {
        el.classList.toggle('visible', isAdmin || isSales);
    });

    // "View Only" badge on Salary Ranges nav item — show for Sales only
    const salaryBadge = document.getElementById('salaryViewOnlyBadge');
    if (salaryBadge) salaryBadge.style.display = isSales ? 'inline' : 'none';

    // ── Calculator: Detailed Breakdown visible to all roles ─
    // Sales users can see the breakdown but content is copy-protected
    const breakdown = document.getElementById('edcDetailedBreakdown');
    if (breakdown) {
        breakdown.classList.remove('sales-hidden');
        if (isSales) {
            breakdown.classList.add('breakdown-protected');
        } else {
            breakdown.classList.remove('breakdown-protected');
        }
    }

    // ── Salary Ranges: hide CRUD for Sales ───────────
    // Handled dynamically in renderSalaryTable() via isSalesUser()

    // Load initial data
    loadUsers();
    loadHardware();
    loadSalaryRanges();
    loadQuotes();
    loadBenefits();
    loadSSS();
    loadSSSTablesList();
    loadHMORates();
    loadNightMeals();
    loadFXRates();
    initCalculator();
    loadPriceBooks();
}

// Helper: returns true when current user is Sales role
function isSalesUser() {
    return currentUser && currentUser.role === 'Sales';
}


// =====================================================
// SIDEBAR COLLAPSE
// =====================================================
function toggleSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const main    = document.querySelector('.main-content');
    const isCollapsed = sidebar.classList.toggle('collapsed');
    main.classList.toggle('collapsed', isCollapsed);
    sessionStorage.setItem('sidebarCollapsed', isCollapsed ? '1' : '0');
}

// Restore sidebar state on load
(function() {
    if (sessionStorage.getItem('sidebarCollapsed') === '1') {
        const sidebar = document.getElementById('appSidebar');
        const main    = document.querySelector('.main-content');
        if (sidebar) sidebar.classList.add('collapsed');
        if (main)    main.classList.add('collapsed');
    }
})();

// =====================================================
// NAVIGATION
// =====================================================
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        const page = this.dataset.page;
        
        // Update nav
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        this.classList.add('active');
        
        // Show page
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('page-' + page).classList.add('active');

        // Reset editing state when clicking Calculator nav
        if (page === 'calculator') {
            currentEditingQuoteId = null;
            hideEditingBanner();
            const saveBtn = document.getElementById('saveQuoteBtn');
            if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1'; saveBtn.style.cursor = 'pointer'; saveBtn.title = ''; }
        }

        // Reset editing state when clicking Colombia Calculator nav
        if (page === 'calculator-co') {
            currentEditingQuoteIdCO = null;
            hideEditingBannerCO();
            const saveBtn = document.getElementById('coSaveQuoteBtn');
            if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1'; saveBtn.style.cursor = 'pointer'; saveBtn.title = ''; }
            // Render immediately with defaults, then load live data
            calculateCO();
            if (!coFXData.length) initCalculatorCO();
        }

        // Refresh price books editor when navigating to it
        if (page === 'price-books') {
            loadPriceBooks();
        }
    });
});


// Hardware currency grids (must run after DOM ready)
// =====================================================
// BUILD HARDWARE CURRENCY GRIDS
// =====================================================
(function buildHardwareCurrencyGrids() {
    const currencies = ['AUD','USD','GBP','HKD','SGD','CAD','EUR','NZD'];
    const inputStyle = 'width:100%; padding:0.5rem 0.75rem; font-size:0.875rem; border:1px solid var(--border); border-radius:8px;';
    const gridStyle = 'display:grid; grid-template-columns: auto 1fr 1fr; gap: 0.5rem; align-items: center;';
    
    function buildGrid(prefix) {
        let html = `<div style="${gridStyle}">`;
        html += `<div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);"></div>`;
        html += `<div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-align:center;">RRP Price</div>`;
        html += `<div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-align:center;">Elevate Price</div>`;
        currencies.forEach(c => {
            html += `<div style="font-size:0.8125rem;font-weight:600;color:var(--text);background:var(--surface);padding:0.375rem 0.625rem;border-radius:6px;text-align:center;">${c}</div>`;
            html += `<div><input type="number" id="${prefix}${c}Rrp" placeholder="0.00" step="0.01" style="${inputStyle}"></div>`;
            html += `<div><input type="number" id="${prefix}${c}Elevate" placeholder="0.00" step="0.01" style="${inputStyle}"></div>`;
        });
        html += '</div>';
        return html;
    }
    
    document.getElementById('addHardwareCurrencyGrid').innerHTML = buildGrid('newHardware');
    document.getElementById('editHardwareCurrencyGrid').innerHTML = buildGrid('editHardware');
})();

checkLogin();
