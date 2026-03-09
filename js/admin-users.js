// =====================================================
// USERS CRUD
// =====================================================
async function loadUsers() {
    try {
        const { data, error } = await supabaseClient
            .from('users')
            .select('*')
            .order('id');
        
        if (error) throw error;
        
        const tbody = document.getElementById('usersTableBody');
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No users found</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.map(user => `
            <tr>
                <td>${user.id}</td>
                <td>${user.name || '-'}</td>
                <td>${user.email}</td>
                <td><span class="role-badge ${user.role.toLowerCase()}">${user.role}</span></td>
                <td>${new Date(user.created_at).toLocaleDateString()}</td>
                <td class="actions">
                    <button class="btn btn-secondary btn-sm" onclick="editUser(${user.id})">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteUser(${user.id})">Delete</button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading users:', error);
        document.getElementById('usersStatus').innerHTML = `<div class="status-message error">Error loading users: ${error.message}</div>`;
    }
}

function showAddUserModal() {
    document.getElementById('newUserName').value = '';
    document.getElementById('newUserEmail').value = '';
    document.getElementById('newUserPassword').value = '';
    document.getElementById('newUserRole').value = 'Sales';
    document.getElementById('newUserJobTitle').value = '';
    document.getElementById('newUserPhone').value = '';
    document.getElementById('newUserEmailAddress').value = '';
    document.getElementById('addUserModal').classList.add('active');
}

async function addUser() {
    const name = document.getElementById('newUserName').value.trim();
    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const role = document.getElementById('newUserRole').value;
    const job_title = document.getElementById('newUserJobTitle').value.trim() || null;
    const phone = document.getElementById('newUserPhone').value.trim() || null;
    const email_address = document.getElementById('newUserEmailAddress').value.trim() || null;
    
    if (!email || !password) {
        alert('Email and password are required');
        return;
    }
    
    try {
        const hashedPassword = await hashPassword(password);
        const { data, error } = await supabaseClient
            .from('users')
            .insert([{ name, email, password_hash: hashedPassword, role, job_title, phone, email_address }])
            .select();
        
        if (error) throw error;
        
        hideModal('addUserModal');
        loadUsers();
        document.getElementById('usersStatus').innerHTML = `<div class="status-message success">User "${name || email}" added successfully!</div>`;
        setTimeout(() => document.getElementById('usersStatus').innerHTML = '', 3000);
        
    } catch (error) {
        console.error('Error adding user:', error);
        alert('Error adding user: ' + error.message);
    }
}

async function deleteUser(id) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    try {
        const { error } = await supabaseClient
            .from('users')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        loadUsers();
        document.getElementById('usersStatus').innerHTML = `<div class="status-message success">User deleted successfully!</div>`;
        setTimeout(() => document.getElementById('usersStatus').innerHTML = '', 3000);
        
    } catch (error) {
        console.error('Error deleting user:', error);
        alert('Error deleting user: ' + error.message);
    }
}

async function editUser(id) {
    try {
        const { data, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        
        document.getElementById('editUserId').value = data.id;
        document.getElementById('editUserName').value = data.name || '';
        document.getElementById('editUserEmail').value = data.email;
        document.getElementById('editUserPassword').value = '';
        document.getElementById('editUserRole').value = data.role;
        document.getElementById('editUserJobTitle').value = data.job_title || '';
        document.getElementById('editUserPhone').value = data.phone || '';
        document.getElementById('editUserEmailAddress').value = data.email_address || '';
        document.getElementById('editUserModal').classList.add('active');
        
    } catch (error) {
        console.error('Error loading user:', error);
        alert('Error loading user: ' + error.message);
    }
}

async function saveUser() {
    const id = document.getElementById('editUserId').value;
    const name = document.getElementById('editUserName').value.trim();
    const email = document.getElementById('editUserEmail').value.trim();
    const password = document.getElementById('editUserPassword').value;
    const role = document.getElementById('editUserRole').value;
    const job_title = document.getElementById('editUserJobTitle').value.trim() || null;
    const phone = document.getElementById('editUserPhone').value.trim() || null;
    const email_address = document.getElementById('editUserEmailAddress').value.trim() || null;
    
    if (!email) {
        alert('Email is required');
        return;
    }
    
    try {
        const updateData = { name, email, role, job_title, phone, email_address };
        if (password) {
            updateData.password_hash = await hashPassword(password);
        }
        
        const { error } = await supabaseClient
            .from('users')
            .update(updateData)
            .eq('id', id);
        
        if (error) throw error;
        
        hideModal('editUserModal');
        loadUsers();
        document.getElementById('usersStatus').innerHTML = `<div class="status-message success">User updated successfully!</div>`;
        setTimeout(() => document.getElementById('usersStatus').innerHTML = '', 3000);
        
    } catch (error) {
        console.error('Error updating user:', error);
        alert('Error updating user: ' + error.message);
    }
}

