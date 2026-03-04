// =====================================================
// AUTHENTICATION
// =====================================================
async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function login() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const loginBtn = document.getElementById('loginBtn');
    const loginError = document.getElementById('loginError');
    
    // Show loading state
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="loading"></span> Signing in...';
    loginError.classList.remove('visible');
    
    try {
        // Hash the password before comparing
        const hashedPassword = await hashPassword(password);
        
        // Query Supabase for user
        const { data, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('email', email)
            .eq('password_hash', hashedPassword)
            .single();
        
        if (error || !data) {
            throw new Error('Invalid credentials');
        }
        
        // Login successful
        currentUser = data;
        sessionStorage.setItem('currentUser', JSON.stringify(data));
        document.getElementById('loginOverlay').classList.add('hidden');
        initializeApp();
        
    } catch (error) {
        console.error('Login error:', error);
        loginError.textContent = 'Invalid email or password. Please try again.';
        loginError.classList.add('visible');
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = 'Sign In';
    }
}


// =====================================================
// FORGOT PASSWORD
// =====================================================
// EmailJS config — fill in your EmailJS public key,
// service ID and template ID after creating a free
// account at https://www.emailjs.com
const EMAILJS_PUBLIC_KEY  = 'YOUR_EMAILJS_PUBLIC_KEY';   // ← replace
const EMAILJS_SERVICE_ID  = 'YOUR_EMAILJS_SERVICE_ID';   // ← replace
const EMAILJS_TEMPLATE_ID = 'YOUR_EMAILJS_TEMPLATE_ID';  // ← replace

let _resetCode  = '';   // active 6-digit code
let _resetEmail = '';   // email the code was sent to
let _resetExpiry = 0;   // timestamp (ms) when code expires

function showSignInPanel() {
    document.getElementById('panelSignIn').classList.add('active');
    document.getElementById('panelForgot').classList.remove('active');
    document.getElementById('panelReset').classList.remove('active');
}
function showForgotPanel() {
    document.getElementById('panelSignIn').classList.remove('active');
    document.getElementById('panelForgot').classList.add('active');
    document.getElementById('panelReset').classList.remove('active');
    document.getElementById('forgotError').classList.remove('visible');
    document.getElementById('forgotSuccess').classList.remove('visible');
    document.getElementById('forgotEmail').value = _resetEmail || '';
}
function showResetPanel() {
    document.getElementById('panelSignIn').classList.remove('active');
    document.getElementById('panelForgot').classList.remove('active');
    document.getElementById('panelReset').classList.add('active');
    document.getElementById('resetError').classList.remove('visible');
    document.getElementById('resetSuccess').classList.remove('visible');
    document.getElementById('resetCode').value = '';
    document.getElementById('resetNewPassword').value = '';
    document.getElementById('resetConfirmPassword').value = '';
}

async function sendResetCode() {
    const email = document.getElementById('forgotEmail').value.trim();
    const errEl = document.getElementById('forgotError');
    const okEl  = document.getElementById('forgotSuccess');
    const btn   = document.getElementById('forgotBtn');
    errEl.classList.remove('visible');
    okEl.classList.remove('visible');

    if (!email) {
        errEl.textContent = 'Please enter your email address.';
        errEl.classList.add('visible');
        return;
    }

    // Check user exists in DB
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> Sending…';
    try {
        const { data, error } = await supabaseClient
            .from('users')
            .select('id, name, email')
            .eq('email', email)
            .single();

        if (error || !data) {
            // Don't reveal if email exists — show generic success anyway
            // but don't actually send or store anything
            okEl.textContent = 'If that email exists in our system, a reset code has been sent.';
            okEl.classList.add('visible');
            btn.disabled = false;
            btn.innerHTML = 'Send Reset Code';
            return;
        }

        // Generate 6-digit code
        const code = String(Math.floor(100000 + Math.random() * 900000));
        _resetCode   = code;
        _resetEmail  = email;
        _resetExpiry = Date.now() + 15 * 60 * 1000; // 15 minutes

        // Send via EmailJS
        if (EMAILJS_PUBLIC_KEY === 'YOUR_EMAILJS_PUBLIC_KEY') {
            // EmailJS not yet configured — show code in alert for dev/testing
            alert(`[DEV MODE] Reset code for ${email}: ${code}\n\nConfigure EmailJS to send real emails.`);
        } else {
            emailjs.init(EMAILJS_PUBLIC_KEY);
            await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
                to_email: email,
                to_name:  data.name || email,
                reset_code: code,
                expiry_mins: '15'
            });
        }

        okEl.textContent = 'Reset code sent! Check your email — it expires in 15 minutes.';
        okEl.classList.add('visible');

        // Auto-advance to code entry panel after 1.5s
        setTimeout(showResetPanel, 1500);

    } catch(e) {
        console.error('Send reset code error:', e);
        errEl.textContent = 'Failed to send reset code. Please try again.';
        errEl.classList.add('visible');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Send Reset Code';
    }
}

async function submitPasswordReset() {
    const code     = document.getElementById('resetCode').value.trim();
    const newPass  = document.getElementById('resetNewPassword').value;
    const confPass = document.getElementById('resetConfirmPassword').value;
    const errEl    = document.getElementById('resetError');
    const okEl     = document.getElementById('resetSuccess');
    const btn      = document.getElementById('resetBtn');
    errEl.classList.remove('visible');
    okEl.classList.remove('visible');

    // Validate inputs
    if (!code || !newPass || !confPass) {
        errEl.textContent = 'Please fill in all fields.';
        errEl.classList.add('visible');
        return;
    }
    if (newPass !== confPass) {
        errEl.textContent = 'Passwords do not match.';
        errEl.classList.add('visible');
        return;
    }
    if (newPass.length < 6) {
        errEl.textContent = 'Password must be at least 6 characters.';
        errEl.classList.add('visible');
        return;
    }
    if (!_resetCode || !_resetEmail) {
        errEl.textContent = 'No reset request found. Please request a new code.';
        errEl.classList.add('visible');
        return;
    }
    if (Date.now() > _resetExpiry) {
        errEl.textContent = 'Reset code has expired. Please request a new one.';
        errEl.classList.add('visible');
        return;
    }
    if (code !== _resetCode) {
        errEl.textContent = 'Incorrect code. Please check your email and try again.';
        errEl.classList.add('visible');
        return;
    }

    // All good — update password in DB
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> Updating…';
    try {
        const hashedPassword = await hashPassword(newPass);
        const { error } = await supabaseClient
            .from('users')
            .update({ password_hash: hashedPassword })
            .eq('email', _resetEmail);

        if (error) throw error;

        // Clear reset state
        _resetCode = '';
        _resetEmail = '';
        _resetExpiry = 0;

        okEl.textContent = 'Password updated successfully! Redirecting to sign in…';
        okEl.classList.add('visible');
        setTimeout(() => {
            showSignInPanel();
            document.getElementById('loginEmail').value = _resetEmail || '';
        }, 2000);

    } catch(e) {
        console.error('Password reset error:', e);
        errEl.textContent = 'Failed to update password. Please try again.';
        errEl.classList.add('visible');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Reset Password';
    }
}

function logout() {
    currentUser = null;
    sessionStorage.removeItem('currentUser');
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
}

function checkLogin() {
    const saved = sessionStorage.getItem('currentUser');
    if (saved) {
        currentUser = JSON.parse(saved);
        document.getElementById('loginOverlay').classList.add('hidden');
        initializeApp();
    }
}

// =====================================================
// ENTER KEY LOGIN
// =====================================================
document.getElementById('resetCode').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') document.getElementById('resetNewPassword').focus();
});
document.getElementById('resetConfirmPassword').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') submitPasswordReset();
});
document.getElementById('forgotEmail').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') sendResetCode();
});
document.getElementById('loginPassword').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') login();
});
document.getElementById('loginEmail').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') document.getElementById('loginPassword').focus();
});
