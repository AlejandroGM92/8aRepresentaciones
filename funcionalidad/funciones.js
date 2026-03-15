const API_URL = '/api';

const togglePassword = document.getElementById('togglePassword');
const passwordInput = document.getElementById('password');

togglePassword.addEventListener('click', function() {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    this.textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
});

const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const emailError = document.getElementById('emailError');
const passwordError = document.getElementById('passwordError');
const successMessage = document.getElementById('successMessage');

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function showError(input, errorElement) {
    input.classList.add('error');
    errorElement.classList.add('show');
}

function hideError(input, errorElement) {
    input.classList.remove('error');
    errorElement.classList.remove('show');
}

emailInput.addEventListener('blur', function() {
    if (this.value === '' || !validateEmail(this.value)) {
        showError(this, emailError);
    } else {
        hideError(this, emailError);
    }
});

passwordInput.addEventListener('blur', function() {
    if (this.value.length < 6) {
        showError(this, passwordError);
    } else {
        hideError(this, passwordError);
    }
});

emailInput.addEventListener('input', function() {
    if (this.classList.contains('error') && validateEmail(this.value)) {
        hideError(this, emailError);
    }
});

passwordInput.addEventListener('input', function() {
    if (this.classList.contains('error') && this.value.length >= 6) {
        hideError(this, passwordError);
    }
});

loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    let isValid = true;

    if (emailInput.value === '' || !validateEmail(emailInput.value)) {
        showError(emailInput, emailError);
        isValid = false;
    }

    if (passwordInput.value.length < 6) {
        showError(passwordInput, passwordError);
        isValid = false;
    }

    if (!isValid) return;

    const submitBtn = loginForm.querySelector('.btn-login');
    submitBtn.textContent = 'Iniciando sesión...';
    submitBtn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: emailInput.value.trim(),
                password: passwordInput.value
            })
        });

        const data = await response.json();

        if (response.ok) {
            if (data.require_2fa) {
                // Mostrar paso 2FA
                mostrarPaso2FA(data.temp_token);
                submitBtn.textContent = 'Iniciar Sesión';
                submitBtn.disabled = false;
            } else {
                localStorage.setItem('token', data.token);
                localStorage.setItem('actor', JSON.stringify(data.actor));
                window.location.href = data.actor.is_admin ? 'admin.html' : (data.actor.is_casting ? 'casting.html' : 'perfil.html');
            }
        } else {
            emailError.textContent = data.error || 'Credenciales inválidas';
            showError(emailInput, emailError);
            submitBtn.textContent = 'Iniciar Sesión';
            submitBtn.disabled = false;
        }

    } catch (error) {
        console.error('Error:', error);
        emailError.textContent = 'Error de conexión. Verifica que el servidor esté corriendo.';
        emailError.classList.add('show');
        submitBtn.textContent = 'Iniciar Sesión';
        submitBtn.disabled = false;
    }
});

// ==================== FLUJO 2FA LOGIN ====================

function mostrarPaso2FA(tempToken) {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('dividerSocial').style.display = 'none';
    document.getElementById('socialLoginBtns').style.display = 'none';
    document.getElementById('form2FA').style.display = 'block';
    document.getElementById('totp_codigo').focus();
    window._tempToken2FA = tempToken;
}

function ocultarPaso2FA() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('dividerSocial').style.display = '';
    document.getElementById('socialLoginBtns').style.display = '';
    document.getElementById('form2FA').style.display = 'none';
    document.getElementById('totp_codigo').value = '';
    document.getElementById('totp_error').style.display = 'none';
    window._tempToken2FA = null;
}

document.getElementById('btn2FAVolver').addEventListener('click', ocultarPaso2FA);

// Si viene de OAuth con 2FA requerido, mostrar directamente el formulario de código
(function() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('require_2fa') === '1') {
        const tempToken = sessionStorage.getItem('oauth_temp_token');
        if (tempToken) {
            sessionStorage.removeItem('oauth_temp_token');
            mostrarPaso2FA(tempToken);
        }
    }
})();

document.getElementById('btn2FAVerificar').addEventListener('click', async function() {
    const codigo = document.getElementById('totp_codigo').value.trim();
    const errorEl = document.getElementById('totp_error');
    if (!codigo || codigo.length !== 6) {
        errorEl.textContent = 'Ingresa el código de 6 dígitos';
        errorEl.style.display = 'block';
        return;
    }
    this.textContent = 'Verificando...';
    this.disabled = true;
    try {
        const res = await fetch(`${API_URL}/auth/2fa/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ temp_token: window._tempToken2FA, codigo })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('actor', JSON.stringify(data.actor));
            window.location.href = data.actor.is_admin ? 'admin.html' : (data.actor.is_casting ? 'casting.html' : 'perfil.html');
        } else {
            errorEl.textContent = data.error || 'Código incorrecto';
            errorEl.style.display = 'block';
            document.getElementById('totp_codigo').value = '';
            document.getElementById('totp_codigo').focus();
            this.textContent = 'Verificar código';
            this.disabled = false;
        }
    } catch {
        errorEl.textContent = 'Error de conexión';
        errorEl.style.display = 'block';
        this.textContent = 'Verificar código';
        this.disabled = false;
    }
});

// Permitir Enter en el campo de código
document.getElementById('totp_codigo').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('btn2FAVerificar').click();
});

document.querySelector('.forgot-password').addEventListener('click', function(e) {
    e.preventDefault();
    window.location.href = 'forgot-password.html';
});

// ==================== OAUTH ====================

const GOOGLE_CLIENT_ID = '373943641282-dg1r106dmjamupbfk75558mh9dukep83.apps.googleusercontent.com';
const MICROSOFT_CLIENT_ID = '8d2465ec-aa96-44c4-860f-5fd08696e89a';

async function manejarRespuestaOAuth(data) {
    localStorage.setItem('token', data.token);
    localStorage.setItem('actor', JSON.stringify(data.actor));
    if (data.actor.is_admin) {
        window.location.href = 'admin.html';
    } else if (data.actor.is_casting) {
        window.location.href = 'casting.html';
    } else if (data.perfil_completo) {
        window.location.href = 'perfil.html';
    } else {
        window.location.href = 'completar-perfil.html';
    }
}

// Google Sign-In con redirect nativo (sin dependencia de GSI One Tap)
document.getElementById('googleLogin').addEventListener('click', function() {
    const nonce = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    sessionStorage.setItem('google_nonce', nonce);
    sessionStorage.setItem('google_provider', 'google');
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        response_type: 'id_token',
        redirect_uri: window.location.origin + '/auth-redirect.html',
        scope: 'openid email profile',
        nonce: nonce,
        prompt: 'select_account'
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
});

// Microsoft Sign-In con PKCE nativo (sin MSAL)

async function generarPKCE() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const verifier = btoa(String.fromCharCode(...array))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return { verifier, challenge };
}

document.getElementById('microsoftLogin').addEventListener('click', async function() {
    try {
        const { verifier, challenge } = await generarPKCE();
        sessionStorage.setItem('ms_pkce_verifier', verifier);
        sessionStorage.setItem('ms_client_id', MICROSOFT_CLIENT_ID);

        const params = new URLSearchParams({
            client_id: MICROSOFT_CLIENT_ID,
            response_type: 'code',
            redirect_uri: window.location.origin + '/auth-redirect.html',
            scope: 'openid profile email User.Read',
            response_mode: 'query',
            code_challenge: challenge,
            code_challenge_method: 'S256'
        });

        window.location.href = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
    } catch (error) {
        console.error('Error Microsoft:', error);
        alert('Error al iniciar sesión con Microsoft');
    }
});
