# 🚀 CONFIGURACIÓN DE BASE DE DATOS LIMPIA - KIKI

## 📋 **DESCRIPCIÓN**

Scripts para configurar una base de datos MongoDB completamente nueva y limpia para el sistema KIKI, incluyendo roles básicos, usuario administrador y cuenta de ejemplo.

## ⚠️ **ADVERTENCIA IMPORTANTE**

**🚨 ESTOS SCRIPTS ELIMINARÁN TODOS LOS DATOS EXISTENTES**

- Se eliminarán todas las colecciones de la base de datos
- Se perderán todos los usuarios, alumnos, eventos, etc.
- Solo se preservarán los índices del sistema
- **HACER BACKUP ANTES DE EJECUTAR**

## 📁 **ARCHIVOS DISPONIBLES**

### **1. `setup-clean-database.js`** (Script completo)
- Script principal con funcionalidad completa
- Incluye confirmaciones y manejo de errores detallado
- Configuración paso a paso

### **2. `quick-setup.js`** (Script rápido)
- Versión simplificada y directa
- Configuración en un solo comando
- Ideal para desarrollo/testing

### **3. `database-config.js`** (Configuración)
- Archivo de configuración centralizado
- Fácil de personalizar
- Separado de la lógica de ejecución

## 🔧 **CONFIGURACIÓN REQUERIDA**

### **Variables de Entorno (.env):**
```bash
MONGODB_URI=mongodb://localhost:27017/kiki
# O para MongoDB Atlas:
# MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/kiki
```

### **Dependencias:**
```bash
npm install mongoose bcryptjs dotenv
```

## 🚀 **INSTRUCCIONES DE USO**

### **Opción 1: Script Completo**
```bash
# 1. Revisar configuración
node setup-clean-database.js

# 2. Ejecutar manualmente (desde Node.js)
const { setupCleanDatabase } = require('./setup-clean-database');
await setupCleanDatabase();
```

### **Opción 2: Script Rápido**
```bash
# 1. Revisar configuración
node quick-setup.js

# 2. Ejecutar manualmente (desde Node.js)
const { quickSetup } = require('./quick-setup');
await quickSetup();
```

### **Opción 3: Configuración Personalizada**
```bash
# 1. Editar database-config.js
# 2. Modificar roles, usuario admin, cuenta de ejemplo
# 3. Ejecutar cualquiera de los scripts
```

## 📊 **LO QUE SE CREARÁ**

### **Roles del Sistema:**
1. **superadmin** (nivel 100) - Acceso completo
2. **adminaccount** (nivel 80) - Administrador de institución
3. **coordinador** (nivel 60) - Coordinador de división
4. **familyadmin** (nivel 40) - Administrador familiar
5. **familyviewer** (nivel 20) - Visualizador familiar

### **Usuario Administrador:**
- **Email**: admin@kiki.com.ar
- **Password**: admin123
- **Rol**: superadmin
- **DNI**: 00000000
- **Status**: approved

### **Cuenta de Ejemplo:**
- **Nombre**: Escuela de Ejemplo
- **Razón Social**: Escuela de Ejemplo S.A.
- **Dirección**: Calle Ejemplo 123, Ciudad Ejemplo
- **Admin**: admin@kiki.com.ar

### **Asociaciones:**
- Usuario admin asociado a la cuenta de ejemplo
- Rol superadmin con acceso completo

## 🔍 **VERIFICACIÓN POST-EJECUCIÓN**

### **1. Verificar Conexión:**
```bash
# Conectar a MongoDB
mongosh kiki

# Listar colecciones
show collections

# Verificar roles
db.roles.find()

# Verificar usuario admin
db.users.find({email: "admin@kiki.com.ar"})

# Verificar cuenta
db.accounts.find()
```

### **2. Verificar Acceso:**
- Intentar login con admin@kiki.com.ar / admin123
- Verificar que tenga acceso completo al sistema
- Confirmar que pueda crear/modificar/eliminar

## 🛡️ **MEDIDAS DE SEGURIDAD**

### **Antes de Ejecutar:**
1. ✅ **Hacer backup** de la base de datos actual
2. ✅ **Verificar** que estés en el entorno correcto
3. ✅ **Confirmar** que quieres eliminar todos los datos
4. ✅ **Revisar** la configuración de conexión

### **Durante la Ejecución:**
1. ✅ **Monitorear** los logs de ejecución
2. ✅ **Verificar** que no haya errores
3. ✅ **Confirmar** que se creen todos los elementos

### **Después de Ejecutar:**
1. ✅ **Verificar** que el usuario admin funcione
2. ✅ **Probar** acceso al backoffice
3. ✅ **Confirmar** que los roles estén correctos

## 🚨 **SOLUCIÓN DE PROBLEMAS**

### **Error de Conexión:**
```bash
# Verificar que MongoDB esté corriendo
sudo systemctl status mongod

# Verificar URI de conexión
echo $MONGODB_URI
```

### **Error de Permisos:**
```bash
# Verificar permisos de MongoDB
sudo chown -R mongodb:mongodb /var/lib/mongodb
sudo chmod 755 /var/lib/mongodb
```

### **Error de Dependencias:**
```bash
# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install
```

## 📝 **PERSONALIZACIÓN**

### **Modificar Roles:**
Editar `database-config.js`:
```javascript
roles: [
  {
    nombre: 'nuevo_rol',
    descripcion: 'Descripción del nuevo rol',
    nivel: 50,
    permisos: ['permiso1', 'permiso2']
  }
]
```

### **Modificar Usuario Admin:**
```javascript
adminUser: {
  name: 'Tu Nombre',
  email: 'tu@email.com',
  password: 'tu_password',
  dni: '12345678'
}
```

### **Modificar Cuenta de Ejemplo:**
```javascript
exampleAccount: {
  nombre: 'Tu Institución',
  razonSocial: 'Tu Razón Social',
  address: 'Tu Dirección'
}
```

## 🎯 **CASOS DE USO**

### **Desarrollo Local:**
- Configurar entorno de desarrollo limpio
- Probar funcionalidades sin datos de producción
- Desarrollar nuevas características

### **Testing:**
- Crear entorno de pruebas limpio
- Ejecutar tests de integración
- Verificar flujos completos del sistema

### **Producción (CUIDADO):**
- Migrar a nueva estructura de base de datos
- Resetear sistema completamente
- **SOLO SI ES ABSOLUTAMENTE NECESARIO**

## 📞 **SOPORTE**

Si encuentras problemas:

1. **Revisar logs** de ejecución
2. **Verificar configuración** de MongoDB
3. **Confirmar dependencias** instaladas
4. **Revisar permisos** de base de datos

---

**Estado**: 🟢 **SCRIPTS LISTOS PARA USAR**
**Última actualización**: $(date)
**Versión**: 1.0.0


