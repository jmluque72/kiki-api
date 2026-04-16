require('dotenv').config();
const mongoose = require('mongoose');
const { ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { sqsClient, PUSH_QUEUE_URL } = require('../config/sqs.config');
const config = require('../config/database');

// Importar servicio de push notifications
let pushNotificationService;
try {
  // Asegurar que dotenv esté cargado antes de requerir el servicio
  require('dotenv').config();
  
  pushNotificationService = require('../pushNotificationService');
  
  // Verificar que el servicio esté inicializado correctamente
  if (pushNotificationService) {
    console.log('🔔 [PUSH WORKER] Servicio de push cargado');
    console.log(`   APNs configurado: ${pushNotificationService.apnProvider || pushNotificationService.defaultApnProvider ? '✅' : '❌'}`);
    console.log(`   FCM configurado: ${pushNotificationService.fcmInitialized ? '✅' : '❌'}`);
    
    // Verificar variables de entorno
    console.log(`   APNS_KEY_PATH: ${process.env.APNS_KEY_PATH ? '✅' : '❌'}`);
    console.log(`   APNS_KEY_ID: ${process.env.APNS_KEY_ID ? '✅' : '❌'}`);
    console.log(`   APNS_TEAM_ID: ${process.env.APNS_TEAM_ID ? '✅' : '❌'}`);
  }
} catch (error) {
  console.warn('⚠️ [PUSH WORKER] pushNotificationService no disponible:', error.message);
  pushNotificationService = null;
}

const PushError = require('../shared/models/PushError');
const Device = require('../shared/models/Device');
const Shared = require('../shared/models/Shared');
const PushNotification = require('../shared/models/PushNotification');

// Configuración del worker
const POLL_INTERVAL = 5000; // 5 segundos entre polls
const MAX_MESSAGES = 10; // Máximo de mensajes a recibir por vez
const VISIBILITY_TIMEOUT = 300; // 5 minutos de visibilidad

/**
 * Obtiene usuarios familiares de un estudiante con dispositivos activos
 */
async function getFamilyUsersForStudent(studentId) {
  try {
    const Role = require('../shared/models/Role');
    
    // Primero obtener los IDs de los roles familyadmin y familyviewer
    const familyAdminRole = await Role.findOne({ nombre: 'familyadmin' });
    const familyViewerRole = await Role.findOne({ nombre: 'familyviewer' });
    
    const roleIds = [];
    if (familyAdminRole) roleIds.push(familyAdminRole._id);
    if (familyViewerRole) roleIds.push(familyViewerRole._id);
    
    console.log('🔔 [PUSH WORKER] Buscando familiares para estudiante:', studentId);
    console.log('🔔 [PUSH WORKER] Role IDs buscados:', roleIds);
    
    if (roleIds.length === 0) {
      console.warn('⚠️ [PUSH WORKER] No se encontraron roles familyadmin o familyviewer');
      return [];
    }
    
    // Buscar asociaciones activas del estudiante con roles familyadmin y familyviewer
    const associations = await Shared.find({
      student: studentId,
      status: 'active',
      role: { $in: roleIds }
    }).populate('user', 'name email').populate('role', 'nombre');
    
    console.log('🔔 [PUSH WORKER] Asociaciones encontradas:', associations.length);
    
    const familyUsers = [];
    
    for (const association of associations) {
      if (association.user && association.role) {
        console.log(`🔔 [PUSH WORKER] Procesando asociación - Usuario: ${association.user.name}, Rol: ${association.role.nombre}`);
        
        const devices = await Device.find({
          userId: association.user._id,
          isActive: true,
          pushToken: { $exists: true, $ne: null, $ne: '' }
        });
        
        console.log(`🔔 [PUSH WORKER] Usuario ${association.user.name} tiene ${devices.length} dispositivos activos`);
        
        if (devices.length > 0) {
          familyUsers.push({
            user: association.user,
            role: association.role,
            devices: devices
          });
          console.log('🔔 [PUSH WORKER] ✅ Usuario con dispositivos:', association.user.name, '- Dispositivos:', devices.length);
        } else {
          console.log('🔔 [PUSH WORKER] ⚠️ Usuario sin dispositivos activos:', association.user.name);
        }
      } else {
        console.log('🔔 [PUSH WORKER] ⚠️ Asociación sin usuario o rol válido');
      }
    }
    
    console.log('🔔 [PUSH WORKER] Total usuarios familiares con dispositivos:', familyUsers.length);
    return familyUsers;
  } catch (error) {
    console.error('❌ [PUSH WORKER] Error obteniendo familiares:', error);
    return [];
  }
}

/**
 * Mapa de tipos de push a funciones
 */
const pushHandlers = {
  sendNotification: async (pushData) => {
    if (!pushNotificationService) {
      throw new Error('Push notification service no disponible');
    }
    
    const { deviceToken, platform, notification } = pushData;
    
    if (!deviceToken || !platform) {
      throw new Error('deviceToken y platform son requeridos');
    }
    
    let result;
    let success = false;
    
    try {
      console.log(`🔔 [PUSH WORKER] Enviando push notification...`);
      console.log(`   Token completo recibido: ${deviceToken}`);
      console.log(`   Longitud del token: ${deviceToken?.length || 0}`);
      console.log(`   Token (primeros 20): ${deviceToken.substring(0, 20)}...`);
      console.log(`   Token (últimos 20): ...${deviceToken.substring(deviceToken.length - 20)}`);
      console.log(`   Plataforma: ${platform}`);
      console.log(`   Título: ${notification?.title || 'N/A'}`);
      console.log(`   Mensaje: ${notification?.message || 'N/A'}`);
      
      result = await pushNotificationService.sendNotification(
        deviceToken,
        platform,
        notification
      );
      
      // Imprimir resultado detallado
      if (platform === 'ios' && result) {
        console.log(`📊 [PUSH WORKER] Resultado APNs:`);
        console.log(`   - Enviados: ${result.sent?.length || 0}`);
        console.log(`   - Fallidos: ${result.failed?.length || 0}`);
        if (result.sent && result.sent.length > 0) {
          console.log(`   ✅ Push enviado exitosamente a iOS`);
        }
        if (result.failed && result.failed.length > 0) {
          console.log(`   ❌ Push falló para iOS`);
          result.failed.forEach((failed, index) => {
            console.log(`      Error ${index + 1}:`, failed.response || failed.error || 'Error desconocido');
          });
        }
      } else if (platform === 'android' && result) {
        console.log(`📊 [PUSH WORKER] Resultado FCM:`, result);
      }
      
      success = true;
    } catch (error) {
      // Si hay un notificationId, actualizar el estado de la notificación
      if (notification?.data?.notificationId) {
        try {
          const notifId = notification.data.notificationId;

          // Incrementar contador de fallidas y guardar detalle del error
          const updated = await PushNotification.findByIdAndUpdate(
            notifId,
            {
              $inc: { 'stats.failed': 1 },
              $push: {
                errors: {
                  deviceToken: deviceToken.substring(0, 20) + '...',
                  platform: platform,
                  error: error.message,
                  timestamp: new Date()
                }
              }
            },
            { new: true }
          );

          // Si ya procesamos todos los envíos (sent + failed == queued),
          // cerrar definitivamente el estado de la notificación
          if (updated) {
            const totalProcessed = (updated.stats.sent || 0) + (updated.stats.failed || 0);
            const queued = updated.stats.queued || 0;

            if (queued > 0 && totalProcessed >= queued) {
              if (updated.stats.failed > 0 && updated.stats.sent > 0) {
                updated.status = 'partial';
              } else if (updated.stats.failed > 0) {
                // Todos fallaron → dejar la notificación en error
                updated.status = 'failed';
              } else {
                updated.status = 'sent';
              }
              await updated.save();
            } else if (updated.status === 'pending') {
              // Asegurar que salga de "pending" cuando empezamos a procesar
              updated.status = 'processing';
              await updated.save();
            }
          }
        } catch (updateError) {
          console.warn('⚠️ [PUSH WORKER] No se pudo actualizar estado de notificación:', updateError.message);
        }
      }
      throw error;
    }
    
    // Actualizar último uso del dispositivo
    try {
      const device = await Device.findOne({ pushToken: deviceToken });
      if (device) {
        await device.updateLastUsed();
      }
    } catch (error) {
      console.warn('⚠️ [PUSH WORKER] No se pudo actualizar último uso del dispositivo:', error.message);
    }
    
    // Si hay un notificationId, actualizar el estado de la notificación
    if (success && notification?.data?.notificationId) {
      try {
        const updateResult = await PushNotification.findByIdAndUpdate(
          notification.data.notificationId,
          {
            $inc: { 'stats.sent': 1 },
            $set: { status: 'sent' }
          },
          { new: true }
        );
        
        // Verificar si todas las notificaciones fueron enviadas
        if (updateResult) {
          const totalProcessed = updateResult.stats.sent + updateResult.stats.failed;
          if (totalProcessed >= updateResult.stats.queued) {
            // Todas las notificaciones fueron procesadas
            if (updateResult.stats.failed > 0 && updateResult.stats.sent > 0) {
              updateResult.status = 'partial';
            } else if (updateResult.stats.failed > 0) {
              updateResult.status = 'failed';
            } else {
              updateResult.status = 'sent';
            }
            await updateResult.save();
          }
        }
      } catch (updateError) {
        console.warn('⚠️ [PUSH WORKER] No se pudo actualizar estado de notificación:', updateError.message);
      }
    }
    
    return result;
  },
  
  sendTestNotification: async (pushData) => {
    return await pushHandlers.sendNotification(pushData);
  },
  
  sendPushToStudentFamily: async (pushData) => {
    if (!pushNotificationService) {
      throw new Error('Push notification service no disponible');
    }
    
    const { studentId, notification } = pushData;
    
    if (!studentId) {
      throw new Error('studentId es requerido');
    }
    
    const familyUsers = await getFamilyUsersForStudent(studentId);
    
    if (familyUsers.length === 0) {
      console.log('🔔 [PUSH WORKER] No se encontraron usuarios familiares con dispositivos');
      return { sent: 0, failed: 0 };
    }
    
    let sent = 0;
    let failed = 0;
    
    for (const familyUser of familyUsers) {
      for (const device of familyUser.devices) {
        try {
          console.log(`🔔 [PUSH WORKER] Token desde DB para usuario ${familyUser.user.name}:`);
          console.log(`   Token completo: ${device.pushToken}`);
          console.log(`   Longitud: ${device.pushToken?.length || 0}`);
          console.log(`   Plataforma: ${device.platform}`);
          
          await pushNotificationService.sendNotification(
            device.pushToken,
            device.platform,
            notification
          );
          
          await device.updateLastUsed();
          sent++;
          console.log(`✅ [PUSH WORKER] Enviado a: ${familyUser.user.name} - ${device.platform}`);
          
        } catch (error) {
          failed++;
          console.error(`❌ [PUSH WORKER] Error enviando a: ${familyUser.user.name} - ${error.message}`);
          
          // Si el token es inválido, desactivar el dispositivo
          if (error.message.includes('InvalidRegistration') || 
              error.message.includes('NotRegistered') ||
              error.message.includes('BadDeviceToken') ||
              error.message.includes('Unregistered') ||
              error.message.includes('TopicDisallowed')) {
            await device.deactivate();
            console.log('🔔 [PUSH WORKER] Dispositivo desactivado por token inválido');
          }
        }
      }
    }
    
    return { sent, failed };
  }
};

/**
 * Procesa un mensaje de push desde SQS
 */
async function processPushMessage(message) {
  try {
    const messageBody = JSON.parse(message.Body);
    const { pushType, pushData } = messageBody;

    if (!pushType || !pushHandlers[pushType]) {
      throw new Error(`Tipo de push desconocido: ${pushType}`);
    }

    console.log(`🔔 [PUSH WORKER] Procesando push tipo: ${pushType}`);
    if (pushData.deviceToken) {
      console.log(`🔔 [PUSH WORKER] Token: ${pushData.deviceToken.substring(0, 20)}...`);
    }
    if (pushData.platform) {
      console.log(`🔔 [PUSH WORKER] Plataforma: ${pushData.platform}`);
    }

    // Ejecutar la función de push correspondiente
    const handler = pushHandlers[pushType];
    const result = await handler(pushData);

    console.log(`✅ [PUSH WORKER] Push enviado exitosamente - Tipo: ${pushType}`);
    return { success: true, result };
  } catch (error) {
    console.error(`❌ [PUSH WORKER] Error procesando push:`, error);
    throw error;
  }
}

/**
 * Guarda un error de push en MongoDB
 */
async function savePushError(message, error) {
  try {
    const messageBody = JSON.parse(message.Body);
    const { pushType, pushData } = messageBody;

    const pushError = new PushError({
      pushType,
      deviceToken: pushData.deviceToken || null,
      platform: pushData.platform || null,
      pushData,
      error: error.message,
      errorDetails: {
        stack: error.stack,
        name: error.name
      },
      sqsMessageId: message.MessageId,
      processedAt: new Date()
    });

    await pushError.save();
    console.log(`💾 [PUSH WORKER] Error guardado en MongoDB - ID: ${pushError._id}`);
  } catch (saveError) {
    console.error(`❌ [PUSH WORKER] Error guardando error en MongoDB:`, saveError);
  }
}

/**
 * Elimina un mensaje de la cola SQS
 */
async function deleteMessage(receiptHandle) {
  try {
    const command = new DeleteMessageCommand({
      QueueUrl: PUSH_QUEUE_URL,
      ReceiptHandle: receiptHandle
    });
    await sqsClient.send(command);
    console.log(`🗑️ [PUSH WORKER] Mensaje eliminado de SQS`);
  } catch (error) {
    console.error(`❌ [PUSH WORKER] Error eliminando mensaje de SQS:`, error);
  }
}

/**
 * Recibe y procesa mensajes de la cola SQS
 */
async function receiveAndProcessMessages() {
  try {
    if (!PUSH_QUEUE_URL) {
      console.error('❌ [PUSH WORKER] SQS_PUSH_QUEUE_URL no está configurada');
      return;
    }

    const command = new ReceiveMessageCommand({
      QueueUrl: PUSH_QUEUE_URL,
      MaxNumberOfMessages: MAX_MESSAGES,
      VisibilityTimeout: VISIBILITY_TIMEOUT,
      WaitTimeSeconds: 20 // Long polling
    });

    const response = await sqsClient.send(command);

    if (!response.Messages || response.Messages.length === 0) {
      return; // No hay mensajes
    }

    console.log(`📬 [PUSH WORKER] Recibidos ${response.Messages.length} mensaje(s)`);

    // Procesar cada mensaje
    for (const message of response.Messages) {
      try {
        await processPushMessage(message);
        // Si el procesamiento fue exitoso, eliminar el mensaje de la cola
        await deleteMessage(message.ReceiptHandle);
      } catch (error) {
        // Si hay error, guardar en MongoDB y eliminar de SQS para evitar reprocesamiento infinito
        await savePushError(message, error);
        await deleteMessage(message.ReceiptHandle);
      }
    }
  } catch (error) {
    console.error(`❌ [PUSH WORKER] Error recibiendo mensajes de SQS:`, error);
  }
}

/**
 * Inicia el worker de push notifications
 * @param {boolean} standalone - Si es true, conecta a MongoDB. Si es false, usa la conexión existente.
 */
async function startPushWorker(standalone = false) {
  try {
    // Si se ejecuta como proceso standalone, conectar a MongoDB
    // Si se ejecuta integrado, usar la conexión existente de mongoose
    if (standalone) {
      await mongoose.connect(config.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      console.log('✅ [PUSH WORKER] Conectado a MongoDB');
    } else {
      // Verificar si ya hay una conexión activa
      if (mongoose.connection.readyState === 0) {
        // No hay conexión, conectar
        await mongoose.connect(config.MONGODB_URI, {
          useNewUrlParser: true,
          useUnifiedTopology: true
        });
        console.log('✅ [PUSH WORKER] Conectado a MongoDB');
      } else {
        console.log('✅ [PUSH WORKER] Usando conexión MongoDB existente');
      }
    }

    console.log('🚀 [PUSH WORKER] Iniciando worker de push notifications...');
    console.log(`📋 [PUSH WORKER] Cola SQS: ${PUSH_QUEUE_URL || 'NO CONFIGURADA'}`);

    if (!PUSH_QUEUE_URL) {
      console.warn('⚠️  [PUSH WORKER] SQS_PUSH_QUEUE_URL no está configurada. El worker no procesará mensajes.');
      return;
    }

    // Iniciar polling continuo
    const poll = async () => {
      await receiveAndProcessMessages();
      setTimeout(poll, POLL_INTERVAL);
    };

    poll();
  } catch (error) {
    console.error('❌ [PUSH WORKER] Error iniciando worker:', error);
    if (standalone) {
      process.exit(1);
    }
    // Si está integrado, no hacer exit para no cerrar el servidor principal
  }
}

// Manejar cierre graceful (solo si se ejecuta como proceso standalone)
if (require.main === module) {
  process.on('SIGINT', async () => {
    console.log('\n🛑 [PUSH WORKER] Cerrando worker...');
    await mongoose.connection.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 [PUSH WORKER] Cerrando worker...');
    await mongoose.connection.close();
    process.exit(0);
  });
}

// Iniciar el worker si se ejecuta directamente (modo standalone)
if (require.main === module) {
  startPushWorker(true); // true = standalone mode, conecta a MongoDB
}

// También exportar startPushWorker para que pueda ser llamado desde simple-server.js
module.exports = {
  startPushWorker,
  receiveAndProcessMessages,
  processPushMessage
};

