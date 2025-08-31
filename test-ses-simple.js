const { sendPasswordResetEmail, sendWelcomeEmail, sendNotificationEmail } = require('./config/email.config');

async function testSESSimple() {
  try {
    console.log('📧 Enviando email de prueba con AWS SES...\n');

    // Email de prueba (debe estar verificado en SES)
    const testEmail = 'jmluque72@gmail.com';
    const testUserName = 'Manuel Luque';

    console.log('🎯 Enviando email de recuperación de contraseña...');
    try {
      await sendPasswordResetEmail(testEmail, '123456', testUserName);
      console.log('✅ Email de recuperación enviado exitosamente');
    } catch (error) {
      console.log('❌ Error:', error.message);
    }

    console.log('\n📧 Revisa tu bandeja de entrada en:', testEmail);
    console.log('   El email debería llegar en unos segundos...');

  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

testSESSimple();
