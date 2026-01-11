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
    
    // Log detallado del token recibido
    console.log('📋 [PUSH REGISTER] Token recibido del cliente:');
    console.log(`   Token completo: ${token}`);
    console.log(`   Longitud: ${token?.length || 0}`);
    console.log(`   Tipo: ${typeof token}`);
    console.log(`   Plataforma: ${platform}`);
    console.log(`   Usuario ID: ${userId}`);

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

    // Limpiar el token (eliminar espacios en blanco, saltos de línea, etc.)
    const cleanToken = token.trim().replace(/\s+/g, '');
    console.log(`📋 [PUSH REGISTER] Token limpiado: ${cleanToken}`);
    console.log(`   Longitud después de limpiar: ${cleanToken.length}`);

    // IMPORTANTE: Buscar primero si hay un dispositivo existente para este usuario
    // Si existe, actualizar el token en lugar de crear uno nuevo
    const existingDevice = await Device.findOne({ userId: userId, isActive: true });
    
    let device;
    
    if (existingDevice) {
      console.log(`📋 [PUSH REGISTER] Dispositivo existente encontrado para el usuario:`);
      console.log(`   Device ID: ${existingDevice._id}`);
      console.log(`   Token actual en DB: ${existingDevice.pushToken}`);
      console.log(`   Token nuevo recibido: ${cleanToken}`);
      
      if (existingDevice.pushToken !== cleanToken) {
        console.log(`⚠️ [PUSH REGISTER] El token ha cambiado! Actualizando dispositivo existente...`);
        
        // Si hay otro dispositivo con el token nuevo (de otro usuario), desactivarlo primero
        // para evitar conflictos con el índice único
        await Device.updateMany(
          { pushToken: cleanToken, userId: { $ne: userId } },
          { $set: { isActive: false } }
        );
      }
      
      // Actualizar el dispositivo existente con el nuevo token
      existingDevice.pushToken = cleanToken;
      existingDevice.platform = platform;
      existingDevice.deviceId = deviceId || existingDevice.deviceId;
      existingDevice.appVersion = appVersion || existingDevice.appVersion;
      existingDevice.osVersion = osVersion || existingDevice.osVersion;
      existingDevice.isActive = true;
      existingDevice.lastUsed = new Date();
      
      await existingDevice.save();
      device = existingDevice;
      
      console.log(`✅ [PUSH REGISTER] Dispositivo actualizado con nuevo token`);
    } else {
      console.log(`📋 [PUSH REGISTER] No hay dispositivo existente para el usuario, creando uno nuevo...`);
      
      // Si hay otro dispositivo con el token nuevo (de otro usuario), desactivarlo primero
      await Device.updateMany(
        { pushToken: cleanToken, userId: { $ne: userId } },
        { $set: { isActive: false } }
      );
      
      // Crear nuevo dispositivo
      device = await Device.create({
        userId: userId,
        pushToken: cleanToken,
        platform: platform,
        deviceId: deviceId || null,
        appVersion: appVersion || null,
        osVersion: osVersion || null,
        isActive: true,
        lastUsed: new Date()
      });
      
      console.log(`✅ [PUSH REGISTER] Nuevo dispositivo creado`);
    }
    
    // Asegurarse de que solo este dispositivo esté activo para el usuario
    await Device.updateMany(
      { userId: userId, _id: { $ne: device._id }, isActive: true },
      { $set: { isActive: false } }
    );
    
    console.log(`📋 [PUSH REGISTER] Verificado: solo este dispositivo está activo para el usuario`);

    // Log del token guardado en la DB
    console.log('📋 [PUSH REGISTER] Token guardado en la DB:');
    console.log(`   Token completo: ${device.pushToken}`);
    console.log(`   Longitud: ${device.pushToken?.length || 0}`);
    console.log(`   Device ID: ${device._id}`);
    
    // Verificar si coinciden
    if (cleanToken !== device.pushToken) {
      console.error('❌ [PUSH REGISTER] ERROR: El token limpiado no coincide con el guardado en DB!');
      console.error(`   Token limpiado: ${cleanToken}`);
      console.error(`   Token en DB: ${device.pushToken}`);
    } else {
      console.log('✅ [PUSH REGISTER] Token coincide correctamente');
    }

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

