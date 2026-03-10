// =====================================================
// PROPOSAL GENERATOR  v2 — Template-based approach
// Opens the Cloudstaff_Proposal_Template.pptx from
// the repo root, replaces text in slides 1, 2, 4 & 17
// via JSZip XML manipulation, then triggers download.
//
// Dependencies (loaded in index.html before this file):
//   <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
//
// Template file must exist at: /Cloudstaff_Proposal_Template.pptx
// (committed to repo root so it's served by GitHub Pages)
// =====================================================

// ── Modal open/close ─────────────────────────────────

function showProposalModal(quoteId) {
    const quote = allQuotesData.find(q => q.id === quoteId);
    if (!quote) { alert('Quote not found.'); return; }

    const modal = document.getElementById('proposalModal');
    modal.setAttribute('data-quote-id', quoteId);

    // Populate quote summary panel
    const summaryEl = document.getElementById('proposalQuoteSummary');
    if (summaryEl) {
        const sym = getCurrencySymbol(quote.currency || 'AUD');
        const rawTotal = quote.total_monthly
            ? sym + fmtProposalAmount(parseFloat(String(quote.total_monthly).replace(/[^0-9.-]/g, '')))
            : '—';
        summaryEl.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem 1rem;font-size:0.8125rem;">
                <div><span style="color:var(--text-muted);">Role:</span> <strong>${escHtml(quote.role_name || '—')}</strong></div>
                <div><span style="color:var(--text-muted);">Market:</span> <strong>${escHtml(quote.market || 'PH')}</strong></div>
                <div><span style="color:var(--text-muted);">Total/mo:</span> <strong>${escHtml(rawTotal)}</strong></div>
                <div><span style="color:var(--text-muted);">Quote #:</span> <strong>${escHtml(String(quote.quote_number || '—'))}</strong></div>
            </div>`;
    }

    // Reset form
    document.getElementById('proposalClientFirstName').value = '';
    document.getElementById('proposalClientCompany').value   = '';
    clearProposalLogo();
    const errEl = document.getElementById('proposalError');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

    modal.classList.add('active');
    setTimeout(() => document.getElementById('proposalClientFirstName').focus(), 100);
}

function hideProposalModal() {
    const modal = document.getElementById('proposalModal');
    modal.classList.remove('active');
    modal.removeAttribute('data-quote-id');
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Logo upload ───────────────────────────────────────

let proposalLogoBase64 = null;

function handleProposalLogoUpload(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        proposalLogoBase64 = e.target.result;
        const preview = document.getElementById('proposalLogoPreview');
        const img     = document.getElementById('proposalLogoImg');
        if (img)     img.src = proposalLogoBase64;
        if (preview) preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function clearProposalLogo() {
    proposalLogoBase64 = null;
    const preview = document.getElementById('proposalLogoPreview');
    const img     = document.getElementById('proposalLogoImg');
    const input   = document.getElementById('proposalLogoInput');
    if (preview) preview.style.display = 'none';
    if (img)     img.src = '';
    if (input)   input.value = '';
}

// ── Helpers ───────────────────────────────────────────

function fmtProposalAmount(val) {
    if (val == null || isNaN(val)) return '—';
    return new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
}

function getCurrencySymbol(currency) {
    const map = { AUD:'A$', USD:'US$', GBP:'£', HKD:'HK$', SGD:'S$', CAD:'CA$', EUR:'€', NZD:'NZ$' };
    return map[currency] || '$';
}

// ── Main generate ─────────────────────────────────────

async function generateProposal() {
    const modal   = document.getElementById('proposalModal');
    const quoteId = parseInt(modal.getAttribute('data-quote-id'));
    const quote   = allQuotesData.find(q => q.id === quoteId);
    if (!quote) { alert('Quote not found.'); return; }

    const clientFirst   = document.getElementById('proposalClientFirstName').value.trim();
    const clientCompany = document.getElementById('proposalClientCompany').value.trim();

    const errEl = document.getElementById('proposalError');
    const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } else alert(msg); };

    if (!clientFirst)   { showErr("Please enter the client's first name."); document.getElementById('proposalClientFirstName').focus(); return; }
    if (!clientCompany) { showErr("Please enter the client company name."); document.getElementById('proposalClientCompany').focus(); return; }
    if (errEl) errEl.style.display = 'none';

    const repName  = currentUser?.name  || currentUser?.email || '';
    const repTitle = currentUser?.job_title || 'Business Development Manager';
    const repEmail = currentUser?.email_address || currentUser?.email || '';
    const repPhone = currentUser?.phone || '';

    const currency  = quote.currency || 'AUD';
    const sym       = getCurrencySymbol(currency);
    const roleName  = quote.role_name || 'Role';
    const edcAmt    = quote.edc_amount      != null ? sym + fmtProposalAmount(quote.edc_amount)      : '—';
    const mpcAmt    = quote.mpc_amount      != null ? sym + fmtProposalAmount(quote.mpc_amount)      : '—';
    const mpcName   = quote.mpc_name        || 'CS Power 7 Laptop';
    const mgmtFee   = quote.mgmt_fee_amount != null ? sym + fmtProposalAmount(quote.mgmt_fee_amount) : '—';
    const total     = quote.total_monthly
        ? sym + fmtProposalAmount(parseFloat(String(quote.total_monthly).replace(/[^0-9.-]/g, '')))
        : '—';
    const propDate  = new Date().toLocaleDateString('en-AU', { day:'numeric', month:'long', year:'numeric' });

    const btn = document.getElementById('generateProposalBtn');
    btn.disabled = true;
    btn.innerHTML = '⏳ Generating…';

    try {
        await buildProposalFromTemplate({
            clientFirst, clientCompany,
            repName, repTitle, repEmail, repPhone,
            roleName, currency, sym,
            edcAmt, mpcAmt, mpcName, mgmtFee, total,
            propDate,
            logoBase64: proposalLogoBase64,
            quoteNumber: quote.quote_number || 'Draft',
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

// ── Template XML manipulation ─────────────────────────

async function buildProposalFromTemplate(d) {
    if (typeof JSZip === 'undefined') {
        throw new Error('JSZip not loaded. Add the JSZip CDN script tag to index.html before proposal-generator.js.');
    }

    // Fetch the template from the repo root
    const templateUrl = new URL('Cloudstaff_Proposal_Template.pptx', window.location.href).href;
    const resp = await fetch(templateUrl);
    if (!resp.ok) throw new Error(`Could not load template (${resp.status}). Make sure Cloudstaff_Proposal_Template.pptx is in the repo root.`);

    const arrayBuf = await resp.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuf);

    // ── Slide 1: date + rep info + optional logo ────────
    await patchSlide(zip, 'ppt/slides/slide1.xml', xml => {
        // Date: replace "March 9," ... " 2026" — text split across two runs
        xml = replaceAllRunText(xml, 'March 9,', d.propDate);
        xml = replaceAllRunText(xml, ' 2026', ''); // clear the second run since we put it all in first

        // Rep box — replace each paragraph's single run
        xml = replaceAllRunText(xml, 'Sally Simmons',          d.repName  || 'Your Rep');
        xml = replaceAllRunText(xml, 'Your Outsourcing Specialist', d.repTitle || 'Business Development Manager');
        xml = replaceAllRunText(xml, '0429 782 463',            d.repPhone || '');
        xml = replaceAllRunText(xml, 'sallys@cloudstaff.com',   d.repEmail || '');

        return xml;
    });

    // ── Slide 2: letter ─────────────────────────────────
    await patchSlide(zip, 'ppt/slides/slide2.xml', xml => {
        // "Dear Gregory"
        xml = replaceAllRunText(xml, 'Dear Gregory', `Dear ${d.clientFirst}`);

        // "WebIT's" (has err="1" flag — just target the text node)
        xml = replaceAllRunText(xml, "WebIT\u2019s", xmlEsc(d.clientCompany) + '\u2019s');
        xml = replaceAllRunText(xml, "WebIT's",       xmlEsc(d.clientCompany) + '\'s');
        // encoded form &#160; precedes the company name — also try plain
        xml = xml.replace(/>WebIT&#8217;s</g, `>${xmlEsc(d.clientCompany)}\u2019s<`);
        xml = xml.replace(/>WebIT's</g,       `>${xmlEsc(d.clientCompany)}'s<`);

        // Sign-off name (last "Sally Simmons" in the body shape)
        // There are two Sally Simmons in the file — slide1 was already patched,
        // so this one is in slide2's letter sign-off
        xml = replaceLastRunText(xml, 'Sally Simmons', d.repName || 'Your Rep');

        return xml;
    });

    // ── Slide 4: pricing table ───────────────────────────
    await patchSlide(zip, 'ppt/slides/slide4.xml', xml => {
        // Table header col 2 — mPC name (non-breaking space + newline inside XML)
        xml = xml.replace(/>Managed[\u00a0\xa0&amp;#160; ]*PC[\s\S]*?\(CS Power 7 Laptop\)</,
            `>Managed\u00a0PC \n(${xmlEsc(d.mpcName)})<`);
        // Also handle encoded form
        xml = xml.replace(/>Managed&#160;PC[\s\S]*?\(CS Power 7 Laptop\)</,
            `>Managed&#160;PC \n(${xmlEsc(d.mpcName)})<`);

        // Header col 5 — currency
        xml = replaceAllRunText(xml, 'Monthly Total\n(AUD)', `Monthly Total\n(${d.currency})`);
        xml = xml.replace(/>Monthly Total\n\(AUD\)</g, `>Monthly Total\n(${xmlEsc(d.currency)})<`);

        // Row 2 (role name header row, gridSpan=6)
        xml = replaceAllRunText(xml, 'Front-end Developer', xmlEsc(d.roleName));

        // Row 3 col 0 — "Mid-level" → blank (single role, no level label needed)
        xml = replaceAllRunText(xml, 'Mid-level', '');

        // Row 3 data cells
        xml = replaceAllRunText(xml, '$2,150 - $3,355', xmlEsc(d.edcAmt));
        xml = replaceAllRunText(xml, '$59.50',           xmlEsc(d.mpcAmt));
        xml = replaceAllRunText(xml, '$770.00',          xmlEsc(d.mgmtFee));
        xml = replaceAllRunText(xml, '$0.00',            '$0.00');  // upgrades — keep as is
        xml = replaceAllRunText(xml, '$2,980 - $4,185',  xmlEsc(d.total));

        // Row 4 — "Senior" row: blank it all out
        xml = replaceAllRunText(xml, 'Senior',           '');
        xml = replaceAllRunText(xml, '$3,355 - $4,835',  '');
        // mpc col already replaced — need second instance
        xml = replaceNthRunText(xml,  '$59.50', 2, '');
        xml = replaceAllRunText(xml, '$4,185 - $5,665',  '');

        return xml;
    });

    // ── Slide 17: closing + rep contact line ─────────────
    await patchSlide(zip, 'ppt/slides/slide17.xml', xml => {
        // "Sally Simmons – Senior Business Development Manager sallys@cloudstaff.com 0429 782 463"
        const repLine = [d.repName, d.repTitle, d.repEmail, d.repPhone].filter(Boolean).join('  ·  ');
        xml = xml.replace(/>Sally Simmons[^<]*<\/a:t>/g, `>${xmlEsc(repLine)}</a:t>`);
        return xml;
    });

    // ── Optional: client logo on slide 1 ─────────────────
    if (d.logoBase64) {
        await insertLogoOnSlide1(zip, d.logoBase64);
    }

    // ── Generate and download ─────────────────────────────
    const outBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const safeCo  = (d.clientCompany || 'Client').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `Cloudstaff_Proposal_${safeCo}_${d.quoteNumber}.pptx`;

    const url = URL.createObjectURL(outBlob);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}

// ── XML helpers ───────────────────────────────────────

async function patchSlide(zip, path, patchFn) {
    const file = zip.file(path);
    if (!file) { console.warn('Slide not found in zip:', path); return; }
    let xml = await file.async('string');
    xml = patchFn(xml);
    zip.file(path, xml);
}

function xmlEsc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Replace ALL occurrences of a run text value
function replaceAllRunText(xml, oldText, newText) {
    // Target: <a:t>OLDTEXT</a:t>  (with possible xml encoding)
    const escaped = oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                           .replace(/'/g, "(?:'|&#x27;|&apos;|\\u2019|&#8217;)")
                           .replace(/—/g, '(?:—|&#8212;|&mdash;)')
                           .replace(/\n/g, '(?:\\n|&#xA;)');
    const re = new RegExp(`(<a:t[^>]*>)${escaped}(</a:t>)`, 'g');
    return xml.replace(re, `$1${xmlEsc(newText)}$2`);
}

// Replace only the LAST occurrence (for sign-off name on slide 2)
function replaceLastRunText(xml, oldText, newText) {
    const escaped = oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(<a:t[^>]*>)${escaped}(</a:t>)`, 'g');
    let lastMatch = null, lastIndex = 0;
    let m;
    while ((m = re.exec(xml)) !== null) {
        lastMatch = m;
        lastIndex = m.index;
    }
    if (!lastMatch) return xml;
    return xml.slice(0, lastIndex) +
           lastMatch[1] + xmlEsc(newText) + lastMatch[2] +
           xml.slice(lastIndex + lastMatch[0].length);
}

// Replace the Nth occurrence (1-based) of a run text
function replaceNthRunText(xml, oldText, n, newText) {
    const escaped = oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(<a:t[^>]*>)${escaped}(</a:t>)`, 'g');
    let count = 0;
    return xml.replace(re, (match, p1, p2) => {
        count++;
        return count === n ? p1 + xmlEsc(newText) + p2 : match;
    });
}

// ── Logo insertion ────────────────────────────────────
// Adds client logo image to slide 1, positioned over the existing
// placeholder image area (right side of slide, x≈6.04", y≈1.80")

async function insertLogoOnSlide1(zip, logoBase64DataUrl) {
    try {
        // Determine mime type and extension
        const mimeMatch = logoBase64DataUrl.match(/data:(image\/([a-z+]+));base64,/);
        if (!mimeMatch) return;
        const mime = mimeMatch[1];
        const ext  = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/svg+xml': 'svg' }[mime] || 'png';
        const b64  = logoBase64DataUrl.split(',')[1];

        // Convert base64 to binary
        const binaryStr = atob(b64);
        const bytes     = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

        // Add image file to zip
        const imgPath = `ppt/media/clientLogo.${ext}`;
        zip.file(imgPath, bytes);

        // Register in [Content_Types].xml
        const ctFile = zip.file('[Content_Types].xml');
        if (ctFile) {
            let ct = await ctFile.async('string');
            const mimeMap = { png:'image/png', jpg:'image/jpeg', svg:'image/svg+xml' };
            const contentType = mimeMap[ext] || 'image/png';
            const partName    = `/ppt/media/clientLogo.${ext}`;
            if (!ct.includes(partName)) {
                ct = ct.replace('</Types>', `  <Override PartName="${partName}" ContentType="${contentType}"/>\n</Types>`);
                zip.file('[Content_Types].xml', ct);
            }
        }

        // Register relationship in slide1.xml.rels
        const relsPath = 'ppt/slides/_rels/slide1.xml.rels';
        const relsFile = zip.file(relsPath);
        let rels = relsFile ? await relsFile.async('string') : '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
        const rId = 'rId_clientLogo';
        if (!rels.includes(rId)) {
            rels = rels.replace('</Relationships>',
                `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/clientLogo.${ext}"/>\n</Relationships>`);
            zip.file(relsPath, rels);
        }

        // Inject <p:pic> element into slide1.xml spTree
        // Position: x=6.04" y=1.80" w=3.67" h=1.50" (in EMUs: 1" = 914400)
        const EMU = 914400;
        const lx  = Math.round(6.04 * EMU);
        const ly  = Math.round(1.80 * EMU);
        const lw  = Math.round(3.67 * EMU);
        const lh  = Math.round(1.50 * EMU);

        const picXml = `
  <p:pic>
    <p:nvPicPr>
      <p:cNvPr id="9001" name="ClientLogo"/>
      <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
      <p:nvPr/>
    </p:nvPicPr>
    <p:blipFill>
      <a:blip r:embed="${rId}"/>
      <a:stretch><a:fillRect/></a:stretch>
    </p:blipFill>
    <p:spPr>
      <a:xfrm><a:off x="${lx}" y="${ly}"/><a:ext cx="${lw}" cy="${lh}"/></a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    </p:spPr>
  </p:pic>`;

        const slideFile = zip.file('ppt/slides/slide1.xml');
        if (slideFile) {
            let sxml = await slideFile.async('string');
            // Insert before closing </p:spTree>
            sxml = sxml.replace('</p:spTree>', picXml + '\n</p:spTree>');
            zip.file('ppt/slides/slide1.xml', sxml);
        }
    } catch (e) {
        console.warn('Logo insertion failed (non-fatal):', e);
    }
}
