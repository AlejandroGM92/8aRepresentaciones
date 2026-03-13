const API_URL = '/api';

// Toggle visibilidad contraseña
document.getElementById('togglePassword').addEventListener('click', function() {
    const input = document.getElementById('password');
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    this.textContent = isPass ? '👁️‍🗨️' : '👁️';
});

document.getElementById('togglePasswordConfirm').addEventListener('click', function() {
    const input = document.getElementById('passwordConfirm');
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    this.textContent = isPass ? '👁️‍🗨️' : '👁️';
});

// Helpers de validación
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
    // Acepta formatos internacionales: +57 300 123 4567, 3001234567, +1 555 123-4567, etc.
    return /^\+?[\d\s\-\(\)]{7,20}$/.test(phone.trim());
}

function showError(input, errorEl) {
    input.classList.add('error');
    errorEl.classList.add('show');
}

function hideError(input, errorEl) {
    input.classList.remove('error');
    errorEl.classList.remove('show');
}

function showMessage(msg, isError = false) {
    const el = document.getElementById('successMessage');
    el.textContent = msg;
    el.style.background = isError ? '#ff4757' : '#2ecc71';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3500);
}

// Validación en tiempo real
document.getElementById('nombre').addEventListener('blur', function() {
    this.value.trim() === ''
        ? showError(this, document.getElementById('nombreError'))
        : hideError(this, document.getElementById('nombreError'));
});

document.getElementById('email').addEventListener('blur', function() {
    validateEmail(this.value)
        ? hideError(this, document.getElementById('emailError'))
        : showError(this, document.getElementById('emailError'));
});

document.getElementById('telefono').addEventListener('blur', function() {
    validatePhone(this.value)
        ? hideError(this, document.getElementById('telefonoError'))
        : showError(this, document.getElementById('telefonoError'));
});

document.getElementById('password').addEventListener('input', function() {
    if (this.value.length >= 6) hideError(this, document.getElementById('passwordError'));
});

document.getElementById('passwordConfirm').addEventListener('input', function() {
    const pass = document.getElementById('password').value;
    if (this.value === pass && this.value.length >= 6)
        hideError(this, document.getElementById('passwordConfirmError'));
});

document.getElementById('aceptoTerminos').addEventListener('change', function() {
    if (this.checked) document.getElementById('terminosError').classList.remove('show');
});

// Términos y condiciones
document.querySelector('.link-terminos').addEventListener('click', function(e) {
    e.preventDefault();
    alert('Términos y Condiciones de 8a Representaciones\n\n' +
          '1. Acepto proporcionar información veraz y actualizada.\n' +
          '2. Autorizo el uso de mis fotos y datos para fines de representación artística.\n' +
          '3. Comprendo que 8a Representaciones puede contactarme para oportunidades laborales.\n' +
          '4. Acepto mantener mi perfil actualizado con información precisa.\n' +
          '5. Respeto los derechos de autor de todo el material que comparto.\n\n' +
          'Para más información, contáctanos.');
});

// Envío del formulario
document.getElementById('registroForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const nombre   = document.getElementById('nombre');
    const email    = document.getElementById('email');
    const telefono = document.getElementById('telefono');
    const password = document.getElementById('password');
    const passwordConfirm = document.getElementById('passwordConfirm');
    const terminos = document.getElementById('aceptoTerminos');

    let valid = true;

    if (!nombre.value.trim()) {
        showError(nombre, document.getElementById('nombreError'));
        valid = false;
    } else hideError(nombre, document.getElementById('nombreError'));

    if (!validateEmail(email.value)) {
        showError(email, document.getElementById('emailError'));
        valid = false;
    } else hideError(email, document.getElementById('emailError'));

    if (!validatePhone(telefono.value)) {
        showError(telefono, document.getElementById('telefonoError'));
        valid = false;
    } else hideError(telefono, document.getElementById('telefonoError'));

    if (password.value.length < 6) {
        showError(password, document.getElementById('passwordError'));
        valid = false;
    } else hideError(password, document.getElementById('passwordError'));

    if (passwordConfirm.value !== password.value || passwordConfirm.value.length < 6) {
        showError(passwordConfirm, document.getElementById('passwordConfirmError'));
        valid = false;
    } else hideError(passwordConfirm, document.getElementById('passwordConfirmError'));

    if (!terminos.checked) {
        document.getElementById('terminosError').classList.add('show');
        valid = false;
    } else {
        document.getElementById('terminosError').classList.remove('show');
    }

    if (!valid) return;

    const btn = document.querySelector('.btn-registro');
    btn.textContent = 'Registrando...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/registro`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre:   nombre.value.trim(),
                email:    email.value.trim(),
                telefono: telefono.value.replace(/\s/g, ''),
                password: password.value
            })
        });

        const data = await res.json();

        if (res.ok) {
            showMessage('¡Registro exitoso! Redirigiendo al login...', false);
            setTimeout(() => { window.location.href = 'login.html'; }, 2000);
        } else {
            showMessage(data.error || 'Error al registrar', true);
            btn.textContent = 'Crear Cuenta';
            btn.disabled = false;
        }
    } catch {
        showMessage('Error de conexión. Por favor intenta de nuevo.', true);
        btn.textContent = 'Crear Cuenta';
        btn.disabled = false;
    }
});
