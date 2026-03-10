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
    clearProposalLogo();
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

// ── Logo upload ───────────────────────────────────────

let proposalLogoBase64 = null;

function handleProposalLogoUpload(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        proposalLogoBase64 = e.target.result;
        const img = document.getElementById('proposalLogoImg');
        const prev = document.getElementById('proposalLogoPreview');
        if (img)  img.src = proposalLogoBase64;
        if (prev) prev.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function clearProposalLogo() {
    proposalLogoBase64 = null;
    const img   = document.getElementById('proposalLogoImg');
    const prev  = document.getElementById('proposalLogoPreview');
    const input = document.getElementById('proposalLogoInput');
    if (img)   img.src = '';
    if (prev)  prev.style.display = 'none';
    if (input) input.value = '';
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

    const repName  = currentUser?.name  || currentUser?.email || '';
    const repTitle = currentUser?.job_title || 'Business Development Manager';
    const repEmail = currentUser?.email_address || currentUser?.email || '';
    const repPhone = currentUser?.phone || '';

    const currency = quote.currency || 'AUD';
    const sym      = getCurrencySymbol(currency);
    const roleName = quote.role_name || 'Role';
    const edcAmt   = quote.edc_amount      != null ? sym + fmtAmt(quote.edc_amount)      : '—';
    const mpcAmt   = quote.mpc_amount      != null ? sym + fmtAmt(quote.mpc_amount)      : '—';
    const mpcName  = quote.mpc_name        || 'CS Power 7 Laptop';
    const mgmtFee  = quote.mgmt_fee_amount != null ? sym + fmtAmt(quote.mgmt_fee_amount) : '—';
    const total    = quote.total_monthly
        ? sym + fmtAmt(parseFloat(String(quote.total_monthly).replace(/[^0-9.-]/g, '')))
        : '—';

    const btn = document.getElementById('generateProposalBtn');
    btn.disabled = true;
    btn.innerHTML = '⏳ Generating…';

    try {
        await buildProposalFromTemplate({
            clientFirst, clientCompany,
            repName, repTitle, repEmail, repPhone,
            roleName, currency,
            edcAmt, mpcAmt, mpcName, mgmtFee, total,
            logoBase64: proposalLogoBase64,
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
    // Key text nodes (many contain \xa0 non-breaking spaces):
    //   'Managed\xa0PC '          → keep (run 1 of mPC header)
    //   '(CS Power 7 Laptop)'     → '({mpcName})'
    //   'Monthly Total' + '(AUD)' → keep / replace currency
    //   'Cloudstaff' + ' Proposal'→ keep as-is (title — DO NOT TOUCH)
    //   'Front-end Developer'     → role name
    //   'Mid-level'               → '' (single role, no level needed)
    //   '$2,150 - $3,355'         → EDC
    //   '$59.50' (first)          → mPC amount
    //   '$770.00' (first)         → mgmt fee
    //   '$0.00' (first)           → upgrades (leave as $0.00)
    //   '$2,980 - $4,185'         → total
    //   'Senior'                  → ''  (blank second tier)
    //   '$3,355 - $4,835'         → ''
    //   '$59.50' (second)         → ''
    //   '$770.00' (second)        → ''
    //   '$0.00' (second)          → ''
    //   '$4,185 - $5,665'         → ''
    await patch(zip, 'ppt/slides/slide4.xml', xml => {
        // mPC column header (second run of that cell)
        xml = rt(xml, '(CS Power 7 Laptop)', `(${d.mpcName})`);

        // Currency in Monthly Total header
        xml = rt(xml, '(AUD)', `(${d.currency})`);

        // Role name header row
        xml = rt(xml, 'Front-end Developer', d.roleName);

        // Mid-level → blank
        xml = rt(xml, 'Mid-level', '');

        // Row 3 data — replace in order they appear in file
        xml = rt(xml, '$2,150 - $3,355', d.edcAmt);
        // $59.50 appears twice (rows 3 and 4) — replace both, then blank the second
        // Do first pass: replace ALL $59.50 with mpcAmt
        xml = rt(xml, '$59.50', d.mpcAmt);
        xml = rt(xml, '$770.00', d.mgmtFee);
        // $0.00 appears twice — leave both as $0.00
        xml = rt(xml, '$2,980 - $4,185', d.total);

        // Row 4 — blank the Senior tier
        xml = rt(xml, 'Senior', '');
        xml = rt(xml, '$3,355 - $4,835', '');
        // $59.50 already replaced above for both rows — row 4 now shows d.mpcAmt
        // Need to blank LAST occurrence of d.mpcAmt for row 4
        xml = rtLast(xml, xmlEsc(d.mpcAmt), '');
        xml = rtLast(xml, xmlEsc(d.mgmtFee), '');
        xml = rt(xml, '$4,185 - $5,665', '');

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

    // ── Optional: client logo on slide 1 ─────────────────
    // Position: bottom-left, next to Cloudstaff logo
    // Cloudstaff logo is roughly at x=0.3" y=4.6" — place client logo at x=1.8" y=4.55" 
    if (d.logoBase64) {
        await insertLogo(zip, d.logoBase64);
    }

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

// ── Logo insertion ────────────────────────────────────
// Client logo placed center-bottom of slide 1.
// Slide 10" x 5.625". Logo: x=4.0" y=4.45" w=2.0" h=0.9"

async function insertLogo(zip, logoBase64DataUrl) {
    try {
        const mimeMatch = logoBase64DataUrl.match(/data:(image\/([a-z+]+));base64,/);
        if (!mimeMatch) return;
        const mime = mimeMatch[1];
        const ext  = { 'image/png':'png', 'image/jpeg':'jpg', 'image/jpg':'jpg', 'image/svg+xml':'svg' }[mime] || 'png';
        const b64  = logoBase64DataUrl.split(',')[1];

        // Binary to zip
        const binary = atob(b64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const imgPath = `ppt/media/clientLogo.${ext}`;
        zip.file(imgPath, bytes);

        // [Content_Types].xml
        const ctFile = zip.file('[Content_Types].xml');
        if (ctFile) {
            let ct = await ctFile.async('string');
            const partName    = `/ppt/media/clientLogo.${ext}`;
            const contentType = mime;
            if (!ct.includes(partName)) {
                ct = ct.replace('</Types>', `  <Override PartName="${partName}" ContentType="${contentType}"/>\n</Types>`);
                zip.file('[Content_Types].xml', ct);
            }
        }

        // Relationship
        const relsPath = 'ppt/slides/_rels/slide1.xml.rels';
        const relsFile = zip.file(relsPath);
        let rels = relsFile
            ? await relsFile.async('string')
            : '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
        const rId = 'rId_clientLogo';
        if (!rels.includes(rId)) {
            rels = rels.replace('</Relationships>',
                `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/clientLogo.${ext}"/>\n</Relationships>`);
            zip.file(relsPath, rels);
        }

        // Calculate cx/cy from actual image pixel dimensions so the bounding box
        // exactly matches the image's aspect ratio — this is the ONLY way to prevent
        // PowerPoint from stretching/distorting the logo. Max width=2.5", max height=1.0".
        const imgDims = await new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => resolve({ w: 1, h: 1 });
            img.src = logoBase64DataUrl;
        });

        const EMU    = 914400;
        const maxW   = 2.5 * EMU;   // 2.5" max width
        const maxH   = 1.0 * EMU;   // 1.0" max height
        const aspect = imgDims.w / imgDims.h;
        let lw, lh;
        if (aspect >= maxW / maxH) {
            lw = maxW;
            lh = Math.round(maxW / aspect);
        } else {
            lh = maxH;
            lw = Math.round(maxH * aspect);
        }
        // Centre horizontally in bottom strip (slide width = 9144000 EMU = 10")
        const lx = Math.round((9144000 - lw) / 2);
        const ly = Math.round(4.35 * EMU);   // 4.35" — bottom strip

        const picXml = `<p:pic xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
            `<p:nvPicPr><p:cNvPr id="9001" name="ClientLogo"/>` +
            `<p:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
            `<p:blipFill><a:blip r:embed="${rId}"/><a:srcRect/></p:blipFill>` +
            `<p:spPr><a:xfrm><a:off x="${lx}" y="${ly}"/><a:ext cx="${lw}" cy="${lh}"/></a:xfrm>` +
            `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr></p:pic>`;

        const slideFile = zip.file('ppt/slides/slide1.xml');
        if (slideFile) {
            let sxml = await slideFile.async('string');
            sxml = sxml.replace('</p:spTree>', picXml + '</p:spTree>');
            zip.file('ppt/slides/slide1.xml', sxml);
        }
    } catch (e) {
        console.warn('Logo insertion failed (non-fatal):', e);
    }
}
