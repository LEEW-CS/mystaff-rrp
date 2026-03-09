// =====================================================
// PATCH: calculator-ph.js  →  saveQuote()
// Replace the quoteData object inside saveQuote()
// (starting at "const quoteData = {" through the closing "};")
// with the version below, which adds 4 new fields.
// =====================================================

// FIND this block in saveQuote():
//
//     const quoteData = {
//         market: 'PH',
//         ...
//         created_by: currentUser ? (currentUser.name || currentUser.email || 'Unknown') : 'Unknown',
//     };
//
// REPLACE WITH:

    const quoteData = {
        market: 'PH',
        quote_name: quoteName,
        description: description || null,
        candidate_name: document.getElementById('candidateName').value || 'To Be Advised',
        role_name: document.getElementById('roleSearchInput').value || document.getElementById('roleName').value || 'To Be Advised',
        custom_role_name: document.getElementById('roleName').value || null,
        base_salary_from: parseFloat(document.getElementById('baseSalaryFrom').value) || 35000,
        base_salary_to: parseFloat(document.getElementById('baseSalaryTo').value) || 35000,
        currency: document.getElementById('currency').value,
        price_book: document.getElementById('priceBook').value,
        night_diff_hours: parseInt(document.getElementById('nightDiffHours').value) || 0,
        night_diff_rate: parseFloat(document.getElementById('nightDiffRate').value) || 0.10,
        separation_override: document.getElementById('separationOverride').value,
        fx_month_id: parseInt(document.getElementById('exchangeRateDate').value) || null,
        hardware_id: parseInt(document.getElementById('mpcHardware').value) || null,
        night_meal_id: parseInt(document.getElementById('nightMealsProduct').value) || null,
        total_monthly: document.getElementById('resultTotalMonthly').textContent,
        created_by: currentUser ? (currentUser.name || currentUser.email || 'Unknown') : 'Unknown',

        // ── Proposal generator fields ──────────────────
        // These capture the calculated breakdown at save time
        // so the proposal generator doesn't need to recalculate.
        edc_amount:     parseFloat(document.getElementById('resultEDC')?.textContent?.replace(/[^0-9.-]/g,'')) || null,
        mpc_amount:     parseFloat(document.getElementById('resultMPC')?.textContent?.replace(/[^0-9.-]/g,'')) || null,
        mpc_name:       document.getElementById('mpcHardware')?.options[document.getElementById('mpcHardware')?.selectedIndex]?.text || null,
        mgmt_fee_amount: parseFloat(document.getElementById('resultMgmtFee')?.textContent?.replace(/[^0-9.-]/g,'')) || null,
    };

// =====================================================
// NOTE: You need to know the exact element IDs for the
// EDC, MPC, and management fee result fields in your
// calculator HTML. Check index.html for the correct IDs.
//
// Common IDs used in PH calculator results:
//   resultEDC        — Employee Direct Costs total
//   resultMPC        — Managed PC monthly cost
//   resultMgmtFee    — Management fee
//   resultTotalMonthly — Total (already saved)
//
// If your IDs differ, update accordingly.
// =====================================================
