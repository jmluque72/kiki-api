const jwt = require('jsonwebtoken');
const { generateSignedUrl } = require('../config/s3.config');
const User = require('../shared/models/User');
const RefreshTokenService = require('../services/refreshTokenService');

// Middleware de autenticación con refresh automático
const authenticateWithRefresh = async (req, res, next) => {
  console.log('🔧 [REFRESH AUTH] Usando autenticación con refresh automático');
  console.log('🔍 [REFRESH AUTH] Verificando access token...');
  
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      console.log('❌ [REFRESH AUTH] No se proporcionó token');
      return res.status(401).json({ 
        success: false,
        message: 'Token requerido',
        code: 'NO_TOKEN'
      });
    }

    try {
      // Intentar verificar el access token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
      console.log('✅ [REFRESH AUTH] Access token válido');
      
      // Buscar usuario en MongoDB
      const user = await User.findById(decoded.userId).populate('role');
      
      if (!user) {
        console.log('❌ [REFRESH AUTH] Usuario no encontrado en BD');
        return res.status(401).json({ 
          success: false,
          message: 'Usuario no encontrado',
          code: 'USER_NOT_FOUND'
        });
      }
      
      if (user.status !== 'approved') {
        console.log('❌ [REFRESH AUTH] Usuario no aprobado');
        return res.status(401).json({ 
          success: false,
          message: 'Usuario no aprobado',
          code: 'USER_NOT_APPROVED'
        });
      }
      
      // Generar URL firmada para el avatar si existe
      let avatarUrl = null;
      if (user.avatar) {
        try {
          avatarUrl = await generateSignedUrl(user.avatar);
          console.log('🖼️ [REFRESH AUTH] Avatar URL generada:', avatarUrl);
        } catch (avatarError) {
          console.error('❌ [REFRESH AUTH] Error generando avatar URL:', avatarError);
        }
      }
      
      req.user = {
        _id: user._id,
        userId: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        avatar: avatarUrl || user.avatar || 'https://via.placeholder.com/150/0E5FCE/FFFFFF?text=U',
        isCognitoUser: false
      };
      
      console.log('✅ [REFRESH AUTH] Usuario autenticado:', req.user.email);
      return next();
      
    } catch (jwtError) {
      // Si el token está expirado, intentar refresh automático
      if (jwtError.name === 'TokenExpiredError') {
        console.log('⏰ [REFRESH AUTH] Access token expirado, intentando refresh...');
        
        // Buscar refresh token en headers o body
        const refreshToken = req.headers['x-refresh-token'] || req.body?.refreshToken;
        
        if (!refreshToken) {
          console.log('❌ [REFRESH AUTH] No se proporcionó refresh token');
          return res.status(401).json({ 
            success: false,
            message: 'Token expirado y no se proporcionó refresh token',
            code: 'TOKEN_EXPIRED_NO_REFRESH'
          });
        }
        
        try {
          // Verificar y usar el refresh token
          const validRefreshToken = await RefreshTokenService.verifyAndUseRefreshToken(refreshToken);
          
          if (!validRefreshToken) {
            console.log('❌ [REFRESH AUTH] Refresh token inválido');
            return res.status(401).json({ 
              success: false,
              message: 'Refresh token inválido o expirado',
              code: 'INVALID_REFRESH_TOKEN'
            });
          }
          
          // Generar nuevo access token
          const newAccessToken = await RefreshTokenService.generateNewAccessToken(validRefreshToken);
          
          console.log('✅ [REFRESH AUTH] Nuevo access token generado automáticamente');
          
          // Agregar el nuevo token a la respuesta
          res.set('X-New-Access-Token', newAccessToken);
          res.set('X-Token-Refreshed', 'true');
          
          // Continuar con el usuario del refresh token
          const user = validRefreshToken.userId;
          
          // Generar URL firmada para el avatar si existe
          let avatarUrl = null;
          if (user.avatar) {
            try {
              avatarUrl = await generateSignedUrl(user.avatar);
            } catch (avatarError) {
              console.error('❌ [REFRESH AUTH] Error generando avatar URL:', avatarError);
            }
          }
          
          req.user = {
            _id: user._id,
            userId: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.status,
            avatar: avatarUrl || user.avatar || 'https://via.placeholder.com/150/0E5FCE/FFFFFF?text=U',
            isCognitoUser: false
          };
          
          console.log('✅ [REFRESH AUTH] Usuario autenticado con refresh:', req.user.email);
          return next();
          
        } catch (refreshError) {
          console.error('❌ [REFRESH AUTH] Error en refresh automático:', refreshError);
          return res.status(401).json({ 
            success: false,
            message: 'Error renovando token',
            code: 'REFRESH_ERROR'
          });
        }
      } else {
        // Otro tipo de error JWT
        console.error('❌ [REFRESH AUTH] Error verificando token:', jwtError);
        return res.status(401).json({ 
          success: false,
          message: 'Token inválido',
          code: 'INVALID_TOKEN'
        });
      }
    }
    
  } catch (error) {
    console.error('❌ [REFRESH AUTH] Error en autenticación:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Error interno del servidor',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Funciones de autorización (igual que antes)
const requireRole = (roles) => (req, res, next) => {
  if (!req.user || !req.user.role) {
    return res.status(403).json({ success: false, message: 'Acceso denegado: Usuario sin rol' });
  }
  
  // Manejar tanto estructura de objeto { nombre: 'rol' } como string directo
  const userRole = typeof req.user.role === 'string' ? req.user.role : req.user.role.nombre;
  
  if (!roles.includes(userRole)) {
    console.log('❌ [REQUIRE ROLE] Rol insuficiente:', userRole, 'Requerido:', roles);
    return res.status(403).json({ success: false, message: 'Acceso denegado: Rol insuficiente' });
  }
  
  console.log('✅ [REQUIRE ROLE] Rol autorizado:', userRole);
  next();
};

const requireAdmin = requireRole(['adminaccount', 'superadmin']);
const requireSuperAdmin = requireRole(['superadmin']);

module.exports = {
  authenticateWithRefresh,
  requireRole,
  requireAdmin,
  requireSuperAdmin
};
