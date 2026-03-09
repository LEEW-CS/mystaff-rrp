// =====================================================
// PATCH: quotes-and-ph-pdf.js
// Add "Generate Proposal" button to each quote row
// =====================================================
//
// In renderQuotesTable(), find where the action buttons
// are built for each row.  It likely looks something like:
//
//   <button onclick="loadQuoteIntoCalc(${q.id})">Edit</button>
//   <button onclick="confirmDeleteQuote(${q.id})">Delete</button>
//
// ADD a "Proposal" button after Edit:
//
//   <button onclick="showProposalModal(${q.id})"
//           class="btn-proposal"
//           title="Generate Proposal PPTX">
//     📄 Proposal
//   </button>
//
// ── Full example row actions block ───────────────────
//
//   const actionsHtml = `
//     <button class="btn-sm btn-edit"     onclick="loadQuoteIntoCalc(${q.id})">Edit</button>
//     <button class="btn-sm btn-proposal" onclick="showProposalModal(${q.id})">📄 Proposal</button>
//     <button class="btn-sm btn-pdf"      onclick="generatePDF(${q.id})">PDF</button>
//     <button class="btn-sm btn-delete"   onclick="confirmDeleteQuote(${q.id})">Delete</button>
//   `;
//
// ── CSS to add in styles.css ──────────────────────────
//
//   .btn-proposal {
//     background: #1B8EF2;
//     color: #fff;
//     border: none;
//     padding: 0.3rem 0.7rem;
//     border-radius: 6px;
//     cursor: pointer;
//     font-size: 0.8rem;
//     font-weight: 600;
//   }
//   .btn-proposal:hover {
//     background: #1570c9;
//   }
// =====================================================
