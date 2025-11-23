# Configuración de AWS SQS para Emails Asíncronos

Este documento explica cómo configurar AWS SQS para el envío asíncrono de emails.

## Requisitos Previos

1. Cuenta de AWS con permisos para crear y usar colas SQS
2. Credenciales de AWS (Access Key ID y Secret Access Key)
3. Node.js y npm instalados

## Pasos de Configuración

### 1. Configurar Variables de Entorno

Agrega las siguientes variables a tu archivo `.env`:

```env
# AWS SQS Configuration for Email Queue
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=tu_access_key_aqui
AWS_SECRET_ACCESS_KEY=tu_secret_key_aqui
SQS_EMAIL_QUEUE_NAME=kiki-email-queue
SQS_EMAIL_QUEUE_URL=
```

**Nota:** `SQS_EMAIL_QUEUE_URL` se completará automáticamente después de crear la cola.

### 2. Crear la Cola SQS

Ejecuta el script para crear la cola SQS:

```bash
npm run sqs:create-queue
```

O directamente:

```bash
node api/scripts/create-sqs-queue.js
```

El script:
- Creará la cola SQS con el nombre especificado en `SQS_EMAIL_QUEUE_NAME`
- Configurará los parámetros óptimos para el procesamiento de emails
- Mostrará la URL de la cola que debes agregar a tu `.env`

### 3. Actualizar .env con la URL de la Cola

Después de ejecutar el script, copia la URL de la cola y agrégala a tu `.env`:

```env
SQS_EMAIL_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/kiki-email-queue
```

### 4. Iniciar el Servidor

El worker de emails se inicia automáticamente cuando inicias el servidor principal:

```bash
npm start
# o
npm run dev
```

El worker:
- Se conecta a MongoDB (usa la conexión existente si está integrado)
- Escucha mensajes de la cola SQS
- Procesa y envía los emails
- Guarda errores en MongoDB si ocurren problemas

## Verificación

### Verificar que el Worker está Funcionando

Cuando inicies el servidor, deberías ver estos mensajes:

```
🚀 API de Kiki corriendo en puerto 3000
📧 Iniciando worker de emails...
✅ [EMAIL WORKER] Usando conexión MongoDB existente
🚀 [EMAIL WORKER] Iniciando worker de emails...
📧 [EMAIL WORKER] Cola SQS: https://sqs.us-east-1.amazonaws.com/...
```

### Probar el Envío de Emails

Puedes usar el endpoint de test para verificar que los mensajes se envían a SQS:

```bash
curl -X POST http://localhost:3000/debug/test-all-emails \
  -H "Content-Type: application/json" \
  -d '{"email":"tu-email@ejemplo.com"}'
```

## Modo Standalone (Opcional)

Si prefieres ejecutar el worker como un proceso separado:

```bash
npm run worker:email
```

En este modo, el worker:
- Crea su propia conexión a MongoDB
- Se ejecuta independientemente del servidor principal
- Útil para escalar el procesamiento de emails

## Monitoreo de Errores

Los errores de envío de emails se guardan en la colección `emailerrors` de MongoDB. Puedes consultarlos:

```javascript
// En MongoDB
db.emailerrors.find().sort({ createdAt: -1 }).limit(10)
```

## Configuración de la Cola SQS

La cola se crea con estos parámetros:

- **Visibility Timeout:** 300 segundos (5 minutos)
- **Message Retention:** 14 días
- **Receive Message Wait Time:** 20 segundos (long polling)
- **Delay Seconds:** 0 segundos

Estos valores están optimizados para el procesamiento de emails.

## Solución de Problemas

### Error: "SQS_EMAIL_QUEUE_URL no está configurada"

Asegúrate de:
1. Haber creado la cola SQS
2. Haber agregado la URL al archivo `.env`
3. Reiniciar el servidor después de actualizar `.env`

### Error: "InvalidClientTokenId" o "SignatureDoesNotMatch"

Verifica tus credenciales de AWS:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

### El Worker no Procesa Mensajes

Verifica:
1. Que la cola SQS existe y tiene mensajes
2. Que las credenciales de AWS son correctas
3. Los logs del worker para ver errores específicos

## Arquitectura

```
┌─────────────┐
│   API App   │
│             │
│  Envía a    │
│    SQS      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  SQS Queue  │
│  (AWS)      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Worker    │
│             │
│  Consume    │
│  y Envía    │
│   Emails    │
└─────────────┘
```

## Beneficios

- **Desacoplamiento:** El envío de emails no bloquea las peticiones HTTP
- **Escalabilidad:** Puedes ejecutar múltiples workers
- **Resiliencia:** Los mensajes se guardan en SQS si el worker falla
- **Monitoreo:** Errores guardados en MongoDB para análisis

