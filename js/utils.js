// =====================================================
// MODAL HELPERS
// =====================================================
function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}
function hideModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Close modal on backdrop click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.remove('active');
        }
    });
});

// =====================================================
// DATE/TIME
// =====================================================
function updateDateTime() {
    const now = new Date();
    const formatted = now.toLocaleString('en-AU', { 
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
    document.getElementById('currentDateTime').textContent = formatted;
}
setInterval(updateDateTime, 1000);
updateDateTime();

function fmtCurr(amount, currency) {
    return (CURR_SYMBOLS[currency] || '') + Number(amount).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function fmtRange(a, b, curr) {
    if (a === b) return fmtCurr(a, curr);
    return fmtCurr(a, curr) + ' to ' + fmtCurr(b, curr);
}
