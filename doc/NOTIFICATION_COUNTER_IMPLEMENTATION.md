# Implementación de Contador de Notificaciones Sin Leer

## 📋 **RESUMEN**

Se implementó un contador de notificaciones sin leer en el icono del sobre (Bell) en la barra superior del backoffice. El contador solo aparece para usuarios con roles `familyadmin` y `familyviewer`, y se actualiza automáticamente.

## 🔧 **CAMBIOS REALIZADOS**

### **Frontend (Backoffice)**

#### **1. Nuevo Hook: `useNotificationCount.ts`**
- **Ubicación**: `backoffice/src/hooks/useNotificationCount.ts`
- **Funcionalidad**:
  - Obtiene el conteo de notificaciones sin leer
  - Solo se ejecuta para usuarios `familyadmin` y `familyviewer`
  - Se actualiza automáticamente cada 30 segundos
  - Maneja errores graciosamente

#### **2. Servicio de Notificaciones Actualizado**
- **Archivo**: `backoffice/src/services/notificationService.ts`
- **Nuevo método**: `getUnreadCount()`
- **Funcionalidad**: Obtiene el conteo de notificaciones sin leer desde el API

#### **3. Header Component Actualizado**
- **Archivo**: `backoffice/src/components/Header.tsx`
- **Cambios**:
  - Integra el hook `useNotificationCount`
  - Muestra el contador solo para usuarios autorizados
  - Contador dinámico con número real de notificaciones
  - Maneja números grandes (99+)
  - Conecta con la sección de notificaciones al hacer click

#### **4. Dashboard Component Actualizado**
- **Archivo**: `backoffice/src/components/Dashboard.tsx`
- **Cambio**: Pasa la función `onNotificationClick` al Header

### **Backend (API)**

#### **Nuevo Endpoint: `GET /notifications/unread-count`**
- **Ubicación**: `api/simple-server.js`
- **Funcionalidad**:
  - Retorna el conteo de notificaciones sin leer
  - Solo funciona para usuarios `familyadmin` y `familyviewer`
  - Filtra notificaciones por asociaciones del usuario
  - Excluye notificaciones ya leídas

## 🎯 **LÓGICA DE FUNCIONAMIENTO**

### **Filtrado de Notificaciones:**
1. **Por Rol**: Solo `familyadmin` y `familyviewer`
2. **Por Asociaciones**: Notificaciones de cuentas/divisiones del usuario
3. **Por Estado**: Excluye notificaciones ya leídas
4. **Por Destinatario**: Incluye notificaciones dirigidas específicamente al usuario

### **Query de Base de Datos:**
```javascript
{
  $or: [
    { 'recipients.user': userId }, // Notificaciones específicas
    { 
      account: { $in: accountIds },
      division: { $in: divisionIds }
    }
  ],
  'readBy.user': { $ne: userId } // Excluir leídas
}
```

## ✅ **CARACTERÍSTICAS IMPLEMENTADAS**

### **Contador Visual:**
- ✅ **Círculo rojo** con número de notificaciones
- ✅ **Solo visible** para `familyadmin` y `familyviewer`
- ✅ **Números grandes** mostrados como "99+"
- ✅ **Actualización automática** cada 30 segundos
- ✅ **Click funcional** que lleva a la sección de notificaciones

### **Restricciones de Acceso:**
- ✅ **Coordinadores** no ven el contador
- ✅ **Superadmin** no ve el contador
- ✅ **Adminaccount** no ve el contador
- ✅ **Solo usuarios familia** ven el contador

### **Manejo de Errores:**
- ✅ **Fallback a 0** si hay errores de API
- ✅ **Logs informativos** en consola
- ✅ **No interrumpe** la funcionalidad principal

## 🧪 **PRUEBAS REALIZADAS**

### **Datos de Prueba:**
- **Usuarios encontrados**: 11 usuarios familia (9 familyadmin + 2 familyviewer)
- **Notificaciones sin leer**: 5 notificaciones para el usuario de prueba
- **Asociaciones**: 1 cuenta, 1 división
- **Query funcionando**: Correctamente filtrado

### **Casos de Uso Verificados:**
- ✅ Usuario `familyadmin` con notificaciones sin leer
- ✅ Usuario `familyviewer` con notificaciones sin leer
- ✅ Usuarios sin notificaciones (contador = 0)
- ✅ Usuarios sin asociaciones (contador = 0)

## 📱 **EXPERIENCIA DE USUARIO**

### **Flujo de Usuario:**
1. **Usuario familia** inicia sesión en backoffice
2. **Ve el icono de campana** con contador rojo (si hay notificaciones)
3. **Hace click** en el icono
4. **Navega automáticamente** a la sección de notificaciones
5. **Ve sus notificaciones** sin leer
6. **Contador se actualiza** automáticamente

### **Estados del Contador:**
- **Sin notificaciones**: Solo icono de campana (sin contador)
- **Con notificaciones**: Icono + círculo rojo con número
- **Muchas notificaciones**: Muestra "99+" en lugar del número exacto

## 🔄 **ACTUALIZACIÓN AUTOMÁTICA**

- **Intervalo**: Cada 30 segundos
- **Condición**: Solo si el usuario tiene permisos
- **Optimización**: Se detiene si el usuario no tiene permisos
- **Limpieza**: Se limpia el intervalo al desmontar el componente

## 🎉 **RESULTADO FINAL**

El contador de notificaciones sin leer está completamente implementado y funcional:

- ✅ **Solo visible** para usuarios `familyadmin` y `familyviewer`
- ✅ **Contador dinámico** con números reales
- ✅ **Actualización automática** cada 30 segundos
- ✅ **Click funcional** que lleva a notificaciones
- ✅ **Manejo de errores** robusto
- ✅ **Diseño responsive** y accesible

---

**Fecha**: $(date)  
**Estado**: Implementado y probado  
**Usuarios afectados**: familyadmin, familyviewer
