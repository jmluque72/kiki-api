const mongoose = require('mongoose');
require('dotenv').config();
const config = require('../config/database');
const { ReceiveMessageCommand, GetQueueAttributesCommand } = require('@aws-sdk/client-sqs');
const { sqsClient, PUSH_QUEUE_URL } = require('../config/sqs.config');
const PushError = require('../shared/models/PushError');

async function checkPushQueue() {
  try {
    console.log('🔍 Conectando a MongoDB...');
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Conectado a MongoDB\n');

    // Verificar configuración de SQS
    console.log('📋 ========== CONFIGURACIÓN SQS ==========');
    console.log(`PUSH_QUEUE_URL: ${PUSH_QUEUE_URL || '❌ NO CONFIGURADA'}\n`);

    if (!PUSH_QUEUE_URL) {
      console.log('❌ SQS_PUSH_QUEUE_URL no está configurada');
      process.exit(1);
    }

    // Verificar atributos de la cola
    try {
      const attributesCommand = new GetQueueAttributesCommand({
        QueueUrl: PUSH_QUEUE_URL,
        AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible']
      });
      const attributes = await sqsClient.send(attributesCommand);
      console.log('📊 ========== ESTADO DE LA COLA ==========');
      console.log(`Mensajes visibles: ${attributes.Attributes?.ApproximateNumberOfMessages || 0}`);
      console.log(`Mensajes en procesamiento: ${attributes.Attributes?.ApproximateNumberOfMessagesNotVisible || 0}\n`);
    } catch (error) {
      console.error('❌ Error obteniendo atributos de la cola:', error.message);
    }

    // Intentar recibir mensajes (sin procesarlos)
    try {
      const receiveCommand = new ReceiveMessageCommand({
        QueueUrl: PUSH_QUEUE_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 2 // Short polling
      });
      const response = await sqsClient.send(receiveCommand);
      
      if (response.Messages && response.Messages.length > 0) {
        console.log(`📬 Mensajes pendientes en la cola: ${response.Messages.length}`);
        response.Messages.forEach((msg, index) => {
          try {
            const body = JSON.parse(msg.Body);
            console.log(`\n  Mensaje ${index + 1}:`);
            console.log(`    Tipo: ${body.pushType}`);
            console.log(`    Timestamp: ${body.timestamp}`);
            if (body.pushData?.deviceToken) {
              console.log(`    Token: ${body.pushData.deviceToken.substring(0, 20)}...`);
            }
            if (body.pushData?.platform) {
              console.log(`    Plataforma: ${body.pushData.platform}`);
            }
          } catch (e) {
            console.log(`    Error parseando mensaje: ${e.message}`);
          }
        });
      } else {
        console.log('✅ No hay mensajes pendientes en la cola');
      }
    } catch (error) {
      console.error('❌ Error recibiendo mensajes:', error.message);
    }

    // Verificar errores recientes
    console.log('\n❌ ========== ERRORES RECIENTES ==========');
    const recentErrors = await PushError.find()
      .sort({ createdAt: -1 })
      .limit(5);
    
    if (recentErrors.length > 0) {
      console.log(`Encontrados ${recentErrors.length} errores recientes:\n`);
      recentErrors.forEach((error, index) => {
        console.log(`  Error ${index + 1}:`);
        console.log(`    Fecha: ${error.createdAt}`);
        console.log(`    Tipo: ${error.pushType || 'N/A'}`);
        console.log(`    Error: ${error.error || 'N/A'}`);
        if (error.messageBody) {
          try {
            const body = JSON.parse(error.messageBody);
            if (body.pushData?.deviceToken) {
              console.log(`    Token: ${body.pushData.deviceToken.substring(0, 20)}...`);
            }
          } catch (e) {
            // Ignorar error de parseo
          }
        }
        console.log('');
      });
    } else {
      console.log('✅ No hay errores recientes registrados');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkPushQueue();
