const jwt = require('jsonwebtoken');
const { generateSignedUrl } = require('../config/s3.config');
const User = require('../shared/models/User');
const logger = require('../utils/logger');

// Middleware de autenticación simple con MongoDB
const authenticateToken = async (req, res, next) => {
  logger.debug('[MONGO AUTH] Verificando token...');
  
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      logger.warn('[MONGO AUTH] No se proporcionó token');
      return res.status(401).json({ message: 'Token requerido' });
    }

    // Verificar token JWT
    const config = require('../config/env.config');
    if (!config.JWT_SECRET) {
      logger.error('[MONGO AUTH] JWT_SECRET no configurado');
      return res.status(500).json({ message: 'Error de configuración del servidor' });
    }
    
    const decoded = jwt.verify(token, config.JWT_SECRET);
    logger.debug('[MONGO AUTH] Token decodificado exitosamente');
    
    // Buscar usuario en MongoDB
    const user = await User.findById(decoded.userId).populate('role');
    
    if (!user) {
      logger.warn('[MONGO AUTH] Usuario no encontrado en BD', { userId: decoded.userId });
      return res.status(401).json({ message: 'Usuario no encontrado' });
    }
    
    if (user.status !== 'approved') {
      logger.warn('[MONGO AUTH] Usuario no aprobado', { userId: user._id, status: user.status });
      return res.status(401).json({ message: 'Usuario no aprobado' });
    }
    
    // Generar URL firmada para el avatar si existe
    let avatarUrl = null;
    if (user.avatar) {
      try {
        avatarUrl = await generateSignedUrl(user.avatar);
        logger.debug('[MONGO AUTH] Avatar URL generada');
      } catch (avatarError) {
        logger.error('[MONGO AUTH] Error generando avatar URL', { error: avatarError.message });
      }
    }
    
    req.user = {
      _id: user._id,
      userId: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      account: user.account, // Agregar el campo account
      status: user.status,
      avatar: avatarUrl || user.avatar || 'https://via.placeholder.com/150/0E5FCE/FFFFFF?text=U',
      isCognitoUser: false
    };
    
    logger.info('[MONGO AUTH] Usuario autenticado', { userId: user._id });
    return next();
    
  } catch (error) {
    logger.error('[MONGO AUTH] Error verificando token', { error: error.message });
    return res.status(401).json({ message: 'Token inválido' });
  }
};

// Funciones de autorización
const requireRole = (roles) => (req, res, next) => {
  if (!req.user || !req.user.role) {
    return res.status(403).json({ success: false, message: 'Acceso denegado: Usuario sin rol' });
  }
  
  // Manejar tanto estructura de objeto { nombre: 'rol' } como string directo
  const userRole = typeof req.user.role === 'string' ? req.user.role : req.user.role.nombre;
  
  if (!roles.includes(userRole)) {
    logger.warn('[REQUIRE ROLE] Rol insuficiente', { userRole, required: roles });
    return res.status(403).json({ success: false, message: 'Acceso denegado: Rol insuficiente' });
  }
  
  logger.debug('[REQUIRE ROLE] Rol autorizado', { userRole });
  next();
};

const requireAdmin = requireRole(['adminaccount', 'superadmin']);
const requireSuperAdmin = requireRole(['superadmin']);

// Middleware para establecer la institución del usuario
const setUserInstitution = async (req, res, next) => {
  try {
    logger.debug('[MIDDLEWARE] setUserInstitution ejecutándose');
    
    // Obtener el nombre del rol de manera flexible
    let roleName = null;
    if (typeof req.user.role === 'string') {
      roleName = req.user.role;
    } else if (req.user.role?.nombre) {
      roleName = req.user.role.nombre;
    }
    
    if (req.user && (roleName === 'adminaccount' || roleName === 'accountadmin')) {
      logger.debug('[MIDDLEWARE] Usuario adminaccount/accountadmin detectado');
      
      // Si no tiene cuenta asignada, usar la cuenta BAMBINO por defecto
      let accountId = req.user.account;
      if (!accountId) {
        logger.warn('[MIDDLEWARE] Usuario adminaccount sin cuenta, asignando BAMBINO por defecto');
        accountId = '68dc5f1a626391464e2bcb3c';
        
        // Actualizar el usuario en la base de datos
        const User = require('../shared/models/User');
        await User.findByIdAndUpdate(req.user._id, { account: accountId });
        logger.info('[MIDDLEWARE] Cuenta BAMBINO asignada al usuario');
      }
      
      // Buscar la cuenta
      const Account = require('../shared/models/Account');
      const account = await Account.findById(accountId);
      
      if (account) {
        req.userInstitution = {
          _id: account._id,
          nombre: account.nombre
        };
        logger.debug('[MIDDLEWARE] Institución establecida', { accountId: account._id });
      } else {
        logger.error('[MIDDLEWARE] Cuenta no encontrada', { accountId });
      }
    }
    next();
  } catch (error) {
    logger.error('[MIDDLEWARE] Error en setUserInstitution', { error: error.message });
    next(error);
  }
};

module.exports = {
  authenticateToken,
  requireRole,
  requireAdmin,
  requireSuperAdmin,
  setUserInstitution
};