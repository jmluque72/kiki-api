const RefreshToken = require('../shared/models/RefreshToken');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class RefreshTokenService {
  /**
   * Generar un nuevo refresh token para un usuario
   */
  static async generateRefreshToken(userId, deviceInfo = {}) {
    try {
      console.log('🔄 [REFRESH TOKEN] Generando refresh token para usuario:', userId);
      
      // Revocar tokens anteriores del usuario (opcional - para seguridad)
      // await RefreshToken.revokeAllUserTokens(userId);
      
      // Generar token único
      const crypto = require('crypto');
      const tokenValue = crypto.randomBytes(64).toString('hex');
      
      // Crear nuevo refresh token
      const refreshToken = new RefreshToken({
        token: tokenValue,
        userId,
        deviceInfo,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 días
      });
      
      await refreshToken.save();
      
      console.log('✅ [REFRESH TOKEN] Refresh token generado:', refreshToken.token.substring(0, 16) + '...');
      return refreshToken;
      
    } catch (error) {
      console.error('❌ [REFRESH TOKEN] Error generando refresh token:', error);
      throw error;
    }
  }

  /**
   * Verificar y usar un refresh token
   */
  static async verifyAndUseRefreshToken(token) {
    try {
      console.log('🔍 [REFRESH TOKEN] Verificando refresh token...');
      
      const refreshToken = await RefreshToken.findOne({ 
        token, 
        isRevoked: false 
      }).populate('userId');
      
      if (!refreshToken) {
        console.log('❌ [REFRESH TOKEN] Token no encontrado o revocado');
        return null;
      }
      
      if (!refreshToken.isValid()) {
        console.log('❌ [REFRESH TOKEN] Token expirado');
        await refreshToken.revoke();
        return null;
      }
      
      // Actualizar último uso
      await refreshToken.updateLastUsed();
      
      console.log('✅ [REFRESH TOKEN] Token válido para usuario:', refreshToken.userId.email);
      return refreshToken;
      
    } catch (error) {
      console.error('❌ [REFRESH TOKEN] Error verificando token:', error);
      throw error;
    }
  }

  /**
   * Generar nuevo access token usando refresh token
   */
  static async generateNewAccessToken(refreshToken) {
    try {
      const user = refreshToken.userId;
      
      // Generar nuevo access token (más corto - 5 minutos)
      const accessToken = jwt.sign(
        { 
          userId: user._id,
          email: user.email,
          role: user.role._id
        },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '5m' } // 5 minutos
      );
      
      console.log('🔑 [REFRESH TOKEN] Nuevo access token generado');
      return accessToken;
      
    } catch (error) {
      console.error('❌ [REFRESH TOKEN] Error generando access token:', error);
      throw error;
    }
  }

  /**
   * Revocar un refresh token específico
   */
  static async revokeRefreshToken(token) {
    try {
      const refreshToken = await RefreshToken.findOne({ token });
      if (refreshToken) {
        await refreshToken.revoke();
        console.log('🔒 [REFRESH TOKEN] Token revocado');
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ [REFRESH TOKEN] Error revocando token:', error);
      throw error;
    }
  }

  /**
   * Revocar todos los refresh tokens de un usuario
   */
  static async revokeAllUserTokens(userId) {
    try {
      await RefreshToken.revokeAllUserTokens(userId);
      console.log('🔒 [REFRESH TOKEN] Todos los tokens del usuario revocados');
    } catch (error) {
      console.error('❌ [REFRESH TOKEN] Error revocando tokens del usuario:', error);
      throw error;
    }
  }

  /**
   * Limpiar tokens expirados
   */
  static async cleanExpiredTokens() {
    try {
      await RefreshToken.cleanExpiredTokens();
    } catch (error) {
      console.error('❌ [REFRESH TOKEN] Error limpiando tokens:', error);
      throw error;
    }
  }

  /**
   * Obtener información del dispositivo desde request
   */
  static getDeviceInfo(req) {
    return {
      userAgent: req.get('User-Agent') || 'Unknown',
      ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
      deviceId: req.get('X-Device-ID') || null
    };
  }
}

module.exports = RefreshTokenService;
