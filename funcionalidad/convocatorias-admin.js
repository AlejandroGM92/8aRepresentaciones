const API_URL = '/api';

function getToken() { return localStorage.getItem('token'); }

function mostrarNotificacion(mensaje, tipo = 'success') {
    const n = document.getElementById('notification');
    n.textContent = mensaje;
    n.className = `notification ${tipo} show`;
    setTimeout(() => n.classList.remove('show'), 3500);
}

function verificarAdmin() {
    const actor = JSON.parse(localStorage.getItem('actor') || '{}');
    if (!getToken() || !actor.is_admin) { window.location.href = 'login.html'; return false; }
    return true;
}

// ==================== CARGA ====================

async function cargarConvocatorias() {
    const res = await fetch(`${API_URL}/admin/convocatorias`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (res.status === 403) { window.location.href = 'login.html'; return; }
    const data = await res.json();
    renderConvocatorias(data.convocatorias || []);
}

function renderConvocatorias(lista) {
    const cont = document.getElementById('listaConvocatorias');
    if (lista.length === 0) {
        cont.innerHTML = '<div class="empty-conv">No hay convocatorias aún. Crea la primera con el botón de arriba.</div>';
        return;
    }
    cont.innerHTML = lista.map(c => {
        const badges = { publicada: 'badge-publicada', borrador: 'badge-borrador', cerrada: 'badge-cerrada' };
        const labels = { publicada: 'Publicada', borrador: 'Borrador', cerrada: 'Cerrada' };
        const fecha = c.fecha_publicacion
            ? `Publicada: ${new Date(c.fecha_publicacion).toLocaleDateString('es-CO')}`
            : `Creada: ${new Date(c.fecha_creacion).toLocaleDateString('es-CO')}`;
        const fechaLimite = c.fecha_limite
            ? `<div class="conv-fecha-limite">Fecha límite: ${new Date(c.fecha_limite + 'T00:00:00').toLocaleDateString('es-CO', {day:'2-digit',month:'long',year:'numeric'})}</div>`
            : '';
        const titulo = (c.titulo || '').replace(/</g, '&lt;');
        const desc = (c.descripcion || '').replace(/</g, '&lt;');
        const req  = (c.requisitos || '').replace(/</g, '&lt;');

        return `
        <div class="conv-card ${c.estado}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
                <p class="conv-titulo">${titulo}</p>
                <span class="conv-badge ${badges[c.estado]}">${labels[c.estado]}</span>
            </div>
            <div class="conv-meta">${fecha}</div>
            ${fechaLimite}
            ${desc ? `<p class="conv-desc">${desc}</p>` : ''}
            ${req  ? `<div class="conv-req"><strong>Requisitos:</strong><br>${req}</div>` : ''}
            <div class="conv-actions">
                ${c.estado === 'borrador' ? `<button class="btn-sm btn-publicar" onclick="pedirPublicar(${c.id})">📢 Publicar y notificar</button>` : ''}
                ${c.estado === 'publicada' ? `<button class="btn-sm btn-cerrar-conv" onclick="cerrarConvocatoria(${c.id})">Cerrar convocatoria</button>` : ''}
                ${c.estado !== 'cerrada' ? `<button class="btn-sm btn-editar-conv" onclick="abrirEditar(${c.id})">Editar</button>` : ''}
                <button class="btn-sm btn-eliminar-conv" onclick="pedirEliminar(${c.id}, '${titulo.replace(/'/g,"\\'")}')">Eliminar</button>
            </div>
        </div>`;
    }).join('');
}

// ==================== CREAR / EDITAR ====================

document.getElementById('btnNuevaConv').addEventListener('click', () => {
    document.getElementById('convId').value = '';
    document.getElementById('convTitulo').value = '';
    document.getElementById('convDesc').value = '';
    document.getElementById('convReq').value = '';
    document.getElementById('convFecha').value = '';
    document.getElementById('modalTitulo').textContent = 'Nueva Convocatoria';
    document.getElementById('modalOverlay').style.display = 'flex';
});

window.abrirEditar = async function(id) {
    const res = await fetch(`${API_URL}/admin/convocatorias`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const data = await res.json();
    const c = (data.convocatorias || []).find(x => x.id === id);
    if (!c) return;
    document.getElementById('convId').value = c.id;
    document.getElementById('convTitulo').value = c.titulo || '';
    document.getElementById('convDesc').value = c.descripcion || '';
    document.getElementById('convReq').value = c.requisitos || '';
    document.getElementById('convFecha').value = c.fecha_limite ? c.fecha_limite.split('T')[0] : '';
    document.getElementById('modalTitulo').textContent = 'Editar Convocatoria';
    document.getElementById('modalOverlay').style.display = 'flex';
};

document.getElementById('btnGuardarConv').addEventListener('click', async () => {
    const id = document.getElementById('convId').value;
    const titulo = document.getElementById('convTitulo').value.trim();
    if (!titulo) { mostrarNotificacion('El título es requerido', 'error'); return; }

    const body = {
        titulo,
        descripcion: document.getElementById('convDesc').value.trim(),
        requisitos:  document.getElementById('convReq').value.trim(),
        fecha_limite: document.getElementById('convFecha').value || null
    };

    const url    = id ? `${API_URL}/admin/convocatorias/${id}` : `${API_URL}/admin/convocatorias`;
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) { mostrarNotificacion(data.error || 'Error', 'error'); return; }
        mostrarNotificacion(id ? 'Convocatoria actualizada' : 'Convocatoria guardada como borrador');
        cerrarModal();
        cargarConvocatorias();
    } catch { mostrarNotificacion('Error de conexión', 'error'); }
});

window.cerrarModal = function() {
    document.getElementById('modalOverlay').style.display = 'none';
};
document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) cerrarModal(); });

// ==================== PUBLICAR ====================

let convAPublicar = null;

window.pedirPublicar = function(id) {
    convAPublicar = id;
    document.getElementById('publicarOverlay').style.display = 'flex';
};

document.getElementById('btnConfirmarPublicar').addEventListener('click', async () => {
    if (!convAPublicar) return;
    document.getElementById('publicarOverlay').style.display = 'none';
    try {
        const res = await fetch(`${API_URL}/admin/convocatorias/${convAPublicar}/publicar`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();
        if (!res.ok) { mostrarNotificacion(data.error || 'Error', 'error'); return; }
        mostrarNotificacion(data.mensaje);
        cargarConvocatorias();
    } catch { mostrarNotificacion('Error de conexión', 'error'); }
    convAPublicar = null;
});

document.getElementById('btnCancelarPublicar').addEventListener('click', () => {
    document.getElementById('publicarOverlay').style.display = 'none';
    convAPublicar = null;
});

// ==================== CERRAR ====================

window.cerrarConvocatoria = async function(id) {
    try {
        const res = await fetch(`${API_URL}/admin/convocatorias/${id}/cerrar`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();
        if (!res.ok) { mostrarNotificacion(data.error || 'Error', 'error'); return; }
        mostrarNotificacion('Convocatoria cerrada');
        cargarConvocatorias();
    } catch { mostrarNotificacion('Error de conexión', 'error'); }
};

// ==================== ELIMINAR ====================

let convAEliminar = null;

window.pedirEliminar = function(id, titulo) {
    convAEliminar = id;
    document.getElementById('deleteNombreConv').textContent = titulo;
    document.getElementById('deleteOverlay').style.display = 'flex';
};

document.getElementById('btnConfirmarDelete').addEventListener('click', async () => {
    if (!convAEliminar) return;
    document.getElementById('deleteOverlay').style.display = 'none';
    try {
        const res = await fetch(`${API_URL}/admin/convocatorias/${convAEliminar}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (res.ok) { mostrarNotificacion('Convocatoria eliminada'); cargarConvocatorias(); }
        else mostrarNotificacion('Error al eliminar', 'error');
    } catch { mostrarNotificacion('Error de conexión', 'error'); }
    convAEliminar = null;
});

document.getElementById('btnCancelarDelete').addEventListener('click', () => {
    document.getElementById('deleteOverlay').style.display = 'none';
    convAEliminar = null;
});

// ==================== LOGOUT ====================

document.getElementById('btnCerrarSesion').addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('logoutOverlay').style.display = 'flex';
});
document.getElementById('btnConfirmarLogout').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('actor');
    window.location.href = 'login.html';
});
document.getElementById('btnCancelarLogout').addEventListener('click', () => {
    document.getElementById('logoutOverlay').style.display = 'none';
});

// ==================== INIT ====================

window.addEventListener('DOMContentLoaded', () => {
    if (!verificarAdmin()) return;
    cargarConvocatorias();
});
