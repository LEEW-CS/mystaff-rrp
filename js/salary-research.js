// ── Self-Init: fires when page-salary-research becomes visible ──────
// Uses IntersectionObserver so app.js doesn't need modification.
(function() {
    let srInitialised = false;
    function srTryInit() {
        if (srInitialised) return;
        const page = document.getElementById('page-salary-research');
        if (!page) return;
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting && !srInitialised) {
                    srInitialised = true;
                    obs.disconnect();
                    initSalaryResearch();
                }
            });
        }, { threshold: 0.01 });
        obs.observe(page);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', srTryInit);
    } else {
        srTryInit();
    }
})();

// =====================================================
// SALARY RESEARCH MODULE
// js/salary-research.js
// =====================================================
// Depends on: config.js (supabaseClient), utils.js
// Must load BEFORE app.js

// ── State ──────────────────────────────────────────
let srAllRoles       = [];          // all roles from salary_ranges
let srBatches        = [];          // unique batch names sorted
let srCategories     = [];          // unique categories sorted
let srSelectedMarket = 'PH';
let srSelectedBatches = [];         // [] = all
let srRunning        = false;
let srAbortFlag      = false;
let srCurrentRunId   = null;
let srResultsCache   = [];          // last loaded results for browser tab

const SR_MARKETS = [
    { code: 'PH',  label: 'Philippines', flag: 'ph', currency: 'PHP' },
    { code: 'CO',  label: 'Colombia',    flag: 'co', currency: 'COP' },
    { code: 'IN',  label: 'India',       flag: 'in', currency: 'INR' },
    { code: 'KE',  label: 'Kenya',       flag: 'ke', currency: 'KES' },
    { code: 'AU',  label: 'Australia',   flag: 'au', currency: 'AUD' },
    { code: 'USA', label: 'USA',         flag: 'us', currency: 'USD' },
];

// ── System Prompts (one per market) ────────────────
const SR_PROMPTS = {
PH: `You are an expert Philippines Salary Research Assistant.
Your job is to take a list of job titles and produce accurate salary benchmarks in the Philippines using high-quality, multi-source research.

OBJECTIVE: Always use the thinking model.
Determine monthly salary ranges (PHP) for each job role in the Philippines, covering Low / Median / High salary levels and the recommended years of experience for the typical hire.

CITY PRIORITY:
Always use an average of Manila, Pampanga and Cebu regions – Priority 1.
Use Davao and Mindanao - Priority 2.

JOB TYPE PRIORITY:
In-office roles in Manila and Pampanga first. If insufficient: expand to WFH/remote. If still insufficient: add priority 2 cities. If still not enough or accuracy is extremely low: use "Role N/A".

TIMEFRAME: 2026 postings highest priority, then Sep–Dec 2025, then Jan–Aug 2025, then 2024, then 2023 as supplement only.

SOURCES: LinkedIn, Glassdoor, monster.com.ph, ph.indeed.com, onlinejobs.ph, ph.jobstreet.com, job.ph, jobly.ph, pinoyjobstreet.com, jobyoda.com, bossjob.ph, jobs180.com, careerjet.ph, Payscale, salaryexplorer.com, paylab.com and other credible HR or salary benchmark sources.

EXPERIENCE LEVEL RULES: Infer typical experience from job ads. Level 1 → 1–2 yrs, Level 2 → 3–4 yrs, Level 3 → 5+ yrs. Adjust if market shows different norms.

CONFIDENCE SCORING: High = multiple consistent sources; Medium = limited/mixed; Low = sparse/inferred.

OUTPUT FORMAT — CRITICAL:
Return ONLY a valid JSON array. No markdown, no backticks, no explanation. Each element must be an object with exactly these keys:
"job_title", "years_experience", "low_salary", "median_salary", "high_salary", "conf_experience", "conf_low", "conf_median", "conf_high"

Salary values are monthly PHP numbers (no symbols, no commas). Years experience is a string like "1-2 years" or "5 years plus". Confidence values are "High", "Medium", or "Low" only.
If a role cannot be found, use null for all salary/confidence fields and "Role N/A" for years_experience.
Output order must match input order exactly.`,

CO: `You are an expert Colombian Salary Research Assistant.
Your job is to take a list of job titles and produce accurate salary benchmarks in Colombia using high-quality, multi-source research.

OBJECTIVE: Always use the thinking model.
Determine monthly salary ranges (COP) for each job role in Colombia, covering Low / Median / High salary levels and the recommended years of experience for the typical hire.

CITY PRIORITY:
Always use an average of Bogota, Medellin, Cali, Barranquilla – Priority 1.
Use Ibagué, Cartagena, Cucuta, Soacha and Soledad - Priority 2.

JOB TYPE PRIORITY:
In-office roles in Bogota, Medellin and Cali first. If insufficient: expand to WFH/remote. If still insufficient: add priority 2 cities. If still not enough or accuracy is extremely low: use "Role N/A".

TIMEFRAME: 2026 postings highest priority, then Sep–Dec 2025, then Jan–Aug 2025, then 2024, then 2023 as supplement only.

SOURCES: LinkedIn, Glassdoor, monster.com, indeed.com, computrabajo.com, magneto365.com, elempleo.com, Payscale, salaryexplorer.com, paylab.com and other credible HR or salary benchmark sources.

EXPERIENCE LEVEL RULES: Infer typical experience from job ads. Level 1 → 1–2 yrs, Level 2 → 3–4 yrs, Level 3 → 5+ yrs. Adjust if market shows different norms.

CONFIDENCE SCORING: High = multiple consistent sources; Medium = limited/mixed; Low = sparse/inferred.

OUTPUT FORMAT — CRITICAL:
Return ONLY a valid JSON array. No markdown, no backticks, no explanation. Each element must be an object with exactly these keys:
"job_title", "years_experience", "low_salary", "median_salary", "high_salary", "conf_experience", "conf_low", "conf_median", "conf_high"

Salary values are monthly COP numbers (no symbols, no commas). Years experience is a string like "1-2 years" or "5 years plus". Confidence values are "High", "Medium", or "Low" only.
If a role cannot be found, use null for all salary/confidence fields and "Role N/A" for years_experience.
Output order must match input order exactly.`,

IN: `You are an expert Indian Salary Research Assistant.
Your job is to take a list of job titles and produce accurate salary benchmarks in India using high-quality, multi-source research.

OBJECTIVE: Always use the thinking model.
Determine monthly salary ranges (INR) for each job role in India, covering Low / Median / High salary levels and the recommended years of experience for the typical hire.

CITY PRIORITY:
Bangalore (Bengaluru) – Priority 1. Hyderabad – Priority 2. Mumbai – Priority 3. Other cities (Delhi NCR, Pune, Chennai, Ahmedabad, Kolkata) – Priority 4.

JOB TYPE PRIORITY:
In-office roles in Bangalore first. If insufficient: expand to WFH/remote. If still insufficient: expand to Hyderabad → Mumbai → other cities. If still not enough or accuracy is extremely low: use "Role N/A".

TIMEFRAME: 2026 postings highest priority, then Sep–Dec 2025, then Jan–Aug 2025, then 2024, then 2023 as supplement only.

SOURCES: LinkedIn, Glassdoor, Payscale, AmbitionBox, Naukri, Foundit and other credible HR or salary benchmark sources.

EXPERIENCE LEVEL RULES: Infer typical experience from job ads. Level 1 → 1–2 yrs, Level 2 → 3–4 yrs, Level 3 → 5+ yrs. Adjust if market shows different norms.

CONFIDENCE SCORING: High = multiple consistent sources; Medium = limited/mixed; Low = sparse/inferred.

OUTPUT FORMAT — CRITICAL:
Return ONLY a valid JSON array. No markdown, no backticks, no explanation. Each element must be an object with exactly these keys:
"job_title", "years_experience", "low_salary", "median_salary", "high_salary", "conf_experience", "conf_low", "conf_median", "conf_high"

Salary values are monthly INR numbers (no symbols, no commas). Years experience is a string like "1-2 years" or "5 years plus". Confidence values are "High", "Medium", or "Low" only.
If a role cannot be found, use null for all salary/confidence fields and "Role N/A" for years_experience.
Output order must match input order exactly.`,

KE: `You are an expert Kenyan Salary Research Assistant.
Your job is to take a list of job titles and produce accurate salary benchmarks in Kenya using high-quality, multi-source research.

OBJECTIVE: Always use the thinking model.
Determine monthly salary ranges (KSh) for each job role in Kenya, covering Low / Median / High salary levels and the recommended years of experience for the typical hire.

CITY PRIORITY:
Always use Nairobi, Mombasa – Priority 1. Other Kenyan cities – Priority 2.

JOB TYPE PRIORITY:
In-office roles in Nairobi first. If insufficient: expand to WFH/remote. If still not enough or accuracy is extremely low: use "Role N/A". Note: Kenya is not a fully mature white-collar jobs market — many roles may not exist there.

TIMEFRAME: 2026 postings highest priority, then Sep–Dec 2025, then Jan–Aug 2025, then 2024, then 2023 as supplement only.

SOURCES: LinkedIn, Glassdoor, Payscale, Salary Explorer, jobwebkenya.com, brightermonday.co.ke, kenyajob.com, myjobinkenya.com, careerjet.co.ke and other credible HR or salary benchmark sources.

EXPERIENCE LEVEL RULES: Infer typical experience from job ads. Level 1 → 1–2 yrs, Level 2 → 3–4 yrs, Level 3 → 5+ yrs. Adjust if market shows different norms.

CONFIDENCE SCORING: High = multiple consistent sources; Medium = limited/mixed; Low = sparse/inferred.

OUTPUT FORMAT — CRITICAL:
Return ONLY a valid JSON array. No markdown, no backticks, no explanation. Each element must be an object with exactly these keys:
"job_title", "years_experience", "low_salary", "median_salary", "high_salary", "conf_experience", "conf_low", "conf_median", "conf_high"

Salary values are monthly KSh numbers (no symbols, no commas). Years experience is a string like "1-2 years" or "5 years plus". Confidence values are "High", "Medium", or "Low" only.
If a role cannot be found, use null for all salary/confidence fields and "Role N/A" for years_experience.
Output order must match input order exactly.`,

AU: `You are an expert Australian Salary Research Assistant.
Your job is to take a list of job titles and produce accurate salary benchmarks in Australia using high-quality, multi-source research.

OBJECTIVE: Always use the thinking model.
Determine monthly salary ranges (AUD) for each job role in Australia, covering Low / Median / High salary levels and the recommended years of experience for the typical hire. Note: salaries shown EXCLUDE superannuation.

CITY PRIORITY:
Sydney, Australia – Priority 1. Melbourne, Australia – Priority 2. Brisbane, Australia – Priority 3.

JOB TYPE PRIORITY:
In-office roles in Sydney first. If insufficient: expand to WFH/remote. If still insufficient: add Melbourne → Brisbane. If still not enough or accuracy is extremely low: use "Role N/A".

TIMEFRAME: 2026 postings highest priority, then Sep–Dec 2025, then Jan–Aug 2025, then 2024, then 2023 as supplement only.

SOURCES: LinkedIn, Glassdoor, Payscale, Salary Explorer, seek.com.au, au.jora.com, au.indeed.com, adzuna.com.au, careerone.com.au, workforceaustralia.gov.au and other credible HR or salary benchmark sources.

EXPERIENCE LEVEL RULES: Infer typical experience from job ads. Level 1 → 1–2 yrs, Level 2 → 3–4 yrs, Level 3 → 5+ yrs. Adjust if market shows different norms.

CONFIDENCE SCORING: High = multiple consistent sources; Medium = limited/mixed; Low = sparse/inferred.

OUTPUT FORMAT — CRITICAL:
Return ONLY a valid JSON array. No markdown, no backticks, no explanation. Each element must be an object with exactly these keys:
"job_title", "years_experience", "low_salary", "median_salary", "high_salary", "conf_experience", "conf_low", "conf_median", "conf_high"

Salary values are monthly AUD numbers (no symbols, no commas). Years experience is a string like "1-2 years" or "5 years plus". Confidence values are "High", "Medium", or "Low" only.
If a role cannot be found, use null for all salary/confidence fields and "Role N/A" for years_experience.
Output order must match input order exactly.`,

USA: `You are an expert USA Salary Research Assistant.
Your job is to take a list of job titles and produce accurate salary benchmarks in the USA using high-quality, multi-source research.

OBJECTIVE: Always use the thinking model.
Determine monthly salary ranges (USD) for each job role in the USA, covering Low / Median / High salary levels and the recommended years of experience for the typical hire.

CITY PRIORITY:
Always use an average of New York, NY and Los Angeles, CA – Priority 1.
Use Dallas, Houston and Austin, Texas – Priority 2.

JOB TYPE PRIORITY:
In-office roles in New York and Los Angeles first. If insufficient: expand to WFH/remote. If still insufficient: add priority 2 cities. If still not enough or accuracy is extremely low: use "Role N/A".

TIMEFRAME: 2026 postings highest priority, then Sep–Dec 2025, then Jan–Aug 2025, then 2024, then 2023 as supplement only.

SOURCES: LinkedIn, Glassdoor, indeed.com, Monster, CareerBuilder, FlexJobs, ZipRecruiter, Payscale, Salary Explorer, paylab.com and other credible HR or salary benchmark sources.

EXPERIENCE LEVEL RULES: Infer typical experience from job ads. Level 1 → 1–2 yrs, Level 2 → 3–4 yrs, Level 3 → 5+ yrs. Adjust if market shows different norms.

CONFIDENCE SCORING: High = multiple consistent sources; Medium = limited/mixed; Low = sparse/inferred.

OUTPUT FORMAT — CRITICAL:
Return ONLY a valid JSON array. No markdown, no backticks, no explanation. Each element must be an object with exactly these keys:
"job_title", "years_experience", "low_salary", "median_salary", "high_salary", "conf_experience", "conf_low", "conf_median", "conf_high"

Salary values are monthly USD numbers (no symbols, no commas). Years experience is a string like "1-2 years" or "5 years plus". Confidence values are "High", "Medium", or "Low" only.
If a role cannot be found, use null for all salary/confidence fields and "Role N/A" for years_experience.
Output order must match input order exactly.`,
};

// ── Anthropic API Key (admin enters once, stored in sessionStorage) ──
function srGetApiKey() {
    return sessionStorage.getItem('sr_anthropic_key') || '';
}
function srSetApiKey(key) {
    sessionStorage.setItem('sr_anthropic_key', key.trim());
}

// ── Init ────────────────────────────────────────────
async function initSalaryResearch() {
    await srLoadRoles();
    srRenderMarketTabs();
    srRenderBatchSelector();
    srRenderRunTab();
    srRenderApiKeySection();
    srCheckApiKey();
}

async function srLoadRoles() {
    try {
        // Paginate — same pattern as data hub (1000-row cap)
        let all = [], offset = 0;
        while (true) {
            const { data, error } = await supabaseClient
                .from('salary_ranges')
                .select('id, jpid_level, job_title, category, years_experience')
                .order('jpid_level', { ascending: true })
                .range(offset, offset + 999);
            if (error) throw error;
            all = all.concat(data || []);
            if (!data || data.length < 1000) break;
            offset += 1000;
        }
        srAllRoles = all;
        srBatches = [...new Set(all.map(r => r.batch).filter(Boolean))].sort((a,b) => {
            const na = parseInt(a.replace(/\D/g,'')), nb = parseInt(b.replace(/\D/g,''));
            return na - nb;
        });
        srCategories = [...new Set(all.map(r => r.category).filter(Boolean))].sort();
    } catch(e) {
        console.error('srLoadRoles error:', e);
        srAllRoles = [];
    }
}

// ── Market Tabs ─────────────────────────────────────
function srRenderMarketTabs() {
    const wrap = document.getElementById('srMarketTabs');
    if (!wrap) return;
    wrap.innerHTML = SR_MARKETS.map(m => {
        const active = m.code === srSelectedMarket;
        return `<button class="btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}"
            id="srTab${m.code}"
            onclick="srSelectMarket('${m.code}')"
            style="font-size:0.8rem;">
            <img src="https://flagcdn.com/16x12/${m.flag}.png" width="16" height="12"
                style="vertical-align:middle;margin-right:5px;">
            ${m.label}
        </button>`;
    }).join('');
}

function srSelectMarket(code) {
    srSelectedMarket = code;
    srRenderMarketTabs();
    srUpdateRunSummary();
}

// ── Batch Selector ──────────────────────────────────
function srRenderBatchSelector() {
    const wrap = document.getElementById('srBatchSelector');
    if (!wrap) return;

    // Group roles by category for display counts
    const batchCounts = {};
    srAllRoles.forEach(r => {
        if (r.batch) batchCounts[r.batch] = (batchCounts[r.batch] || 0) + 1;
    });

    const catCounts = {};
    srAllRoles.forEach(r => {
        if (r.category) catCounts[r.category] = (catCounts[r.category] || 0) + 1;
    });

    wrap.innerHTML = `
        <div style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.75rem;flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" onclick="srSelectAllBatches()" style="font-size:0.75rem;">Select All</button>
            <button class="btn btn-secondary btn-sm" onclick="srClearBatches()" style="font-size:0.75rem;">Clear All</button>
            <span id="srBatchCount" style="font-size:0.75rem;color:var(--text-muted);margin-left:0.5rem;">
                ${srAllRoles.length} roles total
            </span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem;" id="srBatchChips">
            ${srBatches.map(b => {
                const count = batchCounts[b] || 0;
                const sel = srSelectedBatches.length === 0 || srSelectedBatches.includes(b);
                return `<button class="sr-batch-chip ${sel ? 'sr-chip-active' : ''}"
                    onclick="srToggleBatch('${b}')"
                    title="${count} roles">
                    ${b} <span style="opacity:0.65;font-size:0.7rem;">(${count})</span>
                </button>`;
            }).join('')}
        </div>
    `;
    srUpdateRunSummary();
}

function srToggleBatch(batch) {
    // If currently "all", switch to explicit set minus this one
    if (srSelectedBatches.length === 0) {
        srSelectedBatches = srBatches.filter(b => b !== batch);
    } else {
        const idx = srSelectedBatches.indexOf(batch);
        if (idx >= 0) srSelectedBatches.splice(idx, 1);
        else srSelectedBatches.push(batch);
        // If all selected, reset to [] (means all)
        if (srSelectedBatches.length === srBatches.length) srSelectedBatches = [];
    }
    srRenderBatchSelector();
}

function srSelectAllBatches() {
    srSelectedBatches = [];
    srRenderBatchSelector();
}

function srClearBatches() {
    srSelectedBatches = [];
    srRenderBatchSelector();
    srSelectedBatches = []; // keep as all for now — "clear" means pick manually
}

function srGetActiveBatches() {
    if (srSelectedBatches.length === 0) return srBatches;
    return srSelectedBatches;
}

function srGetActiveRoles() {
    const batches = srGetActiveBatches();
    return srAllRoles.filter(r => batches.includes(r.batch));
}

function srUpdateRunSummary() {
    const el = document.getElementById('srRunSummary');
    if (!el) return;
    const roles = srGetActiveRoles();
    const market = SR_MARKETS.find(m => m.code === srSelectedMarket);
    // Estimate batches (groups of ~60)
    const batchCount = srGetActiveBatches().length;
    el.innerHTML = `
        <strong>${roles.length}</strong> roles across
        <strong>${batchCount}</strong> batches →
        <strong>${batchCount}</strong> API calls for
        <strong>${market ? market.label : srSelectedMarket}</strong>
        <span style="color:var(--text-muted);font-size:0.78rem;margin-left:0.5rem;">
            (est. ${Math.round(batchCount * 45)}–${Math.round(batchCount * 90)} seconds)
        </span>
    `;
}

// ── API Key Section ──────────────────────────────────
function srRenderApiKeySection() {
    const wrap = document.getElementById('srApiKeySection');
    if (!wrap) return;
    const hasKey = !!srGetApiKey();
    wrap.innerHTML = `
        <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:0.5rem;">
                <div style="width:8px;height:8px;border-radius:50%;background:${hasKey ? '#22c55e' : '#ef4444'};"></div>
                <span style="font-size:0.8rem;color:var(--text-muted);">
                    Anthropic API Key: ${hasKey ? '<span style="color:#22c55e;font-weight:600;">Configured</span>' : '<span style="color:#ef4444;font-weight:600;">Not set</span>'}
                </span>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="srShowApiKeyModal()" style="font-size:0.75rem;">
                ${hasKey ? '🔑 Update Key' : '🔑 Set API Key'}
            </button>
        </div>
    `;
}

function srCheckApiKey() {
    const btn = document.getElementById('srRunBtn');
    if (!btn) return;
    btn.disabled = !srGetApiKey();
    btn.title = srGetApiKey() ? '' : 'Set your Anthropic API key first';
}

function srShowApiKeyModal() {
    const current = srGetApiKey();
    document.getElementById('srApiKeyInput').value = current ? '••••••••••••••••' + current.slice(-4) : '';
    document.getElementById('srApiKeyInput').dataset.loaded = current ? '1' : '0';
    showModal('srApiKeyModal');
}

function srSaveApiKey() {
    const inp = document.getElementById('srApiKeyInput');
    const val = inp.value.trim();
    if (!val || val.startsWith('••')) {
        hideModal('srApiKeyModal');
        return;
    }
    if (!val.startsWith('sk-ant-')) {
        alert('That does not look like a valid Anthropic API key (should start with sk-ant-)');
        return;
    }
    srSetApiKey(val);
    hideModal('srApiKeyModal');
    srRenderApiKeySection();
    srCheckApiKey();
    srLog('✅ API key saved for this session', 'success');
}

// ── Run Research ────────────────────────────────────
function srRenderRunTab() {
    srUpdateRunSummary();
    srCheckApiKey();
}

async function srStartResearch() {
    if (srRunning) return;
    if (!srGetApiKey()) { alert('Please set your Anthropic API key first.'); return; }

    const roles = srGetActiveRoles();
    if (!roles.length) { alert('No roles selected.'); return; }

    const market = srSelectedMarket;
    const marketInfo = SR_MARKETS.find(m => m.code === market);
    const batches = srGetActiveBatches();
    const runId = `${new Date().toISOString().slice(0,10)}-${market}`;

    srRunning = true;
    srAbortFlag = false;
    srCurrentRunId = runId;

    // UI state
    document.getElementById('srRunBtn').disabled = true;
    document.getElementById('srAbortBtn').style.display = '';
    document.getElementById('srProgressWrap').style.display = '';
    document.getElementById('srLogWrap').style.display = '';
    document.getElementById('srLogLines').innerHTML = '';
    srSetProgress(0, batches.length);

    srLog(`🚀 Starting ${marketInfo.label} research — ${roles.length} roles in ${batches.length} batches`, 'info');
    srLog(`Run ID: ${runId}`, 'muted');

    let completed = 0;
    let totalSaved = 0;
    let errors = 0;

    for (let i = 0; i < batches.length; i++) {
        if (srAbortFlag) {
            srLog('⛔ Run aborted by user.', 'warn');
            break;
        }

        const batch = batches[i];
        const batchRoles = roles.filter(r => r.batch === batch);
        if (!batchRoles.length) { completed++; srSetProgress(completed, batches.length); continue; }

        srLog(`📦 ${batch} — ${batchRoles.length} roles…`, 'info');

        try {
            const results = await srResearchBatch(batchRoles, market);
            if (!results) throw new Error('No results returned');

            // Save to Supabase
            const saved = await srSaveResults(results, batchRoles, market, batch, runId);
            totalSaved += saved;
            srLog(`  ✅ Saved ${saved} results`, 'success');
        } catch(e) {
            errors++;
            srLog(`  ❌ ${batch} failed: ${e.message}`, 'error');
        }

        completed++;
        srSetProgress(completed, batches.length);

        // Polite delay between calls
        if (i < batches.length - 1 && !srAbortFlag) {
            await srDelay(1500);
        }
    }

    srRunning = false;
    document.getElementById('srRunBtn').disabled = false;
    document.getElementById('srAbortBtn').style.display = 'none';

    const status = srAbortFlag ? 'aborted' : 'complete';
    srLog(`\n🏁 Run ${status}. ${totalSaved} results saved. ${errors} batch errors.`, errors > 0 ? 'warn' : 'success');

    if (totalSaved > 0) {
        srLog(`💾 Data written to salary_research table under run_id: ${runId}`, 'muted');
    }
}

function srAbortResearch() {
    srAbortFlag = true;
    srLog('⛔ Abort requested — will stop after current batch…', 'warn');
    document.getElementById('srAbortBtn').disabled = true;
}

// ── API Call ────────────────────────────────────────
async function srResearchBatch(roles, market) {
    const apiKey = srGetApiKey();
    const systemPrompt = SR_PROMPTS[market];
    const roleList = roles.map((r, i) => `${i+1}. ${r.job_title}`).join('\n');
    const userMessage = `Research salary benchmarks for the following ${roles.length} job roles:\n\n${roleList}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'interleaved-thinking-2025-05-14'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 16000,
            thinking: { type: 'enabled', budget_tokens: 10000 },
            tools: [{
                type: 'web_search_20250305',
                name: 'web_search'
            }],
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }]
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`API ${response.status}: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();

    // Extract the final text response (skip thinking blocks and tool_use/tool_result blocks)
    const textBlocks = (data.content || []).filter(b => b.type === 'text');
    if (!textBlocks.length) throw new Error('No text in API response');

    const raw = textBlocks.map(b => b.text).join('');
    return srParseJsonResponse(raw, roles);
}

function srParseJsonResponse(raw, roles) {
    // Strip any accidental markdown fences
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    } catch(e) {
        // Try to find JSON array within the text
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (match) {
            try { parsed = JSON.parse(match[0]); }
            catch(e2) { throw new Error('Could not parse JSON from response'); }
        } else {
            throw new Error('No JSON array found in response');
        }
    }

    if (!Array.isArray(parsed)) throw new Error('Response is not a JSON array');

    // Validate and normalise each result
    return parsed.map((item, idx) => {
        const role = roles[idx];
        return {
            job_title:       item.job_title       || (role ? role.job_title : ''),
            years_experience: item.years_experience || null,
            low_salary:      srParseNum(item.low_salary),
            median_salary:   srParseNum(item.median_salary),
            high_salary:     srParseNum(item.high_salary),
            conf_experience: srParseConf(item.conf_experience),
            conf_low:        srParseConf(item.conf_low),
            conf_median:     srParseConf(item.conf_median),
            conf_high:       srParseConf(item.conf_high),
        };
    });
}

function srParseNum(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
    return isNaN(n) ? null : n;
}

function srParseConf(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (/^high$/i.test(s)) return 'High';
    if (/^medium$/i.test(s)) return 'Medium';
    if (/^low$/i.test(s)) return 'Low';
    return null;
}

// ── Save Results to Supabase ────────────────────────
async function srSaveResults(results, roles, market, batch, runId) {
    // 1. Archive existing current records for this market + these JPIDs
    const jpids = roles.map(r => r.jpid_level).filter(Boolean);
    if (jpids.length) {
        await supabaseClient
            .from('salary_research')
            .update({ is_current: false })
            .eq('market', market)
            .in('jpid_level', jpids)
            .eq('is_current', true);
    }

    // 2. Build insert rows
    const rows = results.map((res, idx) => {
        const role = roles[idx];
        return {
            jpid_level:      role ? role.jpid_level : null,
            job_title:       res.job_title || (role ? role.job_title : ''),
            category:        role ? role.category : null,
            batch:           batch,
            market:          market,
            years_experience: res.years_experience,
            low_salary:      res.low_salary,
            median_salary:   res.median_salary,
            high_salary:     res.high_salary,
            conf_experience: res.conf_experience,
            conf_low:        res.conf_low,
            conf_median:     res.conf_median,
            conf_high:       res.conf_high,
            researched_at:   new Date().toISOString(),
            run_id:          runId,
            is_current:      true,
        };
    });

    const { error } = await supabaseClient.from('salary_research').insert(rows);
    if (error) throw new Error(error.message);
    return rows.length;
}

// ── Results Browser Tab ─────────────────────────────
async function srLoadResultsBrowser() {
    const marketFilter = document.getElementById('srBrowserMarket')?.value || 'PH';
    const catFilter    = document.getElementById('srBrowserCategory')?.value || '';
    const confFilter   = document.getElementById('srBrowserConf')?.value || '';
    const staleFilter  = document.getElementById('srBrowserStale')?.checked || false;

    const tbody = document.getElementById('srBrowserBody');
    const status = document.getElementById('srBrowserStatus');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:1.5rem;color:var(--text-muted);">Loading…</td></tr>';

    try {
        let query = supabaseClient
            .from('salary_research')
            .select('*')
            .eq('market', marketFilter)
            .eq('is_current', true)
            .order('jpid_level', { ascending: true })
            .limit(2000);

        if (catFilter) query = query.eq('category', catFilter);
        if (confFilter) query = query.eq('conf_median', confFilter);

        const { data, error } = await query;
        if (error) throw error;

        let rows = data || [];
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

        if (staleFilter) {
            rows = rows.filter(r => !r.researched_at || new Date(r.researched_at).getTime() < sevenDaysAgo);
        }

        srResultsCache = rows;
        if (status) status.textContent = `${rows.length} results`;

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--text-muted);">No results found. Run a research batch first.</td></tr>';
            return;
        }

        const mktInfo = SR_MARKETS.find(m => m.code === marketFilter);
        const curr = mktInfo ? mktInfo.currency : '';

        tbody.innerHTML = rows.map(r => {
            const age = r.researched_at ? Math.floor((Date.now() - new Date(r.researched_at).getTime()) / 86400000) : null;
            const isStale = age !== null && age >= 7;
            const ageLabel = age === null ? '—' : age === 0 ? 'Today' : `${age}d ago`;
            const confDot = c => {
                if (!c) return '<span style="color:var(--text-muted);">—</span>';
                const col = c==='High'?'#22c55e':c==='Medium'?'#f59e0b':'#ef4444';
                return `<span style="color:${col};font-weight:600;font-size:0.72rem;">${c[0]}</span>`;
            };
            const fmtNum = n => n != null ? Number(n).toLocaleString() : '—';
            return `<tr style="font-size:0.73rem;${isStale?'opacity:0.6;':''}">
                <td style="font-family:'Space Mono',monospace;font-size:0.68rem;color:var(--text-muted);">${r.jpid_level||'—'}</td>
                <td style="max-width:200px;">${r.job_title||'—'}</td>
                <td style="font-size:0.68rem;color:var(--text-muted);">${r.category||'—'}</td>
                <td style="font-size:0.7rem;">${r.years_experience||'—'}</td>
                <td style="font-family:'Space Mono',monospace;font-size:0.7rem;">${fmtNum(r.low_salary)}</td>
                <td style="font-family:'Space Mono',monospace;font-size:0.7rem;font-weight:600;">${fmtNum(r.median_salary)}</td>
                <td style="font-family:'Space Mono',monospace;font-size:0.7rem;">${fmtNum(r.high_salary)}</td>
                <td style="text-align:center;">${confDot(r.conf_median)}</td>
                <td style="font-size:0.68rem;color:${isStale?'#ef4444':'var(--text-muted)'};">${ageLabel}</td>
                <td style="font-size:0.68rem;color:var(--text-muted);">${r.run_id||'—'}</td>
            </tr>`;
        }).join('');

        // Populate category dropdown if empty
        srPopulateBrowserCategories(data || []);

    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#ef4444;">Error: ${e.message}</td></tr>`;
    }
}

function srPopulateBrowserCategories(rows) {
    const sel = document.getElementById('srBrowserCategory');
    if (!sel || sel.dataset.populated) return;
    const cats = [...new Set(rows.map(r => r.category).filter(Boolean))].sort();
    cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        sel.appendChild(opt);
    });
    sel.dataset.populated = '1';
}

// ── Export Tab ──────────────────────────────────────
async function srExportXLSX() {
    const btn = document.getElementById('srExportBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }

    try {
        // Load current results for all markets
        const allResults = {};
        for (const mkt of SR_MARKETS) {
            let rows = [], offset = 0;
            while (true) {
                const { data, error } = await supabaseClient
                    .from('salary_research')
                    .select('jpid_level, job_title, category, batch, years_experience, low_salary, median_salary, high_salary, conf_experience, conf_low, conf_median, conf_high, researched_at')
                    .eq('market', mkt.code)
                    .eq('is_current', true)
                    .order('jpid_level')
                    .range(offset, offset + 999);
                if (error) throw error;
                rows = rows.concat(data || []);
                if (!data || data.length < 1000) break;
                offset += 1000;
            }
            allResults[mkt.code] = rows;
        }

        // Build master role list from salary_ranges
        let masterRoles = [], offset = 0;
        while (true) {
            const { data, error } = await supabaseClient
                .from('salary_ranges')
                .select('id, jpid_level, job_title, category, batch, years_experience')
                .order('jpid_level')
                .range(offset, offset + 999);
            if (error) throw error;
            masterRoles = masterRoles.concat(data || []);
            if (!data || data.length < 1000) break;
            offset += 1000;
        }

        // Build CSV content (matches master sheet layout)
        const headers = [
            'AI Batch', 'CATEGORY', 'JPID LEVEL', 'JOB TITLE',
            // PH
            'PH Years Exp', 'PH Low (PHP)', 'PH Median (PHP)', 'PH High (PHP)',
            'PH Conf Exp', 'PH Conf Low', 'PH Conf Median', 'PH Conf High',
            // CO
            'CO Years Exp', 'CO Low (COP)', 'CO Median (COP)', 'CO High (COP)',
            'CO Conf Exp', 'CO Conf Low', 'CO Conf Median', 'CO Conf High',
            // IN
            'IN Years Exp', 'IN Low (INR)', 'IN Median (INR)', 'IN High (INR)',
            'IN Conf Exp', 'IN Conf Low', 'IN Conf Median', 'IN Conf High',
            // KE
            'KE Years Exp', 'KE Low (KES)', 'KE Median (KES)', 'KE High (KES)',
            'KE Conf Exp', 'KE Conf Low', 'KE Conf Median', 'KE Conf High',
            // AU
            'AU Years Exp', 'AU Low (AUD)', 'AU Median (AUD)', 'AU High (AUD)',
            'AU Conf Exp', 'AU Conf Low', 'AU Conf Median', 'AU Conf High',
            // USA
            'USA Years Exp', 'USA Low (USD)', 'USA Median (USD)', 'USA High (USD)',
            'USA Conf Exp', 'USA Conf Low', 'USA Conf Median', 'USA Conf High',
        ];

        // Index results by jpid for fast lookup
        const idx = {};
        SR_MARKETS.forEach(mkt => {
            idx[mkt.code] = {};
            (allResults[mkt.code] || []).forEach(r => { idx[mkt.code][r.jpid_level] = r; });
        });

        const csvRows = [headers.join(',')];
        masterRoles.forEach(role => {
            const jpid = role.jpid_level;
            const fields = [
                srCsvEsc(role.batch || ''),
                srCsvEsc(role.category || ''),
                srCsvEsc(jpid || ''),
                srCsvEsc(role.job_title || ''),
            ];
            SR_MARKETS.forEach(mkt => {
                const r = idx[mkt.code][jpid] || {};
                fields.push(
                    srCsvEsc(r.years_experience || ''),
                    r.low_salary != null ? r.low_salary : '',
                    r.median_salary != null ? r.median_salary : '',
                    r.high_salary != null ? r.high_salary : '',
                    srCsvEsc(r.conf_experience || ''),
                    srCsvEsc(r.conf_low || ''),
                    srCsvEsc(r.conf_median || ''),
                    srCsvEsc(r.conf_high || ''),
                );
            });
            csvRows.push(fields.join(','));
        });

        const csv = csvRows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `Salary_Research_Export_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);

    } catch(e) {
        alert('Export error: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '⬇ Download CSV Export'; }
    }
}

function srCsvEsc(v) {
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g,'""')}"`;
    return s;
}

// ── Run History Tab ─────────────────────────────────
async function srLoadRunHistory() {
    const tbody = document.getElementById('srHistoryBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1rem;color:var(--text-muted);">Loading…</td></tr>';

    try {
        // Get distinct run_ids with counts
        const { data, error } = await supabaseClient
            .from('salary_research')
            .select('run_id, market, researched_at, is_current')
            .order('researched_at', { ascending: false })
            .limit(500);
        if (error) throw error;

        // Group by run_id
        const runs = {};
        (data || []).forEach(r => {
            if (!r.run_id) return;
            if (!runs[r.run_id]) runs[r.run_id] = { run_id: r.run_id, market: r.market, date: r.researched_at, current: 0, archived: 0 };
            if (r.is_current) runs[r.run_id].current++;
            else runs[r.run_id].archived++;
        });

        const sorted = Object.values(runs).sort((a,b) => new Date(b.date) - new Date(a.date));
        if (!sorted.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1rem;color:var(--text-muted);">No run history yet.</td></tr>';
            return;
        }

        tbody.innerHTML = sorted.map(r => {
            const mktInfo = SR_MARKETS.find(m => m.code === r.market);
            const dt = new Date(r.date);
            const flag = mktInfo ? `<img src="https://flagcdn.com/16x12/${mktInfo.flag}.png" width="16" height="12" style="vertical-align:middle;margin-right:4px;">` : '';
            return `<tr style="font-size:0.73rem;">
                <td style="font-family:'Space Mono',monospace;font-size:0.68rem;">${r.run_id}</td>
                <td>${flag}${mktInfo ? mktInfo.label : r.market}</td>
                <td>${dt.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}</td>
                <td><span style="color:#22c55e;font-weight:600;">${r.current}</span> current</td>
                <td><span style="color:var(--text-muted);">${r.archived}</span> archived</td>
            </tr>`;
        }).join('');

    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:#ef4444;">Error: ${e.message}</td></tr>`;
    }
}

// ── Tab Switching ────────────────────────────────────
function srSwitchTab(tab) {
    document.querySelectorAll('.sr-tab-panel').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.sr-tab-btn').forEach(el => {
        el.classList.remove('btn-primary');
        el.classList.add('btn-secondary');
    });
    const panel = document.getElementById(`srTab-${tab}`);
    const btn   = document.getElementById(`srTabBtn-${tab}`);
    if (panel) panel.style.display = '';
    if (btn)   { btn.classList.add('btn-primary'); btn.classList.remove('btn-secondary'); }

    if (tab === 'browser') srLoadResultsBrowser();
    if (tab === 'history') srLoadRunHistory();
}

// ── Helpers ──────────────────────────────────────────
function srSetProgress(done, total) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const bar  = document.getElementById('srProgressBar');
    const lbl  = document.getElementById('srProgressLabel');
    if (bar) bar.style.width = pct + '%';
    if (lbl) lbl.textContent = `${done} / ${total} batches (${pct}%)`;
}

function srLog(msg, type='info') {
    const wrap = document.getElementById('srLogLines');
    if (!wrap) return;
    const colors = { info:'var(--text)', success:'#22c55e', error:'#ef4444', warn:'#f59e0b', muted:'var(--text-muted)' };
    const line = document.createElement('div');
    line.style.color = colors[type] || colors.info;
    line.style.fontSize = '0.75rem';
    line.style.lineHeight = '1.6';
    line.style.fontFamily = "'Space Mono', monospace";
    line.textContent = `[${new Date().toLocaleTimeString('en-AU',{hour12:false})}] ${msg}`;
    wrap.appendChild(line);
    wrap.scrollTop = wrap.scrollHeight;
}

function srDelay(ms) { return new Promise(r => setTimeout(r, ms)); }
