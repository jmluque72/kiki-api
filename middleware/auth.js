const jwt = require('jsonwebtoken');
const User = require('../shared/models/User');
const config = require('../config/env.config');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token de acceso requerido'
    });
  }

  try {
    console.log('🔍 Verificando token...');
    console.log('🔑 JWT_SECRET:', config.JWT_SECRET);
    
    const decoded = jwt.verify(token, config.JWT_SECRET);
    console.log('✅ Token decodificado:', decoded);
    
    const user = await User.findById(decoded.userId).populate('role');
    
    if (!user) {
      console.log('❌ Usuario no encontrado');
      return res.status(401).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    if (user.status !== 'approved') {
      console.log('❌ Usuario no aprobado:', user.status);
      return res.status(401).json({
        success: false,
        message: 'Usuario no aprobado'
      });
    }

    console.log('✅ Usuario autenticado:', user.email);
    req.user = {
      _id: user._id,
      userId: user._id,
      email: user.email,
      name: user.name,
      role: user.role
    };
    next();
  } catch (error) {
    console.error('❌ Error verificando token:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Token inválido',
      error: error.message
    });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }

    if (!roles.includes(req.user.role.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para acceder a este recurso'
      });
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  requireRole
}; 