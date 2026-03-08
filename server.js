const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const https = require('https');
const { OAuth2Client } = require('google-auth-library');
const fs = require('fs');
require('dotenv').config();

if (!fs.existsSync('uploads/contratos')) fs.mkdirSync('uploads/contratos', { recursive: true });

const app = express();

// Middleware
app.use(cors());
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
app.get('/', (_req, res) => res.redirect('/login.html'));

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
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
        filename: (_req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
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

// Secret para JWT
const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_super_seguro_cambialo_en_produccion';

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
app.post('/api/registro', async (req, res) => {
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

        // Validar longitud de contraseña
        if (password.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        }

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
app.post('/api/login', async (req, res) => {
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
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const actor = actors[0];

        // Verificar contraseña
        const passwordMatch = await bcrypt.compare(password, actor.password);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // Generar token JWT
        const token = jwt.sign(
            { id: actor.id, email: actor.email, is_admin: actor.is_admin === 1, is_casting: actor.is_casting === 1 },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

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
             anio_inicio_experiencia, escenas_sexo, link_reel,
             ciudad_nacimiento, pais_nacimiento, puede_subir_contrato
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
            anio_inicio_experiencia, escenas_sexo, link_reel,
            ciudad_nacimiento, pais_nacimiento
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
             anio_inicio_experiencia = ?, escenas_sexo = ?, link_reel = ?,
             ciudad_nacimiento = ?, pais_nacimiento = ?
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
             link_reel || null,
             ciudad_nacimiento || null, pais_nacimiento || null,
             req.userId]
        );

        // Registrar notificación para el admin
        try {
            const [[actor]] = await promisePool.query('SELECT nombre FROM actores WHERE id = ?', [req.userId]);
            await promisePool.query(
                'INSERT INTO notificaciones_admin (actor_id, actor_nombre) VALUES (?, ?)',
                [req.userId, actor ? actor.nombre : 'Actor']
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

        res.json({ mensaje: 'Contraseña actualizada exitosamente' });

    } catch (error) {
        console.error('Error al cambiar contraseña:', error);
        res.status(500).json({ error: 'Error al cambiar la contraseña' });
    }
});

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
        const token = jwt.sign({ id: actor.id, email: actor.email }, JWT_SECRET, { expiresIn: '7d' });
        return { token, actor, perfil_completo: actor.perfil_completo === 1 };
    }

    // Buscar por email (puede existir como cuenta local)
    const [porEmail] = await promisePool.query(
        'SELECT * FROM actores WHERE email = ?', [email]
    );
    if (porEmail.length > 0) {
        const actor = porEmail[0];
        await promisePool.query(`UPDATE actores SET ${idColumn} = ? WHERE id = ?`, [idValue, actor.id]);
        const token = jwt.sign({ id: actor.id, email: actor.email }, JWT_SECRET, { expiresIn: '7d' });
        return { token, actor, perfil_completo: actor.perfil_completo === 1 };
    }

    // Crear nuevo usuario
    const proveedor = idColumn === 'google_id' ? 'google' : 'microsoft';
    const [result] = await promisePool.query(
        `INSERT INTO actores (nombre, email, foto_perfil, ${idColumn}, auth_provider, perfil_completo, fecha_registro)
         VALUES (?, ?, ?, ?, ?, 0, NOW())`,
        [nombre, email, fotoUrl || null, idValue, proveedor]
    );
    const nuevoActor = { id: result.insertId, nombre, email, foto_perfil: fotoUrl || null };
    const token = jwt.sign({ id: nuevoActor.id, email: nuevoActor.email }, JWT_SECRET, { expiresIn: '7d' });
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
                    else reject(new Error(`Graph API error: ${response.statusCode}`));
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

// ==================== RUTAS ADMIN ====================

// Listar actores con filtros
app.get('/api/admin/actores', verificarAdmin, async (req, res) => {
    try {
        const { nombre, edad_min, edad_max, habilidades, idioma, nivel_idioma,
                anios_exp, altura_min, altura_max, color_ojos, color_cabello, escenas_sexo, pais_nacimiento } = req.query;

        let query = `SELECT id, nombre, email, telefono, fecha_nacimiento, genero, altura, peso,
            color_ojos, color_cabello, talla_camiseta, talla_pantalon, talla_zapatos,
            biografia, habilidades, experiencia, formacion_artistica, redes_sociales, idiomas,
            foto_perfil, fecha_registro, is_admin,
            anio_inicio_experiencia, edad_aparente_min, edad_aparente_max,
            escenas_sexo, fechas_no_disponibles,
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
             fechas_no_disponibles, anio_inicio_experiencia, escenas_sexo, link_reel,
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
                fechas_no_disponibles, anio_inicio_experiencia, escenas_sexo, link_reel,
                ciudad_nacimiento, pais_nacimiento, puede_subir_contrato } = req.body;

        await promisePool.query(
            `UPDATE actores SET nombre=?, email=?, telefono=?, fecha_nacimiento=?, genero=?,
             altura=?, peso=?, color_ojos=?, color_cabello=?, biografia=?, habilidades=?,
             experiencia=?, talla_camiseta=?, talla_pantalon=?, talla_zapatos=?,
             formacion_artistica=?, redes_sociales=?, idiomas=?, is_admin=?, is_casting=?,
             edad_aparente_min=?, edad_aparente_max=?, tiene_manager=?, nombre_manager=?,
             fechas_no_disponibles=?, anio_inicio_experiencia=?, escenas_sexo=?, link_reel=?,
             ciudad_nacimiento=?, pais_nacimiento=?, puede_subir_contrato=?
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
             escenas_sexo != null ? escenas_sexo : null, link_reel || null,
             ciudad_nacimiento || null, pais_nacimiento || null,
             puede_subir_contrato ? 1 : 0,
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
        if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

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
        if (!nuevaPassword || nuevaPassword.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        }
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
                anios_exp, altura_min, altura_max, color_ojos, color_cabello, escenas_sexo, pais_nacimiento } = req.query;

        let query = `SELECT id, nombre, fecha_nacimiento, genero, altura, peso,
            color_ojos, color_cabello, talla_camiseta, talla_pantalon, talla_zapatos,
            biografia, habilidades, experiencia, formacion_artistica, redes_sociales, idiomas,
            foto_perfil, fecha_registro,
            anio_inicio_experiencia, edad_aparente_min, edad_aparente_max,
            escenas_sexo, fechas_no_disponibles,
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
             edad_aparente_min, edad_aparente_max, escenas_sexo, link_reel,
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
        if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

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

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
