require('dotenv').config();
const { sendPasswordResetEmail, sendWelcomeEmail } = require('./config/email.config');

async function testEmailSending() {
  console.log('🧪 Probando envío de emails...\n');

  // Verificar variables de entorno
  const requiredEnvVars = [
    'GMAIL_USER',
    'GMAIL_CLIENT_ID', 
    'GMAIL_CLIENT_SECRET',
    'GMAIL_REFRESH_TOKEN'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.log('❌ Faltan las siguientes variables de entorno:');
    missingVars.forEach(varName => console.log(`   - ${varName}`));
    console.log('\n💡 Ejecuta "node setup-gmail.js" para configurar Gmail');
    return;
  }

  console.log('✅ Variables de entorno configuradas correctamente\n');

  try {
    // Test 1: Email de recuperación de contraseña
    console.log('📧 Enviando email de recuperación de contraseña...');
    await sendPasswordResetEmail('test@example.com', '123456', 'Usuario Test');
    console.log('✅ Email de recuperación enviado correctamente\n');

    // Test 2: Email de bienvenida
    console.log('📧 Enviando email de bienvenida...');
    await sendWelcomeEmail('test@example.com', 'Usuario Test');
    console.log('✅ Email de bienvenida enviado correctamente\n');

    console.log('🎉 ¡Todos los tests de email pasaron exitosamente!');
    console.log('🚀 El sistema de emails está listo para usar.');

  } catch (error) {
    console.error('❌ Error en el test de emails:', error.message);
    
    if (error.code === 'EAUTH') {
      console.log('\n💡 Posibles soluciones:');
      console.log('1. Verifica que las credenciales de Gmail sean correctas');
      console.log('2. Asegúrate de que el Refresh Token no haya expirado');
      console.log('3. Verifica que la Gmail API esté habilitada en tu proyecto');
      console.log('4. Ejecuta "node setup-gmail.js" para reconfigurar');
    }
  }
}

testEmailSending();
