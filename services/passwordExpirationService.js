const User = require('../shared/models/User');
const { sendEmailAsync } = require('../config/email.config');

class PasswordExpirationService {
  /**
   * Verificar contraseñas expiradas y próximas a expirar
   */
  static async checkPasswordExpirations() {
    try {
      console.log('🔍 [PASSWORD EXPIRATION] Verificando contraseñas expiradas...');
      
      const now = new Date();
      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      // Buscar usuarios con contraseñas expiradas
      const expiredUsers = await User.find({
        status: 'approved',
        passwordExpiresAt: { $lt: now }
      }).select('email name passwordExpiresAt');
      
      // Buscar usuarios con contraseñas próximas a expirar
      const expiringSoonUsers = await User.find({
        status: 'approved',
        passwordExpiresAt: { 
          $gte: now, 
          $lte: sevenDaysFromNow 
        }
      }).select('email name passwordExpiresAt passwordExpirationWarnings');
      
      console.log(`📊 [PASSWORD EXPIRATION] ${expiredUsers.length} usuarios con contraseñas expiradas`);
      console.log(`📊 [PASSWORD EXPIRATION] ${expiringSoonUsers.length} usuarios con contraseñas próximas a expirar`);
      
      // Procesar usuarios con contraseñas expiradas
      for (const user of expiredUsers) {
        await this.handleExpiredPassword(user);
      }
      
      // Procesar usuarios con contraseñas próximas a expirar
      for (const user of expiringSoonUsers) {
        await this.handleExpiringPassword(user);
      }
      
      return {
        expiredCount: expiredUsers.length,
        expiringSoonCount: expiringSoonUsers.length,
        processed: true
      };
    } catch (error) {
      console.error('❌ [PASSWORD EXPIRATION] Error verificando expiraciones:', error);
      throw error;
    }
  }

  /**
   * Manejar contraseña expirada
   */
  static async handleExpiredPassword(user) {
    try {
      console.log(`🔒 [PASSWORD EXPIRATION] Contraseña expirada para: ${user.email}`);
      
      // Desactivar usuario temporalmente
      user.status = 'pending';
      await user.save();
      
      // Enviar email de notificación
      await this.sendPasswordExpiredEmail(user);
      
      console.log(`✅ [PASSWORD EXPIRATION] Usuario ${user.email} desactivado por contraseña expirada`);
    } catch (error) {
      console.error(`❌ [PASSWORD EXPIRATION] Error manejando contraseña expirada para ${user.email}:`, error);
    }
  }

  /**
   * Manejar contraseña próxima a expirar
   */
  static async handleExpiringPassword(user) {
    try {
      const daysUntilExpiration = user.getDaysUntilPasswordExpiration();
      
      // Solo enviar advertencia si no se ha enviado en las últimas 24 horas
      const hasRecentWarning = user.passwordExpirationWarnings.some(warning => 
        Math.abs(new Date() - warning) < 24 * 60 * 60 * 1000
      );
      
      if (!hasRecentWarning) {
        console.log(`⚠️ [PASSWORD EXPIRATION] Contraseña próxima a expirar para: ${user.email} (${daysUntilExpiration} días)`);
        
        // Marcar advertencia
        await user.markPasswordExpirationWarning();
        
        // Enviar email de advertencia
        await this.sendPasswordExpirationWarningEmail(user, daysUntilExpiration);
      }
    } catch (error) {
      console.error(`❌ [PASSWORD EXPIRATION] Error manejando contraseña próxima a expirar para ${user.email}:`, error);
    }
  }

  /**
   * Enviar email de contraseña expirada
   */
  static async sendPasswordExpiredEmail(user) {
    try {
      const subject = '🔒 Tu contraseña ha expirado - Kiki App';
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ff4444;">🔒 Contraseña Expirada</h2>
          <p>Hola ${user.name},</p>
          <p>Tu contraseña ha expirado y tu cuenta ha sido temporalmente desactivada por seguridad.</p>
          <p>Para reactivar tu cuenta, necesitas cambiar tu contraseña.</p>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>¿Qué hacer ahora?</h3>
            <ol>
              <li>Contacta al administrador del sistema</li>
              <li>Solicita un enlace para restablecer tu contraseña</li>
              <li>Crea una nueva contraseña segura</li>
            </ol>
          </div>
          <p>Si tienes preguntas, contacta al soporte técnico.</p>
          <p>Saludos,<br>Equipo de Kiki App</p>
        </div>
      `;
      
      await sendEmailAsync(user.email, subject, htmlContent);
      console.log(`📧 [PASSWORD EXPIRATION] Email de contraseña expirada enviado a: ${user.email}`);
    } catch (error) {
      console.error(`❌ [PASSWORD EXPIRATION] Error enviando email de contraseña expirada:`, error);
    }
  }

  /**
   * Enviar email de advertencia de expiración
   */
  static async sendPasswordExpirationWarningEmail(user, daysUntilExpiration) {
    try {
      const subject = `⚠️ Tu contraseña expira en ${daysUntilExpiration} días - Kiki App`;
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ff8800;">⚠️ Contraseña Próxima a Expirar</h2>
          <p>Hola ${user.name},</p>
          <p>Tu contraseña expirará en <strong>${daysUntilExpiration} días</strong>.</p>
          <p>Para evitar la desactivación de tu cuenta, cambia tu contraseña lo antes posible.</p>
          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <h3>Recomendaciones de seguridad:</h3>
            <ul>
              <li>Usa al menos 8 caracteres</li>
              <li>Incluye mayúsculas, minúsculas, números y símbolos</li>
              <li>No uses información personal</li>
              <li>No reutilices contraseñas anteriores</li>
            </ul>
          </div>
          <p>Si tienes problemas para cambiar tu contraseña, contacta al soporte técnico.</p>
          <p>Saludos,<br>Equipo de Kiki App</p>
        </div>
      `;
      
      await sendEmailAsync(user.email, subject, htmlContent);
      console.log(`📧 [PASSWORD EXPIRATION] Email de advertencia enviado a: ${user.email}`);
    } catch (error) {
      console.error(`❌ [PASSWORD EXPIRATION] Error enviando email de advertencia:`, error);
    }
  }

  /**
   * Obtener estadísticas de expiración de contraseñas
   */
  static async getExpirationStats() {
    try {
      const now = new Date();
      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      
      const stats = await User.aggregate([
        {
          $match: { status: 'approved' }
        },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            expiredPasswords: {
              $sum: {
                $cond: [{ $lt: ['$passwordExpiresAt', now] }, 1, 0]
              }
            },
            expiringIn7Days: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ['$passwordExpiresAt', now] },
                      { $lte: ['$passwordExpiresAt', sevenDaysFromNow] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            expiringIn30Days: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ['$passwordExpiresAt', now] },
                      { $lte: ['$passwordExpiresAt', thirtyDaysFromNow] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]);
      
      return stats[0] || {
        totalUsers: 0,
        expiredPasswords: 0,
        expiringIn7Days: 0,
        expiringIn30Days: 0
      };
    } catch (error) {
      console.error('❌ [PASSWORD EXPIRATION] Error obteniendo estadísticas:', error);
      throw error;
    }
  }

  /**
   * Extender expiración de contraseña para un usuario
   */
  static async extendUserPasswordExpiration(userId, days = 90) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }
      
      await user.extendPasswordExpiration(days);
      console.log(`✅ [PASSWORD EXPIRATION] Expiración extendida para usuario ${user.email}`);
      
      return user;
    } catch (error) {
      console.error('❌ [PASSWORD EXPIRATION] Error extendiendo expiración:', error);
      throw error;
    }
  }

  /**
   * Ejecutar verificación programada (para cron job)
   */
  static async runScheduledCheck() {
    try {
      console.log('🕐 [PASSWORD EXPIRATION] Ejecutando verificación programada...');
      
      const result = await this.checkPasswordExpirations();
      
      console.log(`✅ [PASSWORD EXPIRATION] Verificación completada:`, result);
      return result;
    } catch (error) {
      console.error('❌ [PASSWORD EXPIRATION] Error en verificación programada:', error);
      throw error;
    }
  }
}

module.exports = PasswordExpirationService;
