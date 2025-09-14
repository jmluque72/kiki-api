const express = require('express');
const router = express.Router();
const pushNotificationService = require('./pushNotificationService');

/**
 * POST /api/notifications/register-push-token
 * Registrar token de dispositivo para notificaciones push
 */
router.post('/register-push-token', async (req, res) => {
  try {
    const { token, userId, platform } = req.body;
    
    if (!token || !userId || !platform) {
      return res.status(400).json({
        success: false,
        message: 'Token, userId y platform son requeridos'
      });
    }

    // Aquí deberías guardar el token en tu base de datos
    // Ejemplo:
    // await Device.findOneAndUpdate(
    //   { userId, platform },
    //   { 
    //     userId, 
    //     platform, 
    //     pushToken: token,
    //     lastUpdated: new Date()
    //   },
    //   { upsert: true, new: true }
    // );

    console.log(`🔔 Token registrado para usuario ${userId} en ${platform}: ${token}`);

    res.json({
      success: true,
      message: 'Token registrado exitosamente',
      data: { token, userId, platform }
    });

  } catch (error) {
    console.error('Error registrando token push:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

/**
 * POST /api/notifications/unregister-push-token
 * Desregistrar token de dispositivo
 */
router.post('/unregister-push-token', async (req, res) => {
  try {
    const { token, userId } = req.body;
    
    if (!token || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Token y userId son requeridos'
      });
    }

    // Aquí deberías eliminar el token de tu base de datos
    // Ejemplo:
    // await Device.findOneAndDelete({ userId, pushToken: token });

    console.log(`🔔 Token desregistrado para usuario ${userId}: ${token}`);

    res.json({
      success: true,
      message: 'Token desregistrado exitosamente'
    });

  } catch (error) {
    console.error('Error desregistrando token push:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

/**
 * POST /api/notifications/:id/send-push
 * Enviar notificación push basada en una notificación de la DB
 */
router.post('/:id/send-push', async (req, res) => {
  try {
    const notificationId = req.params.id;
    
    // Enviar notificación push
    const results = await pushNotificationService.sendNotificationFromDB(notificationId);
    
    res.json({
      success: true,
      message: 'Notificaciones push enviadas',
      data: { results }
    });

  } catch (error) {
    console.error('Error enviando notificación push:', error);
    res.status(500).json({
      success: false,
      message: 'Error enviando notificaciones push'
    });
  }
});

/**
 * POST /api/notifications/send-test-push
 * Enviar notificación push de prueba
 */
router.post('/send-test-push', async (req, res) => {
  try {
    const { deviceToken, platform, title, message } = req.body;
    
    if (!deviceToken || !platform || !title || !message) {
      return res.status(400).json({
        success: false,
        message: 'deviceToken, platform, title y message son requeridos'
      });
    }

    const notification = {
      title,
      message,
      data: { type: 'test' }
    };

    const result = await pushNotificationService.sendNotification(
      deviceToken, 
      platform, 
      notification
    );
    
    res.json({
      success: true,
      message: 'Notificación de prueba enviada',
      data: { result }
    });

  } catch (error) {
    console.error('Error enviando notificación de prueba:', error);
    res.status(500).json({
      success: false,
      message: 'Error enviando notificación de prueba'
    });
  }
});

/**
 * POST /api/notifications/send-bulk-push
 * Enviar notificación push a múltiples dispositivos
 */
router.post('/send-bulk-push', async (req, res) => {
  try {
    const { devices, notification } = req.body;
    
    if (!devices || !Array.isArray(devices) || !notification) {
      return res.status(400).json({
        success: false,
        message: 'devices (array) y notification son requeridos'
      });
    }

    const results = await pushNotificationService.sendBulkNotifications(devices, notification);
    
    res.json({
      success: true,
      message: 'Notificaciones push enviadas',
      data: { results }
    });

  } catch (error) {
    console.error('Error enviando notificaciones bulk:', error);
    res.status(500).json({
      success: false,
      message: 'Error enviando notificaciones push'
    });
  }
});

module.exports = router;
