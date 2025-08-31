require('dotenv').config();
const nodemailer = require('nodemailer');

async function testSimpleEmailSending() {
  console.log('🧪 Probando envío de emails con método simple...\n');

  // Verificar variables de entorno
  const requiredEnvVars = [
    'GMAIL_USER',
    'GMAIL_APP_PASSWORD'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.log('❌ Faltan las siguientes variables de entorno:');
    missingVars.forEach(varName => console.log(`   - ${varName}`));
    console.log('\n💡 Ejecuta "node setup-gmail-simple.js" para configurar Gmail');
    return;
  }

  console.log('✅ Variables de entorno configuradas correctamente\n');

  try {
    // Crear transporter
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    // Probar conexión
    console.log('🔗 Probando conexión con Gmail...');
    await transporter.verify();
    console.log('✅ Conexión exitosa con Gmail\n');

    // Test 1: Email de recuperación de contraseña
    console.log('📧 Enviando email de recuperación de contraseña...');
    
    const mailOptions = {
      from: `"Kiki App" <${process.env.GMAIL_USER}>`,
      to: 'test@example.com', // Cambia por tu email para probar
      subject: 'Test - Recuperación de Contraseña - Kiki App',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
          <div style="background-color: #0E5FCE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">🔐 Recuperación de Contraseña</h1>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-bottom: 20px;">Hola Usuario Test,</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              Has solicitado recuperar tu contraseña en Kiki App. 
              Utiliza el siguiente código para completar el proceso:
            </p>
            
            <div style="background-color: #f8f9fa; border: 2px dashed #0E5FCE; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #0E5FCE; margin: 0; font-size: 32px; letter-spacing: 5px; font-weight: bold;">
                123456
              </h3>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              <strong>⚠️ Importante:</strong>
            </p>
            <ul style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              <li>Este código expira en <strong>10 minutos</strong></li>
              <li>No compartas este código con nadie</li>
              <li>Si no solicitaste este cambio, ignora este email</li>
            </ul>
            
            <div style="background-color: #e8f4fd; border-left: 4px solid #0E5FCE; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #0E5FCE; font-weight: bold;">
                💡 ¿Necesitas ayuda? Contacta al soporte técnico.
              </p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
              Este es un email automático, por favor no respondas a este mensaje.<br>
              © 2024 Kiki App. Todos los derechos reservados.
            </p>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Email de recuperación enviado correctamente\n');

    console.log('🎉 ¡Test de email exitoso!');
    console.log('🚀 El sistema de emails está listo para usar.');
    console.log('\n📧 Email enviado a:', result.accepted);
    console.log('📧 Message ID:', result.messageId);

  } catch (error) {
    console.error('❌ Error en el test de emails:', error.message);
    
    if (error.code === 'EAUTH') {
      console.log('\n💡 Posibles soluciones:');
      console.log('1. Verifica que la verificación en dos pasos esté activada');
      console.log('2. Asegúrate de que la contraseña de aplicación sea correcta');
      console.log('3. Verifica que el email sea correcto');
      console.log('4. Ejecuta "node setup-gmail-simple.js" para reconfigurar');
    }
  }
}

testSimpleEmailSending();
