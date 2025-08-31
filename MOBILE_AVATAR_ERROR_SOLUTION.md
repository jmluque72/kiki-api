# Solución para Error de Avatar en App Móvil

## 🎯 **Problema Identificado**

El usuario reportó que en la app móvil aparece el error:
- **Modal**: "Error al actualizar el avatar"
- **Toast**: "[UserService] Error status: undefined"

## ✅ **Estado del Backend**

### Verificaciones Realizadas
- ✅ **Servidor funcionando**: El servidor responde correctamente en `http://192.168.68.103:3000/api`
- ✅ **Endpoint de avatar**: `PUT /users/avatar` funciona correctamente
- ✅ **Subida a S3**: Los avatares se suben correctamente a S3
- ✅ **URLs firmadas**: Se generan correctamente
- ✅ **CORS configurado**: Permite requests desde apps móviles
- ✅ **Autenticación**: Los tokens funcionan correctamente

## 🔍 **Análisis del Error**

### Error "status: undefined"
Este error indica que `error.response` es `undefined`, lo que significa que:
1. **No se recibió respuesta del servidor**
2. **La request falló antes de llegar al servidor**
3. **Problema de conectividad de red**

### Posibles Causas

#### 1. **Problema de Conectividad de Red**
- El dispositivo móvil no puede alcanzar `192.168.68.103:3000`
- Firewall bloqueando la conexión
- Dispositivo móvil en red diferente

#### 2. **Configuración de IP Incorrecta**
- La IP `192.168.68.103` puede haber cambiado
- El dispositivo móvil necesita la IP correcta del servidor

#### 3. **Timeout de Request**
- La request puede estar tardando más de 10 segundos
- Problema de red lenta

#### 4. **Configuración de CORS**
- Aunque CORS está configurado, puede haber problemas específicos para apps móviles

## 🛠️ **Soluciones Propuestas**

### 1. **Verificar IP del Servidor**
```bash
# En la máquina del servidor
ifconfig | grep "inet " | grep -v 127.0.0.1
```

### 2. **Verificar Conectividad desde el Dispositivo Móvil**
```bash
# Desde el dispositivo móvil o emulador
ping 192.168.68.103
```

### 3. **Actualizar Configuración de la App Móvil**
En `KikiApp/src/config/apiConfig.ts`:
```typescript
export const getApiBaseUrl = () => {
  // Verificar que esta IP sea la correcta
  return 'http://192.168.68.103:3000/api';
};
```

### 4. **Aumentar Timeout en la App Móvil**
En `KikiApp/src/config/apiConfig.ts`:
```typescript
export const API_TIMEOUT = 30000; // Aumentar a 30 segundos
```

### 5. **Mejorar Manejo de Errores en UserService**
En `KikiApp/src/services/userService.ts`:
```typescript
static async updateAvatar(imageUri: string): Promise<UpdateAvatarResponse> {
  try {
    // ... código existente ...
    
    const response = await apiClient.put('/users/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 30000, // Aumentar timeout
    });
    
    return response.data;
  } catch (error: any) {
    console.error('❌ [UserService] Error actualizando avatar:', error);
    
    // Mejorar logging de errores
    if (error.response) {
      console.error('❌ [UserService] Error response:', error.response.data);
      console.error('❌ [UserService] Error status:', error.response.status);
      return error.response.data;
    } else if (error.request) {
      console.error('❌ [UserService] No se recibió respuesta del servidor');
      return {
        success: false,
        message: 'No se pudo conectar con el servidor. Verifica tu conexión.'
      };
    } else {
      console.error('❌ [UserService] Error de configuración:', error.message);
      return {
        success: false,
        message: 'Error de configuración en la aplicación'
      };
    }
  }
}
```

### 6. **Verificar Configuración de Red**
- Asegurar que el dispositivo móvil esté en la misma red WiFi que el servidor
- Verificar que no haya firewall bloqueando el puerto 3000
- Probar con diferentes dispositivos/emuladores

### 7. **Usar IP Localhost para Emuladores**
Para emuladores, usar:
```typescript
// Para emulador Android
return 'http://10.0.2.2:3000/api';

// Para emulador iOS
return 'http://localhost:3000/api';
```

## 🧪 **Tests de Verificación**

### 1. **Test de Conectividad desde App Móvil**
```javascript
// Agregar este test en la app móvil
const testConnectivity = async () => {
  try {
    const response = await fetch('http://192.168.68.103:3000/api/users/profile');
    console.log('✅ Conectividad OK:', response.status);
  } catch (error) {
    console.log('❌ Error de conectividad:', error.message);
  }
};
```

### 2. **Test de Login desde App Móvil**
```javascript
// Verificar que el login funcione
const testLogin = async () => {
  try {
    const response = await fetch('http://192.168.68.103:3000/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@kiki.com.ar',
        password: 'admin123'
      })
    });
    const data = await response.json();
    console.log('✅ Login OK:', data.success);
  } catch (error) {
    console.log('❌ Error en login:', error.message);
  }
};
```

## 🎯 **Pasos de Solución Recomendados**

### Paso 1: Verificar IP del Servidor
1. Obtener la IP actual del servidor
2. Actualizar la configuración de la app móvil
3. Probar conectividad básica

### Paso 2: Mejorar Manejo de Errores
1. Implementar mejor logging de errores
2. Aumentar timeout de requests
3. Agregar mensajes de error más descriptivos

### Paso 3: Verificar Configuración de Red
1. Asegurar que dispositivo móvil y servidor estén en la misma red
2. Verificar firewall y puertos
3. Probar con diferentes dispositivos

### Paso 4: Testing
1. Probar con emuladores y dispositivos físicos
2. Verificar en diferentes redes
3. Monitorear logs de la app móvil

## 📋 **Estado Actual**

- ✅ **Backend funcionando correctamente**
- ✅ **Avatares se suben a S3**
- ✅ **URLs firmadas funcionando**
- ⚠️ **Problema de conectividad en app móvil**
- 🔧 **Solución: Verificar configuración de red y IP**

**El problema está en la comunicación entre la app móvil y el servidor, no en el backend.**
