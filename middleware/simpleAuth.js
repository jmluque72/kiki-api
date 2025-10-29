const jwt = require('jsonwebtoken');
const User = require('../shared/models/User');
const ActiveAssociation = require('../shared/models/ActiveAssociation');

/**
 * Middleware simplificado de autenticación (solo JWT legacy)
 * Para debuggear problemas con el middleware híbrido
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      console.log('❌ [AUTH] No se proporcionó token de autorización');
      return res.status(401).json({ 
        success: false, 
        message: 'Token de autorización requerido' 
      });
    }

    console.log('🔍 [AUTH] Verificando token JWT legacy...');

    // Verificar como JWT legacy
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ [JWT] Token JWT legacy verificado:', decoded.email);

    const user = await User.findById(decoded.userId).populate('role');
    
    if (!user) {
      console.log('❌ [JWT] Usuario no encontrado');
      return res.status(401).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Verificar estado del usuario
    if (user.status !== 'approved') {
      console.log('❌ [JWT] Usuario no aprobado:', user.status);
      return res.status(403).json({
        success: false,
        message: 'Usuario no aprobado'
      });
    }

    console.log('✅ [JWT] Usuario autenticado:', user.email);
    
    // Obtener la asociación activa para usar el rol efectivo
    let effectiveRole = user.role;
    let effectiveAccount = null;
    let effectiveDivision = null;
    
    try {
      const activeAssociation = await ActiveAssociation.getActiveAssociation(user._id);
      if (activeAssociation) {
        console.log('🎯 [AUTH] Usando rol de asociación activa:', activeAssociation.role.nombre);
        effectiveRole = activeAssociation.role;
        effectiveAccount = activeAssociation.account;
        effectiveDivision = activeAssociation.division;
      } else {
        console.log('🎯 [AUTH] No hay asociación activa, usando rol del usuario:', user.role.nombre);
      }
    } catch (error) {
      console.log('🎯 [AUTH] Error obteniendo asociación activa, usando rol del usuario:', user.role.nombre);
    }
    
    req.user = {
      _id: user._id,
      userId: user._id,
      email: user.email,
      name: user.name,
      role: effectiveRole,
      effectiveAccount: effectiveAccount,
      effectiveDivision: effectiveDivision,
      telefono: user.telefono,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
    
    next();
  } catch (error) {
    console.error('❌ [AUTH] Error en middleware de autenticación:', error);
    return res.status(401).json({
      success: false,
      message: 'Token inválido',
      error: error.message
    });
  }
};

module.exports = { authenticateToken };
