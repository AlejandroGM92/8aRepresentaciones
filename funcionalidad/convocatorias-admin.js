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
            ? `<div class="conv-fecha-limite">Fecha límite: ${new Date(c.fecha_limite.split('T')[0] + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}</div>`
            : '';
        const titulo = (c.titulo || '').replace(/</g, '&lt;');
        const desc = (c.descripcion || '').replace(/</g, '&lt;');
        const req = (c.requisitos || '').replace(/</g, '&lt;');

        return `
        <div class="conv-card ${c.estado}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
                <p class="conv-titulo">${titulo}</p>
                <span class="conv-badge ${badges[c.estado]}">${labels[c.estado]}</span>
            </div>
            <div class="conv-meta">${fecha}</div>
            ${fechaLimite}
            ${desc ? `<p class="conv-desc">${desc}</p>` : ''}
            ${req ? `<div class="conv-req"><strong>Requisitos:</strong><br>${req}</div>` : ''}
            <div class="conv-actions">
                ${c.estado === 'borrador' ? `<button class="btn-sm btn-publicar" onclick="pedirPublicar(${c.id})">📢 Publicar y notificar</button>` : ''}
                ${c.estado === 'publicada' ? `<button class="btn-sm btn-cerrar-conv" onclick="cerrarConvocatoria(${c.id})">Cerrar convocatoria</button>` : ''}
                ${c.estado !== 'cerrada' ? `<button class="btn-sm btn-editar-conv" onclick="abrirEditar(${c.id})">Editar</button>` : ''}
                <button class="btn-sm" style="background:#555;color:#fff" onclick="verPostulaciones(${c.id}, '${titulo.replace(/'/g, "\\'")}')">Ver postulaciones</button>
                <button class="btn-sm btn-eliminar-conv" onclick="pedirEliminar(${c.id}, '${titulo.replace(/'/g, "\\'")}')">Eliminar</button>
            </div>
        </div>`;
    }).join('');
}

// ==================== PERSONAJES ====================

function renderPersonajesForm(personajes = []) {
    const cont = document.getElementById('listaPersonajesForm');
    if (personajes.length === 0) {
        cont.innerHTML = '<p style="font-size:13px;color:#bbb;margin:4px 0 8px">Sin personajes agregados.</p>';
        return;
    }
    cont.innerHTML = personajes.map((p, i) => `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px" id="pjRow${i}">
            <input type="text" value="${(p.nombre || '').replace(/"/g, '&quot;')}" placeholder="Nombre del personaje"
                style="flex:1;padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:13px"
                oninput="personajesActuales[${i}].nombre = this.value">
            <input type="text" value="${(p.descripcion || '').replace(/"/g, '&quot;')}" placeholder="Descripción (opcional)"
                style="flex:1.5;padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:13px"
                oninput="personajesActuales[${i}].descripcion = this.value">
            <button type="button" style="background:#ff4757;color:#fff;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:13px"
                onclick="eliminarPersonajeForm(${i})">✕</button>
        </div>`).join('');
}

window.personajesActuales = [];

window.eliminarPersonajeForm = function(i) {
    personajesActuales.splice(i, 1);
    renderPersonajesForm(personajesActuales);
};

document.getElementById('btnAgregarPersonaje').addEventListener('click', () => {
    personajesActuales.push({ nombre: '', descripcion: '' });
    renderPersonajesForm(personajesActuales);
    // Enfocar el último input
    const inputs = document.querySelectorAll('#listaPersonajesForm input[type="text"]');
    if (inputs.length) inputs[inputs.length - 2].focus();
});

// ==================== CREAR / EDITAR ====================

document.getElementById('btnNuevaConv').addEventListener('click', () => {
    document.getElementById('convId').value = '';
    document.getElementById('convTitulo').value = '';
    document.getElementById('convDesc').value = '';
    document.getElementById('convReq').value = '';
    document.getElementById('convFecha').value = '';
    personajesActuales = [];
    renderPersonajesForm([]);
    document.getElementById('modalTitulo').textContent = 'Nueva Convocatoria';
    document.getElementById('modalOverlay').style.display = 'flex';
});

window.abrirEditar = async function(id) {
    const [resConv, resPj] = await Promise.all([
        fetch(`${API_URL}/admin/convocatorias`, { headers: { 'Authorization': `Bearer ${getToken()}` } }),
        fetch(`${API_URL}/convocatorias/${id}/personajes`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
    ]);
    const dataConv = await resConv.json();
    const dataPj = await resPj.json();
    const c = (dataConv.convocatorias || []).find(x => x.id === id);
    if (!c) return;

    document.getElementById('convId').value = c.id;
    document.getElementById('convTitulo').value = c.titulo || '';
    document.getElementById('convDesc').value = c.descripcion || '';
    document.getElementById('convReq').value = c.requisitos || '';
    document.getElementById('convFecha').value = c.fecha_limite ? c.fecha_limite.split('T')[0] : '';
    personajesActuales = (dataPj.personajes || []).map(p => ({ nombre: p.nombre, descripcion: p.descripcion || '' }));
    renderPersonajesForm(personajesActuales);
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
        requisitos: document.getElementById('convReq').value.trim(),
        fecha_limite: document.getElementById('convFecha').value || null
    };

    const url = id ? `${API_URL}/admin/convocatorias/${id}` : `${API_URL}/admin/convocatorias`;
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) { mostrarNotificacion(data.error || 'Error', 'error'); return; }

        const convId = id || data.id;

        // Guardar personajes
        const personajesValidos = personajesActuales.filter(p => p.nombre && p.nombre.trim());
        await fetch(`${API_URL}/admin/convocatorias/${convId}/personajes`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ personajes: personajesValidos })
        });

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
    const notificar = document.getElementById('chkNotificarActores').checked;
    document.getElementById('publicarOverlay').style.display = 'none';
    try {
        const res = await fetch(`${API_URL}/admin/convocatorias/${convAPublicar}/publicar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify({ notificar })
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

// ==================== POSTULACIONES ====================

let convPostulacionesId = null;

window.verPostulaciones = async function(id, titulo) {
    convPostulacionesId = id;
    document.getElementById('postulacionesTitulo').textContent = `Postulaciones: ${titulo}`;
    document.getElementById('listaPostulaciones').innerHTML = '<p style="color:#aaa;text-align:center;padding:20px">Cargando...</p>';
    document.getElementById('postulacionesOverlay').style.display = 'flex';

    try {
        const res = await fetch(`${API_URL}/admin/convocatorias/${id}/postulaciones`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();
        const lista = data.postulaciones || [];

        if (lista.length === 0) {
            document.getElementById('listaPostulaciones').innerHTML =
                '<p style="color:#aaa;text-align:center;padding:20px">Aún no hay postulaciones para esta convocatoria.</p>';
            return;
        }

        // Agrupar por personaje
        const porPersonaje = {};
        lista.forEach(p => {
            if (!porPersonaje[p.personaje]) porPersonaje[p.personaje] = [];
            porPersonaje[p.personaje].push(p);
        });

        document.getElementById('listaPostulaciones').innerHTML = Object.entries(porPersonaje).map(([personaje, actores]) => `
            <div style="margin-bottom:18px">
                <h4 style="margin:0 0 8px;color:#910909;font-size:14px;text-transform:uppercase;letter-spacing:.5px">
                    ${personaje.replace(/</g, '&lt;')} <span style="color:#aaa;font-weight:400">(${actores.length})</span>
                </h4>
                <table style="width:100%;border-collapse:collapse;font-size:13px">
                    <thead>
                        <tr style="background:#fafafa">
                            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #eee">Actor</th>
                            <th style="padding:8px 10px;text-align:center;border-bottom:1px solid #eee">Edad</th>
                            <th style="padding:8px 10px;text-align:center;border-bottom:1px solid #eee">Estatura</th>
                            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #eee">Ciudad / País</th>
                            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #eee">Manager</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${actores.map(a => `
                        <tr style="border-bottom:1px solid #f5f5f5">
                            <td style="padding:8px 10px">${(a.actor || '').replace(/</g, '&lt;')}</td>
                            <td style="padding:8px 10px;text-align:center">${a.edad != null ? a.edad + ' años' : '—'}</td>
                            <td style="padding:8px 10px;text-align:center">${a.altura ? a.altura + ' cm' : '—'}</td>
                            <td style="padding:8px 10px">${[a.ciudad_nacimiento, a.pais_nacimiento].filter(Boolean).join(', ') || '—'}</td>
                            <td style="padding:8px 10px">${a.tiene_manager ? (a.nombre_manager ? (a.nombre_manager).replace(/</g, '&lt;') : 'Sí') : 'No'}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`).join('');
    } catch {
        document.getElementById('listaPostulaciones').innerHTML = '<p style="color:#aaa;text-align:center">Error de conexión.</p>';
    }
};

window.cerrarPostulaciones = function() {
    document.getElementById('postulacionesOverlay').style.display = 'none';
    convPostulacionesId = null;
};
document.getElementById('postulacionesOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) cerrarPostulaciones(); });

document.getElementById('btnDescargarPostulaciones').addEventListener('click', async () => {
    if (!convPostulacionesId) return;
    const token = getToken();
    try {
        const res = await fetch(`${API_URL}/admin/convocatorias/${convPostulacionesId}/postulaciones/excel`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) { mostrarNotificacion('Error al generar Excel', 'error'); return; }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `postulaciones_convocatoria_${convPostulacionesId}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    } catch { mostrarNotificacion('Error de conexión', 'error'); }
});

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
