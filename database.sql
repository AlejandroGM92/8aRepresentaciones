-- Crear la base de datos
CREATE DATABASE IF NOT EXISTS 8a_representaciones CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE 8a_representaciones;

-- Tabla de actores
CREATE TABLE IF NOT EXISTS actores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    telefono VARCHAR(20),
    fecha_nacimiento DATE,
    genero ENUM('masculino', 'femenino', 'otro', 'prefiero_no_decir'),
    altura DECIMAL(5,2), -- en centímetros
    peso DECIMAL(5,2), -- en kilogramos
    color_ojos VARCHAR(50),
    color_cabello VARCHAR(50),
    biografia TEXT,
    experiencia TEXT,
    habilidades TEXT,
    foto_perfil VARCHAR(500),
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de fotos adicionales del actor
CREATE TABLE IF NOT EXISTS fotos_actor (
    id INT AUTO_INCREMENT PRIMARY KEY,
    actor_id INT NOT NULL,
    url_foto VARCHAR(500) NOT NULL,
    descripcion TEXT,
    fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_id) REFERENCES actores(id) ON DELETE CASCADE,
    INDEX idx_actor_id (actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de experiencia profesional (opcional)
CREATE TABLE IF NOT EXISTS experiencia_profesional (
    id INT AUTO_INCREMENT PRIMARY KEY,
    actor_id INT NOT NULL,
    proyecto VARCHAR(255) NOT NULL,
    tipo ENUM('cine', 'television', 'teatro', 'comercial', 'otro') NOT NULL,
    rol VARCHAR(255) NOT NULL,
    director VARCHAR(255),
    productora VARCHAR(255),
    anio YEAR,
    descripcion TEXT,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_id) REFERENCES actores(id) ON DELETE CASCADE,
    INDEX idx_actor_id (actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insertar un actor de prueba
-- Contraseña: test123
INSERT INTO actores (nombre, email, password, telefono, genero, biografia) 
VALUES (
    'Actor de Prueba',
    'actor@test.com',
    '$2a$10$YourHashedPasswordHere',
    '3001234567',
    'masculino',
    'Actor profesional con experiencia en teatro y cine.'
);

-- Consultas útiles para administración

-- Ver todos los actores
-- SELECT id, nombre, email, telefono, fecha_registro FROM actores;

-- Ver perfil completo de un actor
-- SELECT * FROM actores WHERE id = 1;

-- Ver todas las fotos de un actor
-- SELECT * FROM fotos_actor WHERE actor_id = 1;

-- Actualizar foto de perfil
-- UPDATE actores SET foto_perfil = '/uploads/foto.jpg' WHERE id = 1;

-- Eliminar actor y todas sus fotos (gracias a CASCADE)
-- DELETE FROM actores WHERE id = 1;

-- ==================== MIGRACION: CONVOCATORIAS Y RESET PASSWORD ====================

-- Tabla de convocatorias
CREATE TABLE IF NOT EXISTS convocatorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT,
    requisitos TEXT,
    fecha_limite DATE NULL,
    estado ENUM('borrador','publicada','cerrada') DEFAULT 'borrador',
    fecha_creacion DATETIME DEFAULT NOW(),
    fecha_publicacion DATETIME NULL
);

-- Columnas para reset de contraseña
ALTER TABLE actores
    ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS reset_token_expiry DATETIME NULL;

-- Personajes por convocatoria
CREATE TABLE IF NOT EXISTS personajes_convocatoria (
    id INT AUTO_INCREMENT PRIMARY KEY,
    convocatoria_id INT NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT NULL,
    FOREIGN KEY (convocatoria_id) REFERENCES convocatorias(id) ON DELETE CASCADE
);

-- Postulaciones de actores
CREATE TABLE IF NOT EXISTS postulaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    actor_id INT NOT NULL,
    convocatoria_id INT NOT NULL,
    personaje_id INT NOT NULL,
    fecha_postulacion DATETIME DEFAULT NOW(),
    UNIQUE KEY unique_postulacion (actor_id, convocatoria_id),
    FOREIGN KEY (actor_id) REFERENCES actores(id) ON DELETE CASCADE,
    FOREIGN KEY (convocatoria_id) REFERENCES convocatorias(id) ON DELETE CASCADE,
    FOREIGN KEY (personaje_id) REFERENCES personajes_convocatoria(id) ON DELETE CASCADE
);

-- Nuevas columnas para acentos del actor
ALTER TABLE actores
  ADD COLUMN acentos_maneja JSON NULL,
  ADD COLUMN acentos_no_maneja JSON NULL;

-- Nuevas columnas de filtro en convocatorias
ALTER TABLE convocatorias
  ADD COLUMN filtro_genero VARCHAR(30) NULL,
  ADD COLUMN filtro_acento VARCHAR(100) NULL;
