const API_URL = '/api';

const HABILIDADES_LISTA = [
    'Canto','Baile','Presentación','Doblaje','Stunt de riesgo',
    'Combate escénico','Artes Marciales','Interpreta Instrumentos',
    'Manejo de Carro y Moto con Licencia','Maneja Carro con Licencia',
    'Maneja Moto con Licencia','Director','Monta a Caballo',
    'Nadar','Titiritero','Otro'
];
const IDIOMAS_LISTA = ['Español','Inglés','Francés','Alemán','Italiano','Portugués','Chino','Japonés','Árabe','Ruso','Coreano','Otro'];
const NIVELES_LISTA = [
    {v:'A1',l:'A1 - Principiante'},{v:'A2',l:'A2 - Elemental'},
    {v:'B1',l:'B1 - Intermedio'},{v:'B2',l:'B2 - Intermedio Alto'},
    {v:'C1',l:'C1 - Avanzado'},{v:'C2',l:'C2 - Dominio'}
];
const TIPOS_EXP = ['television','cine','teatro','serie','comercial','videoclip','publicidad','otro'];
const TIPOS_EXP_LABEL = {
    television:'Televisión',cine:'Cine',teatro:'Teatro',serie:'Serie',
    comercial:'Comercial',videoclip:'Videoclip',publicidad:'Publicidad',otro:'Otro'
};

const ACENTOS_LISTA = [
    'Español neutro (Latinoamérica)', 'Mexicano', 'Colombiano (bogotano/neutro)',
    'Paisa (antioqueño)', 'Costeño (colombiano)', 'Caleño', 'Venezolano',
    'Argentino / Rioplatense', 'Chileno', 'Peruano', 'Cubano', 'Puertorriqueño',
    'Dominicano', 'Guatemalteco', 'Ecuatoriano', 'Boliviano', 'Paraguayo',
    'Uruguayo', 'Hondureño', 'Salvadoreño', 'Nicaragüense', 'Costarricense', 'Panameño',
    'Español peninsular (castellano)', 'Andaluz', 'Canario',
    'Americano (inglés)', 'Británico (inglés)', 'Francés', 'Italiano',
    'Portugués / Brasileño', 'Alemán', 'Ruso', 'Japonés', 'Chino'
];

let actorId = null;          // null = crear, número = editar
let habilidadesActivas = [];
let acentosManejaArr = [];
let acentosNoManejaArr = [];
let fechasNoDisponibles = [];
let idiomas = [];
let formaciones = [];
let experiencias = [];

// ==================== HELPERS ====================

function getToken() { return localStorage.getItem('token'); }

function parseJSON(str, fallback) {
    try { return JSON.parse(str || '') || fallback; }
    catch { return fallback; }
}

function mostrarNotif(msg, tipo = 'success') {
    const n = document.getElementById('notification');
    n.textContent = msg;
    n.className = `notification ${tipo} show`;
    setTimeout(() => n.classList.remove('show'), 3500);
}

function fotoSrc(foto) {
    return foto
        ? foto
        : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='38' r='28' fill='%23ccc'/%3E%3Cellipse cx='50' cy='100' rx='45' ry='32' fill='%23ccc'/%3E%3C/svg%3E";
}

function get(id) { return (document.getElementById(id) || {}).value || ''; }
function set(id, val) { const el = document.getElementById(id); if (el) el.value = val || ''; }

function anioOptions(selected, minYear = 1950) {
    const cur = new Date().getFullYear();
    let html = '<option value="">Sin especificar</option>';
    for (let y = cur; y >= minYear; y--) {
        html += `<option value="${y}" ${String(selected) === String(y) ? 'selected' : ''}>${y}</option>`;
    }
    return html;
}

// ==================== AUTH ====================

function verificarAdmin() {
    const actor = parseJSON(localStorage.getItem('actor'), {});
    const token = getToken();
    if (!token || !actor.is_admin) { window.location.href = 'login.html'; return false; }
    return true;
}

// ==================== HABILIDADES (chips) ====================

function renderHabilidades() {
    const grid = document.getElementById('habGrid');
    if (!grid) return;
    grid.innerHTML = HABILIDADES_LISTA.map((h, i) => {
        const checked = habilidadesActivas.includes(h);
        return `
        <div class="hab-item">
            <input type="checkbox" id="hab_${i}" value="${h}" ${checked ? 'checked' : ''}
                onchange="toggleHab('${h}', this.checked)">
            <label for="hab_${i}">${h}</label>
        </div>`;
    }).join('');
    const otroInput = document.getElementById('habOtroInput');
    if (otroInput) otroInput.classList.toggle('visible', habilidadesActivas.some(h => h.startsWith('Otro:')));
}

window.toggleHab = function(hab, checked) {
    if (hab === 'Otro') {
        const otroInput = document.getElementById('habOtroInput');
        if (otroInput) otroInput.classList.toggle('visible', checked);
        if (!checked) habilidadesActivas = habilidadesActivas.filter(h => !h.startsWith('Otro:') && h !== 'Otro');
        else if (!habilidadesActivas.includes('Otro')) habilidadesActivas.push('Otro');
    } else {
        if (checked && !habilidadesActivas.includes(hab)) habilidadesActivas.push(hab);
        else habilidadesActivas = habilidadesActivas.filter(h => h !== hab);
    }
};

function cargarHabilidades(habStr) {
    if (!habStr) { habilidadesActivas = []; return; }
    let arr;
    try { arr = JSON.parse(habStr); if (!Array.isArray(arr)) arr = [habStr]; }
    catch { arr = [habStr]; }
    habilidadesActivas = arr;
    const otro = arr.find(h => h.startsWith('Otro:'));
    if (otro) {
        const otroTexto = document.getElementById('habOtroTexto');
        if (otroTexto) otroTexto.value = otro.replace('Otro: ', '').replace('Otro:', '').trim();
        // Reemplazar la entrada "Otro:xxx" por "Otro" para que coincida con el checkbox
        habilidadesActivas = arr.map(h => h.startsWith('Otro:') ? 'Otro' : h);
    }
}

function getHabilidadesJSON() {
    const list = habilidadesActivas.filter(h => h !== 'Otro');
    const otroCheckbox = document.querySelector('#habGrid input[value="Otro"]');
    if (otroCheckbox && otroCheckbox.checked) {
        const otroTexto = get('habOtroTexto').trim();
        if (otroTexto) list.push(`Otro: ${otroTexto}`);
    }
    return JSON.stringify(list);
}

// ==================== ACENTOS ====================

function poblarSelectAcentos() {
    ['selectAcentoManeja', 'selectAcentoNoManeja'].forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        const first = sel.options[0];
        sel.innerHTML = '';
        sel.appendChild(first);
        ACENTOS_LISTA.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a; opt.textContent = a;
            sel.appendChild(opt);
        });
    });
}

function renderAcentosTags(arr, containerId, tipo) {
    const cont = document.getElementById(containerId);
    if (!cont) return;
    const color = tipo === 'maneja' ? '#e6f4ea' : '#fde8e8';
    const textColor = tipo === 'maneja' ? '#1d6f42' : '#910909';
    cont.innerHTML = arr.map((a, i) =>
        `<span style="display:inline-flex;align-items:center;gap:5px;background:${color};color:${textColor};border-radius:20px;padding:4px 12px;font-size:13px;font-weight:500">
            ${a.replace(/</g,'&lt;')}
            <button type="button" onclick="eliminarAcento('${tipo}',${i})" style="background:none;border:none;color:${textColor};cursor:pointer;font-size:14px;line-height:1;padding:0;opacity:.7">✕</button>
        </span>`
    ).join('');
}

window.eliminarAcento = function(tipo, i) {
    if (tipo === 'maneja') { acentosManejaArr.splice(i,1); renderAcentosTags(acentosManejaArr,'acentosManejaTagsContainer','maneja'); }
    else { acentosNoManejaArr.splice(i,1); renderAcentosTags(acentosNoManejaArr,'acentosNoManejaTagsContainer','nomaneja'); }
};

function agregarAcentoDesdeSelect(tipo) {
    const sel = document.getElementById(tipo === 'maneja' ? 'selectAcentoManeja' : 'selectAcentoNoManeja');
    const val = sel ? sel.value.trim() : '';
    if (!val) return;
    const arr = tipo === 'maneja' ? acentosManejaArr : acentosNoManejaArr;
    const cont = tipo === 'maneja' ? 'acentosManejaTagsContainer' : 'acentosNoManejaTagsContainer';
    if (!arr.includes(val)) { arr.push(val); renderAcentosTags(arr, cont, tipo === 'maneja' ? 'maneja' : 'nomaneja'); }
    sel.value = '';
}

function agregarAcentoOtro(tipo) {
    const inputId = tipo === 'maneja' ? 'acentoManejaOtroTexto' : 'acentoNoManejaOtroTexto';
    const input = document.getElementById(inputId);
    const val = (input ? input.value : '').trim();
    if (!val) return;
    const arr = tipo === 'maneja' ? acentosManejaArr : acentosNoManejaArr;
    const cont = tipo === 'maneja' ? 'acentosManejaTagsContainer' : 'acentosNoManejaTagsContainer';
    if (!arr.includes(val)) { arr.push(val); renderAcentosTags(arr, cont, tipo === 'maneja' ? 'maneja' : 'nomaneja'); }
    if (input) { input.value = ''; input.focus(); }
}

function cargarAcentos(actor) {
    try { acentosManejaArr = JSON.parse(actor.acentos_maneja || '[]') || []; } catch { acentosManejaArr = []; }
    try { acentosNoManejaArr = JSON.parse(actor.acentos_no_maneja || '[]') || []; } catch { acentosNoManejaArr = []; }
    renderAcentosTags(acentosManejaArr, 'acentosManejaTagsContainer', 'maneja');
    renderAcentosTags(acentosNoManejaArr, 'acentosNoManejaTagsContainer', 'nomaneja');
}

function iniciarEventosAcentos() {
    poblarSelectAcentos();
    const b = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    const k = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); fn(); } }); };
    b('btnAgregarAcentoManeja', () => agregarAcentoDesdeSelect('maneja'));
    b('btnAgregarAcentoNoManeja', () => agregarAcentoDesdeSelect('nomaneja'));
    b('btnAgregarAcentoManejaOtro', () => agregarAcentoOtro('maneja'));
    b('btnAgregarAcentoNoManejaOtro', () => agregarAcentoOtro('nomaneja'));
    k('acentoManejaOtroTexto', () => agregarAcentoOtro('maneja'));
    k('acentoNoManejaOtroTexto', () => agregarAcentoOtro('nomaneja'));
}

// ==================== FECHAS NO DISPONIBLES ====================

function renderFechas() {
    const lista = document.getElementById('listaFechas');
    if (!lista) return;
    if (fechasNoDisponibles.length === 0) {
        lista.innerHTML = '<p style="color:#aaa;font-size:13px;margin-bottom:10px">Sin fechas registradas</p>';
        return;
    }
    lista.innerHTML = fechasNoDisponibles.map((f, i) => `
        <div class="fecha-range-item">
            <input type="date" value="${f.inicio || ''}" onchange="updateFecha(${i},'inicio',this.value)">
            <span class="fecha-sep">→</span>
            <input type="date" value="${f.fin || ''}" onchange="updateFecha(${i},'fin',this.value)">
            <button class="btn-remove-fecha" onclick="eliminarFecha(${i})">✕</button>
        </div>`).join('');
}

window.updateFecha = function(i, campo, val) {
    fechasNoDisponibles[i][campo] = val;
};

window.eliminarFecha = function(i) {
    fechasNoDisponibles.splice(i, 1);
    renderFechas();
};

function getFechasJSON() {
    return JSON.stringify(fechasNoDisponibles.filter(f => f.inicio && f.fin));
}

// ==================== IDIOMAS ====================

function renderIdiomas() {
    const cont = document.getElementById('idiomasCont');
    if (!cont) return;
    if (idiomas.length === 0) {
        cont.innerHTML = '<p style="color:#aaa;font-size:13px;margin-bottom:8px">Sin idiomas registrados</p>';
        return;
    }
    cont.innerHTML = idiomas.map((id, i) => `
        <div class="entry-card">
            <div class="entry-card-header">
                <span class="entry-number">Idioma ${i + 1}</span>
                <button class="btn-remove-entry" onclick="eliminarIdioma(${i})">✕</button>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Idioma</label>
                    <select onchange="updateIdioma(${i},'idioma',this.value)">
                        <option value="">Seleccionar</option>
                        ${IDIOMAS_LISTA.map(n => `<option value="${n}" ${id.idioma===n?'selected':''}>${n}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Nivel</label>
                    <select onchange="updateIdioma(${i},'nivel',this.value)">
                        <option value="">Sin especificar</option>
                        ${NIVELES_LISTA.map(n => `<option value="${n.v}" ${id.nivel===n.v?'selected':''}>${n.l}</option>`).join('')}
                    </select>
                </div>
            </div>
        </div>`).join('');
}

window.updateIdioma = function(i, campo, val) { idiomas[i][campo] = val; };
window.eliminarIdioma = function(i) { idiomas.splice(i, 1); renderIdiomas(); };

// ==================== FORMACIONES ====================

function renderFormaciones() {
    const cont = document.getElementById('formacionesCont');
    if (!cont) return;
    if (formaciones.length === 0) {
        cont.innerHTML = '<p style="color:#aaa;font-size:13px;margin-bottom:8px">Sin formaciones registradas</p>';
        return;
    }
    cont.innerHTML = formaciones.map((f, i) => `
        <div class="entry-card">
            <div class="entry-card-header">
                <span class="entry-number">Formación ${i + 1}</span>
                <button class="btn-remove-entry" onclick="eliminarFormacion(${i})">✕</button>
            </div>
            <div class="form-group">
                <label>Institución / Descripción</label>
                <input type="text" value="${(f.nombre||'').replace(/"/g,'&quot;')}"
                    placeholder="Ej: Escuela de Artes (1999-2005)"
                    onchange="updateFormacion(${i},'nombre',this.value)">
            </div>
        </div>`).join('');
}

window.updateFormacion = function(i, campo, val) { formaciones[i][campo] = val; };
window.eliminarFormacion = function(i) { formaciones.splice(i, 1); renderFormaciones(); };

// ==================== EXPERIENCIAS ====================

function renderExperiencias() {
    const cont = document.getElementById('experienciasCont');
    if (!cont) return;
    if (experiencias.length === 0) {
        cont.innerHTML = '<p style="color:#aaa;font-size:13px;margin-bottom:8px">Sin experiencias registradas</p>';
        return;
    }
    cont.innerHTML = experiencias.map((e, i) => `
        <div class="entry-card">
            <div class="entry-card-header">
                <span class="entry-number">Experiencia ${i + 1}</span>
                <button class="btn-remove-entry" onclick="eliminarExp(${i})">✕</button>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Tipo</label>
                    <select onchange="updateExpTipo(${i},this.value)">
                        <option value="">Seleccionar</option>
                        ${TIPOS_EXP.map(t => `<option value="${t}" ${e.tipo===t?'selected':''}>${TIPOS_EXP_LABEL[t]||t}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group" id="expOtroCampo_${i}" style="${e.tipo==='otro'?'':'display:none'}">
                    <label>Nombre del tipo</label>
                    <input type="text" value="${(e.tipo_nombre||'').replace(/"/g,'&quot;')}"
                        placeholder="Ej: Videos Musicales, Director..."
                        onchange="updateExp(${i},'tipo_nombre',this.value)">
                </div>
            </div>
            <div class="form-group">
                <label>Proyecto / Descripción</label>
                <input type="text" value="${(e.nombre||'').replace(/"/g,'&quot;')}"
                    placeholder="Nombre de la producción o proyecto"
                    onchange="updateExp(${i},'nombre',this.value)">
            </div>
        </div>`).join('');
}

window.updateExpTipo = function(i, val) {
    experiencias[i].tipo = val;
    const otro = document.getElementById(`expOtroCampo_${i}`);
    if (otro) otro.style.display = val === 'otro' ? '' : 'none';
};
window.updateExp = function(i, campo, val) { experiencias[i][campo] = val; };
window.eliminarExp = function(i) { experiencias.splice(i, 1); renderExperiencias(); };

// ==================== CONSTRUIR HTML DEL FORM ====================

function construirFormHTML(a) {
    const esEdicion = !!actorId;
    const fecha = a.fecha_nacimiento ? a.fecha_nacimiento.split('T')[0] : '';
    const redes = parseJSON(a.redes_sociales, {});
    const rolActual = a.is_admin ? 'admin' : (a.is_casting ? 'casting' : 'actor');

    return `
    ${esEdicion ? `
    <!-- Foto de perfil -->
    <div class="profile-header">
        <div class="profile-photo-section">
            <div class="profile-photo-container">
                <img class="profile-photo" id="fotoPerfilImg"
                    src="${fotoSrc(a.foto_perfil)}"
                    onerror="this.src='${fotoSrc(null)}'">
                <div class="photo-overlay">
                    <label class="upload-btn" for="inputFotoPerfil">📷 Cambiar foto</label>
                    <input type="file" id="inputFotoPerfil" accept="image/*" style="display:none">
                </div>
            </div>
        </div>
        <div class="profile-info">
            <h1 id="headerNombre">${a.nombre || 'Sin nombre'}</h1>
            <p>${a.email || ''}</p>
            <span class="badge" id="headerRol">${rolActual === 'admin' ? 'Administrador' : rolActual === 'casting' ? 'Director de Casting' : 'Actor'}</span>
        </div>
    </div>` : ''}

    <!-- Acceso -->
    <div class="card">
        <h2>Acceso y Rol</h2>
        <div class="form-row">
            <div class="form-group">
                <label>Email *</label>
                <input type="email" id="fEmail" value="${a.email || ''}" required>
            </div>
            <div class="form-group">
                <label>Rol del usuario</label>
                <select id="fRol">
                    <option value="actor" ${rolActual==='actor'?'selected':''}>Actor</option>
                    <option value="casting" ${rolActual==='casting'?'selected':''}>Director de Casting</option>
                    <option value="admin" ${rolActual==='admin'?'selected':''}>Administrador</option>
                </select>
            </div>
        </div>
        ${!esEdicion ? `
        <div class="form-row">
            <div class="form-group">
                <label>Contraseña *</label>
                <input type="password" id="fPassword" minlength="6" placeholder="Mínimo 6 caracteres" required>
            </div>
            <div class="form-group">
                <label>Confirmar contraseña *</label>
                <input type="password" id="fPasswordConfirm" placeholder="Repetir contraseña">
            </div>
        </div>` : `
        <div class="form-group">
            <label>Resetear contraseña</label>
            <div class="password-reset-group">
                <div class="form-group">
                    <input type="password" id="fNuevaPassword" placeholder="Nueva contraseña (mín. 6 caracteres)">
                </div>
                <button type="button" class="btn-secondary btn-sm" onclick="resetearPassword()">Actualizar contraseña</button>
            </div>
        </div>`}
    </div>

    <!-- Información Personal -->
    <div class="card">
        <h2>Información Personal</h2>
        <div class="form-row">
            <div class="form-group">
                <label>Nombre completo *</label>
                <input type="text" id="fNombre" value="${a.nombre || ''}" required>
            </div>
            <div class="form-group">
                <label>Teléfono</label>
                <input type="tel" id="fTelefono" value="${a.telefono || ''}">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Fecha de nacimiento</label>
                <input type="date" id="fFechaNac" value="${fecha}">
            </div>
            <div class="form-group">
                <label>Género</label>
                <select id="fGenero">
                    <option value="">Sin especificar</option>
                    ${['masculino','femenino','otro','prefiero_no_decir'].map(g =>
                        `<option value="${g}" ${a.genero===g?'selected':''}>${g.charAt(0).toUpperCase()+g.slice(1).replace('_',' ')}</option>`
                    ).join('')}
                </select>
            </div>
        </div>
        <div class="form-group" style="padding:14px;background:#fff8e1;border-radius:8px;border:1px solid #ffe082;margin-bottom:4px">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:600;color:#555">
                <input type="checkbox" id="fPuedeSubirContrato" ${a.puede_subir_contrato ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer;accent-color:#910909">
                Permitir al actor subir contrato firmado
            </label>
            <p style="font-size:12px;color:#888;margin:6px 0 0 28px">Cuando está activado, el actor verá el botón para subir su PDF en su perfil.</p>
        </div>
        <div class="form-group">
            <label>Biografía</label>
            <textarea id="fBiografia" rows="4">${a.biografia || ''}</textarea>
        </div>
    </div>

    <!-- Características Físicas -->
    <div class="card">
        <h2>Características Físicas</h2>
        <div class="form-row">
            <div class="form-group">
                <label>Altura (cm)</label>
                <input type="number" id="fAltura" value="${a.altura || ''}" step="0.1" placeholder="Ej: 175">
            </div>
            <div class="form-group">
                <label>Peso (kg)</label>
                <input type="number" id="fPeso" value="${a.peso || ''}" step="0.1" placeholder="Ej: 70">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Color de ojos</label>
                <input type="text" id="fColorOjos" value="${a.color_ojos || ''}" placeholder="Ej: café, verde, azul...">
            </div>
            <div class="form-group">
                <label>Color de cabello</label>
                <input type="text" id="fColorCabello" value="${a.color_cabello || ''}" placeholder="Ej: negro, rubio, castaño...">
            </div>
        </div>
        <div class="form-row form-row-3">
            <div class="form-group">
                <label>Talla camiseta</label>
                <input type="text" id="fTallaCamiseta" value="${a.talla_camiseta || ''}" placeholder="Ej: M, L, XL">
            </div>
            <div class="form-group">
                <label>Talla pantalón</label>
                <input type="text" id="fTallaPantalon" value="${a.talla_pantalon || ''}" placeholder="Ej: 30, 32">
            </div>
            <div class="form-group">
                <label>Talla zapatos</label>
                <input type="text" id="fTallaZapatos" value="${a.talla_zapatos || ''}" placeholder="Ej: 40, 42">
            </div>
        </div>
    </div>

    <!-- Información Artística -->
    <div class="card">
        <h2>Información Artística</h2>
        <div class="form-row">
            <div class="form-group">
                <label>Edad aparente mínima</label>
                <select id="fEdadApMin">
                    ${anioOptions(null, 1).replace('value=""', 'value="" selected').replace('<option value="">Sin especificar</option>',
                        '<option value="">Sin especificar</option>' +
                        Array.from({length:80},(_, i)=>`<option value="${15+i}" ${a.edad_aparente_min===(15+i)?'selected':''}>${15+i} años</option>`).join('')
                    )}
                </select>
            </div>
            <div class="form-group">
                <label>Edad aparente máxima</label>
                <select id="fEdadApMax">
                    <option value="">Sin especificar</option>
                    ${Array.from({length:80},(_, i)=>`<option value="${15+i}" ${a.edad_aparente_max===(15+i)?'selected':''}>${15+i} años</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>¿Tiene manager?</label>
                <select id="fTieneManager" onchange="toggleManager(this.value)">
                    <option value="">No especificado</option>
                    <option value="1" ${a.tiene_manager===1?'selected':''}>Sí</option>
                    <option value="0" ${a.tiene_manager===0?'selected':''}>No</option>
                </select>
            </div>
            <div class="form-group manager-field" id="managerField" style="${a.tiene_manager===1?'display:block':''}">
                <label>Nombre del manager</label>
                <input type="text" id="fNombreManager" value="${a.nombre_manager || ''}" placeholder="Nombre completo">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>¿Hace escenas de sexo?</label>
                <select id="fEscenasSexo">
                    <option value="">No especificado</option>
                    <option value="1" ${a.escenas_sexo===1?'selected':''}>Sí</option>
                    <option value="0" ${a.escenas_sexo===0?'selected':''}>No</option>
                </select>
            </div>
            <div class="form-group">
                <label>Año de inicio de experiencia artística</label>
                <select id="fAnioInicioExp">
                    ${anioOptions(a.anio_inicio_experiencia)}
                </select>
            </div>
        </div>
        <div class="form-group">
            <label>Link del reel</label>
            <input type="url" id="fLinkReel" value="${a.link_reel || ''}" placeholder="https://...">
        </div>

        <h3>Fechas no disponibles</h3>
        <p class="fechas-hint">Periodos en los que el actor no puede trabajar (viajes, compromisos, etc.)</p>
        <div id="listaFechas"></div>
        <button type="button" class="btn-add-fecha" onclick="agregarFecha()">+ Agregar periodo</button>
    </div>

    <!-- Habilidades -->
    <div class="card">
        <h2>Habilidades</h2>
        <div class="habilidades-grid" id="habGrid"></div>
        <div class="hab-otro-input" id="habOtroInput">
            <input type="text" id="habOtroTexto" placeholder="Especificar otra habilidad...">
        </div>
    </div>

    <!-- Acentos -->
    <div class="card">
        <h2>Acentos</h2>
        <p style="font-size:13px;color:#888;margin-bottom:18px">Indica los acentos que maneja y los que no</p>
        <div style="margin-bottom:20px">
            <label style="font-size:14px;font-weight:700;color:#333;display:block;margin-bottom:8px">✅ Acentos que maneja</label>
            <div style="display:flex;gap:8px;margin-bottom:8px">
                <select id="selectAcentoManeja" style="flex:1"><option value="">— Seleccionar —</option></select>
                <button type="button" id="btnAgregarAcentoManeja" class="btn-secondary btn-sm" style="white-space:nowrap">+ Agregar</button>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:10px">
                <input type="text" id="acentoManejaOtroTexto" placeholder="Otro acento..." style="flex:1">
                <button type="button" id="btnAgregarAcentoManejaOtro" class="btn-secondary btn-sm" style="white-space:nowrap">+ Otro</button>
            </div>
            <div id="acentosManejaTagsContainer" style="display:flex;flex-wrap:wrap;gap:6px"></div>
        </div>
        <div>
            <label style="font-size:14px;font-weight:700;color:#333;display:block;margin-bottom:8px">❌ Acentos que NO maneja</label>
            <div style="display:flex;gap:8px;margin-bottom:8px">
                <select id="selectAcentoNoManeja" style="flex:1"><option value="">— Seleccionar —</option></select>
                <button type="button" id="btnAgregarAcentoNoManeja" class="btn-secondary btn-sm" style="white-space:nowrap">+ Agregar</button>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:10px">
                <input type="text" id="acentoNoManejaOtroTexto" placeholder="Otro acento..." style="flex:1">
                <button type="button" id="btnAgregarAcentoNoManejaOtro" class="btn-secondary btn-sm" style="white-space:nowrap">+ Otro</button>
            </div>
            <div id="acentosNoManejaTagsContainer" style="display:flex;flex-wrap:wrap;gap:6px"></div>
        </div>
    </div>

    <!-- Idiomas -->
    <div class="card">
        <div class="card-header-flex">
            <h2>Idiomas</h2>
            <button type="button" class="btn-secondary btn-sm" onclick="agregarIdioma()">+ Agregar Idioma</button>
        </div>
        <div id="idiomasCont"></div>
    </div>

    <!-- Formación Artística -->
    <div class="card">
        <div class="card-header-flex">
            <h2>Formación Artística</h2>
            <button type="button" class="btn-secondary btn-sm" onclick="agregarFormacion()">+ Agregar Formación</button>
        </div>
        <div id="formacionesCont"></div>
    </div>

    <!-- Experiencia Profesional -->
    <div class="card">
        <div class="card-header-flex">
            <h2>Experiencia Profesional</h2>
            <button type="button" class="btn-secondary btn-sm" onclick="agregarExp()">+ Agregar Experiencia</button>
        </div>
        <div id="experienciasCont"></div>
    </div>

    <!-- Redes Sociales -->
    <div class="card">
        <h2>Redes Sociales</h2>
        <div class="form-row">
            <div class="form-group">
                <label>Facebook</label>
                <input type="url" id="fFacebook" value="${redes.facebook || ''}" placeholder="https://facebook.com/...">
            </div>
            <div class="form-group">
                <label>Instagram</label>
                <input type="url" id="fInstagram" value="${redes.instagram || ''}" placeholder="https://instagram.com/...">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>TikTok</label>
                <input type="url" id="fTiktok" value="${redes.tiktok || ''}" placeholder="https://tiktok.com/@...">
            </div>
            <div class="form-group">
                <label>IMDB</label>
                <input type="url" id="fImdb" value="${redes.imdb || ''}" placeholder="https://imdb.com/...">
            </div>
        </div>
    </div>

    ${esEdicion ? `
    <!-- Galería de Fotos -->
    <div class="card">
        <div class="card-header-flex">
            <h2>Galería de Fotos</h2>
            <label class="upload-foto-btn" for="inputFotoGaleria">
                + Agregar Foto
                <input type="file" id="inputFotoGaleria" accept="image/*" style="display:none">
            </label>
        </div>
        <div class="galeria-form-grid" id="galeriaGrid">
            <p style="color:#aaa;font-size:13px">Sin fotos en la galería</p>
        </div>
    </div>` : ''}

    <!-- Acciones -->
    <div class="form-actions">
        <a href="admin.html">Cancelar</a>
        <button type="button" class="btn-primary" id="btnGuardar" onclick="guardarActor()">
            ${esEdicion ? 'Guardar Cambios' : 'Crear Perfil'}
        </button>
    </div>`;
}

// ==================== TOGGLES ====================

window.toggleManager = function(val) {
    const el = document.getElementById('managerField');
    if (el) el.style.display = val === '1' ? 'block' : 'none';
};

window.agregarFecha = function() {
    fechasNoDisponibles.push({ inicio: '', fin: '' });
    renderFechas();
};

window.agregarIdioma = function() {
    idiomas.push({ idioma: '', nivel: '' });
    renderIdiomas();
};

window.agregarFormacion = function() {
    formaciones.push({ nombre: '' });
    renderFormaciones();
};

window.agregarExp = function() {
    experiencias.push({ tipo: '', nombre: '', tipo_nombre: '' });
    renderExperiencias();
};

// ==================== FOTO PERFIL ====================

async function subirFotoPerfil(file) {
    const formData = new FormData();
    formData.append('foto', file);
    const res = await fetch(`${API_URL}/admin/actores/${actorId}/foto`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: formData
    });
    const data = await res.json();
    if (res.ok) {
        document.getElementById('fotoPerfilImg').src = data.url;
        mostrarNotif('Foto de perfil actualizada');
    } else {
        mostrarNotif(data.error || 'Error al subir foto', 'error');
    }
}

// ==================== GALERÍA ====================

async function cargarGaleria() {
    const res = await fetch(`${API_URL}/admin/actores/${actorId}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    renderGaleria(data.fotos || []);
}

function renderGaleria(fotos) {
    const grid = document.getElementById('galeriaGrid');
    if (!grid) return;
    if (fotos.length === 0) {
        grid.innerHTML = '<p style="color:#aaa;font-size:13px">Sin fotos en la galería</p>';
        return;
    }
    grid.innerHTML = fotos.map(f => `
        <div class="galeria-form-item">
            <img src="${f.url_foto}" onerror="this.style.display='none'">
            <button class="btn-del-galeria" onclick="eliminarFotoGaleria(${f.id})">✕</button>
        </div>`).join('');
}

window.eliminarFotoGaleria = async function(fotoId) {
    const res = await fetch(`${API_URL}/admin/actores/${actorId}/fotos/${fotoId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (res.ok) { mostrarNotif('Foto eliminada'); cargarGaleria(); }
    else mostrarNotif('Error al eliminar foto', 'error');
};

async function subirFotoGaleria(file) {
    const formData = new FormData();
    formData.append('foto', file);
    const res = await fetch(`${API_URL}/admin/actores/${actorId}/fotos`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: formData
    });
    const data = await res.json();
    if (res.ok) { mostrarNotif('Foto agregada'); cargarGaleria(); }
    else mostrarNotif(data.error || 'Error al subir foto', 'error');
}

// ==================== RESETEAR CONTRASEÑA ====================

window.resetearPassword = async function() {
    const pass = get('fNuevaPassword').trim();
    if (!pass || pass.length < 6) {
        mostrarNotif('La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }
    const res = await fetch(`${API_URL}/admin/actores/${actorId}/password`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nuevaPassword: pass })
    });
    const data = await res.json();
    if (res.ok) {
        mostrarNotif('Contraseña actualizada exitosamente');
        document.getElementById('fNuevaPassword').value = '';
    } else {
        mostrarNotif(data.error || 'Error al actualizar contraseña', 'error');
    }
};

// ==================== GUARDAR ====================

window.guardarActor = async function() {
    const nombre = get('fNombre').trim();
    const email = get('fEmail').trim();
    if (!nombre || !email) {
        mostrarNotif('Nombre y email son obligatorios', 'error'); return;
    }

    const rol = get('fRol');
    const edadApMin = get('fEdadApMin');
    const edadApMax = get('fEdadApMax');
    const tieneManager = get('fTieneManager');
    const escenasSexo = get('fEscenasSexo');

    const redes = {
        facebook:  get('fFacebook').trim(),
        instagram: get('fInstagram').trim(),
        tiktok:    get('fTiktok').trim(),
        imdb:      get('fImdb').trim()
    };

    const body = {
        nombre,
        email,
        telefono:              get('fTelefono').trim(),
        fecha_nacimiento:      get('fFechaNac'),
        genero:                get('fGenero'),
        ciudad_nacimiento:      get('fCiudadNac') || null,
        pais_nacimiento:       get('fPaisNac') || null,
        puede_subir_contrato:  document.getElementById('fPuedeSubirContrato') ? document.getElementById('fPuedeSubirContrato').checked : false,
        altura:                get('fAltura'),
        peso:                  get('fPeso'),
        color_ojos:            get('fColorOjos').trim(),
        color_cabello:         get('fColorCabello').trim(),
        talla_camiseta:        get('fTallaCamiseta').trim(),
        talla_pantalon:        get('fTallaPantalon').trim(),
        talla_zapatos:         get('fTallaZapatos').trim(),
        biografia:             get('fBiografia').trim(),
        habilidades:           getHabilidadesJSON(),
        idiomas:               JSON.stringify(idiomas.filter(i => i.idioma)),
        formacion_artistica:   JSON.stringify(formaciones.filter(f => f.nombre)),
        experiencia:           JSON.stringify(experiencias.filter(e => e.tipo || e.nombre)),
        redes_sociales:        JSON.stringify(redes),
        edad_aparente_min:     edadApMin || null,
        edad_aparente_max:     edadApMax || null,
        tiene_manager:         tieneManager !== '' ? parseInt(tieneManager) : null,
        nombre_manager:        get('fNombreManager').trim(),
        fechas_no_disponibles: getFechasJSON(),
        anio_inicio_experiencia: get('fAnioInicioExp') || null,
        escenas_sexo:          escenasSexo !== '' ? parseInt(escenasSexo) : null,
        link_reel:             get('fLinkReel').trim(),
        acentos_maneja:        acentosManejaArr.length ? JSON.stringify(acentosManejaArr) : null,
        acentos_no_maneja:     acentosNoManejaArr.length ? JSON.stringify(acentosNoManejaArr) : null,
        is_admin:              rol === 'admin',
        is_casting:            rol === 'casting',
    };

    const btn = document.getElementById('btnGuardar');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
        let res, data;
        if (actorId) {
            // EDITAR
            res = await fetch(`${API_URL}/admin/actores/${actorId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            data = await res.json();
            if (res.ok) {
                mostrarNotif('Perfil actualizado exitosamente');
                // Actualizar nombre en header
                const h = document.getElementById('headerNombre');
                if (h) h.textContent = nombre;
            } else {
                mostrarNotif(data.error || 'Error al actualizar', 'error');
            }
        } else {
            // CREAR
            const password = get('fPassword');
            const passwordConfirm = get('fPasswordConfirm');
            if (!password || password.length < 6) {
                mostrarNotif('La contraseña debe tener al menos 6 caracteres', 'error');
                btn.disabled = false; btn.textContent = 'Crear Perfil'; return;
            }
            if (password !== passwordConfirm) {
                mostrarNotif('Las contraseñas no coinciden', 'error');
                btn.disabled = false; btn.textContent = 'Crear Perfil'; return;
            }
            body.password = password;
            res = await fetch(`${API_URL}/admin/actores`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            data = await res.json();
            if (res.ok) {
                mostrarNotif('¡Perfil creado exitosamente!');
                // Redirigir al modo edición para poder agregar fotos
                setTimeout(() => {
                    window.location.href = `admin-actor-form.html?id=${data.actorId}`;
                }, 1500);
                return;
            } else {
                mostrarNotif(data.error || 'Error al crear perfil', 'error');
            }
        }
    } catch {
        mostrarNotif('Error de conexión', 'error');
    }

    btn.disabled = false;
    btn.textContent = actorId ? 'Guardar Cambios' : 'Crear Perfil';
};

// ==================== INICIALIZAR ====================

async function init() {
    if (!verificarAdmin()) return;

    const params = new URLSearchParams(window.location.search);
    actorId = params.get('id') ? parseInt(params.get('id')) : null;

    const container = document.getElementById('mainContent');

    let actor = {};

    if (actorId) {
        // Modo edición: cargar datos del actor
        document.title = 'Editar Actor - 8a Representaciones';
        document.getElementById('navTitle').textContent = 'Editar Actor';

        try {
            const res = await fetch(`${API_URL}/admin/actores/${actorId}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.status === 403) { window.location.href = 'login.html'; return; }
            if (!res.ok) { container.innerHTML = '<div class="page-loading">Actor no encontrado</div>'; return; }
            const data = await res.json();
            actor = data.actor;
            document.getElementById('navTitle').textContent = `Editando: ${actor.nombre || 'Actor'}`;

            // Cargar arrays dinámicos
            idiomas = parseJSON(actor.idiomas, []);
            formaciones = parseJSON(actor.formacion_artistica, []);
            experiencias = parseJSON(actor.experiencia, []);
            fechasNoDisponibles = parseJSON(actor.fechas_no_disponibles, []);
            cargarHabilidades(actor.habilidades);

            container.innerHTML = construirFormHTML(actor);

            // Renderizar dinámicos
            renderHabilidades();
            renderFechas();
            renderIdiomas();
            renderFormaciones();
            renderExperiencias();

            // Poblar selects de edad aparente (ya vienen con valor desde construirFormHTML)
            poblarSelectEdadAp('fEdadApMin', actor.edad_aparente_min);
            poblarSelectEdadAp('fEdadApMax', actor.edad_aparente_max);

            // Acentos
            iniciarEventosAcentos();
            cargarAcentos(actor);

            // Galería
            renderGaleria(data.fotos || []);

            // Eventos foto perfil
            document.getElementById('inputFotoPerfil').addEventListener('change', function() {
                if (this.files[0]) subirFotoPerfil(this.files[0]);
            });
            document.getElementById('inputFotoGaleria').addEventListener('change', function() {
                if (this.files[0]) subirFotoGaleria(this.files[0]);
            });

        } catch {
            container.innerHTML = '<div class="page-loading">Error de conexión</div>';
            return;
        }
    } else {
        // Modo creación
        document.title = 'Crear Actor - 8a Representaciones';
        document.getElementById('navTitle').textContent = 'Nuevo Actor';

        container.innerHTML = construirFormHTML({});

        renderHabilidades();
        renderFechas();
        renderIdiomas();
        renderFormaciones();
        renderExperiencias();
        poblarSelectEdadAp('fEdadApMin', null);
        poblarSelectEdadAp('fEdadApMax', null);
        iniciarEventosAcentos();
    }
}

function poblarSelectEdadAp(id, valorActual) {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">Sin especificar</option>';
    for (let age = 15; age <= 80; age++) {
        const opt = document.createElement('option');
        opt.value = age;
        opt.textContent = `${age} años`;
        if (valorActual === age) opt.selected = true;
        sel.appendChild(opt);
    }
}

// ==================== LOGOUT ====================

document.getElementById('btnConfirmarLogout') && document.getElementById('btnConfirmarLogout').addEventListener('click', function() {
    localStorage.removeItem('token');
    localStorage.removeItem('actor');
    window.location.href = 'login.html';
});

document.getElementById('btnCancelarLogout') && document.getElementById('btnCancelarLogout').addEventListener('click', function() {
    document.getElementById('logoutOverlay').style.display = 'none';
});

// ==================== INIT ====================

window.addEventListener('DOMContentLoaded', init);
