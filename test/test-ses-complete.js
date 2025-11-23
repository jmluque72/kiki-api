const { sendPasswordResetEmail, sendWelcomeEmail, sendNotificationEmail } = require('./config/email.config');

async function testSESComplete() {
  try {
    console.log('📧 Probando todos los tipos de emails con AWS SES...\n');

    // Email de prueba (debe estar verificado en SES)
    const testEmail = 'sender@kiki.com.ar';
    const testUserName = 'Manuel Luque';

    console.log('1️⃣ Probando email de recuperación de contraseña...');
    try {
      await sendPasswordResetEmail(testEmail, '123456', testUserName);
      console.log('✅ Email de recuperación enviado exitosamente');
    } catch (error) {
      console.log('❌ Error:', error.message);
    }

    console.log('\n2️⃣ Probando email de bienvenida...');
    try {
      await sendWelcomeEmail(testEmail, testUserName);
      console.log('✅ Email de bienvenida enviado exitosamente');
    } catch (error) {
      console.log('❌ Error:', error.message);
    }

    console.log('\n3️⃣ Probando email de notificación...');
    try {
      await sendNotificationEmail(
        testEmail, 
        'Prueba de Notificación', 
        'Este es un email de prueba para verificar que AWS SES está funcionando correctamente con Kiki App. El sistema está configurado y listo para enviar emails automáticos.',
        testUserName
      );
      console.log('✅ Email de notificación enviado exitosamente');
    } catch (error) {
      console.log('❌ Error:', error.message);
    }

    console.log('\n🎉 Pruebas completadas!');
    console.log('📧 Revisa tu bandeja de entrada en:', testEmail);
    console.log('   Deberías recibir 3 emails diferentes...');
    console.log('\n📋 Tipos de emails enviados:');
    console.log('   🔐 Recuperación de contraseña (código: 123456)');
    console.log('   🎉 Email de bienvenida');
    console.log('   📢 Notificación de prueba');

  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

testSESComplete();
