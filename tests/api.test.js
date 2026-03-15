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
