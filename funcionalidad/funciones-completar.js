const API_URL = 'http://localhost:3000/api';

// Verificar autenticación
const token = localStorage.getItem('token');
if (!token) window.location.href = 'login.html';

// Navegación entre pasos
let currentStep = 1;

function showStep(step) {
    document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
    document.getElementById(`step${step}`).classList.add('active');
    document.querySelectorAll('.step').forEach((s, i) => {
        s.classList.toggle('completed', i + 1 < step);
        s.classList.toggle('active', i + 1 === step);
    });
    currentStep = step;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showMessage(message, isError = false) {
    const msg = document.getElementById('successMessage');
    msg.textContent = message;
    msg.style.background = isError ? '#ff4757' : '#2ecc71';
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 3000);
}

// Validaciones paso 1
function validateStep1() {
    const telefono = document.getElementById('telefono').value.replace(/\s/g, '');
    const telefonoError = document.getElementById('telefonoError');
    if (!/^[0-9]{10}$/.test(telefono)) {
        document.getElementById('telefono').classList.add('error');
        telefonoError.classList.add('show');
        return false;
    }
    document.getElementById('telefono').classList.remove('error');
    telefonoError.classList.remove('show');
    return true;
}

// Límite de caracteres en biografía
document.getElementById('biografia').addEventListener('input', function() {
    if (this.value.length > 500) this.value = this.value.substring(0, 500);
    this.parentElement.querySelector('small').textContent = `${this.value.length}/500 caracteres`;
});

// Botones de navegación
document.getElementById('btnNext1').addEventListener('click', () => {
    if (validateStep1()) showStep(2);
});
document.getElementById('btnBack2').addEventListener('click', () => showStep(1));
document.getElementById('btnNext2').addEventListener('click', () => showStep(3));
document.getElementById('btnBack3').addEventListener('click', () => showStep(2));

// Envío del formulario
document.getElementById('completarForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const btn = document.querySelector('.btn-registro');
    btn.textContent = 'Guardando...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/perfil`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                nombre: JSON.parse(localStorage.getItem('actor') || '{}').nombre || '',
                telefono: document.getElementById('telefono').value.replace(/\s/g, ''),
                fecha_nacimiento: document.getElementById('fechaNacimiento').value || null,
                genero: document.getElementById('genero').value || null,
                altura: document.getElementById('altura').value || null,
                peso: document.getElementById('peso').value || null,
                color_ojos: document.getElementById('colorOjos').value || null,
                color_cabello: document.getElementById('colorCabello').value || null,
                biografia: document.getElementById('biografia').value || null,
                experiencia: document.getElementById('experiencia').value || null,
                habilidades: document.getElementById('habilidades').value || null
            })
        });

        if (response.ok) {
            showMessage('¡Perfil completado! Redirigiendo...');
            setTimeout(() => window.location.href = 'perfil.html', 1500);
        } else {
            const data = await response.json();
            showMessage(data.error || 'Error al guardar el perfil', true);
            btn.textContent = 'Completar Perfil';
            btn.disabled = false;
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage('Error de conexión', true);
        btn.textContent = 'Completar Perfil';
        btn.disabled = false;
    }
});
