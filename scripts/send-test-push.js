#!/usr/bin/env node

require('dotenv').config();

// Verificar que las variables de entorno estén cargadas
console.log('🔍 Verificando variables de entorno...');
console.log('   APNS_KEY_PATH:', process.env.APNS_KEY_PATH ? '✅ Configurado' : '❌ No configurado');
console.log('   APNS_KEY_ID:', process.env.APNS_KEY_ID ? '✅ Configurado' : '❌ No configurado');
console.log('   APNS_TEAM_ID:', process.env.APNS_TEAM_ID ? '✅ Configurado' : '❌ No configurado');
console.log('   APNS_BUNDLE_ID:', process.env.APNS_BUNDLE_ID ? `✅ ${process.env.APNS_BUNDLE_ID}` : '❌ No configurado');

const mongoose = require('mongoose');
const config = require('../config/database');
const Device = require('../shared/models/Device');
const { sendTestNotificationToQueue } = require('../services/sqsPushService');

// Conectar a la base de datos
const connectDB = async () => {
  try {
    await mongoose.connect(config.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Conectado a MongoDB');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error);
    process.exit(1);
  }
};

// Desconectar de la base de datos
const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
  } catch (error) {
    console.error('❌ Error desconectando de MongoDB:', error);
  }
};

// Enviar push notification
const sendPush = async (token, platform = null, title = null, message = null) => {
  try {
    // Si no se especifica la plataforma, buscar en la base de datos
    let device = null;
    if (!platform) {
      device = await Device.findOne({ pushToken: token });
      if (!device) {
        console.error('❌ No se encontró el dispositivo con ese token en la base de datos');
        console.log('💡 Intenta especificar la plataforma manualmente: --platform ios o --platform android');
        return;
      }
      platform = device.platform;
      console.log(`📱 Dispositivo encontrado: ${platform} (Usuario: ${device.userId})`);
    }

    // Crear notificación
    const notification = {
      title: title || '🔔 Notificación de Prueba',
      message: message || 'Esta es una notificación push de prueba',
      data: {
        type: 'test',
        timestamp: new Date().toISOString()
      },
      badge: 1,
      sound: 'default'
    };

    console.log(`\n📤 Enviando push notification a cola SQS...`);
    console.log(`   Token: ${token.substring(0, 20)}...`);
    console.log(`   Plataforma: ${platform}`);
    if (platform === 'ios') {
      console.log(`   Bundle ID: ${process.env.APNS_BUNDLE_ID || 'com.kiki.app'}`);
    } else if (platform === 'android') {
      console.log(`   FCM Server Key: ${process.env.FCM_SERVER_KEY ? '✅ Configurado' : '❌ No configurado'}`);
    }
    console.log(`   Título: ${notification.title}`);
    console.log(`   Mensaje: ${notification.message}`);

    // Enviar notificación a cola SQS
    const result = await sendTestNotificationToQueue(token, platform, notification);

    if (result.success) {
      console.log('\n✅ Push notification enviado a cola SQS exitosamente!');
      console.log('   MessageId:', result.messageId);
      console.log('   Queue URL:', result.queueUrl);
    } else {
      console.log('\n❌ Error enviando push notification a cola SQS');
      console.log('   Error:', result.error);
    }

  } catch (error) {
    console.error('\n❌ Error enviando push notification:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    throw error;
  }
};

// Función principal
const main = async () => {
  // Obtener argumentos de la línea de comandos
  const args = process.argv.slice(2);
  const token = args[0];
  let platform = null;
  let title = null;
  let message = null;

  // Parsear argumentos
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--platform' && args[i + 1]) {
      platform = args[i + 1];
      i++;
    } else if (args[i] === '--title' && args[i + 1]) {
      title = args[i + 1];
      i++;
    } else if (args[i] === '--message' && args[i + 1]) {
      message = args[i + 1];
      i++;
    }
  }

  if (!token) {
    console.error('❌ Error: Debes proporcionar un token como primer argumento');
    console.log('\nUso:');
    console.log('  node send-test-push.js <token> [--platform ios|android] [--title "Título"] [--message "Mensaje"]');
    console.log('\nEjemplo:');
    console.log('  node send-test-push.js 92a652e6ff6ee52920b44434cd9db7892101f9405c80b215baf0e1a92f390cfd');
    console.log('  node send-test-push.js 92a652e6ff6ee52920b44434cd9db7892101f9405c80b215baf0e1a92f390cfd --platform ios --title "Hola" --message "Mensaje de prueba"');
    process.exit(1);
  }

  await connectDB();

  try {
    await sendPush(token, platform, title, message);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
};

// Ejecutar script
main().catch(console.error);

