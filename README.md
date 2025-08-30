# Microservicios API REST

## Descripción

API REST completa construida con arquitectura de microservicios utilizando Node.js, Express y MongoDB. El sistema incluye gestión de usuarios, cuentas, grupos, roles, eventos y autenticación con JWT. Diseñado para ser escalable, seguro y fácil de mantener.

## ✨ Características Principales

### 🔐 Sistema de Autenticación y Autorización
- Registro e inicio de sesión de usuarios
- Autenticación JWT con tokens seguros
- Sistema de roles jerárquico con 5 niveles
- Middleware de autorización por permisos
- Estado de usuarios: pending, approved, rejected

### 🏢 Gestión de Cuentas
- CRUD completo de cuentas organizacionales  
- Creación automática de usuario administrador
- Soporte para logos (URL o base64)
- Validaciones robustas y manejo de errores

### 👥 Sistema de Grupos
- Organización de usuarios dentro de cuentas
- Gestión de permisos por grupo
- Roles por defecto y usuarios múltiples
- Estadísticas y reportes de grupos

### 🎯 Gestión de Eventos
- CRUD completo de eventos y actividades
- 10 categorías predefinidas (conferencias, talleres, webinars, etc.)
- Eventos presenciales y virtuales
- Sistema de inscripciones y participantes
- Estados de eventos: borrador, publicado, en_curso, finalizado, cancelado
- Gestión de capacidad máxima y aprobaciones
- Tags y búsqueda avanzada
- Estadísticas por cuenta

### 🛡️ Roles y Permisos
- 5 roles predefinidos con jerarquía
- Sistema granular de permisos por módulo
- Seeder automático de roles del sistema
- Gestión de permisos por acción (crear, leer, actualizar, eliminar, administrar)

## 🏗️ Arquitectura

### Microservicios
- **Gateway** (Puerto 3000): Enrutador principal y documentación
- **Users Service** (Puerto 3001): Gestión de usuarios y roles  
- **Accounts Service** (Puerto 3002): Gestión de cuentas, grupos y eventos

### Base de Datos
- **MongoDB** con Mongoose ODM
- Esquemas validados y relaciones pobladas
- Índices optimizados para consultas
- Transacciones para operaciones críticas

### Seguridad
- Autenticación JWT con expiración
- Rate limiting para prevenir abuso
- Validación de entrada con Joi
- Manejo seguro de archivos y imágenes
- Headers de seguridad con Helmet

## Arquitectura

El proyecto está estructurado en microservicios:

- **Gateway**: Punto de entrada principal que enruta las peticiones
- **Users Service**: Gestión de usuarios, autenticación y roles
- **Accounts Service**: Gestión de clientes/cuentas y grupos

## Tecnologías

- Node.js & Express
- MongoDB con Mongoose
- JWT para autenticación
- bcryptjs para hash de contraseñas
- CORS y Helmet para seguridad
- Rate limiting

## Instalación

1. Clona el repositorio
2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Configura las variables de entorno:
   - Crea un archivo `.env` con las siguientes variables:
   ```
   MONGODB_URI=mongodb://localhost:27017/microservices_db
   JWT_SECRET=your-super-secret-jwt-key-here-change-this-in-production
   JWT_EXPIRE=7d
   GATEWAY_PORT=3000
   USERS_SERVICE_PORT=3001
   ACCOUNTS_SERVICE_PORT=3002
   USERS_SERVICE_URL=http://localhost:3001
   ACCOUNTS_SERVICE_URL=http://localhost:3002
   NODE_ENV=development
   ```
   - Asegúrate de tener MongoDB corriendo

4. Inicializa los roles del sistema:
   ```bash
   node scripts/seedRoles.js seed
   ```

5. Inicia los servicios:
   ```bash
   # Todos los servicios
   npm run dev
   
   # Servicios individuales
   npm run dev:gateway
   npm run dev:users
   npm run dev:accounts
   ```

## Estructura del Proyecto

```
├── config/                 # Configuración general
├── gateway/               # API Gateway
├── services/
│   ├── users/            # Microservicio de usuarios
│   └── accounts/         # Microservicio de cuentas
├── shared/               # Código compartido
└── database/             # Configuración de base de datos
```

## Endpoints

### Users Service (Puerto 3001)
- `POST /api/users/register` - Registro de usuario
- `POST /api/users/login` - Login de usuario
- `GET /api/users/profile` - Obtener perfil (requiere auth)
- `GET /api/roles` - Obtener roles disponibles
- `GET /api/roles/hierarchy` - Obtener jerarquía de roles

### Accounts Service (Puerto 3002)
- `POST /api/accounts` - Crear cuenta
- `GET /api/accounts` - Listar cuentas
- `GET /api/accounts/:id` - Obtener cuenta específica
- `PUT /api/accounts/:id` - Actualizar cuenta
- `DELETE /api/accounts/:id` - Eliminar cuenta
- `POST /api/groups` - Crear grupo
- `GET /api/groups/account/:accountId` - Obtener grupos de cuenta
- `GET /api/accounts/stats` - Obtener estadísticas

#### Campos requeridos para crear una cuenta:
- `nombre`: Nombre de la cuenta
- `razonSocial`: Razón social de la empresa
- `address`: Dirección completa
- `usuarioAdministrador`: ID del usuario administrador

#### Campos opcionales:
- `logo`: URL del logo de la empresa

### Gateway (Puerto 3000)
- Enruta todas las peticiones a los microservicios correspondientes
- Maneja CORS, rate limiting y logging

## Variables de Entorno

Ver `config/env.config.js` para las variables disponibles.

## Desarrollo

- Cada microservicio se puede ejecutar independientemente
- Los servicios se comunican a través de HTTP
- Se incluye middleware para logging, CORS y rate limiting

## Ejemplos de Uso

Ver el archivo `examples/api-examples.md` para ejemplos completos de cómo usar la API con curl.

## Pruebas

Para probar la API puedes usar:

1. **Postman/Insomnia**: Importa los ejemplos del archivo `examples/api-examples.md`
2. **curl**: Utiliza los comandos de ejemplo proporcionados
3. **Thunder Client**: Extensión de VS Code para testing de APIs

## Estructura de Datos

### Usuario (User)
- `id`: Identificador único
- `name`: Nombre del usuario
- `email`: Email único
- `role`: Referencia al rol del usuario
- `isActive`: Estado activo/inactivo
- `createdAt`: Fecha de creación

## Sistema de Roles

El sistema incluye 5 roles predefinidos con diferentes niveles de acceso:

1. **superadmin** (Nivel 1): Acceso total al sistema
2. **adminaccount** (Nivel 2): Administrador de cuenta
3. **coordinador** (Nivel 3): Coordinador de grupos
4. **familyadmin** (Nivel 4): Administrador de familia
5. **familyviewer** (Nivel 5): Solo visualización

### Gestión de Roles

```bash
# Crear roles por defecto
node scripts/seedRoles.js seed

# Listar roles existentes
node scripts/seedRoles.js list

# Actualizar roles
node scripts/seedRoles.js update

# Eliminar todos los roles
node scripts/seedRoles.js delete
```

### Rol (Role)
- `id`: Identificador único
- `nombre`: Nombre del rol (superadmin, adminaccount, coordinador, familyadmin, familyviewer)
- `descripcion`: Descripción del rol
- `permisos`: Array de permisos por módulo
- `nivel`: Nivel jerárquico (1-5)
- `activo`: Estado activo/inactivo
- `esRolSistema`: Si es un rol del sistema

### Grupo (Group)
- `id`: Identificador único
- `nombre`: Nombre del grupo
- `descripcion`: Descripción del grupo
- `account`: Referencia a la cuenta
- `usuarios`: Array de usuarios del grupo
- `rolPorDefecto`: Rol por defecto para usuarios del grupo
- `permisos`: Array de permisos específicos del grupo
- `activo`: Estado activo/inactivo

### Cuenta (Account)
- `id`: Identificador único
- `nombre`: Nombre de la cuenta
- `razonSocial`: Razón social de la empresa
- `address`: Dirección completa
- `logo`: URL del logo (opcional)
- `emailAdmin`: Email del administrador
- `passwordAdmin`: Contraseña del administrador (hasheada)
- `usuarioAdministrador`: Usuario administrador (creado automáticamente)
- `createdAt`: Fecha de creación
- `updatedAt`: Fecha de última actualización 