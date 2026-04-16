// Asegurar que dotenv esté cargado antes de inicializar
require('dotenv').config();

const apn = require('apn');
const https = require('https');
const admin = require('firebase-admin');

class PushNotificationService {
  constructor() {
    // Configuración para iOS (APNs)
    const apnsKeyPath = process.env.APNS_KEY_PATH;
    const apnsKeyId = process.env.APNS_KEY_ID;
    const apnsTeamId = process.env.APNS_TEAM_ID;
    
    if (apnsKeyPath && apnsKeyId && apnsTeamId) {
      // Determinar el entorno de APNs
      // Por defecto, usar producción si NODE_ENV es production
      // Pero permitir override con APNS_PRODUCTION explícitamente
      let apnsProduction = process.env.NODE_ENV === 'production';
      
      // Si APNS_PRODUCTION está definido, usar ese valor
      // IMPORTANTE: Verificar que la variable existe Y no es una cadena vacía
      if (process.env.APNS_PRODUCTION !== undefined && process.env.APNS_PRODUCTION !== '') {
        const apnsProdValue = process.env.APNS_PRODUCTION.toString().toLowerCase().trim();
        apnsProduction = apnsProdValue === 'true' || apnsProdValue === '1' || apnsProdValue === 'yes';
        console.log(`📋 [PUSH SERVICE] APNS_PRODUCTION encontrado: "${process.env.APNS_PRODUCTION}" -> ${apnsProduction}`);
      } else {
        console.log(`📋 [PUSH SERVICE] APNS_PRODUCTION no definido o vacío, usando NODE_ENV: ${process.env.NODE_ENV}`);
        console.log(`📋 [PUSH SERVICE] APNS_PRODUCTION valor: "${process.env.APNS_PRODUCTION}" (tipo: ${typeof process.env.APNS_PRODUCTION})`);
      }
      
      // Crear provider para producción
      this.iosOptionsProduction = {
        token: {
          key: apnsKeyPath,
          keyId: apnsKeyId,
          teamId: apnsTeamId
        },
        production: true
      };
      
      // Crear provider para sandbox
      this.iosOptionsSandbox = {
        token: {
          key: apnsKeyPath,
          keyId: apnsKeyId,
          teamId: apnsTeamId
        },
        production: false
      };
      
      console.log(`✅ [PUSH SERVICE] APNs configurado - Entorno por defecto: ${apnsProduction ? 'PRODUCTION' : 'SANDBOX'}`);
      console.log(`📋 [PUSH SERVICE] Variables APNs: KEY_PATH=${apnsKeyPath ? '✅' : '❌'}, KEY_ID=${apnsKeyId ? '✅' : '❌'}, TEAM_ID=${apnsTeamId ? '✅' : '❌'}`);
      console.log(`📋 [PUSH SERVICE] Valores leídos al inicializar:`);
      console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
      console.log(`   APNS_PRODUCTION: ${process.env.APNS_PRODUCTION} (tipo: ${typeof process.env.APNS_PRODUCTION})`);
      console.log(`   apnsProduction calculado: ${apnsProduction}`);
      
      try {
        // Crear ambos providers para poder intentar ambos entornos
        this.apnProviderProduction = new apn.Provider(this.iosOptionsProduction);
        this.apnProviderSandbox = new apn.Provider(this.iosOptionsSandbox);
        this.defaultApnProvider = apnsProduction ? this.apnProviderProduction : this.apnProviderSandbox;
        console.log(`✅ [PUSH SERVICE] APNs configurado correctamente (ambos entornos disponibles)`);
        console.log(`📋 [PUSH SERVICE] defaultApnProvider configurado para: ${apnsProduction ? 'PRODUCTION' : 'SANDBOX'}`);
      } catch (error) {
        console.error('❌ [PUSH SERVICE] Error configurando APNs:', error.message);
        this.apnProviderProduction = null;
        this.apnProviderSandbox = null;
        this.defaultApnProvider = null;
      }
    } else {
      console.warn('⚠️ [PUSH SERVICE] APNs no configurado. Variables requeridas: APNS_KEY_PATH, APNS_KEY_ID, APNS_TEAM_ID');
      console.warn(`   APNS_KEY_PATH: ${apnsKeyPath ? '✅' : '❌'}`);
      console.warn(`   APNS_KEY_ID: ${apnsKeyId ? '✅' : '❌'}`);
      console.warn(`   APNS_TEAM_ID: ${apnsTeamId ? '✅' : '❌'}`);
      this.apnProviderProduction = null;
      this.apnProviderSandbox = null;
      this.defaultApnProvider = null;
    }
    
    // Configuración para Android (FCM HTTP v1 API)
    // Opción 1: Usar Service Account JSON (recomendado)
    const fcmServiceAccountPath = process.env.FCM_SERVICE_ACCOUNT_PATH;
    const fcmServiceAccountJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
    
    // Opción 2: Usar credenciales individuales (alternativa)
    const fcmProjectId = process.env.FCM_PROJECT_ID;
    const fcmPrivateKey = process.env.FCM_PRIVATE_KEY;
    const fcmClientEmail = process.env.FCM_CLIENT_EMAIL;
    
    // Legacy: Server Key (ya no funciona, pero mantenemos para compatibilidad)
    this.androidServerKey = process.env.FCM_SERVER_KEY;
    
    try {
      // Verificar si Firebase Admin ya está inicializado
      if (admin.apps.length > 0) {
        this.fcmInitialized = true;
        console.log('✅ [PUSH SERVICE] FCM ya estaba inicializado');
      } else if (fcmServiceAccountPath) {
        // Inicializar con archivo JSON
        const serviceAccount = require(fcmServiceAccountPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        this.fcmInitialized = true;
        console.log('✅ [PUSH SERVICE] FCM configurado con Service Account (archivo)');
      } else if (fcmServiceAccountJson) {
        // Inicializar con JSON string
        const serviceAccount = JSON.parse(fcmServiceAccountJson);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        this.fcmInitialized = true;
        console.log('✅ [PUSH SERVICE] FCM configurado con Service Account (JSON string)');
      } else if (fcmProjectId && fcmPrivateKey && fcmClientEmail) {
        // Inicializar con credenciales individuales
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: fcmProjectId,
            privateKey: fcmPrivateKey.replace(/\\n/g, '\n'),
            clientEmail: fcmClientEmail
          })
        });
        this.fcmInitialized = true;
        console.log('✅ [PUSH SERVICE] FCM configurado con credenciales individuales');
      } else if (this.androidServerKey) {
        // Legacy: Solo mostrar advertencia
        console.warn('⚠️ [PUSH SERVICE] FCM_SERVER_KEY está configurado pero la API Legacy está deshabilitada.');
        console.warn('⚠️ [PUSH SERVICE] Por favor, configura FCM usando una de estas opciones:');
        console.warn('   1. FCM_SERVICE_ACCOUNT_PATH (ruta al archivo JSON del service account)');
        console.warn('   2. FCM_SERVICE_ACCOUNT_JSON (JSON string del service account)');
        console.warn('   3. FCM_PROJECT_ID + FCM_PRIVATE_KEY + FCM_CLIENT_EMAIL');
        this.fcmInitialized = false;
      } else {
        console.warn('⚠️ [PUSH SERVICE] FCM no configurado. Variables requeridas:');
        console.warn('   - FCM_SERVICE_ACCOUNT_PATH (ruta al archivo JSON)');
        console.warn('   - O FCM_SERVICE_ACCOUNT_JSON (JSON string)');
        console.warn('   - O FCM_PROJECT_ID + FCM_PRIVATE_KEY + FCM_CLIENT_EMAIL');
        this.fcmInitialized = false;
      }
    } catch (error) {
      console.error('❌ [PUSH SERVICE] Error inicializando FCM:', error.message);
      this.fcmInitialized = false;
    }
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
        // Verificar si hay algún provider disponible (production o sandbox)
        if (!this.defaultApnProvider && !this.apnProviderProduction && !this.apnProviderSandbox) {
          console.error('❌ [PUSH SERVICE] APNs no está configurado. Verificando variables de entorno...');
          console.error(`   APNS_KEY_PATH: ${process.env.APNS_KEY_PATH ? '✅' : '❌'}`);
          console.error(`   APNS_KEY_ID: ${process.env.APNS_KEY_ID ? '✅' : '❌'}`);
          console.error(`   APNS_TEAM_ID: ${process.env.APNS_TEAM_ID ? '✅' : '❌'}`);
          throw new Error('APNs no está configurado. Verifica las variables de entorno: APNS_KEY_PATH, APNS_KEY_ID, APNS_TEAM_ID');
        }
        return await this.sendIOSNotification(deviceToken, notification);
      } else if (platform === 'android') {
        if (!this.fcmInitialized) {
          throw new Error('FCM no está configurado. Verifica las variables de entorno: FCM_SERVICE_ACCOUNT_PATH, FCM_SERVICE_ACCOUNT_JSON, o FCM_PROJECT_ID + FCM_PRIVATE_KEY + FCM_CLIENT_EMAIL');
        }
        return await this.sendAndroidNotification(deviceToken, notification);
      } else {
        throw new Error(`Plataforma no soportada: ${platform}`);
      }
    } catch (error) {
      console.error('❌ [PUSH SERVICE] Error enviando notificación push:', error);
      throw error;
    }
  }

  /**
   * Enviar notificación a iOS usando APNs
   * Intenta automáticamente ambos entornos si falla
   */
  async sendIOSNotification(deviceToken, notification) {
    if (!this.defaultApnProvider) {
      throw new Error('APNs no está configurado. Verifica las variables de entorno: APNS_KEY_PATH, APNS_KEY_ID, APNS_TEAM_ID');
    }

    const apnNotification = new apn.Notification();
    
    apnNotification.alert = {
      title: notification.title,
      body: notification.message
    };
    
    apnNotification.badge = notification.badge || 1;
    apnNotification.sound = notification.sound || "default";
    apnNotification.payload = notification.data || {};
    apnNotification.topic = (process.env.APNS_BUNDLE_ID || "com.kiki.app").trim();
    
    // Intentar primero con el entorno por defecto
    let provider = this.defaultApnProvider;
    let envName = this.defaultApnProvider === this.apnProviderProduction ? 'PRODUCTION' : 'SANDBOX';
    console.log('provider', provider);
    console.log('envName', envName);
    // Log detallado del entorno que se va a usar
    console.log(`📱 [PUSH SERVICE] Enviando notificación iOS:`);
    console.log(`   Entorno APNs seleccionado: ${envName}`);
    console.log(`   defaultApnProvider === apnProviderProduction: ${this.defaultApnProvider === this.apnProviderProduction}`);
    console.log(`   defaultApnProvider === apnProviderSandbox: ${this.defaultApnProvider === this.apnProviderSandbox}`);
    console.log(`   Token: ${deviceToken.substring(0, 100)}...`);
    
    let result = await provider.send(apnNotification, deviceToken);
    
    // Imprimir traza completa de la respuesta de APNs
    console.log(`📊 [PUSH SERVICE] Respuesta APNs completa:`);
    console.log(`   - Enviados: ${result.sent?.length || 0}`);
    console.log(`   - Fallidos: ${result.failed?.length || 0}`);
    
    if (result.sent && result.sent.length > 0) {
      console.log(`   ✅ Tokens enviados exitosamente:`);
      result.sent.forEach((sent, index) => {
        console.log(`      ${index + 1}. Device: ${sent.device}`);
        if (sent.status) console.log(`         Status: ${sent.status}`);
      });
    }
    
    if (result.failed && result.failed.length > 0) {
      console.log(`   ❌ Tokens que fallaron:`);
      result.failed.forEach((failed, index) => {
        console.log(`      ${index + 1}. Device: ${failed.device}`);
        if (failed.status) console.log(`         Status: ${failed.status}`);
        if (failed.response) {
          console.log(`         Response:`, JSON.stringify(failed.response, null, 2));
        }
        if (failed.error) {
          console.log(`         Error:`, failed.error);
        }
      });
    }
    
    // Si falla con BadEnvironmentKeyInToken o BadDeviceToken, intentar con el otro entorno
    // BadDeviceToken puede ocurrir cuando el token es válido pero para el otro entorno (sandbox vs production)
    if (result.failed && result.failed.length > 0) {
      const error = result.failed[0];
      const errorMessage = error.response?.reason || error.error?.message || error.error || 'Error desconocido';
      
      // Intentar con el otro entorno si:
      // 1. BadEnvironmentKeyInToken: La clave APNs es del entorno incorrecto
      // 2. BadDeviceToken: El token del dispositivo es del entorno incorrecto (sandbox vs production)
      const shouldRetry = errorMessage.includes('BadEnvironmentKeyInToken') || 
                         errorMessage.includes('BadEnvironment') ||
                         errorMessage === 'BadDeviceToken';
      
      if (shouldRetry) {
        console.warn(`⚠️ [PUSH SERVICE] Error de entorno/token detectado (${errorMessage}). Intentando con el otro entorno...`);
        
        // Cambiar al otro entorno
        if (provider === this.apnProviderProduction) {
          provider = this.apnProviderSandbox;
          envName = 'SANDBOX';
        } else {
          provider = this.apnProviderProduction;
          envName = 'PRODUCTION';
        }
        
        console.log(`🔄 [PUSH SERVICE] Reintentando con entorno: ${envName}`);
        result = await provider.send(apnNotification, deviceToken);
        
        // Imprimir traza del reintento
        console.log(`📊 [PUSH SERVICE] Respuesta APNs (reintento):`);
        console.log(`   - Enviados: ${result.sent?.length || 0}`);
        console.log(`   - Fallidos: ${result.failed?.length || 0}`);
        
        if (result.sent && result.sent.length > 0) {
          console.log(`   ✅ Tokens enviados exitosamente (reintento):`);
          result.sent.forEach((sent, index) => {
            console.log(`      ${index + 1}. Device: ${sent.device}`);
            if (sent.status) console.log(`         Status: ${sent.status}`);
          });
        }
        
        if (result.failed && result.failed.length > 0) {
          console.log(`   ❌ Tokens que fallaron (reintento):`);
          result.failed.forEach((failed, index) => {
            console.log(`      ${index + 1}. Device: ${failed.device}`);
            if (failed.status) console.log(`         Status: ${failed.status}`);
            if (failed.response) {
              console.log(`         Response:`, JSON.stringify(failed.response, null, 2));
            }
            if (failed.error) {
              console.log(`         Error:`, failed.error);
            }
          });
        }
      }
      
      // Si aún falla, lanzar error
      if (result.failed && result.failed.length > 0) {
        const finalError = result.failed[0];
        const finalErrorMessage = finalError.response?.reason || finalError.error?.message || finalError.error || 'Error desconocido';
        console.error('❌ [PUSH SERVICE] Error enviando notificación iOS:', result.failed);
        console.error(`❌ [PUSH SERVICE] Entorno APNs usado: ${envName}`);
        console.error(`❌ [PUSH SERVICE] Token: ${deviceToken.substring(0, 20)}...`);
        throw new Error(`Error enviando notificación iOS: ${finalErrorMessage}`);
      }
    }
    
    // Log final del resultado
    if (result.sent && result.sent.length > 0) {
      console.log(`✅ [PUSH SERVICE] Notificación iOS enviada exitosamente - Entorno: ${envName}`);
      console.log(`   Total enviados: ${result.sent.length}`);
    } else if (result.failed && result.failed.length > 0) {
      console.log(`⚠️ [PUSH SERVICE] Notificación iOS con errores - Entorno: ${envName}`);
      console.log(`   Total fallidos: ${result.failed.length}`);
    }
    
    return result;
  }

  /**
   * Enviar notificación a Android usando FCM HTTP v1 API (Firebase Admin SDK)
   */
  async sendAndroidNotification(deviceToken, notification) {
    if (!this.fcmInitialized) {
      throw new Error('FCM no está configurado. Verifica las variables de entorno.');
    }

    console.log(`📱 [PUSH SERVICE] Enviando notificación Android - Token: ${deviceToken.substring(0, 20)}...`);

    try {
      const message = {
        token: deviceToken,
        notification: {
          title: notification.title,
          body: notification.message
        },
        data: notification.data || {},
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            icon: 'ic_notification',
            channelId: 'default'
          }
        }
      };

      const response = await admin.messaging().send(message);
      console.log('✅ [PUSH SERVICE] Notificación Android enviada exitosamente:', response);
      return { success: true, messageId: response };
    } catch (error) {
      console.error('❌ [PUSH SERVICE] Error enviando notificación Android:', error);
      
      // Proporcionar mensaje de error más descriptivo
      let errorMessage = 'Error desconocido';
      if (error.code === 'messaging/invalid-registration-token') {
        errorMessage = 'Token de dispositivo inválido';
      } else if (error.code === 'messaging/registration-token-not-registered') {
        errorMessage = 'Token no registrado';
      } else if (error.code === 'messaging/invalid-argument') {
        errorMessage = 'Argumentos inválidos';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      throw new Error(`Error enviando notificación Android: ${errorMessage}`);
    }
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
