const User = require('../shared/models/User');
const PasswordReset = require('../shared/models/PasswordReset');
const PasswordExpirationService = require('../services/passwordExpirationService');
const { sendPasswordResetEmail } = require('../config/email.config');

// Cambiar contraseña
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, isFirstLogin } = req.body;
    const userId = req.user.userId;

    console.log('🔑 [CHANGE PASSWORD] Usuario:', userId);
    console.log('🔑 [CHANGE PASSWORD] Es primer login:', isFirstLogin);
    console.log('🔑 [CHANGE PASSWORD] Usuario autenticado - no se requiere contraseña actual');

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña es requerida'
      });
    }

    // Validar requisitos de contraseña
    const passwordValidation = {
      minLength: newPassword.length >= 8,
      hasUpperCase: /[A-Z]/.test(newPassword),
      hasLowerCase: /[a-z]/.test(newPassword),
      hasNumbers: /\d/.test(newPassword),
      hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(newPassword)
    };

    const isValidPassword = Object.values(passwordValidation).every(requirement => requirement);
    
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña no cumple con los requisitos de seguridad'
      });
    }

    // Buscar usuario
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Ya no verificamos contraseña actual - el usuario ya está autenticado

    // Actualizar contraseña
    user.password = newPassword;
    user.isFirstLogin = false; // Marcar que ya no es primer login
    await user.save();

    console.log('✅ [CHANGE PASSWORD] Contraseña actualizada exitosamente para usuario:', userId);

    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente'
    });

  } catch (error) {
    console.error('❌ [CHANGE PASSWORD] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Generar código de recuperación y enviar email
exports.forgotPassword = async (req, res) => {
  try {
    console.log('🎯 [FORGOT PASSWORD] Solicitando recuperación de contraseña');
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'El email es requerido'
      });
    }

    console.log('📧 [FORGOT PASSWORD] Email solicitado:', email);

    // Verificar si el usuario existe
    const user = await User.findOne({ email: email.toLowerCase() });
    console.log('🔍 [FORGOT PASSWORD] Usuario encontrado:', user ? 'Sí' : 'No');
    
    if (!user) {
      console.log('❌ [FORGOT PASSWORD] Usuario no encontrado para email:', email);
      return res.status(404).json({
        success: false,
        message: 'No se encontró un usuario con ese email'
      });
    }

    console.log('✅ [FORGOT PASSWORD] Usuario encontrado:', {
      id: user._id,
      name: user.name,
      email: user.email,
      status: user.status
    });

    // Generar código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('🔑 [FORGOT PASSWORD] Código generado:', code);
    
    // El código expira en 10 minutos
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    // Eliminar códigos anteriores para este email
    await PasswordReset.deleteMany({ email: email.toLowerCase() });
    console.log('🗑️ [FORGOT PASSWORD] Códigos anteriores eliminados');

    // Crear nuevo código de recuperación
    const passwordReset = new PasswordReset({
      email: email.toLowerCase(),
      code,
      expiresAt
    });

    await passwordReset.save();
    console.log('💾 [FORGOT PASSWORD] Nuevo código guardado en base de datos');

    // Enviar email con el código usando el servicio existente
    try {
      await sendPasswordResetEmail(email, code, user.name);
      console.log('✅ [FORGOT PASSWORD] Email enviado exitosamente a:', email);
      
      res.json({
        success: true,
        message: 'Se ha enviado un código de recuperación a tu email',
        data: {
          email: email.toLowerCase()
        }
      });
    } catch (emailError) {
      console.error('❌ [FORGOT PASSWORD] Error enviando email:', emailError);
      
      // Si falla el envío de email, eliminar el código y devolver error
      await PasswordReset.deleteOne({ email: email.toLowerCase() });
      console.log('🗑️ [FORGOT PASSWORD] Código eliminado por fallo en email');
      
      res.status(500).json({
        success: false,
        message: 'Error enviando el email. Por favor, intenta nuevamente.'
      });
    }

  } catch (error) {
    console.error('❌ [FORGOT PASSWORD] Error interno:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Verificar código de recuperación
exports.verifyResetCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: 'Email y código son requeridos'
      });
    }

    // Buscar el código de recuperación
    const passwordReset = await PasswordReset.findOne({
      email: email.toLowerCase(),
      code
    });

    if (!passwordReset) {
      return res.status(400).json({
        success: false,
        message: 'Código inválido'
      });
    }

    // Verificar si el código es válido
    if (!passwordReset.isValid()) {
      return res.status(400).json({
        success: false,
        message: 'Código expirado o ya utilizado'
      });
    }

    res.json({
      success: true,
      message: 'Código verificado correctamente'
    });

  } catch (error) {
    console.error('Error en verify-reset-code:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Resetear contraseña
exports.resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, código y nueva contraseña son requeridos'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres'
      });
    }

    // Buscar el código de recuperación
    const passwordReset = await PasswordReset.findOne({
      email: email.toLowerCase(),
      code
    });

    if (!passwordReset) {
      return res.status(400).json({
        success: false,
        message: 'Código inválido'
      });
    }

    // Verificar si el código es válido
    if (!passwordReset.isValid()) {
      return res.status(400).json({
        success: false,
        message: 'Código expirado o ya utilizado'
      });
    }

    // Buscar el usuario
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Actualizar la contraseña del usuario (el middleware pre-save se encargará del hashing)
    user.password = newPassword;
    await user.save();

    // Marcar el código como usado
    await passwordReset.markAsUsed();

    console.log(`✅ [PASSWORD RESET] Contraseña actualizada para ${email}`);

    res.json({
      success: true,
      message: 'Contraseña actualizada correctamente'
    });

  } catch (error) {
    console.error('Error en reset-password:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Obtener estado de expiración de contraseña del usuario actual
exports.getPasswordExpirationStatus = async (req, res) => {
  try {
    console.log('🔍 [PASSWORD EXPIRATION] Obteniendo estado para:', req.user.email);
    
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    const isExpired = user.isPasswordExpired();
    const isExpiringSoon = user.isPasswordExpiringSoon();
    const daysUntilExpiration = user.getDaysUntilPasswordExpiration();
    
    res.json({
      success: true,
      data: {
        isExpired: isExpired,
        isExpiringSoon: isExpiringSoon,
        daysUntilExpiration: daysUntilExpiration,
        passwordExpiresAt: user.passwordExpiresAt,
        passwordChangedAt: user.passwordChangedAt
      }
    });
  } catch (error) {
    console.error('❌ [PASSWORD EXPIRATION] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo estado de expiración'
    });
  }
};

// Obtener estadísticas de expiración (solo administradores)
exports.getPasswordExpirationStats = async (req, res) => {
  try {
    console.log('📊 [PASSWORD EXPIRATION] Obteniendo estadísticas...');
    
    const stats = await PasswordExpirationService.getExpirationStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ [PASSWORD EXPIRATION] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo estadísticas de expiración'
    });
  }
};

// Extender expiración de contraseña (solo administradores)
exports.extendPasswordExpiration = async (req, res) => {
  try {
    const { userId, days = 90 } = req.body;
    
    console.log('⏰ [PASSWORD EXPIRATION] Extendiendo expiración para usuario:', userId);
    
    const user = await PasswordExpirationService.extendUserPasswordExpiration(userId, parseInt(days));
    
    res.json({
      success: true,
      message: `Expiración extendida por ${days} días`,
      data: {
        userId: user._id,
        email: user.email,
        newExpirationDate: user.passwordExpiresAt
      }
    });
  } catch (error) {
    console.error('❌ [PASSWORD EXPIRATION] Error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Error extendiendo expiración'
    });
  }
};

// Ejecutar verificación manual de expiraciones (solo superadmin)
exports.checkPasswordExpirations = async (req, res) => {
  try {
    console.log('🔍 [PASSWORD EXPIRATION] Ejecutando verificación manual...');
    
    const result = await PasswordExpirationService.runScheduledCheck();
    
    res.json({
      success: true,
      message: 'Verificación de expiraciones completada',
      data: result
    });
  } catch (error) {
    console.error('❌ [PASSWORD EXPIRATION] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error ejecutando verificación de expiraciones'
    });
  }
};

