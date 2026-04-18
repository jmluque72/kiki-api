# Guía de Inicio Rápido

## Prerequisitos

Antes de comenzar, asegúrate de tener instalado:

- **Node.js** (versión 16 o superior)
- **MongoDB** (versión 4.4 o superior)
- **npm** o **yarn**

## Instalación

### 1. Clona el repositorio
```bash
git clone <tu-repositorio>
cd api
```

### 2. Instala las dependencias
```bash
npm install
```

### 3. Configura MongoDB
Asegúrate de que MongoDB esté corriendo en tu sistema:

**En macOS con Homebrew:**
```bash
brew services start mongodb/brew/mongodb-community
```

**En Ubuntu/Debian:**
```bash
sudo systemctl start mongod
```

**En Windows:**
- Inicia el servicio MongoDB desde los servicios de Windows
- O ejecuta `mongod.exe` desde la línea de comandos

### 4. Configura las variables de entorno
Crea un archivo `.env` en la raíz del proyecto con el siguiente contenido:

```env
# Base de datos
MONGODB_URI=mongodb://localhost:27017/microservices_db

# JWT
JWT_SECRET=your-super-secret-jwt-key-here-change-this-in-production
JWT_EXPIRE=7d

# Puertos de los microservicios
GATEWAY_PORT=3000
USERS_SERVICE_PORT=3001
ACCOUNTS_SERVICE_PORT=3002

# URLs de los microservicios
USERS_SERVICE_URL=http://localhost:3001
ACCOUNTS_SERVICE_URL=http://localhost:3002

# Configuración de entorno
NODE_ENV=development
```

**⚠️ IMPORTANTE**: Cambia el `JWT_SECRET` por una clave secreta fuerte antes de usar en producción.

## Ejecución

### Opción 1: Ejecutar todos los servicios a la vez
```bash
npm start
```

### Opción 2: Ejecutar servicios individuales
```bash
# En terminales separadas:
npm run dev:gateway    # Puerto 3000
npm run dev:users      # Puerto 3001
npm run dev:accounts   # Puerto 3002
```

### Opción 3: Usando nodemon (desarrollo)
```bash
npm run dev
```

## Verificación

Una vez que los servicios estén corriendo, puedes verificar que todo funcione correctamente:

### 1. Health Checks
```bash
# Gateway
curl http://localhost:3000/health

# Users Service
curl http://localhost:3001/health

# Accounts Service
curl http://localhost:3002/health
```

### 2. Documentación de la API
Visita: http://localhost:3000/api

### 3. Crear tu primer usuario
```bash
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin User",
    "email": "admin@ejemplo.com",
    "password": "123456",
    "role": "admin"
  }'
```

### 4. Iniciar sesión
```bash
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@ejemplo.com",
    "password": "123456"
  }'
```

Guarda el token JWT que te devuelve para usarlo en las siguientes peticiones.

### 5. Crear una cuenta (requiere token)
```bash
curl -X POST http://localhost:3000/api/accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN_AQUI" \
  -d '{
    "nombre": "Mi Empresa",
    "razonSocial": "Mi Empresa S.A. de C.V.",
    "address": "Calle Principal 123",
    "usuarioAdministrador": "TU_USER_ID_AQUI"
  }'
```

**Nota**: Reemplaza `TU_USER_ID_AQUI` con el ID del usuario que obtuviste al registrarte (está en la respuesta del paso 3).

## Estructura del Proyecto

```
├── config/                 # Configuración general
├── database/              # Configuración de MongoDB
├── gateway/               # API Gateway (Puerto 3000)
├── services/
│   ├── users/            # Microservicio de usuarios (Puerto 3001)
│   └── accounts/         # Microservicio de cuentas (Puerto 3002)
├── shared/               # Código compartido
│   ├── models/          # Modelos de MongoDB
│   └── middleware/      # Middleware compartido
├── examples/             # Ejemplos de uso de la API
└── server.js             # Servidor principal
```

## Próximos Pasos

1. **Explora los ejemplos**: Revisa `examples/api-examples.md` para ver más ejemplos de uso
2. **Personaliza los modelos**: Modifica los modelos en `shared/models/` según tus necesidades
3. **Agrega más endpoints**: Extiende los controladores según los requerimientos de tu negocio
4. **Configura la base de datos**: Ajusta la conexión a MongoDB para tu entorno
5. **Implementa autenticación adicional**: Agrega OAuth, 2FA, etc.
6. **Deploy**: Configura para producción usando PM2, Docker, etc.

## Troubleshooting

### MongoDB no se conecta
- Verifica que MongoDB esté corriendo: `mongosh` o `mongo`
- Revisa la URI de conexión en el archivo `.env`
- Asegúrate de que el puerto 27017 esté disponible

### Los servicios no inician
- Verifica que los puertos 3000, 3001, 3002 estén libres
- Revisa que todas las dependencias estén instaladas: `npm install`
- Comprueba que el archivo `.env` esté configurado correctamente

### Token JWT inválido
- Asegúrate de incluir el token completo en el header Authorization
- Formato: `Authorization: Bearer tu-token-aqui`
- Verifica que el token no haya expirado

## Soporte

Si tienes problemas:
1. Revisa los logs en la consola
2. Verifica que MongoDB esté corriendo
3. Asegúrate de que el archivo `.env` esté configurado
4. Consulta la documentación en `examples/api-examples.md` 