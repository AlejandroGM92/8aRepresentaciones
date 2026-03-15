const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const https = require('https');
const { OAuth2Client } = require('google-auth-library');
const fs = require('fs');
const crypto = require('crypto');
const XLSX = require('xlsx');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const mailer = require('./mailer');
require('dotenv').config();

if (!fs.existsSync('uploads/contratos')) fs.mkdirSync('uploads/contratos', { recursive: true });

const app = express();
app.set('trust proxy', 1); // Necesario para rate limiting detrás de proxy/Hostinger

// Cabeceras de seguridad HTTP (clickjacking, MIME sniffing, XSS, etc.)
app.use(helmet({
    contentSecurityPolicy: false, // Se desactiva CSP para no romper CDN scripts (Google/Microsoft)
    crossOriginEmbedderPolicy: false
}));

// Middleware
// En producción restringe CORS al dominio configurado en APP_URL.
// En desarrollo permite cualquier origen (el frontend corre en el mismo servidor Express).
if (process.env.NODE_ENV === 'production' && process.env.APP_URL) {
    const allowedOrigins = process.env.APP_URL.split(',').map(s => s.trim());
    app.use(cors({
        origin: (origin, cb) => {
            if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
            cb(new Error('Origen no permitido por CORS'));
        },
        credentials: true
    }));
} else {
    app.use(cors());
}

// Rate limiting en rutas de autenticación
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 20,                   // máximo 20 intentos por ventana
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Espera 15 minutos e intenta de nuevo.' }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/estilos', express.static(path.join(__dirname, 'estilos')));
app.use('/funcionalidad', express.static(path.join(__dirname, 'funcionalidad')));
app.use('/imagenes', express.static(path.join(__dirname, 'imagenes')));

app.get('/login.html', (_req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/registro.html', (_req, res) => res.sendFile(path.join(__dirname, 'registro.html')));
app.get('/perfil.html', (_req, res) => res.sendFile(path.join(__dirname, 'perfil.html')));
app.get('/completar-perfil.html', (_req, res) => res.sendFile(path.join(__dirname, 'completar-perfil.html')));
app.get('/admin.html', (_req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/admin-actor-form.html', (_req, res) => res.sendFile(path.join(__dirname, 'admin-actor-form.html')));
app.get('/casting.html', (_req, res) => res.sendFile(path.join(__dirname, 'casting.html')));
app.get('/registro-casting.html', (_req, res) => res.sendFile(path.join(__dirname, 'registro-casting.html')));
app.get('/auth-redirect.html', (_req, res) => res.sendFile(path.join(__dirname, 'auth-redirect.html')));
app.get('/', (_req, res) => res.redirect('/login.html'));

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
        cb(null, Date.now() + '-' + crypto.randomBytes(8).toString('hex') + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Solo se permiten imágenes (jpeg, jpg, png, gif)'));
    }
});


const uploadContrato = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, 'uploads/contratos/'),
        filename: (_req, _file, cb) => cb(null, Date.now() + '-' + crypto.randomBytes(8).toString('hex') + '.pdf')
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Solo se permiten archivos PDF'));
    }
});

// Configuración de la base de datos
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || '8a_representaciones',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Promisify para usar async/await
const promisePool = db.promise();

// ==================== VALIDACIÓN DE CONTRASEÑA ====================

function validarPassword(password) {
    if (!password || password.length < 8)
        return 'La contraseña debe tener al menos 8 caracteres';
    if (!/[A-Z]/.test(password))
        return 'La contraseña debe incluir al menos una letra mayúscula';
    if (!/[0-9]/.test(password))
        return 'La contraseña debe incluir al menos un número';
    if (!/[!@#$%^&*()_\-+={}[\]|:;"\'<>,.?/\\~`]/.test(password))
        return 'La contraseña debe incluir al menos un símbolo (!@#$%...)';
    return null;
}

// Secret para JWT
const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_super_seguro_cambialo_en_produccion';
if (!process.env.JWT_SECRET) {
    console.warn('⚠️  ADVERTENCIA: JWT_SECRET no está definido en .env. Usa un secreto seguro en producción.');
}

// Middleware para verificar token
const verificarToken = (req, res, next) => {
    const token = req.headers['authorization'];
    
    if (!token) {
        return res.status(403).json({ error: 'Token no proporcionado' });
    }

    try {
        const decoded = jwt.verify(token.replace('Bearer ', ''), JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido' });
    }
};

// Middleware para verificar admin
const verificarAdmin = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: 'Token no proporcionado' });
    try {
        const decoded = jwt.verify(token.replace('Bearer ', ''), JWT_SECRET);
        if (!decoded.is_admin) return res.status(403).json({ error: 'Acceso denegado' });
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido' });
    }
};

// Middleware para verificar casting director (o admin)
const verificarCasting = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: 'Token no proporcionado' });
    try {
        const decoded = jwt.verify(token.replace('Bearer ', ''), JWT_SECRET);
        if (!decoded.is_admin && !decoded.is_casting) return res.status(403).json({ error: 'Acceso denegado' });
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido' });
    }
};

// ==================== RUTAS ====================

// Registro de nuevo actor
app.post('/api/registro', authLimiter, async (req, res) => {
    try {
        const {
            nombre, email, password, telefono, fecha_nacimiento, genero,
            altura, peso, color_ojos, color_cabello, biografia, experiencia, habilidades,
            talla_camiseta, talla_pantalon, talla_zapatos,
            formacion_artistica, redes_sociales, idiomas
        } = req.body;

        // Validaciones básicas
        if (!nombre || !email || !password) {
            return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
        }

        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Email inválido' });
        }

        // Validar contraseña fuerte
        const errPass = validarPassword(password);
        if (errPass) return res.status(400).json({ error: errPass });

        // Verificar si el email ya existe
        const [existingUser] = await promisePool.query(
            'SELECT id FROM actores WHERE email = ?',
            [email]
        );

        if (existingUser.length > 0) {
            return res.status(400).json({ error: 'El email ya está registrado' });
        }

        // Encriptar contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insertar nuevo actor con todos los campos
        const [result] = await promisePool.query(
            `INSERT INTO actores (
                nombre, email, password, telefono, fecha_nacimiento, genero,
                altura, peso, color_ojos, color_cabello, biografia, experiencia,
                habilidades, talla_camiseta, talla_pantalon, talla_zapatos,
                formacion_artistica, redes_sociales, idiomas, fecha_registro
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                nombre, email, hashedPassword,
                telefono || null, fecha_nacimiento || null, genero || null,
                altura || null, peso || null, color_ojos || null, color_cabello || null,
                biografia || null, experiencia || null, habilidades || null,
                talla_camiseta || null, talla_pantalon || null, talla_zapatos || null,
                formacion_artistica || null, redes_sociales || null, idiomas || null
            ]
        );

        // Correo de bienvenida en background
        mailer.enviarBienvenida({ nombre, email }).catch(e => console.error('Mailer bienvenida:', e));
        await registrarAuditoria(result.insertId, 'registro', `Nuevo actor registrado: ${email}`, req.ip);

        res.status(201).json({
            mensaje: 'Actor registrado exitosamente',
            actorId: result.insertId
        });

    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ error: 'Error al registrar el actor' });
    }
});

// Login
app.post('/api/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validaciones
        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña son requeridos' });
        }

        // Buscar actor
        const [actors] = await promisePool.query(
            'SELECT * FROM actores WHERE email = ?',
            [email]
        );

        if (actors.length === 0) {
            await registrarAuditoria(null, 'login_fallido', `Email no encontrado: ${email}`, req.ip);
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const actor = actors[0];

        // Verificar contraseña
        const passwordMatch = await bcrypt.compare(password, actor.password);

        if (!passwordMatch) {
            await registrarAuditoria(actor.id, 'login_fallido', 'Contraseña incorrecta', req.ip);
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // Generar token JWT
        const token = jwt.sign(
            { id: actor.id, email: actor.email, is_admin: actor.is_admin === 1, is_casting: actor.is_casting === 1 },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        await registrarAuditoria(actor.id, 'login_exitoso', `Sesión iniciada: ${actor.email}`, req.ip);

        // Si tiene 2FA activo, retornar token temporal para completar verificación
        if (actor.totp_enabled) {
            const tempToken = jwt.sign({ id: actor.id, scope: '2fa' }, JWT_SECRET, { expiresIn: '5m' });
            return res.json({ require_2fa: true, temp_token: tempToken });
        }

        res.json({
            mensaje: 'Login exitoso',
            token: token,
            actor: {
                id: actor.id,
                nombre: actor.nombre,
                email: actor.email,
                telefono: actor.telefono,
                foto_perfil: actor.foto_perfil,
                is_admin: actor.is_admin === 1,
                is_casting: actor.is_casting === 1
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});

// Obtener perfil del actor
app.get('/api/perfil', verificarToken, async (req, res) => {
    try {
        const [actors] = await promisePool.query(
            `SELECT id, nombre, email, telefono, fecha_nacimiento, genero, altura,
             peso, color_ojos, color_cabello, biografia, experiencia, habilidades,
             foto_perfil, fecha_registro, talla_camiseta, talla_pantalon, talla_zapatos,
             formacion_artistica, redes_sociales, idiomas,
             edad_aparente_min, edad_aparente_max,
             tiene_manager, nombre_manager, fechas_no_disponibles,
             anio_inicio_experiencia, escenas_sexo, desnudos, link_reel,
             ciudad_nacimiento, pais_nacimiento, puede_subir_contrato,
             acentos_maneja, acentos_no_maneja
             FROM actores WHERE id = ?`,
            [req.userId]
        );

        if (actors.length === 0) {
            return res.status(404).json({ error: 'Actor no encontrado' });
        }

        // Obtener fotos adicionales
        const [fotos] = await promisePool.query(
            'SELECT id, url_foto, descripcion FROM fotos_actor WHERE actor_id = ?',
            [req.userId]
        );

        res.json({
            perfil: actors[0],
            fotos: fotos
        });

    } catch (error) {
        console.error('Error al obtener perfil:', error);
        res.status(500).json({ error: 'Error al obtener el perfil' });
    }
});

// Actualizar perfil
app.put('/api/perfil', verificarToken, async (req, res) => {
    try {
        const {
            nombre, telefono, fecha_nacimiento, genero, altura, peso,
            color_ojos, color_cabello, biografia, experiencia, habilidades,
            talla_camiseta, talla_pantalon, talla_zapatos,
            formacion_artistica, redes_sociales, idiomas,
            edad_aparente_min, edad_aparente_max,
            tiene_manager, nombre_manager, fechas_no_disponibles,
            anio_inicio_experiencia, escenas_sexo, desnudos, link_reel,
            ciudad_nacimiento, pais_nacimiento,
            acentos_maneja, acentos_no_maneja
        } = req.body;

        await promisePool.query(
            `UPDATE actores SET
             nombre = ?, telefono = ?, fecha_nacimiento = ?, genero = ?,
             altura = ?, peso = ?, color_ojos = ?, color_cabello = ?,
             biografia = ?, experiencia = ?, habilidades = ?, perfil_completo = 1,
             talla_camiseta = ?, talla_pantalon = ?, talla_zapatos = ?,
             formacion_artistica = ?, redes_sociales = ?, idiomas = ?,
             edad_aparente_min = ?, edad_aparente_max = ?,
             tiene_manager = ?, nombre_manager = ?, fechas_no_disponibles = ?,
             anio_inicio_experiencia = ?, escenas_sexo = ?, desnudos = ?, link_reel = ?,
             ciudad_nacimiento = ?, pais_nacimiento = ?,
             acentos_maneja = ?, acentos_no_maneja = ?
             WHERE id = ?`,
            [nombre, telefono || null, fecha_nacimiento || null, genero || null,
             altura || null, peso || null, color_ojos || null, color_cabello || null,
             biografia || null, experiencia || null, habilidades || null,
             talla_camiseta || null, talla_pantalon || null, talla_zapatos || null,
             formacion_artistica || null, redes_sociales || null, idiomas || null,
             edad_aparente_min || null, edad_aparente_max || null,
             tiene_manager != null ? tiene_manager : null,
             nombre_manager || null, fechas_no_disponibles || null,
             anio_inicio_experiencia || null,
             escenas_sexo != null ? escenas_sexo : null,
             desnudos != null ? desnudos : null,
             link_reel || null,
             ciudad_nacimiento || null, pais_nacimiento || null,
             acentos_maneja || null, acentos_no_maneja || null,
             req.userId]
        );

        // Registrar notificación con detalle de campos cambiados
        try {
            const [[actorActual]] = await promisePool.query(
                `SELECT nombre, telefono, fecha_nacimiento, genero, altura, peso,
                 color_ojos, color_cabello, biografia, experiencia, habilidades,
                 talla_camiseta, talla_pantalon, talla_zapatos, formacion_artistica,
                 redes_sociales, idiomas, edad_aparente_min, edad_aparente_max,
                 tiene_manager, nombre_manager, fechas_no_disponibles,
                 anio_inicio_experiencia, escenas_sexo, desnudos, link_reel,
                 ciudad_nacimiento, pais_nacimiento, acentos_maneja, acentos_no_maneja
                 FROM actores WHERE id = ?`, [req.userId]
            );
            const etiquetas = {
                nombre: 'Nombre', telefono: 'Teléfono', fecha_nacimiento: 'Fecha de nacimiento',
                genero: 'Género', altura: 'Altura', peso: 'Peso',
                color_ojos: 'Color de ojos', color_cabello: 'Color de cabello',
                biografia: 'Biografía', experiencia: 'Experiencia', habilidades: 'Habilidades',
                talla_camiseta: 'Talla camiseta', talla_pantalon: 'Talla pantalón',
                talla_zapatos: 'Talla zapatos', formacion_artistica: 'Formación artística',
                redes_sociales: 'Redes sociales', idiomas: 'Idiomas',
                edad_aparente_min: 'Edad aparente mín', edad_aparente_max: 'Edad aparente máx',
                tiene_manager: 'Manager', nombre_manager: 'Nombre manager',
                fechas_no_disponibles: 'Fechas no disponibles',
                anio_inicio_experiencia: 'Año inicio exp.', escenas_sexo: 'Escenas íntimas',
                desnudos: 'Desnudos', link_reel: 'Link reel',
                ciudad_nacimiento: 'Ciudad de nacimiento', pais_nacimiento: 'País de nacimiento',
                acentos_maneja: 'Acentos', acentos_no_maneja: 'Acentos (no maneja)'
            };
            const nuevos = {
                nombre, telefono, fecha_nacimiento, genero, altura, peso,
                color_ojos, color_cabello, biografia, experiencia, habilidades,
                talla_camiseta, talla_pantalon, talla_zapatos, formacion_artistica,
                redes_sociales, idiomas, edad_aparente_min, edad_aparente_max,
                tiene_manager, nombre_manager, fechas_no_disponibles,
                anio_inicio_experiencia, escenas_sexo, desnudos, link_reel,
                ciudad_nacimiento, pais_nacimiento, acentos_maneja, acentos_no_maneja
            };
            const cambiados = Object.keys(etiquetas).filter(campo => {
                const viejo = String(actorActual[campo] ?? '').trim();
                const nuevo = String(nuevos[campo] ?? '').trim();
                return viejo !== nuevo;
            }).map(c => etiquetas[c]);

            const detalle = cambiados.length > 0
                ? 'Actualizó: ' + cambiados.join(', ')
                : 'Actualizó su perfil';

            await promisePool.query(
                'INSERT INTO notificaciones_admin (actor_id, actor_nombre, detalle) VALUES (?, ?, ?)',
                [req.userId, actorActual ? actorActual.nombre : 'Actor', detalle]
            );
        } catch { /* no bloquear si la tabla aún no existe */ }

        res.json({ mensaje: 'Perfil actualizado exitosamente' });

    } catch (error) {
        console.error('Error al actualizar perfil:', error);
        res.status(500).json({ error: 'Error al actualizar el perfil' });
    }
});

// Subir foto de perfil
app.post('/api/perfil/foto', verificarToken, upload.single('foto'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se proporcionó ninguna foto' });
        }

        const fotoUrl = `/uploads/${req.file.filename}`;

        await promisePool.query(
            'UPDATE actores SET foto_perfil = ? WHERE id = ?',
            [fotoUrl, req.userId]
        );

        try {
            const [[actor]] = await promisePool.query('SELECT nombre FROM actores WHERE id = ?', [req.userId]);
            await promisePool.query(
                'INSERT INTO notificaciones_admin (actor_id, actor_nombre, detalle) VALUES (?, ?, ?)',
                [req.userId, actor ? actor.nombre : 'Actor', 'Actualizó: Foto de perfil']
            );
        } catch { /* silencioso */ }

        res.json({
            mensaje: 'Foto de perfil actualizada',
            url: fotoUrl
        });

    } catch (error) {
        console.error('Error al subir foto:', error);
        res.status(500).json({ error: 'Error al subir la foto' });
    }
});

// Agregar foto adicional
app.post('/api/perfil/fotos', verificarToken, upload.single('foto'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se proporcionó ninguna foto' });
        }

        const fotoUrl = `/uploads/${req.file.filename}`;
        const descripcion = req.body.descripcion || '';

        const [result] = await promisePool.query(
            'INSERT INTO fotos_actor (actor_id, url_foto, descripcion) VALUES (?, ?, ?)',
            [req.userId, fotoUrl, descripcion]
        );

        try {
            const [[actor]] = await promisePool.query('SELECT nombre FROM actores WHERE id = ?', [req.userId]);
            await promisePool.query(
                'INSERT INTO notificaciones_admin (actor_id, actor_nombre, detalle) VALUES (?, ?, ?)',
                [req.userId, actor ? actor.nombre : 'Actor', 'Actualizó: Foto adicional agregada']
            );
        } catch { /* silencioso */ }

        res.json({
            mensaje: 'Foto agregada exitosamente',
            foto: {
                id: result.insertId,
                url: fotoUrl,
                descripcion: descripcion
            }
        });

    } catch (error) {
        console.error('Error al agregar foto:', error);
        res.status(500).json({ error: 'Error al agregar la foto' });
    }
});

// Eliminar foto adicional
app.delete('/api/perfil/fotos/:id', verificarToken, async (req, res) => {
    try {
        const fotoId = req.params.id;

        // Verificar que la foto pertenece al actor
        const [fotos] = await promisePool.query(
            'SELECT * FROM fotos_actor WHERE id = ? AND actor_id = ?',
            [fotoId, req.userId]
        );

        if (fotos.length === 0) {
            return res.status(404).json({ error: 'Foto no encontrada' });
        }

        await promisePool.query('DELETE FROM fotos_actor WHERE id = ?', [fotoId]);

        res.json({ mensaje: 'Foto eliminada exitosamente' });

    } catch (error) {
        console.error('Error al eliminar foto:', error);
        res.status(500).json({ error: 'Error al eliminar la foto' });
    }
});

// Cambiar contraseña
app.put('/api/perfil/password', verificarToken, async (req, res) => {
    try {
        const { passwordActual, passwordNueva } = req.body;

        if (!passwordActual || !passwordNueva) {
            return res.status(400).json({ error: 'Se requieren ambas contraseñas' });
        }
        const errPassNueva = validarPassword(passwordNueva);
        if (errPassNueva) return res.status(400).json({ error: errPassNueva });

        // Obtener contraseña actual del usuario
        const [actors] = await promisePool.query(
            'SELECT password FROM actores WHERE id = ?',
            [req.userId]
        );

        if (actors.length === 0) {
            return res.status(404).json({ error: 'Actor no encontrado' });
        }

        // Verificar contraseña actual
        const passwordMatch = await bcrypt.compare(passwordActual, actors[0].password);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Contraseña actual incorrecta' });
        }

        // Encriptar nueva contraseña
        const hashedPassword = await bcrypt.hash(passwordNueva, 10);

        await promisePool.query(
            'UPDATE actores SET password = ? WHERE id = ?',
            [hashedPassword, req.userId]
        );
        await registrarAuditoria(req.userId, 'cambio_contrasena', 'Contraseña actualizada por el usuario', req.ip);

        res.json({ mensaje: 'Contraseña actualizada exitosamente' });

    } catch (error) {
        console.error('Error al cambiar contraseña:', error);
        res.status(500).json({ error: 'Error al cambiar la contraseña' });
    }
});

// ==================== AUDITORÍA ====================

async function registrarAuditoria(actorId, accion, detalle, ip) {
    try {
        await promisePool.query(
            'INSERT INTO audit_log (actor_id, accion, detalle, ip) VALUES (?, ?, ?, ?)',
            [actorId || null, accion, detalle || null, ip || null]
        );
    } catch { /* No bloquear la app si el log falla */ }
}

// ==================== OAUTH ====================

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Función auxiliar para crear/encontrar usuario OAuth y retornar JWT
async function manejarUsuarioOAuth(email, nombre, fotoUrl, idColumn, idValue) {
    // Buscar por proveedor ID
    const [porId] = await promisePool.query(
        `SELECT * FROM actores WHERE ${idColumn} = ?`, [idValue]
    );
    if (porId.length > 0) {
        const actor = porId[0];
        const token = jwt.sign(
            { id: actor.id, email: actor.email, is_admin: actor.is_admin === 1, is_casting: actor.is_casting === 1 },
            JWT_SECRET, { expiresIn: '7d' }
        );
        return { token, actor, perfil_completo: actor.perfil_completo === 1 };
    }

    // Buscar por email (puede existir como cuenta local)
    const [porEmail] = await promisePool.query(
        'SELECT * FROM actores WHERE email = ?', [email]
    );
    if (porEmail.length > 0) {
        const actor = porEmail[0];
        // Si era cuenta local, marcar perfil_completo = 1 y vincular el ID OAuth
        const eraLocal = !actor.auth_provider || actor.auth_provider === 'local';
        await promisePool.query(
            `UPDATE actores SET ${idColumn} = ?, perfil_completo = ? WHERE id = ?`,
            [idValue, eraLocal ? 1 : actor.perfil_completo, actor.id]
        );
        const token = jwt.sign(
            { id: actor.id, email: actor.email, is_admin: actor.is_admin === 1, is_casting: actor.is_casting === 1 },
            JWT_SECRET, { expiresIn: '7d' }
        );
        return { token, actor, perfil_completo: eraLocal ? true : actor.perfil_completo === 1 };
    }

    // Crear nuevo usuario
    const proveedor = idColumn === 'google_id' ? 'google' : 'microsoft';
    const [result] = await promisePool.query(
        `INSERT INTO actores (nombre, email, foto_perfil, ${idColumn}, auth_provider, perfil_completo, fecha_registro)
         VALUES (?, ?, ?, ?, ?, 0, NOW())`,
        [nombre, email, fotoUrl || null, idValue, proveedor]
    );
    const nuevoActor = { id: result.insertId, nombre, email, foto_perfil: fotoUrl || null, is_admin: false, is_casting: false };
    const token = jwt.sign(
        { id: nuevoActor.id, email: nuevoActor.email, is_admin: false, is_casting: false },
        JWT_SECRET, { expiresIn: '7d' }
    );
    return { token, actor: nuevoActor, perfil_completo: false };
}

// Google OAuth
app.post('/api/auth/google', async (req, res) => {
    try {
        const { token } = req.body;
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        const { sub: googleId, name, email, picture } = payload;

        const resultado = await manejarUsuarioOAuth(email, name, picture, 'google_id', googleId);
        res.json(resultado);
    } catch (error) {
        console.error('Error Google OAuth:', error);
        res.status(401).json({ error: 'Token de Google inválido' });
    }
});

// Microsoft OAuth
app.post('/api/auth/microsoft', async (req, res) => {
    try {
        const { token } = req.body;

        // Verificar con Microsoft Graph API
        const userData = await new Promise((resolve, reject) => {
            const options = {
                hostname: 'graph.microsoft.com',
                path: '/v1.0/me',
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` }
            };
            const request = https.request(options, (response) => {
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    if (response.statusCode === 200) resolve(JSON.parse(data));
                    else reject(new Error(`Graph API error: ${response.statusCode} - ${data}`));
                });
            });
            request.on('error', reject);
            request.end();
        });

        const msId = userData.id;
        const nombre = userData.displayName;
        const email = userData.mail || userData.userPrincipalName;

        const resultado = await manejarUsuarioOAuth(email, nombre, null, 'microsoft_id', msId);
        res.json(resultado);
    } catch (error) {
        console.error('Error Microsoft OAuth:', error);
        res.status(401).json({ error: 'Token de Microsoft inválido' });
    }
});

// ==================== 2FA (TOTP) ====================

// Generar QR para activar 2FA
app.get('/api/auth/2fa/setup', verificarToken, async (req, res) => {
    try {
        const [[actor]] = await promisePool.query('SELECT nombre, email, totp_enabled FROM actores WHERE id=?', [req.userId]);
        if (!actor) return res.status(404).json({ error: 'Actor no encontrado' });
        if (actor.totp_enabled) return res.status(400).json({ error: 'El 2FA ya está activado' });

        const secret = speakeasy.generateSecret({ name: `8a Representaciones (${actor.email})`, length: 20 });
        // Guardar secreto temporal (no activado aún) hasta que el usuario verifique
        await promisePool.query('UPDATE actores SET totp_secret=? WHERE id=?', [secret.base32, req.userId]);

        const qrUrl = await QRCode.toDataURL(secret.otpauth_url);
        res.json({ qr: qrUrl, secret: secret.base32 });
    } catch (error) {
        console.error('Error 2FA setup:', error);
        res.status(500).json({ error: 'Error al generar 2FA' });
    }
});

// Activar 2FA verificando primer código TOTP
app.post('/api/auth/2fa/activate', verificarToken, async (req, res) => {
    try {
        const { codigo } = req.body;
        if (!codigo) return res.status(400).json({ error: 'Código requerido' });

        const [[actor]] = await promisePool.query('SELECT totp_secret FROM actores WHERE id=?', [req.userId]);
        if (!actor || !actor.totp_secret) return res.status(400).json({ error: 'Primero genera el QR de configuración' });

        const valido = speakeasy.totp.verify({ secret: actor.totp_secret, encoding: 'base32', token: codigo, window: 1 });
        if (!valido) return res.status(400).json({ error: 'Código incorrecto. Verifica tu app autenticadora.' });

        await promisePool.query('UPDATE actores SET totp_enabled=1 WHERE id=?', [req.userId]);
        await registrarAuditoria(req.userId, '2fa_activado', 'Autenticación de dos factores activada', req.ip);
        res.json({ mensaje: '2FA activado exitosamente' });
    } catch (error) {
        console.error('Error 2FA activate:', error);
        res.status(500).json({ error: 'Error al activar 2FA' });
    }
});

// Deshabilitar 2FA
app.post('/api/auth/2fa/disable', verificarToken, async (req, res) => {
    try {
        const { codigo } = req.body;
        if (!codigo) return res.status(400).json({ error: 'Código requerido para deshabilitar 2FA' });

        const [[actor]] = await promisePool.query('SELECT totp_secret, totp_enabled FROM actores WHERE id=?', [req.userId]);
        if (!actor || !actor.totp_enabled) return res.status(400).json({ error: '2FA no está activado' });

        const valido = speakeasy.totp.verify({ secret: actor.totp_secret, encoding: 'base32', token: codigo, window: 1 });
        if (!valido) return res.status(400).json({ error: 'Código incorrecto' });

        await promisePool.query('UPDATE actores SET totp_enabled=0, totp_secret=NULL WHERE id=?', [req.userId]);
        await registrarAuditoria(req.userId, '2fa_deshabilitado', 'Autenticación de dos factores deshabilitada', req.ip);
        res.json({ mensaje: '2FA deshabilitado exitosamente' });
    } catch (error) {
        console.error('Error 2FA disable:', error);
        res.status(500).json({ error: 'Error al deshabilitar 2FA' });
    }
});

// Verificar código TOTP durante login (segundo paso)
app.post('/api/auth/2fa/verify', async (req, res) => {
    try {
        const { temp_token, codigo } = req.body;
        if (!temp_token || !codigo) return res.status(400).json({ error: 'Token temporal y código requeridos' });

        let decoded;
        try {
            decoded = jwt.verify(temp_token, JWT_SECRET);
        } catch {
            return res.status(401).json({ error: 'Token temporal inválido o expirado' });
        }
        if (decoded.scope !== '2fa') return res.status(401).json({ error: 'Token inválido' });

        const [[actor]] = await promisePool.query(
            'SELECT id, nombre, email, telefono, foto_perfil, is_admin, is_casting, totp_secret, totp_enabled FROM actores WHERE id=?',
            [decoded.id]
        );
        if (!actor || !actor.totp_enabled) return res.status(400).json({ error: 'Actor no encontrado o 2FA no activo' });

        const valido = speakeasy.totp.verify({ secret: actor.totp_secret, encoding: 'base32', token: codigo, window: 1 });
        if (!valido) {
            await registrarAuditoria(actor.id, 'login_2fa_fallido', 'Código TOTP incorrecto', req.ip);
            return res.status(401).json({ error: 'Código incorrecto' });
        }

        const token = jwt.sign(
            { id: actor.id, email: actor.email, is_admin: actor.is_admin === 1, is_casting: actor.is_casting === 1 },
            JWT_SECRET, { expiresIn: '7d' }
        );
        await registrarAuditoria(actor.id, 'login_exitoso_2fa', 'Login completado con 2FA', req.ip);
        res.json({
            token,
            actor: {
                id: actor.id, nombre: actor.nombre, email: actor.email,
                telefono: actor.telefono, foto_perfil: actor.foto_perfil,
                is_admin: actor.is_admin === 1, is_casting: actor.is_casting === 1
            }
        });
    } catch (error) {
        console.error('Error 2FA verify:', error);
        res.status(500).json({ error: 'Error al verificar código 2FA' });
    }
});

// Estado actual del 2FA del usuario
app.get('/api/auth/2fa/status', verificarToken, async (req, res) => {
    try {
        const [[actor]] = await promisePool.query('SELECT totp_enabled FROM actores WHERE id=?', [req.userId]);
        res.json({ totp_enabled: actor ? actor.totp_enabled === 1 : false });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener estado 2FA' });
    }
});

// ==================== RUTAS ADMIN ====================

// Listar actores con filtros
app.get('/api/admin/actores', verificarAdmin, async (req, res) => {
    try {
        const { nombre, edad_min, edad_max, habilidades, idioma, nivel_idioma,
                anios_exp, altura_min, altura_max, color_ojos, color_cabello, escenas_sexo, desnudos, pais_nacimiento, ciudad_nacimiento } = req.query;

        let query = `SELECT id, nombre, email, telefono, fecha_nacimiento, genero, altura, peso,
            color_ojos, color_cabello, talla_camiseta, talla_pantalon, talla_zapatos,
            biografia, habilidades, experiencia, formacion_artistica, redes_sociales, idiomas,
            foto_perfil, fecha_registro, is_admin, is_casting,
            anio_inicio_experiencia, edad_aparente_min, edad_aparente_max,
            escenas_sexo, desnudos, fechas_no_disponibles,
            ciudad_nacimiento, pais_nacimiento,
            TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) AS edad
            FROM actores WHERE 1=1`;
        const params = [];

        if (nombre)       { query += ' AND nombre LIKE ?'; params.push(`%${nombre}%`); }
        if (habilidades)  { query += ' AND habilidades LIKE ?'; params.push(`%${habilidades}%`); }
        if (color_ojos)   { query += ' AND color_ojos LIKE ?'; params.push(`%${color_ojos}%`); }
        if (color_cabello){ query += ' AND color_cabello LIKE ?'; params.push(`%${color_cabello}%`); }
        if (altura_min)   { query += ' AND altura >= ?'; params.push(parseFloat(altura_min)); }
        if (altura_max)   { query += ' AND altura <= ?'; params.push(parseFloat(altura_max)); }
        if (escenas_sexo !== undefined && escenas_sexo !== '') {
            query += ' AND escenas_sexo = ?'; params.push(parseInt(escenas_sexo));
        }
        if (desnudos !== undefined && desnudos !== '') {
            query += ' AND desnudos = ?'; params.push(parseInt(desnudos));
        }
        if (edad_min) { query += ' AND TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) >= ?'; params.push(parseInt(edad_min)); }
        if (edad_max) { query += ' AND TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) <= ?'; params.push(parseInt(edad_max)); }
        if (anios_exp) {
            const anioActual = new Date().getFullYear();
            switch(anios_exp) {
                case 'menos_1': query += ' AND anio_inicio_experiencia = ?'; params.push(anioActual); break;
                case '1':       query += ' AND anio_inicio_experiencia = ?'; params.push(anioActual - 1); break;
                case '2':       query += ' AND anio_inicio_experiencia = ?'; params.push(anioActual - 2); break;
                case '3':       query += ' AND anio_inicio_experiencia = ?'; params.push(anioActual - 3); break;
                case '5':       query += ' AND anio_inicio_experiencia = ?'; params.push(anioActual - 5); break;
                case 'mas_5':   query += ' AND anio_inicio_experiencia <= ?'; params.push(anioActual - 6); break;
            }
        }
        if (pais_nacimiento) { query += ' AND pais_nacimiento = ?'; params.push(pais_nacimiento); }
        if (ciudad_nacimiento) { query += ' AND ciudad_nacimiento LIKE ?'; params.push(`%${ciudad_nacimiento}%`); }

        query += ' ORDER BY nombre ASC';

        let [actores] = await promisePool.query(query, params);

        // Filtro JSON en Node.js (idioma + nivel)
        if (idioma) {
            actores = actores.filter(a => {
                try {
                    const arr = JSON.parse(a.idiomas || '[]');
                    return arr.some(i => i.idioma === idioma && (!nivel_idioma || i.nivel === nivel_idioma));
                } catch { return false; }
            });
        }

        res.json({ actores });
    } catch (error) {
        console.error('Error admin actores:', error);
        res.status(500).json({ error: 'Error al obtener actores' });
    }
});

// Obtener un actor por ID
app.get('/api/admin/actores/:id', verificarAdmin, async (req, res) => {
    try {
        const [actores] = await promisePool.query(
            `SELECT id, nombre, email, telefono, fecha_nacimiento, genero, altura, peso,
             color_ojos, color_cabello, talla_camiseta, talla_pantalon, talla_zapatos,
             biografia, habilidades, experiencia, formacion_artistica, redes_sociales, idiomas,
             foto_perfil, fecha_registro, is_admin, is_casting,
             edad_aparente_min, edad_aparente_max, tiene_manager, nombre_manager,
             fechas_no_disponibles, anio_inicio_experiencia, escenas_sexo, desnudos, link_reel,
             ciudad_nacimiento, pais_nacimiento, puede_subir_contrato,
             TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) AS edad
             FROM actores WHERE id = ?`,
            [req.params.id]
        );
        if (actores.length === 0) return res.status(404).json({ error: 'Actor no encontrado' });
        const [fotos] = await promisePool.query('SELECT id, url_foto, descripcion FROM fotos_actor WHERE actor_id = ?', [req.params.id]);
        res.json({ actor: actores[0], fotos });
    } catch (error) {
        console.error('Error admin actor:', error);
        res.status(500).json({ error: 'Error al obtener actor' });
    }
});

// Actualizar un actor (admin)
app.put('/api/admin/actores/:id', verificarAdmin, async (req, res) => {
    try {
        const { nombre, email, telefono, fecha_nacimiento, genero, altura, peso,
                color_ojos, color_cabello, biografia, habilidades, experiencia,
                talla_camiseta, talla_pantalon, talla_zapatos,
                formacion_artistica, redes_sociales, idiomas, is_admin, is_casting,
                edad_aparente_min, edad_aparente_max, tiene_manager, nombre_manager,
                fechas_no_disponibles, anio_inicio_experiencia, escenas_sexo, desnudos, link_reel,
                ciudad_nacimiento, pais_nacimiento, puede_subir_contrato,
                acentos_maneja, acentos_no_maneja } = req.body;

        await promisePool.query(
            `UPDATE actores SET nombre=?, email=?, telefono=?, fecha_nacimiento=?, genero=?,
             altura=?, peso=?, color_ojos=?, color_cabello=?, biografia=?, habilidades=?,
             experiencia=?, talla_camiseta=?, talla_pantalon=?, talla_zapatos=?,
             formacion_artistica=?, redes_sociales=?, idiomas=?, is_admin=?, is_casting=?,
             edad_aparente_min=?, edad_aparente_max=?, tiene_manager=?, nombre_manager=?,
             fechas_no_disponibles=?, anio_inicio_experiencia=?, escenas_sexo=?, desnudos=?, link_reel=?,
             ciudad_nacimiento=?, pais_nacimiento=?, puede_subir_contrato=?,
             acentos_maneja=?, acentos_no_maneja=?
             WHERE id=?`,
            [nombre, email, telefono || null, fecha_nacimiento || null, genero || null,
             altura || null, peso || null, color_ojos || null, color_cabello || null,
             biografia || null, habilidades || null, experiencia || null,
             talla_camiseta || null, talla_pantalon || null, talla_zapatos || null,
             formacion_artistica || null, redes_sociales || null, idiomas || null,
             is_admin ? 1 : 0, is_casting ? 1 : 0,
             edad_aparente_min || null, edad_aparente_max || null,
             tiene_manager != null ? tiene_manager : null, nombre_manager || null,
             fechas_no_disponibles || null, anio_inicio_experiencia || null,
             escenas_sexo != null ? escenas_sexo : null,
             desnudos != null ? desnudos : null,
             link_reel || null,
             ciudad_nacimiento || null, pais_nacimiento || null,
             puede_subir_contrato ? 1 : 0,
             acentos_maneja || null, acentos_no_maneja || null,
             req.params.id]
        );
        res.json({ mensaje: 'Actor actualizado exitosamente' });
    } catch (error) {
        console.error('Error admin update:', error);
        res.status(500).json({ error: 'Error al actualizar actor' });
    }
});

// Crear un actor (admin)
app.post('/api/admin/actores', verificarAdmin, async (req, res) => {
    try {
        const {
            nombre, email, password, telefono, fecha_nacimiento, genero,
            altura, peso, color_ojos, color_cabello, habilidades, biografia,
            talla_camiseta, talla_pantalon, talla_zapatos, is_casting,
            experiencia, formacion_artistica, redes_sociales, idiomas,
            edad_aparente_min, edad_aparente_max, tiene_manager, nombre_manager,
            fechas_no_disponibles, anio_inicio_experiencia, escenas_sexo, link_reel,
            ciudad_nacimiento, pais_nacimiento
        } = req.body;

        if (!nombre || !email || !password) {
            return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return res.status(400).json({ error: 'Email inválido' });
        const errPassAdmin = validarPassword(password);
        if (errPassAdmin) return res.status(400).json({ error: errPassAdmin });

        const [existente] = await promisePool.query('SELECT id FROM actores WHERE email = ?', [email]);
        if (existente.length > 0) return res.status(400).json({ error: 'El email ya está registrado' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await promisePool.query(
            `INSERT INTO actores (
                nombre, email, password, telefono, fecha_nacimiento, genero,
                altura, peso, color_ojos, color_cabello, habilidades, biografia,
                talla_camiseta, talla_pantalon, talla_zapatos,
                experiencia, formacion_artistica, redes_sociales, idiomas,
                edad_aparente_min, edad_aparente_max, tiene_manager, nombre_manager,
                fechas_no_disponibles, anio_inicio_experiencia, escenas_sexo, link_reel,
                ciudad_nacimiento, pais_nacimiento,
                is_casting, perfil_completo, fecha_registro
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
            [
                nombre, email, hashedPassword,
                telefono || null, fecha_nacimiento || null, genero || null,
                altura || null, peso || null, color_ojos || null, color_cabello || null,
                habilidades || null, biografia || null,
                talla_camiseta || null, talla_pantalon || null, talla_zapatos || null,
                experiencia || null, formacion_artistica || null, redes_sociales || null, idiomas || null,
                edad_aparente_min || null, edad_aparente_max || null,
                tiene_manager != null ? tiene_manager : null, nombre_manager || null,
                fechas_no_disponibles || null, anio_inicio_experiencia || null,
                escenas_sexo != null ? escenas_sexo : null, link_reel || null,
                ciudad_nacimiento || null, pais_nacimiento || null,
                is_casting ? 1 : 0
            ]
        );
        res.status(201).json({ mensaje: 'Perfil creado exitosamente', actorId: result.insertId });
    } catch (error) {
        console.error('Error admin crear actor:', error);
        res.status(500).json({ error: 'Error al crear el perfil' });
    }
});

// Subir foto de perfil de un actor (admin)
app.post('/api/admin/actores/:id/foto', verificarAdmin, upload.single('foto'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se proporcionó ninguna foto' });
        const fotoUrl = `/uploads/${req.file.filename}`;
        await promisePool.query('UPDATE actores SET foto_perfil = ? WHERE id = ?', [fotoUrl, req.params.id]);
        res.json({ mensaje: 'Foto de perfil actualizada', url: fotoUrl });
    } catch (error) {
        console.error('Error subir foto admin:', error);
        res.status(500).json({ error: 'Error al subir la foto' });
    }
});

// Agregar foto a galería de un actor (admin)
app.post('/api/admin/actores/:id/fotos', verificarAdmin, upload.single('foto'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se proporcionó ninguna foto' });
        const fotoUrl = `/uploads/${req.file.filename}`;
        const descripcion = req.body.descripcion || '';
        const [result] = await promisePool.query(
            'INSERT INTO fotos_actor (actor_id, url_foto, descripcion) VALUES (?, ?, ?)',
            [req.params.id, fotoUrl, descripcion]
        );
        res.json({ mensaje: 'Foto agregada exitosamente', foto: { id: result.insertId, url: fotoUrl, descripcion } });
    } catch (error) {
        console.error('Error galería admin:', error);
        res.status(500).json({ error: 'Error al agregar la foto' });
    }
});

// Eliminar foto de galería de un actor (admin)
app.delete('/api/admin/actores/:id/fotos/:fotoId', verificarAdmin, async (req, res) => {
    try {
        const [fotos] = await promisePool.query(
            'SELECT id FROM fotos_actor WHERE id = ? AND actor_id = ?',
            [req.params.fotoId, req.params.id]
        );
        if (fotos.length === 0) return res.status(404).json({ error: 'Foto no encontrada' });
        await promisePool.query('DELETE FROM fotos_actor WHERE id = ?', [req.params.fotoId]);
        res.json({ mensaje: 'Foto eliminada exitosamente' });
    } catch (error) {
        console.error('Error eliminar foto admin:', error);
        res.status(500).json({ error: 'Error al eliminar la foto' });
    }
});

// Resetear contraseña de un actor (admin)
app.put('/api/admin/actores/:id/password', verificarAdmin, async (req, res) => {
    try {
        const { nuevaPassword } = req.body;
        const errPassReset = validarPassword(nuevaPassword);
        if (errPassReset) return res.status(400).json({ error: errPassReset });
        const hashed = await bcrypt.hash(nuevaPassword, 10);
        await promisePool.query('UPDATE actores SET password = ? WHERE id = ?', [hashed, req.params.id]);
        res.json({ mensaje: 'Contraseña actualizada exitosamente' });
    } catch (error) {
        console.error('Error reset password admin:', error);
        res.status(500).json({ error: 'Error al actualizar contraseña' });
    }
});

// Eliminar un actor
app.delete('/api/admin/actores/:id', verificarAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (id === req.userId) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
        const [result] = await promisePool.query('DELETE FROM actores WHERE id = ?', [id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Actor no encontrado' });
        res.json({ mensaje: 'Actor eliminado exitosamente' });
    } catch (error) {
        console.error('Error admin delete:', error);
        res.status(500).json({ error: 'Error al eliminar actor' });
    }
});

// ==================== RUTAS CASTING ====================

// Listar actores (solo actores, no admins ni casting)
app.get('/api/casting/actores', verificarCasting, async (req, res) => {
    try {
        const { nombre, edad_min, edad_max, habilidades, idioma, nivel_idioma,
                anios_exp, altura_min, altura_max, color_ojos, color_cabello, escenas_sexo, desnudos, pais_nacimiento, ciudad_nacimiento } = req.query;

        let query = `SELECT id, nombre, fecha_nacimiento, genero, altura, peso,
            color_ojos, color_cabello, talla_camiseta, talla_pantalon, talla_zapatos,
            biografia, habilidades, experiencia, formacion_artistica, redes_sociales, idiomas,
            foto_perfil, fecha_registro,
            anio_inicio_experiencia, edad_aparente_min, edad_aparente_max,
            escenas_sexo, desnudos, fechas_no_disponibles,
            ciudad_nacimiento, pais_nacimiento,
            TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) AS edad
            FROM actores WHERE is_admin = 0 AND (is_casting IS NULL OR is_casting = 0)`;
        const params = [];

        if (nombre)       { query += ' AND nombre LIKE ?'; params.push(`%${nombre}%`); }
        if (habilidades)  { query += ' AND habilidades LIKE ?'; params.push(`%${habilidades}%`); }
        if (color_ojos)   { query += ' AND color_ojos LIKE ?'; params.push(`%${color_ojos}%`); }
        if (color_cabello){ query += ' AND color_cabello LIKE ?'; params.push(`%${color_cabello}%`); }
        if (altura_min)   { query += ' AND altura >= ?'; params.push(parseFloat(altura_min)); }
        if (altura_max)   { query += ' AND altura <= ?'; params.push(parseFloat(altura_max)); }
        if (escenas_sexo !== undefined && escenas_sexo !== '') {
            query += ' AND escenas_sexo = ?'; params.push(parseInt(escenas_sexo));
        }
        if (desnudos !== undefined && desnudos !== '') {
            query += ' AND desnudos = ?'; params.push(parseInt(desnudos));
        }
        if (edad_min) { query += ' AND TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) >= ?'; params.push(parseInt(edad_min)); }
        if (edad_max) { query += ' AND TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) <= ?'; params.push(parseInt(edad_max)); }
        if (anios_exp) {
            const anioActual = new Date().getFullYear();
            switch(anios_exp) {
                case 'menos_1': query += ' AND anio_inicio_experiencia = ?'; params.push(anioActual); break;
                case '1':       query += ' AND anio_inicio_experiencia = ?'; params.push(anioActual - 1); break;
                case '2':       query += ' AND anio_inicio_experiencia = ?'; params.push(anioActual - 2); break;
                case '3':       query += ' AND anio_inicio_experiencia = ?'; params.push(anioActual - 3); break;
                case '5':       query += ' AND anio_inicio_experiencia = ?'; params.push(anioActual - 5); break;
                case 'mas_5':   query += ' AND anio_inicio_experiencia <= ?'; params.push(anioActual - 6); break;
            }
        }
        if (pais_nacimiento) { query += ' AND pais_nacimiento = ?'; params.push(pais_nacimiento); }
        if (ciudad_nacimiento) { query += ' AND ciudad_nacimiento LIKE ?'; params.push(`%${ciudad_nacimiento}%`); }

        query += ' ORDER BY nombre ASC';

        let [actores] = await promisePool.query(query, params);

        // Filtro JSON en Node.js (idioma + nivel)
        if (idioma) {
            actores = actores.filter(a => {
                try {
                    const arr = JSON.parse(a.idiomas || '[]');
                    return arr.some(i => i.idioma === idioma && (!nivel_idioma || i.nivel === nivel_idioma));
                } catch { return false; }
            });
        }

        res.json({ actores });
    } catch (error) {
        console.error('Error casting actores:', error);
        res.status(500).json({ error: 'Error al obtener actores' });
    }
});

// Obtener actor por ID (casting)
app.get('/api/casting/actores/:id', verificarCasting, async (req, res) => {
    try {
        const [actores] = await promisePool.query(
            `SELECT id, nombre, fecha_nacimiento, genero, altura, peso,
             color_ojos, color_cabello, talla_camiseta, talla_pantalon, talla_zapatos,
             biografia, habilidades, experiencia, formacion_artistica, redes_sociales, idiomas,
             foto_perfil, fecha_registro,
             edad_aparente_min, edad_aparente_max, escenas_sexo, desnudos, link_reel,
             ciudad_nacimiento, pais_nacimiento,
             TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) AS edad
             FROM actores WHERE id = ? AND is_admin = 0`,
            [req.params.id]
        );
        if (actores.length === 0) return res.status(404).json({ error: 'Actor no encontrado' });
        const [fotos] = await promisePool.query('SELECT id, url_foto, descripcion FROM fotos_actor WHERE actor_id = ?', [req.params.id]);
        res.json({ actor: actores[0], fotos });
    } catch (error) {
        console.error('Error casting actor:', error);
        res.status(500).json({ error: 'Error al obtener actor' });
    }
});


// ==================== CONTRATOS ====================

// Actor sube su contrato
app.post('/api/perfil/contrato', verificarToken, uploadContrato.single('contrato'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se proporcionó ningún archivo PDF' });
        const [[actor]] = await promisePool.query('SELECT puede_subir_contrato FROM actores WHERE id = ?', [req.userId]);
        if (!actor || !actor.puede_subir_contrato) return res.status(403).json({ error: 'No tienes permiso para subir contratos. Contacta al administrador.' });
        const url = '/uploads/contratos/' + req.file.filename;
        await promisePool.query(
            'INSERT INTO contratos_actor (actor_id, url_contrato, nombre_archivo) VALUES (?, ?, ?)',
            [req.userId, url, req.file.originalname]
        );

        // Notificar al admin en background
        const [[actorInfo]] = await promisePool.query('SELECT nombre, email FROM actores WHERE id = ?', [req.userId]);
        if (actorInfo) mailer.enviarContratoSubido(actorInfo, req.file.originalname).catch(e => console.error('Mailer contrato:', e));

        res.json({ mensaje: 'Contrato subido exitosamente', url, nombre: req.file.originalname });
    } catch (error) {
        console.error('Error subir contrato:', error);
        res.status(500).json({ error: 'Error al subir el contrato' });
    }
});

// Actor lista sus contratos
app.get('/api/perfil/contratos', verificarToken, async (req, res) => {
    try {
        const [contratos] = await promisePool.query(
            'SELECT id, url_contrato, nombre_archivo, fecha_subida FROM contratos_actor WHERE actor_id = ? ORDER BY fecha_subida DESC',
            [req.userId]
        );
        res.json({ contratos });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener contratos' });
    }
});

// Actor elimina su contrato
app.delete('/api/perfil/contratos/:id', verificarToken, async (req, res) => {
    try {
        const [rows] = await promisePool.query(
            'SELECT id FROM contratos_actor WHERE id = ? AND actor_id = ?',
            [req.params.id, req.userId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Contrato no encontrado' });
        await promisePool.query('DELETE FROM contratos_actor WHERE id = ?', [req.params.id]);
        res.json({ mensaje: 'Contrato eliminado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el contrato' });
    }
});

// Admin lista contratos de un actor
app.get('/api/admin/actores/:id/contratos', verificarAdmin, async (req, res) => {
    try {
        const [contratos] = await promisePool.query(
            'SELECT id, url_contrato, nombre_archivo, fecha_subida FROM contratos_actor WHERE actor_id = ? ORDER BY fecha_subida DESC',
            [req.params.id]
        );
        res.json({ contratos });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener contratos' });
    }
});

// Descargar perfil de actor en Excel (admin)
app.get('/api/admin/actores/:id/excel', verificarAdmin, async (req, res) => {
    try {
        const [actores] = await promisePool.query(
            `SELECT id, nombre, email, telefono, fecha_nacimiento, genero, altura, peso,
             color_ojos, color_cabello, talla_camiseta, talla_pantalon, talla_zapatos,
             biografia, habilidades, experiencia, formacion_artistica, redes_sociales, idiomas,
             ciudad_nacimiento, pais_nacimiento, edad_aparente_min, edad_aparente_max,
             tiene_manager, nombre_manager, anio_inicio_experiencia, escenas_sexo, desnudos, link_reel,
             fechas_no_disponibles, fecha_registro,
             TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) AS edad
             FROM actores WHERE id = ?`,
            [req.params.id]
        );
        if (actores.length === 0) return res.status(404).json({ error: 'Actor no encontrado' });
        const a = actores[0];

        const parseJ = (s, fb) => { try { return JSON.parse(s || '') || fb; } catch { return fb; } };

        const idiomas = parseJ(a.idiomas, []);
        const exps    = parseJ(a.experiencia, []);
        const forms   = parseJ(a.formacion_artistica, []);
        const redes   = parseJ(a.redes_sociales, {});
        const habs    = (() => { try { const h = JSON.parse(a.habilidades||'[]'); return Array.isArray(h)?h:[]; } catch { return a.habilidades?[a.habilidades]:[]; } })();
        const fechasND = parseJ(a.fechas_no_disponibles, []);

        const [contratos] = await promisePool.query(
            'SELECT nombre_archivo, fecha_subida FROM contratos_actor WHERE actor_id = ? ORDER BY fecha_subida DESC',
            [req.params.id]
        );

        const tiposExp = { television:'Televisión', cine:'Cine', teatro:'Teatro', serie:'Serie', comercial:'Comercial', otra:'Otra' };

        // Hoja principal
        const datos = [
            ['Campo', 'Valor'],
            ['Nombre', a.nombre || ''],
            ['Email', a.email || ''],
            ['Teléfono', a.telefono || ''],
            ['Fecha de nacimiento', a.fecha_nacimiento ? new Date(a.fecha_nacimiento).toLocaleDateString('es-CO') : ''],
            ['Edad', a.edad != null ? a.edad + ' años' : ''],
            ['Género', a.genero || ''],
            ['País de nacimiento', a.pais_nacimiento || ''],
            ['Ciudad de nacimiento', a.ciudad_nacimiento || ''],
            ['Altura (cm)', a.altura || ''],
            ['Peso (kg)', a.peso || ''],
            ['Color de ojos', a.color_ojos || ''],
            ['Color de cabello', a.color_cabello || ''],
            ['Talla camiseta', a.talla_camiseta || ''],
            ['Talla pantalón', a.talla_pantalon || ''],
            ['Talla zapatos', a.talla_zapatos || ''],
            ['Edad aparente (mín)', a.edad_aparente_min || ''],
            ['Edad aparente (máx)', a.edad_aparente_max || ''],
            ['Escenas de sexo', a.escenas_sexo === 1 ? 'Sí' : a.escenas_sexo === 0 ? 'No' : ''],
            ['Desnudos', a.desnudos === 1 ? 'Sí' : a.desnudos === 0 ? 'No' : ''],
            ['Link Reel', a.link_reel || ''],
            ['Año inicio experiencia', a.anio_inicio_experiencia || ''],
            ['Tiene manager', a.tiene_manager ? 'Sí' : 'No'],
            ['Nombre manager', a.nombre_manager || ''],
            ['Habilidades', habs.join(', ')],
            ['Idiomas', idiomas.map(i => i.idioma + (i.nivel ? ' (' + i.nivel + ')' : '')).join(', ')],
            ['Experiencia profesional', exps.map(e => (e.nombre||'') + (e.tipo ? ' – ' + (tiposExp[e.tipo]||e.tipo) : '')).join(' | ')],
            ['Formación artística', forms.map(f => f.nombre||'').join(' | ')],
            ['Facebook', redes.facebook || ''],
            ['Instagram', redes.instagram || ''],
            ['TikTok', redes.tiktok || ''],
            ['IMDB', redes.imdb || ''],
            ['Fechas no disponibles', fechasND.map(f => f.inicio + ' a ' + f.fin).join(' | ')],
            ['Biografía', a.biografia || ''],
            ['Fecha de registro', a.fecha_registro ? new Date(a.fecha_registro).toLocaleDateString('es-CO') : ''],
        ];

        const wb = XLSX.utils.book_new();
        const wsDatos = XLSX.utils.aoa_to_sheet(datos);
        wsDatos['!cols'] = [{ wch: 28 }, { wch: 60 }];
        XLSX.utils.book_append_sheet(wb, wsDatos, 'Perfil');

        // Hoja contratos
        if (contratos.length > 0) {
            const wsContratos = XLSX.utils.aoa_to_sheet([
                ['Archivo', 'Fecha de subida'],
                ...contratos.map(c => [c.nombre_archivo, new Date(c.fecha_subida).toLocaleDateString('es-CO')])
            ]);
            wsContratos['!cols'] = [{ wch: 40 }, { wch: 20 }];
            XLSX.utils.book_append_sheet(wb, wsContratos, 'Contratos');
        }

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const nombreArchivo = `perfil_${(a.nombre || 'actor').replace(/\s+/g, '_')}.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (error) {
        console.error('Error excel:', error);
        res.status(500).json({ error: 'Error al generar Excel' });
    }
});

// ==================== NOTIFICACIONES ADMIN ====================

// Obtener notificaciones
app.get('/api/admin/notificaciones', verificarAdmin, async (req, res) => {
    try {
        const [notifs] = await promisePool.query(
            'SELECT * FROM notificaciones_admin ORDER BY fecha DESC LIMIT 50'
        );
        const [[{ total }]] = await promisePool.query(
            'SELECT COUNT(*) as total FROM notificaciones_admin WHERE leido = 0'
        );
        res.json({ notificaciones: notifs, no_leidas: total });
    } catch (error) {
        console.error('Error notificaciones:', error);
        res.status(500).json({ error: 'Error al obtener notificaciones' });
    }
});

// Marcar todas como leídas
app.put('/api/admin/notificaciones/leer', verificarAdmin, async (req, res) => {
    try {
        await promisePool.query('UPDATE notificaciones_admin SET leido = 1 WHERE leido = 0');
        res.json({ mensaje: 'Notificaciones marcadas como leídas' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar notificaciones' });
    }
});

// Borrar una notificación por id
app.delete('/api/admin/notificaciones/:id', verificarAdmin, async (req, res) => {
    try {
        await promisePool.query('DELETE FROM notificaciones_admin WHERE id = ?', [req.params.id]);
        res.json({ mensaje: 'Notificación eliminada' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar notificación' });
    }
});

// Borrar todas las notificaciones leídas
app.delete('/api/admin/notificaciones/leidas/todas', verificarAdmin, async (_req, res) => {
    try {
        await promisePool.query('DELETE FROM notificaciones_admin WHERE leido = 1');
        res.json({ mensaje: 'Notificaciones leídas eliminadas' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar notificaciones' });
    }
});

// ==================== REGISTRO CASTING (link privado) ====================

// Verificar token de invitación (sin autenticación, solo el token)
app.get('/api/casting/verificar-token', (req, res) => {
    const { token } = req.query;
    const tokenValido = process.env.CASTING_INVITE_TOKEN;
    if (!tokenValido || token !== tokenValido) {
        return res.status(403).json({ error: 'Token de invitación inválido' });
    }
    res.json({ valido: true });
});

// Registro de director de casting mediante link privado
app.post('/api/casting/registro', async (req, res) => {
    try {
        const { nombre, email, password, token } = req.body;

        // Verificar token de invitación
        const tokenValido = process.env.CASTING_INVITE_TOKEN;
        if (!tokenValido || token !== tokenValido) {
            return res.status(403).json({ error: 'Token de invitación inválido' });
        }

        if (!nombre || !email || !password) {
            return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return res.status(400).json({ error: 'Email inválido' });
        const errPassCasting = validarPassword(password);
        if (errPassCasting) return res.status(400).json({ error: errPassCasting });

        const [existente] = await promisePool.query('SELECT id FROM actores WHERE email = ?', [email]);
        if (existente.length > 0) return res.status(400).json({ error: 'El email ya está registrado' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await promisePool.query(
            `INSERT INTO actores (nombre, email, password, is_casting, perfil_completo, fecha_registro)
             VALUES (?, ?, ?, 1, 1, NOW())`,
            [nombre, email, hashedPassword]
        );

        res.status(201).json({ mensaje: 'Cuenta de casting creada exitosamente', actorId: result.insertId });
    } catch (error) {
        console.error('Error registro casting:', error);
        res.status(500).json({ error: 'Error al crear la cuenta' });
    }
});

// ==================== CONVOCATORIAS ====================

// Actor: listar convocatorias publicadas
app.get('/api/convocatorias', verificarToken, async (req, res) => {
    try {
        const [rows] = await promisePool.query(
            `SELECT id, titulo, descripcion, requisitos, fecha_limite, fecha_publicacion
             FROM convocatorias WHERE estado = 'publicada' ORDER BY fecha_publicacion DESC`
        );
        res.json({ convocatorias: rows });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener convocatorias' });
    }
});

// Admin: listar todas las convocatorias
app.get('/api/admin/convocatorias', verificarAdmin, async (req, res) => {
    try {
        const [rows] = await promisePool.query(
            'SELECT * FROM convocatorias ORDER BY fecha_creacion DESC'
        );
        res.json({ convocatorias: rows });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener convocatorias' });
    }
});

// Admin: crear convocatoria
app.post('/api/admin/convocatorias', verificarAdmin, async (req, res) => {
    try {
        const { titulo, descripcion, requisitos, fecha_limite,
                filtro_genero, filtro_acento, filtro_pais, filtro_ciudad,
                filtro_anios_exp, filtro_escenas_sexo, filtro_desnudos,
                filtro_edad_min, filtro_edad_max, filtro_edad_ap_min, filtro_edad_ap_max } = req.body;
        if (!titulo) return res.status(400).json({ error: 'El título es requerido' });
        const [result] = await promisePool.query(
            `INSERT INTO convocatorias (titulo, descripcion, requisitos, fecha_limite,
             filtro_genero, filtro_acento, filtro_pais, filtro_ciudad,
             filtro_anios_exp, filtro_escenas_sexo, filtro_desnudos,
             filtro_edad_min, filtro_edad_max, filtro_edad_ap_min, filtro_edad_ap_max)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [titulo, descripcion || null, requisitos || null, fecha_limite || null,
             filtro_genero || null, filtro_acento || null, filtro_pais || null, filtro_ciudad || null,
             filtro_anios_exp != null && filtro_anios_exp !== '' ? parseInt(filtro_anios_exp) : null,
             filtro_escenas_sexo != null && filtro_escenas_sexo !== '' ? parseInt(filtro_escenas_sexo) : null,
             filtro_desnudos != null && filtro_desnudos !== '' ? parseInt(filtro_desnudos) : null,
             filtro_edad_min || null, filtro_edad_max || null,
             filtro_edad_ap_min || null, filtro_edad_ap_max || null]
        );
        res.status(201).json({ mensaje: 'Convocatoria creada', id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: 'Error al crear convocatoria' });
    }
});

// Admin: editar convocatoria
app.put('/api/admin/convocatorias/:id', verificarAdmin, async (req, res) => {
    try {
        const { titulo, descripcion, requisitos, fecha_limite,
                filtro_genero, filtro_acento, filtro_pais, filtro_ciudad,
                filtro_anios_exp, filtro_escenas_sexo, filtro_desnudos,
                filtro_edad_min, filtro_edad_max, filtro_edad_ap_min, filtro_edad_ap_max } = req.body;
        await promisePool.query(
            `UPDATE convocatorias SET titulo=?, descripcion=?, requisitos=?, fecha_limite=?,
             filtro_genero=?, filtro_acento=?, filtro_pais=?, filtro_ciudad=?,
             filtro_anios_exp=?, filtro_escenas_sexo=?, filtro_desnudos=?,
             filtro_edad_min=?, filtro_edad_max=?, filtro_edad_ap_min=?, filtro_edad_ap_max=?
             WHERE id=?`,
            [titulo, descripcion || null, requisitos || null, fecha_limite || null,
             filtro_genero || null, filtro_acento || null, filtro_pais || null, filtro_ciudad || null,
             filtro_anios_exp != null && filtro_anios_exp !== '' ? parseInt(filtro_anios_exp) : null,
             filtro_escenas_sexo != null && filtro_escenas_sexo !== '' ? parseInt(filtro_escenas_sexo) : null,
             filtro_desnudos != null && filtro_desnudos !== '' ? parseInt(filtro_desnudos) : null,
             filtro_edad_min || null, filtro_edad_max || null,
             filtro_edad_ap_min || null, filtro_edad_ap_max || null,
             req.params.id]
        );
        res.json({ mensaje: 'Convocatoria actualizada' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar convocatoria' });
    }
});

// Admin: publicar convocatoria y enviar correos
app.post('/api/admin/convocatorias/:id/publicar', verificarAdmin, async (req, res) => {
    try {
        const [[conv]] = await promisePool.query('SELECT * FROM convocatorias WHERE id = ?', [req.params.id]);
        if (!conv) return res.status(404).json({ error: 'Convocatoria no encontrada' });

        await promisePool.query(
            "UPDATE convocatorias SET estado='publicada', fecha_publicacion=NOW() WHERE id=?",
            [req.params.id]
        );

        const notificar = req.body && req.body.notificar !== false;

        if (notificar) {
            // Construir consulta SQL con los filtros de la convocatoria
            let sqlActores = `SELECT nombre, email, genero, acentos_maneja, fechas_no_disponibles
                FROM actores WHERE is_admin = 0 AND is_casting = 0 AND email IS NOT NULL`;
            const sqlParams = [];

            if (conv.filtro_genero && conv.filtro_genero !== 'todos') {
                sqlActores += ' AND LOWER(genero) = ?';
                sqlParams.push(conv.filtro_genero.toLowerCase());
            }
            if (conv.filtro_pais)  { sqlActores += ' AND pais_nacimiento = ?'; sqlParams.push(conv.filtro_pais); }
            if (conv.filtro_ciudad){ sqlActores += ' AND ciudad_nacimiento LIKE ?'; sqlParams.push(`%${conv.filtro_ciudad}%`); }
            if (conv.filtro_escenas_sexo != null) { sqlActores += ' AND escenas_sexo = ?'; sqlParams.push(conv.filtro_escenas_sexo); }
            if (conv.filtro_desnudos != null) { sqlActores += ' AND desnudos = ?'; sqlParams.push(conv.filtro_desnudos); }
            if (conv.filtro_edad_min) { sqlActores += ' AND TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) >= ?'; sqlParams.push(parseInt(conv.filtro_edad_min)); }
            if (conv.filtro_edad_max) { sqlActores += ' AND TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) <= ?'; sqlParams.push(parseInt(conv.filtro_edad_max)); }
            if (conv.filtro_edad_ap_min) { sqlActores += ' AND edad_aparente_min >= ?'; sqlParams.push(parseInt(conv.filtro_edad_ap_min)); }
            if (conv.filtro_edad_ap_max) { sqlActores += ' AND edad_aparente_max <= ?'; sqlParams.push(parseInt(conv.filtro_edad_ap_max)); }
            if (conv.filtro_anios_exp) {
                sqlActores += ' AND anio_inicio_experiencia <= ?';
                sqlParams.push(new Date().getFullYear() - parseInt(conv.filtro_anios_exp));
            }

            const [todosActores] = await promisePool.query(sqlActores, sqlParams);
            const hoy = new Date().toISOString().split('T')[0];
            const actores = todosActores.filter(a => {
                // Excluir no disponibles hoy
                try {
                    const fechas = JSON.parse(a.fechas_no_disponibles || '[]');
                    if (fechas.some(f => {
                        const ini = f.inicio || f.desde || '';
                        const fin = f.fin || f.hasta || '';
                        return ini && fin && hoy >= ini && hoy <= fin;
                    })) return false;
                } catch {}
                // Filtrar por acento (JSON column, no filtrable en SQL directo)
                if (conv.filtro_acento) {
                    try {
                        const acentos = JSON.parse(a.acentos_maneja || '[]');
                        if (!acentos.includes(conv.filtro_acento)) return false;
                    } catch { return false; }
                }
                return true;
            });
            mailer.enviarConvocatoria(actores, conv).catch(e => console.error('Mailer convocatoria:', e));
            res.json({ mensaje: `Convocatoria publicada. Se notificará a ${actores.length} actores disponibles.` });
        } else {
            res.json({ mensaje: 'Convocatoria publicada sin notificaciones.' });
        }
    } catch (error) {
        console.error('Error publicar convocatoria:', error);
        res.status(500).json({ error: 'Error al publicar convocatoria' });
    }
});

// Admin: desactivar convocatoria (vuelve a borrador, sin notificar)
app.post('/api/admin/convocatorias/:id/desactivar', verificarAdmin, async (req, res) => {
    try {
        await promisePool.query(
            "UPDATE convocatorias SET estado='borrador' WHERE id=?",
            [req.params.id]
        );
        res.json({ mensaje: 'Convocatoria desactivada (volvió a borrador)' });
    } catch (error) {
        res.status(500).json({ error: 'Error al desactivar convocatoria' });
    }
});

// Admin: cerrar convocatoria (archivada permanentemente)
app.post('/api/admin/convocatorias/:id/cerrar', verificarAdmin, async (req, res) => {
    try {
        await promisePool.query(
            "UPDATE convocatorias SET estado='cerrada' WHERE id=?",
            [req.params.id]
        );
        res.json({ mensaje: 'Convocatoria cerrada' });
    } catch (error) {
        res.status(500).json({ error: 'Error al cerrar convocatoria' });
    }
});

// Admin: eliminar convocatoria
app.delete('/api/admin/convocatorias/:id', verificarAdmin, async (req, res) => {
    try {
        await promisePool.query('DELETE FROM convocatorias WHERE id = ?', [req.params.id]);
        res.json({ mensaje: 'Convocatoria eliminada' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar convocatoria' });
    }
});

// ==================== PERSONAJES Y POSTULACIONES ====================

// Admin: guardar personajes de una convocatoria (reemplaza lista completa)
app.post('/api/admin/convocatorias/:id/personajes', verificarAdmin, async (req, res) => {
    try {
        const { personajes } = req.body;
        if (!Array.isArray(personajes)) return res.status(400).json({ error: 'Se esperaba un arreglo de personajes' });
        await promisePool.query('DELETE FROM personajes_convocatoria WHERE convocatoria_id = ?', [req.params.id]);
        for (const p of personajes) {
            if (!p.nombre || !p.nombre.trim()) continue;
            await promisePool.query(
                'INSERT INTO personajes_convocatoria (convocatoria_id, nombre, descripcion) VALUES (?, ?, ?)',
                [req.params.id, p.nombre.trim(), p.descripcion || null]
            );
        }
        res.json({ mensaje: 'Personajes guardados' });
    } catch (error) {
        console.error('Error personajes:', error);
        res.status(500).json({ error: 'Error al guardar personajes' });
    }
});

// Admin/Actor: listar personajes de una convocatoria
app.get('/api/convocatorias/:id/personajes', verificarToken, async (req, res) => {
    try {
        const [rows] = await promisePool.query(
            'SELECT id, nombre, descripcion FROM personajes_convocatoria WHERE convocatoria_id = ? ORDER BY id',
            [req.params.id]
        );
        res.json({ personajes: rows });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener personajes' });
    }
});

// Actor: postularse a una convocatoria
app.post('/api/convocatorias/:id/postular', verificarToken, async (req, res) => {
    try {
        const { personaje_id } = req.body;
        if (!personaje_id) return res.status(400).json({ error: 'Debes seleccionar un personaje' });
        const [[conv]] = await promisePool.query(
            "SELECT id FROM convocatorias WHERE id = ? AND estado = 'publicada'", [req.params.id]
        );
        if (!conv) return res.status(400).json({ error: 'Convocatoria no disponible' });
        const [[personaje]] = await promisePool.query(
            'SELECT id FROM personajes_convocatoria WHERE id = ? AND convocatoria_id = ?',
            [personaje_id, req.params.id]
        );
        if (!personaje) return res.status(400).json({ error: 'Personaje no válido' });
        const [[yaPostulado]] = await promisePool.query(
            'SELECT id FROM postulaciones WHERE actor_id = ? AND convocatoria_id = ?',
            [req.userId, req.params.id]
        );
        if (yaPostulado) return res.status(400).json({ error: 'Ya te postulaste a esta convocatoria' });
        await promisePool.query(
            'INSERT INTO postulaciones (actor_id, convocatoria_id, personaje_id) VALUES (?, ?, ?)',
            [req.userId, req.params.id, personaje_id]
        );
        res.json({ mensaje: 'Postulación registrada exitosamente' });
    } catch (error) {
        console.error('Error postular:', error);
        res.status(500).json({ error: 'Error al registrar postulación' });
    }
});

// Actor: consultar su postulación en una convocatoria
app.get('/api/convocatorias/:id/mi-postulacion', verificarToken, async (req, res) => {
    try {
        const [[post]] = await promisePool.query(
            `SELECT p.id, pc.nombre AS personaje, p.fecha_postulacion
             FROM postulaciones p
             JOIN personajes_convocatoria pc ON pc.id = p.personaje_id
             WHERE p.actor_id = ? AND p.convocatoria_id = ?`,
            [req.userId, req.params.id]
        );
        res.json({ postulacion: post || null });
    } catch (error) {
        res.status(500).json({ error: 'Error al consultar postulación' });
    }
});

// Admin: ver postulaciones de una convocatoria
app.get('/api/admin/convocatorias/:id/postulaciones', verificarAdmin, async (req, res) => {
    try {
        const [rows] = await promisePool.query(
            `SELECT p.id, p.fecha_postulacion,
                    a.nombre AS actor, TIMESTAMPDIFF(YEAR, a.fecha_nacimiento, CURDATE()) AS edad,
                    a.altura, a.ciudad_nacimiento, a.pais_nacimiento,
                    a.tiene_manager, a.nombre_manager,
                    pc.nombre AS personaje
             FROM postulaciones p
             JOIN actores a ON a.id = p.actor_id
             JOIN personajes_convocatoria pc ON pc.id = p.personaje_id
             WHERE p.convocatoria_id = ?
             ORDER BY pc.nombre, p.fecha_postulacion`,
            [req.params.id]
        );
        res.json({ postulaciones: rows });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener postulaciones' });
    }
});

// Admin: descargar postulaciones en Excel
app.get('/api/admin/convocatorias/:id/postulaciones/excel', verificarAdmin, async (req, res) => {
    try {
        const [[conv]] = await promisePool.query('SELECT titulo FROM convocatorias WHERE id = ?', [req.params.id]);
        if (!conv) return res.status(404).json({ error: 'Convocatoria no encontrada' });
        const [rows] = await promisePool.query(
            `SELECT pc.nombre AS personaje, a.nombre AS actor,
                    TIMESTAMPDIFF(YEAR, a.fecha_nacimiento, CURDATE()) AS edad,
                    a.altura AS estatura_cm, a.ciudad_nacimiento, a.pais_nacimiento,
                    a.tiene_manager, a.nombre_manager,
                    p.fecha_postulacion
             FROM postulaciones p
             JOIN actores a ON a.id = p.actor_id
             JOIN personajes_convocatoria pc ON pc.id = p.personaje_id
             WHERE p.convocatoria_id = ?
             ORDER BY pc.nombre, a.nombre`,
            [req.params.id]
        );
        const wb = XLSX.utils.book_new();
        const wsData = [
            ['Personaje', 'Nombre Actor', 'Edad', 'Estatura (cm)', 'Ciudad de Nacimiento', 'País de Nacimiento', 'Manager', 'Fecha Postulación'],
            ...rows.map(r => [
                r.personaje, r.actor,
                r.edad != null ? r.edad : '',
                r.estatura_cm || '',
                r.ciudad_nacimiento || '',
                r.pais_nacimiento || '',
                r.tiene_manager ? (r.nombre_manager || 'Sí') : 'No',
                new Date(r.fecha_postulacion).toLocaleDateString('es-CO')
            ])
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 8 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 25 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Postulaciones');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const nombreArchivo = `postulaciones_${(conv.titulo || 'conv').replace(/\s+/g, '_')}.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (error) {
        console.error('Error excel postulaciones:', error);
        res.status(500).json({ error: 'Error al generar Excel' });
    }
});

// ==================== RESET DE CONTRASEÑA ====================

// Solicitar reset
app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email requerido' });

        const [[actor]] = await promisePool.query(
            'SELECT id, nombre, email FROM actores WHERE email = ?', [email]
        );
        if (!actor) return res.status(404).json({ error: 'No encontramos ninguna cuenta con ese correo electrónico.' });

        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 3600000); // 1 hora
        await promisePool.query(
            'UPDATE actores SET reset_token=?, reset_token_expiry=? WHERE id=?',
            [token, expiry, actor.id]
        );

        mailer.enviarResetPassword(actor.email, actor.nombre, token).catch(e => console.error('Mailer reset:', e));
        res.json({ mensaje: 'Si el correo existe, recibirás un enlace para restablecer tu contraseña.' });
    } catch (error) {
        console.error('Error forgot-password:', error);
        res.status(500).json({ error: 'Error al procesar la solicitud' });
    }
});

// Confirmar nuevo password
app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) return res.status(400).json({ error: 'Token y contraseña requeridos' });
        const errPassReset2 = validarPassword(password);
        if (errPassReset2) return res.status(400).json({ error: errPassReset2 });

        const [[actor]] = await promisePool.query(
            'SELECT id FROM actores WHERE reset_token=? AND reset_token_expiry > NOW()', [token]
        );
        if (!actor) return res.status(400).json({ error: 'Token inválido o expirado' });

        const hashed = await bcrypt.hash(password, 10);
        await promisePool.query(
            'UPDATE actores SET password=?, reset_token=NULL, reset_token_expiry=NULL WHERE id=?',
            [hashed, actor.id]
        );
        await registrarAuditoria(actor.id, 'reset_contrasena', 'Contraseña restablecida por token', req.ip);
        res.json({ mensaje: 'Contraseña actualizada exitosamente' });
    } catch (error) {
        console.error('Error reset-password:', error);
        res.status(500).json({ error: 'Error al restablecer contraseña' });
    }
});

// Servir páginas de reset y convocatorias
app.get('/forgot-password.html', (_req, res) => res.sendFile(path.join(__dirname, 'forgot-password.html')));
app.get('/reset-password.html', (_req, res) => res.sendFile(path.join(__dirname, 'reset-password.html')));
app.get('/convocatorias.html', (_req, res) => res.sendFile(path.join(__dirname, 'convocatorias.html')));

// ==================== TEST DE CORREO (solo admin) ====================
app.post('/api/admin/test-email', verificarToken, verificarAdmin, async (req, res) => {
    try {
        const { email } = req.body;
        const destinatario = email || process.env.ADMIN_EMAIL;
        if (!destinatario) return res.status(400).json({ error: 'No hay destinatario configurado' });

        const nodemailer = require('nodemailer');
        const SMTP_PORT = parseInt(process.env.SMTP_PORT) || 465;
        const testTransporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_PORT === 465,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
            tls: { rejectUnauthorized: false }
        });

        await testTransporter.verify();
        await testTransporter.sendMail({
            from: `"8a Representaciones" <${process.env.SMTP_USER}>`,
            to: destinatario,
            subject: 'Test de correo - 8a Representaciones',
            html: '<p>Este es un correo de prueba. Si lo recibes, el SMTP está funcionando correctamente.</p>'
        });
        res.json({ ok: true, mensaje: `Correo de prueba enviado a ${destinatario}` });
    } catch (e) {
        console.error('Test email error:', e);
        res.status(500).json({ error: e.message, codigo: e.code, respuesta: e.response || null });
    }
});

// Iniciar servidor solo si no estamos en modo test
if (process.env.NODE_ENV !== 'test') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Servidor corriendo en puerto ${PORT}`);
    });
}

module.exports = { app, promisePool };
