# Ejemplos de uso de la API

## Usuarios (Users Service)

### Registrar usuario
```bash
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Juan Pérez",
    "email": "juan@ejemplo.com",
    "password": "123456",
    "role": "ROLE_ID_HERE",
    "status": "pending"
  }'
```

### Iniciar sesión
```bash
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "juan@ejemplo.com",
    "password": "123456"
  }'
```

### Obtener perfil (requiere token)
```bash
curl -X GET http://localhost:3000/api/users/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Actualizar perfil de usuario
```bash
curl -X PUT http://localhost:3000/api/users/profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Juan Pérez Actualizado",
    "email": "juan.actualizado@ejemplo.com",
    "status": "approved"
  }'
```

### Obtener todos los usuarios (Solo admin)
```bash
curl -X GET "http://localhost:3000/api/users?page=1&limit=10" \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"
```

### Filtrar usuarios por status
```bash
curl -X GET "http://localhost:3000/api/users?status=pending" \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"
```

### Obtener usuario específico (Solo admin)
```bash
curl -X GET http://localhost:3000/api/users/USER_ID \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"
```

### Cambiar status de usuario (Solo admin)
```bash
# Aprobar usuario
curl -X PUT http://localhost:3000/api/users/USER_ID/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -d '{
    "status": "approved"
  }'

# Rechazar usuario
curl -X PUT http://localhost:3000/api/users/USER_ID/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -d '{
    "status": "rejected"
  }'

# Marcar como pendiente
curl -X PUT http://localhost:3000/api/users/USER_ID/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -d '{
    "status": "pending"
  }'
```

## Cuentas (Accounts Service)

### Crear cuenta con URL de logo
```bash
curl -X POST http://localhost:3000/api/accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "nombre": "Empresa Ejemplo S.A.",
    "razonSocial": "Empresa Ejemplo Sociedad Anónima",
    "address": "Calle Principal 123, Oficina 456",
    "logo": "https://ejemplo.com/logo.png",
    "emailAdmin": "admin@empresa-ejemplo.com",
    "passwordAdmin": "password123",
    "nombreAdmin": "Juan Administrador"
  }'
```

### Crear cuenta con logo en base64
```bash
curl -X POST http://localhost:3000/api/accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "nombre": "Empresa Ejemplo S.A.",
    "razonSocial": "Empresa Ejemplo Sociedad Anónima",
    "address": "Calle Principal 123, Oficina 456",
    "logo": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "emailAdmin": "admin@empresa-ejemplo.com",
    "passwordAdmin": "password123",
    "nombreAdmin": "Juan Administrador"
  }'
```

### Obtener todas las cuentas
```bash
curl -X GET "http://localhost:3000/api/accounts?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Filtrar cuentas por nombre
```bash
curl -X GET "http://localhost:3000/api/accounts?nombre=Empresa" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Filtrar cuentas por razón social
```bash
curl -X GET "http://localhost:3000/api/accounts?razonSocial=Sociedad" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Filtrar cuentas por dirección
```bash
curl -X GET "http://localhost:3000/api/accounts?address=Principal" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Obtener cuenta específica
```bash
curl -X GET http://localhost:3000/api/accounts/ACCOUNT_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Actualizar cuenta
```bash
curl -X PUT http://localhost:3000/api/accounts/ACCOUNT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "nombre": "Empresa Ejemplo Actualizada S.A.",
    "address": "Nueva Dirección 789",
    "logo": "https://ejemplo.com/nuevo-logo.png"
  }'
```

### Obtener estadísticas
```bash
curl -X GET http://localhost:3000/api/accounts/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Eliminar cuenta
```bash
curl -X DELETE http://localhost:3000/api/accounts/ACCOUNT_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Acceder a archivos subidos
```bash
# Acceder a logo guardado
curl -X GET http://localhost:3000/api/files/logos/logo_1640995200000_abc12345.png

# Acceder a avatar
curl -X GET http://localhost:3000/api/files/avatars/avatar_1640995200000_def67890.jpg

# Acceder a documento
curl -X GET http://localhost:3000/api/files/documents/document_1640995200000_ghi11121.pdf
```

## Campos de Account

### Campos Requeridos
- `nombre`: Nombre de la cuenta
- `razonSocial`: Razón social de la empresa
- `address`: Dirección completa
- `emailAdmin`: Email del usuario administrador (se creará automáticamente)
- `passwordAdmin`: Contraseña del usuario administrador

### Campos Opcionales
- `logo`: URL del logo o imagen en base64 (formatos: jpeg, jpg, png, gif, webp)
- `nombreAdmin`: Nombre del usuario administrador (por defecto: "Admin {nombre}")

### Campos Automáticos
- `id`: Identificador único (generado automáticamente)
- `usuarioAdministrador`: ID del usuario administrador (creado automáticamente)
- `createdAt`: Fecha de creación (generada automáticamente)
- `updatedAt`: Fecha de última actualización (generada automáticamente)

## Grupos (Groups Service)

### Crear grupo
```bash
curl -X POST http://localhost:3000/api/groups \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "nombre": "Administradores",
    "descripcion": "Grupo de usuarios administradores",
    "account": "ACCOUNT_ID_AQUI",
    "usuarios": ["USER_ID_1", "USER_ID_2"],
    "permisos": [
      {
        "modulo": "usuarios",
        "acciones": ["crear", "leer", "actualizar", "eliminar"]
      },
      {
        "modulo": "cuentas",
        "acciones": ["leer", "actualizar"]
      }
    ],
    "activo": true,
    "creadoPor": "USER_ID_CREATOR"
  }'
```

### Obtener grupos de una cuenta
```bash
curl -X GET "http://localhost:3000/api/groups/account/ACCOUNT_ID?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Filtrar grupos activos
```bash
curl -X GET "http://localhost:3000/api/groups/account/ACCOUNT_ID?activo=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Buscar grupos por nombre
```bash
curl -X GET "http://localhost:3000/api/groups/account/ACCOUNT_ID?search=Admin" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Obtener grupo específico
```bash
curl -X GET http://localhost:3000/api/groups/GROUP_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Actualizar grupo
```bash
curl -X PUT http://localhost:3000/api/groups/GROUP_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "nombre": "Super Administradores",
    "descripcion": "Grupo con permisos completos",
    "activo": true
  }'
```

### Añadir usuario a grupo
```bash
curl -X POST http://localhost:3000/api/groups/GROUP_ID/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "usuarioId": "USER_ID_TO_ADD"
  }'
```

### Remover usuario de grupo
```bash
curl -X DELETE http://localhost:3000/api/groups/GROUP_ID/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "usuarioId": "USER_ID_TO_REMOVE"
  }'
```

### Obtener estadísticas de grupos
```bash
curl -X GET http://localhost:3000/api/groups/account/ACCOUNT_ID/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Eliminar grupo
```bash
curl -X DELETE http://localhost:3000/api/groups/GROUP_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Roles (Roles Service)

### Obtener todos los roles
```bash
curl -X GET http://localhost:3000/api/roles \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Filtrar roles activos
```bash
curl -X GET "http://localhost:3000/api/roles?activo=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Filtrar roles por nivel
```bash
curl -X GET "http://localhost:3000/api/roles?nivel=2" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Buscar roles por nombre
```bash
curl -X GET "http://localhost:3000/api/roles?search=admin" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Obtener rol específico por ID
```bash
curl -X GET http://localhost:3000/api/roles/ROLE_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Obtener rol por nombre
```bash
curl -X GET http://localhost:3000/api/roles/name/superadmin \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Obtener jerarquía de roles
```bash
curl -X GET http://localhost:3000/api/roles/hierarchy \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Obtener roles por nivel mínimo
```bash
curl -X GET http://localhost:3000/api/roles/level/3 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Verificar permisos de un rol
```bash
curl -X GET "http://localhost:3000/api/roles/ROLE_ID/permissions?modulo=usuarios&accion=crear" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Crear rol (solo superadmin)
```bash
curl -X POST http://localhost:3000/api/roles \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SUPERADMIN_JWT_TOKEN" \
  -d '{
    "nombre": "customrole",
    "descripcion": "Rol personalizado para casos específicos",
    "permisos": [
      {
        "modulo": "usuarios",
        "acciones": ["leer"]
      },
      {
        "modulo": "reportes",
        "acciones": ["leer", "crear"]
      }
    ],
    "nivel": 4,
    "activo": true,
    "esRolSistema": false
  }'
```

### Actualizar rol (solo superadmin)
```bash
curl -X PUT http://localhost:3000/api/roles/ROLE_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SUPERADMIN_JWT_TOKEN" \
  -d '{
    "descripcion": "Descripción actualizada del rol",
    "activo": false
  }'
```

### Eliminar rol (solo superadmin)
```bash
curl -X DELETE http://localhost:3000/api/roles/ROLE_ID \
  -H "Authorization: Bearer SUPERADMIN_JWT_TOKEN"
```

### Inicializar roles por defecto (solo superadmin)
```bash
curl -X POST http://localhost:3000/api/roles/initialize \
  -H "Authorization: Bearer SUPERADMIN_JWT_TOKEN"
```

## Campos de Group

### Campos Requeridos
- `nombre`: Nombre del grupo
- `account`: ID de la cuenta a la que pertenece el grupo
- `creadoPor`: ID del usuario que crea el grupo

### Campos Opcionales
- `descripcion`: Descripción del grupo
- `usuarios`: Array de IDs de usuarios que pertenecen al grupo
- `permisos`: Array de permisos del grupo
- `activo`: Estado del grupo (true/false)

### Campos Automáticos
- `id`: Identificador único (generado automáticamente)
- `createdAt`: Fecha de creación (generada automáticamente)
- `updatedAt`: Fecha de última actualización (generada automáticamente)

### Estructura de Permisos
```json
{
  "modulo": "usuarios|cuentas|grupos|reportes|configuracion|familias",
  "acciones": ["crear", "leer", "actualizar", "eliminar", "administrar", "ver"]
}
```

## Campos de Role

### Campos Requeridos
- `nombre`: Nombre del rol (superadmin, adminaccount, coordinador, familyadmin, familyviewer)
- `descripcion`: Descripción del rol
- `permisos`: Array de permisos del rol
- `nivel`: Nivel jerárquico del rol (1-5)

### Campos Opcionales
- `activo`: Estado del rol (true/false)
- `esRolSistema`: Si es un rol del sistema (true/false)

### Campos Automáticos
- `id`: Identificador único (generado automáticamente)
- `createdAt`: Fecha de creación (generada automáticamente)
- `updatedAt`: Fecha de última actualización (generada automáticamente)

### Jerarquía de Roles
1. **superadmin** (Nivel 1): Acceso total al sistema
2. **adminaccount** (Nivel 2): Administrador de cuenta
3. **coordinador** (Nivel 3): Coordinador de grupos
4. **familyadmin** (Nivel 4): Administrador de familia
5. **familyviewer** (Nivel 5): Solo visualización

## Respuestas de ejemplo

### Respuesta exitosa de creación de cuenta
```json
{
  "success": true,
  "message": "Cuenta y usuario administrador creados exitosamente",
  "data": {
    "account": {
      "_id": "64a1b2c3d4e5f6789012345",
      "nombre": "Empresa Ejemplo S.A.",
      "razonSocial": "Empresa Ejemplo Sociedad Anónima",
      "address": "Calle Principal 123, Oficina 456",
      "logo": "/api/files/logos/logo_1640995200000_abc12345.png",
      "emailAdmin": "admin@empresa-ejemplo.com",
      "usuarioAdministrador": {
        "_id": "64a1b2c3d4e5f6789012344",
        "name": "Juan Administrador",
        "email": "admin@empresa-ejemplo.com",
        "status": "approved",
        "role": {
          "_id": "64a1b2c3d4e5f6789012343",
          "nombre": "adminaccount",
          "descripcion": "Administrador de cuenta con permisos completos dentro de su cuenta",
          "nivel": 2
        }
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    "adminUser": {
      "id": "64a1b2c3d4e5f6789012344",
      "name": "Juan Administrador",
      "email": "admin@empresa-ejemplo.com",
      "role": "adminaccount"
    }
  }
}
```

### Respuesta exitosa de creación de grupo
```json
{
  "success": true,
  "message": "Grupo creado exitosamente",
  "data": {
    "_id": "64a1b2c3d4e5f6789012346",
    "nombre": "Administradores",
    "descripcion": "Grupo de usuarios administradores",
    "account": {
      "_id": "64a1b2c3d4e5f6789012345",
      "nombre": "Empresa Ejemplo S.A.",
      "razonSocial": "Empresa Ejemplo Sociedad Anónima"
    },
    "usuarios": [
      {
        "_id": "64a1b2c3d4e5f6789012344",
        "name": "Juan Administrador",
        "email": "juan@empresa.com"
      }
    ],
    "permisos": [
      {
        "modulo": "usuarios",
        "acciones": ["crear", "leer", "actualizar", "eliminar"]
      }
    ],
    "activo": true,
    "creadoPor": {
      "_id": "64a1b2c3d4e5f6789012344",
      "name": "Juan Administrador",
      "email": "juan@empresa.com"
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Respuesta exitosa de obtención de roles
```json
{
  "success": true,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789012347",
      "nombre": "superadmin",
      "descripcion": "Super administrador con acceso total al sistema",
      "nivel": 1,
      "permisos": [
        {
          "modulo": "usuarios",
          "acciones": ["crear", "leer", "actualizar", "eliminar", "administrar"]
        },
        {
          "modulo": "cuentas",
          "acciones": ["crear", "leer", "actualizar", "eliminar", "administrar"]
        }
      ],
      "activo": true,
      "esRolSistema": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "_id": "64a1b2c3d4e5f6789012348",
      "nombre": "adminaccount",
      "descripcion": "Administrador de cuenta con permisos completos dentro de su cuenta",
      "nivel": 2,
      "permisos": [
        {
          "modulo": "usuarios",
          "acciones": ["crear", "leer", "actualizar", "eliminar"]
        }
      ],
      "activo": true,
      "esRolSistema": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "total": 2
}
```

### Respuesta de jerarquía de roles
```json
{
  "success": true,
  "data": {
    "hierarchy": {
      "1": {
        "nombre": "superadmin",
        "descripcion": "Super administrador con acceso total al sistema",
        "permisos": 7,
        "activo": true
      },
      "2": {
        "nombre": "adminaccount",
        "descripcion": "Administrador de cuenta con permisos completos dentro de su cuenta",
        "permisos": 6,
        "activo": true
      }
    },
    "roles": [...]
  }
}
```

### Respuesta de error de validación
```json
{
  "success": false,
  "message": "Datos de entrada inválidos",
  "errors": [
    {
      "field": "nombre",
      "message": "El nombre del grupo es obligatorio"
    },
    {
      "field": "account",
      "message": "La cuenta es obligatoria"
    }
  ]
}
``` 