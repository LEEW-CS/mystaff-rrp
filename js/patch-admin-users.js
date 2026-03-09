// =====================================================
// PATCH: admin-users.js
// Add job_title, phone, email_address to user forms
// =====================================================
//
// This file documents THREE changes to make in admin-users.js.
// Apply each find/replace in order.
//
// ── CHANGE 1: Add fields to the Add User form HTML ───
//
// In your addUser modal HTML (inside index.html, or wherever
// the add user form inputs are rendered), add after the
// existing Name / Email / Password fields:
//
//   <div class="form-group">
//     <label>Job Title</label>
//     <input type="text" id="newUserJobTitle" placeholder="e.g. Business Development Manager">
//   </div>
//   <div class="form-group">
//     <label>Phone</label>
//     <input type="text" id="newUserPhone" placeholder="e.g. 0429 782 463">
//   </div>
//   <div class="form-group">
//     <label>Email Address (display)</label>
//     <input type="text" id="newUserEmailAddress" placeholder="e.g. sally@cloudstaff.com">
//   </div>
//
// ── CHANGE 2: Add same fields to Edit User form ──────
//
//   <div class="form-group">
//     <label>Job Title</label>
//     <input type="text" id="editUserJobTitle" placeholder="e.g. Business Development Manager">
//   </div>
//   <div class="form-group">
//     <label>Phone</label>
//     <input type="text" id="editUserPhone" placeholder="e.g. 0429 782 463">
//   </div>
//   <div class="form-group">
//     <label>Email Address (display)</label>
//     <input type="text" id="editUserEmailAddress">
//   </div>
//
// ── CHANGE 3: In admin-users.js, update saveNewUser() ─
//
// FIND in saveNewUser():
//     const userData = {
//         email: ...,
//         password_hash: ...,
//         name: ...,
//         role: ...,
//     };
//
// ADD these lines inside the userData object:
//         job_title:     document.getElementById('newUserJobTitle')?.value?.trim() || null,
//         phone:         document.getElementById('newUserPhone')?.value?.trim() || null,
//         email_address: document.getElementById('newUserEmailAddress')?.value?.trim() || null,
//
// ── CHANGE 4: In admin-users.js, update saveEditUser() ─
//
// FIND in saveEditUser():
//     const updateData = {
//         name: ...,
//         role: ...,
//         ...
//     };
//
// ADD:
//         job_title:     document.getElementById('editUserJobTitle')?.value?.trim() || null,
//         phone:         document.getElementById('editUserPhone')?.value?.trim() || null,
//         email_address: document.getElementById('editUserEmailAddress')?.value?.trim() || null,
//
// ── CHANGE 5: In renderUsersTable() or openEditUserModal() ─
//
// When loading an existing user into the edit form, also populate:
//     document.getElementById('editUserJobTitle').value   = user.job_title || '';
//     document.getElementById('editUserPhone').value       = user.phone || '';
//     document.getElementById('editUserEmailAddress').value = user.email_address || '';
//
// ── CHANGE 6: In auth.js / checkLogin() / setCurrentUser ─
//
// When currentUser is set from Supabase, ensure job_title, phone,
// and email_address are included in the SELECT query:
//
//     const { data } = await supabaseClient
//         .from('users')
//         .select('id, email, name, role, job_title, phone, email_address')
//         .eq('email', loginEmail)
//         .single();
//
// This makes currentUser.job_title, currentUser.phone, and
// currentUser.email_address available to the proposal generator.
// =====================================================
