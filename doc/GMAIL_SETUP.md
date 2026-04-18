# Configuración de Gmail para Kiki App

Este documento explica cómo configurar Gmail para el envío de emails automáticos en Kiki App.

## 📋 Prerrequisitos

- Una cuenta de Gmail
- Acceso a Google Cloud Console
- Node.js instalado

## 🔧 Pasos para Configurar Gmail

### 1. Crear Proyecto en Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Anota el **Project ID** para usarlo más adelante

### 2. Habilitar Gmail API

1. En el menú lateral, ve a **APIs & Services** > **Library**
2. Busca "Gmail API"
3. Haz clic en **Gmail API** y luego en **Enable**

### 3. Crear Credenciales OAuth 2.0

1. Ve a **APIs & Services** > **Credentials**
2. Haz clic en **+ CREATE CREDENTIALS** > **OAuth client ID**
3. Si es la primera vez, configura la pantalla de consentimiento:
   - **User Type**: External
   - **App name**: Kiki App
   - **User support email**: tu email
   - **Developer contact information**: tu email
   - **Authorized domains**: agrega tu dominio (opcional)
4. Completa la configuración y guarda

### 4. Configurar URLs de Redirección

1. En las credenciales OAuth 2.0, haz clic en **EDIT**
2. En **Authorized redirect URIs**, agrega:
   ```
   https://developers.google.com/oauthplayground
   ```
3. Guarda los cambios

### 5. Obtener Refresh Token

1. Ve a [Google OAuth Playground](https://developers.google.com/oauthplayground/)
2. Haz clic en el ícono de engranaje (⚙️) en la esquina superior derecha
3. Marca **Use your own OAuth credentials**
4. Ingresa tu **Client ID** y **Client Secret**
5. En la lista de APIs, busca **Gmail API v1**
6. Selecciona **https://mail.google.com/**
7. Haz clic en **Authorize APIs**
8. Autoriza con tu cuenta de Gmail
9. Haz clic en **Exchange authorization code for tokens**
10. Copia el **Refresh token**

### 6. Configurar Variables de Entorno

Agrega estas variables a tu archivo `.env`:

```bash
# Gmail Configuration
GMAIL_USER=tu-email@gmail.com
GMAIL_CLIENT_ID=tu-client-id
GMAIL_CLIENT_SECRET=tu-client-secret
GMAIL_REDIRECT_URI=https://developers.google.com/oauthplayground
GMAIL_REFRESH_TOKEN=tu-refresh-token
APP_URL=http://localhost:3000
```

### 7. Probar la Configuración

Ejecuta el script de prueba:

```bash
node test-email.js
```

## 🚀 Uso Automático

Una vez configurado, el sistema enviará automáticamente:

- **Emails de recuperación de contraseña** cuando un usuario solicite resetear su contraseña
- **Emails de bienvenida** cuando se registre un nuevo usuario (opcional)

## 📧 Templates de Email

Los emails incluyen:

- **Diseño responsive** que se ve bien en móviles y desktop
- **Branding de Kiki App** con colores corporativos
- **Información clara** sobre el propósito del email
- **Instrucciones de seguridad** para códigos de recuperación

## 🔒 Seguridad

- Los códigos de recuperación expiran en **10 minutos**
- Los códigos solo se pueden usar **una vez**
- Los emails incluyen advertencias de seguridad
- Las credenciales se almacenan en variables de entorno

## 🛠️ Solución de Problemas

### Error: "Invalid Credentials"
- Verifica que el Client ID y Client Secret sean correctos
- Asegúrate de que el Refresh Token no haya expirado

### Error: "Gmail API not enabled"
- Verifica que la Gmail API esté habilitada en tu proyecto de Google Cloud

### Error: "Access denied"
- Verifica que el email de Gmail tenga permisos para enviar emails
- Asegúrate de que la cuenta no tenga restricciones de seguridad

### Error: "Quota exceeded"
- Gmail tiene límites de envío diario
- Considera usar un servicio de email transaccional para producción

## 📞 Soporte

Si tienes problemas con la configuración:

1. Revisa los logs del servidor para errores específicos
2. Verifica que todas las variables de entorno estén configuradas
3. Ejecuta `node setup-gmail.js` para reconfigurar
4. Contacta al equipo de desarrollo si el problema persiste
