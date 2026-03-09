// =====================================================
// PROPOSAL GENERATOR
// Generates a branded Cloudstaff proposal .pptx
// from a saved quote. Populates Slides 1, 2 & 4 only.
// All other slides pass through unchanged (generic).
// =====================================================

// ── Modal open/close ─────────────────────────────────

function showProposalModal(quoteId) {
    const quote = allQuotesData.find(q => q.id === quoteId);
    if (!quote) { alert('Quote not found.'); return; }

    // Store on modal for use at generation time
    const modal = document.getElementById('proposalModal');
    modal.setAttribute('data-quote-id', quoteId);

    // Pre-fill role name from quote
    const rolePrefill = quote.custom_role_name || quote.role_name || '';
    document.getElementById('proposalRoleName').value = rolePrefill;

    // Clear other fields
    document.getElementById('proposalClientFirstName').value = '';
    document.getElementById('proposalClientLastName').value = '';
    document.getElementById('proposalLogoPreview').src = '';
    document.getElementById('proposalLogoPreview').style.display = 'none';
    document.getElementById('proposalLogoInput').value = '';
    proposalLogoBase64 = null;

    modal.classList.add('active');
    setTimeout(() => document.getElementById('proposalClientFirstName').focus(), 100);
}

function hideProposalModal() {
    document.getElementById('proposalModal').classList.remove('active');
    document.getElementById('proposalModal').removeAttribute('data-quote-id');
}

// ── Logo upload handler ───────────────────────────────

let proposalLogoBase64 = null;

function handleProposalLogoUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        proposalLogoBase64 = e.target.result; // full data URL e.g. "data:image/png;base64,..."
        const preview = document.getElementById('proposalLogoPreview');
        preview.src = proposalLogoBase64;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

// ── Currency formatter (plain number, no symbol) ─────

function fmtProposalAmount(val, currency) {
    if (!val && val !== 0) return '—';
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return new Intl.NumberFormat('en-AU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
}

function getCurrencySymbol(currency) {
    const map = { AUD: 'A$', USD: 'US$', GBP: '£', HKD: 'HK$', SGD: 'S$', CAD: 'CA$', EUR: '€', NZD: 'NZ$' };
    return map[currency] || '$';
}

// ── Main generation function ──────────────────────────

async function generateProposal() {
    const modal = document.getElementById('proposalModal');
    const quoteId = parseInt(modal.getAttribute('data-quote-id'));
    const quote = allQuotesData.find(q => q.id === quoteId);
    if (!quote) { alert('Quote not found.'); return; }

    const clientFirst = document.getElementById('proposalClientFirstName').value.trim();
    const clientLast  = document.getElementById('proposalClientLastName').value.trim();
    const roleName    = document.getElementById('proposalRoleName').value.trim() || quote.role_name || 'To Be Advised';

    if (!clientFirst) {
        alert('Please enter the client\'s first name.');
        document.getElementById('proposalClientFirstName').focus();
        return;
    }

    // Get sales rep info from currentUser
    const repName   = currentUser ? (currentUser.name  || currentUser.email || '') : '';
    const repTitle  = currentUser ? (currentUser.job_title || 'Business Development Manager') : 'Business Development Manager';
    const repEmail  = currentUser ? (currentUser.email_address || currentUser.email || '') : '';
    const repPhone  = currentUser ? (currentUser.phone || '') : '';

    const currency     = quote.currency || 'AUD';
    const currSymbol   = getCurrencySymbol(currency);
    const edcAmount    = quote.edc_amount    ? `${currSymbol}${fmtProposalAmount(quote.edc_amount, currency)}`    : '—';
    const mpcAmount    = quote.mpc_amount    ? `${currSymbol}${fmtProposalAmount(quote.mpc_amount, currency)}`    : '—';
    const mpcName      = quote.mpc_name      || 'CS Power 7 Laptop';
    const mgmtFee      = quote.mgmt_fee_amount ? `${currSymbol}${fmtProposalAmount(quote.mgmt_fee_amount, currency)}` : '—';
    const totalMonthly = quote.total_monthly ? `${currSymbol}${fmtProposalAmount(parseFloat(String(quote.total_monthly).replace(/[^0-9.-]/g,'')), currency)}` : '—';
    const upgradesStr  = `${currSymbol}0.00`;

    const proposalDate = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
    const clientFullName = clientLast ? `${clientFirst} ${clientLast}` : clientFirst;
    const clientCompany  = clientLast ? clientLast : clientFirst; // fallback for company name display

    // Generate the PPTX
    const btn = document.getElementById('proposalGenerateBtn');
    btn.disabled = true;
    btn.textContent = 'Generating…';

    try {
        await buildProposalPPTX({
            clientFirst, clientFullName, clientCompany,
            repName, repTitle, repEmail, repPhone,
            roleName, currency, currSymbol,
            edcAmount, mpcAmount, mpcName, mgmtFee,
            totalMonthly, upgradesStr,
            proposalDate,
            logoBase64: proposalLogoBase64,
            quoteNumber: quote.quote_number || '',
        });
        hideProposalModal();
    } catch(e) {
        console.error('Proposal generation error:', e);
        alert('Error generating proposal: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate Proposal';
    }
}

// ── PPTX Builder ─────────────────────────────────────

async function buildProposalPPTX(d) {
    // PptxGenJS must be loaded via CDN in index.html
    if (typeof PptxGenJS === 'undefined') {
        alert('PptxGenJS library not loaded. Please check that the CDN script tag is present in index.html.');
        return;
    }

    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE'; // 13.33" x 7.5" — matches Cloudstaff template aspect ratio

    // ── Colour constants ──────────────────────────────
    const CS_BLUE    = '1B8EF2';  // Cloudstaff primary blue
    const CS_DARK    = '1A1A2E';  // Near-black for text
    const CS_GRAY    = 'F5F7FA';  // Light background
    const CS_MUTED   = '6B7280';  // Muted text
    const WHITE      = 'FFFFFF';
    const TABLE_HEADER_BG = '1B8EF2';
    const TABLE_ROW_BG    = 'F0F7FF';
    const TABLE_ALT_BG    = 'FFFFFF';

    // ── SLIDE 1: Cover ────────────────────────────────
    {
        const s = pres.addSlide();
        s.background = { color: WHITE };

        // Large blue diagonal/wave shape on left (simplified as rectangle)
        s.addShape(pres.ShapeType.rect, {
            x: 0, y: 0, w: 5.8, h: 7.5,
            fill: { color: CS_BLUE },
            line: { color: CS_BLUE }
        });

        // Light grey background on right
        s.addShape(pres.ShapeType.rect, {
            x: 5.8, y: 0, w: 7.53, h: 7.5,
            fill: { color: CS_GRAY },
            line: { color: CS_GRAY }
        });

        // Main heading — left panel
        s.addText([
            { text: 'Remote\n', options: { bold: true, breakLine: true } },
            { text: 'staffing\n', options: { bold: true, breakLine: true } },
            { text: 'proposal', options: { bold: true } }
        ], {
            x: 0.4, y: 1.2, w: 5.0, h: 3.6,
            fontSize: 52, color: WHITE, bold: true,
            fontFace: 'Arial', align: 'left', valign: 'top'
        });

        // Date — left panel
        s.addText(d.proposalDate, {
            x: 0.4, y: 5.3, w: 5.0, h: 0.45,
            fontSize: 16, color: WHITE, fontFace: 'Arial', align: 'left'
        });

        // Cloudstaff logo text (right panel, top right) — substitute for actual logo asset
        s.addText('cloudstaff.', {
            x: 6.0, y: 0.3, w: 4.5, h: 0.5,
            fontSize: 22, bold: true, color: CS_BLUE, fontFace: 'Arial', align: 'right'
        });

        // Sales rep contact block — top right
        const repLines = [
            { text: d.repName,  options: { bold: true, breakLine: true } },
            { text: d.repTitle + '\n', options: { breakLine: true } },
            { text: d.repPhone + '\n', options: { breakLine: true } },
            { text: d.repEmail }
        ].filter(l => l.text.trim() !== '\n' && l.text.trim() !== '');

        s.addText(repLines, {
            x: 7.2, y: 0.95, w: 5.7, h: 1.6,
            fontSize: 13, color: CS_DARK, fontFace: 'Arial',
            align: 'left', valign: 'top', margin: 0
        });

        // Client logo — if provided, show in right panel
        if (d.logoBase64) {
            // Strip the data URL prefix for pptxgenjs
            const logoData = d.logoBase64.includes(',')
                ? d.logoBase64.split(',')[1]
                : d.logoBase64;
            const mimeMatch = d.logoBase64.match(/data:(image\/[a-z+]+);/);
            const mime = mimeMatch ? mimeMatch[1] : 'image/png';
            s.addImage({
                data: `${mime};base64,${logoData}`,
                x: 6.2, y: 2.8, w: 3.5, h: 1.8,
                sizing: { type: 'contain', w: 3.5, h: 1.8 }
            });
        }

        // Cloudstaff + client company logos row at bottom left
        s.addText('cloudstaff', {
            x: 0.4, y: 6.6, w: 2.0, h: 0.5,
            fontSize: 14, bold: true, color: WHITE, fontFace: 'Arial'
        });
    }

    // ── SLIDE 2: Letter to client ─────────────────────
    {
        const s = pres.addSlide();
        s.background = { color: WHITE };

        // Header bar with logos
        s.addShape(pres.ShapeType.rect, {
            x: 0, y: 0, w: 13.33, h: 0.7,
            fill: { color: WHITE }, line: { color: 'E5E7EB', width: 0 }
        });

        // Cloudstaff logo mark (top right — blue circle placeholder)
        s.addShape(pres.ShapeType.ellipse, {
            x: 12.5, y: 0.08, w: 0.55, h: 0.55,
            fill: { color: CS_BLUE }, line: { color: CS_BLUE }
        });
        s.addText('☁', {
            x: 12.5, y: 0.08, w: 0.55, h: 0.55,
            fontSize: 14, color: WHITE, align: 'center', valign: 'middle'
        });

        // Salutation
        s.addText(`Dear ${d.clientFirst}`, {
            x: 0.9, y: 0.85, w: 11.5, h: 0.4,
            fontSize: 16, color: CS_DARK, fontFace: 'Arial', align: 'left'
        });

        // Body paragraph 1
        const para1 = `Thank you for considering Cloudstaff as your remote staffing partner. We understand the complexities of hiring and retention, and with this proposal, we offer tailored staffing solutions to meet ${d.clientCompany}'s unique needs.`;
        s.addText(para1, {
            x: 0.9, y: 1.45, w: 11.5, h: 0.8,
            fontSize: 13, color: CS_DARK, fontFace: 'Arial', align: 'justify', valign: 'top'
        });

        s.addText("Here's what we bring:", {
            x: 0.9, y: 2.4, w: 11.5, h: 0.35,
            fontSize: 13, color: CS_DARK, fontFace: 'Arial', bold: false
        });

        // Numbered benefit list
        const benefits = [
            { label: 'Expertise:', body: '18 years of experience in pioneering remote staffing and a team 6500+ strong.' },
            { label: 'Vast Candidate Pool:', body: 'Access to over 950,000+ potential team members to help you find your outsourced staff fast.' },
            { label: 'Industry Training:', body: 'Proven industry training programs to ensure your team members hit the ground running.' },
            { label: 'Simple Onboarding:', body: 'From candidate selection, IT and HR setup, to onboarding training – Cloudstaff will guide you through every step in the process.' },
            { label: 'Leading Technology:', body: 'Simplify the management and visibility of your remote team using our remote staff management applications.' },
            { label: 'Community & Culture:', body: 'We invest in the Cloudstaff Community to help you foster productivity and loyalty. We are proud to boast one of the industry\'s best retention rates.' },
            { label: 'Onshore Support:', body: 'Our onshore Customer Success team and Business Development Managers will strategize with you to ensure smooth onboarding and staff performance.' },
        ];

        const benefitRuns = [];
        benefits.forEach((b, i) => {
            benefitRuns.push({ text: `${i+1}.  `, options: { bold: false } });
            benefitRuns.push({ text: b.label + ' ', options: { bold: true } });
            benefitRuns.push({ text: b.body, options: { bold: false, breakLine: true } });
        });

        s.addText(benefitRuns, {
            x: 0.9, y: 2.85, w: 11.5, h: 3.0,
            fontSize: 12, color: CS_DARK, fontFace: 'Arial',
            align: 'left', valign: 'top', lineSpacingMultiple: 1.2
        });

        // Sign-off
        s.addText('I look forward to meeting with you again to discuss this proposal and address any queries you have.', {
            x: 0.9, y: 5.95, w: 11.5, h: 0.4,
            fontSize: 12, color: CS_DARK, fontFace: 'Arial'
        });

        s.addText([
            { text: 'Warm regards,', options: { breakLine: true } },
            { text: '\n', options: { breakLine: true } },
            { text: d.repName, options: { bold: true } }
        ], {
            x: 0.9, y: 6.45, w: 5, h: 0.8,
            fontSize: 12, color: CS_DARK, fontFace: 'Arial'
        });

        // Page number
        s.addText('2', {
            x: 0, y: 7.2, w: 13.33, h: 0.25,
            fontSize: 10, color: CS_MUTED, align: 'center'
        });

        // Footer wave shape
        s.addShape(pres.ShapeType.rect, {
            x: 0, y: 7.25, w: 13.33, h: 0.25,
            fill: { color: CS_GRAY }, line: { color: CS_GRAY }
        });
    }

    // ── SLIDE 3: Stats (generic — no personalisation) ──
    {
        const s = pres.addSlide();
        s.background = { color: WHITE };

        s.addText('A few stats', {
            x: 0.5, y: 0.3, w: 8, h: 0.6,
            fontSize: 32, bold: true, color: CS_BLUE, fontFace: 'Arial'
        });

        s.addText('Here are a few Cloudstaff stats that you might be interested in.', {
            x: 0.5, y: 1.0, w: 8, h: 0.4,
            fontSize: 14, bold: true, color: CS_DARK, fontFace: 'Arial'
        });
        s.addText('Cloudstaff are proud to share our success stories and metrics with our customers to show what true partnership can enable.', {
            x: 0.5, y: 1.45, w: 8, h: 0.55,
            fontSize: 13, color: CS_DARK, fontFace: 'Arial'
        });

        const stats = [
            { label: 'Cloudstaffers', value: '7,000+' },
            { label: 'Staff retention', value: '94%' },
            { label: 'Countries', value: '17' },
            { label: 'Dedicated CS Offices', value: '21' },
            { label: 'Unique Roles', value: '506' },
            { label: 'Screened Candidates', value: '950,000' },
            { label: 'Customers', value: '1,200+' },
            { label: 'Annual Growth', value: '43%' },
        ];

        const cols = 4;
        stats.forEach((st, i) => {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const bx = 0.5 + col * 3.1;
            const by = 2.2 + row * 1.6;
            s.addShape(pres.ShapeType.rect, {
                x: bx, y: by, w: 2.85, h: 1.3,
                fill: { color: CS_BLUE }, line: { color: CS_BLUE }
            });
            s.addText(st.label, {
                x: bx, y: by + 0.08, w: 2.85, h: 0.35,
                fontSize: 11, color: WHITE, fontFace: 'Arial', align: 'center'
            });
            s.addText(st.value, {
                x: bx, y: by + 0.42, w: 2.85, h: 0.7,
                fontSize: 34, bold: true, color: WHITE, fontFace: 'Arial', align: 'center'
            });
        });

        s.addText('3', { x: 0, y: 7.2, w: 13.33, h: 0.25, fontSize: 10, color: CS_MUTED, align: 'center' });
    }

    // ── SLIDE 4: Proposal Pricing ─────────────────────
    {
        const s = pres.addSlide();
        s.background = { color: WHITE };

        s.addText('Cloudstaff Proposal', {
            x: 0.5, y: 0.18, w: 12.0, h: 0.6,
            fontSize: 32, bold: true, color: CS_BLUE, fontFace: 'Arial', align: 'center'
        });

        // Cloudstaff logo mark top right
        s.addShape(pres.ShapeType.ellipse, {
            x: 12.55, y: 0.15, w: 0.55, h: 0.55,
            fill: { color: CS_BLUE }, line: { color: CS_BLUE }
        });

        // ── Pricing table ─────────────────────────────
        // Header row
        const headerStyle = { bold: true, color: WHITE, fontSize: 12, fontFace: 'Arial', align: 'center', valign: 'middle' };
        const subStyle    = { bold: false, color: WHITE, fontSize: 9.5, fontFace: 'Arial', align: 'center', valign: 'middle', italic: true };
        const cellStyle   = { color: CS_DARK, fontSize: 12, fontFace: 'Arial', align: 'center', valign: 'middle' };
        const totalStyle  = { color: CS_DARK, fontSize: 12, fontFace: 'Arial', align: 'center', valign: 'middle', bold: true };

        const tableData = [
            // Header row 1 — column titles
            [
                { text: 'Role',                        options: { ...headerStyle, fill: { color: TABLE_HEADER_BG }, rowspan: 2 } },
                { text: 'Employee Direct Costs',       options: { ...headerStyle, fill: { color: TABLE_HEADER_BG } } },
                { text: `Managed PC\n(${mpcName})`,   options: { ...headerStyle, fill: { color: TABLE_HEADER_BG } } },
                { text: 'Cloudstaff Service\nManagement fee', options: { ...headerStyle, fill: { color: TABLE_HEADER_BG } } },
                { text: 'Upgrades &\nAdditional Requests', options: { ...headerStyle, fill: { color: TABLE_HEADER_BG } } },
                { text: `Monthly Total\n(${d.currency})`, options: { ...headerStyle, fill: { color: TABLE_HEADER_BG } } },
            ],
            // Sub-header row
            [
                { text: 'Salary, including all base pay,\ngovt and Cloudstaff\nBenefits Programs', options: { ...subStyle, fill: { color: TABLE_HEADER_BG } } },
                { text: 'Managed PC –\nPC Hardware, insurance,\nand 24 x 7 support.',              options: { ...subStyle, fill: { color: TABLE_HEADER_BG } } },
                { text: 'Work From Home',              options: { ...subStyle, fill: { color: TABLE_HEADER_BG } } },
                { text: '',                             options: { fill: { color: TABLE_HEADER_BG } } },
                { text: '',                             options: { fill: { color: TABLE_HEADER_BG } } },
            ],
            // Role section header
            [
                { text: d.roleName,  options: { bold: true, color: CS_DARK, fontSize: 12, fontFace: 'Arial', align: 'left', valign: 'middle', colspan: 6, fill: { color: 'EBF3FF' } } },
            ],
            // Data row
            [
                { text: '',                  options: { ...cellStyle, fill: { color: TABLE_ALT_BG }, align: 'left' } },
                { text: d.edcAmount,         options: { ...cellStyle, fill: { color: TABLE_ALT_BG } } },
                { text: d.mpcAmount,         options: { ...cellStyle, fill: { color: TABLE_ALT_BG } } },
                { text: d.mgmtFee,           options: { ...cellStyle, fill: { color: TABLE_ALT_BG } } },
                { text: d.upgradesStr,       options: { ...cellStyle, fill: { color: TABLE_ALT_BG } } },
                { text: d.totalMonthly,      options: { ...totalStyle, fill: { color: TABLE_ALT_BG } } },
            ],
        ];

        s.addTable(tableData, {
            x: 0.35, y: 0.88, w: 12.63,
            colW: [2.1, 2.5, 2.1, 2.1, 1.9, 1.93],
            rowH: [0.45, 0.52, 0.38, 0.48],
            border: { pt: 1, color: 'D1D5DB' },
            autoPage: false,
        });

        // ── Three info boxes ──────────────────────────
        const boxY = 3.45;
        const boxH = 2.5;
        const boxes = [
            {
                x: 0.35, title: 'One-Off Setup Costs:',
                lines: [
                    'Establishment fee and deposit payable on securing successful applications',
                    '• Establishment costs mPC setup fee $200 per seat',
                    '• Recruitment Fee of $199–$299',
                    '• 1 month deposit in advance per staff member (refundable)',
                ]
            },
            {
                x: 4.7, title: 'Tailored Options:',
                lines: [
                    'Your Business Development Manager can tailor proposal options, including:',
                    '• Dedicated desk in office',
                    '• Desk in private suite',
                    '• Enhanced PC upgrade available',
                    '• 24x7 escalation',
                ]
            },
            {
                x: 9.05, title: 'Commercial Terms:',
                lines: [
                    'Your Master Service Agreement and Statement of Work includes these terms:',
                    '• Hours: 8 hour working days includes 2 paid 15 minute breaks. Excludes 1 unpaid 1 hour lunch break.',
                    '• Notice period 90 Days',
                    '• Paid in arrears',
                ]
            },
        ];

        boxes.forEach(box => {
            s.addShape(pres.ShapeType.rect, {
                x: box.x, y: boxY, w: 4.1, h: boxH,
                fill: { color: 'F3F4F6' }, line: { color: 'D1D5DB', width: 1 }
            });
            s.addText(box.title, {
                x: box.x + 0.15, y: boxY + 0.15, w: 3.8, h: 0.3,
                fontSize: 11.5, bold: true, color: CS_DARK, fontFace: 'Arial', margin: 0
            });
            const bodyRuns = box.lines.map((l, i) => ({
                text: l,
                options: { breakLine: i < box.lines.length - 1 }
            }));
            s.addText(bodyRuns, {
                x: box.x + 0.15, y: boxY + 0.52, w: 3.8, h: boxH - 0.65,
                fontSize: 10, color: CS_DARK, fontFace: 'Arial',
                align: 'left', valign: 'top', lineSpacingMultiple: 1.25
            });
        });

        // Footnotes
        s.addText([
            { text: '** GST applicable to clients in Australia', options: { breakLine: true } },
            { text: '** Prices may vary depending on candidate experience and qualification levels', options: { breakLine: true } },
            { text: '** Quotes are valid for 30 days and may vary due to FX rates at the time' },
        ], {
            x: 0.35, y: 6.3, w: 12.63, h: 0.65,
            fontSize: 9, color: CS_MUTED, fontFace: 'Arial', italic: true
        });

        s.addText('4', { x: 0, y: 7.2, w: 13.33, h: 0.25, fontSize: 10, color: CS_MUTED, align: 'center' });
    }

    // ── SLIDE 5: Benefits (generic) ───────────────────
    {
        const s = pres.addSlide();
        s.background = { color: WHITE };

        s.addText('Great Benefits = the Best Staff', {
            x: 0.5, y: 0.2, w: 12.0, h: 0.6,
            fontSize: 30, bold: true, color: CS_BLUE, fontFace: 'Arial', align: 'center'
        });

        const benefits = [
            { name: 'Social security', desc: 'Provides benefits in the event of disability, sickness, retirement, or death.' },
            { name: 'Government health insurance', desc: 'Medical and hospitalization benefits to employees and dependents.' },
            { name: 'Home development mutual fund', desc: 'Helps employees save money for their housing needs.' },
            { name: '13th Month Pay', desc: 'Annual bonus given to employees to help them end of year expenses.' },
            { name: 'Leave and holidays', desc: '23 public holidays (PH) or follow Aus Local holidays and 12 days leave per year.' },
            { name: 'Rice subsidy', desc: 'A monthly rice allowance.' },
            { name: 'Community', desc: 'Mid-year team building and Roar end of year celebration.' },
            { name: 'Social club', desc: 'Regular regional team building events encourage engagement and community.' },
            { name: 'HMO employer private health insurance', desc: 'For Cloudstaffer and one dependent.' },
            { name: 'Company pharmacy and onsite doctor', desc: 'Provide immediate health assistance when needed.' },
            { name: 'Grade-A offices', desc: 'Great workplaces include clean and modern facilities, breakout and lounges.' },
            { name: 'Perks', desc: 'Regular meals, coffee, Free Beer Fridays and regular giveaways.' },
            { name: 'Rewards', desc: 'Cloudstaff Dream Points can be exchanged for rewards such as food or vouchers.' },
            { name: 'Cloudstaff Share Club', desc: 'Share club units for tenure and customer/performance awards.' },
        ];

        // Table header
        const hStyle = { bold: true, color: WHITE, fontSize: 12, fontFace: 'Arial', align: 'center', valign: 'middle', fill: { color: TABLE_HEADER_BG } };
        const rows = [
            [
                { text: 'Benefit', options: { ...hStyle, align: 'left' } },
                { text: 'Government\nmandated', options: { ...hStyle } },
                { text: 'Cloudstaff', options: { ...hStyle } },
            ]
        ];

        const govtMandated = [0,1,2,3,4,5]; // indices
        benefits.forEach((b, i) => {
            const bg = i % 2 === 0 ? TABLE_ROW_BG : TABLE_ALT_BG;
            const isGovt = govtMandated.includes(i);
            rows.push([
                { text: b.name + ': ' + b.desc, options: { color: CS_DARK, fontSize: 10.5, fontFace: 'Arial', align: 'left', valign: 'middle', fill: { color: bg }, bold: false } },
                { text: isGovt ? '✓' : '', options: { color: CS_BLUE, fontSize: 14, fontFace: 'Arial', align: 'center', valign: 'middle', fill: { color: bg }, bold: true } },
                { text: '✓', options: { color: CS_BLUE, fontSize: 14, fontFace: 'Arial', align: 'center', valign: 'middle', fill: { color: bg }, bold: true } },
            ]);
        });

        s.addTable(rows, {
            x: 0.35, y: 0.92, w: 12.63,
            colW: [9.63, 1.5, 1.5],
            rowH: 0.33,
            border: { pt: 0.5, color: 'E5E7EB' },
        });

        s.addText('5', { x: 0, y: 7.2, w: 13.33, h: 0.25, fontSize: 10, color: CS_MUTED, align: 'center' });
    }

    // ── SLIDE 6: Transparent Pricing (generic) ────────
    {
        const s = pres.addSlide();
        s.background = { color: WHITE };

        s.addText('Transparent monthly pricing', {
            x: 0.5, y: 0.2, w: 12.0, h: 0.6,
            fontSize: 32, bold: true, color: CS_BLUE, fontFace: 'Arial', align: 'center'
        });

        // Left box — one-off setup
        s.addShape(pres.ShapeType.rect, { x: 0.5, y: 1.0, w: 5.7, h: 2.6, fill: { color: CS_BLUE }, line: { color: CS_BLUE } });
        s.addText([
            { text: 'One-off recruitment fee $199–$299\n', options: { bold: true, breakLine: true } },
            { text: 'One-time mPC setup fee $200', options: { bold: true } },
        ], { x: 0.7, y: 1.2, w: 5.3, h: 0.9, fontSize: 15, color: WHITE, fontFace: 'Arial', align: 'center' });
        s.addText('The one-off establishment fees cover recruitment, setup and IT equipment with enterprise-grade security', {
            x: 0.7, y: 2.15, w: 5.3, h: 1.0, fontSize: 12, color: WHITE, fontFace: 'Arial', align: 'center'
        });

        // Right box — deposit
        s.addShape(pres.ShapeType.rect, { x: 6.6, y: 1.0, w: 6.2, h: 2.6, fill: { color: '90CAF9' }, line: { color: '90CAF9' } });
        s.addText('One-off 1 month advance deposit', {
            x: 6.8, y: 1.2, w: 5.8, h: 0.6, fontSize: 18, bold: true, color: CS_DARK, fontFace: 'Arial', align: 'center'
        });
        s.addText('Once we have secured your ideal candidate the one-time deposit equal to 1 month advance activates your staff member', {
            x: 6.8, y: 1.9, w: 5.8, h: 1.3, fontSize: 12.5, color: CS_DARK, fontFace: 'Arial', align: 'center'
        });

        // Bottom box — monthly recurring
        s.addShape(pres.ShapeType.rect, { x: 0.5, y: 3.85, w: 12.33, h: 3.1, fill: { color: 'E3F2FD' }, line: { color: 'BBDEFB' } });
        s.addText('Monthly Recurring Investment', {
            x: 0.7, y: 4.0, w: 11.9, h: 0.45, fontSize: 18, bold: true, color: CS_DARK, fontFace: 'Arial', align: 'center'
        });
        s.addText('The monthly recurring investment covers:', {
            x: 0.9, y: 4.55, w: 11.5, h: 0.3, fontSize: 13, bold: true, color: CS_DARK, fontFace: 'Arial'
        });
        const mriItems = [
            { text: 'Employee Direct Costs: ', options: { bold: true } },
            { text: 'Transparent staff salary and Cloudstaff employee benefits and events.\n', options: { breakLine: true } },
            { text: 'Managed PC: ', options: { bold: true } },
            { text: 'Laptop with enterprise-grade security.\n', options: { breakLine: true } },
            { text: 'Options: ', options: { bold: true } },
            { text: 'Any options you select for specialized/additional equipment, dedicated office space/suites, and night differential.\n', options: { breakLine: true } },
            { text: 'Cloudstaff Service Management: ', options: { bold: true } },
            { text: 'Covers account management, onshore customer success executive and all elements relevant to your team member including HR, payroll, security, infrastructure, legal, and compliance.' },
        ];
        s.addText(mriItems, {
            x: 0.9, y: 4.9, w: 11.5, h: 1.9, fontSize: 12, color: CS_DARK, fontFace: 'Arial', valign: 'top'
        });

        s.addText('6', { x: 0, y: 7.2, w: 13.33, h: 0.25, fontSize: 10, color: CS_MUTED, align: 'center' });
    }

    // ── SLIDE 7: Work Options (generic) ──────────────
    {
        const s = pres.addSlide();
        s.background = { color: '111827' };

        s.addText('CLOUDSTAFF YOUR WORKFORCE IN THE CLOUD', {
            x: 7.0, y: 0.2, w: 6.0, h: 0.3,
            fontSize: 9, color: 'AAAAAA', fontFace: 'Arial', align: 'right', charSpacing: 1.5
        });

        const options = [
            { color: CS_BLUE, title: 'Work From Home', body: 'Maximize access to skills. Minimize commute fatigue with the Work From Home option.' },
            { color: 'F59E0B', title: 'Work Hybrid', body: 'Ultimate flexibility providing the best of Work From Home and Work From Office.' },
            { color: 'EC4899', title: 'Work from Office', body: 'Maximize productivity with dedicated seating in our A-grade offices with dependable power and internet access.' },
            { color: '10B981', title: 'Private office suites', body: 'Maximize team building and security with the option to locate your seats in a dedicated suite.' },
        ];

        options.forEach((opt, i) => {
            const y = 0.7 + i * 1.5;
            s.addShape(pres.ShapeType.rect, { x: 7.1, y: y, w: 0.08, h: 1.0, fill: { color: opt.color }, line: { color: opt.color } });
            s.addText(opt.title, { x: 7.35, y: y, w: 5.7, h: 0.35, fontSize: 16, bold: true, color: opt.color, fontFace: 'Arial' });
            s.addText(opt.body, { x: 7.35, y: y + 0.38, w: 5.7, h: 0.6, fontSize: 12, color: WHITE, fontFace: 'Arial', valign: 'top' });
        });

        s.addText('Philippines     India     Colombia', {
            x: 0.5, y: 5.5, w: 5.5, h: 0.35, fontSize: 12, color: WHITE, fontFace: 'Arial', bold: true, align: 'center'
        });

        s.addText('7', { x: 0, y: 7.2, w: 13.33, h: 0.25, fontSize: 10, color: '555555', align: 'center' });
    }

    // ── Remaining slides: generic ─────────────────────
    // Slide 8 — Why choose Cloudstaff
    {
        const s = pres.addSlide();
        s.background = { color: WHITE };
        s.addText('Why high-growth companies choose Cloudstaff', {
            x: 0.3, y: 0.2, w: 3.2, h: 2.5,
            fontSize: 22, bold: true, color: WHITE, fontFace: 'Arial',
            fill: { color: CS_BLUE }
        });

        const stats = [
            { val: '7,000+', label: 'Cloudstaffers' },
            { val: '94%', label: 'Staff retention' },
            { val: '21', label: 'Dedicated CS Offices' },
        ];
        stats.forEach((st, i) => {
            const y = 0.2 + i * 0.88;
            s.addShape(pres.ShapeType.rect, { x: 0.3, y: y + 2.55, w: 3.2, h: 0.75, fill: { color: i === 0 ? CS_DARK : i === 1 ? 'F59E0B' : CS_BLUE }, line: { color: CS_DARK } });
            s.addText(st.val + '\n' + st.label, { x: 0.3, y: y + 2.55, w: 3.2, h: 0.75, fontSize: 13, bold: true, color: WHITE, fontFace: 'Arial', align: 'center' });
        });

        const pillars = [
            { title: 'Fast Access to the World\'s Top Talent:', body: 'With a specialty in hiring professional services talent, 950,000 registered candidates and a four-time winner of HR Asia Best Places to Work, we can help you access brilliant talent fast.' },
            { title: 'Our Commitment to Culture:', body: 'We align talent with your company culture. In parallel, we invest in the Cloudstaff Community — from weekly TV updates to great benefits and the best social events.' },
            { title: 'Investing in Customer Success:', body: 'Unlike other \'hands-off\' outsourcing models, we operate as an extension of your team, providing monthly account management meetings to quarterly business reviews.' },
            { title: 'Remote Staffing Technology:', body: 'We are investing across the staff lifecycle so you don\'t have to — from great secure computing platforms, to AI candidate matching, to the Cloudstaff Apps.' },
        ];

        pillars.forEach((p, i) => {
            const px = 3.85 + i * 2.35;
            s.addText(p.title, { x: px, y: 0.2, w: 2.15, h: 0.6, fontSize: 11.5, bold: true, color: CS_BLUE, fontFace: 'Arial' });
            s.addText(p.body, { x: px, y: 0.9, w: 2.15, h: 5.8, fontSize: 10.5, color: CS_DARK, fontFace: 'Arial', valign: 'top' });
        });

        s.addText('8', { x: 0, y: 7.2, w: 13.33, h: 0.25, fontSize: 10, color: CS_MUTED, align: 'center' });
    }

    // ── Slide 9 — Cloudstaff experience (credentials) ─
    {
        const s = pres.addSlide();
        s.background = { color: WHITE };
        s.addText('Cloudstaff experience', {
            x: 0.5, y: 0.18, w: 12.0, h: 0.6, fontSize: 32, bold: true, color: CS_BLUE, fontFace: 'Arial', align: 'center'
        });
        s.addShape(pres.ShapeType.rect, { x: 0.35, y: 0.88, w: 8.5, h: 5.9, fill: { color: CS_BLUE }, line: { color: CS_BLUE } });
        s.addText('A few of our 1,100+ customers', { x: 0.5, y: 0.98, w: 8.2, h: 0.4, fontSize: 13, bold: true, color: WHITE, fontFace: 'Arial', align: 'center' });
        const customers = ['WIPFLI','Raine&Horne','carsales','AMP','Valiant','Hilton','FINDEX','Portable','McGrath','arrivia','ZeroBooks','McCONNELL DOWELL','Kahoot!','frontiernetworks','Clutch','Built.','HP','Valiant Finance','wattly','PARKSHIFT'];
        s.addText(customers.join('   ·   '), { x: 0.5, y: 1.5, w: 8.2, h: 5.0, fontSize: 10, color: WHITE, fontFace: 'Arial', align: 'center', valign: 'middle', lineSpacingMultiple: 1.8 });

        s.addShape(pres.ShapeType.rect, { x: 9.1, y: 0.88, w: 3.9, h: 5.9, fill: { color: CS_BLUE }, line: { color: CS_BLUE } });
        s.addText('Our credentials', { x: 9.2, y: 0.98, w: 3.7, h: 0.4, fontSize: 13, bold: true, color: WHITE, fontFace: 'Arial', align: 'center' });
        const creds = ['HR Asia Best Places to Work in Asia award (2021, 2022, 2023, 2024 & 2025)', 'HR Asia Digital Transformation Award (2023)', 'ISO 27001', 'ISO 9001', 'HIPAA COMPLIANT', 'General Data Protection Regulation'];
        const credRuns = creds.flatMap((c, i) => [{ text: c, options: { breakLine: i < creds.length - 1 } }]);
        s.addText(credRuns, { x: 9.2, y: 1.5, w: 3.7, h: 5.0, fontSize: 10.5, color: WHITE, fontFace: 'Arial', align: 'left', valign: 'middle', lineSpacingMultiple: 2 });

        s.addText('9', { x: 0, y: 7.2, w: 13.33, h: 0.25, fontSize: 10, color: CS_MUTED, align: 'center' });
    }

    // ── Slide 10 — How it works ───────────────────────
    {
        const s = pres.addSlide();
        s.background = { color: WHITE };
        s.addText('How it works', { x: 0.5, y: 0.15, w: 12.0, h: 0.6, fontSize: 32, bold: true, color: CS_BLUE, fontFace: 'Arial', align: 'center' });
        s.addShape(pres.ShapeType.rect, { x: 0.35, y: 0.85, w: 12.63, h: 2.2, fill: { color: CS_BLUE }, line: { color: CS_BLUE } });
        s.addText('Build your team in\nfour simple steps', { x: 0.5, y: 0.95, w: 4.5, h: 1.9, fontSize: 22, bold: true, color: WHITE, fontFace: 'Arial', valign: 'middle' });

        const steps = [
            { num: '1', title: 'Tell us what you need', bullets: ['950,000 candidates in our database','90 recruiters','AI matching technology'] },
            { num: '2', title: 'Interview & select', bullets: ['Only the best shortlisted candidates will be presented','Online candidate view in CS jobs for easy viewing and approval'] },
            { num: '3', title: 'We hire & set up', bullets: ['ISO certified enterprise-grade IT equipment','Cloudstaff owned and provided PC and hardware'] },
            { num: '4', title: 'Your staff, your direction', bullets: ['Cloudstaff desktop and mobile apps make managing your team easy','You have direct contact with your staff every day.'] },
        ];
        steps.forEach((st, i) => {
            const x = 3.5 + i * 2.42;
            s.addShape(pres.ShapeType.ellipse, { x: x, y: 3.3, w: 0.5, h: 0.5, fill: { color: WHITE }, line: { color: CS_BLUE } });
            s.addText(st.num, { x: x, y: 3.3, w: 0.5, h: 0.5, fontSize: 14, bold: true, color: CS_DARK, fontFace: 'Arial', align: 'center', valign: 'middle' });
            s.addText(st.title, { x: x - 0.5, y: 3.95, w: 1.5, h: 0.4, fontSize: 11.5, bold: false, color: CS_DARK, fontFace: 'Arial', align: 'center' });
            const bulletRuns = st.bullets.map((b, bi) => ({ text: b, options: { bullet: true, breakLine: bi < st.bullets.length - 1 } }));
            s.addText(bulletRuns, { x: x - 0.5, y: 4.4, w: 1.5, h: 2.6, fontSize: 10, color: CS_BLUE, fontFace: 'Arial', bold: true, align: 'center', valign: 'top' });
        });

        s.addText('10', { x: 0, y: 7.2, w: 13.33, h: 0.25, fontSize: 10, color: CS_MUTED, align: 'center' });
    }

    // ── Final slide — closing ─────────────────────────
    {
        const s = pres.addSlide();
        s.background = { color: CS_BLUE };
        s.addText('cloudstaff.', {
            x: 2.0, y: 2.5, w: 9.33, h: 1.5,
            fontSize: 64, bold: true, color: WHITE, fontFace: 'Arial', align: 'center'
        });
        // Circular logo element
        s.addShape(pres.ShapeType.ellipse, { x: 4.5, y: 1.1, w: 1.5, h: 1.5, fill: { color: WHITE, transparency: 20 }, line: { color: WHITE } });
        s.addText('☁', { x: 4.5, y: 1.1, w: 1.5, h: 1.5, fontSize: 42, color: CS_BLUE, align: 'center', valign: 'middle' });
    }

    // ── Write file ────────────────────────────────────
    const fileName = `Cloudstaff_Proposal_${d.clientFullName.replace(/\s+/g,'_')}_${d.quoteNumber || 'Draft'}.pptx`;
    await pres.writeFile({ fileName });
}

// ── Attach logo input listener after DOM ready ────────
document.addEventListener('DOMContentLoaded', function() {
    const logoInput = document.getElementById('proposalLogoInput');
    if (logoInput) {
        logoInput.addEventListener('change', function() {
            handleProposalLogoUpload(this);
        });
    }
});
