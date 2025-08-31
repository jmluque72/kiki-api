const nodemailer = require('nodemailer');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔧 Configuración Simple de Gmail para Kiki App');
console.log('=============================================\n');

console.log('📋 Método alternativo usando Contraseña de Aplicación:');
console.log('1. Ve a https://myaccount.google.com/');
console.log('2. Ve a "Seguridad"');
console.log('3. Activa la "Verificación en dos pasos" si no está activada');
console.log('4. Ve a "Contraseñas de aplicación"');
console.log('5. Selecciona "Otra" y nombra la app como "Kiki App"');
console.log('6. Copia la contraseña generada (16 caracteres)\n');

rl.question('¿Tienes habilitada la verificación en dos pasos en tu cuenta de Gmail? (s/n): ', (answer) => {
  if (answer.toLowerCase() === 's' || answer.toLowerCase() === 'si') {
    rl.question('Ingresa tu email de Gmail: ', (email) => {
      rl.question('Ingresa la contraseña de aplicación (16 caracteres): ', (appPassword) => {
        
        console.log('\n🧪 Probando configuración...');
        
        // Crear transporter con contraseña de aplicación
        const transporter = nodemailer.createTransporter({
          service: 'gmail',
          auth: {
            user: email,
            pass: appPassword
          }
        });
        
        // Probar la conexión
        transporter.verify((error, success) => {
          if (error) {
            console.log('❌ Error en la configuración:', error.message);
            console.log('\n💡 Posibles soluciones:');
            console.log('1. Verifica que la verificación en dos pasos esté activada');
            console.log('2. Asegúrate de que la contraseña de aplicación sea correcta');
            console.log('3. Verifica que el email sea correcto');
          } else {
            console.log('✅ Configuración exitosa!');
            console.log('\n📝 Agrega estas variables a tu archivo .env:');
            console.log('=====================================');
            console.log(`GMAIL_USER=${email}`);
            console.log(`GMAIL_APP_PASSWORD=${appPassword}`);
            console.log('=====================================\n');
            
            console.log('🔄 Ahora necesitamos actualizar la configuración de email...');
            
            // Crear configuración actualizada
            const updatedConfig = `
const nodemailer = require('nodemailer');
require('dotenv').config();

// Crear transporter de nodemailer con contraseña de aplicación
const createTransporter = async () => {
  try {
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    return transporter;
  } catch (error) {
    console.error('Error creando transporter de email:', error);
    throw error;
  }
};

// Función para enviar email de recuperación de contraseña
const sendPasswordResetEmail = async (email, code, userName = 'Usuario') => {
  try {
    const transporter = await createTransporter();
    
    const mailOptions = {
      from: \`"Kiki App" <\${process.env.GMAIL_USER}>\`,
      to: email,
      subject: 'Recuperación de Contraseña - Kiki App',
      html: \`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
          <div style="background-color: #0E5FCE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">🔐 Recuperación de Contraseña</h1>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-bottom: 20px;">Hola \${userName},</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              Has solicitado recuperar tu contraseña en Kiki App. 
              Utiliza el siguiente código para completar el proceso:
            </p>
            
            <div style="background-color: #f8f9fa; border: 2px dashed #0E5FCE; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #0E5FCE; margin: 0; font-size: 32px; letter-spacing: 5px; font-weight: bold;">
                \${code}
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
      \`
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(\`📧 [EMAIL] Email de recuperación enviado a \${email}\`);
    return result;
    
  } catch (error) {
    console.error('Error enviando email de recuperación:', error);
    throw error;
  }
};

// Función para enviar email de bienvenida
const sendWelcomeEmail = async (email, userName) => {
  try {
    const transporter = await createTransporter();
    
    const mailOptions = {
      from: \`"Kiki App" <\${process.env.GMAIL_USER}>\`,
      to: email,
      subject: '¡Bienvenido a Kiki App!',
      html: \`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
          <div style="background-color: #0E5FCE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">🎉 ¡Bienvenido a Kiki App!</h1>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-bottom: 20px;">Hola \${userName},</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              ¡Nos alegra darte la bienvenida a Kiki App! Tu cuenta ha sido creada exitosamente.
            </p>
            
            <div style="background-color: #e8f5e8; border: 1px solid #4caf50; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #2e7d32; font-weight: bold;">
                ✅ Tu cuenta está lista para usar
              </p>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              Ya puedes acceder a todas las funcionalidades de la aplicación y comenzar a gestionar 
              tus actividades, eventos y comunicaciones.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="\${process.env.APP_URL || 'https://kiki-app.com'}" 
                 style="background-color: #0E5FCE; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                🚀 Comenzar
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
              © 2024 Kiki App. Todos los derechos reservados.
            </p>
          </div>
        </div>
      \`
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(\`📧 [EMAIL] Email de bienvenida enviado a \${email}\`);
    return result;
    
  } catch (error) {
    console.error('Error enviando email de bienvenida:', error);
    throw error;
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendWelcomeEmail,
  createTransporter
};
`;
            
            console.log('📝 Configuración actualizada generada. Copia este contenido y reemplaza el archivo config/email.config.js:');
            console.log('=====================================');
            console.log(updatedConfig);
            console.log('=====================================\n');
            
            console.log('🚀 Para probar el envío de emails, ejecuta:');
            console.log('node test-email-simple.js');
          }
          
          rl.close();
        });
      });
    });
  } else {
    console.log('\n❌ Necesitas habilitar la verificación en dos pasos primero.');
    console.log('1. Ve a https://myaccount.google.com/');
    console.log('2. Ve a "Seguridad"');
    console.log('3. Activa la "Verificación en dos pasos"');
    console.log('4. Luego vuelve a ejecutar este script.');
    rl.close();
  }
});
