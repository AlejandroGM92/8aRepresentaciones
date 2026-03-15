const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
require('dotenv').config();

const { app, promisePool } = require('../server');

const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_super_seguro_cambialo_en_produccion';

// ==================== HELPERS ====================

function tokenAdmin() {
    return jwt.sign({ id: 1, email: 'test@admin.com', is_admin: true, is_casting: false }, JWT_SECRET, { expiresIn: '1h' });
}

function tokenActor(id = 999) {
    return jwt.sign({ id, email: 'test@actor.com', is_admin: false, is_casting: false }, JWT_SECRET, { expiresIn: '1h' });
}

afterAll(async () => {
    if (promisePool) await promisePool.end();
});

// ==================== AUTH ====================

describe('POST /api/login', () => {
    test('rechaza credenciales vacías', async () => {
        const res = await request(app).post('/api/login').send({});
        expect(res.status).toBe(400);
    });

    test('rechaza email inexistente', async () => {
        const res = await request(app).post('/api/login').send({
            email: 'noexiste_xyz@test.com',
            password: 'cualquiera123'
        });
        expect([400, 401]).toContain(res.status);
    });

    test('rechaza contraseña incorrecta', async () => {
        const res = await request(app).post('/api/login').send({
            email: 'alejandro.jag36@gmail.com',
            password: 'contraseña_incorrecta_xyz'
        });
        expect([400, 401]).toContain(res.status);
    });
});

describe('POST /api/registro', () => {
    test('rechaza registro sin campos obligatorios', async () => {
        const res = await request(app).post('/api/registro').send({ nombre: 'Test' });
        expect(res.status).toBe(400);
    });

    test('rechaza email con formato inválido', async () => {
        const res = await request(app).post('/api/registro').send({
            nombre: 'Test Actor',
            email: 'no-es-un-email',
            password: 'password123'
        });
        expect(res.status).toBe(400);
    });
});

// ==================== PERFIL ====================

describe('GET /api/perfil', () => {
    test('requiere token', async () => {
        const res = await request(app).get('/api/perfil');
        expect(res.status).toBe(403);
    });

    test('rechaza token inválido', async () => {
        const res = await request(app)
            .get('/api/perfil')
            .set('Authorization', 'Bearer token_falso');
        expect(res.status).toBe(401);
    });

    test('responde con token válido de actor existente', async () => {
        // Usa el actor real id=2 (hotmail) si existe
        const token = jwt.sign({ id: 2, email: 'alejandro.jag@hotmail.com', is_admin: false, is_casting: false }, JWT_SECRET, { expiresIn: '1h' });
        const res = await request(app)
            .get('/api/perfil')
            .set('Authorization', `Bearer ${token}`);
        // 200 si el actor existe, 404 si no
        expect([200, 404]).toContain(res.status);
    });
});

// ==================== RUTAS ADMIN ====================

describe('GET /api/admin/actores', () => {
    test('requiere token', async () => {
        const res = await request(app).get('/api/admin/actores');
        expect(res.status).toBe(403);
    });

    test('rechaza token de actor normal (no admin)', async () => {
        const res = await request(app)
            .get('/api/admin/actores')
            .set('Authorization', `Bearer ${tokenActor()}`);
        expect(res.status).toBe(403);
    });

    test('acepta token de admin y devuelve lista', async () => {
        const res = await request(app)
            .get('/api/admin/actores')
            .set('Authorization', `Bearer ${tokenAdmin()}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('actores');
        expect(Array.isArray(res.body.actores)).toBe(true);
    });
});

// ==================== CONVOCATORIAS ====================

describe('GET /api/convocatorias', () => {
    test('requiere token', async () => {
        const res = await request(app).get('/api/convocatorias');
        expect(res.status).toBe(403);
    });

    test('devuelve lista con token válido', async () => {
        const res = await request(app)
            .get('/api/convocatorias')
            .set('Authorization', `Bearer ${tokenActor()}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('convocatorias');
    });
});

describe('POST /api/admin/convocatorias', () => {
    test('rechaza sin token', async () => {
        const res = await request(app).post('/api/admin/convocatorias').send({ titulo: 'Test' });
        expect(res.status).toBe(403);
    });

    test('rechaza con token de actor normal', async () => {
        const res = await request(app)
            .post('/api/admin/convocatorias')
            .set('Authorization', `Bearer ${tokenActor()}`)
            .send({ titulo: 'Test', descripcion: 'Desc' });
        expect(res.status).toBe(403);
    });

    test('rechaza convocatoria sin título', async () => {
        const res = await request(app)
            .post('/api/admin/convocatorias')
            .set('Authorization', `Bearer ${tokenAdmin()}`)
            .send({ descripcion: 'Sin título' });
        expect(res.status).toBe(400);
    });
});

// ==================== RESET PASSWORD ====================

describe('POST /api/auth/forgot-password', () => {
    test('rechaza sin email', async () => {
        const res = await request(app).post('/api/auth/forgot-password').send({});
        expect(res.status).toBe(400);
    });

    test('responde correctamente aunque el email no exista (evita enumeración)', async () => {
        const res = await request(app)
            .post('/api/auth/forgot-password')
            .send({ email: 'noexiste_xyz_123@test.com' });
        // Debe devolver 200 (no revelar si existe o no) o 404
        expect([200, 404]).toContain(res.status);
    });
});

// ==================== RATE LIMITING ====================

describe('Rate limiting en /api/login', () => {
    test('bloquea después de múltiples intentos fallidos', async () => {
        const intentos = [];
        for (let i = 0; i < 22; i++) {
            intentos.push(
                request(app).post('/api/login').send({
                    email: `spam${i}@test.com`,
                    password: 'wrong'
                })
            );
        }
        const resultados = await Promise.all(intentos);
        const bloqueados = resultados.filter(r => r.status === 429);
        expect(bloqueados.length).toBeGreaterThan(0);
    }, 30000);
});

// ==================== MEJORAS APLICADAS ====================

describe('Mejoras - Compresión HTTP', () => {
    test('respuestas grandes vienen comprimidas (gzip)', async () => {
        const res = await request(app)
            .get('/api/admin/actores')
            .set('Authorization', `Bearer ${tokenAdmin()}`)
            .set('Accept-Encoding', 'gzip, deflate');
        const encoding = res.headers['content-encoding'];
        const bytes = JSON.stringify(res.body).length;
        console.log(`\n[COMPRESIÓN] Content-Encoding: ${encoding || 'sin comprimir'}`);
        console.log(`  Tamaño body decodificado: ${bytes} bytes`);
        expect(res.status).toBe(200);
        // Con compression activo las respuestas > 1KB deben venir comprimidas
        expect(encoding).toBe('gzip');
    });
});

// ==================== ESCALABILIDAD ====================

describe('Escalabilidad - Concurrencia en rutas protegidas', () => {
    test('50 peticiones simultáneas a GET /api/admin/actores', async () => {
        const inicio = Date.now();
        const peticiones = Array.from({ length: 50 }, () =>
            request(app)
                .get('/api/admin/actores')
                .set('Authorization', `Bearer ${tokenAdmin()}`)
        );
        const resultados = await Promise.all(peticiones);
        const fin = Date.now();
        const tiempoTotal = fin - inicio;
        const exitosas = resultados.filter(r => r.status === 200).length;
        const fallidas  = resultados.filter(r => r.status >= 500).length;
        const tiempos   = resultados.map(r => r.headers['x-response-time'] ? parseInt(r.headers['x-response-time']) : null).filter(Boolean);

        console.log(`\n[ESCALABILIDAD] 50 peticiones simultáneas /api/admin/actores`);
        console.log(`  Exitosas   : ${exitosas}`);
        console.log(`  Fallidas   : ${fallidas}`);
        console.log(`  Tiempo total: ${tiempoTotal}ms`);
        console.log(`  Promedio   : ${(tiempoTotal / 50).toFixed(1)}ms por petición`);

        expect(fallidas).toBe(0);
        expect(exitosas).toBe(50);
    }, 60000);

    test('30 peticiones simultáneas a GET /api/convocatorias', async () => {
        const inicio = Date.now();
        const peticiones = Array.from({ length: 30 }, () =>
            request(app)
                .get('/api/convocatorias')
                .set('Authorization', `Bearer ${tokenActor()}`)
        );
        const resultados = await Promise.all(peticiones);
        const fin = Date.now();
        const tiempoTotal = fin - inicio;
        const exitosas = resultados.filter(r => r.status === 200).length;
        const fallidas  = resultados.filter(r => r.status >= 500).length;

        console.log(`\n[ESCALABILIDAD] 30 peticiones simultáneas /api/convocatorias`);
        console.log(`  Exitosas   : ${exitosas}`);
        console.log(`  Fallidas   : ${fallidas}`);
        console.log(`  Tiempo total: ${tiempoTotal}ms`);
        console.log(`  Promedio   : ${(tiempoTotal / 30).toFixed(1)}ms por petición`);

        expect(fallidas).toBe(0);
        expect(exitosas).toBe(30);
    }, 60000);

    test('20 peticiones simultáneas a GET /api/casting/actores', async () => {
        const tokenCasting = jwt.sign(
            { id: 1, email: 'casting@test.com', is_admin: false, is_casting: true },
            JWT_SECRET, { expiresIn: '1h' }
        );
        const inicio = Date.now();
        const peticiones = Array.from({ length: 20 }, () =>
            request(app)
                .get('/api/casting/actores')
                .set('Authorization', `Bearer ${tokenCasting}`)
        );
        const resultados = await Promise.all(peticiones);
        const fin = Date.now();
        const tiempoTotal = fin - inicio;
        const exitosas = resultados.filter(r => r.status === 200).length;
        const fallidas  = resultados.filter(r => r.status >= 500).length;

        console.log(`\n[ESCALABILIDAD] 20 peticiones simultáneas /api/casting/actores`);
        console.log(`  Exitosas   : ${exitosas}`);
        console.log(`  Fallidas   : ${fallidas}`);
        console.log(`  Tiempo total: ${tiempoTotal}ms`);
        console.log(`  Promedio   : ${(tiempoTotal / 20).toFixed(1)}ms por petición`);

        expect(fallidas).toBe(0);
        expect(exitosas).toBe(20);
    }, 60000);
});

// ==================== ROBUSTEZ - ENTRADAS MALICIOSAS ====================

describe('Robustez - Entradas maliciosas', () => {
    test('rechaza SQL injection en login', async () => {
        const inicio = Date.now();
        const res = await request(app).post('/api/login').send({
            email: "' OR '1'='1",
            password: "' OR '1'='1"
        });
        const fin = Date.now();
        console.log(`\n[ROBUSTEZ] SQL injection → status ${res.status} en ${fin - inicio}ms`);
        // 400/401 = rechazado por validación, 429 = bloqueado por rate limiter (ambos son correctos)
        expect([400, 401, 429]).toContain(res.status);
        expect(res.status).not.toBe(200);
    });

    test('rechaza payload excesivamente largo', async () => {
        const inicio = Date.now();
        const res = await request(app).post('/api/registro').send({
            nombre: 'A'.repeat(10000),
            email: 'payload_largo@test.com',
            password: 'Test1234!'
        });
        const fin = Date.now();
        console.log(`\n[ROBUSTEZ] Payload 10000 chars → status ${res.status} en ${fin - inicio}ms`);
        // 400 = validación, 413 = payload too large, 429 = rate limiter (todos correctos)
        expect(res.status).not.toBe(200);
    });

    test('rechaza token JWT manipulado', async () => {
        const tokenFalsificado = tokenActor(999) + 'xmanipuladox';
        const inicio = Date.now();
        const res = await request(app)
            .get('/api/perfil')
            .set('Authorization', `Bearer ${tokenFalsificado}`);
        const fin = Date.now();
        console.log(`\n[ROBUSTEZ] JWT manipulado → status ${res.status} en ${fin - inicio}ms`);
        expect(res.status).toBe(401);
    });

    test('actor no puede acceder a ruta de admin (escalada de privilegios)', async () => {
        const inicio = Date.now();
        const res = await request(app)
            .get('/api/admin/actores')
            .set('Authorization', `Bearer ${tokenActor()}`);
        const fin = Date.now();
        console.log(`\n[ROBUSTEZ] Escalada privilegios → status ${res.status} en ${fin - inicio}ms`);
        expect(res.status).toBe(403);
    });

    test('rate limiter bloquea spam en forgot-password (22 intentos)', async () => {
        const inicio = Date.now();
        const peticiones = Array.from({ length: 22 }, () =>
            request(app).post('/api/auth/forgot-password').send({ email: 'spam_reset@test.com' })
        );
        const resultados = await Promise.all(peticiones);
        const fin = Date.now();
        const bloqueadas = resultados.filter(r => r.status === 429);
        const pasaron    = resultados.filter(r => r.status !== 429);
        console.log(`\n[ROBUSTEZ] Rate limit forgot-password`);
        console.log(`  Bloqueadas (429): ${bloqueadas.length}`);
        console.log(`  Pasaron         : ${pasaron.length}`);
        console.log(`  Tiempo total    : ${fin - inicio}ms`);
        expect(bloqueadas.length).toBeGreaterThan(0);
    }, 30000);
});
