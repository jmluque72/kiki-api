# Configuración del Servicio de Email - KIKI

## Variables de Entorno Requeridas

Agrega estas variables a tu archivo `.env`:

```bash
# Configuración de Email SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-app-password-de-gmail
```

## Configuración para Gmail (Recomendado para desarrollo)

1. **Habilitar 2FA en tu cuenta de Google**
2. **Generar App Password:**
   - Ve a [Google Account](https://myaccount.google.com/)
   - Security > 2-Step Verification
   - App passwords
   - Genera una nueva contraseña para "Mail"

3. **Usar la App Password en lugar de tu contraseña normal**

## Configuración para otros proveedores SMTP

```bash
# Outlook/Hotmail
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587

# Yahoo
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587

# Tu propio servidor SMTP
SMTP_HOST=smtp.tuproveedor.com
SMTP_PORT=587
```

## Templates de Email Disponibles

### 1. Usuario FamilyViewer Creado
- **Trigger:** Cuando se crea automáticamente un usuario familyviewer
- **Contenido:** Credenciales de acceso y bienvenida
- **Header:** Imagen de KIKI con colores oficiales

### 2. Recuperación de Contraseña
- **Trigger:** Cuando se solicita recuperar contraseña
- **Contenido:** Código de verificación de 6 dígitos
- **Header:** Imagen de KIKI con colores oficiales

### 3. Notificación General
- **Trigger:** Para envíos personalizados
- **Contenido:** Título y mensaje personalizables
- **Header:** Imagen de KIKI con colores oficiales

## Colores del Template

- **Header Background:** #0E5FCE (Azul KIKI)
- **Logo Text:** #FF8C42 (Naranja KIKI)
- **Botones:** #FF8C42 (Naranja KIKI)
- **Alertas Info:** #d1ecf1 (Azul claro)
- **Alertas Success:** #d4edda (Verde claro)

## Estructura del Email

```
┌─────────────────────────────────┐
│           HEADER KIKI           │
│        (Imagen SVG inline)      │
├─────────────────────────────────┤
│                                 │
│         CONTENIDO               │
│                                 │
├─────────────────────────────────┤
│           FOOTER                │
│     (Información legal)         │
└─────────────────────────────────┘
```

## Testing

Para probar el servicio de email:

1. Configura las variables de entorno
2. Reinicia el servidor
3. Solicita una asociación para un familyviewer
4. Verifica que se reciba el email con las credenciales

## Logs

El servicio registra todos los envíos:
- ✅ Email enviado exitosamente
- ❌ Error enviando email
- 📧 Message ID del email enviado
