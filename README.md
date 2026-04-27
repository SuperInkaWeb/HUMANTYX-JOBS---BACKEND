# Humantyx Jobs - Backend

Backend del sistema Humantyx Jobs, plataforma web orientada a la gestión de vacantes, postulaciones, perfiles de candidatos, usuarios internos, mensajería, notificaciones, invitaciones y recuperación de contraseña.

## Tecnologías utilizadas

- Node.js
- Express
- PostgreSQL
- JSON Web Token
- bcrypt
- Multer
- Resend
- dotenv
- CORS

## Requisitos previos

Antes de ejecutar el proyecto, se requiere tener instalado:

- Node.js
- npm
- PostgreSQL o una base de datos PostgreSQL en la nube
- Cuenta de Resend para el envío de correos
- Variables de entorno configuradas

## Instalación del proyecto

Clonar el repositorio:

```bash
git clone https://github.com/SuperInkaWeb/HUMANTYX-JOBS---BACKEND.git
```

Ingresar a la carpeta del backend:

```bash
cd HUMANTYX-JOBS---BACKEND
```

Instalar dependencias:

```bash
npm install
```

## Configuración de variables de entorno

Crear un archivo `.env` en la raíz del proyecto tomando como referencia el archivo `.env.example`.

Ejemplo de variables necesarias:

```env
PORT=4000
DATABASE_URL=postgresql://usuario:password@host:puerto/nombre_bd
JWT_SECRET=clave_secreta_segura
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
MAIL_FROM=Humantyx Jobs <no-reply@jobs.humantyx.com>
FRONTEND_URL=https://jobs.humantyx.com
NODE_ENV=development
```

## Ejecución en desarrollo

```bash
npm run dev
```

## Ejecución en producción

```bash
npm start
```

## Estructura principal del proyecto

```txt
src/
├── app.js
├── server.js
├── db.js
├── config/
├── controllers/
├── middlewares/
├── routes/
└── services/
```

## Módulos principales

El backend incluye los siguientes módulos:

- Autenticación de usuarios.
- Registro e inicio de sesión.
- Gestión de perfiles.
- Gestión de usuarios ADMIN y RRHH.
- Gestión de vacantes.
- Gestión de postulaciones.
- Subida, previsualización y descarga de CV.
- Mensajería entre reclutador y candidato.
- Sistema de notificaciones.
- Invitaciones de usuarios internos.
- Cambio de contraseña.
- Recuperación de contraseña.

## Roles del sistema

El sistema maneja tres roles principales:

- `ADMIN`: usuario administrador con acceso global.
- `RRHH`: usuario de recursos humanos con acceso a sus propias vacantes.
- `CANDIDATE`: usuario candidato que puede postular a vacantes.

## Endpoints principales

### Autenticación

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/auth/register` | Registra una nueva cuenta de candidato en el sistema. |
| POST | `/auth/login` | Inicia sesión y devuelve el token de autenticación JWT. |
| GET | `/auth/me` | Obtiene la información del usuario autenticado y su perfil. |
| PUT | `/auth/me/profile` | Actualiza el perfil del usuario autenticado según su rol. |
| POST | `/auth/set-password` | Permite crear contraseña a usuarios invitados mediante token. |
| GET | `/auth/invites/validate` | Valida si una invitación existe, está vigente y no ha sido usada. |
| PATCH | `/auth/change-password` | Cambia la contraseña del usuario autenticado. |
| POST | `/auth/forgot-password` | Solicita recuperación de contraseña mediante correo electrónico. |
| POST | `/auth/reset-password` | Restablece la contraseña usando un token de recuperación válido. |
| GET | `/auth/reset-password/validate` | Valida si el token de recuperación de contraseña es válido. |

---

### Vacantes públicas

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/jobs` | Lista las vacantes publicadas disponibles para candidatos y visitantes. |
| GET | `/jobs/:id` | Obtiene el detalle de una vacante publicada específica. |

---

### Candidato

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/candidate/files/cv` | Permite al candidato subir o reemplazar su CV en formato PDF. |
| GET | `/candidate/files/cv` | Obtiene la información del CV cargado por el candidato. |
| GET | `/candidate/files/cv/download` | Descarga el CV del candidato autenticado. |
| POST | `/candidate/applications` | Permite al candidato postular a una vacante publicada. |
| GET | `/candidate/applications` | Lista las postulaciones realizadas por el candidato autenticado. |
| GET | `/candidate/applications/:id/messages` | Lista los mensajes de una postulación del candidato. |
| POST | `/candidate/applications/:id/messages/reply` | Permite al candidato responder en una conversación ya iniciada. |

---

### Gestión de vacantes Admin/RRHH

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/admin/jobs` | Lista las vacantes del panel administrativo. ADMIN ve todas y RRHH solo las propias. |
| POST | `/admin/jobs` | Crea una nueva vacante desde el panel Admin/RRHH. |
| GET | `/admin/jobs/:id` | Obtiene el detalle administrativo de una vacante específica. |
| PUT | `/admin/jobs/:id` | Actualiza los datos de una vacante existente. |
| PATCH | `/admin/jobs/:id/status` | Cambia el estado de una vacante: borrador, publicada o cerrada. |
| DELETE | `/admin/jobs/:id` | Elimina una vacante cuando cumple las reglas de negocio permitidas. |
| GET | `/admin/jobs/:id/applications` | Lista los postulantes de una vacante específica. |

---

### Gestión de postulaciones Admin/RRHH

| Método | Endpoint | Descripción |
|---|---|---|
| PATCH | `/admin/applications/:id/status` | Actualiza el estado de una postulación: aplicado, en revisión, entrevista, no seleccionado o contratado. |
| GET | `/admin/applications/:id/messages` | Lista los mensajes de una postulación para Admin/RRHH. |
| POST | `/admin/applications/:id/messages` | Permite a Admin/RRHH enviar un mensaje al candidato de una postulación. |

---

### Gestión de candidatos Admin/RRHH

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/admin/candidates` | Lista los candidatos registrados en el sistema. |
| GET | `/admin/candidates/:id` | Obtiene el perfil completo de un candidato. |
| GET | `/admin/candidates/:id/cv` | Permite a ADMIN descargar el CV de un candidato. |
| GET | `/admin/jobs/:jobId/candidates/:candidateId/profile` | Obtiene el perfil de un candidato en el contexto de una vacante. |
| GET | `/admin/jobs/:jobId/candidates/:candidateId/cv` | Descarga el CV de un candidato validando acceso por vacante. |
| GET | `/admin/jobs/:jobId/candidates/:candidateId/cv/preview` | Muestra la previsualización del CV del candidato en una vacante. |

---

### Gestión de usuarios internos e invitaciones

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/admin/users/invite` | Crea una invitación para registrar un usuario ADMIN o RRHH. |
| GET | `/admin/users` | Lista usuarios internos registrados en el sistema. |
| PATCH | `/admin/users/:id/status` | Activa o desactiva el acceso de un usuario interno. |
| GET | `/admin/users/user-invites` | Lista las invitaciones enviadas y su estado actual. |
| PATCH | `/admin/users/user-invites/:id/cancel` | Cancela una invitación pendiente. |
| POST | `/admin/users/user-invites/:id/resend` | Reenvía una invitación respetando las reglas de cooldown. |

---

### Notificaciones

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/notifications` | Lista las notificaciones del usuario autenticado. |
| GET | `/notifications/unread-count` | Devuelve la cantidad de notificaciones no leídas. |
| PATCH | `/notifications/read-all` | Marca todas las notificaciones del usuario como leídas. |
| PATCH | `/notifications/read-by-context` | Marca como leídas las notificaciones relacionadas a una postulación o vacante específica. |
| PATCH | `/notifications/:id/read` | Marca una notificación específica como leída. |

### Notificaciones y mensajes

- Listado de mensajes por postulación.
- Envío de mensajes entre reclutador y candidato.
- Conteo de mensajes no leídos.
- Listado de notificaciones.
- Conteo de notificaciones no leídas.
- Marcado de notificaciones como leídas.

## Despliegue

El backend está preparado para desplegarse en Render o en cualquier proveedor compatible con aplicaciones Node.js.

Para producción se deben configurar las variables de entorno directamente en el panel del proveedor de despliegue.

## Consideraciones de seguridad

- Las contraseñas se almacenan con hash mediante bcrypt.
- La autenticación se realiza mediante JWT.
- Las rutas protegidas usan middleware de autenticación.
- Las rutas administrativas validan roles.
- Los usuarios RRHH tienen restricciones sobre las vacantes que pueden gestionar.
- Las credenciales reales no deben subirse al repositorio.
- El archivo `.env` debe permanecer ignorado por Git.