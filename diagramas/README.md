# Diagramas UML — 8a Representaciones

Arquitectura de software del sistema de gestión de actores.

---

## 1. Diagrama de Componentes (Arquitectura General)

```mermaid
graph TB
    subgraph Cliente["Cliente (Navegador)"]
        L[login.html]
        R[registro.html]
        P[perfil.html]
        CP[completar-perfil.html]
        ADM[admin.html]
        ADF[admin-actor-form.html]
        CST[casting.html]
        RC[registro-casting.html]
    end

    subgraph Backend["Backend — Node.js + Express (server.js)"]
        API[API REST]
        MW_JWT[Middleware JWT]
        MW_ADMIN[Middleware Admin]
        MW_CAST[Middleware Casting]
        MULTER[Multer — Subida de Archivos]
        BCRYPT[bcrypt — Hash de Contraseñas]
    end

    subgraph DB["Base de Datos — MySQL"]
        T1[(actores)]
        T2[(fotos_actor)]
        T3[(notificaciones_admin)]
    end

    subgraph Externos["Servicios OAuth Externos"]
        GOOGLE[Google OAuth API]
        MICROSOFT[Microsoft Graph API]
    end

    Cliente -->|HTTP / JSON| API
    API --> MW_JWT & MW_ADMIN & MW_CAST
    API --> MULTER & BCRYPT
    API -->|SQL prepared statements| T1 & T2 & T3
    API <-->|Verificar tokens| GOOGLE & MICROSOFT
    API -->|Archivos estáticos| Cliente
```

---

## 2. Diagrama Entidad-Relación (Base de Datos)

```mermaid
erDiagram
    ACTORES {
        int id PK
        varchar nombre
        varchar email UK
        varchar password "NULL si OAuth"
        varchar telefono
        date fecha_nacimiento
        varchar genero
        float altura
        float peso
        varchar color_ojos
        varchar color_cabello
        text biografia
        text habilidades "JSON array"
        text experiencia "JSON array"
        text formacion_artistica "JSON array"
        text idiomas "JSON array"
        text redes_sociales "JSON object"
        varchar foto_perfil
        int edad_aparente_min
        int edad_aparente_max
        tinyint tiene_manager
        varchar nombre_manager
        text fechas_no_disponibles "JSON array"
        int anio_inicio_experiencia
        tinyint escenas_sexo
        varchar link_reel
        varchar google_id UK
        varchar microsoft_id UK
        enum auth_provider "local|google|microsoft"
        tinyint perfil_completo
        tinyint is_admin
        tinyint is_casting
        datetime fecha_registro
    }

    FOTOS_ACTOR {
        int id PK
        int actor_id FK
        varchar url_foto
        varchar descripcion
    }

    NOTIFICACIONES_ADMIN {
        int id PK
        int actor_id FK
        varchar actor_nombre
        tinyint leido
        datetime fecha
    }

    ACTORES ||--o{ FOTOS_ACTOR : "tiene galería"
    ACTORES ||--o{ NOTIFICACIONES_ADMIN : "genera al actualizar"
```

---

## 3. Diagrama de Casos de Uso

```mermaid
flowchart TD
    subgraph Sistema["Sistema 8a Representaciones"]

        subgraph UC_ACTOR["Actor"]
            A1[Registrarse]
            A2[Iniciar sesión local]
            A3[Login con Google / Microsoft]
            A4[Completar perfil OAuth]
            A5[Ver y editar perfil completo]
            A6[Subir foto de perfil]
            A7[Gestionar galería de fotos]
            A8[Cambiar contraseña]
        end

        subgraph UC_ADMIN["Administrador"]
            B1[Ver todos los actores]
            B2[Crear perfil de actor]
            B3[Editar perfil completo]
            B4[Eliminar actor]
            B5[Subir fotos de cualquier actor]
            B6[Resetear contraseña de actor]
            B7[Ver notificaciones de perfiles actualizados]
            B8[Asignar rol de casting]
            B9[Buscar con filtros avanzados]
        end

        subgraph UC_CAST["Director de Casting"]
            C1[Buscar actores con filtros]
            C2[Ver perfil de actor — sin contacto]
            C3[Filtrar por disponibilidad de fecha]
        end
    end

    ACTOR([Actor]) --> UC_ACTOR
    ADMIN([Administrador]) --> UC_ADMIN
    CASTING([Director de Casting]) --> UC_CAST
```

---

## 4. Diagrama de Secuencia — Login Local

```mermaid
sequenceDiagram
    actor U as Usuario
    participant F as Frontend
    participant S as Server (Express)
    participant DB as MySQL

    U->>F: Ingresa email y contraseña
    F->>S: POST /api/login
    S->>DB: SELECT * FROM actores WHERE email = ?
    DB-->>S: Fila del actor

    alt Actor encontrado
        S->>S: bcrypt.compare(password, hash)
        alt Contraseña correcta
            S->>S: jwt.sign({id, is_admin, is_casting})
            S-->>F: 200 { token, actor }
            F->>F: localStorage.setItem('token', ...)
            alt is_admin
                F-->>U: Redirigir a admin.html
            else is_casting
                F-->>U: Redirigir a casting.html
            else Actor normal
                F-->>U: Redirigir a perfil.html
            end
        else Contraseña incorrecta
            S-->>F: 401 Credenciales inválidas
            F-->>U: Mostrar mensaje de error
        end
    else Actor no encontrado
        S-->>F: 401 Credenciales inválidas
        F-->>U: Mostrar mensaje de error
    end
```

---

## 5. Diagrama de Secuencia — Login con Google OAuth

```mermaid
sequenceDiagram
    actor U as Usuario
    participant F as Frontend
    participant G as Google OAuth
    participant S as Server (Express)
    participant DB as MySQL

    U->>F: Clic en "Iniciar con Google"
    F->>G: google.accounts.id.initialize()
    G-->>F: Popup de selección de cuenta
    U->>G: Selecciona cuenta
    G-->>F: ID Token (credential)
    F->>S: POST /api/auth/google { token }
    S->>G: googleClient.verifyIdToken(token)
    G-->>S: { sub, name, email, picture }

    S->>DB: SELECT * FROM actores WHERE google_id = ?
    alt Usuario existente
        DB-->>S: Actor encontrado
        S->>S: jwt.sign({id, is_admin, is_casting})
        S-->>F: { token, actor, perfil_completo: true }
        F-->>U: Redirigir a perfil.html
    else Usuario nuevo
        S->>DB: INSERT actores (nombre, email, foto, google_id, auth_provider='google', perfil_completo=0)
        DB-->>S: insertId
        S->>S: jwt.sign({id})
        S-->>F: { token, actor, perfil_completo: false }
        F-->>U: Redirigir a completar-perfil.html
    end
```

---

## 6. Diagrama de Secuencia — Actualización de Perfil

```mermaid
sequenceDiagram
    actor A as Actor
    participant F as Frontend (perfil.html)
    participant S as Server (Express)
    participant MW as Middleware JWT
    participant DB as MySQL
    participant ADM as Panel Admin

    A->>F: Edita campos y hace clic en Guardar
    F->>S: PUT /api/perfil (Authorization: Bearer token)
    S->>MW: verificarToken(token)
    MW->>MW: jwt.verify(token, JWT_SECRET)
    MW-->>S: req.userId = id del actor

    S->>DB: UPDATE actores SET ... WHERE id = req.userId
    DB-->>S: OK (affectedRows: 1)

    S->>DB: INSERT INTO notificaciones_admin (actor_id, actor_nombre)
    DB-->>S: OK

    S-->>F: 200 { mensaje: 'Perfil actualizado exitosamente' }
    F-->>A: Notificación verde de éxito

    Note over ADM,DB: El admin verá la notificación en su panel
    ADM->>S: GET /api/admin/notificaciones
    S->>DB: SELECT * FROM notificaciones_admin WHERE leido=0
    DB-->>S: Lista de notificaciones
    S-->>ADM: { notificaciones, no_leidas: N }
```

---

## 7. Diagrama de Secuencia — Admin crea perfil de actor

```mermaid
sequenceDiagram
    actor ADM as Administrador
    participant F as admin-actor-form.html
    participant S as Server (Express)
    participant DB as MySQL

    ADM->>F: Completa formulario y guarda
    F->>S: POST /api/admin/actores (Bearer token admin)
    S->>S: verificarAdmin — comprueba is_admin en JWT

    S->>DB: SELECT id FROM actores WHERE email = ?
    alt Email ya registrado
        DB-->>S: Fila encontrada
        S-->>F: 400 El email ya está registrado
        F-->>ADM: Error en formulario
    else Email libre
        DB-->>S: Sin resultados
        S->>S: bcrypt.hash(password, 10)
        S->>DB: INSERT INTO actores (todos los campos)
        DB-->>S: { insertId }
        S-->>F: 201 { mensaje, actorId }
        F->>F: Redirigir a admin-actor-form.html?id=actorId
        ADM->>F: Sube foto de perfil / galería
        F->>S: POST /api/admin/actores/:id/foto
        S->>DB: UPDATE actores SET foto_perfil = ?
    end
```

---

## 8. Diagrama de Secuencia — Búsqueda en Panel de Casting

```mermaid
sequenceDiagram
    actor C as Director de Casting
    participant F as casting.html
    participant S as Server (Express)
    participant DB as MySQL

    C->>F: Aplica filtros y presiona Buscar
    Note over F: filtroFechasActivo = true
    F->>S: GET /api/casting/actores?nombre=...&idioma=...
    S->>S: verificarCasting — comprueba is_casting o is_admin
    S->>DB: SELECT id, nombre, genero, altura... (SIN email NI teléfono)<br/>WHERE is_admin=0 AND is_casting=0 AND [filtros]
    DB-->>S: Lista de actores

    S->>S: Filtro Node.js por idioma + nivel_idioma (JSON)
    S-->>F: { actores: [...] }

    F->>F: Filtro client-side: edad_aparente
    F->>F: Filtro client-side: estaNoDisponibleHoy() — excluye actores<br/>cuyas fechas_no_disponibles cubren el día de hoy
    F-->>C: Tarjetas de actores (sin email ni teléfono)

    C->>F: Clic en "Ver Perfil"
    F->>S: GET /api/casting/actores/:id
    S->>DB: SELECT ... (SIN email NI teléfono) WHERE id=?
    DB-->>S: Datos del actor + fotos de galería
    S-->>F: { actor, fotos }
    F-->>C: Modal con perfil completo (sin datos de contacto)
```

---

## 9. Diagrama de Despliegue

```mermaid
graph TB
    subgraph User["Usuario Final"]
        BROWSER[Navegador Web]
    end

    subgraph Render["Servidor — Render.com"]
        subgraph App["Aplicación Node.js"]
            EXPRESS[Express Server<br/>puerto 3000]
            STATIC[Archivos Estáticos<br/>HTML · CSS · JS · Imágenes]
            UPLOADS[Carpeta uploads/]
        end
    end

    subgraph DBHost["Base de Datos — PlanetScale / Railway"]
        MYSQL[(MySQL<br/>8a_representaciones)]
    end

    subgraph OAuth["Servicios Externos"]
        GAUTH[Google OAuth 2.0]
        MSAUTH[Microsoft Identity Platform]
    end

    BROWSER -->|HTTPS| EXPRESS
    EXPRESS --> STATIC
    EXPRESS --> UPLOADS
    EXPRESS -->|SSL · TCP 3306| MYSQL
    EXPRESS <-->|HTTPS| GAUTH
    EXPRESS <-->|HTTPS| MSAUTH
```

---

## Resumen de Roles y Accesos

```mermaid
graph LR
    subgraph Roles
        A([Actor]) -->|perfil.html| PA[Ver y editar<br/>su propio perfil]
        B([Administrador]) -->|admin.html| PB[Control total<br/>de todos los actores]
        C([Director de Casting]) -->|casting.html| PC[Buscar actores<br/>sin datos de contacto]
    end

    style PA fill:#e8f5e9,stroke:#388e3c
    style PB fill:#fff3e0,stroke:#f57c00
    style PC fill:#e3f2fd,stroke:#1976d2
```
