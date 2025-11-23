#!/usr/bin/env node

/**
 * Script para crear la cola SQS para emails
 * Uso: node api/scripts/create-sqs-queue.js
 */

require('dotenv').config();
const { SQSClient, CreateQueueCommand, GetQueueUrlCommand } = require('@aws-sdk/client-sqs');

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const QUEUE_NAME = process.env.SQS_EMAIL_QUEUE_NAME || 'kiki-email-queue';

async function createQueue() {
  try {
    console.log('📦 Creando cola SQS:', QUEUE_NAME);
    console.log('🌍 Región:', process.env.AWS_REGION || 'us-east-1');

    // Verificar si la cola ya existe
    try {
      const getUrlCommand = new GetQueueUrlCommand({ QueueName: QUEUE_NAME });
      const existingQueue = await sqsClient.send(getUrlCommand);
      console.log('✅ La cola ya existe:');
      console.log('   URL:', existingQueue.QueueUrl);
      console.log('\n💡 Agrega esta URL a tu archivo .env:');
      console.log(`   SQS_EMAIL_QUEUE_URL=${existingQueue.QueueUrl}`);
      return existingQueue.QueueUrl;
    } catch (error) {
      if (error.name !== 'AWS.SimpleQueueService.NonExistentQueue') {
        throw error;
      }
      // La cola no existe, continuar con la creación
    }

    // Crear la cola con configuración
    const createCommand = new CreateQueueCommand({
      QueueName: QUEUE_NAME,
      Attributes: {
        // Visibilidad de mensaje: 5 minutos
        VisibilityTimeout: '300',
        // Tiempo de retención: 14 días
        MessageRetentionPeriod: '1209600',
        // Delay de entrega: 0 segundos
        DelaySeconds: '0',
        // Long polling: 20 segundos
        ReceiveMessageWaitTimeSeconds: '20'
      }
    });

    const result = await sqsClient.send(createCommand);
    
    // Obtener la URL de la cola
    const getUrlCommand = new GetQueueUrlCommand({ QueueName: QUEUE_NAME });
    const queueUrl = await sqsClient.send(getUrlCommand);

    console.log('✅ Cola SQS creada exitosamente:');
    console.log('   Nombre:', QUEUE_NAME);
    console.log('   URL:', queueUrl.QueueUrl);
    console.log('\n💡 Agrega esta URL a tu archivo .env:');
    console.log(`   SQS_EMAIL_QUEUE_URL=${queueUrl.QueueUrl}`);
    console.log(`   SQS_EMAIL_QUEUE_NAME=${QUEUE_NAME}`);

    return queueUrl.QueueUrl;
  } catch (error) {
    console.error('❌ Error creando cola SQS:', error.message);
    if (error.name === 'InvalidClientTokenId' || error.name === 'SignatureDoesNotMatch') {
      console.error('\n💡 Verifica tus credenciales de AWS:');
      console.error('   - AWS_ACCESS_KEY_ID');
      console.error('   - AWS_SECRET_ACCESS_KEY');
      console.error('   - AWS_REGION');
    }
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  createQueue();
}

module.exports = { createQueue };

