# 8a Representaciones — Portal de Actores

Sistema integral de gestión de actores para agencia de representación artística. Incluye portal de actores, panel de administración, panel de director de casting y autenticación OAuth.

## Tecnologías

| Capa | Tecnología |
|------|-----------|
| Backend | Node.js + Express |
| Base de datos | MySQL 5.7+ |
| Autenticación | JWT + bcrypt + OAuth (Google / Microsoft) |
| Frontend | HTML5 + CSS3 + JavaScript (Vanilla) |
| Subida de archivos | Multer (imágenes hasta 5 MB) |

---

## Requisitos Previos

- Node.js v14 o superior
- MySQL 5.7 o superior
- npm

---

## Instalación Local

### 1. Clonar el repositorio

```bash
git clone https://github.com/TU_USUARIO/8a-representaciones.git
cd 8a-representaciones
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
# Base de datos
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_password_mysql
DB_NAME=8a_representaciones

# Servidor
PORT=3000

# JWT
JWT_SECRET=cambia_esto_por_un_secreto_muy_largo_y_aleatorio

# Token de invitación para directores de casting
CASTING_INVITE_TOKEN=tu_token_privado_para_casting

# OAuth Google (opcional)
GOOGLE_CLIENT_ID=tu_google_client_id

# OAuth Microsoft (opcional)
MICROSOFT_CLIENT_ID=tu_microsoft_client_id
```

### 4. Configurar la base de datos

```bash
mysql -u root -p < database.sql
```

Si las columnas nuevas no están en tu `database.sql`, ejecuta también en phpMyAdmin o MySQL Workbench:

```sql
ALTER TABLE actores
  ADD COLUMN IF NOT EXISTS edad_aparente_min INT NULL,
  ADD COLUMN IF NOT EXISTS edad_aparente_max INT NULL,
  ADD COLUMN IF NOT EXISTS tiene_manager TINYINT(1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nombre_manager VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS fechas_no_disponibles TEXT NULL,
  ADD COLUMN IF NOT EXISTS anio_inicio_experiencia INT NULL,
  ADD COLUMN IF NOT EXISTS escenas_sexo TINYINT(1) NULL,
  ADD COLUMN IF NOT EXISTS link_reel VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) NULL UNIQUE,
  ADD COLUMN IF NOT EXISTS microsoft_id VARCHAR(255) NULL UNIQUE,
  ADD COLUMN IF NOT EXISTS auth_provider ENUM('local','google','microsoft') DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS perfil_completo TINYINT(1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_casting TINYINT(1) DEFAULT 0,
  MODIFY COLUMN password VARCHAR(255) NULL;

UPDATE actores SET perfil_completo = 1 WHERE auth_provider = 'local' OR auth_provider IS NULL;
```

### 5. Crear la carpeta de uploads

```bash
mkdir uploads
```

### 6. Iniciar el servidor

```bash
# Producción
npm start

# Desarrollo (con auto-reload)
npm run dev
```

El sistema estará disponible en `http://localhost:3000`

---

## Estructura del Proyecto

```
8a-representaciones/
├── server.js                    # API REST (Express)
├── package.json
├── .env                         # Variables de entorno (NO subir a Git)
├── database.sql                 # Esquema de base de datos
│
├── login.html                   # Página de inicio de sesión
├── registro.html                # Registro de actor (multipaso)
├── perfil.html                  # Perfil del actor (autenticado)
├── completar-perfil.html        # Completar perfil tras OAuth
├── admin.html                   # Panel de administración
├── admin-actor-form.html        # Formulario completo de actor (admin)
├── casting.html                 # Panel de director de casting
├── registro-casting.html        # Registro de director de casting
│
├── funcionalidad/
│   ├── funciones.js             # Login + OAuth handlers
│   ├── funciones-registro.js   # Registro multipaso de actor
│   ├── perfil.js                # Lógica del perfil del actor
│   ├── funciones-completar.js  # Completar perfil tras OAuth
│   ├── admin.js                 # Panel de administración
│   ├── admin-actor-form.js      # Formulario completo de actor
│   ├── casting.js               # Panel de casting
│   └── registro-casting.js     # Registro de casting
│
├── estilos/
│   ├── style-login.css
│   ├── style-registro.css
│   ├── style-perfil.css
│   └── style-admin.css          # Admin + casting
│
├── imagenes/
│   └── LOGO 8A ROJO-SIN FONDO.png
│
└── uploads/                     # Fotos subidas (generado automáticamente)
```

---

## Roles del Sistema

| Rol | Acceso | Descripción |
|-----|--------|-------------|
| **Actor** | `perfil.html` | Gestiona su propio perfil |
| **Administrador** | `admin.html` / `admin-actor-form.html` | Control total sobre todos los perfiles |
| **Director de Casting** | `casting.html` | Búsqueda y consulta de actores (sin datos de contacto) |

> El director de casting **no puede ver** el correo ni el teléfono de los actores para que todo contacto pase por la agencia 8a Representaciones.

---

## API Endpoints

### Autenticación pública

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/registro` | Registrar nuevo actor |
| `POST` | `/api/login` | Iniciar sesión |
| `POST` | `/api/auth/google` | Login con Google OAuth |
| `POST` | `/api/auth/microsoft` | Login con Microsoft OAuth |
| `GET` | `/api/casting/verificar-token` | Verificar token de invitación casting |
| `POST` | `/api/casting/registro` | Registrar director de casting |

### Perfil del actor (JWT requerido)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/perfil` | Obtener perfil propio |
| `PUT` | `/api/perfil` | Actualizar perfil |
| `POST` | `/api/perfil/foto` | Subir foto de perfil |
| `POST` | `/api/perfil/fotos` | Agregar foto a galería |
| `DELETE` | `/api/perfil/fotos/:id` | Eliminar foto de galería |
| `PUT` | `/api/perfil/password` | Cambiar contraseña |

### Panel de administración (is_admin requerido)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/admin/actores` | Listar actores con filtros |
| `GET` | `/api/admin/actores/:id` | Obtener actor por ID |
| `POST` | `/api/admin/actores` | Crear nuevo perfil de actor |
| `PUT` | `/api/admin/actores/:id` | Editar perfil completo |
| `DELETE` | `/api/admin/actores/:id` | Eliminar actor |
| `POST` | `/api/admin/actores/:id/foto` | Subir foto de perfil de un actor |
| `POST` | `/api/admin/actores/:id/fotos` | Agregar foto a galería de un actor |
| `DELETE` | `/api/admin/actores/:id/fotos/:fotoId` | Eliminar foto de galería |
| `PUT` | `/api/admin/actores/:id/password` | Resetear contraseña de un actor |
| `GET` | `/api/admin/notificaciones` | Ver notificaciones de perfiles actualizados |
| `PUT` | `/api/admin/notificaciones/leer` | Marcar notificaciones como leídas |

### Panel de casting (is_casting requerido)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/casting/actores` | Listar actores (sin email ni teléfono) |
| `GET` | `/api/casting/actores/:id` | Ver perfil de actor (sin email ni teléfono) |

---

## Filtros de Búsqueda

Disponibles en el panel de administración y el panel de casting:

| Filtro | Tipo | Descripción |
|--------|------|-------------|
| Nombre | Texto | Búsqueda parcial |
| Habilidades | Texto | Búsqueda parcial |
| Idioma | Select | Español, Inglés, Francés... |
| Nivel de idioma | Select | Básico, Intermedio, Avanzado, Nativo |
| Años de experiencia | Select | Menos de 1 año hasta más de 5 años |
| Edad mínima / máxima | Número | Calcula por fecha de nacimiento |
| Edad aparente | Número | Filtra por rango de edad aparente del actor |
| Altura mínima / máxima | Número (cm) | |
| Color de ojos | Texto | |
| Color de cabello | Texto | |
| Escenas de sexo | Select | Sí / No |
| Disponibilidad | Checkbox | Al buscar, excluye actores no disponibles hoy |

---

## Funcionalidades Principales

### Actor
- Registro en 3 pasos con validación en tiempo real
- Login local + OAuth (Google / Microsoft)
- Completar perfil tras login OAuth
- Editar perfil completo: datos personales, físicos, idiomas, habilidades, experiencia profesional, formación artística, redes sociales, manager, reel, fechas de no disponibilidad
- Galería de fotos (hasta 5 MB por imagen)
- Cambio de contraseña

### Administrador
- Ver, crear, editar y eliminar cualquier perfil de actor
- Control total desde `admin-actor-form.html`: todos los campos, foto de perfil, galería, reset de contraseña
- Filtros avanzados de búsqueda
- Notificaciones cuando un actor actualiza su perfil
- Asignar rol de director de casting a usuarios

### Director de Casting
- Búsqueda con todos los filtros disponibles
- Vista completa del perfil del actor: características físicas, experiencia, habilidades, redes sociales, galería
- **Sin acceso al correo ni al teléfono** — el contacto debe pasar por la agencia

---

## Seguridad

- Contraseñas hasheadas con **bcrypt** (salt rounds: 10)
- **JWT** con expiración de 7 días
- Rutas protegidas por middleware de rol (`verificarToken`, `verificarAdmin`, `verificarCasting`)
- Solo se aceptan imágenes (jpeg, jpg, png, gif), máximo 5 MB
- Prepared statements en todas las consultas SQL (previene SQL injection)
- Correo y teléfono de actores excluidos de las respuestas de la API de casting (protección en el servidor, no solo en el cliente)

---

## Despliegue en Producción

### Variables de entorno (producción)

Asegúrate de cambiar en tu `.env` de producción:
- `JWT_SECRET` — cadena aleatoria larga (mínimo 32 caracteres)
- `CASTING_INVITE_TOKEN` — token privado para registro de casting
- `DB_*` — credenciales de la base de datos en producción

### Plataformas recomendadas

| Plataforma | Ideal para |
|-----------|-----------|
| [Render.com](https://render.com) | Backend Express + MySQL externo (tier gratuito) |
| [Railway.app](https://railway.app) | Express + MySQL en la misma plataforma |
| [Heroku](https://heroku.com) | Clásico, con add-on de MySQL |
| [Vercel](https://vercel.com) | Requiere adaptaciones (ver abajo) |

### Vercel (requiere adaptaciones)

Vercel funciona con funciones serverless y **no tiene sistema de archivos persistente**, por lo que las fotos subidas con Multer se perderán entre requests. Para usarlo en Vercel se necesita:

1. Usar **Cloudinary** o **AWS S3** para almacenamiento de imágenes
2. Usar **PlanetScale** o **Railway MySQL** como base de datos externa
3. Agregar `vercel.json` (incluido en este repositorio)

---

## Solución de Problemas

| Error | Causa | Solución |
|-------|-------|---------|
| `ER_ACCESS_DENIED_ERROR` | Credenciales MySQL incorrectas | Revisa `.env` |
| `ER_NO_SUCH_TABLE` | Tabla no existe | Ejecuta `database.sql` y el ALTER TABLE |
| `Token inválido` | JWT expirado o incorrecto | Limpia `localStorage` en el navegador |
| Fotos no cargan | Carpeta `uploads/` no existe | `mkdir uploads` |
| CORS bloqueado | Frontend en dominio diferente | Asegúrate de acceder por `http://localhost:3000` |

---

## Licencia

Proyecto privado — 8a Representaciones. Todos los derechos reservados.
