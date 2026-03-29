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
let srSelectedBatches = null;       // null = all, [] = none, [...] = explicit
let srRunning        = false;
let srAbortFlag      = false;
let srCurrentRunId   = null;
let srResultsCache   = [];          // last loaded results for browser tab
let srWakeLock       = null;        // Screen Wake Lock sentinel (prevents browser sleep during runs)

const SR_MARKETS = [
    { code: 'PH',  label: 'Philippines', flag: 'ph', currency: 'PHP' },
    { code: 'CO',  label: 'Colombia',    flag: 'co', currency: 'COP' },
    { code: 'IN',  label: 'India',       flag: 'in', currency: 'INR' },
    { code: 'KE',  label: 'Kenya',       flag: 'ke', currency: 'KES' },
    { code: 'AU',  label: 'Australia',   flag: 'au', currency: 'AUD' },
    { code: 'USA', label: 'USA',         flag: 'us', currency: 'USD' },
];

// Max roles per Edge Function call — keeps each call well under the 150s timeout.
// Large IT batches (90+ roles) will be split into multiple chunks automatically.
const SR_CHUNK_SIZE = 35;

// ── System Prompts (one per market) ────────────────
// These are the DEFAULT prompts. At runtime, srGetPrompt(market) checks
// app_settings for a saved override before falling back to these defaults.
const SR_PROMPTS = {
PH: `You are an expert Philippines Salary Research Assistant.
Your job is to take a list of job titles and produce accurate, current salary benchmarks in the Philippines using high-quality, multi-source research.

OBJECTIVE:
Determine monthly salary ranges (PHP) for each job role in the Philippines, covering Low / Median / High salary levels and the recommended years of experience for the typical hire at each level.

SALARY DEFINITIONS:
Low    = 25th percentile — the entry point for a qualified hire at the stated experience level
Median = 50th percentile — the typical market rate for this role and level
High   = 75th percentile — an experienced, specialist, or premium-candidate hire
Do NOT use absolute minimums or maximums. Do NOT average all levels together.

EXPERIENCE LEVELS:
Each role in the input is already at a specific level (1, 2, or 3).
Level 1 = junior/entry — typically 1–3 years experience in this market
Level 2 = mid-level — typically 3–6 years experience
Level 3 = senior/specialist — typically 6+ years experience
Report the years_experience range typical for that level in the Philippines. Adjust if local market norms differ significantly from these defaults.

CITY PRIORITY:
Priority 1: Manila, Pampanga, and Cebu (use an average across these regions)
Priority 2: Davao and Mindanao

JOB TYPE PRIORITY:
In-office roles in Manila and Pampanga first. If insufficient data: expand to WFH/remote roles. If still insufficient: add Priority 2 cities. If still insufficient or accuracy is very low: use "Role N/A".

TIMEFRAME: Prioritise 2026 postings first. Then Sep–Dec 2025. Then Jan–Aug 2025. Then 2024. Use 2023 as supplementary data only.

SOURCES: Search actively across LinkedIn, Glassdoor, monster.com.ph, ph.indeed.com, onlinejobs.ph, ph.jobstreet.com, job.ph, jobly.ph, pinoyjobstreet.com, jobyoda.com, bossjob.ph, jobs180.com, careerjet.ph, Payscale, salaryexplorer.com, paylab.com, and other credible Philippine HR or salary benchmark sources.

CONFIDENCE SCORING — apply rigorously:
High   = 3 or more independent sources with salary figures within 20% of each other, from 2026 or late 2025 data
Medium = 2 sources only, OR sources older than mid-2025, OR figures vary by more than 20% across sources
Low    = 1 source only, OR salary inferred from similar roles, OR data older than 2024
Role N/A = role does not meaningfully exist in the Philippine market

ACCURACY CHECK: If any salary figure seems unusually high or low compared to similar roles in this batch, search again to verify before including it. If you cannot verify, downgrade to Low confidence.

OUTPUT FORMAT — CRITICAL:
Return ONLY a valid JSON array. No markdown, no backticks, no explanation, no preamble.
Each element must be an object with exactly these keys:
"job_title", "years_experience", "low_salary", "median_salary", "high_salary", "conf_experience", "conf_low", "conf_median", "conf_high"

Salary values: monthly PHP as plain numbers (no currency symbols, no commas, no decimals).
years_experience: a string such as "1-3 years" or "6 years plus".
Confidence values: exactly "High", "Medium", or "Low" — no other values.
If a role cannot be found: use null for all salary and confidence fields, and "Role N/A" for years_experience.
Output order must match input order exactly. Do not skip or reorder any roles.`,

CO: `You are an expert Colombian Salary Research Assistant.
Your job is to take a list of job titles and produce accurate, current salary benchmarks in Colombia using high-quality, multi-source research.

OBJECTIVE:
Determine monthly salary ranges (COP) for each job role in Colombia, covering Low / Median / High salary levels and the recommended years of experience for the typical hire at each level.

SALARY DEFINITIONS:
Low    = 25th percentile — the entry point for a qualified hire at the stated experience level
Median = 50th percentile — the typical market rate for this role and level
High   = 75th percentile — an experienced, specialist, or premium-candidate hire
Do NOT use absolute minimums or maximums. Do NOT average all levels together.

EXPERIENCE LEVELS:
Each role in the input is already at a specific level (1, 2, or 3).
Level 1 = junior/entry — typically 1–3 years experience in this market
Level 2 = mid-level — typically 3–6 years experience
Level 3 = senior/specialist — typically 6+ years experience
Report the years_experience range typical for that level in Colombia. Adjust if local market norms differ significantly from these defaults.

CITY PRIORITY:
Priority 1: Bogotá, Medellín, Cali, Barranquilla (use an average across these cities)
Priority 2: Ibagué, Cartagena, Cúcuta, Soacha, Soledad

JOB TYPE PRIORITY:
In-office roles in Bogotá, Medellín, and Cali first. If insufficient data: expand to WFH/remote roles. If still insufficient: add Priority 2 cities. If still insufficient or accuracy is very low: use "Role N/A".

TIMEFRAME: Prioritise 2026 postings first. Then Sep–Dec 2025. Then Jan–Aug 2025. Then 2024. Use 2023 as supplementary data only.

SOURCES: Search actively across LinkedIn, Glassdoor, indeed.com.co, computrabajo.com, magneto365.com, elempleo.com, Payscale, salaryexplorer.com, paylab.com, and other credible Colombian HR or salary benchmark sources.

CONFIDENCE SCORING — apply rigorously:
High   = 3 or more independent sources with salary figures within 20% of each other, from 2026 or late 2025 data
Medium = 2 sources only, OR sources older than mid-2025, OR figures vary by more than 20% across sources
Low    = 1 source only, OR salary inferred from similar roles, OR data older than 2024
Role N/A = role does not meaningfully exist in the Colombian market

ACCURACY CHECK: If any salary figure seems unusually high or low compared to similar roles in this batch, search again to verify before including it. If you cannot verify, downgrade to Low confidence.

OUTPUT FORMAT — CRITICAL:
Return ONLY a valid JSON array. No markdown, no backticks, no explanation, no preamble.
Each element must be an object with exactly these keys:
"job_title", "years_experience", "low_salary", "median_salary", "high_salary", "conf_experience", "conf_low", "conf_median", "conf_high"

Salary values: monthly COP as plain numbers (no currency symbols, no commas, no decimals).
years_experience: a string such as "1-3 years" or "6 years plus".
Confidence values: exactly "High", "Medium", or "Low" — no other values.
If a role cannot be found: use null for all salary and confidence fields, and "Role N/A" for years_experience.
Output order must match input order exactly. Do not skip or reorder any roles.`,

IN: `You are an expert Indian Salary Research Assistant.
Your job is to take a list of job titles and produce accurate, current salary benchmarks in India using high-quality, multi-source research.

OBJECTIVE:
Determine monthly salary ranges (INR) for each job role in India, covering Low / Median / High salary levels and the recommended years of experience for the typical hire at each level.

SALARY DEFINITIONS:
Low    = 25th percentile — the entry point for a qualified hire at the stated experience level
Median = 50th percentile — the typical market rate for this role and level
High   = 75th percentile — an experienced, specialist, or premium-candidate hire
Do NOT use absolute minimums or maximums. Do NOT average all levels together.
NOTE: Indian salaries are typically quoted as annual CTC (Cost to Company). Divide annual CTC by 12 to get the monthly figure. Do not include variable pay or bonuses in the base figures unless they are guaranteed components.

EXPERIENCE LEVELS:
Each role in the input is already at a specific level (1, 2, or 3).
Level 1 = junior/entry — typically 1–3 years experience in this market
Level 2 = mid-level — typically 3–6 years experience
Level 3 = senior/specialist — typically 6+ years experience
Report the years_experience range typical for that level in India. Adjust if local market norms differ significantly from these defaults.

CITY PRIORITY:
Priority 1: Bangalore (Bengaluru)
Priority 2: Hyderabad
Priority 3: Mumbai
Priority 4: Delhi NCR, Pune, Chennai, Ahmedabad, Kolkata

JOB TYPE PRIORITY:
In-office roles in Bangalore first. If insufficient data: expand to WFH/remote roles. If still insufficient: expand to Hyderabad, then Mumbai, then other Priority 4 cities. If still insufficient or accuracy is very low: use "Role N/A".

TIMEFRAME: Prioritise 2026 postings first. Then Sep–Dec 2025. Then Jan–Aug 2025. Then 2024. Use 2023 as supplementary data only.

SOURCES: Search actively across LinkedIn, Glassdoor, AmbitionBox, Naukri, Foundit, Payscale, salaryexplorer.com, and other credible Indian HR or salary benchmark sources.

CONFIDENCE SCORING — apply rigorously:
High   = 3 or more independent sources with salary figures within 20% of each other, from 2026 or late 2025 data
Medium = 2 sources only, OR sources older than mid-2025, OR figures vary by more than 20% across sources
Low    = 1 source only, OR salary inferred from similar roles, OR data older than 2024
Role N/A = role does not meaningfully exist in the Indian market

ACCURACY CHECK: If any salary figure seems unusually high or low compared to similar roles in this batch, search again to verify before including it. If you cannot verify, downgrade to Low confidence.

OUTPUT FORMAT — CRITICAL:
Return ONLY a valid JSON array. No markdown, no backticks, no explanation, no preamble.
Each element must be an object with exactly these keys:
"job_title", "years_experience", "low_salary", "median_salary", "high_salary", "conf_experience", "conf_low", "conf_median", "conf_high"

Salary values: monthly INR as plain numbers (no currency symbols, no commas, no decimals).
years_experience: a string such as "1-3 years" or "6 years plus".
Confidence values: exactly "High", "Medium", or "Low" — no other values.
If a role cannot be found: use null for all salary and confidence fields, and "Role N/A" for years_experience.
Output order must match input order exactly. Do not skip or reorder any roles.`,

KE: `You are an expert Kenyan Salary Research Assistant.
Your job is to take a list of job titles and produce accurate, current salary benchmarks in Kenya using high-quality, multi-source research.

OBJECTIVE:
Determine monthly salary ranges (KES) for each job role in Kenya, covering Low / Median / High salary levels and the recommended years of experience for the typical hire at each level.

SALARY DEFINITIONS:
Low    = 25th percentile — the entry point for a qualified hire at the stated experience level
Median = 50th percentile — the typical market rate for this role and level
High   = 75th percentile — an experienced, specialist, or premium-candidate hire
Do NOT use absolute minimums or maximums. Do NOT average all levels together.

EXPERIENCE LEVELS:
Each role in the input is already at a specific level (1, 2, or 3).
Level 1 = junior/entry — typically 1–3 years experience in this market
Level 2 = mid-level — typically 3–6 years experience
Level 3 = senior/specialist — typically 6+ years experience
Report the years_experience range typical for that level in Kenya. Adjust if local market norms differ significantly from these defaults.

IMPORTANT MARKET CONTEXT: Kenya is an emerging white-collar jobs market. Many specialist or senior roles from other markets may not have a meaningful equivalent in Kenya. Apply "Role N/A" more readily than you would for more mature markets — do not force a salary estimate where genuine data does not exist.

CITY PRIORITY:
Priority 1: Nairobi, Mombasa
Priority 2: Other Kenyan cities

JOB TYPE PRIORITY:
In-office roles in Nairobi first. If insufficient data: expand to WFH/remote roles. If still insufficient or accuracy is very low: use "Role N/A".

TIMEFRAME: Prioritise 2026 postings first. Then Sep–Dec 2025. Then Jan–Aug 2025. Then 2024. Use 2023 as supplementary data only.

SOURCES: Search actively across LinkedIn, Glassdoor, Payscale, salaryexplorer.com, jobwebkenya.com, brightermonday.co.ke, kenyajob.com, myjobinkenya.com, careerjet.co.ke, and other credible Kenyan HR or salary benchmark sources.

CONFIDENCE SCORING — apply rigorously:
High   = 3 or more independent sources with salary figures within 20% of each other, from 2026 or late 2025 data
Medium = 2 sources only, OR sources older than mid-2025, OR figures vary by more than 20% across sources
Low    = 1 source only, OR salary inferred from similar roles, OR data older than 2024
Role N/A = role does not meaningfully exist in the Kenyan market

ACCURACY CHECK: If any salary figure seems unusually high or low compared to similar roles in this batch, search again to verify before including it. If you cannot verify, downgrade to Low confidence.

OUTPUT FORMAT — CRITICAL:
Return ONLY a valid JSON array. No markdown, no backticks, no explanation, no preamble.
Each element must be an object with exactly these keys:
"job_title", "years_experience", "low_salary", "median_salary", "high_salary", "conf_experience", "conf_low", "conf_median", "conf_high"

Salary values: monthly KES as plain numbers (no currency symbols, no commas, no decimals).
years_experience: a string such as "1-3 years" or "6 years plus".
Confidence values: exactly "High", "Medium", or "Low" — no other values.
If a role cannot be found: use null for all salary and confidence fields, and "Role N/A" for years_experience.
Output order must match input order exactly. Do not skip or reorder any roles.`,

AU: `You are an expert Australian Salary Research Assistant.
Your job is to take a list of job titles and produce accurate, current salary benchmarks in Australia using high-quality, multi-source research.

OBJECTIVE:
Determine monthly salary ranges (AUD) for each job role in Australia, covering Low / Median / High salary levels and the recommended years of experience for the typical hire at each level.

SALARY DEFINITIONS:
Low    = 25th percentile — the entry point for a qualified hire at the stated experience level
Median = 50th percentile — the typical market rate for this role and level
High   = 75th percentile — an experienced, specialist, or premium-candidate hire
Do NOT use absolute minimums or maximums. Do NOT average all levels together.
IMPORTANT: Australian salaries are almost always quoted as annual figures. Divide all annual figures by 12 to produce the monthly salary. All figures must EXCLUDE superannuation (currently 11.5%) — report base salary only.

EXPERIENCE LEVELS:
Each role in the input is already at a specific level (1, 2, or 3).
Level 1 = junior/entry — typically 1–3 years experience in this market
Level 2 = mid-level — typically 3–6 years experience
Level 3 = senior/specialist — typically 6+ years experience
Report the years_experience range typical for that level in Australia. Adjust if local market norms differ significantly from these defaults.

CITY PRIORITY:
Priority 1: Sydney
Priority 2: Melbourne
Priority 3: Brisbane

JOB TYPE PRIORITY:
In-office roles in Sydney first. If insufficient data: expand to WFH/remote roles. If still insufficient: add Melbourne, then Brisbane. If still insufficient or accuracy is very low: use "Role N/A".

TIMEFRAME: Prioritise 2026 postings first. Then Sep–Dec 2025. Then Jan–Aug 2025. Then 2024. Use 2023 as supplementary data only.

SOURCES: Search actively across LinkedIn, Glassdoor, seek.com.au, au.indeed.com, au.jora.com, adzuna.com.au, careerone.com.au, Payscale, salaryexplorer.com, workforceaustralia.gov.au, and other credible Australian HR or salary benchmark sources.

CONFIDENCE SCORING — apply rigorously:
High   = 3 or more independent sources with salary figures within 20% of each other, from 2026 or late 2025 data
Medium = 2 sources only, OR sources older than mid-2025, OR figures vary by more than 20% across sources
Low    = 1 source only, OR salary inferred from similar roles, OR data older than 2024
Role N/A = role does not meaningfully exist in the Australian market

ACCURACY CHECK: If any salary figure seems unusually high or low compared to similar roles in this batch, search again to verify before including it. If you cannot verify, downgrade to Low confidence.

OUTPUT FORMAT — CRITICAL:
Return ONLY a valid JSON array. No markdown, no backticks, no explanation, no preamble.
Each element must be an object with exactly these keys:
"job_title", "years_experience", "low_salary", "median_salary", "high_salary", "conf_experience", "conf_low", "conf_median", "conf_high"

Salary values: monthly AUD as plain numbers (no currency symbols, no commas, no decimals). Remember to divide annual figures by 12.
years_experience: a string such as "1-3 years" or "6 years plus".
Confidence values: exactly "High", "Medium", or "Low" — no other values.
If a role cannot be found: use null for all salary and confidence fields, and "Role N/A" for years_experience.
Output order must match input order exactly. Do not skip or reorder any roles.`,

USA: `You are an expert USA Salary Research Assistant.
Your job is to take a list of job titles and produce accurate, current salary benchmarks in the USA using high-quality, multi-source research.

OBJECTIVE:
Determine monthly salary ranges (USD) for each job role in the USA, covering Low / Median / High salary levels and the recommended years of experience for the typical hire at each level.

SALARY DEFINITIONS:
Low    = 25th percentile — the entry point for a qualified hire at the stated experience level
Median = 50th percentile — the typical market rate for this role and level
High   = 75th percentile — an experienced, specialist, or premium-candidate hire
Do NOT use absolute minimums or maximums. Do NOT average all levels together.
IMPORTANT: US salaries are often quoted annually. Divide all annual figures by 12 to produce the monthly salary.

EXPERIENCE LEVELS:
Each role in the input is already at a specific level (1, 2, or 3).
Level 1 = junior/entry — typically 1–3 years experience in this market
Level 2 = mid-level — typically 3–6 years experience
Level 3 = senior/specialist — typically 6+ years experience
Report the years_experience range typical for that level in the USA. Adjust if local market norms differ significantly from these defaults.

CITY PRIORITY:
Priority 1: New York, NY and Los Angeles, CA (use an average across both cities)
Priority 2: Dallas, Houston, and Austin, Texas

JOB TYPE PRIORITY:
In-office roles in New York and Los Angeles first. If insufficient data: expand to WFH/remote roles. If still insufficient: add Priority 2 cities. If still insufficient or accuracy is very low: use "Role N/A".

TIMEFRAME: Prioritise 2026 postings first. Then Sep–Dec 2025. Then Jan–Aug 2025. Then 2024. Use 2023 as supplementary data only.

SOURCES: Search actively across LinkedIn, Glassdoor, indeed.com, Monster, CareerBuilder, ZipRecruiter, Payscale, salaryexplorer.com, paylab.com, levels.fyi (for tech roles), and other credible US HR or salary benchmark sources.

CONFIDENCE SCORING — apply rigorously:
High   = 3 or more independent sources with salary figures within 20% of each other, from 2026 or late 2025 data
Medium = 2 sources only, OR sources older than mid-2025, OR figures vary by more than 20% across sources
Low    = 1 source only, OR salary inferred from similar roles, OR data older than 2024
Role N/A = role does not meaningfully exist in the US market

ACCURACY CHECK: If any salary figure seems unusually high or low compared to similar roles in this batch, search again to verify before including it. If you cannot verify, downgrade to Low confidence.

OUTPUT FORMAT — CRITICAL:
Return ONLY a valid JSON array. No markdown, no backticks, no explanation, no preamble.
Each element must be an object with exactly these keys:
"job_title", "years_experience", "low_salary", "median_salary", "high_salary", "conf_experience", "conf_low", "conf_median", "conf_high"

Salary values: monthly USD as plain numbers (no currency symbols, no commas, no decimals). Remember to divide annual figures by 12.
years_experience: a string such as "1-3 years" or "6 years plus".
Confidence values: exactly "High", "Medium", or "Low" — no other values.
If a role cannot be found: use null for all salary and confidence fields, and "Role N/A" for years_experience.
Output order must match input order exactly. Do not skip or reorder any roles.`,
};

// ── Anthropic API Key — stored server-side in Supabase app_settings ───
// The key NEVER reaches the browser. The Edge Function reads it directly.
// Browser only checks that a key row EXISTS (for the status indicator).
let srApiKeyConfigured = false;

// Edge Function URL — same Supabase project
const SR_EDGE_URL = `${SUPABASE_URL}/functions/v1/salary-research`;

async function srCheckKeyConfigured() {
    try {
        const { data, error } = await supabaseClient
            .from('app_settings')
            .select('key')
            .eq('key', 'anthropic_api_key')
            .single();
        srApiKeyConfigured = !error && !!data;
    } catch(e) {
        srApiKeyConfigured = false;
    }
}

async function srSaveApiKeyToDB(key) {
    const { error } = await supabaseClient
        .from('app_settings')
        .upsert({ key: 'anthropic_api_key', value: key }, { onConflict: 'key' });
    if (error) throw new Error(error.message);
    srApiKeyConfigured = true;
}

// ── Prompt Management ────────────────────────────────
// Prompts can be overridden per-market in app_settings under key "prompt_PH", "prompt_CO" etc.
// srGetPrompt() checks for a saved override first, falls back to the hardcoded default.
let srPromptOverrides = {};  // cache of loaded overrides

async function srLoadPromptOverrides() {
    try {
        const { data, error } = await supabaseClient
            .from('app_settings')
            .select('key, value')
            .like('key', 'prompt_%');
        if (error) throw error;
        srPromptOverrides = {};
        (data || []).forEach(row => {
            const market = row.key.replace('prompt_', '');
            srPromptOverrides[market] = row.value;
        });
    } catch(e) {
        console.warn('Could not load prompt overrides:', e.message);
    }
}

function srGetPrompt(market) {
    return srPromptOverrides[market] || SR_PROMPTS[market] || '';
}

function srIsPromptCustomised(market) {
    return !!srPromptOverrides[market];
}

async function srSavePrompt(market) {
    const textarea = document.getElementById('srPromptEditor');
    const val = textarea ? textarea.value.trim() : '';
    if (!val) return;

    const saveBtn = document.getElementById('srPromptSaveBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

    try {
        const { error } = await supabaseClient
            .from('app_settings')
            .upsert({ key: `prompt_${market}`, value: val }, { onConflict: 'key' });
        if (error) throw new Error(error.message);
        srPromptOverrides[market] = val;
        srRenderPromptEditor(market);
        srLog(`✅ Prompt for ${market} saved to database`, 'success');
    } catch(e) {
        alert('Failed to save prompt: ' + e.message);
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Save Prompt'; }
    }
}

async function srResetPrompt(market) {
    if (!confirm(`Reset the ${market} prompt to the built-in default? Your saved version will be deleted.`)) return;

    try {
        const { error } = await supabaseClient
            .from('app_settings')
            .delete()
            .eq('key', `prompt_${market}`);
        if (error) throw new Error(error.message);
        delete srPromptOverrides[market];
        srRenderPromptEditor(market);
        srLog(`↩️ Prompt for ${market} reset to default`, 'info');
    } catch(e) {
        alert('Failed to reset prompt: ' + e.message);
    }
}

function srRenderPromptEditor(market) {
    const wrap = document.getElementById('srPromptEditorWrap');
    if (!wrap) return;

    const isCustom = srIsPromptCustomised(market);
    const prompt   = srGetPrompt(market);
    const mktInfo  = SR_MARKETS.find(m => m.code === market);
    const isAdmin  = currentUser && currentUser.role === 'Admin';

    wrap.innerHTML = `
        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;flex-wrap:wrap;">
            <span style="font-size:0.82rem;font-weight:600;">${mktInfo ? mktInfo.label : market} Prompt</span>
            <span style="font-size:0.72rem;padding:0.15rem 0.5rem;border-radius:12px;font-weight:600;
                background:${isCustom ? '#fef3c7' : 'var(--surface)'};
                color:${isCustom ? '#92400e' : 'var(--text-muted)'};
                border:1px solid ${isCustom ? '#fbbf24' : 'var(--border)'};">
                ${isCustom ? '✏️ Customised' : '📋 Default'}
            </span>
            <span style="font-size:0.72rem;color:var(--text-muted);margin-left:auto;">
                ${prompt.length.toLocaleString()} characters
            </span>
        </div>
        <textarea id="srPromptEditor"
            style="width:100%;height:420px;font-family:'Space Mono',monospace;font-size:0.72rem;
                   line-height:1.6;padding:0.75rem;border:1px solid var(--border);border-radius:6px;
                   background:var(--surface);color:var(--text);resize:vertical;box-sizing:border-box;"
            ${!isAdmin ? 'readonly' : ''}
            spellcheck="false">${prompt.replace(/</g,'&lt;')}</textarea>
        ${isAdmin ? `
        <div style="display:flex;gap:0.5rem;margin-top:0.75rem;flex-wrap:wrap;">
            <button id="srPromptSaveBtn" class="btn btn-primary btn-sm" onclick="srSavePrompt('${market}')" style="font-size:0.8rem;">
                💾 Save Prompt
            </button>
            ${isCustom ? `
            <button class="btn btn-secondary btn-sm" onclick="srResetPrompt('${market}')" style="font-size:0.8rem;">
                ↩️ Reset to Default
            </button>` : ''}
            <span style="font-size:0.72rem;color:var(--text-muted);align-self:center;margin-left:0.5rem;">
                Saved prompts override the built-in default for all future runs.
            </span>
        </div>` : `
        <p style="font-size:0.75rem;color:var(--text-muted);margin-top:0.5rem;">Admin access required to edit prompts.</p>`}
    `;
}

let srPromptSelectedMarket = 'PH';

function srSelectPromptMarket(market) {
    srPromptSelectedMarket = market;
    // Update tab buttons
    SR_MARKETS.forEach(m => {
        const btn = document.getElementById(`srPromptTab${m.code}`);
        if (btn) {
            btn.classList.toggle('btn-primary', m.code === market);
            btn.classList.toggle('btn-secondary', m.code !== market);
        }
    });
    srRenderPromptEditor(market);
}

async function srInitPromptTab() {
    await srLoadPromptOverrides();
    // Render market tabs
    const tabWrap = document.getElementById('srPromptMarketTabs');
    if (tabWrap) {
        tabWrap.innerHTML = SR_MARKETS.map(m => `
            <button class="btn btn-sm ${m.code === srPromptSelectedMarket ? 'btn-primary' : 'btn-secondary'}"
                id="srPromptTab${m.code}"
                onclick="srSelectPromptMarket('${m.code}')"
                style="font-size:0.8rem;">
                <img src="https://flagcdn.com/16x12/${m.flag}.png" width="16" height="12"
                    style="vertical-align:middle;margin-right:5px;">
                ${m.label}
            </button>
        `).join('');
    }
    srRenderPromptEditor(srPromptSelectedMarket);
}

// ── Init ────────────────────────────────────────────
async function initSalaryResearch() {
    await srCheckKeyConfigured();  // checks existence only — key stays server-side
    await srLoadPromptOverrides(); // load any saved prompt overrides from app_settings
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
                .select('id, jpid_level, job_title, category, batch, years_experience')
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

    // Count roles per batch
    const batchCounts = {};
    srAllRoles.forEach(r => {
        if (r.batch) batchCounts[r.batch] = (batchCounts[r.batch] || 0) + 1;
    });

    // Build category label per batch (unique categories, joined if multiple)
    const batchCats = {};
    srAllRoles.forEach(r => {
        if (!r.batch || !r.category) return;
        if (!batchCats[r.batch]) batchCats[r.batch] = new Set();
        batchCats[r.batch].add(r.category);
    });

    // Shorten long category names for chip display
    const shortCat = (cats) => {
        const arr = [...cats];
        if (arr.length === 1) {
            return arr[0]
                .replace('Engineering ', 'Eng. ')
                .replace('IT Software ', 'IT Sw. ')
                .replace('IT ', 'IT ')
                .replace(' & ', ' & ')
                .replace('BPO ', 'BPO ')
                .replace('Banking & Financial Services', 'Banking & Finance')
                .replace('Creative, Design & Multimedia', 'Creative & Design')
                .replace('Integrated Management System (IMS)', 'IMS')
                .replace('Logistics and Supply Chain', 'Logistics & SC')
                .replace('Data Science / Analytics', 'Data Science');
        }
        // Multiple categories — show first word of each
        return arr.map(c => c.split(/[\s,\/]/)[0]).join(' / ');
    };

    const selectedCount = srSelectedBatches === null
        ? srBatches.length
        : srSelectedBatches.length;
    const selectedRoles = srGetActiveRoles().length;

    wrap.innerHTML = `
        <div style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.75rem;flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" onclick="srSelectAllBatches()" style="font-size:0.75rem;">Select All</button>
            <button class="btn btn-secondary btn-sm" onclick="srClearBatches()" style="font-size:0.75rem;">Clear All</button>
            <span style="font-size:0.75rem;color:var(--text-muted);margin-left:0.5rem;">
                ${selectedCount === srBatches.length
                    ? `All ${srBatches.length} batches · ${srAllRoles.length} roles`
                    : selectedCount === 0
                        ? '<span style="color:#ef4444;">None selected</span>'
                        : `${selectedCount} of ${srBatches.length} batches · ${selectedRoles} roles`}
            </span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem;" id="srBatchChips">
            ${srBatches.map(b => {
                const count = batchCounts[b] || 0;
                const cats = batchCats[b] ? shortCat(batchCats[b]) : '';
                const sel = srSelectedBatches === null || srSelectedBatches.includes(b);
                const fullCats = batchCats[b] ? [...batchCats[b]].join(', ') : '';
                return `<button class="sr-batch-chip ${sel ? 'sr-chip-active' : ''}"
                    onclick="srToggleBatch('${b}')"
                    title="${fullCats} · ${count} roles">
                    <span style="font-weight:600;font-size:0.72rem;">${b.replace('Batch ','B')}</span>
                    <span style="font-size:0.68rem;margin-left:0.3rem;opacity:${sel ? '0.85' : '0.6'};">${cats}</span>
                    <span style="font-size:0.65rem;margin-left:0.25rem;opacity:0.55;">(${count})</span>
                </button>`;
            }).join('')}
        </div>
    `;
    srUpdateRunSummary();
}

function srToggleBatch(batch) {
    if (srSelectedBatches === null) {
        // Was "all" — switch to all except this one
        srSelectedBatches = srBatches.filter(b => b !== batch);
    } else {
        const idx = srSelectedBatches.indexOf(batch);
        if (idx >= 0) srSelectedBatches.splice(idx, 1);
        else srSelectedBatches.push(batch);
        // If all batches are now selected, reset to null (= all)
        if (srSelectedBatches.length === srBatches.length) srSelectedBatches = null;
    }
    srRenderBatchSelector();
}

function srSelectAllBatches() {
    srSelectedBatches = null;   // null = all selected
    srRenderBatchSelector();
}

function srClearBatches() {
    srSelectedBatches = [];     // empty array = none selected
    srRenderBatchSelector();
}

function srGetActiveBatches() {
    if (srSelectedBatches === null) return srBatches;  // null = all
    return srSelectedBatches;                           // [] or partial = explicit list
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
    const batchCount = srGetActiveBatches().length;
    if (batchCount === 0) {
        el.innerHTML = '<span style="color:#ef4444;">No batches selected — click batch chips above to select.</span>';
        return;
    }
    // Count total API calls accounting for chunking
    const activeBatches = srGetActiveBatches();
    let totalApiCalls = 0;
    activeBatches.forEach(batch => {
        const batchRoles = srAllRoles.filter(r => r.batch === batch);
        totalApiCalls += Math.ceil(batchRoles.length / SR_CHUNK_SIZE);
    });
    const chunkedNote = totalApiCalls > batchCount
        ? `<span style="color:var(--text-muted);font-size:0.75rem;"> (${batchCount} batches split into ${totalApiCalls} API calls — chunks of ${SR_CHUNK_SIZE})</span>`
        : '';
    el.innerHTML = `
        <strong>${roles.length}</strong> roles across
        <strong>${batchCount}</strong> batches →
        <strong>${totalApiCalls}</strong> API calls for
        <strong>${market ? market.label : srSelectedMarket}</strong>
        <span style="color:var(--text-muted);font-size:0.78rem;margin-left:0.5rem;">
            (est. ${Math.round(totalApiCalls * 45)}–${Math.round(totalApiCalls * 90)} seconds)
        </span>${chunkedNote}
    `;
}

// ── API Key Section ──────────────────────────────────
function srRenderApiKeySection() {
    const wrap = document.getElementById('srApiKeySection');
    if (!wrap) return;
    const isAdmin = currentUser && currentUser.role === 'Admin';
    wrap.innerHTML = `
        <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:0.5rem;">
                <div style="width:8px;height:8px;border-radius:50%;background:${srApiKeyConfigured ? '#22c55e' : '#ef4444'};flex-shrink:0;"></div>
                <span style="font-size:0.8rem;color:var(--text-muted);">
                    Anthropic API Key: ${srApiKeyConfigured
                        ? '<span style="color:#22c55e;font-weight:600;">Configured</span>'
                        : '<span style="color:#ef4444;font-weight:600;">Not configured — contact your administrator</span>'}
                </span>
            </div>
            ${isAdmin ? `
            <button class="btn btn-secondary btn-sm" onclick="srShowApiKeyModal()" style="font-size:0.75rem;">
                🔑 ${srApiKeyConfigured ? 'Update Key' : 'Set API Key'}
            </button>` : ''}
        </div>
    `;
}

function srCheckApiKey() {
    const btn = document.getElementById('srRunBtn');
    if (!btn) return;
    btn.disabled = !srApiKeyConfigured;
    btn.title = srApiKeyConfigured ? '' : 'API key not configured — contact your administrator';
}

function srShowApiKeyModal() {
    if (!currentUser || currentUser.role !== 'Admin') return;
    document.getElementById('srApiKeyInput').value = '';
    document.getElementById('srApiKeyPlaceholder').textContent = srApiKeyConfigured
        ? 'Leave blank to keep existing key, or paste a new key to replace it'
        : 'Paste your Anthropic API key (sk-ant-...)';
    showModal('srApiKeyModal');
}

async function srSaveApiKey() {
    const inp = document.getElementById('srApiKeyInput');
    const val = inp.value.trim();

    if (!val) { hideModal('srApiKeyModal'); return; }

    if (!val.startsWith('sk-ant-')) {
        alert('That does not look like a valid Anthropic API key (should start with sk-ant-)');
        return;
    }

    const saveBtn = document.getElementById('srApiKeySaveBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

    try {
        await srSaveApiKeyToDB(val);
        hideModal('srApiKeyModal');
        srRenderApiKeySection();
        srCheckApiKey();
        srLog('✅ API key saved to database', 'success');
    } catch(e) {
        alert('Failed to save API key: ' + e.message);
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Key'; }
    }
}

// ── Wake Lock — prevents browser/screen sleep during long runs ──────
async function srAcquireWakeLock() {
    if (!('wakeLock' in navigator)) {
        srLog('⚠️ Wake Lock API not supported in this browser — tab may sleep during long runs', 'warn');
        return;
    }
    try {
        srWakeLock = await navigator.wakeLock.request('screen');
        srLog('🔒 Screen wake lock active — browser will stay awake', 'muted');
        // If the tab loses visibility and the lock is released automatically, re-acquire when visible again
        srWakeLock.addEventListener('release', () => {
            srLog('🔓 Wake lock released', 'muted');
        });
        document.addEventListener('visibilitychange', srHandleVisibilityChange);
    } catch(e) {
        srLog(`⚠️ Could not acquire wake lock: ${e.message}`, 'warn');
    }
}

async function srHandleVisibilityChange() {
    if (srRunning && document.visibilityState === 'visible' && (!srWakeLock || srWakeLock.released)) {
        try {
            srWakeLock = await navigator.wakeLock.request('screen');
            srLog('🔒 Wake lock re-acquired (tab back in focus)', 'muted');
        } catch(e) { /* silent — run will continue anyway */ }
    }
}

async function srReleaseWakeLock() {
    document.removeEventListener('visibilitychange', srHandleVisibilityChange);
    if (srWakeLock && !srWakeLock.released) {
        await srWakeLock.release();
        srWakeLock = null;
    }
}

// ── Run Research ────────────────────────────────────
function srRenderRunTab() {
    srUpdateRunSummary();
    srCheckApiKey();
}

// ── Resume helpers ───────────────────────────────────
// Returns a Set of jpid_levels that already have is_current = true for this market
async function srFetchCompletedJpids(market) {
    const completed = new Set();
    let offset = 0;
    while (true) {
        const { data, error } = await supabaseClient
            .from('salary_research')
            .select('jpid_level')
            .eq('market', market)
            .eq('is_current', true)
            .range(offset, offset + 999);
        if (error) throw error;
        (data || []).forEach(r => { if (r.jpid_level) completed.add(r.jpid_level); });
        if (!data || data.length < 1000) break;
        offset += 1000;
    }
    return completed;
}

async function srStartResearch() {
    if (srRunning) return;
    if (!srApiKeyConfigured) { alert('API key not configured. Please set it via the Update Key button.'); return; }

    const roles = srGetActiveRoles();
    if (!roles.length || !srGetActiveBatches().length) { alert('No batches selected. Click batch chips to select some.'); return; }

    const market = srSelectedMarket;
    const marketInfo = SR_MARKETS.find(m => m.code === market);
    const batches = srGetActiveBatches();
    const runId = `${new Date().toISOString().slice(0,10)}-${market}`;
    const resumeMode = document.getElementById('srResumeToggle')?.checked || false;

    srRunning = true;
    srAbortFlag = false;
    srCurrentRunId = runId;

    // UI state
    document.getElementById('srRunBtn').disabled = true;
    document.getElementById('srAbortBtn').style.display = '';
    document.getElementById('srAbortBtn').disabled = false;
    document.getElementById('srProgressWrap').style.display = '';
    document.getElementById('srLogWrap').style.display = '';
    document.getElementById('srLogLines').innerHTML = '';

    srLog(`🚀 Starting ${marketInfo.label} research — ${roles.length} roles in ${batches.length} batches`, 'info');
    srLog(`Run ID: ${runId}`, 'muted');

    // ── Resume mode: fetch already-completed JPIDs ──
    let completedJpids = new Set();
    if (resumeMode) {
        srLog('🔍 Resume mode ON — checking existing results…', 'muted');
        try {
            completedJpids = await srFetchCompletedJpids(market);
            srLog(`  Found ${completedJpids.size} roles already completed for ${marketInfo.label}`, 'muted');
        } catch(e) {
            srLog(`  ⚠️ Could not load existing results — running all batches: ${e.message}`, 'warn');
        }
    }

    // ── Build work plan: filter out already-done roles per batch ──
    const workPlan = batches.map(batch => {
        const allBatchRoles = roles.filter(r => r.batch === batch);
        const pendingRoles  = resumeMode
            ? allBatchRoles.filter(r => !completedJpids.has(r.jpid_level))
            : allBatchRoles;
        return { batch, allBatchRoles, pendingRoles };
    });

    // Total API calls based on pending work only
    let totalApiCalls = 0;
    workPlan.forEach(({ pendingRoles }) => {
        if (pendingRoles.length) totalApiCalls += Math.ceil(pendingRoles.length / SR_CHUNK_SIZE);
    });

    const skippedBatches  = workPlan.filter(w => w.pendingRoles.length === 0).length;
    const partialBatches  = workPlan.filter(w => w.pendingRoles.length > 0 && w.pendingRoles.length < w.allBatchRoles.length).length;

    if (resumeMode) {
        srLog(`  ${skippedBatches} batches complete ✅  ${partialBatches} partial ⚠️  ${batches.length - skippedBatches - partialBatches} not started`, 'muted');
        srLog(`  ${totalApiCalls} API calls needed (chunks of ${SR_CHUNK_SIZE})`, 'muted');
    } else {
        srLog(`  ${totalApiCalls} API calls (chunks of ${SR_CHUNK_SIZE})`, 'muted');
    }

    srSetProgress(0, totalApiCalls);
    await srAcquireWakeLock();

    let completedCalls = 0;
    let totalSaved = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < workPlan.length; i++) {
        if (srAbortFlag) {
            srLog('⛔ Run aborted by user.', 'warn');
            break;
        }

        const { batch, allBatchRoles, pendingRoles } = workPlan[i];

        // Fully complete batch — skip entirely
        if (pendingRoles.length === 0) {
            skipped++;
            srLog(`⏭ ${batch} — ${allBatchRoles.length} roles already complete, skipping`, 'muted');
            continue;
        }

        // Partial or full batch — research pending roles only
        const isPartial = pendingRoles.length < allBatchRoles.length;
        const chunks = [];
        for (let c = 0; c < pendingRoles.length; c += SR_CHUNK_SIZE) {
            chunks.push(pendingRoles.slice(c, c + SR_CHUNK_SIZE));
        }

        const chunkWord  = chunks.length > 1 ? `${chunks.length} chunks` : '1 chunk';
        const partialTag = isPartial ? ` (${allBatchRoles.length - pendingRoles.length} already done, ${pendingRoles.length} remaining)` : '';
        srLog(`📦 ${batch} — ${pendingRoles.length} roles (${chunkWord})${partialTag}…`, 'info');

        const allBatchResults = [];
        let batchFailed = false;

        for (let c = 0; c < chunks.length; c++) {
            if (srAbortFlag) break;

            const chunk = chunks[c];
            const chunkLabel = chunks.length > 1
                ? ` chunk ${c + 1}/${chunks.length} (${chunk.length} roles)`
                : ` ${chunk.length} roles`;

            try {
                srLog(`  ⏳${chunkLabel}…`, 'muted');
                const results = await srResearchBatch(chunk, market);
                if (!results) throw new Error('No results returned');
                allBatchResults.push(...results.map((res, idx) => ({ res, role: chunk[idx] })));
                srLog(`  ✅${chunkLabel} — done`, 'success');
            } catch(e) {
                errors++;
                batchFailed = true;
                srLog(`  ❌${chunkLabel} failed: ${e.message}`, 'error');
            }

            completedCalls++;
            srSetProgress(completedCalls, totalApiCalls);

            if (c < chunks.length - 1 && !srAbortFlag) {
                await srDelay(1500);
            }
        }

        // Save whatever results were collected
        if (allBatchResults.length > 0) {
            try {
                const resultsArr = allBatchResults.map(x => x.res);
                const rolesArr   = allBatchResults.map(x => x.role);
                const saved = await srSaveResults(resultsArr, rolesArr, market, batch, runId);
                totalSaved += saved;
                if (batchFailed) {
                    srLog(`  ⚠️ ${batch} — saved ${saved} of ${pendingRoles.length} results (some chunks failed)`, 'warn');
                } else {
                    srLog(`  💾 ${batch} — saved ${saved} results`, 'success');
                }
            } catch(e) {
                srLog(`  ❌ ${batch} — save failed: ${e.message}`, 'error');
            }
        }

        if (i < workPlan.length - 1 && !srAbortFlag) {
            await srDelay(1500);
        }
    }

    srRunning = false;
    await srReleaseWakeLock();
    document.getElementById('srRunBtn').disabled = false;
    document.getElementById('srAbortBtn').style.display = 'none';

    const status = srAbortFlag ? 'aborted' : 'complete';
    const skipNote = skipped > 0 ? ` ${skipped} batches skipped (already complete).` : '';
    srLog(`\n🏁 Run ${status}. ${totalSaved} results saved. ${errors} chunk errors.${skipNote}`, errors > 0 ? 'warn' : 'success');

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
    const systemPrompt = srGetPrompt(market);

    // Call Supabase Edge Function (server-side proxy — no CORS, key never in browser)
    const response = await fetch(SR_EDGE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ roles, market, systemPrompt }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Edge Function error ${response.status}: ${err.error || response.statusText}`);
    }

    const data = await response.json();
    if (data.error) throw new Error(data.error);
    if (!data.result) throw new Error('No result returned from Edge Function');

    return srParseJsonResponse(data.result, roles);
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
        // Paginate — PostgREST has a 1,000-row default cap
        let allData = [], offset = 0;
        while (true) {
            let query = supabaseClient
                .from('salary_research')
                .select('*')
                .eq('market', marketFilter)
                .eq('is_current', true)
                .order('jpid_level', { ascending: true })
                .range(offset, offset + 999);

            if (catFilter) query = query.eq('category', catFilter);
            if (confFilter) query = query.eq('conf_median', confFilter);

            const { data, error } = await query;
            if (error) throw error;
            allData = allData.concat(data || []);
            if (!data || data.length < 1000) break;
            offset += 1000;
        }
        const data = allData;

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
    if (!sel) return;
    const currentVal = sel.value;
    // Rebuild from scratch each time so new categories from fresh runs appear
    while (sel.options.length > 1) sel.remove(1);  // keep the first "All categories" option
    const cats = [...new Set(rows.map(r => r.category).filter(Boolean))].sort();
    cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        sel.appendChild(opt);
    });
    // Restore previous selection if it still exists
    if (currentVal) sel.value = currentVal;
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

// ── Publish Tab ─────────────────────────────────────
async function srLoadPublishTab() {
    const wrap = document.getElementById('srPublishStatusWrap');
    if (!wrap) return;
    wrap.innerHTML = '<p style="font-size:0.8rem;color:var(--text-muted);">Loading research coverage…</p>';

    try {
        // Get counts from salary_research (is_current) per market
        const researchCounts = {};
        for (const mkt of SR_MARKETS) {
            const { count, error } = await supabaseClient
                .from('salary_research')
                .select('id', { count: 'exact', head: true })
                .eq('market', mkt.code)
                .eq('is_current', true);
            researchCounts[mkt.code] = error ? 0 : (count || 0);
        }

        // Get counts already published to salary_ranges per market
        const publishedCounts = {};
        for (const mkt of SR_MARKETS) {
            const { count, error } = await supabaseClient
                .from('salary_ranges')
                .select('id', { count: 'exact', head: true })
                .eq('market', mkt.code);
            publishedCounts[mkt.code] = error ? 0 : (count || 0);
        }

        const totalRoles = srAllRoles.length;

        wrap.innerHTML = `
            <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
                <thead>
                    <tr style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border);">
                        <th style="padding:0.5rem;text-align:left;">Market</th>
                        <th style="padding:0.5rem;text-align:right;">Researched</th>
                        <th style="padding:0.5rem;text-align:right;">Total Roles</th>
                        <th style="padding:0.5rem;text-align:right;">Coverage</th>
                        <th style="padding:0.5rem;text-align:right;">Published</th>
                        <th style="padding:0.5rem;text-align:center;">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${SR_MARKETS.map(mkt => {
                        const researched  = researchCounts[mkt.code] || 0;
                        const published   = publishedCounts[mkt.code] || 0;
                        const pct         = totalRoles > 0 ? Math.round(researched / totalRoles * 100) : 0;
                        const isAdmin     = currentUser && currentUser.role === 'Admin';
                        const canPublish  = isAdmin && researched > 0;
                        const barColor    = pct >= 90 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
                        return `<tr style="border-bottom:1px solid var(--border);">
                            <td style="padding:0.6rem 0.5rem;">
                                <img src="https://flagcdn.com/16x12/${mkt.flag}.png" width="16" height="12" style="vertical-align:middle;margin-right:6px;">
                                <strong>${mkt.label}</strong>
                                <span style="font-size:0.7rem;color:var(--text-muted);margin-left:4px;">${mkt.currency}</span>
                            </td>
                            <td style="padding:0.6rem 0.5rem;text-align:right;font-family:'Space Mono',monospace;">${researched.toLocaleString()}</td>
                            <td style="padding:0.6rem 0.5rem;text-align:right;font-family:'Space Mono',monospace;color:var(--text-muted);">${totalRoles.toLocaleString()}</td>
                            <td style="padding:0.6rem 0.5rem;text-align:right;">
                                <div style="display:inline-flex;align-items:center;gap:0.4rem;">
                                    <div style="width:60px;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
                                        <div style="width:${pct}%;height:100%;background:${barColor};border-radius:3px;"></div>
                                    </div>
                                    <span style="font-size:0.75rem;font-weight:600;color:${barColor};">${pct}%</span>
                                </div>
                            </td>
                            <td style="padding:0.6rem 0.5rem;text-align:right;font-family:'Space Mono',monospace;color:${published>0?'#22c55e':'var(--text-muted)'};">
                                ${published > 0 ? published.toLocaleString() : '—'}
                            </td>
                            <td style="padding:0.6rem 0.5rem;text-align:center;">
                                ${canPublish
                                    ? `<button class="btn btn-primary btn-sm" onclick="srPublishMarket('${mkt.code}')" style="font-size:0.75rem;">
                                        📤 Publish ${mkt.code}
                                       </button>`
                                    : `<span style="font-size:0.72rem;color:var(--text-muted);">${researched === 0 ? 'No data yet' : 'Admin only'}</span>`
                                }
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
            <p style="font-size:0.75rem;color:var(--text-muted);margin-top:1rem;">
                Publish copies current research results into the Salary Ranges table used by the calculators. Existing entries for that market are replaced. PH data already in Salary Ranges is not affected by publishing other markets.
            </p>
        `;
    } catch(e) {
        wrap.innerHTML = `<p style="color:#ef4444;font-size:0.8rem;">Error loading publish status: ${e.message}</p>`;
    }
}

async function srPublishMarket(market) {
    const mktInfo = SR_MARKETS.find(m => m.code === market);
    const label   = mktInfo ? mktInfo.label : market;

    // 1. Load all current research rows for this market
    srLog(`📤 Loading research data for ${label}…`, 'info');
    let rows = [], offset = 0;
    while (true) {
        const { data, error } = await supabaseClient
            .from('salary_research')
            .select('jpid_level, job_title, category, batch, years_experience, low_salary, median_salary, high_salary, conf_median')
            .eq('market', market)
            .eq('is_current', true)
            .range(offset, offset + 999);
        if (error) { alert('Error reading research data: ' + error.message); return; }
        rows = rows.concat(data || []);
        if (!data || data.length < 1000) break;
        offset += 1000;
    }

    if (!rows.length) { alert(`No current research data found for ${label}.`); return; }

    // Filter out Role N/A entries (null salaries)
    const publishable = rows.filter(r => r.low_salary != null || r.median_salary != null || r.high_salary != null);
    const naCount     = rows.length - publishable.length;

    if (!confirm(`Publish ${publishable.length} roles to Salary Ranges for ${label}?
${naCount > 0 ? `(${naCount} "Role N/A" entries will be skipped)
` : ''}This will replace all existing ${label} salary data in the calculator.`)) return;

    try {
        // 2. Delete existing salary_ranges rows for this market
        const { error: delErr } = await supabaseClient
            .from('salary_ranges')
            .delete()
            .eq('market', market);
        if (delErr) throw new Error('Delete failed: ' + delErr.message);

        // 3. Insert new rows in batches of 500
        const insertRows = publishable.map(r => ({
            jpid_level:      r.jpid_level,
            job_title:       r.job_title,
            category:        r.category,
            batch:           r.batch,
            market:          market,
            years_experience: r.years_experience,
            low_salary:      r.low_salary,
            median_salary:   r.median_salary,
            high_salary:     r.high_salary,
        }));

        const BATCH = 500;
        for (let i = 0; i < insertRows.length; i += BATCH) {
            const chunk = insertRows.slice(i, i + BATCH);
            const { error: insErr } = await supabaseClient.from('salary_ranges').insert(chunk);
            if (insErr) throw new Error(`Insert failed at row ${i}: ` + insErr.message);
        }

        srLog(`✅ Published ${insertRows.length} ${label} roles to Salary Ranges`, 'success');
        alert(`✅ ${insertRows.length} ${label} roles published to Salary Ranges successfully!${naCount > 0 ? `
${naCount} "Role N/A" entries skipped.` : ''}`);

        // Refresh publish status table
        srLoadPublishTab();

    } catch(e) {
        srLog(`❌ Publish failed: ${e.message}`, 'error');
        alert('Publish failed: ' + e.message);
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
    if (tab === 'prompts') srInitPromptTab();
    if (tab === 'publish') srLoadPublishTab();
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
