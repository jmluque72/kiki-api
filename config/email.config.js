const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
require('dotenv').config();

// Configuración de AWS SES
const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Email remitente verificado en SES
const FROM_EMAIL = 'jmluque72@gmail.com';
const FROM_NAME = 'Kiki App';

// Función para enviar email usando AWS SES
const sendEmail = async (toEmail, subject, htmlContent) => {
  try {
    const command = new SendEmailCommand({
      Source: `${FROM_NAME} <${FROM_EMAIL}>`,
      Destination: {
        ToAddresses: [toEmail]
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: htmlContent,
            Charset: 'UTF-8'
          }
        }
      }
    });

    const result = await sesClient.send(command);
    console.log(`📧 [SES] Email enviado exitosamente a ${toEmail}`);
    console.log(`📧 [SES] Message ID: ${result.MessageId}`);
    return result;
    
  } catch (error) {
    console.error('❌ [SES] Error enviando email:', error);
    throw error;
  }
};

// Función para enviar email de recuperación de contraseña
const sendPasswordResetEmail = async (email, code, userName = 'Usuario') => {
  try {
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
        <div style="background-color: #0E5FCE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <img src="https://kiki-app.com/logo.png" alt="KIKI" style="width: 120px; height: auto; margin-bottom: 15px;">
          <h1 style="margin: 0; font-size: 24px;">Recuperación de Contraseña</h1>
        </div>
        
        <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #333; margin-bottom: 20px;">Hola ${userName},</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Has solicitado recuperar tu contraseña en Kiki App. 
            Utiliza el siguiente código para completar el proceso:
          </p>
          
          <div style="background-color: #f8f9fa; border: 2px dashed #0E5FCE; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #0E5FCE; margin: 0; font-size: 32px; letter-spacing: 5px; font-weight: bold;">
              ${code}
            </h3>
          </div>
          
                      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              <strong>Importante:</strong>
            </p>
            <ul style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              <li>Este código expira en <strong>10 minutos</strong></li>
              <li>No compartas este código con nadie</li>
              <li>Si no solicitaste este cambio, ignora este email</li>
            </ul>
            
            <div style="background-color: #e8f4fd; border-left: 4px solid #0E5FCE; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #0E5FCE; font-weight: bold;">
                ¿Necesitas ayuda? Contacta al soporte técnico.
              </p>
            </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
            Este es un email automático, por favor no respondas a este mensaje.<br>
            © 2024 Kiki App. Todos los derechos reservados.
          </p>
        </div>
      </div>
    `;

    const result = await sendEmail(email, 'Recuperación de Contraseña - Kiki App', htmlContent);
    console.log(`📧 [EMAIL] Email de recuperación enviado a ${email}`);
    return result;
    
  } catch (error) {
    console.error('Error enviando email de recuperación:', error);
    throw error;
  }
};

// Función para enviar email de bienvenida
const sendWelcomeEmail = async (email, userName) => {
  try {
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
        <div style="background-color: #0E5FCE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <img src="https://kiki-app.com/logo.png" alt="KIKI" style="width: 120px; height: auto; margin-bottom: 15px;">
          <h1 style="margin: 0; font-size: 24px;">¡Bienvenido a Kiki App!</h1>
        </div>
        
        <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #333; margin-bottom: 20px;">Hola ${userName},</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            ¡Nos alegra darte la bienvenida a Kiki App! Tu cuenta ha sido creada exitosamente.
          </p>
          
                      <div style="background-color: #e8f5e8; border: 1px solid #4caf50; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #2e7d32; font-weight: bold;">
                Tu cuenta está lista para usar
              </p>
            </div>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Ya puedes acceder a todas las funcionalidades de la aplicación y comenzar a gestionar 
            tus actividades, eventos y comunicaciones.
          </p>
          
                      <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.APP_URL || 'https://kiki-app.com'}" 
                 style="background-color: #0E5FCE; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Comenzar
              </a>
            </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
            © 2024 Kiki App. Todos los derechos reservados.
          </p>
        </div>
      </div>
    `;

    const result = await sendEmail(email, '¡Bienvenido a Kiki App!', htmlContent);
    console.log(`📧 [EMAIL] Email de bienvenida enviado a ${email}`);
    return result;
    
  } catch (error) {
    console.error('Error enviando email de bienvenida:', error);
    throw error;
  }
};

// Función para enviar email de notificación
const sendNotificationEmail = async (email, subject, message, userName = 'Usuario') => {
  try {
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
        <div style="background-color: #0E5FCE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <img src="https://kiki-app.com/logo.png" alt="KIKI" style="width: 120px; height: auto; margin-bottom: 15px;">
          <h1 style="margin: 0; font-size: 24px;">Nueva Notificación</h1>
        </div>
        
        <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #333; margin-bottom: 20px;">Hola ${userName},</h2>
          
          <div style="background-color: #f8f9fa; border-left: 4px solid #0E5FCE; padding: 20px; border-radius: 4px; margin: 20px 0;">
            <h3 style="color: #0E5FCE; margin-top: 0;">${subject}</h3>
            <p style="color: #666; line-height: 1.6; margin-bottom: 0;">
              ${message}
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.APP_URL || 'https://kiki-app.com'}" 
               style="background-color: #0E5FCE; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              📱 Ver en la App
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
            © 2024 Kiki App. Todos los derechos reservados.
          </p>
        </div>
      </div>
    `;

    const result = await sendEmail(email, `Notificación - ${subject}`, htmlContent);
    console.log(`📧 [EMAIL] Email de notificación enviado a ${email}`);
    return result;
    
  } catch (error) {
    console.error('Error enviando email de notificación:', error);
    throw error;
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendNotificationEmail,
  sendEmail
};
