const API_URL = '/api';

const TIPOS_EXP = {
    television: 'Televisión', cine: 'Cine', teatro: 'Teatro',
    serie: 'Serie', comercial: 'Comercial', otra: 'Otra'
};

const IDIOMAS_LISTA = ['Español','Inglés','Francés','Alemán','Italiano','Portugués','Chino','Japonés','Árabe','Ruso','Coreano','Otro'];
const NIVELES_LISTA = [
    { v: 'A1', l: 'A1 - Principiante' }, { v: 'A2', l: 'A2 - Elemental' },
    { v: 'B1', l: 'B1 - Intermedio' },   { v: 'B2', l: 'B2 - Intermedio Alto' },
    { v: 'C1', l: 'C1 - Avanzado' },     { v: 'C2', l: 'C2 - Dominio' }
];

// ==================== HELPERS ====================

function getToken() { return localStorage.getItem('token'); }

function parseJSON(str, fallback) {
    try { return JSON.parse(str || '') || fallback; }
    catch { return fallback; }
}

// Escapa HTML para evitar XSS al insertar datos en innerHTML
function esc(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Valida que una URL sea http/https antes de usarla en href
function safeUrl(url) {
    if (!url) return '#';
    try {
        const u = new URL(url);
        return (u.protocol === 'http:' || u.protocol === 'https:') ? url : '#';
    } catch { return '#'; }
}

function mostrarNotificacion(mensaje, tipo = 'success') {
    const n = document.getElementById('notification');
    n.textContent = mensaje;
    n.className = `notification ${tipo} show`;
    setTimeout(() => n.classList.remove('show'), 3000);
}

function fotoSrc(foto) {
    return foto
        ? foto
        : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='38' r='28' fill='%23ccc'/%3E%3Cellipse cx='50' cy='100' rx='45' ry='32' fill='%23ccc'/%3E%3C/svg%3E";
}

function estaNoDisponibleHoy(actor) {
    const hoy = new Date().toISOString().split('T')[0];
    const fechas = parseJSON(actor.fechas_no_disponibles, []);
    return fechas.some(f => f.inicio && f.fin && hoy >= f.inicio && hoy <= f.fin);
}

// ==================== AUTH ====================

function verificarAdmin() {
    const actor = parseJSON(localStorage.getItem('actor'), {});
    const token = getToken();
    if (!token || !actor.is_admin) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// ==================== FILTROS ====================

let filtroFechasActivo = false;

function getFiltros() {
    return {
        nombre:           document.getElementById('filtroNombre').value.trim(),
        habilidades:      document.getElementById('filtroHabilidades').value.trim(),
        idioma:           document.getElementById('filtroIdioma').value,
        nivel_idioma:     document.getElementById('filtroNivelIdioma').value,
        anios_exp:        document.getElementById('filtroAniosExp').value,
        edad_min:         document.getElementById('filtroEdadMin').value,
        edad_max:         document.getElementById('filtroEdadMax').value,
        altura_min:       document.getElementById('filtroAlturaMin').value,
        altura_max:       document.getElementById('filtroAlturaMax').value,
        color_ojos:       document.getElementById('filtroColorOjos').value.trim(),
        color_cabello:    document.getElementById('filtroColorCabello').value.trim(),
        escenas_sexo:     document.getElementById('filtroEscenasSexo').value,
        desnudos:         document.getElementById('filtroDesnudos').value,
        edad_aparente:    document.getElementById('filtroEdadAparente').value,
        pais_nacimiento:  document.getElementById('filtroPais').value,
        ciudad_nacimiento: document.getElementById('filtroCiudad').value.trim(),
        acento:           document.getElementById('filtroAcento').value,
        portafolio:       document.getElementById('filtroPortafolio').value,
    };
}

// ==================== CARGA ====================

async function cargarActores(filtros = {}) {
    const token = getToken();
    const params = new URLSearchParams();
    // Solo enviar al servidor los filtros que maneja SQL (no los client-side)
    const serverKeys = ['nombre','habilidades','idioma','nivel_idioma','anios_exp',
                        'edad_min','edad_max','altura_min','altura_max',
                        'color_ojos','color_cabello','escenas_sexo','desnudos',
                        'pais_nacimiento','ciudad_nacimiento','portafolio'];
    serverKeys.forEach(k => { if (filtros[k]) params.append(k, filtros[k]); });
    try {
        const res = await fetch(`${API_URL}/admin/actores?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 403) { window.location.href = 'login.html'; return []; }
        const data = await res.json();
        let actores = data.actores || [];

        // Filtro client-side: edad aparente (actor puede hacer personaje de X años)
        const edadAparente = parseInt(filtros.edad_aparente);
        if (edadAparente) {
            actores = actores.filter(a => {
                const min = a.edad_aparente_min;
                const max = a.edad_aparente_max;
                if (!min && !max) return true; // sin rango definido → mostrar siempre
                const eMin = min || 0;
                const eMax = max || 999;
                return edadAparente >= eMin && edadAparente <= eMax;
            });
        }

        // Filtro client-side: acento que maneja
        if (filtros.acento) {
            actores = actores.filter(a => {
                try {
                    const acentos = JSON.parse(a.acentos_maneja || '[]');
                    return acentos.includes(filtros.acento);
                } catch { return false; }
            });
        }

        // Filtro client-side: ocultar actores no disponibles hoy (solo cuando se filtra)
        if (filtroFechasActivo) {
            actores = actores.filter(a => !estaNoDisponibleHoy(a));
        }

        return actores;
    } catch {
        mostrarNotificacion('Error de conexión', 'error');
        return [];
    }
}

// ==================== RENDER ACTORES ====================

function renderActores(actores) {
    const grid = document.getElementById('actoresGrid');
    const contador = document.getElementById('contadorActores');
    const n = actores.length;
    const sufijo = filtroFechasActivo ? ' · disponibles hoy' : '';
    contador.textContent = `${n} actor${n !== 1 ? 'es' : ''} encontrado${n !== 1 ? 's' : ''}${sufijo}`;

    if (n === 0) {
        grid.innerHTML = '<div class="empty-actors">No se encontraron actores con los filtros aplicados.</div>';
        return;
    }

    grid.innerHTML = actores.map(a => {
        const edad = a.edad != null ? `${a.edad} años` : '';
        const edadAp = (a.edad_aparente_min && a.edad_aparente_max)
            ? `Aparenta ${a.edad_aparente_min}–${a.edad_aparente_max} años` : '';
        const idiomasArr = parseJSON(a.idiomas, []).map(i => i.idioma).filter(Boolean);
        const habArr = (() => {
            try {
                const h = JSON.parse(a.habilidades || '[]');
                return Array.isArray(h) ? h : (a.habilidades ? [a.habilidades] : []);
            } catch { return a.habilidades ? [a.habilidades] : []; }
        })();
        const nombre = esc(a.nombre || '');
        const fisico = [a.altura ? a.altura + ' cm' : null, a.color_ojos ? esc(a.color_ojos) : null].filter(Boolean);
        const portafolioBadge = a.portafolio === 'paola_ochoa'
            ? '<span style="display:inline-block;margin:4px 0 0;padding:2px 8px;border-radius:20px;background:#6a0dad;color:#fff;font-size:10px;font-weight:600">Paola Ochoa</span>'
            : a.portafolio === '8a_representaciones'
            ? '<span style="display:inline-block;margin:4px 0 0;padding:2px 8px;border-radius:20px;background:#910909;color:#fff;font-size:10px;font-weight:600">8a Representaciones</span>'
            : '<span style="display:inline-block;margin:4px 0 0;padding:2px 8px;border-radius:20px;background:#444;color:#fff;font-size:10px;font-weight:600">Ambos portafolios</span>';

        const fechasND = parseJSON(a.fechas_no_disponibles, []);
        const hoy = new Date().toISOString().split('T')[0];
        const noDisponibleHoy = fechasND.some(f => {
            const ini = f.inicio || f.desde || '';
            const fin = f.fin || f.hasta || '';
            return ini && fin && hoy >= ini && hoy <= fin;
        });
        const fechasNDHTML = fechasND.length
            ? `<div style="margin-top:6px;font-size:11px;color:#666">
                <span style="font-weight:600;color:#555">No disponible:</span>
                ${fechasND.map(f => {
                    const ini = f.inicio || f.desde || '';
                    const fin = f.fin || f.hasta || '';
                    const activa = ini && fin && hoy >= ini && hoy <= fin;
                    return `<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;border-radius:20px;background:${activa ? '#ffe0e0' : '#f0f0f0'};color:${activa ? '#910909' : '#777'}">${ini} → ${fin}</span>`;
                }).join('')}
              </div>`
            : '';

        return `
        <div class="actor-card">
            <div class="actor-photo">
                <img src="${fotoSrc(a.foto_perfil)}" alt="${nombre}" onerror="this.src='${fotoSrc(null)}'">
                ${a.is_admin ? '<span class="admin-badge">Admin</span>' : a.is_casting ? '<span class="admin-badge" style="background:#1a6fb5">Dir. Casting</span>' : '<span class="admin-badge" style="background:#555">Artista</span>'}
                ${noDisponibleHoy ? '<span class="admin-badge" style="background:#910909;top:auto;bottom:6px">No disponible</span>' : ''}
            </div>
            <div class="actor-body">
                <h3 class="actor-name">${nombre || '—'}</h3>
                ${portafolioBadge}
                ${edad ? `<p class="actor-age">${edad}${edadAp ? ' · ' + edadAp : ''}</p>` : (edadAp ? `<p class="actor-age">${edadAp}</p>` : '')}
                <p class="actor-email">${esc(a.email)}</p>
                ${fisico.length ? `<div class="actor-tags">${fisico.map(t => `<span class="tag tag-talla">${t}</span>`).join('')}</div>` : ''}
                ${idiomasArr.length ? `<div class="actor-tags">${idiomasArr.slice(0,3).map(i => `<span class="tag tag-idioma">${esc(i)}</span>`).join('')}</div>` : ''}
                ${habArr.length ? `<div class="actor-tags">${habArr.slice(0,2).map(h => `<span class="tag tag-exp">${esc(h)}</span>`).join('')}</div>` : ''}
                ${fechasNDHTML}
            </div>
            <div class="actor-actions">
                <button class="btn-action btn-view" onclick="verActor(${a.id})">Ver</button>
                <button class="btn-action btn-edit" onclick="irEditarActor(${a.id})">Editar</button>
                <button class="btn-action btn-delete" onclick="confirmarEliminar(${a.id}, ${JSON.stringify(a.nombre || '')})">Eliminar</button>
            </div>
        </div>`;
    }).join('');
}

// ==================== VER ACTOR ====================

window.verActor = async function(id) {
    const token = getToken();
    try {
        const res = await fetch(`${API_URL}/admin/actores/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) { mostrarNotificacion(data.error || 'Error', 'error'); return; }
        mostrarModalVista(data.actor, data.fotos || []);
    } catch { mostrarNotificacion('Error de conexión', 'error'); }
};

function mostrarModalVista(a, fotos) {
    const edad = a.edad != null ? `${a.edad} años · ` : '';
    const idiomas = parseJSON(a.idiomas, []);
    const exps = parseJSON(a.experiencia, []);
    const formaciones = parseJSON(a.formacion_artistica, []);
    const redes = parseJSON(a.redes_sociales, {});
    const fecha = a.fecha_nacimiento ? a.fecha_nacimiento.split('T')[0] : '—';
    const edadAp = (a.edad_aparente_min && a.edad_aparente_max)
        ? `${a.edad_aparente_min} – ${a.edad_aparente_max} años` : '—';
    const habArr = (() => {
        try {
            const h = JSON.parse(a.habilidades || '[]');
            return Array.isArray(h) ? h : [];
        } catch { return a.habilidades ? [a.habilidades] : []; }
    })();

    document.getElementById('modalContent').innerHTML = `
        <div class="modal-header">
            <h2>Perfil del Actor</h2>
            <button class="btn-close-modal" onclick="cerrarModal()">✕</button>
        </div>
        <div class="modal-body">
            <div class="perfil-vista">
                <div class="perfil-vista-foto">
                    <img src="${fotoSrc(a.foto_perfil)}" alt="${esc(a.nombre)}" onerror="this.src='${fotoSrc(null)}'">
                </div>
                <div class="perfil-vista-info">
                    <h3>${esc(a.nombre) || '—'}</h3>
                    <p class="edad-email">${edad}${esc(a.email)}</p>
                    <div class="vista-tags">
                        ${a.is_admin ? '<span class="tag tag-exp">Admin</span>' : ''}
                        ${a.is_casting ? '<span class="tag tag-talla">Casting</span>' : ''}
                        ${a.genero ? `<span class="tag tag-talla">${esc(a.genero)}</span>` : ''}
                        ${a.portafolio === 'paola_ochoa' ? '<span class="tag" style="background:#6a0dad;color:#fff">Paola Ochoa</span>' : a.portafolio === '8a_representaciones' ? '<span class="tag" style="background:#910909;color:#fff">8a Representaciones</span>' : '<span class="tag" style="background:#444;color:#fff">Ambos portafolios</span>'}
                    </div>
                </div>
            </div>

            <div class="vista-section">
                <h4>Información Personal</h4>
                <div class="vista-grid">
                    <div class="vista-item"><label>Fecha Nac.</label><span>${esc(fecha)}</span></div>
                    <div class="vista-item"><label>Teléfono</label><span>${esc(a.telefono) || '—'}</span></div>
                    <div class="vista-item"><label>Altura</label><span>${a.altura ? a.altura + ' cm' : '—'}</span></div>
                    <div class="vista-item"><label>Peso</label><span>${a.peso ? a.peso + ' kg' : '—'}</span></div>
                    <div class="vista-item"><label>Ojos</label><span>${esc(a.color_ojos) || '—'}</span></div>
                    <div class="vista-item"><label>Cabello</label><span>${esc(a.color_cabello) || '—'}</span></div>
                    <div class="vista-item"><label>Edad aparente</label><span>${esc(edadAp)}</span></div>
                    <div class="vista-item"><label>Escenas sexo</label><span>${a.escenas_sexo === 1 ? 'Sí' : a.escenas_sexo === 0 ? 'No' : '—'}</span></div>
                    <div class="vista-item"><label>Desnudos</label><span>${a.desnudos === 1 ? 'Sí' : a.desnudos === 0 ? 'No' : '—'}</span></div>
                </div>
            </div>

            ${idiomas.length ? `
            <div class="vista-section">
                <h4>Idiomas</h4>
                <div class="vista-tags">
                    ${idiomas.map(i => `<span class="tag tag-idioma">${esc(i.idioma)}${i.nivel ? ' · ' + esc(i.nivel) : ''}</span>`).join('')}
                </div>
            </div>` : ''}

            ${habArr.length ? `
            <div class="vista-section">
                <h4>Habilidades</h4>
                <div class="vista-tags">${habArr.map(h => `<span class="tag tag-exp">${esc(h)}</span>`).join('')}</div>
            </div>` : ''}

            ${exps.length ? `
            <div class="vista-section">
                <h4>Experiencia Profesional</h4>
                ${exps.map(e => `
                    <div style="margin-bottom:8px;padding:10px;background:#fafafa;border-radius:8px;font-size:13px">
                        <strong>${esc(e.nombre) || '—'}</strong>
                        <span style="color:#910909;margin-left:8px">${esc(TIPOS_EXP[e.tipo] || e.tipo || '')}</span>
                    </div>`).join('')}
            </div>` : ''}

            ${formaciones.length ? `
            <div class="vista-section">
                <h4>Formación Artística</h4>
                ${formaciones.map(f => `
                    <div style="margin-bottom:8px;padding:10px;background:#fafafa;border-radius:8px;font-size:13px">
                        <strong>${esc(f.nombre) || '—'}</strong>
                    </div>`).join('')}
            </div>` : ''}

            ${(redes.facebook || redes.instagram || redes.tiktok || redes.imdb) ? `
            <div class="vista-section">
                <h4>Redes Sociales</h4>
                <div class="vista-tags">
                    ${redes.facebook  ? `<a href="${safeUrl(redes.facebook)}"  target="_blank" rel="noopener noreferrer" class="tag tag-talla">Facebook</a>`  : ''}
                    ${redes.instagram ? `<a href="${safeUrl(redes.instagram)}" target="_blank" rel="noopener noreferrer" class="tag tag-idioma">Instagram</a>` : ''}
                    ${redes.tiktok    ? `<a href="${safeUrl(redes.tiktok)}"    target="_blank" rel="noopener noreferrer" class="tag tag-exp">TikTok</a>`    : ''}
                    ${redes.imdb      ? `<a href="${safeUrl(redes.imdb)}"      target="_blank" rel="noopener noreferrer" class="tag tag-talla">IMDB</a>`      : ''}
                </div>
            </div>` : ''}

            ${a.biografia ? `
            <div class="vista-section">
                <h4>Biografía</h4>
                <p style="font-size:14px;color:#444;line-height:1.6">${esc(a.biografia)}</p>
            </div>` : ''}

            <div class="vista-section">
                <h4>Fotos <span style="font-size:12px;color:#999;font-weight:400">(${(fotos||[]).length}/5)</span></h4>
                <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">
                    ${a.foto_perfil ? `
                    <div style="position:relative;text-align:center">
                        <img src="${fotoSrc(a.foto_perfil)}" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:1px solid #eee" onerror="this.src='${fotoSrc(null)}'">
                        <div style="margin-top:4px">
                            <span style="font-size:10px;color:#aaa;display:block">Foto perfil</span>
                            <a href="/api/admin/actores/${a.id}/foto-perfil/download" download
                               style="font-size:11px;color:#910909;text-decoration:none;font-weight:600">⬇ Descargar</a>
                        </div>
                    </div>` : ''}
                    ${(fotos||[]).map((f, i) => `
                    <div style="position:relative;text-align:center">
                        <img src="${fotoSrc(f.url_foto)}" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:1px solid #eee" onerror="this.src='${fotoSrc(null)}'">
                        <div style="margin-top:4px">
                            <span style="font-size:10px;color:#aaa;display:block">Foto ${i + 1}</span>
                            <a href="/api/admin/actores/${a.id}/fotos/${f.id}/download" download
                               style="font-size:11px;color:#910909;text-decoration:none;font-weight:600">⬇ Descargar</a>
                        </div>
                    </div>`).join('')}
                    ${!a.foto_perfil && !(fotos||[]).length ? `<span style="color:#aaa;font-size:13px">Sin fotos subidas.</span>` : ''}
                </div>
            </div>
        </div>
            <div class="vista-section" id="seccionContratos_${a.id}">
                <h4>Contratos Firmados</h4>
                <div id="listaContratosAdmin_${a.id}"><span style="color:#aaa;font-size:13px">Cargando...</span></div>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn-secondary" onclick="cerrarModal()">Cerrar</button>
            <button class="btn-excel" onclick="descargarExcel(${a.id}, ${JSON.stringify(a.nombre||'actor')})">&#8595; Excel</button>
            <button class="btn-primary" onclick="irEditarActor(${a.id})">Editar Perfil Completo</button>
        </div>
    `;
    document.getElementById('modalOverlay').style.display = 'flex';

    // Cargar contratos del actor
    fetch(`${API_URL}/admin/actores/${a.id}/contratos`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
        .then(r => r.json())
        .then(data => {
            const cont = document.getElementById(`listaContratosAdmin_${a.id}`);
            if (!cont) return;
            if (!data.contratos || data.contratos.length === 0) {
                cont.innerHTML = '<span style="color:#aaa;font-size:13px">Sin contratos subidos.</span>';
                return;
            }
            cont.innerHTML = data.contratos.map(c => {
                const fecha = new Date(c.fecha_subida).toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' });
                return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#fafafa;border-radius:8px;margin-bottom:6px;font-size:13px">
                    <span>📄 ${(c.nombre_archivo || 'contrato.pdf').replace(/</g,'&lt;')}</span>
                    <span style="color:#aaa;font-size:11px;margin:0 12px">${fecha}</span>
                    <a href="${c.url_contrato}" target="_blank" download class="btn-action btn-view" style="padding:4px 12px;font-size:12px;text-decoration:none">⬇ Descargar</a>
                </div>`;
            }).join('');
        })
        .catch(() => {
            const cont = document.getElementById(`listaContratosAdmin_${a.id}`);
            if (cont) cont.innerHTML = '<span style="color:#aaa;font-size:13px">Error al cargar contratos.</span>';
        });
}

// ==================== EDITAR / CREAR ====================

window.irEditarActor = function(id) {
    window.location.href = `admin-actor-form.html?id=${id}`;
};

document.getElementById('btnCrearActor').addEventListener('click', () => {
    window.location.href = 'admin-actor-form.html';
});

// ==================== ELIMINAR ACTOR ====================

let actorAEliminar = null;

window.confirmarEliminar = function(id, nombre) {
    actorAEliminar = id;
    document.getElementById('deleteNombre').textContent = nombre;
    document.getElementById('deleteOverlay').style.display = 'flex';
};

document.getElementById('btnConfirmarEliminar').addEventListener('click', async () => {
    if (!actorAEliminar) return;
    const token = getToken();
    try {
        const res = await fetch(`${API_URL}/admin/actores/${actorAEliminar}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
            mostrarNotificacion('Actor eliminado', 'success');
            cerrarDeleteModal();
            const actores = await cargarActores(getFiltros());
            renderActores(actores);
        } else {
            mostrarNotificacion(data.error || 'Error al eliminar', 'error');
        }
    } catch { mostrarNotificacion('Error de conexión', 'error'); }
});

document.getElementById('btnCancelarEliminar').addEventListener('click', cerrarDeleteModal);

function cerrarDeleteModal() {
    actorAEliminar = null;
    document.getElementById('deleteOverlay').style.display = 'none';
}

// ==================== MODALS ====================

window.cerrarModal = function() {
    document.getElementById('modalOverlay').style.display = 'none';
};

window.descargarExcel = async function(id, nombre) {
    const token = getToken();
    try {
        const res = await fetch(`${API_URL}/admin/actores/${id}/excel`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) { mostrarNotificacion('Error al generar Excel', 'error'); return; }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `perfil_${nombre.replace(/\s+/g, '_')}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    } catch { mostrarNotificacion('Error de conexión', 'error'); }
};

document.getElementById('modalOverlay').addEventListener('click', function(e) {
    if (e.target === this) cerrarModal();
});

document.getElementById('deleteOverlay').addEventListener('click', function(e) {
    if (e.target === this) cerrarDeleteModal();
});

// ==================== NOTIFICACIONES ====================

async function cargarNotificaciones() {
    const token = getToken();
    try {
        const res = await fetch(`${API_URL}/admin/notificaciones`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        actualizarNotifUI(data.notificaciones || [], data.no_leidas || 0);
    } catch { /* silencioso */ }
}

function actualizarNotifUI(notifs, noLeidas) {
    const badge = document.getElementById('notifBadge');
    badge.textContent = noLeidas > 9 ? '9+' : noLeidas;
    badge.classList.toggle('visible', noLeidas > 0);

    const lista = document.getElementById('notifLista');
    if (notifs.length === 0) {
        lista.innerHTML = '<div class="notif-empty">Sin notificaciones</div>';
        return;
    }
    lista.innerHTML = notifs.slice(0, 50).map(n => {
        const fecha = new Date(n.fecha).toLocaleString('es-CO', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        return `
        <div class="notif-item ${n.leido ? '' : 'no-leida'}" data-id="${n.id}">
            <div class="notif-content">
                <div class="notif-nombre">${n.actor_nombre || 'Actor'}</div>
                <div class="notif-texto">${n.detalle || 'Actualizó su perfil'}</div>
                <div class="notif-fecha">${fecha}</div>
            </div>
            <button class="notif-borrar-item" title="Borrar notificación" data-id="${n.id}">✕</button>
        </div>`;
    }).join('');
}

document.getElementById('btnNotificaciones').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('notifPanel').classList.toggle('open');
});

document.getElementById('btnMarcarLeidas').addEventListener('click', async () => {
    const token = getToken();
    await fetch(`${API_URL}/admin/notificaciones/leer`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    document.getElementById('notifBadge').classList.remove('visible');
    document.getElementById('notifBadge').textContent = '';
    document.querySelectorAll('.notif-item.no-leida').forEach(el => el.classList.remove('no-leida'));
});

document.getElementById('btnBorrarLeidas').addEventListener('click', async () => {
    const token = getToken();
    const res = await fetch(`${API_URL}/admin/notificaciones/leidas/todas`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) await cargarNotificaciones();
});

// Borrar notificación individual con el botón X
document.getElementById('notifLista').addEventListener('click', async (e) => {
    const btn = e.target.closest('.notif-borrar-item');
    if (!btn) return;
    e.stopPropagation();
    const id = btn.dataset.id;
    const token = getToken();
    const res = await fetch(`${API_URL}/admin/notificaciones/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
        const item = document.querySelector(`.notif-item[data-id="${id}"]`);
        if (item) {
            const eraNoLeida = item.classList.contains('no-leida');
            item.remove();
            if (eraNoLeida) {
                const badge = document.getElementById('notifBadge');
                const actual = parseInt(badge.textContent) || 0;
                const nuevo = Math.max(0, actual - 1);
                badge.textContent = nuevo > 9 ? '9+' : nuevo || '';
                badge.classList.toggle('visible', nuevo > 0);
            }
            if (!document.querySelector('.notif-item')) {
                document.getElementById('notifLista').innerHTML = '<div class="notif-empty">Sin notificaciones</div>';
            }
        }
    }
});

document.addEventListener('click', (e) => {
    const panel = document.getElementById('notifPanel');
    const btn = document.getElementById('btnNotificaciones');
    if (!panel.contains(e.target) && !btn.contains(e.target)) {
        panel.classList.remove('open');
    }
});

// ==================== FORMULARIO FILTROS ====================

document.getElementById('formFiltros').addEventListener('submit', async function(e) {
    e.preventDefault();
    filtroFechasActivo = true;
    const actores = await cargarActores(getFiltros());
    renderActores(actores);
});

document.getElementById('btnLimpiarFiltros').addEventListener('click', async () => {
    document.getElementById('formFiltros').reset();
    document.getElementById('filtroCiudad').value = '';
    document.getElementById('filtroAcento').value = '';
    document.getElementById('filtroDesnudos').value = '';
    filtroFechasActivo = false;
    const actores = await cargarActores();
    renderActores(actores);
});

// ==================== LOGOUT ====================

document.getElementById('btnCerrarSesion').addEventListener('click', function(e) {
    e.preventDefault();
    document.getElementById('logoutOverlay').style.display = 'flex';
});

document.getElementById('btnConfirmarLogout').addEventListener('click', function() {
    localStorage.removeItem('token');
    localStorage.removeItem('actor');
    window.location.href = 'login.html';
});

document.getElementById('btnCancelarLogout').addEventListener('click', function() {
    document.getElementById('logoutOverlay').style.display = 'none';
});

document.getElementById('logoutOverlay').addEventListener('click', function(e) {
    if (e.target === this) this.style.display = 'none';
});

// ==================== SEGURIDAD / 2FA ADMIN ====================

async function cargar2FAStatusAdmin() {
    const res = await fetch(`${API_URL}/auth/2fa/status`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const data = await res.json();
    document.getElementById('adminSeccion2FADesactivado').style.display = data.totp_enabled ? 'none' : 'block';
    document.getElementById('adminSeccion2FAActivado').style.display = data.totp_enabled ? 'block' : 'none';
    document.getElementById('adminPaso2FAQr').style.display = 'none';
}

document.getElementById('btnSeguridad').addEventListener('click', async (e) => {
    e.preventDefault();
    document.getElementById('seguridadOverlay').style.display = 'flex';
    await cargar2FAStatusAdmin();
});

document.getElementById('btnCerrarSeguridad').addEventListener('click', () => {
    document.getElementById('seguridadOverlay').style.display = 'none';
});

document.getElementById('seguridadOverlay').addEventListener('click', function(e) {
    if (e.target === this) this.style.display = 'none';
});

document.getElementById('adminBtn2FAConfigurar').addEventListener('click', async () => {
    const res = await fetch(`${API_URL}/auth/2fa/setup`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const data = await res.json();

    document.getElementById('adminQr2FA').src = data.qr;
    document.getElementById('adminSecret2FA').textContent = data.secret;
    document.getElementById('adminCodigo2FAActivar').value = '';
    document.getElementById('adminError2FAActivar').style.display = 'none';

    const esMobil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (esMobil) {
        document.getElementById('adminQr2FA').style.display = 'none';
        document.getElementById('adminBotonesMobile').style.display = 'flex';
        document.getElementById('adminBtnGoogleAuth').href = data.otpauth_url;
        document.getElementById('adminBtnMicrosoftAuth').href = data.otpauth_url;
        document.getElementById('adminInstruccion2FATexto').innerHTML =
            'Toca el botón de tu app autenticadora para agregar la cuenta directamente. Luego vuelve aquí e ingresa el código que genera la app.';
    } else {
        document.getElementById('adminQr2FA').style.display = 'block';
        document.getElementById('adminBotonesMobile').style.display = 'none';
    }

    // Botón copiar clave
    document.getElementById('adminBtnCopiarSecret').addEventListener('click', function() {
        navigator.clipboard.writeText(data.secret).then(() => {
            this.textContent = '¡Copiado!';
            setTimeout(() => { this.textContent = 'Copiar'; }, 2000);
        });
    });

    document.getElementById('adminPaso2FAQr').style.display = 'block';
});

document.getElementById('adminBtnActivar2FA').addEventListener('click', async () => {
    const codigo = document.getElementById('adminCodigo2FAActivar').value.trim();
    const errorEl = document.getElementById('adminError2FAActivar');
    if (codigo.length !== 6) {
        errorEl.textContent = 'El código debe tener 6 dígitos';
        errorEl.style.display = 'block';
        return;
    }
    const res = await fetch(`${API_URL}/auth/2fa/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ codigo })
    });
    const data = await res.json();
    if (res.ok) {
        mostrarNotificacion('2FA activado correctamente', 'success');
        await cargar2FAStatusAdmin();
    } else {
        errorEl.textContent = data.error || 'Código incorrecto';
        errorEl.style.display = 'block';
    }
});

document.getElementById('adminBtnDesactivar2FA').addEventListener('click', async () => {
    const codigo = document.getElementById('adminCodigo2FADesactivar').value.trim();
    const errorEl = document.getElementById('adminError2FADesactivar');
    if (codigo.length !== 6) {
        errorEl.textContent = 'El código debe tener 6 dígitos';
        errorEl.style.display = 'block';
        return;
    }
    const res = await fetch(`${API_URL}/auth/2fa/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ codigo })
    });
    const data = await res.json();
    if (res.ok) {
        mostrarNotificacion('2FA desactivado', 'success');
        document.getElementById('adminCodigo2FADesactivar').value = '';
        await cargar2FAStatusAdmin();
    } else {
        errorEl.textContent = data.error || 'Código incorrecto';
        errorEl.style.display = 'block';
    }
});

// ==================== INIT ====================

window.addEventListener('DOMContentLoaded', async () => {
    if (!verificarAdmin()) return;
    const actores = await cargarActores();
    renderActores(actores);
    cargarNotificaciones();
    setInterval(cargarNotificaciones, 30000);
});

// ==================== HAMBURGER MENU ====================
const hamburgerBtn = document.getElementById('hamburgerBtn');
const navMenu = document.getElementById('navMenu');
if (hamburgerBtn && navMenu) {
    hamburgerBtn.addEventListener('click', e => {
        e.stopPropagation();
        navMenu.classList.toggle('open');
    });
    document.addEventListener('click', e => {
        if (!navMenu.contains(e.target) && e.target !== hamburgerBtn) {
            navMenu.classList.remove('open');
        }
    });
}
