require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config/database');
const User = require('../shared/models/User');
const Device = require('../shared/models/Device');
const PushError = require('../shared/models/PushError');
const PushNotification = require('../shared/models/PushNotification');

async function debugPushFailure() {
  try {
    await mongoose.connect(config.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Conectado a MongoDB\n');

    const email = 'matilanzaco@gmail.com';
    console.log(`🔍 Investigando push notifications para: ${email}\n`);

    // 1. Buscar el usuario
    const user = await User.findOne({ email });
    if (!user) {
      console.log('❌ Usuario no encontrado');
      process.exit(1);
    }
    console.log(`✅ Usuario encontrado: ${user.name} (${user._id})\n`);

    // 2. Buscar dispositivos registrados
    const devices = await Device.find({ userId: user._id });
    console.log(`📱 Dispositivos registrados: ${devices.length}`);
    devices.forEach((device, index) => {
      console.log(`   ${index + 1}. ${device.platform} - Token: ${device.pushToken?.substring(0, 30)}...`);
      console.log(`      Activo: ${device.isActive}, Último uso: ${device.lastUsed || 'Nunca'}`);
    });
    console.log('');

    // 3. Buscar errores recientes de push
    const recentErrors = await PushError.find({
      $or: [
        { 'pushData.userId': user._id.toString() },
        { deviceToken: { $in: devices.map(d => d.pushToken) } }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(10);

    console.log(`❌ Errores recientes de push: ${recentErrors.length}`);
    recentErrors.forEach((error, index) => {
      console.log(`\n   Error ${index + 1}:`);
      console.log(`   - Tipo: ${error.pushType}`);
      console.log(`   - Plataforma: ${error.platform}`);
      console.log(`   - Token: ${error.deviceToken?.substring(0, 30)}...`);
      console.log(`   - Error: ${error.error}`);
      console.log(`   - Fecha: ${error.createdAt}`);
      if (error.errorDetails) {
        console.log(`   - Detalles: ${JSON.stringify(error.errorDetails, null, 2)}`);
      }
    });
    console.log('');

    // 4. Buscar notificaciones push administrativas recientes
    const recentNotifications = await PushNotification.find({
      $or: [
        { 'recipients.userId': user._id },
        { createdBy: user._id }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('createdBy', 'name email');

    console.log(`📬 Notificaciones push administrativas recientes: ${recentNotifications.length}`);
    recentNotifications.forEach((notif, index) => {
      console.log(`\n   Notificación ${index + 1}:`);
      console.log(`   - ID: ${notif._id}`);
      console.log(`   - Título: ${notif.title}`);
      console.log(`   - Estado: ${notif.status}`);
      console.log(`   - Stats: ${JSON.stringify(notif.stats, null, 2)}`);
      console.log(`   - Creada: ${notif.createdAt}`);
      if (notif.errors && notif.errors.length > 0) {
        console.log(`   - Errores: ${notif.errors.length}`);
        notif.errors.slice(0, 3).forEach((err, i) => {
          console.log(`     ${i + 1}. ${err.error} (${err.platform})`);
        });
      }
    });
    console.log('');

    // 5. Verificar configuración de APNs/FCM
    console.log('⚙️  Configuración de Push Notifications:');
    console.log(`   - APNS_KEY_PATH: ${process.env.APNS_KEY_PATH ? '✅ Configurado' : '❌ No configurado'}`);
    console.log(`   - APNS_KEY_ID: ${process.env.APNS_KEY_ID ? '✅ Configurado' : '❌ No configurado'}`);
    console.log(`   - APNS_TEAM_ID: ${process.env.APNS_TEAM_ID ? '✅ Configurado' : '❌ No configurado'}`);
    console.log(`   - APNS_BUNDLE_ID: ${process.env.APNS_BUNDLE_ID ? '✅ Configurado' : '❌ No configurado'}`);
    console.log(`   - FCM_SERVER_KEY: ${process.env.FCM_SERVER_KEY ? '✅ Configurado' : '❌ No configurado'}`);
    console.log(`   - SQS_PUSH_QUEUE_URL: ${process.env.SQS_PUSH_QUEUE_URL ? '✅ Configurado' : '❌ No configurado'}`);
    console.log('');

    // 6. Verificar si hay mensajes en la cola SQS (solo info, no podemos leerlos directamente)
    console.log('💡 Para verificar mensajes en SQS, revisa los logs del worker de push');
    console.log('   o usa la consola de AWS SQS\n');

    await mongoose.connection.close();
    console.log('✅ Diagnóstico completado');
  } catch (error) {
    console.error('❌ Error en diagnóstico:', error);
    process.exit(1);
  }
}

debugPushFailure();

