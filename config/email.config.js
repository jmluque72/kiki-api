// AWS SES - Comentado para uso futuro
// const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Importar servicio SQS (se importa después de definir las funciones de email)
let sqsEmailService = null;

// Configuración de AWS SES - Comentado para uso futuro
/*
const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});
*/

// Configuración de Gmail
const gmailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER, // Tu email de Gmail
    pass: process.env.GMAIL_APP_PASSWORD // Contraseña de aplicación de Gmail
  }
});

// Email remitente - Gmail
const FROM_EMAIL = process.env.GMAIL_USER || 'noreplykikiapp@gmail.com';
const FROM_NAME = 'Kiki App';

// Función helper para generar el HTML del logo de Kiki (URL pública)
const getKikiLogoHTML = () => {
  // Usar URL pública permanente de Google Drive (formato que funciona en emails)
  // Formato: https://drive.google.com/uc?export=view&id=FILE_ID
  const logoUrl = 'https://drive.google.com/uc?export=view&id=1jPsauBej_P9NnG57YnrpnFz50UZQftpz';
  return `
    <div style="text-align: center; margin-bottom: 20px; padding: 20px 0;">
      <img src="${logoUrl}" alt="Kiki Logo" style="max-width: 200px; height: auto; margin: 0 auto; display: block;">
    </div>
  `;
};

// Función helper para generar badges de App Store y Google Play (URLs públicas)
const getAppStoreBadgesHTML = () => {
  // Usar URLs públicas permanentes de Google Drive (formato que funciona en emails)
  // Formato: https://drive.google.com/uc?export=view&id=FILE_ID
  const appleBadgeUrl = 'https://drive.google.com/uc?export=view&id=1iHl9TB11buK7j6eh8G-W48L82X6FbELi';
  const googlePlayBadgeUrl = 'https://drive.google.com/uc?export=view&id=1Vmbu4esRamKgTsiWK_G9xLGz1oKOJdkz';
  
  return `
    <div style="text-align: center; margin: 30px 0;">
      <div style="margin-bottom: 15px;">
        <a href="https://apps.apple.com/ar/app/id1494945181" 
           target="_blank"
           style="display: inline-block; margin: 0 10px; text-decoration: none;">
          <img src="${appleBadgeUrl}" alt="Download on the App Store" style="width: 200px; height: 75px; object-fit: contain; border-radius: 8px;">
        </a>
      </div>
      <div>
        <a href="https://play.google.com/store/apps/details?id=com.kikiapp.katter" 
           target="_blank"
           style="display: inline-block; margin: 0 10px; text-decoration: none;">
          <img src="${googlePlayBadgeUrl}" alt="Get it on Google Play" style="width: 200px; height: 75px; object-fit: contain; border-radius: 8px;">
        </a>
      </div>
    </div>
  `;
};

// Función helper para obtener el servicio SQS (lazy loading)
const getSqsEmailService = () => {
  if (!sqsEmailService) {
    sqsEmailService = require('../services/sqsEmailService');
  }
  return sqsEmailService;
};

// Función para envío asíncrono de emails usando SQS (no bloquea el flujo principal)
const sendEmailAsync = async (emailFunction, context = null, ...args) => {
  try {
    // Detectar el tipo de email basándose en el nombre de la función
    const functionName = emailFunction?.name || '';
    let emailType = null;
    let emailData = {};

    // Mapear funciones conocidas a tipos de email
    if (functionName === 'sendInstitutionWelcomeEmail' || emailFunction === sendInstitutionWelcomeEmail) {
      emailType = 'sendInstitutionWelcomeEmail';
      emailData = {
        to: args[0], // email
        userName: args[1], // userName
        institutionName: args[2], // institutionName
        password: args[3] // password
      };
    } else if (functionName === 'sendNewUserCreatedEmail' || (context && context.sendNewUserCreatedEmail === emailFunction)) {
      emailType = 'sendNewUserCreatedEmail';
      emailData = {
        userData: args[0],
        password: args[1],
        institutionName: args[2],
        roleType: args[3]
      };
    } else if (functionName === 'sendFamilyViewerCreatedEmail' || (context && context.sendFamilyViewerCreatedEmail === emailFunction)) {
      emailType = 'sendFamilyViewerCreatedEmail';
      emailData = {
        userData: args[0],
        password: args[1],
        institutionName: args[2]
      };
    } else {
      // Si no se puede determinar el tipo, intentar inferir desde los argumentos
      console.warn(`⚠️ [SQS EMAIL] No se pudo determinar el tipo de email para función: ${functionName}`);
      // Fallback: intentar enviar directamente (comportamiento anterior)
      setImmediate(async () => {
        try {
          if (context && typeof emailFunction === 'function') {
            await emailFunction.bind(context)(...args);
          } else {
            await emailFunction(...args);
          }
          console.log('✅ [ASYNC EMAIL] Email enviado exitosamente (fallback)');
        } catch (error) {
          console.error('❌ [ASYNC EMAIL] Error enviando email:', error.message);
        }
      });
      return;
    }

    // Enviar a SQS
    const { sendEmailToQueue } = getSqsEmailService();
    const result = await sendEmailToQueue(emailType, emailData);
    if (result.success) {
      console.log(`✅ [SQS EMAIL] Mensaje enviado a cola SQS - Tipo: ${emailType}`);
    } else {
      console.error(`❌ [SQS EMAIL] Error enviando a SQS: ${result.error}`);
      // Fallback: intentar enviar directamente si SQS falla
      setImmediate(async () => {
        try {
          if (context && typeof emailFunction === 'function') {
            await emailFunction.bind(context)(...args);
          } else {
            await emailFunction(...args);
          }
          console.log('✅ [ASYNC EMAIL] Email enviado exitosamente (fallback después de error SQS)');
        } catch (error) {
          console.error('❌ [ASYNC EMAIL] Error enviando email:', error.message);
        }
      });
    }
  } catch (error) {
    console.error('❌ [SQS EMAIL] Error en sendEmailAsync:', error.message);
    // Fallback: intentar enviar directamente
    setImmediate(async () => {
      try {
        if (context && typeof emailFunction === 'function') {
          await emailFunction.bind(context)(...args);
        } else {
          await emailFunction(...args);
        }
        console.log('✅ [ASYNC EMAIL] Email enviado exitosamente (fallback después de error)');
      } catch (fallbackError) {
        console.error('❌ [ASYNC EMAIL] Error enviando email:', fallbackError.message);
      }
    });
  }
};

// Función para generar contraseña aleatoria segura
const generateRandomPassword = (length = 12) => {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  
  // Asegurar que tenga al menos un carácter de cada tipo
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*';
  
  // Agregar al menos un carácter de cada tipo
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Completar con caracteres aleatorios
  for (let i = 4; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  
  // Mezclar la contraseña
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

// Función para enviar email usando Gmail
const sendEmail = async (toEmail, subject, htmlContent) => {
  try {
    const mailOptions = {
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: toEmail,
      subject: subject,
      html: htmlContent
    };

    const result = await gmailTransporter.sendMail(mailOptions);
    console.log(`📧 [GMAIL] Email enviado exitosamente a ${toEmail}`);
    console.log(`📧 [GMAIL] Message ID: ${result.messageId}`);
    return result;
    
  } catch (error) {
    console.error('❌ [GMAIL] Error enviando email:', error);
    throw error;
  }
};

// Función para enviar email usando AWS SES - Comentado para uso futuro
/*
const sendEmailSES = async (toEmail, subject, htmlContent) => {
  try {
    const command = new SendEmailCommand({
      Source: `${FROM_NAME} <${FROM_EMAIL}>`,
      ReplyToAddresses: [FROM_EMAIL],
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
      },
      ConfigurationSetName: process.env.SES_CONFIGURATION_SET || undefined
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
*/

// Función para enviar email de recuperación de contraseña
const sendPasswordResetEmail = async (email, code, userName = 'Usuario') => {
  try {
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
        ${getKikiLogoHTML()}
        <div style="background-color: #0E5FCE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">Recuperación de Contraseña</h1>
        </div>
        
        <div style="background-color: #ffffff; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
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

// Función para enviar email de bienvenida con credenciales de institución
const sendInstitutionWelcomeEmail = async (email, userName, institutionName, password) => {
  try {
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
        ${getKikiLogoHTML()}
        <div style="background-color: #0E5FCE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">¡Bienvenido a Kiki App!</h1>
        </div>
        
        <div style="background-color: #ffffff; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #333; margin-bottom: 20px;">Hola ${userName},</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            ¡Nos alegra darte la bienvenida a Kiki App! Tu institución <strong>${institutionName}</strong> ha sido creada exitosamente 
            y has sido designado como administrador.
          </p>
          
          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #856404; margin-top: 0; margin-bottom: 15px;">🔑 Tus credenciales de acceso:</h3>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; font-family: monospace;">
              <p style="margin: 5px 0; color: #333;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 5px 0; color: #333;"><strong>Contraseña:</strong> ${password}</p>
            </div>
            <p style="color: #856404; font-size: 14px; margin-top: 15px; margin-bottom: 0;">
              ⚠️ <strong>Importante:</strong> Te recomendamos cambiar esta contraseña en tu primer acceso por seguridad.
            </p>
          </div>
          
          <div style="background-color: #e8f5e8; border: 1px solid #4caf50; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #2e7d32; font-weight: bold;">
              🎉 Tu cuenta está lista para usar
            </p>
            <p style="margin: 10px 0 0 0; color: #2e7d32; font-size: 14px;">
              Ya puedes acceder al sistema y comenzar a gestionar tu institución.
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://backoffice.kiki.com.ar" 
               style="display: inline-block; background-color: #0E5FCE; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; transition: background-color 0.3s;">
              🔗 Iniciar sesión
            </a>
          </div>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Como administrador de la institución, podrás gestionar usuarios, crear grupos, 
            configurar eventos y administrar todas las funcionalidades de Kiki App desde el backoffice.
          </p>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px; font-size: 14px;">
            <strong>Link de acceso:</strong> <a href="https://backoffice.kiki.com.ar" style="color: #0E5FCE; text-decoration: none;">https://backoffice.kiki.com.ar</a>
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
            © 2024 Kiki App. Todos los derechos reservados.
          </p>
        </div>
      </div>
    `;

    const result = await sendEmail(email, `¡Bienvenido a Kiki App - ${institutionName}!`, htmlContent);
    console.log(`📧 [EMAIL] Email de bienvenida de institución enviado a ${email}`);
    return result;
    
  } catch (error) {
    console.error('Error enviando email de bienvenida de institución:', error);
    throw error;
  }
};

// Función para enviar email de bienvenida
const sendWelcomeEmail = async (email, userName) => {
  try {
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
        ${getKikiLogoHTML()}
        <div style="background-color: #0E5FCE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">¡Bienvenido a Kiki App!</h1>
        </div>
        
        <div style="background-color: #ffffff; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
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

// Función para enviar email de invitación de familiar (formato unificado)
const sendFamilyInvitationEmail = async (email, userName, password) => {
  try {
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
        ${getKikiLogoHTML()}
        <div style="background-color: #0E5FCE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">¡Invitación a Kiki App!</h1>
        </div>
        
        <div style="background-color: #ffffff; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #333; margin-bottom: 20px;">Hola ${userName},</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Has sido invitado a formar parte de Kiki App como familiar. Tu cuenta ha sido creada y ya puedes acceder a la aplicación.
          </p>
          
          <div style="background-color: #f8f9fa; border: 2px solid #0E5FCE; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #0E5FCE; margin-top: 0; margin-bottom: 15px;">Tus credenciales de acceso:</h3>
            <div style="margin-bottom: 10px;">
              <strong style="color: #333;">Usuario:</strong> 
              <span style="color: #666; font-family: monospace; background-color: #e9ecef; padding: 2px 6px; border-radius: 4px;">${email}</span>
            </div>
            <div>
              <strong style="color: #333;">Contraseña:</strong> 
              <span style="color: #666; font-family: monospace; background-color: #e9ecef; padding: 2px 6px; border-radius: 4px;">${password}</span>
            </div>
          </div>
          
          <div style="background-color: #e8f4fd; border-left: 4px solid #0E5FCE; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #0E5FCE; font-weight: bold;">
              📱 Descarga la aplicación móvil para comenzar
            </p>
          </div>
          
          ${getAppStoreBadgesHTML()}
          
          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
              <strong>💡 Consejo:</strong> Te recomendamos cambiar tu contraseña después del primer inicio de sesión por seguridad.
            </p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
            Este es un email automático, por favor no respondas a este mensaje.<br>
            © ${new Date().getFullYear()} Kiki App. Todos los derechos reservados.
          </p>
        </div>
      </div>
    `;

    const result = await sendEmail(email, 'Invitación a Kiki App - Credenciales de acceso', htmlContent);
    console.log(`📧 [EMAIL] Email de invitación familiar enviado a ${email}`);
    return result;
    
  } catch (error) {
    console.error('Error enviando email de invitación familiar:', error);
    throw error;
  }
};

// Función para enviar email de notificación de invitación familiar (sin credenciales)
const sendFamilyInvitationNotificationEmail = async (email, userName, studentName) => {
  try {
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
        ${getKikiLogoHTML()}
        <div style="background-color: #0E5FCE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">¡Nueva Invitación a Kiki App!</h1>
        </div>
        
        <div style="background-color: #ffffff; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #333; margin-bottom: 20px;">Hola ${userName},</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Has sido invitado a formar parte de Kiki App como familiar para <strong>${studentName}</strong>.
          </p>
          
          <div style="background-color: #e8f4fd; border-left: 4px solid #0E5FCE; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #0E5FCE; font-weight: bold;">
              📱 Inicia sesión con tu cuenta existente para acceder a la información del estudiante
            </p>
          </div>
          
          ${getAppStoreBadgesHTML()}
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
            Este es un email automático, por favor no respondas a este mensaje.<br>
            © ${new Date().getFullYear()} Kiki App. Todos los derechos reservados.
          </p>
        </div>
      </div>
    `;

    const result = await sendEmail(email, 'Nueva Invitación a Kiki App', htmlContent);
    console.log(`📧 [EMAIL] Email de notificación de invitación familiar enviado a ${email}`);
    return result;
    
  } catch (error) {
    console.error('Error enviando email de notificación de invitación familiar:', error);
    throw error;
  }
};

// Función para enviar email de notificación (formato unificado)
const sendNotificationEmail = async (email, subject, message, userName = 'Usuario') => {
  try {
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
        ${getKikiLogoHTML()}
        <div style="background-color: #0E5FCE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">Nueva Notificación</h1>
        </div>
        
        <div style="background-color: #ffffff; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #333; margin-bottom: 20px;">Hola ${userName},</h2>
          
          <div style="background-color: #e8f4fd; border-left: 4px solid #0E5FCE; padding: 15px; margin: 20px 0;">
            <h3 style="color: #0E5FCE; margin-top: 0; margin-bottom: 10px;">${subject}</h3>
            <div style="color: #666; line-height: 1.6;">
              ${message}
            </div>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.APP_URL || 'https://kiki-app.com'}" 
               style="background-color: #0E5FCE; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Ver en la App
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
            Este es un email automático, por favor no respondas a este mensaje.<br>
            © ${new Date().getFullYear()} Kiki App. Todos los derechos reservados.
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
  sendInstitutionWelcomeEmail,
  sendFamilyInvitationEmail,
  sendFamilyInvitationNotificationEmail,
  sendNotificationEmail,
  sendEmail,
  generateRandomPassword,
  sendEmailAsync,
  getKikiLogoHTML,
  getAppStoreBadgesHTML
};
