// =====================================================
// PROPOSAL GENERATOR  v3 — Template-based
// Fetches Cloudstaff_Proposal_Template.pptx from repo
// root, patches slides 1/2/4/17 via JSZip XML edits,
// downloads result.
//
// Requires in index.html (before this file):
//   <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
//
// Template must be committed as:
//   /Cloudstaff_Proposal_Template.pptx  (repo root)
// =====================================================

// ── Modal ─────────────────────────────────────────────

function showProposalModal(quoteId) {
    const quote = allQuotesData.find(q => q.id === quoteId);
    if (!quote) { alert('Quote not found.'); return; }

    const modal = document.getElementById('proposalModal');
    modal.setAttribute('data-quote-id', quoteId);

    const summaryEl = document.getElementById('proposalQuoteSummary');
    if (summaryEl) {
        const sym = getCurrencySymbol(quote.currency || 'AUD');
        const rawTotal = quote.total_monthly
            ? sym + fmtAmt(parseFloat(String(quote.total_monthly).replace(/[^0-9.-]/g, '')))
            : '—';
        summaryEl.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem 1rem;font-size:0.8125rem;">
                <div><span style="color:var(--text-muted);">Role:</span> <strong>${esc(quote.role_name || '—')}</strong></div>
                <div><span style="color:var(--text-muted);">Market:</span> <strong>${esc(quote.market || 'PH')}</strong></div>
                <div><span style="color:var(--text-muted);">Total/mo:</span> <strong>${esc(rawTotal)}</strong></div>
                <div><span style="color:var(--text-muted);">Quote #:</span> <strong>${esc(String(quote.quote_number || '—'))}</strong></div>
            </div>`;
    }

    document.getElementById('proposalClientFirstName').value = '';
    document.getElementById('proposalClientCompany').value   = '';
    const errEl = document.getElementById('proposalError');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

    modal.classList.add('active');
    setTimeout(() => document.getElementById('proposalClientFirstName').focus(), 100);
}

function hideProposalModal() {
    document.getElementById('proposalModal').classList.remove('active');
    document.getElementById('proposalModal').removeAttribute('data-quote-id');
}

function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Helpers ───────────────────────────────────────────

function fmtAmt(val) {
    if (val == null || isNaN(val)) return '—';
    return new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
}

function getCurrencySymbol(cur) {
    return { AUD:'A$', USD:'US$', GBP:'£', HKD:'HK$', SGD:'S$', CAD:'CA$', EUR:'€', NZD:'NZ$' }[cur] || '$';
}

function xmlEsc(s) {
    return String(s ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

// Replaces <a:t>EXACT</a:t> → <a:t>NEW</a:t>  (all occurrences, exact string match)
// CRITICAL: uses function replacer — prevents $ in values (e.g. 'A$59.50')
// being misread as regex backreferences ($1, $3...) which corrupts the XML output.
function rt(xml, exact, replacement) {
    const esc  = exact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const safe = xmlEsc(replacement);
    return xml.replace(new RegExp(`(<a:t[^>]*>)${esc}(</a:t>)`, 'g'),
        (match, p1, p2) => p1 + safe + p2);
}

// Replaces only the LAST occurrence
function rtLast(xml, exact, replacement) {
    const esc  = exact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const safe = xmlEsc(replacement);
    const re   = new RegExp(`(<a:t[^>]*>)${esc}(</a:t>)`, 'g');
    let m, last;
    while ((m = re.exec(xml)) !== null) last = m;
    if (!last) return xml;
    return xml.slice(0, last.index) + last[1] + safe + last[2] + xml.slice(last.index + last[0].length);
}

// ── Today's date (e.g. "10 March 2026") ──────────────
function todayLong() {
    return new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Main generate ─────────────────────────────────────

async function generateProposal() {
    const modal   = document.getElementById('proposalModal');
    const quoteId = parseInt(modal.getAttribute('data-quote-id'));
    const quote   = allQuotesData.find(q => q.id === quoteId);
    if (!quote) { alert('Quote not found.'); return; }

    const clientFirst   = document.getElementById('proposalClientFirstName').value.trim();
    const clientCompany = document.getElementById('proposalClientCompany').value.trim();

    const errEl   = document.getElementById('proposalError');
    const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } else alert(msg); };

    if (!clientFirst)   { showErr("Please enter the client's first name."); document.getElementById('proposalClientFirstName').focus(); return; }
    if (!clientCompany) { showErr("Please enter the client company name."); document.getElementById('proposalClientCompany').focus(); return; }
    if (errEl) errEl.style.display = 'none';

    const btn = document.getElementById('generateProposalBtn');
    btn.disabled = true;
    btn.innerHTML = '⏳ Generating…';

    try {
        // Fetch the logged-in user's full row directly from Supabase.
        // Do NOT rely on currentUser — it may not include job_title/phone/email_address.
        const userId = currentUser?.id;
        let repName = '', repTitle = '', repEmail = '', repPhone = '';
        if (userId) {
            const { data: uRow, error: uErr } = await supabaseClient
                .from('users')
                .select('name, job_title, phone, email_address, email')
                .eq('id', userId)
                .single();
            if (uErr) console.warn('[Proposal] user fetch error:', uErr.message);
            if (uRow) {
                repName  = uRow.name         || '';
                repTitle = uRow.job_title     || '';
                repPhone = uRow.phone         || '';
                repEmail = uRow.email_address || uRow.email || '';
            }
        }

        const currency = quote.currency || 'AUD';
        const sym      = getCurrencySymbol(currency);
        const roleName = quote.role_name || 'Role';
        const edcAmt   = quote.edc_amount        != null ? sym + fmtAmt(quote.edc_amount)        : '—';
        const mpcAmt   = quote.mpc_amount        != null ? sym + fmtAmt(quote.mpc_amount)        : '—';
        const mpcName  = quote.mpc_name          || 'CS Power 7 Laptop';
        const mgmtFee  = quote.mgmt_fee_amount   != null ? sym + fmtAmt(quote.mgmt_fee_amount)   : '—';
        const setupFee = quote.setup_fee_amount  != null ? sym + fmtAmt(quote.setup_fee_amount)  : sym + '399.00';
        const total    = quote.total_monthly
            ? sym + fmtAmt(parseFloat(String(quote.total_monthly).replace(/[^0-9.-]/g, '')))
            : '—';

        await buildProposalFromTemplate({
            clientFirst, clientCompany,
            repName, repTitle, repEmail, repPhone,
            roleName, currency,
            edcAmt, mpcAmt, mpcName, mgmtFee, setupFee, total,
            quoteNumber: String(quote.quote_number || 'Draft'),
        });
        hideProposalModal();
    } catch (e) {
        console.error('Proposal error:', e);
        showErr('Error generating proposal: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" style="margin-right:4px;vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>Download Proposal (.pptx)';
    }
}
// ── Template builder ──────────────────────────────────

async function buildProposalFromTemplate(d) {
    if (typeof JSZip === 'undefined')
        throw new Error('JSZip not loaded. Check the CDN script tag in index.html.');

    const templateUrl = new URL('Cloudstaff_Proposal_Template.pptx', window.location.href).href;
    const resp = await fetch(templateUrl);
    if (!resp.ok) throw new Error(`Template not found (${resp.status}). Commit Cloudstaff_Proposal_Template.pptx to the repo root.`);

    const zip = await JSZip.loadAsync(await resp.arrayBuffer());

    // ── Slide 1: Cover ──────────────────────────────────
    // Template shapes on slide 1:
    //   id=162 — title text box ("Remote staffing proposal")
    //   id=163 — subtitle/date text box ("March 9, 2026") — single run, sz=2000
    //   id=164 — Cloudstaff logo image (rId3 → image17.png), x=6.04" y=1.80"
    //   NO shape 165 — rep details box was removed. Code inserts new shape id=9002.
    // Rep details inserted at x=5519650 y=182880 (same left edge as logo, above it).
    await patch(zip, 'ppt/slides/slide1.xml', xml => {

        // Date — target subtitle shape id="163" and replace its entire txBody.
        // Handles both old template (two runs) and new template (single run).
        // Preserves the original rPr (sz=2000) exactly.
        xml = xml.replace(
            /(<p:sp>(?:(?!<\/p:sp>)[\s\S])*?cNvPr id="163"[\s\S]*?)<p:txBody>[\s\S]*?<\/p:txBody>/,
            (m, prefix) => prefix +
                '<p:txBody>' +
                '<a:bodyPr spcFirstLastPara="1" wrap="square" lIns="91425" tIns="91425" rIns="91425" bIns="91425" anchor="t" anchorCtr="0"><a:noAutofit/></a:bodyPr>' +
                '<a:lstStyle/>' +
                '<a:p><a:pPr marL="0" indent="0"/>' +
                '<a:r><a:rPr lang="en" sz="2000" dirty="0"/><a:t>' + todayLong() + '</a:t></a:r>' +
                '</a:p>' +
                '</p:txBody>'
        );

        // Rep details — rebuild entire txBody of shape id="165"
        // Preserves original formatting: Work Sans font, accent2 colour, sz=1300
        const rPr    = '<a:rPr lang="en" sz="1300"><a:solidFill><a:schemeClr val="accent2"/></a:solidFill><a:latin typeface="Work Sans"/></a:rPr>';
        const endRPr = '<a:endParaRPr lang="en" sz="1300"><a:solidFill><a:schemeClr val="accent2"/></a:solidFill><a:latin typeface="Work Sans"/></a:endParaRPr>';
        const mkPara = t => `<a:p><a:r>${rPr}<a:t>${xmlEsc(t)}</a:t></a:r>${endRPr}</a:p>`;

        const newTxBody =
            '<p:txBody>' +
            '<a:bodyPr spcFirstLastPara="1" wrap="square" lIns="91425" tIns="91425" rIns="91425" bIns="91425" anchor="t" anchorCtr="0"><a:spAutoFit/></a:bodyPr>' +
            '<a:lstStyle/>' +
            mkPara(d.repName  || '') +
            mkPara(d.repTitle || '') +
            mkPara(d.repPhone || '') +
            mkPara(d.repEmail || '') +
            `<a:p>${endRPr}</a:p>` +
            '</p:txBody>';

        // If shape 165 exists (old template), replace its txBody.
        // If not (new template), insert a new text box at the same top-right position.
        if (xml.includes('cNvPr id="165"')) {
            xml = xml.replace(
                /(<p:sp>(?:(?!<\/p:sp>)[\s\S])*?cNvPr id="165"[\s\S]*?)<p:txBody>[\s\S]*?<\/p:txBody>/,
                (m, prefix) => prefix + newTxBody
            );
        } else {
            // Insert new shape: top-right, aligned with Cloudstaff logo left edge (x=5519650)
            // x=5519650 (6.04") y=182880 (0.20") cx=3355848 (3.67") cy=1280160 (1.40")
            // This keeps text within the 10" slide boundary (right edge = 9.71")
            const newShape =
                '<p:sp>' +
                '<p:nvSpPr>' +
                '<p:cNvPr id="9002" name="RepDetails"/>' +
                '<p:cNvSpPr txBox="1"/>' +
                '<p:nvPr/>' +
                '</p:nvSpPr>' +
                '<p:spPr>' +
                '<a:xfrm><a:off x="5519650" y="182880"/><a:ext cx="3355848" cy="1280160"/></a:xfrm>' +
                '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
                '<a:noFill/><a:ln><a:noFill/></a:ln>' +
                '</p:spPr>' +
                newTxBody +
                '</p:sp>';
            xml = xml.replace('</p:spTree>', newShape + '</p:spTree>');
        }

        return xml;
    });

    // ── Slide 2: Letter ─────────────────────────────────
    // Text nodes:
    //   'Dear Gregory'            → Dear {clientFirst}
    //   "WebIT's"                 → {clientCompany}'s
    //   'Sally Simmons' (last)    → rep name (sign-off)
    await patch(zip, 'ppt/slides/slide2.xml', xml => {
        xml = rt(xml, 'Dear Gregory', `Dear ${d.clientFirst}`);
        // "WebIT's" is its own run (spell-check flagged word)
        xml = rt(xml, "WebIT\u2019s", xmlEsc(d.clientCompany) + '\u2019s');
        xml = rt(xml, "WebIT's",      xmlEsc(d.clientCompany) + '\'s');
        // Sign-off is the LAST Sally Simmons in the file
        xml = rtLast(xml, 'Sally Simmons', d.repName || '');
        return xml;
    });

    // ── Slide 4: Pricing table ───────────────────────────
    // Table structure (verified from template XML):
    //   Row 1 (blue header): Role | EDC | Managed PC (name) | CS Mgmt Fee | Upgrades | Monthly Total (currency)
    //   Row 2 (description): blank | Salary desc | Managed PC desc | Work From Home | blank | blank
    //   Row 3 (full-width span): 'Front-end Developer' → role name
    //   Row 4 (data):  'Mid-level' | '$2,150-$3,355' | '$59.50' | '$770.00' | '$0.00' | '$2,980-$4,185'
    //
    // Mappings:
    //   Row 1 col 3:  '(CS Power 7 Laptop)' → '({mpcName})'
    //   Row 1 col 6:  '(AUD)'               → '({currency})'
    //   Row 3 span:   'Front-end Developer' → roleName
    //   Row 4 col 1:  'Mid-level'           → '' (no experience level field)
    //   Row 4 col 2:  '$2,150 - $3,355'     → edcAmt
    //   Row 4 col 3:  '$59.50' txBody       → TWO paragraphs: mpcName + mpcAmt (a:txBody namespace!)
    //   Row 4 col 4:  '$770.00'             → mgmtFee (guard: may be null on older quotes)
    //   Row 4 col 5:  '$0.00'               → leave as-is (upgrades)
    //   Row 4 col 6:  '$2,980 - $4,185'     → total
    //   Grey box:     ' setup fee\u00a0$200 per seat' → ' setup fee\u00a0{setupFee} per seat'
    await patch(zip, 'ppt/slides/slide4.xml', xml => {
        // Header row
        xml = rt(xml, '(CS Power 7 Laptop)', `(${d.mpcName})`);
        xml = rt(xml, '(AUD)', `(${d.currency})`);

        // Row 3 full-width span — role name
        xml = rt(xml, 'Front-end Developer', d.roleName);

        // Row 4 col 1 — blank experience level
        xml = rt(xml, 'Mid-level', '');

        // Row 4 col 2 — EDC
        xml = rt(xml, '$2,150 - $3,355', d.edcAmt);

        // Row 4 col 3 — Managed PC: replace the a:txBody containing '$59.50' with two paragraphs.
        // IMPORTANT: table cells use <a:txBody> NOT <p:txBody> — previous bug was wrong namespace.
        const mpcRpr = '<a:rPr lang="en-US" sz="900" b="0" i="0" u="none" strike="noStrike" noProof="0"><a:solidFill><a:srgbClr val="202124"/></a:solidFill><a:effectLst/><a:latin typeface="Aptos"/></a:rPr>';
        const mpcPpr = '<a:pPr lvl="0" algn="ctr"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft><a:buNone/></a:pPr>';
        const newMpcTxBody =
            '<a:txBody><a:bodyPr/><a:lstStyle/>' +
            `<a:p>${mpcPpr}<a:r>${mpcRpr}<a:t>${xmlEsc(d.mpcName)}</a:t></a:r></a:p>` +
            `<a:p>${mpcPpr}<a:r>${mpcRpr}<a:t>${xmlEsc(d.mpcAmt)}</a:t></a:r></a:p>` +
            '</a:txBody>';
        xml = xml.replace(
            /<a:txBody>(?:(?!<\/a:txBody>)[\s\S])*?\$59\.50(?:(?!<\/a:txBody>)[\s\S])*?<\/a:txBody>/,
            newMpcTxBody
        );

        // Row 4 col 4 — management fee (only replace if value is available)
        if (d.mgmtFee && d.mgmtFee !== '—') xml = rt(xml, '$770.00', d.mgmtFee);

        // Row 4 col 5 — leave $0.00 (upgrades/additional)

        // Row 4 col 6 — total monthly
        xml = rt(xml, '$2,980 - $4,185', d.total);

        // Grey box — One-Off Setup Costs bullet.
        // Exact run text: ' setup fee\u00a0$200 per seat' (\u00a0 = non-breaking space)
        xml = rt(xml, ' setup fee\u00a0$200 per seat', ` setup fee\u00a0${d.setupFee} per seat`);

        return xml;
    });

    // ── Slide 17: Closing / rep contact ─────────────────
    // Three separate runs:
    //   'Sally Simmons – Senior Business Development Manager ' → '{repName} – {repTitle} '
    //   'sallys@cloudstaff.com'  → repEmail
    //   ' 0429 782 463'          → ' ' + repPhone
    await patch(zip, 'ppt/slides/slide17.xml', xml => {
        xml = rt(xml, 'Sally Simmons \u2013 Senior Business Development Manager ', `${d.repName} \u2013 ${d.repTitle} `);
        xml = rt(xml, 'sallys@cloudstaff.com', d.repEmail || '');
        xml = rt(xml, ' 0429 782 463', d.repPhone ? ' ' + d.repPhone : '');
        return xml;
    });

    // ── Download ──────────────────────────────────────────
    // Do NOT force compression — preserves original per-entry type (STORE for fonts etc).
    // Forcing DEFLATE here would try to re-deflate already-STORED binary font files → corruption.
    const blob     = await zip.generateAsync({ type: 'blob' });
    const safeName = (d.clientCompany || 'Client').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `Cloudstaff_Proposal_${safeName}_${d.quoteNumber}.pptx`;
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}

// ── Zip patch helper ──────────────────────────────────

async function patch(zip, path, fn) {
    const file = zip.file(path);
    if (!file) { console.warn('Not found in zip:', path); return; }
    zip.file(path, fn(await file.async('string')));
}

