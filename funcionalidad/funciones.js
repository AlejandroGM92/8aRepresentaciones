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
    alert('Recuperación de contraseña - Próximamente');
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

// Google Sign-In
window.handleGoogleCallback = async function(response) {
    try {
        const res = await fetch(`${API_URL}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: response.credential })
        });
        const data = await res.json();
        if (res.ok) {
            await manejarRespuestaOAuth(data);
        } else {
            alert(data.error || 'Error al iniciar sesión con Google');
        }
    } catch (error) {
        alert('Error de conexión con Google');
    }
};

document.getElementById('googleLogin').addEventListener('click', function() {
    if (typeof google === 'undefined' || !google.accounts) {
        return alert('La librería de Google no cargó. Verifica tu conexión a internet e intenta de nuevo.');
    }
    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: window.handleGoogleCallback
    });
    google.accounts.id.prompt();
});

// Microsoft Sign-In
let msalInstance;

let msalReady = false;

async function getMsalInstance() {
    if (msalInstance) return msalInstance;
    if (typeof msal === 'undefined') return null;
    msalInstance = new msal.PublicClientApplication({
        auth: {
            clientId: MICROSOFT_CLIENT_ID,
            authority: 'https://login.microsoftonline.com/common',
            redirectUri: window.location.origin + '/auth-redirect.html'
        }
    });
    // Limpiar cualquier interacción pendiente de sesiones anteriores
    if (!msalReady) {
        await msalInstance.handleRedirectPromise().catch(() => {});
        msalReady = true;
    }
    return msalInstance;
}

document.getElementById('microsoftLogin').addEventListener('click', async function() {
    const instance = await getMsalInstance();
    if (!instance) return alert('La librería de Microsoft no cargó. Verifica tu conexión a internet e intenta de nuevo.');
    try {
        const loginResponse = await instance.loginPopup({ scopes: ['user.read'] });
        const tokenResponse = await instance.acquireTokenSilent({
            scopes: ['user.read'],
            account: loginResponse.account
        });
        const res = await fetch(`${API_URL}/auth/microsoft`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tokenResponse.accessToken })
        });
        const data = await res.json();
        if (res.ok) {
            await manejarRespuestaOAuth(data);
        } else {
            alert(data.error || 'Error al iniciar sesión con Microsoft');
        }
    } catch (error) {
        console.error('Error Microsoft:', error);
        if (error.errorCode !== 'user_cancelled') {
            alert('Error al iniciar sesión con Microsoft');
        }
    }
});
