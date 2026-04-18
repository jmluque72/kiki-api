# Desactivación de Creación de Usuarios en Backoffice

## 📋 **RESUMEN DE CAMBIOS**

Se ha desactivado la funcionalidad de creación manual de usuarios en el backoffice. Los usuarios ahora solo se crean mediante:

1. **Carga de archivos Excel** (estudiantes, coordinadores)
2. **Registro desde la aplicación móvil**

## 🔧 **CAMBIOS REALIZADOS**

### **Frontend (Backoffice)**

#### **Archivo: `backoffice/src/components/sections/UsuariosSection.tsx`**

1. **Botón "Nuevo Usuario" desactivado:**
   - Cambiado a estado `disabled`
   - Estilo visual gris para indicar desactivación
   - Tooltip explicativo

2. **Función `openModal()` desactivada:**
   - Retorna inmediatamente sin abrir el modal
   - Log informativo en consola

3. **Mensaje informativo agregado:**
   - Banner azul explicativo sobre cómo se crean los usuarios
   - Lista de métodos de creación disponibles

4. **Descripción en el header:**
   - Texto explicativo debajo del título
   - Clarifica que los usuarios se crean automáticamente

### **Backend (API)**

#### **Archivo: `api/simple-server.js`**

1. **Endpoint `POST /users` desactivado:**
   - Retorna error 403 con mensaje explicativo
   - Código original comentado para preservar funcionalidad
   - Log informativo en consola

2. **Endpoint `POST /users/register` desactivado:**
   - Retorna error 403 con mensaje explicativo
   - Código original comentado para preservar funcionalidad
   - Log informativo en consola

3. **Endpoint `POST /users/register-mobile` mantenido activo:**
   - Permite registro desde la app móvil
   - Funcionalidad preservada

## ✅ **FUNCIONALIDADES MANTENIDAS**

- ✅ **Visualización de usuarios** en el backoffice
- ✅ **Edición de usuarios** existentes
- ✅ **Eliminación de usuarios**
- ✅ **Filtrado y búsqueda** de usuarios
- ✅ **Carga de Excel** (estudiantes, coordinadores)
- ✅ **Registro desde app móvil**
- ✅ **Asociación automática** de usuarios

## 🚫 **FUNCIONALIDADES DESACTIVADAS**

- ❌ **Creación manual de usuarios** desde backoffice
- ❌ **Registro general** desde cualquier fuente
- ❌ **Modal de creación** de usuarios

## 📧 **INTEGRACIÓN CON EMAILS**

Los emails de bienvenida y asociación siguen funcionando para:
- ✅ **Usuarios creados por Excel**
- ✅ **Usuarios registrados desde app móvil**
- ✅ **Asociaciones automáticas**

## 🎯 **OBJETIVO CUMPLIDO**

La creación de usuarios ahora está centralizada en:
1. **Procesos automatizados** (Excel)
2. **Registro controlado** (app móvil)

Esto mejora la consistencia y control sobre la creación de usuarios en el sistema.

## 🔄 **REVERTIR CAMBIOS**

Si necesitas reactivar la creación manual de usuarios:

1. **Frontend:** Descomentar y restaurar la función `openModal()`
2. **Backend:** Descomentar los bloques de código en los endpoints
3. **Remover:** Los mensajes informativos y estados desactivados

---

**Fecha:** $(date)  
**Estado:** Implementado y probado
