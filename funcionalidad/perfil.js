const API_URL = '/api';

// ==================== AUTH ====================

function verificarAutenticacion() {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = 'login.html'; return false; }
    return token;
}

function getToken() { return localStorage.getItem('token'); }

function mostrarNotificacion(mensaje, tipo = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = mensaje;
    notification.className = `notification ${tipo} show`;
    setTimeout(() => notification.classList.remove('show'), 3000);
}

// ==================== POPULATE YEAR SELECTS ====================

function poblarSelectAnios(id, min, max, labelVacio = 'Seleccionar') {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = `<option value="">${labelVacio}</option>`;
    for (let y = max; y >= min; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        sel.appendChild(opt);
    }
}

// ==================== HABILIDADES ====================

const HABILIDADES_LISTA = [
    'Canto', 'Baile', 'Presentación', 'Doblaje', 'Stunt de riesgo',
    'Combate escénico', 'Artes Marciales', 'Interpreta Instrumentos',
    'Manejo de Carro y Moto con Licencia', 'Maneja Carro con Licencia',
    'Maneja Moto con Licencia', 'Director', 'Monta a Caballo',
    'Nadar', 'Titiritero', 'Otro'
];

let habilidadesActivas = [];
let otrasHabilidades = []; // habilidades personalizadas (tipo "Otro: X")

const ACENTOS_LISTA = [
    // Latinoamérica
    'Español neutro (Latinoamérica)', 'Mexicano', 'Colombiano (bogotano/neutro)',
    'Paisa (antioqueño)', 'Costeño (colombiano)', 'Caleño', 'Venezolano',
    'Argentino / Rioplatense', 'Chileno', 'Peruano', 'Cubano', 'Puertorriqueño',
    'Dominicano', 'Guatemalteco', 'Ecuatoriano', 'Boliviano', 'Paraguayo',
    'Uruguayo', 'Hondureño', 'Salvadoreño', 'Nicaragüense', 'Costarricense', 'Panameño',
    // España
    'Español peninsular (castellano)', 'Andaluz', 'Canario',
    // Otros idiomas
    'Americano (inglés)', 'Británico (inglés)', 'Francés', 'Italiano',
    'Portugués / Brasileño', 'Alemán', 'Ruso', 'Japonés', 'Chino'
];

let acentosManejaArr = [];
let acentosNoManejaArr = [];

function renderHabilidades() {
    const grid = document.getElementById('habilidadesGrid');
    // Excluir 'Otro' del grid de checkboxes
    grid.innerHTML = HABILIDADES_LISTA.filter(h => h !== 'Otro').map(h => {
        const id = `hab-${h.replace(/[\s\/]+/g, '-').toLowerCase()}`;
        const checked = habilidadesActivas.includes(h) ? 'checked' : '';
        return `
            <div class="hab-item">
                <input type="checkbox" id="${id}" data-hab="${h}" ${checked}>
                <label for="${id}">${h}</label>
            </div>`;
    }).join('');

    grid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', function() {
            const hab = this.getAttribute('data-hab');
            if (this.checked) {
                if (!habilidadesActivas.includes(hab)) habilidadesActivas.push(hab);
            } else {
                habilidadesActivas = habilidadesActivas.filter(h => h !== hab);
            }
        });
    });
}

function renderOtrasHabilidadesTags() {
    const cont = document.getElementById('otrasHabilidadesTags');
    if (!cont) return;
    cont.innerHTML = otrasHabilidades.map((h, i) =>
        `<span style="display:inline-flex;align-items:center;gap:5px;background:#f0f0f0;border-radius:20px;padding:4px 12px;font-size:13px">
            ${h.replace(/</g, '&lt;')}
            <button type="button" onclick="eliminarOtraHab(${i})" style="background:none;border:none;color:#999;cursor:pointer;font-size:14px;line-height:1;padding:0">✕</button>
        </span>`
    ).join('');
}

window.eliminarOtraHab = function(i) {
    otrasHabilidades.splice(i, 1);
    renderOtrasHabilidadesTags();
};

function agregarOtraHab() {
    const input = document.getElementById('habOtroTexto');
    const texto = (input.value || '').trim();
    if (!texto) return;
    if (!otrasHabilidades.includes(texto)) {
        otrasHabilidades.push(texto);
        renderOtrasHabilidadesTags();
    }
    input.value = '';
    input.focus();
}

function cargarHabilidades(habStr) {
    let arr = [];
    try { arr = JSON.parse(habStr || '[]') || []; } catch { arr = []; }
    otrasHabilidades = [];
    habilidadesActivas = arr.filter(h => {
        if (h && typeof h === 'string' && h.startsWith('Otro:')) {
            otrasHabilidades.push(h.substring(5).trim());
            return false;
        }
        return HABILIDADES_LISTA.includes(h);
    });
    setTimeout(renderOtrasHabilidadesTags, 0);
}

function getHabilidadesJSON() {
    const arr = [
        ...habilidadesActivas.filter(h => h !== 'Otro'),
        ...otrasHabilidades.map(h => `Otro: ${h}`)
    ];
    return arr.length ? JSON.stringify(arr) : null;
}

// ==================== ACENTOS ====================

function poblarSelectAcentos() {
    ['selectAcentoManeja', 'selectAcentoNoManeja'].forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        // Keep the first option
        const first = sel.options[0];
        sel.innerHTML = '';
        sel.appendChild(first);
        ACENTOS_LISTA.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a;
            opt.textContent = a;
            sel.appendChild(opt);
        });
    });
}

function renderAcentosTags(arr, containerId, tipo) {
    const cont = document.getElementById(containerId);
    if (!cont) return;
    const cls = tipo === 'maneja' ? 'maneja' : 'no-maneja';
    cont.innerHTML = arr.map((a, i) =>
        `<span class="acento-tag ${cls}">
            ${a.replace(/</g, '&lt;')}
            <button type="button" onclick="eliminarAcento('${tipo}', ${i})">✕</button>
        </span>`
    ).join('');
}

window.eliminarAcento = function(tipo, i) {
    if (tipo === 'maneja') { acentosManejaArr.splice(i, 1); renderAcentosTags(acentosManejaArr, 'acentosManejaTagsContainer', 'maneja'); }
    else { acentosNoManejaArr.splice(i, 1); renderAcentosTags(acentosNoManejaArr, 'acentosNoManejaTagsContainer', 'nomaneja'); }
};

function agregarAcentoDesdeSelect(tipo) {
    const selId = tipo === 'maneja' ? 'selectAcentoManeja' : 'selectAcentoNoManeja';
    const sel = document.getElementById(selId);
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

function cargarAcentos(perfil) {
    try { acentosManejaArr = JSON.parse(perfil.acentos_maneja || '[]') || []; } catch { acentosManejaArr = []; }
    try { acentosNoManejaArr = JSON.parse(perfil.acentos_no_maneja || '[]') || []; } catch { acentosNoManejaArr = []; }
    renderAcentosTags(acentosManejaArr, 'acentosManejaTagsContainer', 'maneja');
    renderAcentosTags(acentosNoManejaArr, 'acentosNoManejaTagsContainer', 'nomaneja');
}

// ==================== FECHAS NO DISPONIBLES ====================

let fechasNoDisponibles = [];

function renderFechas() {
    const lista = document.getElementById('listaFechas');
    if (fechasNoDisponibles.length === 0) { lista.innerHTML = ''; return; }
    lista.innerHTML = fechasNoDisponibles.map((f, i) => `
        <div class="fecha-range-item">
            <input type="date" value="${f.desde || ''}">
            <span class="fecha-sep">hasta</span>
            <input type="date" value="${f.hasta || ''}">
            <button type="button" class="btn-remove-fecha" onclick="eliminarFecha(${i})">✕</button>
        </div>`).join('');
}

window.eliminarFecha = function(i) {
    fechasNoDisponibles.splice(i, 1);
    renderFechas();
};

function getFechasJSON() {
    const items = document.querySelectorAll('.fecha-range-item');
    const fechas = [];
    items.forEach(item => {
        const inputs = item.querySelectorAll('input[type="date"]');
        const desde = inputs[0]?.value || '';
        const hasta = inputs[1]?.value || '';
        if (desde || hasta) fechas.push({ desde, hasta });
    });
    return fechas.length ? JSON.stringify(fechas) : null;
}

document.getElementById('btnAgregarFecha').addEventListener('click', () => {
    fechasNoDisponibles.push({ desde: '', hasta: '' });
    renderFechas();
});

// ==================== FORMACIÓN ARTÍSTICA (simplificada) ====================

let formaciones = [];

function renderFormaciones() {
    const lista = document.getElementById('listaFormacion');
    const empty = document.getElementById('emptyFormacion');
    if (formaciones.length === 0) {
        lista.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    lista.innerHTML = formaciones.map((f, i) => `
        <div class="entry-card">
            <div class="entry-card-header">
                <span class="entry-number">Formación ${i + 1}</span>
                <button type="button" class="btn-remove-entry" onclick="eliminarFormacion(${i})">✕</button>
            </div>
            <div class="form-group">
                <label>Institución / Nombre</label>
                <input type="text" data-field="formacion-nombre-${i}"
                    value="${(f.nombre || '').replace(/"/g, '&quot;')}"
                    placeholder="Ej: Escuela de Artes (1999-2005)">
            </div>
        </div>`).join('');
    attachFieldListeners();
}

window.eliminarFormacion = function(i) {
    formaciones.splice(i, 1);
    renderFormaciones();
};

document.getElementById('btnAgregarFormacion').addEventListener('click', () => {
    formaciones.push({ nombre: '' });
    renderFormaciones();
});

// ==================== IDIOMAS ====================

let idiomas = [];

const IDIOMAS_LISTA = ['Español','Inglés','Francés','Alemán','Italiano','Portugués','Chino','Japonés','Árabe','Ruso','Coreano','Otro'];
const NIVELES_LISTA = [
    { v: 'Nativo', l: 'Nativo' },
    { v: 'A1', l: 'A1 - Principiante' }, { v: 'A2', l: 'A2 - Elemental' },
    { v: 'B1', l: 'B1 - Intermedio' },   { v: 'B2', l: 'B2 - Intermedio Alto' },
    { v: 'C1', l: 'C1 - Avanzado' },     { v: 'C2', l: 'C2 - Dominio' }
];

function idiomaOptions(selected) {
    return '<option value="">Seleccionar</option>' +
        IDIOMAS_LISTA.map(n => `<option value="${n}" ${n === selected ? 'selected' : ''}>${n}</option>`).join('');
}

function nivelOptions(selected) {
    return '<option value="">Seleccionar</option>' +
        NIVELES_LISTA.map(n => `<option value="${n.v}" ${n.v === selected ? 'selected' : ''}>${n.l}</option>`).join('');
}

function renderIdiomas() {
    const lista = document.getElementById('listaIdiomas');
    const empty = document.getElementById('emptyIdiomas');
    if (idiomas.length === 0) {
        lista.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    lista.innerHTML = idiomas.map((id, i) => `
        <div class="entry-card">
            <div class="entry-card-header">
                <span class="entry-number">Idioma ${i + 1}</span>
                <button type="button" class="btn-remove-entry" onclick="eliminarIdioma(${i})">✕</button>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Idioma</label>
                    <select data-field="idioma-idioma-${i}">${idiomaOptions(id.idioma)}</select>
                </div>
                <div class="form-group">
                    <label>Nivel</label>
                    <select data-field="idioma-nivel-${i}">${nivelOptions(id.nivel)}</select>
                </div>
            </div>
        </div>`).join('');
    attachFieldListeners();
}

window.eliminarIdioma = function(i) {
    idiomas.splice(i, 1);
    renderIdiomas();
};

document.getElementById('btnAgregarIdioma').addEventListener('click', () => {
    idiomas.push({ idioma: '', nivel: '' });
    renderIdiomas();
});

// ==================== EXPERIENCIA PROFESIONAL (simplificada) ====================

let experiencias = [];

const TIPOS_EXP = {
    television: 'Televisión', cine: 'Cine', teatro: 'Teatro',
    serie: 'Serie', comercial: 'Comercial', otra: 'Otro'
};

function renderExperiencias() {
    const lista = document.getElementById('listaExperiencia');
    const empty = document.getElementById('emptyExperiencia');
    if (experiencias.length === 0) {
        lista.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    lista.innerHTML = experiencias.map((exp, i) => `
        <div class="entry-card">
            <div class="entry-card-header">
                <span class="entry-number">Experiencia ${i + 1}</span>
                <button type="button" class="btn-remove-entry" onclick="eliminarExperiencia(${i})">✕</button>
            </div>
            <div class="form-group">
                <label>Tipo de experiencia</label>
                <select data-field="experiencia-tipo-${i}" onchange="toggleTipoOtro(${i}, this.value)">
                    <option value="">Seleccionar</option>
                    ${Object.entries(TIPOS_EXP).map(([v, l]) =>
                        `<option value="${v}" ${exp.tipo === v ? 'selected' : ''}>${l}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-group exp-otro-campo-${i}" style="${exp.tipo === 'otra' ? '' : 'display:none'}">
                <label>¿Cuál tipo de experiencia?</label>
                <input type="text" data-field="experiencia-tipo_nombre-${i}"
                    value="${(exp.tipo_nombre || '').replace(/"/g, '&quot;')}"
                    placeholder="Ej: Videos Musicales, Director, Publicidad...">
            </div>
            <div class="form-group">
                <label>Nombre de la producción o proyecto</label>
                <input type="text" data-field="experiencia-nombre-${i}"
                    value="${(exp.nombre || '').replace(/"/g, '&quot;')}"
                    placeholder="Ej: Mi primera novela (2010-2015)">
            </div>
        </div>`).join('');
    attachFieldListeners();
}

window.toggleTipoOtro = function(i, value) {
    const div = document.querySelector(`.exp-otro-campo-${i}`);
    if (div) div.style.display = value === 'otra' ? 'block' : 'none';
    experiencias[i].tipo = value;
};

window.eliminarExperiencia = function(i) {
    experiencias.splice(i, 1);
    renderExperiencias();
};

document.getElementById('btnAgregarExperiencia').addEventListener('click', () => {
    experiencias.push({ nombre: '', tipo: '', tipo_nombre: '' });
    renderExperiencias();
});

// ==================== SYNC FIELD ====================

function attachFieldListeners() {
    document.querySelectorAll('[data-field]').forEach(el => {
        el.addEventListener('change', syncField);
        el.addEventListener('input', syncField);
    });
}

function syncField(e) {
    const parts = e.target.getAttribute('data-field').split('-');
    const type = parts[0];
    const key  = parts.slice(1, -1).join('_'); // join middle parts with underscore
    const i    = parseInt(parts[parts.length - 1]);

    if (type === 'formacion')   formaciones[i][key]  = e.target.value;
    else if (type === 'experiencia') experiencias[i][key] = e.target.value;
    else if (type === 'idioma')      idiomas[i][key]      = e.target.value;
}

// ==================== CARGAR PERFIL ====================

async function cargarPerfil() {
    const token = verificarAutenticacion();
    if (!token) return;
    try {
        const response = await fetch(`${API_URL}/perfil`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            llenarFormulario(data.perfil);
            cargarFotos(data.fotos);
            cargarContratos();
            // Mostrar/ocultar botón de subida según permiso del admin
            const uploadLabel = document.querySelector('label[for="uploadContrato"]');
            if (uploadLabel) uploadLabel.style.display = data.perfil.puede_subir_contrato ? '' : 'none';
            const hint = document.querySelector('#tab-experiencia .card p');
            if (!data.perfil.puede_subir_contrato) {
                const msgEl = document.getElementById('contratoHint');
                if (msgEl) msgEl.style.display = 'block';
            }
        } else if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
        } else {
            mostrarNotificacion('Error al cargar el perfil', 'error');
        }
    } catch { mostrarNotificacion('Error de conexión', 'error'); }
}

function llenarFormulario(perfil) {
    document.getElementById('nombreActor').textContent = perfil.nombre;
    document.getElementById('emailActor').textContent  = perfil.email;
    document.getElementById('nombre').value            = perfil.nombre || '';
    document.getElementById('telefono').value          = perfil.telefono || '';
    const fecha = perfil.fecha_nacimiento ? perfil.fecha_nacimiento.split('T')[0] : '';
    document.getElementById('fechaNacimiento').value   = fecha;
    document.getElementById('genero').value            = perfil.genero || '';
    document.getElementById('ciudadNacimiento').value  = perfil.ciudad_nacimiento || '';
    document.getElementById('paisNacimiento').value    = perfil.pais_nacimiento || '';
    document.getElementById('altura').value            = perfil.altura || '';
    document.getElementById('peso').value              = perfil.peso || '';
    document.getElementById('colorOjos').value         = perfil.color_ojos || '';
    document.getElementById('colorCabello').value      = perfil.color_cabello || '';
    document.getElementById('tallaCamiseta').value     = perfil.talla_camiseta || '';
    document.getElementById('tallaPantalon').value     = perfil.talla_pantalon || '';
    document.getElementById('tallaZapatos').value      = perfil.talla_zapatos || '';
    document.getElementById('biografia').value         = perfil.biografia || '';

    // Edad aparente
    document.getElementById('edadAparenteMin').value = perfil.edad_aparente_min || '';
    document.getElementById('edadAparenteMax').value = perfil.edad_aparente_max || '';

    // Manager
    const tieneManager = perfil.tiene_manager;
    document.getElementById('tieneManager').value = tieneManager != null ? String(tieneManager) : '';
    document.getElementById('managerField').classList.toggle('visible', tieneManager == 1);
    document.getElementById('nombreManager').value = perfil.nombre_manager || '';

    // Fechas no disponibles
    try { fechasNoDisponibles = JSON.parse(perfil.fechas_no_disponibles || '[]') || []; }
    catch { fechasNoDisponibles = []; }
    renderFechas();

    // Foto
    if (perfil.foto_perfil) {
        document.getElementById('fotoPerfil').src = perfil.foto_perfil;
    }

    // Formaciones
    try { formaciones = JSON.parse(perfil.formacion_artistica || '[]') || []; }
    catch { formaciones = []; }
    renderFormaciones();

    // Experiencias
    try { experiencias = JSON.parse(perfil.experiencia || '[]') || []; }
    catch { experiencias = []; }
    renderExperiencias();

    // Idiomas
    try { idiomas = JSON.parse(perfil.idiomas || '[]') || []; }
    catch { idiomas = []; }
    renderIdiomas();

    // Redes sociales
    let redes = {};
    try { redes = JSON.parse(perfil.redes_sociales || '{}') || {}; } catch { redes = {}; }
    document.getElementById('redFacebook').value  = redes.facebook  || '';
    document.getElementById('redInstagram').value = redes.instagram || '';
    document.getElementById('redTiktok').value    = redes.tiktok    || '';
    document.getElementById('redImdb').value      = redes.imdb      || '';

    // Habilidades (checkboxes)
    cargarHabilidades(perfil.habilidades);
    renderHabilidades();

    // Acentos
    cargarAcentos(perfil);

    // Año inicio experiencia artística
    document.getElementById('anioInicioExperiencia').value = perfil.anio_inicio_experiencia || '';

    // Escenas de sexo
    document.getElementById('escenasSexo').value = perfil.escenas_sexo != null ? String(perfil.escenas_sexo) : '';

    // Desnudos
    document.getElementById('desnudos').value = perfil.desnudos != null ? String(perfil.desnudos) : '';

    // Link reel
    document.getElementById('linkReel').value = perfil.link_reel || '';
}

// ==================== RECOPILAR BODY COMPLETO ====================

function buildSaveBody() {
    return {
        nombre:            document.getElementById('nombre').value,
        telefono:          document.getElementById('telefono').value,
        fecha_nacimiento:  document.getElementById('fechaNacimiento').value,
        genero:            document.getElementById('genero').value,
        ciudad_nacimiento: document.getElementById('ciudadNacimiento').value || null,
        pais_nacimiento:   document.getElementById('paisNacimiento').value || null,
        altura:            document.getElementById('altura').value,
        peso:              document.getElementById('peso').value,
        color_ojos:        document.getElementById('colorOjos').value,
        color_cabello:     document.getElementById('colorCabello').value,
        talla_camiseta:    document.getElementById('tallaCamiseta').value,
        talla_pantalon:    document.getElementById('tallaPantalon').value,
        talla_zapatos:     document.getElementById('tallaZapatos').value,
        biografia:         document.getElementById('biografia').value,
        // Edad aparente
        edad_aparente_min: document.getElementById('edadAparenteMin').value || null,
        edad_aparente_max: document.getElementById('edadAparenteMax').value || null,
        // Manager
        tiene_manager:     document.getElementById('tieneManager').value !== '' ? parseInt(document.getElementById('tieneManager').value) : null,
        nombre_manager:    document.getElementById('nombreManager').value || null,
        // Fechas no disponibles
        fechas_no_disponibles: getFechasJSON(),
        // Experiencia artística
        anio_inicio_experiencia: document.getElementById('anioInicioExperiencia').value || null,
        // Reel / preferencias
        link_reel:         document.getElementById('linkReel').value || null,
        escenas_sexo:      document.getElementById('escenasSexo').value !== '' ? parseInt(document.getElementById('escenasSexo').value) : null,
        desnudos:          document.getElementById('desnudos').value !== '' ? parseInt(document.getElementById('desnudos').value) : null,
        // Habilidades (JSON array)
        habilidades:       getHabilidadesJSON(),
        // Acentos
        acentos_maneja: acentosManejaArr.length ? JSON.stringify(acentosManejaArr) : null,
        acentos_no_maneja: acentosNoManejaArr.length ? JSON.stringify(acentosNoManejaArr) : null,
        // Dinámicos
        experiencia:         JSON.stringify(experiencias),
        formacion_artistica: JSON.stringify(formaciones),
        idiomas:             JSON.stringify(idiomas),
        redes_sociales:      JSON.stringify({
            facebook:  document.getElementById('redFacebook').value,
            instagram: document.getElementById('redInstagram').value,
            tiktok:    document.getElementById('redTiktok').value,
            imdb:      document.getElementById('redImdb').value
        })
    };
}

// ==================== GUARDAR DATOS PERSONALES ====================

document.getElementById('formDatosPersonales').addEventListener('submit', async function(e) {
    e.preventDefault();
    const token = getToken();
    const btn = this.querySelector('button[type="submit"]');
    btn.textContent = 'Guardando...';
    btn.disabled = true;
    try {
        const response = await fetch(`${API_URL}/perfil`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(buildSaveBody())
        });
        if (response.ok) {
            mostrarNotificacion('Perfil actualizado exitosamente', 'success');
            const nombreActualizado = document.getElementById('nombre').value;
            document.getElementById('nombreActor').textContent = nombreActualizado;
            const actorCache = JSON.parse(localStorage.getItem('actor') || '{}');
            actorCache.nombre = nombreActualizado;
            actorCache.telefono = document.getElementById('telefono').value;
            localStorage.setItem('actor', JSON.stringify(actorCache));
        } else {
            mostrarNotificacion('Error al actualizar el perfil', 'error');
        }
    } catch { mostrarNotificacion('Error de conexión', 'error'); }
    finally {
        btn.textContent = 'Guardar Cambios';
        btn.disabled = false;
    }
});

// ==================== GUARDAR EXPERIENCIA ====================

document.getElementById('btnGuardarExperiencia').addEventListener('click', async function() {
    const token = getToken();
    const btn = this;
    btn.textContent = 'Guardando...';
    btn.disabled = true;
    try {
        const response = await fetch(`${API_URL}/perfil`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(buildSaveBody())
        });
        if (response.ok) {
            mostrarNotificacion('Guardado exitosamente', 'success');
        } else {
            mostrarNotificacion('Error al guardar', 'error');
        }
    } catch { mostrarNotificacion('Error de conexión', 'error'); }
    finally {
        btn.textContent = 'Guardar Todo';
        btn.disabled = false;
    }
});

// ==================== FOTOS ====================

document.getElementById('uploadFotoPerfil').addEventListener('change', async function(e) {
    if (!e.target.files[0]) return;
    const token = getToken();
    const formData = new FormData();
    formData.append('foto', e.target.files[0]);
    try {
        const response = await fetch(`${API_URL}/perfil/foto`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        if (response.ok) {
            const data = await response.json();
            document.getElementById('fotoPerfil').src = data.url;
            mostrarNotificacion('Foto de perfil actualizada', 'success');
            const actorCache = JSON.parse(localStorage.getItem('actor') || '{}');
            actorCache.foto_perfil = data.url;
            localStorage.setItem('actor', JSON.stringify(actorCache));
        } else {
            mostrarNotificacion('Error al subir la foto', 'error');
        }
    } catch { mostrarNotificacion('Error de conexión', 'error'); }
});

document.getElementById('uploadFotoGaleria').addEventListener('change', async function(e) {
    if (!e.target.files[0]) return;
    const token = getToken();
    const formData = new FormData();
    formData.append('foto', e.target.files[0]);
    try {
        const response = await fetch(`${API_URL}/perfil/fotos`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        if (response.ok) {
            mostrarNotificacion('Foto agregada a la galería', 'success');
            cargarPerfil();
        } else {
            mostrarNotificacion('Error al subir la foto', 'error');
        }
    } catch { mostrarNotificacion('Error de conexión', 'error'); }
});

function cargarFotos(fotos) {
    const galeria = document.getElementById('galeriaFotos');
    if (!fotos || fotos.length === 0) {
        galeria.innerHTML = '<div class="empty-state"><p>No tienes fotos adicionales aún. ¡Agrega tu primera foto!</p></div>';
        return;
    }
    galeria.innerHTML = fotos.map(foto => `
        <div class="photo-item">
            <img src="${foto.url_foto}" alt="${foto.descripcion || 'Foto'}">
            <div class="photo-item-overlay">
                <button class="btn-delete-photo" onclick="eliminarFoto(${foto.id})">🗑️ Eliminar</button>
            </div>
        </div>`).join('');
}

async function eliminarFoto(fotoId) {
    if (!confirm('¿Estás seguro de eliminar esta foto?')) return;
    const token = getToken();
    try {
        const response = await fetch(`${API_URL}/perfil/fotos/${fotoId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            mostrarNotificacion('Foto eliminada', 'success');
            cargarPerfil();
        } else {
            mostrarNotificacion('Error al eliminar la foto', 'error');
        }
    } catch { mostrarNotificacion('Error de conexión', 'error'); }
}


// ==================== CONTRATOS ====================

async function cargarContratos() {
    const token = getToken();
    try {
        const res = await fetch(API_URL + '/perfil/contratos', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        renderContratos(data.contratos || []);
    } catch { /* silencioso */ }
}

function renderContratos(contratos) {
    const lista = document.getElementById('listaContratos');
    const empty = document.getElementById('emptyContratos');
    if (!lista) return;
    if (contratos.length === 0) {
        lista.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';
    lista.innerHTML = contratos.map(ct => {
        const fecha = ct.fecha_subida ? new Date(ct.fecha_subida).toLocaleDateString('es-CO') : '';
        return `<div class="entry-card" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;">
            <div>
                <span style="font-size:20px;margin-right:8px">📄</span>
                <a href="${ct.url_contrato}" target="_blank" style="color:#910909;font-weight:600;font-size:14px">${ct.nombre_archivo}</a>
                <span style="color:#999;font-size:12px;margin-left:10px">${fecha}</span>
            </div>
            <button class="btn-remove-entry" onclick="eliminarContrato(${ct.id})">✕</button>
        </div>`;
    }).join('');
}

window.eliminarContrato = async function(id) {
    if (!confirm('¿Eliminar este contrato?')) return;
    const token = getToken();
    try {
        const res = await fetch(API_URL + '/perfil/contratos/' + id, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) { mostrarNotificacion('Contrato eliminado'); cargarContratos(); }
        else mostrarNotificacion('Error al eliminar', 'error');
    } catch { mostrarNotificacion('Error de conexión', 'error'); }
};


document.getElementById('uploadContrato').addEventListener('change', async function(e) {
    if (!e.target.files[0]) return;
    const token = getToken();
    const formData = new FormData();
    formData.append('contrato', e.target.files[0]);
    this.disabled = true;
    try {
        const res = await fetch(API_URL + '/perfil/contrato', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: formData
        });
        if (res.ok) { mostrarNotificacion('Contrato subido exitosamente'); cargarContratos(); }
        else { const d = await res.json(); mostrarNotificacion(d.error || 'Error al subir', 'error'); }
    } catch { mostrarNotificacion('Error de conexión', 'error'); }
    finally { this.disabled = false; this.value = ''; }
});

// ==================== CONTRASEÑA ====================

document.getElementById('formCambiarPassword').addEventListener('submit', async function(e) {
    e.preventDefault();
    const passwordNueva = document.getElementById('passwordNueva').value;
    const passwordConfirmar = document.getElementById('passwordConfirmar').value;
    if (passwordNueva !== passwordConfirmar) {
        mostrarNotificacion('Las contraseñas no coinciden', 'error');
        return;
    }
    const token = getToken();
    const btn = this.querySelector('button[type="submit"]');
    btn.textContent = 'Actualizando...';
    btn.disabled = true;
    try {
        const response = await fetch(`${API_URL}/perfil/password`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                passwordActual: document.getElementById('passwordActual').value,
                passwordNueva: passwordNueva
            })
        });
        if (response.ok) {
            mostrarNotificacion('Contraseña actualizada exitosamente', 'success');
            this.reset();
        } else {
            const data = await response.json();
            mostrarNotificacion(data.error || 'Error al cambiar la contraseña', 'error');
        }
    } catch { mostrarNotificacion('Error de conexión', 'error'); }
    finally {
        btn.textContent = 'Actualizar Contraseña';
        btn.disabled = false;
    }
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

// ==================== TABS ====================

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        document.getElementById(`tab-${this.getAttribute('data-tab')}`).classList.add('active');
    });
});

// ==================== INIT ====================

window.addEventListener('DOMContentLoaded', () => {
    // Cargar cache local
    const actorCache = localStorage.getItem('actor');
    if (actorCache) {
        const actor = JSON.parse(actorCache);
        document.getElementById('nombreActor').textContent = actor.nombre || '';
        document.getElementById('emailActor').textContent  = actor.email  || '';
        document.getElementById('nombre').value            = actor.nombre  || '';
        document.getElementById('telefono').value          = actor.telefono || '';
        if (actor.foto_perfil) {
            document.getElementById('fotoPerfil').src = actor.foto_perfil;
        }
    }

    // Poblar selects de años
    poblarSelectAnios('edadAparenteMin', 15, 80);
    poblarSelectAnios('edadAparenteMax', 15, 80);
    poblarSelectAnios('anioInicioExperiencia', 1960, new Date().getFullYear(), 'Seleccionar año');

    // Toggle manager
    document.getElementById('tieneManager').addEventListener('change', function() {
        document.getElementById('managerField').classList.toggle('visible', this.value === '1');
    });

    // Render habilidades vacío inicial
    renderHabilidades();

    // Otras habilidades — Enter y botón
    document.getElementById('habOtroTexto').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); agregarOtraHab(); }
    });
    document.getElementById('btnAgregarOtroHab').addEventListener('click', agregarOtraHab);

    // Acentos
    poblarSelectAcentos();
    document.getElementById('btnAgregarAcentoManeja').addEventListener('click', () => agregarAcentoDesdeSelect('maneja'));
    document.getElementById('btnAgregarAcentoNoManeja').addEventListener('click', () => agregarAcentoDesdeSelect('nomaneja'));
    document.getElementById('btnAgregarAcentoManejaOtro').addEventListener('click', () => agregarAcentoOtro('maneja'));
    document.getElementById('btnAgregarAcentoNoManejaOtro').addEventListener('click', () => agregarAcentoOtro('nomaneja'));
    document.getElementById('acentoManejaOtroTexto').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregarAcentoOtro('maneja'); } });
    document.getElementById('acentoNoManejaOtroTexto').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregarAcentoOtro('nomaneja'); } });

    // Cargar perfil desde API
    cargarPerfil();

    // Cargar convocatorias cuando se activa la pestaña
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.tab === 'convocatorias') cargarConvocatoriasActor();
        });
    });
});

// ==================== CONVOCATORIAS (ACTOR) ====================

async function cargarConvocatoriasActor() {
    const cont = document.getElementById('listaConvocatoriasActor');
    cont.innerHTML = '<div style="padding:20px;text-align:center;color:#aaa">Cargando...</div>';
    try {
        const res = await fetch(`${API_URL}/convocatorias`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!res.ok) { cont.innerHTML = '<p style="color:#aaa;text-align:center">No se pudieron cargar las convocatorias.</p>'; return; }
        const data = await res.json();
        const lista = data.convocatorias || [];
        if (lista.length === 0) {
            cont.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px">No hay convocatorias activas por el momento.</p>';
            return;
        }

        // Cargar personajes y postulación propia para cada convocatoria
        const detalle = await Promise.all(lista.map(async c => {
            const [resPj, resPost] = await Promise.all([
                fetch(`${API_URL}/convocatorias/${c.id}/personajes`, { headers: { 'Authorization': `Bearer ${getToken()}` } }),
                fetch(`${API_URL}/convocatorias/${c.id}/mi-postulacion`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
            ]);
            const { personajes = [] } = await resPj.json();
            const { postulacion = null } = await resPost.json();
            return { ...c, personajes, postulacion };
        }));

        cont.innerHTML = detalle.map(c => {
            const fechaLimite = c.fecha_limite
                ? `<div style="font-size:13px;color:#910909;font-weight:600;margin-bottom:8px">Fecha límite: ${new Date(c.fecha_limite.split('T')[0] + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}</div>`
                : '';
            const fechaPub = c.fecha_publicacion
                ? `<div style="font-size:12px;color:#bbb;margin-bottom:8px">Publicada el ${new Date(c.fecha_publicacion).toLocaleDateString('es-CO')}</div>`
                : '';

            let seccionPostular = '';
            if (c.postulacion) {
                seccionPostular = `
                    <div style="margin-top:14px;background:#e8f5e9;border-radius:8px;padding:12px 16px;font-size:13px;color:#1d6f42">
                        <strong>✓ Ya te postulaste</strong> para el personaje: <strong>${c.postulacion.personaje.replace(/</g, '&lt;')}</strong>
                    </div>`;
            } else if (c.personajes.length > 0) {
                const opciones = c.personajes.map(p =>
                    `<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1.5px solid #eee;border-radius:8px;cursor:pointer;margin-bottom:6px;font-size:14px">
                        <input type="radio" name="personaje_${c.id}" value="${p.id}" style="accent-color:#910909">
                        <span><strong>${p.nombre.replace(/</g, '&lt;')}</strong>${p.descripcion ? `<span style="color:#888;font-size:12px;margin-left:6px">${p.descripcion.replace(/</g, '&lt;')}</span>` : ''}</span>
                    </label>`
                ).join('');
                seccionPostular = `
                    <div style="margin-top:14px">
                        <p style="font-size:13px;font-weight:600;color:#555;margin:0 0 8px">Selecciona un personaje para postularte:</p>
                        <div>${opciones}</div>
                        <button onclick="postularse(${c.id})"
                            style="margin-top:10px;padding:9px 22px;background:linear-gradient(135deg,#910909,#c92a2a);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">
                            Postularme
                        </button>
                        <p id="msgPostular_${c.id}" style="font-size:13px;margin-top:8px;display:none"></p>
                    </div>`;
            } else {
                seccionPostular = `<p style="font-size:13px;color:#bbb;margin-top:10px">Esta convocatoria no tiene personajes definidos aún.</p>`;
            }

            return `
            <div style="border:1px solid #eee;border-radius:10px;padding:18px 20px;margin-bottom:16px;border-left:4px solid #910909">
                <h3 style="margin:0 0 4px;font-size:16px;color:#222">${(c.titulo || '').replace(/</g, '&lt;')}</h3>
                ${fechaPub}${fechaLimite}
                ${c.descripcion ? `<p style="font-size:14px;color:#555;line-height:1.6;margin-bottom:10px;white-space:pre-wrap">${c.descripcion.replace(/</g, '&lt;')}</p>` : ''}
                ${c.requisitos ? `<div style="background:#fafafa;border-radius:8px;padding:10px 14px;font-size:13px;color:#444;white-space:pre-wrap;margin-bottom:4px"><strong>Requisitos:</strong><br>${c.requisitos.replace(/</g, '&lt;')}</div>` : ''}
                ${seccionPostular}
            </div>`;
        }).join('');
    } catch (e) {
        console.error(e);
        cont.innerHTML = '<p style="color:#aaa;text-align:center">Error de conexión.</p>';
    }
}

window.postularse = async function(convId) {
    const seleccionado = document.querySelector(`input[name="personaje_${convId}"]:checked`);
    const msg = document.getElementById(`msgPostular_${convId}`);
    if (!seleccionado) {
        msg.textContent = 'Debes seleccionar un personaje.';
        msg.style.color = '#910909';
        msg.style.display = 'block';
        return;
    }
    try {
        const res = await fetch(`${API_URL}/convocatorias/${convId}/postular`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ personaje_id: parseInt(seleccionado.value) })
        });
        const data = await res.json();
        if (res.ok) {
            cargarConvocatoriasActor();
        } else {
            msg.textContent = data.error || 'Error al postularse.';
            msg.style.color = '#910909';
            msg.style.display = 'block';
        }
    } catch {
        msg.textContent = 'Error de conexión.';
        msg.style.color = '#910909';
        msg.style.display = 'block';
    }
};
