const { sendPasswordResetEmail, sendWelcomeEmail, sendNotificationEmail } = require('./config/email.config');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function testSESInteractive() {
  try {
    console.log('📧 Test Interactivo de AWS SES para Kiki App\n');

    // Email de prueba (debe estar verificado en SES)
    const testEmail = 'sender@kiki.com.ar';
    const testUserName = 'Manuel Luque';

    console.log('📋 Tipos de emails disponibles:');
    console.log('1. 🔐 Recuperación de contraseña');
    console.log('2. 🎉 Email de bienvenida');
    console.log('3. 📢 Notificación personalizada');
    console.log('4. 🚀 Enviar todos los tipos');
    console.log('5. ❌ Salir\n');

    rl.question('Selecciona una opción (1-5): ', async (answer) => {
      try {
        switch (answer.trim()) {
          case '1':
            console.log('\n🔐 Enviando email de recuperación de contraseña...');
            await sendPasswordResetEmail(testEmail, '123456', testUserName);
            console.log('✅ Email de recuperación enviado exitosamente');
            console.log('📧 Revisa tu bandeja de entrada en:', testEmail);
            break;

          case '2':
            console.log('\n🎉 Enviando email de bienvenida...');
            await sendWelcomeEmail(testEmail, testUserName);
            console.log('✅ Email de bienvenida enviado exitosamente');
            console.log('📧 Revisa tu bandeja de entrada en:', testEmail);
            break;

          case '3':
            rl.question('Ingresa el asunto de la notificación: ', async (subject) => {
              rl.question('Ingresa el mensaje: ', async (message) => {
                console.log('\n📢 Enviando notificación personalizada...');
                await sendNotificationEmail(testEmail, subject, message, testUserName);
                console.log('✅ Notificación enviada exitosamente');
                console.log('📧 Revisa tu bandeja de entrada en:', testEmail);
                rl.close();
              });
            });
            return;

          case '4':
            console.log('\n🚀 Enviando todos los tipos de emails...');
            
            console.log('1️⃣ Email de recuperación...');
            await sendPasswordResetEmail(testEmail, '123456', testUserName);
            
            console.log('2️⃣ Email de bienvenida...');
            await sendWelcomeEmail(testEmail, testUserName);
            
            console.log('3️⃣ Notificación de prueba...');
            await sendNotificationEmail(
              testEmail, 
              'Prueba Completa', 
              'Este es un email de prueba para verificar que todos los tipos de emails funcionan correctamente.',
              testUserName
            );
            
            console.log('✅ Todos los emails enviados exitosamente');
            console.log('📧 Revisa tu bandeja de entrada en:', testEmail);
            break;

          case '5':
            console.log('\n👋 ¡Hasta luego!');
            rl.close();
            return;

          default:
            console.log('\n❌ Opción inválida. Por favor selecciona 1-5.');
            rl.close();
            return;
        }

        console.log('\n🎉 ¡Test completado!');
        rl.close();

      } catch (error) {
        console.log('❌ Error:', error.message);
        rl.close();
      }
    });

  } catch (error) {
    console.error('❌ Error general:', error);
    rl.close();
  }
}

testSESInteractive();
