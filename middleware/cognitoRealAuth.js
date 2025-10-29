const jwt = require('jsonwebtoken');
const { generateSignedUrl } = require('../config/s3.config');
const User = require('../shared/models/User');

// Middleware de autenticación simple con MongoDB
const authenticateToken = async (req, res, next) => {
  console.log('🔧 [MONGO AUTH] Usando autenticación con MongoDB');
  console.log('🔍 [MONGO AUTH] Verificando token...');
  
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      console.log('❌ [MONGO AUTH] No se proporcionó token');
      return res.status(401).json({ message: 'Token requerido' });
    }

    // Verificar token JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    console.log('🔍 [MONGO AUTH] Token decodificado:', decoded);
    
    // Buscar usuario en MongoDB
    const user = await User.findById(decoded.userId).populate('role');
    
    if (!user) {
      console.log('❌ [MONGO AUTH] Usuario no encontrado en BD');
      return res.status(401).json({ message: 'Usuario no encontrado' });
    }
    
    if (user.status !== 'approved') {
      console.log('❌ [MONGO AUTH] Usuario no aprobado');
      return res.status(401).json({ message: 'Usuario no aprobado' });
    }
    
    // Generar URL firmada para el avatar si existe
    let avatarUrl = null;
    if (user.avatar) {
      try {
        avatarUrl = await generateSignedUrl(user.avatar);
        console.log('🖼️ [MONGO AUTH] Avatar URL generada:', avatarUrl);
      } catch (avatarError) {
        console.error('❌ [MONGO AUTH] Error generando avatar URL:', avatarError);
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
    
    console.log('✅ [MONGO AUTH] Usuario autenticado:', req.user.email);
    return next();
    
  } catch (error) {
    console.error('❌ [MONGO AUTH] Error verificando token:', error);
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
    console.log('❌ [REQUIRE ROLE] Rol insuficiente:', userRole, 'Requerido:', roles);
    return res.status(403).json({ success: false, message: 'Acceso denegado: Rol insuficiente' });
  }
  
  console.log('✅ [REQUIRE ROLE] Rol autorizado:', userRole);
  next();
};

const requireAdmin = requireRole(['adminaccount', 'superadmin']);
const requireSuperAdmin = requireRole(['superadmin']);

module.exports = {
  authenticateToken,
  requireRole,
  requireAdmin,
  requireSuperAdmin
};