# Sistema de Asociación Activa - Implementación

## 📋 Resumen

Se ha implementado un sistema completo para gestionar la asociación activa de usuarios que tienen múltiples roles/asociaciones en diferentes instituciones. Esto permite que la app móvil y el backoffice siempre trabajen con la asociación correcta.

## 🏗️ Arquitectura

### Modelo `ActiveAssociation`
- **Ubicación**: `/shared/models/ActiveAssociation.js`
- **Función**: Gestiona qué asociación está activa para cada usuario
- **Campos**:
  - `user`: ID del usuario (único)
  - `activeShared`: ID de la asociación activa
  - `account`, `role`, `division`, `student`: Campos desnormalizados para acceso rápido
  - `activatedAt`: Timestamp de activación

### Endpoints API

#### 1. `GET /active-association`
**Obtener la asociación activa del usuario**
```javascript
// Respuesta
{
  "success": true,
  "data": {
    "_id": "...",
    "activeShared": "...",
    "account": { "_id": "...", "nombre": "..." },
    "role": { "_id": "...", "nombre": "coordinador" },
    "division": { "_id": "...", "nombre": "Sala Verde" },
    "student": null,
    "activatedAt": "2025-09-07T12:00:00.000Z"
  }
}
```

#### 2. `GET /active-association/available`
**Obtener todas las asociaciones disponibles del usuario**
```javascript
// Respuesta
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "account": { "nombre": "Institución A" },
      "role": { "nombre": "coordinador" },
      "division": { "nombre": "Sala Verde" },
      "student": null
    },
    {
      "_id": "...",
      "account": { "nombre": "Institución B" },
      "role": { "nombre": "familyadmin" },
      "division": { "nombre": "Sala Roja" },
      "student": { "nombre": "Juan", "apellido": "Pérez" }
    }
  ]
}
```

#### 3. `POST /active-association/set`
**Establecer una asociación como activa**
```javascript
// Request
{
  "sharedId": "64f8a1b2c3d4e5f6a7b8c9d0"
}

// Respuesta
{
  "success": true,
  "message": "Asociación activa establecida exitosamente",
  "data": { /* datos de la asociación activa */ }
}
```

#### 4. `POST /active-association/cleanup`
**Limpiar asociaciones activas inválidas (solo admin)**
```javascript
// Respuesta
{
  "success": true,
  "message": "Limpieza de asociaciones activas completada"
}
```

## 🔧 Función Helper

### `getActiveAssociationForUser(userId)`
Función helper para usar en otros endpoints:
```javascript
const activeAssociation = await getActiveAssociationForUser(userId);
if (activeAssociation) {
  // Usar activeAssociation.account, activeAssociation.role, etc.
}
```

## 📱 Flujo para la App Móvil

### 1. Al iniciar sesión
```javascript
// Obtener asociaciones disponibles
const response = await fetch('/active-association/available', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data: associations } = await response.json();

if (associations.length === 1) {
  // Si solo hay una, establecerla automáticamente
  await fetch('/active-association/set', {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sharedId: associations[0]._id })
  });
} else if (associations.length > 1) {
  // Mostrar selector de asociación
  showAssociationSelector(associations);
}
```

### 2. En todas las llamadas posteriores
```javascript
// Obtener la asociación activa
const response = await fetch('/active-association', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data: activeAssociation } = await response.json();

// Usar los datos para filtrar contenido
const accountId = activeAssociation.account._id;
const role = activeAssociation.role.nombre;
const divisionId = activeAssociation.division?._id;
const studentId = activeAssociation.student?._id;
```

### 3. Cambio de asociación
```javascript
// Cuando el usuario selecciona una asociación diferente
await fetch('/active-association/set', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ sharedId: selectedAssociationId })
});

// Recargar datos con la nueva asociación
await loadDataWithActiveAssociation();
```

## 🔄 Integración con Endpoints Existentes

Para integrar el sistema en endpoints existentes, reemplazar:

### Antes:
```javascript
// Buscar asociación manualmente
const userAssociation = await Shared.findOne({
  user: userId,
  account: accountId,
  status: 'active'
});
```

### Después:
```javascript
// Usar la asociación activa
const activeAssociation = await getActiveAssociationForUser(userId);
if (!activeAssociation) {
  return res.status(400).json({
    success: false,
    message: 'No hay asociación activa'
  });
}

// Usar los datos de la asociación activa
const accountId = activeAssociation.account._id;
const role = activeAssociation.role.nombre;
const divisionId = activeAssociation.division?._id;
```

## 🛡️ Validaciones y Seguridad

### Validaciones automáticas:
- ✅ La asociación debe existir
- ✅ La asociación debe estar activa
- ✅ La asociación debe pertenecer al usuario
- ✅ Solo una asociación activa por usuario

### Limpieza automática:
- ✅ Asociaciones activas inválidas se limpian automáticamente
- ✅ Endpoint de limpieza manual para administradores
- ✅ Validación de permisos en operaciones administrativas

## 📊 Beneficios

### Para el Usuario:
- ✅ **Cambio fácil** entre diferentes roles/instituciónes
- ✅ **Contexto claro** de qué asociación está activa
- ✅ **Navegación intuitiva** entre diferentes contextos

### Para el Sistema:
- ✅ **Performance optimizada** con campos desnormalizados
- ✅ **Una sola fuente de verdad** para la asociación activa
- ✅ **Validación automática** de asociaciones válidas
- ✅ **Limpieza automática** de datos inconsistentes

### Para el Desarrollo:
- ✅ **API consistente** para todos los endpoints
- ✅ **Función helper** para uso fácil
- ✅ **Logs detallados** para debugging
- ✅ **Manejo de errores** robusto

## 🧪 Pruebas

El sistema ha sido probado y verificado:
- ✅ **Sintaxis correcta** del modelo
- ✅ **Métodos estáticos** funcionando
- ✅ **Esquema válido** con todos los campos
- ✅ **Servidor inicia** sin errores
- ✅ **Endpoints disponibles** y accesibles

## 🚀 Próximos Pasos

1. **Integrar en endpoints existentes** que usan asociaciones
2. **Implementar UI en la app móvil** para selección de asociación
3. **Agregar indicador visual** de la asociación activa
4. **Implementar cache** para mejorar performance
5. **Agregar métricas** de uso del sistema

## 📝 Notas Técnicas

- **Índices optimizados** para consultas frecuentes
- **Campos desnormalizados** para acceso rápido
- **Validación de permisos** en operaciones administrativas
- **Manejo de errores** completo con mensajes descriptivos
- **Logs detallados** para debugging y monitoreo
