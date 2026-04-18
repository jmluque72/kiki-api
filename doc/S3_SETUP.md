# Configuración de AWS S3 para Kiki API

## Descripción
Este documento explica cómo configurar AWS S3 para la carga de imágenes en la aplicación Kiki.

## Funcionalidades Implementadas

### 1. Carga de Imágenes a S3
- **Endpoint**: `POST /api/upload/s3/image`
- **Autenticación**: Requerida
- **Formato**: Multipart form data
- **Campo**: `image`
- **Límite**: 5MB máximo
- **Tipos permitidos**: Solo imágenes (image/*)

### 2. Actualización de Logo de Cuenta
- **Endpoint**: `PUT /api/accounts/:accountId/logo`
- **Autenticación**: Requerida
- **Permisos**: superadmin, adminaccount
- **Body**: `{ "imageKey": "uploads/uuid.ext" }`

### 3. Obtención de Logo de Cuenta
- **Endpoint**: `GET /api/accounts/:accountId/logo`
- **Autenticación**: Requerida
- **Acceso**: Usuarios asociados a la cuenta

## Configuración de AWS S3

### 1. Crear Bucket S3
```bash
# En AWS Console o CLI
aws s3 mb s3://tu-bucket-kiki
```

### 2. Configurar CORS del Bucket
```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
        "AllowedOrigins": ["*"],
        "ExposeHeaders": []
    }
]
```

### 3. Configurar Política de Bucket
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::tu-bucket-kiki/*"
        }
    ]
}
```

### 4. Variables de Entorno
Actualizar `api/env.config`:
```bash
# Configuración de AWS S3
AWS_ACCESS_KEY_ID=tu_access_key_aqui
AWS_SECRET_ACCESS_KEY=tu_secret_key_aqui
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=tu-bucket-kiki
```

## Flujo de Uso

### 1. Subir Imagen
```javascript
// 1. Subir imagen a S3
const formData = new FormData();
formData.append('image', imageFile);

const response = await fetch('/api/upload/s3/image', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    ...formData.getHeaders()
  },
  body: formData
});

const { imageKey, imageUrl } = response.data;
```

### 2. Actualizar Logo de Cuenta
```javascript
// 2. Actualizar logo de cuenta con el imageKey
const updateResponse = await fetch(`/api/accounts/${accountId}/logo`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ imageKey })
});
```

## Estructura de Archivos en S3
```
tu-bucket-kiki/
├── uploads/
│   ├── uuid1.png
│   ├── uuid2.jpg
│   └── uuid3.gif
```

## Seguridad
- ✅ Autenticación requerida para todos los endpoints
- ✅ Validación de tipos de archivo (solo imágenes)
- ✅ Límite de tamaño (5MB)
- ✅ Nombres únicos con UUID
- ✅ Permisos por rol de usuario

## Testing
```bash
# Ejecutar script de prueba
node test-s3-upload.js
```

## Notas Importantes
1. **Credenciales AWS**: Asegúrate de usar credenciales con permisos mínimos necesarios
2. **Región**: Configura la región correcta para tu bucket
3. **CORS**: Necesario para acceso desde frontend
4. **Costos**: Monitorea el uso de S3 para controlar costos
