const Device = require('../shared/models/Device');
const logger = require('../utils/logger');
const { sendTestNotificationToQueue, sendNotificationToQueue } = require('../services/sqsPushService');

/**
 * Registrar token de dispositivo para push notifications
 */
async function registerToken(req, res) {
  try {
    const { token, platform, deviceId, appVersion, osVersion } = req.body;
    const userId = req.user.userId;

    logger.info('🔔 [PUSH REGISTER] Registrando token para usuario:', userId);

    // Validar campos requeridos
    if (!token || !platform) {
      return res.status(400).json({
        success: false,
        message: 'Token y platform son requeridos'
      });
    }

    // Validar plataforma
    if (!['ios', 'android'].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: 'Platform debe ser "ios" o "android"'
      });
    }

    // Buscar o crear dispositivo
    const device = await Device.findOneAndUpdate(
      { 
        userId: userId,
        pushToken: token 
      },
      {
        userId: userId,
        pushToken: token,
        platform: platform,
        deviceId: deviceId || null,
        appVersion: appVersion || null,
        osVersion: osVersion || null,
        isActive: true,
        lastUsed: new Date()
      },
      { 
        upsert: true, 
        new: true 
      }
    );

    logger.info('🔔 [PUSH REGISTER] Token registrado exitosamente:', device._id);

    res.json({
      success: true,
      message: 'Token registrado exitosamente',
      data: {
        deviceId: device._id,
        platform: device.platform,
        isActive: device.isActive
      }
    });

  } catch (error) {
    logger.error('❌ [PUSH REGISTER] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registrando token de dispositivo'
    });
  }
}

/**
 * Desregistrar token de dispositivo
 */
async function unregisterToken(req, res) {
  try {
    const { token } = req.body;
    const userId = req.user.userId;

    logger.info('🔔 [PUSH UNREGISTER] Desregistrando token para usuario:', userId);

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token es requerido'
      });
    }

    // Desactivar dispositivo
    const device = await Device.findOneAndUpdate(
      { 
        userId: userId,
        pushToken: token 
      },
      { 
        isActive: false,
        lastUsed: new Date()
      },
      { new: true }
    );

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Token no encontrado'
      });
    }

    logger.info('🔔 [PUSH UNREGISTER] Token desregistrado exitosamente');

    res.json({
      success: true,
      message: 'Token desregistrado exitosamente'
    });

  } catch (error) {
    logger.error('❌ [PUSH UNREGISTER] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error desregistrando token de dispositivo'
    });
  }
}

/**
 * Enviar push notification de prueba al dispositivo del usuario autenticado
 */
async function sendTestNotification(req, res) {
  try {
    const userId = req.user.userId;
    const { title, message } = req.body;

    logger.info('🔔 [PUSH TEST] Enviando push de prueba para usuario:', userId);

    // Obtener dispositivos activos del usuario
    const devices = await Device.find({
      userId: userId,
      isActive: true
    });

    if (devices.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron dispositivos activos para este usuario'
      });
    }

    logger.info(`🔔 [PUSH TEST] Encontrados ${devices.length} dispositivo(s) activo(s)`);

    const notification = {
      title: title || '🔔 Notificación de Prueba',
      message: message || 'Esta es una notificación push de prueba desde el servidor',
      data: {
        type: 'test',
        timestamp: new Date().toISOString(),
        userId: userId.toString()
      },
      badge: 1,
      sound: 'default'
    };

    // Enviar a cada dispositivo activo usando SQS
    const results = [];
    for (const device of devices) {
      try {
        logger.info(`🔔 [PUSH TEST] Enviando a cola SQS para dispositivo ${device._id} (${device.platform}): ${device.pushToken.substring(0, 20)}...`);
        
        const sqsResult = await sendTestNotificationToQueue(
          device.pushToken,
          device.platform,
          notification
        );

        if (sqsResult.success) {
          results.push({
            deviceId: device._id,
            platform: device.platform,
            status: 'queued',
            message: 'Push notification enviado a cola SQS',
            messageId: sqsResult.messageId
          });
          logger.info(`✅ [PUSH TEST] Push enviado a cola SQS para dispositivo ${device._id} (${device.platform})`);
        } else {
          results.push({
            deviceId: device._id,
            platform: device.platform,
            status: 'error',
            error: sqsResult.error || 'Error enviando a cola SQS'
          });
          logger.error(`❌ [PUSH TEST] Error enviando a cola SQS para dispositivo ${device._id}:`, sqsResult.error);
        }
      } catch (error) {
        logger.error(`❌ [PUSH TEST] Error enviando a dispositivo ${device._id}:`, error.message);
        results.push({
          deviceId: device._id,
          platform: device.platform,
          status: 'error',
          error: error.message
        });
      }
    }

    const queuedCount = results.filter(r => r.status === 'queued').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    logger.info(`🔔 [PUSH TEST] Resumen: ${queuedCount} en cola, ${errorCount} errores`);

    res.json({
      success: queuedCount > 0,
      message: `Push notifications enviados a cola: ${queuedCount} exitosos, ${errorCount} fallidos`,
      results: results,
      summary: {
        total: devices.length,
        queued: queuedCount,
        failed: errorCount
      }
    });

  } catch (error) {
    logger.error('❌ [PUSH TEST] Error general:', error);
    res.status(500).json({
      success: false,
      message: 'Error enviando push notification de prueba',
      error: error.message
    });
  }
}

module.exports = {
  registerToken,
  unregisterToken,
  sendTestNotification
};

