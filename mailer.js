const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

const FROM = `"8a Representaciones" <${process.env.SMTP_USER}>`;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ==================== PLANTILLA BASE ====================

function baseHTML(contenido) {
    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; padding:0; background:#f5f5f5; font-family:Arial,sans-serif; }
  .wrap { max-width:580px; margin:30px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.08); }
  .header { background:linear-gradient(135deg,#910909,#c92a2a); padding:30px 40px; text-align:center; }
  .header img { height:50px; }
  .header h1 { color:#fff; margin:12px 0 0; font-size:20px; font-weight:700; }
  .body { padding:32px 40px; color:#333; font-size:15px; line-height:1.7; }
  .btn { display:inline-block; margin:24px 0 8px; padding:13px 32px; background:linear-gradient(135deg,#910909,#c92a2a); color:#fff !important; text-decoration:none; border-radius:8px; font-weight:700; font-size:15px; }
  .footer { background:#fafafa; border-top:1px solid #eee; padding:18px 40px; text-align:center; font-size:12px; color:#999; }
  .dato { background:#fafafa; border-radius:8px; padding:12px 16px; margin:8px 0; font-size:14px; }
  .dato strong { color:#910909; }
  hr { border:none; border-top:1px solid #f0f0f0; margin:20px 0; }
</style></head>
<body><div class="wrap">
  <div class="header">
    <h1>8a Representaciones</h1>
  </div>
  <div class="body">${contenido}</div>
  <div class="footer">© ${new Date().getFullYear()} 8a Representaciones · Todos los derechos reservados<br>Este es un mensaje automático, por favor no respondas a este correo.</div>
</div></body></html>`;
}

// ==================== 1. BIENVENIDA AL REGISTRARSE ====================

async function enviarBienvenida(actor) {
    if (!actor.email) return;
    const html = baseHTML(`
        <p>Hola <strong>${actor.nombre}</strong>,</p>
        <p>¡Bienvenido a <strong>8a Representaciones</strong>! Tu cuenta ha sido creada exitosamente.</p>
        <p>Ya puedes acceder a tu perfil, completar tu información y estar atento a las nuevas convocatorias que publiquemos.</p>
        <a href="${APP_URL}/perfil.html" class="btn">Ir a mi perfil</a>
        <hr>
        <p style="font-size:13px;color:#888">Si no creaste esta cuenta, ignora este mensaje.</p>
    `);
    try {
        await transporter.sendMail({
            from: FROM,
            to: actor.email,
            subject: '¡Bienvenido a 8a Representaciones!',
            html
        });
    } catch (e) {
        console.error('Mailer bienvenida:', e.message);
    }
}

// ==================== 2. NOTIFICACION DE CONVOCATORIA ====================

async function enviarConvocatoria(actores, convocatoria) {
    if (!actores || actores.length === 0) return;
    const fechaLimite = convocatoria.fecha_limite
        ? new Date(convocatoria.fecha_limite).toLocaleDateString('es-CO', { day:'2-digit', month:'long', year:'numeric' })
        : null;

    for (const actor of actores) {
        if (!actor.email) continue;
        const html = baseHTML(`
            <p>Hola <strong>${actor.nombre}</strong>,</p>
            <p>Tenemos una nueva convocatoria que puede interesarte:</p>
            <div class="dato"><strong>${convocatoria.titulo}</strong></div>
            ${convocatoria.descripcion ? `<p>${convocatoria.descripcion}</p>` : ''}
            ${convocatoria.requisitos ? `<div class="dato"><strong>Requisitos:</strong><br>${convocatoria.requisitos}</div>` : ''}
            ${fechaLimite ? `<div class="dato"><strong>Fecha límite:</strong> ${fechaLimite}</div>` : ''}
            <a href="${APP_URL}/perfil.html" class="btn">Ver convocatoria completa</a>
            <hr>
            <p style="font-size:13px;color:#888">Recibes este correo porque formas parte de nuestra base de actores.</p>
        `);
        try {
            await transporter.sendMail({
                from: FROM,
                to: actor.email,
                subject: `Nueva convocatoria: ${convocatoria.titulo}`,
                html
            });
        } catch (e) {
            console.error(`Mailer convocatoria (${actor.email}):`, e.message);
        }
    }
}

// ==================== 3. CONTRATO SUBIDO (aviso al admin) ====================

async function enviarContratoSubido(actor, nombreArchivo) {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return;
    const html = baseHTML(`
        <p>El actor <strong>${actor.nombre}</strong> ha subido un contrato firmado.</p>
        <div class="dato"><strong>Actor:</strong> ${actor.nombre}</div>
        <div class="dato"><strong>Correo:</strong> ${actor.email}</div>
        <div class="dato"><strong>Archivo:</strong> ${nombreArchivo}</div>
        <div class="dato"><strong>Fecha:</strong> ${new Date().toLocaleString('es-CO')}</div>
        <a href="${APP_URL}/admin.html" class="btn">Ir al panel admin</a>
    `);
    try {
        await transporter.sendMail({
            from: FROM,
            to: adminEmail,
            subject: `Contrato subido por ${actor.nombre}`,
            html
        });
    } catch (e) {
        console.error('Mailer contrato admin:', e.message);
    }
}

// ==================== 4. RESET DE CONTRASEÑA ====================

async function enviarResetPassword(email, nombre, token) {
    const link = `${APP_URL}/reset-password.html?token=${token}`;
    const html = baseHTML(`
        <p>Hola <strong>${nombre}</strong>,</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
        <p>Haz clic en el botón para crear una nueva contraseña. Este enlace es válido por <strong>1 hora</strong>.</p>
        <a href="${link}" class="btn">Restablecer contraseña</a>
        <hr>
        <p style="font-size:13px;color:#888">Si no solicitaste esto, ignora este mensaje. Tu contraseña no cambiará.</p>
        <p style="font-size:12px;color:#bbb;word-break:break-all">Enlace: ${link}</p>
    `);
    try {
        await transporter.sendMail({
            from: FROM,
            to: email,
            subject: 'Restablecer contraseña - 8a Representaciones',
            html
        });
    } catch (e) {
        console.error('Mailer reset password:', e.message);
    }
}

// ==================== 5. RECORDATORIO FECHAS NO DISPONIBLES ====================

async function enviarRecordatorioFechas(actor, diasRestantes) {
    if (!actor.email) return;
    const html = baseHTML(`
        <p>Hola <strong>${actor.nombre}</strong>,</p>
        <p>Te recordamos que tienes fechas de no disponibilidad que vencen en <strong>${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}</strong>.</p>
        <p>Si ya puedes recibir propuestas en esas fechas, actualiza tu disponibilidad en tu perfil para aparecer en las búsquedas de los directores de casting.</p>
        <a href="${APP_URL}/perfil.html" class="btn">Actualizar disponibilidad</a>
    `);
    try {
        await transporter.sendMail({
            from: FROM,
            to: actor.email,
            subject: 'Recordatorio: Tus fechas de no disponibilidad vencen pronto',
            html
        });
    } catch (e) {
        console.error('Mailer recordatorio fechas:', e.message);
    }
}

module.exports = {
    enviarBienvenida,
    enviarConvocatoria,
    enviarContratoSubido,
    enviarResetPassword,
    enviarRecordatorioFechas
};
