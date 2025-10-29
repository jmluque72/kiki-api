const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Importar configuración
const config = require('../../config/env.config');

// Importar modelos
const User = require('../../shared/models/User');
const Role = require('../../shared/models/Role');
const PasswordReset = require('../../shared/models/PasswordReset');
const Shared = require('../../shared/models/Shared');
const ActiveAssociation = require('../../shared/models/ActiveAssociation');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../../config/email.config');

const app = express();

// Middleware de seguridad
app.use(helmet());

// CORS
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:8080',
      'http://localhost:8081',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:8081',
      'https://backoffice.kiki.com.ar',
      'http://backoffice.kiki.com.ar',
      process.env.FRONTEND_URL
    ].filter(Boolean);
    
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // límite de 100 requests por IP por ventana
  message: {
    success: false,
    message: 'Demasiadas solicitudes, intenta de nuevo más tarde'
  }
});
app.use(limiter);

// Logging
app.use(morgan('combined'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Conectar a MongoDB
mongoose.connect(config.MONGODB_URI)
  .then(() => console.log('✅ Auth Service conectado a MongoDB'))
  .catch(err => console.error('❌ Error conectando Auth Service a MongoDB:', err));

// Middleware de autenticación
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
    const decoded = jwt.verify(token, config.JWT_SECRET);
    const user = await User.findById(decoded.userId).populate('role');
    
    if (!user || !user.activo) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no válido o inactivo'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token inválido'
    });
  }
};

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Auth Service está funcionando correctamente',
    timestamp: new Date().toISOString(),
    service: 'auth-service',
    version: '1.0.0'
  });
});

// ===== RUTAS DE AUTENTICACIÓN =====

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔍 Login attempt:', email);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email y contraseña son requeridos'
      });
    }

    // Buscar usuario en la base de datos
    const user = await User.findOne({ email }).populate('role');
    
    if (!user) {
      console.log('❌ Usuario no encontrado:', email);
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    console.log('✅ Usuario encontrado:', user.email);
    console.log('📊 Status:', user.status);
    console.log('🎭 Rol:', user.role?.nombre);
    console.log('🔑 isFirstLogin:', user.isFirstLogin);

    // Verificar si el usuario está activo
    if (user.status !== 'approved') {
      return res.status(401).json({
        success: false,
        message: 'Usuario no aprobado o inactivo'
      });
    }

    // Verificar contraseña
    console.log('🔑 Verificando contraseña...');
    const isPasswordValid = await user.comparePassword(password);
    console.log('✅ Contraseña válida:', isPasswordValid);
    
    if (!isPasswordValid) {
      console.log('❌ Contraseña inválida');
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Verificar que el usuario tenga al menos una asociación aprobada (excepto superadmin)
    if (user.role?.nombre !== 'superadmin') {
      const userAssociations = await Shared.find({ 
        user: user._id 
      }).populate('account', 'nombre razonSocial activo');

      // Verificar si tiene al menos una asociación activa
      const hasActiveAssociation = userAssociations.some(assoc => assoc.status === 'active');
      
      if (!hasActiveAssociation) {
        return res.status(403).json({
          success: false,
          message: 'Tu cuenta está pendiente de aprobación. Contacta al administrador de tu institución.',
          code: 'PENDING_APPROVAL'
        });
      }
    }

    // Obtener las asociaciones del usuario (shared) para la respuesta
    const userAssociations = await Shared.find({ 
      user: user._id 
    }).populate('account', 'nombre razonSocial activo')
      .populate('division', '_id nombre descripcion');

    // Actualizar último login
    user.lastLogin = new Date();
    await user.save();

    // Generar URL firmada para el avatar si existe
    let avatarUrl = null;
    if (user.avatar) {
      try {
        const { generateSignedUrl } = require('../../config/s3.config');
        avatarUrl = await generateSignedUrl(user.avatar, 172800); // 2 días
      } catch (error) {
        console.error('Error generando URL firmada para avatar:', error);
        // Si falla la URL firmada, usar la URL directa
        avatarUrl = user.avatar;
      }
    }

    // Buscar la asociación activa del usuario
    console.log('🎯 Buscando asociación activa del usuario...');
    let activeAssociation = null;
    try {
      const ActiveAssociation = require('../../shared/models/ActiveAssociation');
      activeAssociation = await ActiveAssociation.getActiveAssociation(user._id);
      
      if (activeAssociation) {
        console.log('✅ Asociación activa encontrada:', activeAssociation.account.nombre);
        console.log('   - Rol activo:', activeAssociation.role.nombre);
        console.log('   - División:', activeAssociation.division?.nombre || 'Sin división');
      } else {
        console.log('ℹ️ No hay asociación activa para este usuario');
      }
    } catch (error) {
      console.error('❌ Error obteniendo asociación activa:', error);
    }

    // Procesar avatar del estudiante en activeAssociation para generar URL firmada
    let processedActiveAssociation = null;
    if (activeAssociation) {
      processedActiveAssociation = {
        _id: activeAssociation._id.toString(),
        activeShared: activeAssociation.activeShared._id.toString(),
        account: activeAssociation.account,
        role: activeAssociation.role,
        division: activeAssociation.division,
        student: activeAssociation.student,
        activatedAt: activeAssociation.activatedAt
      };
      
      // Procesar avatar del estudiante para generar URL firmada
      if (activeAssociation.student && activeAssociation.student.avatar) {
        try {
          console.log('🎓 [LOGIN] Procesando avatar del estudiante en activeAssociation:', activeAssociation.student._id);
          console.log('🎓 [LOGIN] Avatar original:', activeAssociation.student.avatar);
          
          // Verificar si es una key de S3 o una URL local
          if (activeAssociation.student.avatar.startsWith('http')) {
            console.log('🎓 [LOGIN] Es una URL completa, usando tal como está');
            // Es una URL completa (puede ser local o S3), no hacer nada
          } else if (activeAssociation.student.avatar.includes('students/')) {
            // Es una key de S3 para estudiantes, generar URL firmada
            console.log('🎓 [LOGIN] Es una key de S3 para estudiantes, generando URL firmada');
            const { generateSignedUrl } = require('../../config/s3.config');
            const signedUrl = await generateSignedUrl(activeAssociation.student.avatar, 172800); // 2 días
            console.log('🎓 [LOGIN] URL firmada generada:', signedUrl);
            processedActiveAssociation.student.avatar = signedUrl;
          } else {
            // Es una key local, generar URL local
            const localUrl = `${req.protocol}://${req.get('host')}/uploads/${activeAssociation.student.avatar.split('/').pop()}`;
            console.log('🎓 [LOGIN] URL local generada:', localUrl);
            processedActiveAssociation.student.avatar = localUrl;
          }
        } catch (error) {
          console.error('❌ [LOGIN] Error procesando avatar del estudiante:', error);
          // Si falla, usar URL directa
          const fallbackUrl = `${req.protocol}://${req.get('host')}/uploads/${activeAssociation.student.avatar.split('/').pop()}`;
          console.log('🎓 [LOGIN] Usando URL de fallback:', fallbackUrl);
          processedActiveAssociation.student.avatar = fallbackUrl;
        }
      }
    }

    // Generar token JWT
    const token = user.generateToken();

    // Determinar qué rol mostrar (priorizar el de la asociación activa)
    const displayRole = activeAssociation?.role || user.role;
    const displayAccount = activeAssociation?.account || null;
    const displayDivision = activeAssociation?.division || null;

    res.json({
      success: true,
      message: 'Login exitoso',
      data: {
        token,
        user: {
          _id: user._id,
          email: user.email,
          nombre: user.name,
          role: displayRole, // Usar el rol de la asociación activa si existe
          avatar: avatarUrl,
          activo: user.status === 'approved',
          isFirstLogin: user.isFirstLogin,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        },
        activeAssociation: processedActiveAssociation,
        associations: userAssociations.map(shared => ({
          _id: shared._id,
          account: {
            _id: shared.account._id,
            nombre: shared.account.nombre,
            razonSocial: shared.account.razonSocial,
            activo: shared.account.activo
          },
          division: shared.division ? {
            _id: shared.division._id,
            nombre: shared.division.nombre,
            descripcion: shared.division.descripcion
          } : null,
          status: shared.status,
          createdAt: shared.createdAt,
          updatedAt: shared.updatedAt
        }))
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Registro
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, nombre } = req.body;

    if (!email || !password || !nombre) {
      return res.status(400).json({
        success: false,
        message: 'Email, contraseña y nombre son requeridos'
      });
    }

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'El email ya está registrado'
      });
    }

    // Obtener rol por defecto (familyviewer)
    const defaultRole = await Role.findOne({ nombre: 'familyviewer' });
    if (!defaultRole) {
      return res.status(500).json({
        success: false,
        message: 'Error: Rol por defecto no encontrado'
      });
    }

    const user = new User({
      name: nombre,
      email,
      password,
      role: defaultRole._id,
      status: 'approved'
    });

    await user.save();

    const token = user.generateToken();

    // Enviar email de bienvenida
    try {
      await sendWelcomeEmail(user.email, user.name);
    } catch (emailError) {
      console.error('Error enviando email de bienvenida:', emailError);
      // No fallar el registro por error de email
    }

    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      data: {
        token,
        user: {
          _id: user._id,
          email: user.email,
          nombre: user.name,
          role: defaultRole,
          activo: user.activo,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Obtener perfil
app.get('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        _id: req.user._id,
        email: req.user.email,
        nombre: req.user.name,
        role: req.user.role,
        activo: req.user.activo,
        createdAt: req.user.createdAt,
        updatedAt: req.user.updatedAt
      }
    });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Solicitar reset de contraseña
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email es requerido'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Por seguridad, no revelar si el email existe o no
      return res.json({
        success: true,
        message: 'Si el email existe, recibirás instrucciones para resetear tu contraseña'
      });
    }

    // Generar token de reset
    const resetToken = jwt.sign(
      { userId: user._id, email: user.email },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Guardar token en base de datos
    await PasswordReset.findOneAndUpdate(
      { email },
      { 
        email, 
        token: resetToken, 
        expiresAt: new Date(Date.now() + 3600000) // 1 hora
      },
      { upsert: true, new: true }
    );

    // Enviar email
    try {
      await sendPasswordResetEmail(user.email, user.name, resetToken);
    } catch (emailError) {
      console.error('Error enviando email de reset:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Error enviando email de reset'
      });
    }

    res.json({
      success: true,
      message: 'Si el email existe, recibirás instrucciones para resetear tu contraseña'
    });
  } catch (error) {
    console.error('Error en forgot-password:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Reset de contraseña
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token y nueva contraseña son requeridos'
      });
    }

    // Verificar token
    const resetRecord = await PasswordReset.findOne({ token });
    if (!resetRecord || resetRecord.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Token inválido o expirado'
      });
    }

    // Buscar usuario
    const user = await User.findOne({ email: resetRecord.email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Actualizar contraseña
    user.password = newPassword;
    await user.save();

    // Eliminar token usado
    await PasswordReset.deleteOne({ token });

    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente'
    });
  } catch (error) {
    console.error('Error en reset-password:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Middleware de manejo de errores
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor'
  });
});

// Middleware para rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint no encontrado'
  });
});

const PORT = config.AUTH_SERVICE_PORT || 3004;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔐 Auth Service corriendo en puerto ${PORT}`);
  console.log(`📡 Health check disponible en http://localhost:${PORT}/health`);
  console.log(`🌐 API accesible desde la red local en http://0.0.0.0:${PORT}`);
});

module.exports = app;
