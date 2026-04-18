const nodemailer = require('nodemailer');
const config = require('../config/env.config');
const {
  getKikiLogoSrc,
  getKikiLogoInlineAttachments,
  getAppleBadgeUrl,
  getGooglePlayBadgeUrl,
} = require('../config/emailAssets');
const EmailUnsubscribe = require('../shared/models/EmailUnsubscribe');
const EmailDelivery = require('../shared/models/EmailDelivery');

class EmailService {
  constructor() {
    // ⚠️ DEBUG TEMPORAL: forzar credenciales para descartar problemas de carga de ENV en ECS.
    // Quitar este bloque después de validar.
    const FORCE_GMAIL_CREDENTIALS = true;
    const FORCED_GMAIL_USER = 'noreplykikiapp@gmail.com';
    const FORCED_GMAIL_PASSWORD = 'nhmbykbxxeaxygvp';

    const gmailUser = FORCE_GMAIL_CREDENTIALS
      ? FORCED_GMAIL_USER
      : (process.env.GMAIL_USER || process.env.SMTP_USER || 'noreplykikiapp@gmail.com');
    const gmailPassword = FORCE_GMAIL_CREDENTIALS
      ? FORCED_GMAIL_PASSWORD
      : (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS);

    // Configurar Gmail en lugar de AWS SES
    this.gmailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPassword
      }
    });
    
    // Email remitente
    this.fromEmail = gmailUser;
    this.fromName = 'Kiki App';
  }

  // Función helper para generar badges de App Store y Google Play (URLs públicas)
  // Mejorado para mejor compatibilidad con clientes de email usando tablas
  getAppStoreBadgesHTML() {
    const appleBadgeUrl = getAppleBadgeUrl();
    const googlePlayBadgeUrl = getGooglePlayBadgeUrl();
    
    return `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0;">
        <tr>
          <td align="center" style="padding-bottom: 15px;">
            <a href="https://apps.apple.com/ar/app/id1494945181" 
               target="_blank"
               style="text-decoration: none; display: inline-block;">
              <img src="${appleBadgeUrl}" 
                   alt="Descargar en App Store" 
                   width="200" 
                   height="75" 
                   style="width: 200px; height: 75px; border: 0; display: block; border-radius: 8px;">
            </a>
          </td>
        </tr>
        <tr>
          <td align="center">
            <a href="https://play.google.com/store/apps/details?id=com.kikiapp.katter" 
               target="_blank"
               style="text-decoration: none; display: inline-block;">
              <img src="${googlePlayBadgeUrl}" 
                   alt="Disponible en Google Play" 
                   width="200" 
                   height="75" 
                   style="width: 200px; height: 75px; border: 0; display: block; border-radius: 8px;">
            </a>
          </td>
        </tr>
      </table>
      <p style="color: #666666; font-size: 12px; text-align: center; margin: 10px 0 0 0;">
        Descarga la aplicación móvil de KIKI desde App Store o Google Play Store
      </p>
    `;
  }

  // Template base moderno con header de KIKI (formato unificado)
  // Mejorado para mejor deliverabilidad y evitar spam
  getBaseTemplate(content, title = 'KIKI') {
    const logoUrl = getKikiLogoSrc();
    const logoHTML = `
      <div style="text-align: center; margin-bottom: 20px; padding: 20px 0;">
        <img src="${logoUrl}" alt="Kiki Logo" width="200" height="auto" style="max-width: 200px; height: auto; margin: 0 auto; display: block; border: 0;">
      </div>
    `;
    
    // Año actual para el copyright
    const currentYear = new Date().getFullYear();
    
    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>${title} - Kiki App</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding: 20px 0;">
              ${logoHTML}
            </td>
          </tr>
          
          <!-- Header -->
          <tr>
            <td style="background-color: #0E5FCE; color: #ffffff; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; font-size: 24px; font-weight: bold; color: #ffffff;">${title}</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="background-color: #ffffff; padding: 30px; border-radius: 0 0 8px 8px;">
              ${content}
              
              <!-- Separator -->
              <hr style="border: none; border-top: 1px solid #eeeeee; margin: 30px 0;">
              
              <!-- Footer -->
              <p style="color: #999999; font-size: 12px; text-align: center; margin: 0; line-height: 1.5;">
                Este es un email automático, por favor no respondas a este mensaje.<br>
                © ${currentYear} Kiki App. Todos los derechos reservados.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  // Template para usuario familyviewer creado
  getFamilyViewerCreatedTemplate(userData, password, institutionName) {
    const userName = userData.name || 'Usuario';
    const userEmail = userData.email || '';
    
    const content = `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td>
            <h2 style="color: #333333; margin: 0 0 20px 0; font-size: 20px; font-weight: bold;">Hola ${userName},</h2>
            
            <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0; font-size: 14px;">
              Se ha creado una cuenta para ti en el sistema KIKI con acceso a la institución <strong style="color: #333333;">${institutionName}</strong>.
            </p>
            
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8f9fa; border: 2px solid #0E5FCE; border-radius: 8px; margin: 20px 0;">
              <tr>
                <td style="padding: 20px;">
                  <h3 style="color: #0E5FCE; margin: 0 0 15px 0; font-size: 18px; font-weight: bold;">Tus credenciales de acceso:</h3>
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr>
                      <td style="padding-bottom: 10px;">
                        <strong style="color: #333333; font-size: 14px;">Usuario:</strong><br>
                        <span style="color: #666666; font-family: monospace; background-color: #e9ecef; padding: 4px 8px; border-radius: 4px; font-size: 13px; display: inline-block; margin-top: 4px;">${userEmail}</span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <strong style="color: #333333; font-size: 14px;">Contraseña:</strong><br>
                        <span style="color: #666666; font-family: monospace; background-color: #e9ecef; padding: 4px 8px; border-radius: 4px; font-size: 13px; display: inline-block; margin-top: 4px;">${password}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #e8f4fd; border-left: 4px solid #0E5FCE; margin: 20px 0;">
              <tr>
                <td style="padding: 15px;">
                  <p style="margin: 0; color: #0E5FCE; font-weight: bold; font-size: 14px;">
                    Descarga la aplicación móvil para comenzar
                  </p>
                </td>
              </tr>
            </table>
            
            ${this.getAppStoreBadgesHTML()}
            
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; margin: 20px 0;">
              <tr>
                <td style="padding: 15px;">
                  <p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.5;">
                    <strong>Consejo de seguridad:</strong> Te recomendamos cambiar tu contraseña después del primer inicio de sesión por seguridad.
                  </p>
                </td>
              </tr>
            </table>
            
            <p style="color: #666666; line-height: 1.6; margin: 20px 0 0 0; font-size: 14px;">
              Si tienes alguna pregunta, contacta al administrador de tu institución.
            </p>
            
            <p style="color: #333333; font-weight: bold; margin: 20px 0 0 0; font-size: 14px;">
              Saludos,<br>El equipo de KIKI
            </p>
          </td>
        </tr>
      </table>
    `;
    
    return this.getBaseTemplate(content, '¡Bienvenido a KIKI!');
  }

  // Template para recuperación de contraseña
  getPasswordRecoveryTemplate(email, code) {
    const content = `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td>
            <h2 style="color: #333333; margin: 0 0 20px 0; font-size: 20px; font-weight: bold;">Hola,</h2>
            
            <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0; font-size: 14px;">
              Has solicitado recuperar tu contraseña en KIKI. Utiliza el siguiente código de verificación para completar el proceso.
            </p>
            
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8f9fa; border: 2px solid #0E5FCE; border-radius: 8px; margin: 20px 0;">
              <tr>
                <td style="padding: 20px; text-align: center;">
                  <h3 style="color: #0E5FCE; margin: 0 0 15px 0; font-size: 18px; font-weight: bold;">Tu código de verificación:</h3>
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                    <tr>
                      <td style="background-color: #e9ecef; padding: 15px 25px; border-radius: 8px;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; font-family: monospace; color: #0E5FCE; display: inline-block;">${code}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; margin: 20px 0;">
              <tr>
                <td style="padding: 15px;">
                  <p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.5;">
                    <strong>Importante:</strong> Este código expira en 10 minutos. Si no solicitaste este código, puedes ignorar este email de forma segura.
                  </p>
                </td>
              </tr>
            </table>
            
            <p style="color: #666666; line-height: 1.6; margin: 20px 0 0 0; font-size: 14px;">
              Por seguridad, nunca compartas este código con nadie. El equipo de KIKI nunca te pedirá tu código de verificación.
            </p>
            
            <p style="color: #333333; font-weight: bold; margin: 20px 0 0 0; font-size: 14px;">
              Saludos,<br>El equipo de KIKI
            </p>
          </td>
        </tr>
      </table>
    `;
    
    return this.getBaseTemplate(content, 'Recuperación de Contraseña');
  }

  // Template para notificación general
  getNotificationTemplate(title, message) {
    const content = `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td>
            <h2 style="color: #333333; margin: 0 0 20px 0; font-size: 20px; font-weight: bold;">Hola,</h2>
            
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #e8f4fd; border-left: 4px solid #0E5FCE; margin: 20px 0;">
              <tr>
                <td style="padding: 15px;">
                  <h3 style="color: #0E5FCE; margin: 0 0 10px 0; font-size: 18px; font-weight: bold;">${title}</h3>
                  <div style="color: #666666; line-height: 1.6; font-size: 14px;">
                    ${message}
                  </div>
                </td>
              </tr>
            </table>
            
            <p style="color: #333333; font-weight: bold; margin: 20px 0 0 0; font-size: 14px;">
              Saludos,<br>El equipo de KIKI
            </p>
          </td>
        </tr>
      </table>
    `;
    
    return this.getBaseTemplate(content, 'Nueva Notificación');
  }

  // Convertir HTML a texto plano para mejor deliverabilidad
  htmlToPlainText(html) {
    // Remover etiquetas HTML y convertir entidades HTML
    let text = html
      .replace(/<style[^>]*>.*?<\/style>/gi, '') // Remover estilos
      .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remover scripts
      .replace(/<[^>]+>/g, ' ') // Remover todas las etiquetas HTML
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, ' ') // Normalizar espacios
      .trim();
    
    // Limpiar líneas múltiples y espacios
    text = text.replace(/\n\s*\n/g, '\n\n');
    
    return text;
  }

  // Enviar email usando Gmail con mejoras para evitar spam
  async sendEmail(to, subject, htmlContent, emailType = 'general') {
    try {
      const normalizedEmail = to.toLowerCase().trim();
      
      // Verificar si el email está desuscrito
      const isUnsubscribed = await EmailUnsubscribe.isUnsubscribed(normalizedEmail);
      if (isUnsubscribed) {
        console.log(`⚠️ [EMAIL SERVICE] Email desuscrito, no se envía a: ${normalizedEmail}`);
        // Registrar intento de envío a email desuscrito
        await EmailDelivery.create({
          email: normalizedEmail,
          emailType: emailType,
          subject: subject,
          status: 'failed',
          metadata: { reason: 'unsubscribed' }
        });
        return {
          success: false,
          messageId: null,
          reason: 'unsubscribed'
        };
      }
      
      // Generar versión de texto plano del HTML
      const textContent = this.htmlToPlainText(htmlContent);
      
      // URL de desuscripción (usar variable de entorno o dominio por defecto)
      const baseUrl = process.env.API_BASE_URL || process.env.BASE_URL || 'https://kiki.com.ar';
      const unsubscribeUrl = `${baseUrl}/unsubscribe?email=${encodeURIComponent(normalizedEmail)}`;
      
      const mailOptions = {
        from: `${this.fromName} <${this.fromEmail}>`,
        to: normalizedEmail,
        replyTo: this.fromEmail, // Reply-To header
        subject: subject,
        html: htmlContent,
        text: textContent, // Versión de texto plano
        // Headers adicionales para mejorar deliverabilidad
        headers: {
          'X-Mailer': 'Kiki App Email Service',
          'X-Priority': '3', // Prioridad normal
          'Precedence': 'bulk', // Para emails transaccionales masivos
          'List-Unsubscribe': `<${unsubscribeUrl}>`, // Enlace de desuscripción
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click', // Unsubscribe one-click
          'X-Auto-Response-Suppress': 'All', // Suprimir respuestas automáticas
          'Auto-Submitted': 'auto-generated', // Indicar que es generado automáticamente
          'Message-ID': `<${Date.now()}-${Math.random().toString(36).substring(7)}@kiki.com.ar>`, // Message-ID único
        },
        // Configuraciones adicionales
        priority: 'normal',
        encoding: 'utf-8',
        attachments: getKikiLogoInlineAttachments(),
      };

      const result = await this.gmailTransporter.sendMail(mailOptions);
      const messageId = result.messageId;
      
      // Registrar envío exitoso en base de datos
      await EmailDelivery.create({
        email: normalizedEmail,
        emailType: emailType,
        subject: subject,
        messageId: messageId,
        status: 'sent',
        provider: 'gmail',
        sentAt: new Date()
      });
      
      console.log('✅ [EMAIL SERVICE] Email enviado exitosamente a:', normalizedEmail);
      console.log('📧 [EMAIL SERVICE] Message ID:', messageId);
      console.log('📊 [EMAIL SERVICE] Registrado en EmailDelivery');
      
      return {
        success: true,
        messageId: messageId
      };
    } catch (error) {
      const normalizedEmail = to.toLowerCase().trim();
      
      // Registrar error en base de datos
      try {
        await EmailDelivery.create({
          email: normalizedEmail,
          emailType: emailType,
          subject: subject,
          status: 'failed',
          metadata: { error: error.message, errorDetails: error }
        });
      } catch (dbError) {
        console.error('❌ [EMAIL SERVICE] Error guardando en EmailDelivery:', dbError);
      }
      
      console.error('❌ [EMAIL SERVICE] Error enviando email a:', normalizedEmail, error);
      throw new Error(`Error enviando email: ${error.message}`);
    }
  }

  // Enviar email para usuario familyviewer creado
  async sendFamilyViewerCreatedEmail(userData, password, institutionName) {
    const subject = 'Bienvenido a KIKI - Tu cuenta ha sido creada';
    const htmlContent = this.getFamilyViewerCreatedTemplate(userData, password, institutionName);
    
    return await this.sendEmail(userData.email, subject, htmlContent, 'familyViewerCreated');
  }

  // Enviar email de recuperación de contraseña
  async sendPasswordRecoveryEmail(email, code) {
    const subject = 'KIKI - Código de recuperación de contraseña';
    const htmlContent = this.getPasswordRecoveryTemplate(email, code);
    
    return await this.sendEmail(email, subject, htmlContent, 'passwordRecovery');
  }

  // Enviar notificación general
  async sendNotificationEmail(email, title, message) {
    const subject = `KIKI - ${title}`;
    const htmlContent = this.getNotificationTemplate(title, message);
    
    return await this.sendEmail(email, subject, htmlContent, 'notification');
  }

  // Template para nuevo usuario creado desde Excel
  getNewUserCreatedTemplate(userData, password, institutionName, role) {
    // Determinar si es un rol administrativo (backoffice) o de usuario móvil
    // Nota: coordinador, familyadmin y familyviewer usan la app móvil
    const isAdminRole = role && (
      role.toLowerCase().includes('adminaccount') || 
      role.toLowerCase().includes('superadmin')
    );

    let accessSection = '';
    let title = '¡Bienvenido a KIKI!';

    if (isAdminRole) {
      // Para roles administrativos - acceso al backoffice
      accessSection = `
        <div style="background-color: #e8f4fd; border-left: 4px solid #0E5FCE; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #0E5FCE; font-weight: bold;">
            💻 Accede al panel de administración para gestionar tu institución
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://backoffice.kiki.com.ar" 
             style="background-color: #0E5FCE; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">
            🚀 Acceder al Backoffice
          </a>
        </div>
        
        <div style="background-color: #f8f9fa; border: 1px solid #dee2e6; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="color: #495057; margin-top: 0; margin-bottom: 10px;">📋 Como administrador podrás:</h4>
          <ul style="color: #6c757d; margin: 0; padding-left: 20px;">
            <li>Gestionar usuarios y permisos</li>
            <li>Crear y administrar actividades</li>
            <li>Enviar notificaciones</li>
            <li>Ver reportes y estadísticas</li>
            <li>Configurar la institución</li>
          </ul>
        </div>
      `;
      title = '¡Bienvenido al Backoffice de KIKI!';
    } else {
      // Para usuarios móviles - descarga de app
      accessSection = `
        <div style="background-color: #e8f4fd; border-left: 4px solid #0E5FCE; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #0E5FCE; font-weight: bold;">
            📱 Descarga la aplicación móvil para comenzar
          </p>
        </div>
        
        ${this.getAppStoreBadgesHTML()}
      `;
    }

    const content = `
      <h2 style="color: #333; margin-bottom: 20px;">Hola ${userData.name || 'Usuario'},</h2>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
        Se ha creado una cuenta para ti en el sistema KIKI con el rol de <strong>${role}</strong> en la institución <strong>${institutionName}</strong>.
      </p>
      
      <div style="background-color: #f8f9fa; border: 2px solid #0E5FCE; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #0E5FCE; margin-top: 0; margin-bottom: 15px;">Tus credenciales de acceso:</h3>
        <div style="margin-bottom: 10px;">
          <strong style="color: #333;">Usuario:</strong> 
          <span style="color: #666; font-family: monospace; background-color: #e9ecef; padding: 2px 6px; border-radius: 4px;">${userData.email}</span>
        </div>
        <div>
          <strong style="color: #333;">Contraseña:</strong> 
          <span style="color: #666; font-family: monospace; background-color: #e9ecef; padding: 2px 6px; border-radius: 4px;">${password}</span>
        </div>
      </div>
      
      ${accessSection}
      
      <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; color: #856404; font-size: 14px;">
          <strong>💡 Consejo:</strong> Te recomendamos cambiar tu contraseña después del primer inicio de sesión por seguridad.
        </p>
      </div>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
        Si tienes alguna pregunta, contacta al administrador de tu institución.
      </p>
      
      <p style="color: #333; font-weight: bold;">Saludos,<br>El equipo de KIKI</p>
    `;
    
    return this.getBaseTemplate(content, title);
  }

  // Template para asociación a institución
  getInstitutionAssociationTemplate(userData, institutionName, divisionName, role, studentInfo = null) {
    let studentDetails = '';
    if (studentInfo) {
      studentDetails = `
        <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h4 style="color: #155724; margin-top: 0; margin-bottom: 10px;">Información del estudiante:</h4>
          <p style="margin: 5px 0; color: #155724;"><strong>Nombre:</strong> ${studentInfo.nombre} ${studentInfo.apellido}</p>
          <p style="margin: 5px 0; color: #155724;"><strong>DNI:</strong> ${studentInfo.dni}</p>
          <p style="margin: 5px 0; color: #155724;"><strong>División:</strong> ${divisionName}</p>
        </div>
      `;
    }

    const content = `
      <h2 style="color: #333; margin-bottom: 20px;">Hola ${userData.name || 'Usuario'},</h2>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
        Has sido asociado a la institución <strong>${institutionName}</strong> con el siguiente rol:
      </p>
      
      <div style="background-color: #f8f9fa; border: 2px solid #0E5FCE; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #0E5FCE; margin-top: 0; margin-bottom: 15px;">Detalles de tu asociación:</h3>
        <div style="margin-bottom: 10px;">
          <strong style="color: #333;">Institución:</strong> 
          <span style="color: #666;">${institutionName}</span>
        </div>
        <div style="margin-bottom: 10px;">
          <strong style="color: #333;">División:</strong> 
          <span style="color: #666;">${divisionName}</span>
        </div>
        <div style="margin-bottom: 10px;">
          <strong style="color: #333;">Rol:</strong> 
          <span style="color: #666;">${role}</span>
        </div>
        ${studentDetails}
      </div>
      
      <div style="background-color: #e8f4fd; border-left: 4px solid #0E5FCE; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #0E5FCE; font-weight: bold;">
          📱 Descarga la aplicación móvil para comenzar
        </p>
      </div>
      
      ${this.getAppStoreBadgesHTML()}
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
        Si tienes alguna pregunta sobre tu asociación, contacta al administrador de la institución.
      </p>
      
      <p style="color: #333; font-weight: bold;">Saludos,<br>El equipo de KIKI</p>
    `;
    
    return this.getBaseTemplate(content, 'Asociación a Institución');
  }

  // Enviar email para nuevo usuario creado desde Excel
  async sendNewUserCreatedEmail(userData, password, institutionName, role) {
    const subject = 'KIKI - Tu cuenta ha sido creada';
    const htmlContent = this.getNewUserCreatedTemplate(userData, password, institutionName, role);
    
    return await this.sendEmail(userData.email, subject, htmlContent, 'newUserCreated');
  }

  // Enviar email para asociación a institución
  async sendInstitutionAssociationEmail(userData, institutionName, divisionName, role, studentInfo = null) {
    const subject = 'KIKI - Has sido asociado a una institución';
    const htmlContent = this.getInstitutionAssociationTemplate(userData, institutionName, divisionName, role, studentInfo);
    
    return await this.sendEmail(userData.email, subject, htmlContent, 'institutionAssociation');
  }
}

module.exports = new EmailService();
