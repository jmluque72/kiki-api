# 📧 Configuración de AWS SES para Kiki App

## 🎯 Objetivo
Configurar AWS Simple Email Service (SES) para el envío de emails desde Kiki App usando la cuenta `jmluque72@gmail.com`.

## 🔧 Configuración Requerida

### 1. Variables de Entorno
Agregar al archivo `.env`:
```bash
# AWS Credentials
AWS_ACCESS_KEY_ID=tu_access_key_id
AWS_SECRET_ACCESS_KEY=tu_secret_access_key
AWS_REGION=us-east-1

# SES Configuration
AWS_SES_FROM_EMAIL=jmluque72@gmail.com
AWS_SES_FROM_NAME=Kiki App
```

### 2. Verificar Email en SES
1. Ir a [AWS SES Console](https://console.aws.amazon.com/ses/)
2. Navegar a "Verified identities"
3. Hacer clic en "Create identity"
4. Seleccionar "Email address"
5. Ingresar: `jmluque72@gmail.com`
6. Hacer clic en "Create identity"
7. Revisar el email y hacer clic en el enlace de verificación

### 3. Solicitar Salida del Sandbox (Opcional)
- Por defecto, SES está en modo sandbox
- Solo permite enviar a emails verificados
- Para producción, solicitar salida del sandbox

## 🧪 Pruebas

### 1. Verificar Estado de SES
```bash
node check-ses-status.js
```

### 2. Probar Envío de Emails
```bash
node test-ses-email.js
```

### 3. Probar Flujo Completo de Recuperación
```bash
# Paso 1: Solicitar recuperación
node test-ses-complete-flow.js

# Paso 2: Verificar código (después de recibir el email)
node test-ses-verify-code.js jmluque72@gmail.com 123456
```

## 📧 Tipos de Emails Configurados

### 1. Recuperación de Contraseña
- **Función**: `sendPasswordResetEmail(email, code, userName)`
- **Endpoint**: `POST /api/users/forgot-password`
- **Template**: Email con código de 6 dígitos

### 2. Email de Bienvenida
- **Función**: `sendWelcomeEmail(email, userName)`
- **Uso**: Cuando se crea una nueva cuenta
- **Template**: Email de bienvenida con enlace a la app

### 3. Notificaciones
- **Función**: `sendNotificationEmail(email, subject, message, userName)`
- **Uso**: Para enviar notificaciones importantes
- **Template**: Email con asunto y mensaje personalizado

## 🔍 Monitoreo

### Logs de SES
- Los logs aparecen en la consola con prefijo `📧 [SES]`
- Incluyen Message ID para tracking
- Errores detallados en caso de fallo

### Métricas Importantes
- **Cuota diaria**: 200 emails por día (sandbox)
- **Rate limit**: 14 emails por segundo
- **Bounce rate**: Mantener bajo 5%
- **Complaint rate**: Mantener bajo 0.1%

## 🚀 Producción

### 1. Salir del Sandbox
1. Ir a SES Console
2. Navegar a "Account dashboard"
3. Hacer clic en "Request production access"
4. Completar el formulario
5. Esperar aprobación (24-48 horas)

### 2. Configurar Dominio (Opcional)
1. Verificar dominio completo
2. Configurar registros DNS
3. Configurar DKIM
4. Configurar SPF

### 3. Monitoreo en Producción
- Configurar CloudWatch alarms
- Monitorear métricas de envío
- Configurar SNS para notificaciones

## ⚠️ Consideraciones de Seguridad

### 1. Credenciales AWS
- Usar IAM roles en producción
- Rotar credenciales regularmente
- Usar políticas mínimas necesarias

### 2. Rate Limiting
- Implementar rate limiting en la aplicación
- Manejar errores de cuota
- Implementar cola de emails

### 3. Validación
- Validar emails antes del envío
- Implementar blacklist de emails
- Monitorear bounces y quejas

## 🔧 Troubleshooting

### Error: "Email address not verified"
- Verificar que `jmluque72@gmail.com` esté verificado en SES
- Revisar región de SES (debe ser la misma que en configuración)

### Error: "Sending quota exceeded"
- Verificar cuota diaria en SES Console
- Implementar rate limiting
- Solicitar aumento de cuota

### Error: "Invalid credentials"
- Verificar AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY
- Verificar permisos de SES
- Verificar región

## 📞 Soporte
- AWS SES Documentation: https://docs.aws.amazon.com/ses/
- AWS SES Console: https://console.aws.amazon.com/ses/
- AWS Support: https://aws.amazon.com/support/
