const LoginAttempt = require('../shared/models/LoginAttempt');
const User = require('../shared/models/User');

class LoginMonitorService {
  /**
   * Registrar intento de login
   */
  static async logLoginAttempt(attemptData) {
    try {
      console.log('📊 [LOGIN MONITOR] Registrando intento de login:', attemptData.email);
      
      // Calcular score de riesgo
      const riskScore = LoginAttempt.calculateRiskScore(attemptData);
      
      // Detectar actividad sospechosa
      const suspiciousActivity = await LoginAttempt.detectSuspiciousActivity(
        attemptData.email, 
        attemptData.ipAddress
      );
      
      // Crear registro de intento
      const loginAttempt = new LoginAttempt({
        email: attemptData.email,
        ipAddress: attemptData.ipAddress,
        userAgent: attemptData.userAgent,
        success: attemptData.success,
        failureReason: attemptData.failureReason,
        twoFactorUsed: attemptData.twoFactorUsed || false,
        deviceInfo: attemptData.deviceInfo,
        location: attemptData.location,
        riskScore: riskScore,
        suspiciousActivity: suspiciousActivity.suspicious,
        metadata: attemptData.metadata
      });
      
      await loginAttempt.save();
      
      console.log(`📊 [LOGIN MONITOR] Intento registrado - Éxito: ${attemptData.success}, Riesgo: ${riskScore}%`);
      
      // Si es actividad sospechosa, tomar acciones
      if (suspiciousActivity.suspicious) {
        await this.handleSuspiciousActivity(attemptData, suspiciousActivity);
      }
      
      return loginAttempt;
    } catch (error) {
      console.error('❌ [LOGIN MONITOR] Error registrando intento:', error);
      throw error;
    }
  }

  /**
   * Manejar actividad sospechosa
   */
  static async handleSuspiciousActivity(attemptData, suspiciousActivity) {
    try {
      console.log('🚨 [LOGIN MONITOR] Actividad sospechosa detectada:', suspiciousActivity.reason);
      
      // Bloquear IP si hay múltiples intentos fallidos
      if (suspiciousActivity.reason === 'multiple_failed_attempts' && suspiciousActivity.count >= 10) {
        await LoginAttempt.blockIP(attemptData.ipAddress, 60); // 1 hora
        console.log(`🚫 [LOGIN MONITOR] IP ${attemptData.ipAddress} bloqueada por actividad sospechosa`);
      }
      
      // Notificar administradores (implementar en el futuro)
      await this.notifyAdmins(attemptData, suspiciousActivity);
      
    } catch (error) {
      console.error('❌ [LOGIN MONITOR] Error manejando actividad sospechosa:', error);
    }
  }

  /**
   * Notificar administradores sobre actividad sospechosa
   */
  static async notifyAdmins(attemptData, suspiciousActivity) {
    try {
      console.log('📧 [LOGIN MONITOR] Enviando notificación a administradores...');
      
      // Buscar administradores - primero obtener los IDs de los roles
      const Role = require('../shared/models/Role');
      const adminRoles = await Role.find({ 
        nombre: { $in: ['adminaccount', 'superadmin'] }
      }).select('_id');
      
      const adminRoleIds = adminRoles.map(role => role._id);
      
      const admins = await User.find({ 
        role: { $in: adminRoleIds },
        status: 'approved'
      }).select('email name');
      
      if (admins.length > 0) {
        // Enviar notificación (implementar en el futuro)
        console.log(`📧 [LOGIN MONITOR] Notificación enviada a ${admins.length} administradores`);
      }
      
    } catch (error) {
      console.error('❌ [LOGIN MONITOR] Error notificando administradores:', error);
    }
  }

  /**
   * Verificar si una IP está bloqueada
   */
  static async isIPBlocked(ipAddress) {
    try {
      const blockedAttempt = await LoginAttempt.findOne({
        ipAddress: ipAddress,
        blocked: true,
        blockedUntil: { $gt: new Date() }
      });
      
      return !!blockedAttempt;
    } catch (error) {
      console.error('❌ [LOGIN MONITOR] Error verificando bloqueo de IP:', error);
      return false;
    }
  }

  /**
   * Obtener estadísticas de login
   */
  static async getLoginStats(timeWindow = 24) {
    try {
      console.log(`📊 [LOGIN MONITOR] Obteniendo estadísticas de ${timeWindow}h...`);
      
      const stats = await LoginAttempt.getStats(timeWindow);
      
      return {
        timeWindow: timeWindow,
        stats: stats,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('❌ [LOGIN MONITOR] Error obteniendo estadísticas:', error);
      throw error;
    }
  }

  /**
   * Obtener intentos recientes de un usuario
   */
  static async getUserRecentAttempts(email, limit = 10) {
    try {
      const attempts = await LoginAttempt.find({ email: email })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('-__v');
      
      return attempts;
    } catch (error) {
      console.error('❌ [LOGIN MONITOR] Error obteniendo intentos del usuario:', error);
      throw error;
    }
  }

  /**
   * Obtener intentos sospechosos
   */
  static async getSuspiciousAttempts(timeWindow = 24, limit = 50) {
    try {
      const cutoffTime = new Date(Date.now() - timeWindow * 60 * 60 * 1000);
      
      const attempts = await LoginAttempt.find({
        suspiciousActivity: true,
        createdAt: { $gte: cutoffTime }
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('-__v');
      
      return attempts;
    } catch (error) {
      console.error('❌ [LOGIN MONITOR] Error obteniendo intentos sospechosos:', error);
      throw error;
    }
  }

  /**
   * Limpiar registros antiguos
   */
  static async cleanupOldAttempts(daysToKeep = 30) {
    try {
      console.log(`🧹 [LOGIN MONITOR] Limpiando registros de más de ${daysToKeep} días...`);
      
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
      
      const result = await LoginAttempt.deleteMany({
        createdAt: { $lt: cutoffDate },
        suspiciousActivity: false,
        blocked: false
      });
      
      console.log(`🧹 [LOGIN MONITOR] ${result.deletedCount} registros eliminados`);
      return result.deletedCount;
    } catch (error) {
      console.error('❌ [LOGIN MONITOR] Error limpiando registros antiguos:', error);
      throw error;
    }
  }

  /**
   * Obtener información del dispositivo desde User-Agent
   */
  static parseUserAgent(userAgent) {
    const deviceInfo = {
      platform: 'Unknown',
      browser: 'Unknown',
      version: 'Unknown',
      isMobile: false
    };
    
    if (!userAgent) return deviceInfo;
    
    // Detectar móvil
    deviceInfo.isMobile = /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    
    // Detectar navegador
    if (userAgent.includes('Chrome')) {
      deviceInfo.browser = 'Chrome';
    } else if (userAgent.includes('Firefox')) {
      deviceInfo.browser = 'Firefox';
    } else if (userAgent.includes('Safari')) {
      deviceInfo.browser = 'Safari';
    } else if (userAgent.includes('Edge')) {
      deviceInfo.browser = 'Edge';
    }
    
    // Detectar plataforma
    if (userAgent.includes('Windows')) {
      deviceInfo.platform = 'Windows';
    } else if (userAgent.includes('Mac')) {
      deviceInfo.platform = 'macOS';
    } else if (userAgent.includes('Linux')) {
      deviceInfo.platform = 'Linux';
    } else if (userAgent.includes('Android')) {
      deviceInfo.platform = 'Android';
    } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
      deviceInfo.platform = 'iOS';
    }
    
    return deviceInfo;
  }

  /**
   * Obtener información de ubicación (simulada)
   */
  static async getLocationInfo(ipAddress) {
    try {
      // En un entorno real, usar un servicio como MaxMind o IPinfo
      // Por ahora, retornar información simulada
      return {
        country: 'Argentina',
        region: 'Córdoba',
        city: 'Córdoba',
        timezone: 'America/Argentina/Cordoba'
      };
    } catch (error) {
      console.error('❌ [LOGIN MONITOR] Error obteniendo ubicación:', error);
      return null;
    }
  }
}

module.exports = LoginMonitorService;
