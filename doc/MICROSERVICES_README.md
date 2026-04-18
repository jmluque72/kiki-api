# 🏗️ Microservicios de Kiki API

## 📋 Resumen

Esta implementación de microservicios funciona **en paralelo** con `simple-server.js`, permitiendo una migración gradual sin interrumpir la funcionalidad actual.

## 🚀 Inicio Rápido

### Opción 1: Usar simple-server.js (Actual)
```bash
npm start
# o
npm run dev
```

### Opción 2: Usar Microservicios (Nuevo)
```bash
npm run microservices
# o para desarrollo
npm run microservices:dev
```

## 🏗️ Arquitectura

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Gateway   │────│  Auth Service   │────│  Users Service  │
│   (Port 3000)   │    │   (Port 3001)   │    │   (Port 3002)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🔧 Servicios Implementados

### 🔐 Auth Service (Puerto 3001)
- **Login/Logout**: `POST /api/auth/login`
- **Registro**: `POST /api/auth/register`
- **Perfil**: `GET /api/auth/profile`
- **Reset Password**: `POST /api/auth/forgot-password`
- **Reset Password**: `POST /api/auth/reset-password`

### 👥 Users Service (Puerto 3002)
- **Listar usuarios**: `GET /api/users`
- **Obtener usuario**: `GET /api/users/:id`
- **Actualizar usuario**: `PUT /api/users/:id`
- **Cambiar estado**: `PUT /api/users/:id/status`
- **Asociación activa**: `GET /api/users/active-association`
- **Roles**: `GET /api/roles`, `GET /api/roles/:id`, `GET /api/roles/hierarchy`

### 🌐 API Gateway (Puerto 3000)
- **Health Check**: `GET /health`
- **Documentación**: `GET /api`
- **Proxy**: Enruta requests a los microservicios correspondientes

## 📡 Endpoints Disponibles

### Autenticación
```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# Registro
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"new@example.com","password":"password","nombre":"Usuario Nuevo"}'

# Perfil
curl -X GET http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Usuarios
```bash
# Listar usuarios
curl -X GET http://localhost:3000/api/users \
  -H "Authorization: Bearer YOUR_TOKEN"

# Obtener usuario específico
curl -X GET http://localhost:3000/api/users/USER_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🔄 Migración Gradual

### Fase 1: Desarrollo Paralelo ✅
- [x] Auth Service implementado
- [x] Users Service implementado
- [x] API Gateway configurado
- [x] Scripts de inicio creados

### Fase 2: Servicios Adicionales (Próximo)
- [ ] Accounts Service
- [ ] Events Service
- [ ] Groups Service
- [ ] Activities Service
- [ ] Notifications Service
- [ ] Files Service

### Fase 3: Migración Completa
- [ ] Migrar funcionalidades desde `simple-server.js`
- [ ] Testing completo
- [ ] Switch de producción

## 🧪 Testing

### Health Checks
```bash
# Gateway
curl http://localhost:3000/health

# Auth Service
curl http://localhost:3001/health

# Users Service
curl http://localhost:3002/health
```

### Documentación
```bash
# Ver todos los endpoints disponibles
curl http://localhost:3000/api
```

## 🔧 Configuración

### Variables de Entorno
```env
# Puertos de microservicios
AUTH_SERVICE_PORT=3001
USERS_SERVICE_PORT=3002
ACCOUNTS_SERVICE_PORT=3003
EVENTS_SERVICE_PORT=3004
GROUPS_SERVICE_PORT=3005
ACTIVITIES_SERVICE_PORT=3006
NOTIFICATIONS_SERVICE_PORT=3007
FILES_SERVICE_PORT=3008
GATEWAY_PORT=3000
```

## 🚨 Notas Importantes

1. **No se toca `simple-server.js`**: La funcionalidad actual sigue intacta
2. **Desarrollo paralelo**: Los microservicios se desarrollan independientemente
3. **Migración gradual**: Se puede migrar funcionalidad por funcionalidad
4. **Testing seguro**: Se puede probar sin afectar producción

## 📊 Ventajas de esta Implementación

- ✅ **Sin interrupciones**: `simple-server.js` sigue funcionando
- ✅ **Desarrollo seguro**: Testing sin riesgo
- ✅ **Migración gradual**: Se puede migrar por partes
- ✅ **Escalabilidad**: Cada servicio se puede escalar independientemente
- ✅ **Mantenibilidad**: Código más organizado y fácil de mantener

## 🔄 Próximos Pasos

1. **Implementar servicios restantes** (Accounts, Events, etc.)
2. **Migrar funcionalidades** desde `simple-server.js`
3. **Testing completo** de todos los servicios
4. **Switch gradual** a microservicios en producción

## 🆘 Troubleshooting

### Si un servicio no inicia:
1. Verificar que el puerto esté libre
2. Revisar logs del servicio específico
3. Verificar configuración de MongoDB

### Si el Gateway no enruta correctamente:
1. Verificar que los servicios estén corriendo
2. Revisar configuración de proxy
3. Verificar logs del Gateway
