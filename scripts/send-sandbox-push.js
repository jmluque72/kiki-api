// Script para enviar un push iOS a APNs SANDBOX usando el servicio interno
// Uso:
//   cd api
//   node scripts/send-sandbox-push.js
//
// IMPORTANTE:
// - Usa el .env de desarrollo (.env) donde APNS_PRODUCTION=false (sandbox)

require('dotenv').config({ path: '.env' });

const pushNotificationService = require('../pushNotificationService');

async function main() {
  // Token de prueba que nos pasaste
  const deviceToken = '57b692d37de9c50ba6446ad92f59137b78ef945bdd5df1e0d09bf233312a8eda';

  const notification = {
    title: 'Kiki App',
    message: 'Que bestia kiki!!!!!!',
    data: { type: 'sandbox-test' }
  };

  try {
    console.log('🚀 Enviando push iOS (sandbox) a:');
    console.log(`   Token: ${deviceToken}`);
    console.log('   Título:', notification.title);
    console.log('   Mensaje:', notification.message);

    const result = await pushNotificationService.sendNotification(
      deviceToken,
      'ios',
      notification
    );

    console.log('✅ Push enviado, resultado bruto de APNs:');
    console.dir(result, { depth: null });
  } catch (err) {
    console.error('❌ Error enviando push:', err);
  } finally {
    process.exit(0);
  }
}

main();

