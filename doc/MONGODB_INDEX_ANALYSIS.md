# Análisis de Índices MongoDB - Sugerencias de Optimización

## Resumen Ejecutivo

Este documento analiza los patrones de consulta en la base de datos MongoDB y sugiere índices adicionales para mejorar el rendimiento.

## Índices Actuales vs. Consultas Frecuentes

### 1. Modelo: Shared

**Índices Actuales:**
- `{ user: 1, account: 1 }`
- `{ account: 1, role: 1 }`
- `{ user: 1, status: 1 }`
- `{ account: 1, status: 1 }`
- `{ user: 1, division: 1 }`
- `{ user: 1, student: 1 }`
- `{ division: 1, student: 1 }`

**Consultas Frecuentes Encontradas:**
```javascript
// Consulta muy común: user + account + status
Shared.findOne({ user: userId, account: accountId, status: 'active' })
Shared.find({ user: userId, status: 'active' }).sort({ createdAt: -1 })
Shared.find({ account: accountId, status: { $in: ['active', 'pending'] } })
```

**Sugerencias de Índices:**
```javascript
// ÍNDICE CRÍTICO: Consulta más frecuente (user + account + status)
sharedSchema.index({ user: 1, account: 1, status: 1 });

// ÍNDICE RECOMENDADO: Para consultas con sort por fecha
sharedSchema.index({ user: 1, status: 1, createdAt: -1 });

// ÍNDICE RECOMENDADO: Para listar usuarios de una cuenta con filtro de status
sharedSchema.index({ account: 1, status: 1, createdAt: -1 });
```

### 2. Modelo: Student

**Índices Actuales:**
- `{ account: 1, division: 1, year: 1 }`
- `{ email: 1 }`
- `{ dni: 1 }`
- `{ qrCode: 1 }`

**Consultas Frecuentes Encontradas:**
```javascript
// Consulta con sort por nombre/apellido
Student.find({ account: accountId, division: divisionId })
  .sort({ apellido: 1, nombre: 1 })

// Consulta con year opcional
Student.find({ account: accountId, division: divisionId, year: year })

// Consulta por tutor
Student.find({ tutor: tutorId })
```

**Sugerencias de Índices:**
```javascript
// ÍNDICE RECOMENDADO: Para sort por nombre (muy común)
studentSchema.index({ account: 1, division: 1, apellido: 1, nombre: 1 });

// ÍNDICE RECOMENDADO: Para búsquedas por tutor
studentSchema.index({ tutor: 1 });

// ÍNDICE RECOMENDADO: Para búsquedas por cuenta sin división
studentSchema.index({ account: 1, activo: 1 });
```

### 3. Modelo: User

**Índices Actuales:**
- `{ role: 1 }`
- `{ status: 1 }`
- `{ account: 1 }`
- `{ dni: 1 }`
- `{ createdAt: -1 }`
- `{ email: 1 }` (único, automático)

**Consultas Frecuentes Encontradas:**
```javascript
// Consulta muy común: email lookup (ya tiene índice único)
User.findOne({ email })

// Consulta común: usuarios por cuenta con sort
User.find({ account: accountId }).sort({ createdAt: -1 })

// Consulta común: usuarios por status y cuenta
User.find({ account: accountId, status: 'approved' })
```

**Sugerencias de Índices:**
```javascript
// ÍNDICE RECOMENDADO: Para listar usuarios de cuenta con sort
userSchema.index({ account: 1, status: 1, createdAt: -1 });

// ÍNDICE RECOMENDADO: Para búsquedas por role y status
userSchema.index({ role: 1, status: 1 });
```

### 4. Modelo: Event

**Índices Actuales:**
- Ninguno explícito

**Consultas Frecuentes Encontradas:**
```javascript
// Consultas comunes
Event.find({ institucion: accountId, division: divisionId })
Event.find({ institucion: accountId, estado: 'activo' })
Event.find({ fecha: { $gte: startDate, $lte: endDate } })
Event.find({ creador: userId })
```

**Sugerencias de Índices:**
```javascript
// ÍNDICE CRÍTICO: Consulta más frecuente
eventSchema.index({ institucion: 1, division: 1, estado: 1 });

// ÍNDICE RECOMENDADO: Para búsquedas por fecha
eventSchema.index({ fecha: 1, estado: 1 });

// ÍNDICE RECOMENDADO: Para búsquedas por creador
eventSchema.index({ creador: 1, createdAt: -1 });

// ÍNDICE RECOMENDADO: Para búsquedas por institución y estado
eventSchema.index({ institucion: 1, estado: 1, fecha: 1 });
```

### 5. Modelo: Activity

**Índices Actuales:**
- `{ usuario: 1, createdAt: -1 }`
- `{ account: 1, createdAt: -1 }`
- `{ tipo: 1, createdAt: -1 }`
- `{ entidad: 1, createdAt: -1 }`
- `{ createdAt: -1 }`

**Consultas Frecuentes Encontradas:**
```javascript
// Consultas comunes
Activity.find({ account: accountId, division: divisionId, activo: true })
  .sort({ createdAt: -1 })
Activity.find({ account: accountId, activo: true, fecha: selectedDate })
Activity.find({ division: divisionId, activo: true })
```

**Sugerencias de Índices:**
```javascript
// ÍNDICE CRÍTICO: Consulta muy frecuente en mobile
activitySchema.index({ account: 1, division: 1, activo: 1, createdAt: -1 });

// ÍNDICE RECOMENDADO: Para búsquedas por fecha específica
activitySchema.index({ account: 1, division: 1, fecha: 1, activo: 1 });

// ÍNDICE RECOMENDADO: Para búsquedas por división
activitySchema.index({ division: 1, activo: 1, createdAt: -1 });
```

### 6. Modelo: Asistencia

**Índices Actuales:**
- `{ account: 1, division: 1, fecha: 1 }` (único)

**Consultas Frecuentes Encontradas:**
```javascript
// Consultas comunes
Asistencia.find({ account: accountId, division: divisionId, fecha: date })
Asistencia.find({ account: accountId, fecha: { $gte: startDate, $lte: endDate } })
```

**Sugerencias de Índices:**
```javascript
// ÍNDICE RECOMENDADO: Para búsquedas por rango de fechas
asistenciaSchema.index({ account: 1, fecha: 1 });

// ÍNDICE RECOMENDADO: Para búsquedas por división y rango de fechas
asistenciaSchema.index({ division: 1, fecha: 1 });
```

### 7. Modelo: Pickup

**Índices Actuales:**
- `{ account: 1, division: 1, student: 1 }`
- `{ dni: 1 }`
- `{ status: 1 }`

**Consultas Frecuentes Encontradas:**
```javascript
// Consultas comunes
Pickup.find({ account: accountId, status: 'active' })
  .sort({ createdAt: -1 })
Pickup.find({ account: accountId, division: divisionId, status: 'active' })
```

**Sugerencias de Índices:**
```javascript
// ÍNDICE RECOMENDADO: Para listar con sort y filtro de status
pickupSchema.index({ account: 1, status: 1, createdAt: -1 });

// ÍNDICE RECOMENDADO: Para búsquedas por división y status
pickupSchema.index({ account: 1, division: 1, status: 1, createdAt: -1 });
```

### 8. Modelo: Notification

**Índices Actuales:**
- `{ sender: 1 }`
- `{ account: 1 }`
- `{ division: 1 }`
- `{ recipients: 1 }`
- `{ sentAt: -1 }`
- `{ status: 1 }`
- `{ type: 1 }`

**Consultas Frecuentes Encontradas:**
```javascript
// Consultas comunes
Notification.find({ recipients: userId, status: 'unread' })
  .sort({ sentAt: -1 })
Notification.find({ account: accountId, status: 'sent' })
  .sort({ sentAt: -1 })
```

**Sugerencias de Índices:**
```javascript
// ÍNDICE RECOMENDADO: Para notificaciones no leídas de un usuario
notificationSchema.index({ recipients: 1, status: 1, sentAt: -1 });

// ÍNDICE RECOMENDADO: Para notificaciones de cuenta
notificationSchema.index({ account: 1, status: 1, sentAt: -1 });
```

### 9. Modelo: ActiveAssociation

**Índices Actuales:**
- `{ user: 1 }`
- `{ account: 1 }`
- `{ role: 1 }`

**Consultas Frecuentes Encontradas:**
```javascript
// Consulta muy común
ActiveAssociation.findOne({ user: userId })
  .populate('account role division student')
```

**Sugerencias de Índices:**
```javascript
// Ya tiene índice en { user: 1 } que es suficiente
// No se requieren índices adicionales
```

### 10. Modelo: StudentActionLog

**Índices Actuales:**
- `{ estudiante: 1, fechaAccion: 1 }`
- `{ division: 1, fechaAccion: 1 }`
- `{ account: 1, fechaAccion: 1 }`
- `{ registradoPor: 1, fechaAccion: 1 }`

**Consultas Frecuentes Encontradas:**
```javascript
// Consultas comunes con sort
StudentActionLog.find({ division: divisionId })
  .sort({ fechaAccion: -1 })
StudentActionLog.find({ account: accountId })
  .sort({ fechaAccion: -1 })
```

**Sugerencias de Índices:**
```javascript
// Los índices actuales son adecuados, pero podrían mejorarse con sort
studentActionLogSchema.index({ division: 1, fechaAccion: -1 });
studentActionLogSchema.index({ account: 1, fechaAccion: -1 });
```

## Priorización de Índices

### 🔴 CRÍTICOS (Implementar primero)
1. **Shared**: `{ user: 1, account: 1, status: 1 }` - Consulta más frecuente
2. **Event**: `{ institucion: 1, division: 1, estado: 1 }` - Sin índices actuales
3. **Activity**: `{ account: 1, division: 1, activo: 1, createdAt: -1 }` - Consulta muy frecuente en mobile

### 🟡 IMPORTANTES (Implementar segundo)
4. **Shared**: `{ user: 1, status: 1, createdAt: -1 }` - Para sort eficiente
5. **Student**: `{ account: 1, division: 1, apellido: 1, nombre: 1 }` - Para sort por nombre
6. **User**: `{ account: 1, status: 1, createdAt: -1 }` - Para listar usuarios
7. **Pickup**: `{ account: 1, status: 1, createdAt: -1 }` - Para listar con sort

### 🟢 RECOMENDADOS (Implementar cuando sea posible)
8. **Notification**: `{ recipients: 1, status: 1, sentAt: -1 }`
9. **Asistencia**: `{ account: 1, fecha: 1 }` y `{ division: 1, fecha: 1 }`
10. **Event**: `{ fecha: 1, estado: 1 }` y `{ creador: 1, createdAt: -1 }`

## Notas Importantes

1. **Orden de campos en índices compuestos**: MongoDB usa índices de izquierda a derecha. El orden importa.
2. **Índices con sort**: Si siempre ordenas por un campo, inclúyelo al final del índice.
3. **Overhead de escritura**: Más índices = más lento en escrituras. Balancear según necesidades.
4. **Monitoreo**: Usar `explain()` para verificar que los índices se están usando.

## Script de Implementación

Ver archivo: `api/scripts/add-recommended-indexes.js`

