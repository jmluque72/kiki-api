const apn = require('apn');
const https = require('https');

class PushNotificationService {
  constructor() {
    // Configuración para iOS (APNs)
    this.iosOptions = {
      token: {
        key: process.env.APNS_KEY_PATH || "path/to/AuthKey_XXXXXXXXXX.p8",
        keyId: process.env.APNS_KEY_ID || "XXXXXXXXXX",
        teamId: process.env.APNS_TEAM_ID || "XXXXXXXXXX"
      },
      production: process.env.NODE_ENV === 'production'
    };
    
    this.apnProvider = new apn.Provider(this.iosOptions);
    
    // Configuración para Android (FCM HTTP/1 API)
    this.androidServerKey = process.env.FCM_SERVER_KEY || "YOUR_FCM_SERVER_KEY";
  }

  /**
   * Enviar notificación push a un dispositivo específico
   * @param {string} deviceToken - Token del dispositivo
   * @param {string} platform - 'ios' o 'android'
   * @param {Object} notification - Datos de la notificación
   */
  async sendNotification(deviceToken, platform, notification) {
    try {
      if (platform === 'ios') {
        return await this.sendIOSNotification(deviceToken, notification);
      } else if (platform === 'android') {
        return await this.sendAndroidNotification(deviceToken, notification);
      } else {
        throw new Error(`Plataforma no soportada: ${platform}`);
      }
    } catch (error) {
      console.error('Error enviando notificación push:', error);
      throw error;
    }
  }

  /**
   * Enviar notificación a iOS usando APNs
   */
  async sendIOSNotification(deviceToken, notification) {
    const apnNotification = new apn.Notification();
    
    apnNotification.alert = {
      title: notification.title,
      body: notification.message
    };
    
    apnNotification.badge = notification.badge || 1;
    apnNotification.sound = notification.sound || "default";
    apnNotification.payload = notification.data || {};
    apnNotification.topic = process.env.APNS_BUNDLE_ID || "com.kiki.app";
    
    // Enviar notificación
    const result = await this.apnProvider.send(apnNotification, deviceToken);
    
    if (result.failed && result.failed.length > 0) {
      console.error('Error enviando notificación iOS:', result.failed);
      throw new Error(`Error enviando notificación iOS: ${result.failed[0].error}`);
    }
    
    console.log('✅ Notificación iOS enviada exitosamente');
    return result;
  }

  /**
   * Enviar notificación a Android usando FCM HTTP/1 API
   */
  async sendAndroidNotification(deviceToken, notification) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        to: deviceToken,
        notification: {
          title: notification.title,
          body: notification.message,
          icon: "ic_notification",
          sound: "default"
        },
        data: notification.data || {},
        priority: "high"
      });

      const options = {
        hostname: 'fcm.googleapis.com',
        port: 443,
        path: '/fcm/send',
        method: 'POST',
        headers: {
          'Authorization': `key=${this.androidServerKey}`,
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log('✅ Notificación Android enviada exitosamente');
            resolve(JSON.parse(responseData));
          } else {
            console.error('Error enviando notificación Android:', responseData);
            reject(new Error(`Error enviando notificación Android: ${res.statusCode}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error('Error de conexión FCM:', error);
        reject(error);
      });

      req.write(data);
      req.end();
    });
  }

  /**
   * Enviar notificación a múltiples dispositivos
   */
  async sendBulkNotifications(devices, notification) {
    const results = [];
    
    for (const device of devices) {
      try {
        const result = await this.sendNotification(
          device.token, 
          device.platform, 
          notification
        );
        results.push({ device: device._id, success: true, result });
      } catch (error) {
        results.push({ device: device._id, success: false, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Enviar notificación basada en una notificación de la base de datos
   */
  async sendNotificationFromDB(notificationId) {
    try {
      // Aquí deberías obtener la notificación de tu base de datos
      // const notification = await Notification.findById(notificationId);
      // const recipients = await getRecipientsWithTokens(notification.recipients);
      
      // Por ahora, ejemplo con datos mock
      const notification = {
        title: "Nueva notificación",
        message: "Tienes una nueva notificación",
        data: { notificationId }
      };
      
      // Obtener tokens de dispositivos de los destinatarios
      const devices = await this.getDevicesForRecipients(notification.recipients);
      
      // Enviar a todos los dispositivos
      return await this.sendBulkNotifications(devices, notification);
      
    } catch (error) {
      console.error('Error enviando notificación desde DB:', error);
      throw error;
    }
  }

  /**
   * Obtener dispositivos (tokens) para los destinatarios
   */
  async getDevicesForRecipients(recipients) {
    // Aquí deberías consultar tu base de datos para obtener los tokens
    // de los dispositivos de los usuarios destinatarios
    
    // Ejemplo de implementación:
    // const devices = await Device.find({ 
    //   userId: { $in: recipients.map(r => r._id) },
    //   pushToken: { $exists: true, $ne: null }
    // });
    
    // Por ahora, retornamos un array vacío
    return [];
  }
}

module.exports = new PushNotificationService();
