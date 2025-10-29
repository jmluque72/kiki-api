const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const User = require('../shared/models/User');

class TwoFactorAuthService {
  /**
   * Generar secreto 2FA para un usuario
   */
  static async generateSecret(userId, userEmail) {
    try {
      console.log('🔐 [2FA] Generando secreto para usuario:', userId);
      
      const secret = speakeasy.generateSecret({
        name: `Kiki App (${userEmail})`,
        issuer: 'Kiki App',
        length: 32
      });
      
      console.log('✅ [2FA] Secreto generado exitosamente');
      return {
        secret: secret.base32,
        qrCodeUrl: secret.otpauth_url,
        manualEntryKey: secret.base32
      };
    } catch (error) {
      console.error('❌ [2FA] Error generando secreto:', error);
      throw error;
    }
  }

  /**
   * Generar QR Code para la app de autenticación
   */
  static async generateQRCode(otpauthUrl) {
    try {
      console.log('📱 [2FA] Generando QR Code...');
      
      const qrCodeDataURL = await QRCode.toDataURL(otpauthUrl, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      console.log('✅ [2FA] QR Code generado exitosamente');
      return qrCodeDataURL;
    } catch (error) {
      console.error('❌ [2FA] Error generando QR Code:', error);
      throw error;
    }
  }

  /**
   * Verificar código 2FA
   */
  static verifyToken(secret, token) {
    try {
      console.log('🔍 [2FA] Verificando token 2FA...');
      
      const verified = speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: token,
        window: 2 // Permitir 2 ventanas de tiempo (2 minutos)
      });
      
      console.log(verified ? '✅ [2FA] Token válido' : '❌ [2FA] Token inválido');
      return verified;
    } catch (error) {
      console.error('❌ [2FA] Error verificando token:', error);
      return false;
    }
  }

  /**
   * Habilitar 2FA para un usuario
   */
  static async enable2FA(userId, secret, verificationToken) {
    try {
      console.log('🔐 [2FA] Habilitando 2FA para usuario:', userId);
      
      // Verificar el token antes de habilitar
      const isValid = this.verifyToken(secret, verificationToken);
      if (!isValid) {
        throw new Error('Token de verificación inválido');
      }
      
      // Actualizar usuario con 2FA habilitado
      const user = await User.findByIdAndUpdate(
        userId,
        {
          twoFactorEnabled: true,
          twoFactorSecret: secret,
          twoFactorBackupCodes: this.generateBackupCodes()
        },
        { new: true }
      );
      
      if (!user) {
        throw new Error('Usuario no encontrado');
      }
      
      console.log('✅ [2FA] 2FA habilitado exitosamente para:', user.email);
      return {
        success: true,
        backupCodes: user.twoFactorBackupCodes
      };
    } catch (error) {
      console.error('❌ [2FA] Error habilitando 2FA:', error);
      throw error;
    }
  }

  /**
   * Deshabilitar 2FA para un usuario
   */
  static async disable2FA(userId, password) {
    try {
      console.log('🔐 [2FA] Deshabilitando 2FA para usuario:', userId);
      
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }
      
      // Verificar contraseña antes de deshabilitar
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        throw new Error('Contraseña incorrecta');
      }
      
      // Deshabilitar 2FA
      await User.findByIdAndUpdate(
        userId,
        {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorBackupCodes: null
        }
      );
      
      console.log('✅ [2FA] 2FA deshabilitado exitosamente para:', user.email);
      return { success: true };
    } catch (error) {
      console.error('❌ [2FA] Error deshabilitando 2FA:', error);
      throw error;
    }
  }

  /**
   * Generar códigos de respaldo
   */
  static generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      codes.push(this.generateRandomCode());
    }
    return codes;
  }

  /**
   * Generar código aleatorio
   */
  static generateRandomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Verificar código de respaldo
   */
  static async verifyBackupCode(userId, code) {
    try {
      console.log('🔍 [2FA] Verificando código de respaldo...');
      
      const user = await User.findById(userId);
      if (!user || !user.twoFactorBackupCodes) {
        return false;
      }
      
      const index = user.twoFactorBackupCodes.indexOf(code);
      if (index === -1) {
        return false;
      }
      
      // Remover el código usado
      user.twoFactorBackupCodes.splice(index, 1);
      await user.save();
      
      console.log('✅ [2FA] Código de respaldo válido');
      return true;
    } catch (error) {
      console.error('❌ [2FA] Error verificando código de respaldo:', error);
      return false;
    }
  }

  /**
   * Verificar si un usuario tiene 2FA habilitado
   */
  static async is2FAEnabled(userId) {
    try {
      const user = await User.findById(userId);
      return user && user.twoFactorEnabled === true;
    } catch (error) {
      console.error('❌ [2FA] Error verificando estado 2FA:', error);
      return false;
    }
  }

  /**
   * Obtener estado 2FA de un usuario
   */
  static async get2FAStatus(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return { enabled: false };
      }
      
      return {
        enabled: user.twoFactorEnabled === true,
        hasBackupCodes: user.twoFactorBackupCodes && user.twoFactorBackupCodes.length > 0,
        backupCodesCount: user.twoFactorBackupCodes ? user.twoFactorBackupCodes.length : 0
      };
    } catch (error) {
      console.error('❌ [2FA] Error obteniendo estado 2FA:', error);
      return { enabled: false };
    }
  }
}

module.exports = TwoFactorAuthService;
