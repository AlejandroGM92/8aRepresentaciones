const API_URL = 'http://localhost:3000/api';

function mostrarNotificacion(mensaje, tipo = 'success') {
    const n = document.getElementById('notification');
    n.textContent = mensaje;
    n.className = `notification ${tipo} show`;
    setTimeout(() => n.classList.remove('show'), 4000);
}

// Leer token de la URL: ?token=XXXX
const params = new URLSearchParams(window.location.search);
const inviteToken = params.get('token') || '';

// Verificar token al cargar
async function verificarToken() {
    if (!inviteToken) {
        document.getElementById('estadoInvalido').style.display = 'block';
        return;
    }

    try {
        const res = await fetch(`${API_URL}/casting/verificar-token?token=${encodeURIComponent(inviteToken)}`);
        if (res.ok) {
            document.getElementById('formArea').style.display = 'block';
        } else {
            document.getElementById('estadoInvalido').style.display = 'block';
        }
    } catch {
        document.getElementById('estadoInvalido').style.display = 'block';
    }
}

// Registro
document.getElementById('formRegistro').addEventListener('submit', async function(e) {
    e.preventDefault();

    const nombre   = document.getElementById('nombre').value.trim();
    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmar = document.getElementById('confirmar').value;

    if (password !== confirmar) {
        mostrarNotificacion('Las contraseñas no coinciden', 'error');
        return;
    }

    const btn = document.getElementById('btnRegistrar');
    btn.disabled = true;
    btn.textContent = 'Creando cuenta';
    btn.classList.add('loading-dots');

    try {
        const res = await fetch(`${API_URL}/casting/registro`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, email, password, token: inviteToken })
        });
        const data = await res.json();

        if (res.ok) {
            document.getElementById('formArea').style.display = 'none';
            document.getElementById('estadoExito').style.display = 'block';
        } else {
            mostrarNotificacion(data.error || 'Error al crear la cuenta', 'error');
            btn.disabled = false;
            btn.textContent = 'Crear Cuenta';
            btn.classList.remove('loading-dots');
        }
    } catch {
        mostrarNotificacion('Error de conexión', 'error');
        btn.disabled = false;
        btn.textContent = 'Crear Cuenta';
        btn.classList.remove('loading-dots');
    }
});

// Iniciar
verificarToken();
