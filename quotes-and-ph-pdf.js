// =====================================================
// LOAD / DISPLAY QUOTES (Saved Quotes page)
// =====================================================
async function loadQuotes() {
    try {
        const { data, error } = await supabaseClient
            .from('quotes')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        allQuotesData = data || [];
        renderQuotesTable(allQuotesData);
    } catch(e) {
        console.error('Quotes load error:', e);
        document.getElementById('quotesTableBody').innerHTML =
            `<tr><td colspan="8" style="text-align:center;color:#ef4444;">Error loading quotes: ${e.message}</td></tr>`;
    }
}

function renderQuotesTable(quotes) {
    const tbody = document.getElementById('quotesTableBody');
    const noMsg = document.getElementById('noQuotesMessage');
    const table = document.getElementById('quotesTable');
    if (!quotes.length) {
        table.style.display = 'none';
        noMsg.style.display = 'block';
        return;
    }
    table.style.display = '';
    noMsg.style.display = 'none';
    tbody.innerHTML = quotes.map(q => {
        const isOwner = currentUser && (currentUser.name === q.created_by || currentUser.email === q.created_by);
        const isAdmin = currentUser && currentUser.role === 'Admin';
        const canDelete = isOwner || isAdmin;
        const dateStr = q.created_at ? new Date(q.created_at).toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' }) : '--';
        const mkt = q.market || 'PH';
        const mktBadge = mkt === 'CO'
            ? '<span style="display:inline-block;background:#065f46;color:#fff;font-size:0.65rem;font-weight:700;padding:0.1rem 0.4rem;border-radius:4px;margin-left:0.4rem;">CO</span>'
            : '<span style="display:inline-block;background:#1e40af;color:#fff;font-size:0.65rem;font-weight:700;padding:0.1rem 0.4rem;border-radius:4px;margin-left:0.4rem;">PH</span>';
        const loadFn = mkt === 'CO' ? 'loadQuoteIntoCalcCO' : 'loadQuoteIntoCalc';
        return `<tr>
            <td style="font-family:'Space Mono',monospace;font-weight:600;color:var(--accent);">${q.quote_number || 'N/A'}${mktBadge}</td>
            <td><strong>${q.quote_name || '--'}</strong>${q.description ? `<br><span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">${q.description}</span>` : ''}</td>
            <td>${q.candidate_name || '--'}</td>
            <td>${q.role_name || '--'}</td>
            <td style="font-family:'Space Mono',monospace;font-weight:600;">${q.total_monthly || '--'}</td>
            <td>${q.created_by || '--'}</td>
            <td style="font-size:0.75rem;color:var(--text-muted);">${dateStr}</td>
            <td class="actions">
                <button class="btn btn-secondary btn-sm" onclick="${loadFn}(${JSON.stringify(q).replace(/"/g,'&quot;')})">${mkt === 'CO' ? 'Load CO' : 'Load'}</button>
                ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteQuote(${q.id})">Delete</button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

function filterQuotes() {
    const q = document.getElementById('quotesSearch').value.toLowerCase();
    if (!q) { renderQuotesTable(allQuotesData); return; }
    const filtered = allQuotesData.filter(qt =>
        (qt.quote_number && qt.quote_number.toLowerCase().includes(q)) ||
        (qt.quote_name && qt.quote_name.toLowerCase().includes(q)) ||
        (qt.candidate_name && qt.candidate_name.toLowerCase().includes(q)) ||
        (qt.created_by && qt.created_by.toLowerCase().includes(q)) ||
        (qt.role_name && qt.role_name.toLowerCase().includes(q))
    );
    renderQuotesTable(filtered);
}

async function deleteQuote(id) {
    if (!confirm('Are you sure you want to delete this quote?')) return;
    try {
        const { error } = await supabaseClient.from('quotes').delete().eq('id', id);
        if (error) throw error;
        await loadQuotes();
    } catch(e) { alert('Error deleting quote: ' + e.message); }
}

// =====================================================
// PDF GENERATION
// =====================================================
function generatePDF() {
    const candidateName = document.getElementById('candidateName').value || 'To Be Advised';
    const roleName = document.getElementById('roleSearchInput').value || document.getElementById('roleName').value || 'To Be Advised';
    const currency = document.getElementById('currency').value;
    const priceBook = document.getElementById('priceBook').value;
    const fxDate = document.getElementById('resultFXDate').textContent;
    const fxRate = document.getElementById('resultFXRate').textContent;
    const baseSalary = document.getElementById('resultBaseSalary').textContent;
    const edc = document.getElementById('resultEDC').textContent;
    const csFee = document.getElementById('resultCSFee').textContent;
    const mpcFee = document.getElementById('resultMPC').textContent;
    const mpcProduct = document.getElementById('resultMPCProduct').textContent;
    const totalMonthly = document.getElementById('resultTotalMonthly').textContent;
    const setupFee = document.getElementById('resultSetup').textContent;
    const deposit = document.getElementById('resultDeposit').textContent;
    const easyLeave = document.getElementById('resultEasyLeave').textContent;
    const validity = document.getElementById('quoteValidity').textContent;
    const dayRate = document.getElementById('resultDayRate').textContent;
    const hourlyRate = document.getElementById('resultHourlyRate').textContent;
    const userName = currentUser ? (currentUser.name || currentUser.email || 'Cloudstaff') : 'Cloudstaff';
    const genDate = new Date().toLocaleDateString('en-AU', {day:'numeric', month:'long', year:'numeric'});

    const pdfHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Quote For Supply Of Outsourcing Services — ${candidateName}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
  body { font-family:'Inter',sans-serif; max-width:750px; margin:0 auto; padding:28px 28px 20px; color:#1e293b; font-size:12px; line-height:1.45; }

  /* ── Header ── */
  .hdr { display:flex; justify-content:space-between; align-items:center; padding-bottom:14px; border-bottom:2px solid #e2e8f0; margin-bottom:16px; }
  .hdr-logo img { height:36px; width:auto; }
  .hdr-meta { text-align:right; }
  .hdr-meta .doc-title { font-size:15px; font-weight:700; color:#1e293b; margin-bottom:2px; }
  .hdr-meta .doc-date { font-size:10px; color:#64748b; }

  /* ── Preamble ── */
  .preamble { background:#f8fafc; border-left:3px solid #3b82f6; border-radius:0 8px 8px 0; padding:12px 16px; margin-bottom:16px; }
  .preamble p { color:#334155; font-size:11.5px; line-height:1.6; }
  .preamble .regards { margin-top:10px; color:#334155; font-size:11.5px; }
  .preamble .regards strong { display:block; margin-top:3px; color:#1e293b; font-size:12px; }

  /* ── Candidate info band ── */
  .info-band { background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%); border-radius:8px; padding:12px 16px; margin-bottom:14px; display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  .info-band .item .lbl { font-size:8px; text-transform:uppercase; letter-spacing:.07em; color:rgba(255,255,255,.65); font-weight:600; margin-bottom:2px; }
  .info-band .item .val { font-size:12.5px; font-weight:700; color:#fff; }

  /* ── Section ── */
  .sec { margin-bottom:12px; }
  .stitle { font-size:8.5px; text-transform:uppercase; letter-spacing:.07em; color:#94a3b8; font-weight:700; margin-bottom:6px; padding-bottom:3px; border-bottom:1px solid #f1f5f9; }

  /* ── Tiles ── */
  .grid4 { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
  .grid2 { display:grid; grid-template-columns:repeat(2,1fr); gap:6px; }
  .tile { background:#f8fafc; border:1px solid #e2e8f0; border-radius:7px; padding:9px 11px; }
  .tile.blue { background:linear-gradient(135deg,#1e40af,#3b82f6); border:none; }
  .tile.green { background:linear-gradient(135deg,#065f46,#059669); border:none; }
  .tile .tl { font-size:8.5px; font-weight:600; margin-bottom:3px; color:#64748b; }
  .tile.blue .tl, .tile.green .tl { color:rgba(255,255,255,.75); }
  .tile .tv { font-size:13px; font-weight:700; font-family:'Courier New',monospace; color:#1e293b; }
  .tile.blue .tv, .tile.green .tv { color:#fff; }

  /* ── Validity bar ── */
  .validity { background:#f0fdf4; border:1px solid #86efac; border-radius:7px; padding:9px 14px; display:flex; justify-content:space-between; align-items:center; margin-top:6px; }
  .validity span:first-child { font-size:11px; font-weight:600; color:#166534; }
  .validity span:last-child { font-family:'Courier New',monospace; font-weight:700; color:#166534; font-size:12px; }

  /* ── Footer ── */
  .footer { margin-top:16px; padding-top:10px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; }
  .footer-left { font-size:9px; color:#94a3b8; }
  .footer-right img { height:18px; opacity:0.45; }

  @media print {
    @page { margin:10mm 12mm; size:A4; }
    body { padding:0; }
  }
</style>
</head>
<body>

<!-- Header -->
<div class="hdr">
  <div class="hdr-logo">
    <img src="https://info.cloudstaff.com/hubfs/001%20SALES/Tools/Cloudstaff-No%20Tagline-Landscape-Color-Positive-No%20Keyline.png" alt="Cloudstaff" crossorigin="anonymous">
  </div>
  <div class="hdr-meta">
    <div class="doc-title">Quote For Supply Of Outsourcing Services</div>
    <div class="doc-date">Generated ${genDate}</div>
  </div>
</div>

<!-- Preamble -->
<div class="preamble">
  <p>Thank you for your interest in Cloudstaff. The following quote has been prepared based on our discussions to date. The quote is indicative only. Base Salary is presented as a low to high range and will be updated once individual candidates are identified through our rigorous recruitment process. If you have questions, please always feel free to reach out to me directly. Thanks again.</p>
  <div class="regards">
    Kind Regards<strong>${userName}</strong>
  </div>
</div>

<!-- Candidate Info Band -->
<div class="info-band">
  <div class="item"><div class="lbl">Candidate</div><div class="val">${candidateName}</div></div>
  <div class="item"><div class="lbl">Role</div><div class="val">${roleName}</div></div>
  <div class="item"><div class="lbl">Base Salary Range</div><div class="val">${baseSalary}</div></div>
  <div class="item"><div class="lbl">Currency</div><div class="val">${currency}</div></div>
  <div class="item"><div class="lbl">Price Book</div><div class="val">${priceBook}</div></div>
  <div class="item"><div class="lbl">Hardware</div><div class="val">${mpcProduct}</div></div>
</div>

<!-- Monthly Costs -->
<div class="sec">
  <div class="stitle">Monthly Recurring Costs</div>
  <div class="grid4">
    <div class="tile blue"><div class="tl">Monthly EDC</div><div class="tv">${edc}</div></div>
    <div class="tile blue"><div class="tl">Monthly CS Fee</div><div class="tv">${csFee}</div></div>
    <div class="tile blue"><div class="tl">Monthly mPC Fee</div><div class="tv">${mpcFee}</div></div>
    <div class="tile green"><div class="tl">Total Monthly</div><div class="tv">${totalMonthly}</div></div>
  </div>
</div>

<!-- Once Off -->
<div class="sec">
  <div class="stitle">Once-Off Charges</div>
  <div class="grid2">
    <div class="tile"><div class="tl">Setup Fee</div><div class="tv">${setupFee}</div></div>
    <div class="tile"><div class="tl">Deposit</div><div class="tv">${deposit}</div></div>
  </div>
</div>

<!-- Rates (no Easy Leave — 2 equal cols) -->
<div class="sec">
  <div class="stitle">Indicative Rates</div>
  <div class="grid2">
    <div class="tile"><div class="tl">Daily Rate</div><div class="tv">${dayRate}</div></div>
    <div class="tile"><div class="tl">Hourly Rate</div><div class="tv">${hourlyRate}</div></div>
  </div>
</div>

<!-- FX Rate -->
<div class="sec">
  <div class="stitle">FX Rate Applied</div>
  <div class="tile"><div class="tl">${fxDate}</div><div class="tv">${fxRate}</div></div>
</div>

<!-- Validity -->
<div class="validity">
  <span>Quote Valid Until</span>
  <span>${validity}</span>
</div>

<!-- Footer -->
<div class="footer">
  <div class="footer-left">Confidential — For authorised use only. Cloudstaff Resource Rate Pricing Tool</div>
  <div class="footer-right">
    <img src="https://info.cloudstaff.com/hubfs/001%20SALES/Tools/Cloudstaff-No%20Tagline-Landscape-Color-Positive-No%20Keyline.png" alt="Cloudstaff">
  </div>
</div>

</body></html>`;

    const w = window.open('', '_blank');
    w.document.write(pdfHtml);
    w.document.close();
    setTimeout(() => w.print(), 600);
}

