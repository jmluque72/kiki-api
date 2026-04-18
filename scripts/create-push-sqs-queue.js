#!/usr/bin/env node

/**
 * Script para crear la cola SQS para push notifications
 * 
 * Uso:
 *   node scripts/create-push-sqs-queue.js
 */

require('dotenv').config();
const { SQSClient, CreateQueueCommand, GetQueueAttributesCommand } = require('@aws-sdk/client-sqs');

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function createPushQueue() {
  try {
    const queueName = process.env.SQS_PUSH_QUEUE_NAME || 'push-notifications-queue';
    
    console.log(`📦 Creando cola SQS: ${queueName}...`);

    const command = new CreateQueueCommand({
      QueueName: queueName,
      Attributes: {
        VisibilityTimeout: '300', // 5 minutos
        MessageRetentionPeriod: '1209600', // 14 días
        ReceiveMessageWaitTimeSeconds: '20', // Long polling
        DelaySeconds: '0'
      }
    });

    const response = await sqsClient.send(command);
    const queueUrl = response.QueueUrl;

    console.log(`✅ Cola creada exitosamente!`);
    console.log(`📋 Queue URL: ${queueUrl}`);
    console.log(`\n💡 Agrega esta variable a tu archivo .env:`);
    console.log(`SQS_PUSH_QUEUE_URL=${queueUrl}`);
    console.log(`SQS_PUSH_QUEUE_NAME=${queueName}`);

    // Obtener atributos de la cola
    try {
      const attributesCommand = new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ['All']
      });
      const attributes = await sqsClient.send(attributesCommand);
      console.log(`\n📊 Atributos de la cola:`);
      console.log(`   - Visibility Timeout: ${attributes.Attributes.VisibilityTimeout} segundos`);
      console.log(`   - Message Retention: ${attributes.Attributes.MessageRetentionPeriod} segundos`);
      console.log(`   - Long Polling: ${attributes.Attributes.ReceiveMessageWaitTimeSeconds} segundos`);
    } catch (error) {
      console.warn('⚠️  No se pudieron obtener los atributos de la cola:', error.message);
    }

  } catch (error) {
    if (error.name === 'QueueAlreadyExists') {
      console.error(`❌ La cola ${process.env.SQS_PUSH_QUEUE_NAME || 'push-notifications-queue'} ya existe`);
      console.log(`💡 Si necesitas la URL, búscala en la consola de AWS SQS`);
    } else {
      console.error('❌ Error creando cola:', error.message);
      if (error.message.includes('credentials')) {
        console.error('💡 Verifica que AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY estén configurados en .env');
      }
    }
    process.exit(1);
  }
}

createPushQueue();

