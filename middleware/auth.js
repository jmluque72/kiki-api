const jwt = require('jsonwebtoken');
const User = require('../shared/models/User');
const config = require('../config/env.config');
const logger = require('../utils/logger');

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
    if (!config.JWT_SECRET) {
      logger.error('[AUTH] JWT_SECRET no configurado');
      return res.status(500).json({
        success: false,
        message: 'Error de configuración del servidor'
      });
    }
    
    logger.debug('[AUTH] Verificando token...');
    const decoded = jwt.verify(token, config.JWT_SECRET);
    logger.debug('[AUTH] Token decodificado exitosamente');
    
    const user = await User.findById(decoded.userId).populate('role');
    
    if (!user) {
      logger.warn('[AUTH] Usuario no encontrado', { userId: decoded.userId });
      return res.status(401).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    if (user.status !== 'approved') {
      logger.warn('[AUTH] Usuario no aprobado', { userId: user._id, status: user.status });
      return res.status(401).json({
        success: false,
        message: 'Usuario no aprobado'
      });
    }

    logger.info('[AUTH] Usuario autenticado', { userId: user._id });
    req.user = {
      _id: user._id,
      userId: user._id,
      email: user.email,
      name: user.name,
      role: user.role
    };
    next();
  } catch (error) {
    logger.error('[AUTH] Error verificando token', { error: error.message });
    return res.status(401).json({
      success: false,
      message: 'Token inválido'
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