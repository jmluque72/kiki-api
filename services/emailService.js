const nodemailer = require('nodemailer');
const config = require('../config/env.config');

class EmailService {
  constructor() {
    // Configurar Gmail en lugar de AWS SES
    this.gmailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
    
    // Email remitente
    this.fromEmail = process.env.GMAIL_USER || 'noreplykikiapp@gmail.com';
    this.fromName = 'Kiki App';
  }

  // Función helper para generar badges de App Store y Google Play (URLs públicas)
  getAppStoreBadgesHTML() {
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
  }

  // Template base moderno con header de KIKI (formato unificado)
  getBaseTemplate(content, title = 'KIKI') {
    // Usar URL pública permanente de Google Drive (formato que funciona en emails)
    // Formato: https://drive.google.com/uc?export=view&id=FILE_ID
    const logoUrl = 'https://drive.google.com/uc?export=view&id=1jPsauBej_P9NnG57YnrpnFz50UZQftpz';
    const logoHTML = `
      <div style="text-align: center; margin-bottom: 20px; padding: 20px 0;">
        <img src="${logoUrl}" alt="Kiki Logo" style="max-width: 200px; height: auto; margin: 0 auto; display: block;">
      </div>
    `;
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
        ${logoHTML}
        <div style="background-color: #0E5FCE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">${title}</h1>
        </div>
        
        <div style="background-color: #ffffff; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          ${content}
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
            Este es un email automático, por favor no respondas a este mensaje.<br>
            © ${new Date().getFullYear()} Kiki App. Todos los derechos reservados.
          </p>
        </div>
      </div>
    `;
  }

  // Template para usuario familyviewer creado
  getFamilyViewerCreatedTemplate(userData, password, institutionName) {
    const content = `
      <h2 style="color: #333; margin-bottom: 20px;">Hola ${userData.name || 'Usuario'},</h2>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
        Se ha creado una cuenta para ti en el sistema KIKI con acceso a la institución <strong>${institutionName}</strong>.
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
      
      <div style="background-color: #e8f4fd; border-left: 4px solid #0E5FCE; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #0E5FCE; font-weight: bold;">
          📱 Descarga la aplicación móvil para comenzar
        </p>
      </div>
      
      ${this.getAppStoreBadgesHTML()}
      
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
    
    return this.getBaseTemplate(content, '¡Bienvenido a KIKI!');
  }

  // Template para recuperación de contraseña
  getPasswordRecoveryTemplate(email, code) {
    const content = `
      <h2 style="color: #333; margin-bottom: 20px;">Hola,</h2>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
        Has solicitado recuperar tu contraseña en KIKI.
      </p>
      
      <div style="background-color: #f8f9fa; border: 2px solid #0E5FCE; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #0E5FCE; margin-top: 0; margin-bottom: 15px;">Tu código de verificación:</h3>
        <div style="text-align: center;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; background-color: #e9ecef; padding: 15px 25px; border-radius: 8px; font-family: monospace; color: #0E5FCE; display: inline-block;">${code}</span>
        </div>
      </div>
      
      <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; color: #856404; font-size: 14px;">
          <strong>⏰ Importante:</strong> Este código expira en 10 minutos.
        </p>
      </div>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
        Si no solicitaste este código, puedes ignorar este email.
      </p>
      
      <p style="color: #333; font-weight: bold;">Saludos,<br>El equipo de KIKI</p>
    `;
    
    return this.getBaseTemplate(content, 'Recuperación de Contraseña');
  }

  // Template para notificación general
  getNotificationTemplate(title, message) {
    const content = `
      <h2 style="color: #333; margin-bottom: 20px;">Hola,</h2>
      
      <div style="background-color: #e8f4fd; border-left: 4px solid #0E5FCE; padding: 15px; margin: 20px 0;">
        <h3 style="color: #0E5FCE; margin-top: 0; margin-bottom: 10px;">${title}</h3>
        <div style="color: #666; line-height: 1.6;">
          ${message}
        </div>
      </div>
      
      <p style="color: #333; font-weight: bold;">Saludos,<br>El equipo de KIKI</p>
    `;
    
    return this.getBaseTemplate(content, 'Nueva Notificación');
  }

  // Enviar email usando Gmail (temporal, después migrar a SES)
  async sendEmail(to, subject, htmlContent) {
    try {
      const mailOptions = {
        from: `${this.fromName} <${this.fromEmail}>`,
        to: to,
        subject: subject,
        html: htmlContent
      };

      const result = await this.gmailTransporter.sendMail(mailOptions);
      console.log('✅ [EMAIL SERVICE] Email enviado exitosamente a:', to);
      console.log('📧 [EMAIL SERVICE] Message ID:', result.messageId);
      
      return {
        success: true,
        messageId: result.messageId
      };
    } catch (error) {
      console.error('❌ [EMAIL SERVICE] Error enviando email a:', to, error);
      throw new Error(`Error enviando email: ${error.message}`);
    }
  }

  // Enviar email para usuario familyviewer creado
  async sendFamilyViewerCreatedEmail(userData, password, institutionName) {
    const subject = 'Bienvenido a KIKI - Tu cuenta ha sido creada';
    const htmlContent = this.getFamilyViewerCreatedTemplate(userData, password, institutionName);
    
    return await this.sendEmail(userData.email, subject, htmlContent);
  }

  // Enviar email de recuperación de contraseña
  async sendPasswordRecoveryEmail(email, code) {
    const subject = 'KIKI - Código de recuperación de contraseña';
    const htmlContent = this.getPasswordRecoveryTemplate(email, code);
    
    return await this.sendEmail(email, subject, htmlContent);
  }

  // Enviar notificación general
  async sendNotificationEmail(email, title, message) {
    const subject = `KIKI - ${title}`;
    const htmlContent = this.getNotificationTemplate(title, message);
    
    return await this.sendEmail(email, subject, htmlContent);
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
    
    return await this.sendEmail(userData.email, subject, htmlContent);
  }

  // Enviar email para asociación a institución
  async sendInstitutionAssociationEmail(userData, institutionName, divisionName, role, studentInfo = null) {
    const subject = 'KIKI - Has sido asociado a una institución';
    const htmlContent = this.getInstitutionAssociationTemplate(userData, institutionName, divisionName, role, studentInfo);
    
    return await this.sendEmail(userData.email, subject, htmlContent);
  }
}

module.exports = new EmailService();
