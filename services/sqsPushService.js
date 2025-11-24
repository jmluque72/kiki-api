const { SendMessageCommand } = require('@aws-sdk/client-sqs');
const { sqsClient, PUSH_QUEUE_URL } = require('../config/sqs.config');

/**
 * Envía un mensaje a la cola SQS para procesamiento asíncrono de push notification
 * @param {string} pushType - Tipo de push a enviar (ej: 'sendNotification', 'sendTestNotification')
 * @param {object} pushData - Datos del push (deviceToken, platform, notification, etc.)
 * @returns {Promise<object>} Resultado del envío a SQS
 */
async function sendPushToQueue(pushType, pushData) {
  try {
    if (!PUSH_QUEUE_URL) {
      console.error('❌ [SQS PUSH] SQS_PUSH_QUEUE_URL no está configurada');
      throw new Error('SQS_PUSH_QUEUE_URL no está configurada en las variables de entorno');
    }

    const messageBody = {
      pushType,
      pushData,
      timestamp: new Date().toISOString()
    };

    const command = new SendMessageCommand({
      QueueUrl: PUSH_QUEUE_URL,
      MessageBody: JSON.stringify(messageBody),
      MessageAttributes: {
        PushType: {
          DataType: 'String',
          StringValue: pushType
        },
        Platform: {
          DataType: 'String',
          StringValue: pushData.platform || 'unknown'
        },
        DeviceToken: {
          DataType: 'String',
          StringValue: pushData.deviceToken ? pushData.deviceToken.substring(0, 50) : 'unknown'
        }
      }
    });

    const result = await sqsClient.send(command);
    console.log(`✅ [SQS PUSH] Mensaje enviado a cola SQS - Tipo: ${pushType}, MessageId: ${result.MessageId}`);
    
    return {
      success: true,
      messageId: result.MessageId,
      queueUrl: PUSH_QUEUE_URL
    };
  } catch (error) {
    console.error('❌ [SQS PUSH] Error enviando mensaje a SQS:', error.message);
    // No lanzar el error para no bloquear el flujo principal
    // Solo loguear el error
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Funciones helper para enviar tipos específicos de push a SQS
 */

/**
 * Envía una notificación push a un dispositivo específico
 */
async function sendNotificationToQueue(deviceToken, platform, notification) {
  return await sendPushToQueue('sendNotification', {
    deviceToken,
    platform,
    notification
  });
}

/**
 * Envía una notificación push de prueba
 */
async function sendTestNotificationToQueue(deviceToken, platform, notification) {
  return await sendPushToQueue('sendTestNotification', {
    deviceToken,
    platform,
    notification
  });
}

/**
 * Envía notificaciones push a múltiples dispositivos
 */
async function sendBulkNotificationsToQueue(devices, notification) {
  const results = [];
  for (const device of devices) {
    const result = await sendPushToQueue('sendNotification', {
      deviceToken: device.pushToken || device.token,
      platform: device.platform,
      notification
    });
    results.push({ device: device._id || device.id, result });
  }
  return results;
}

/**
 * Envía notificaciones push a la familia de un estudiante
 */
async function sendPushToStudentFamilyToQueue(studentId, notification) {
  return await sendPushToQueue('sendPushToStudentFamily', {
    studentId,
    notification
  });
}

module.exports = {
  sendPushToQueue,
  sendNotificationToQueue,
  sendTestNotificationToQueue,
  sendBulkNotificationsToQueue,
  sendPushToStudentFamilyToQueue
};

