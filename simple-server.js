const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

// Importar configuración
require('dotenv').config();
const config = require('./config/database');
const { generateSignedUrl } = require('./config/s3.config');

// Importar modelos
const User = require('./shared/models/User');
const Account = require('./shared/models/Account');
const Group = require('./shared/models/Group');
const Event = require('./shared/models/Event');
const Role = require('./shared/models/Role');
const Shared = require('./shared/models/Shared');
const Grupo = require('./shared/models/Grupo');
const Asistencia = require('./shared/models/Asistencia');
const Activity = require('./shared/models/Activity');
const Student = require('./shared/models/Student');
const Notification = require('./shared/models/Notification');
const Pickup = require('./shared/models/Pickup');
const RequestedShared = require('./shared/models/RequestedShared');

// Función helper para crear asociaciones según el rol
async function createAssociationByRole(userId, accountId, roleName, divisionId = null, studentId = null, createdBy) {
  try {
    // Obtener el rol
    const role = await Role.findOne({ nombre: roleName });
    if (!role) {
      throw new Error(`Rol '${roleName}' no encontrado`);
    }

    // Crear la asociación base
    const associationData = {
      user: userId,
      account: accountId,
      role: role._id,
      status: 'active',
      createdBy: createdBy
    };

    // Agregar campos según el rol
    switch (roleName) {
      case 'adminaccount':
        // Admin: solo institución
        break;
      
      case 'coordinador':
        // Coordinador: institución + grupo
        if (divisionId) {
          associationData.division = divisionId;
        }
        break;
      
      case 'familyadmin':
        // FamilyAdmin: institución + grupo + alumno
        if (divisionId) {
          associationData.division = divisionId;
        }
        if (studentId) {
          associationData.student = studentId;
        }
        break;
      
      default:
        // Para otros roles, incluir grupo si se proporciona
        if (divisionId) {
          associationData.division = divisionId;
        }
        if (studentId) {
          associationData.student = studentId;
        }
    }

    const association = new Shared(associationData);
    await association.save();
    
    console.log(`✅ Asociación creada para rol '${roleName}':`, {
      user: userId,
      account: accountId,
      division: divisionId || 'no aplica',
      student: studentId || 'no aplica'
    });

    return association;
  } catch (error) {
    console.error(`❌ Error creando asociación para rol '${roleName}':`, error);
    throw error;
  }
}

// Importar rutas de upload
const uploadRoutes = require('./routes/upload');

// Configurar multer para subida de archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Configuración de multer para imágenes y videos
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen o video'));
    }
  }
});

// Configuración de multer-s3 para subida directa a S3
const multerS3 = require('multer-s3');
const { s3 } = require('./config/s3.config');

const uploadToS3 = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET_NAME || 'kiki-bucket-app',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      const userId = req.user._id;
      const fileName = `avatars/${userId}/${Date.now()}-${file.originalname}`;
      cb(null, fileName);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'));
    }
  }
});

// Configuración específica para avatares de estudiantes
const uploadStudentAvatarToS3 = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET_NAME || 'kiki-bucket-app',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      const studentId = req.params.studentId;
      const fileName = `students/${studentId}/${Date.now()}-${file.originalname}`;
      cb(null, fileName);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'));
    }
  }
});

// Configuración de multer para archivos Excel
const uploadExcel = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: function (req, file, cb) {
    // Permitir archivos Excel
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || // .xlsx
        file.mimetype === 'application/vnd.ms-excel' || // .xls
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'));
    }
  }
});

const app = express();

// Middleware de seguridad
app.use(helmet());

// CORS - Configurado para permitir conexiones desde apps móviles
app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin (como apps móviles)
    if (!origin) return callback(null, true);
    
    // Permitir localhost y IPs locales
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

// Rate limiting general
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // límite de 200 requests por IP por ventana
  message: {
    success: false,
    message: 'Demasiadas solicitudes, intenta de nuevo más tarde'
  }
});
app.use(limiter);

// Logging
app.use(morgan('combined'));

// Middleware personalizado para logging detallado
app.use((req, res, next) => {
  console.log(`\n🔍 [${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log(`📦 Body:`, JSON.stringify(req.body, null, 2));
  console.log(`🔑 Headers:`, {
    'authorization': req.headers.authorization ? 'Bearer ***' : 'No auth',
    'content-type': req.headers['content-type'],
    'user-agent': req.headers['user-agent']
  });
  console.log(`📋 Query:`, req.query);
  console.log(`🆔 Params:`, req.params);
  console.log(`---`);
  next();
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir archivos estáticos
app.use('/uploads', express.static('uploads'));

// Conectar a MongoDB
console.log('🔗 MongoDB URI:', config.MONGODB_URI)
mongoose.connect(config.MONGODB_URI)
  .then(() => {
    console.log('✅ Conectado a MongoDB');
    console.log('📊 Base de datos:', mongoose.connection.name);
    console.log('📊 Estado de conexión:', mongoose.connection.readyState);
  })
  .catch(err => console.error('❌ Error conectando a MongoDB:', err));

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
      role: user.role,
      telefono: user.telefono,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
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

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API Unificada de Kiki está funcionando correctamente',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: ['users', 'accounts', 'groups', 'events', 'roles']
  });
});

// Documentación de la API
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'API Unificada de Kiki',
    version: '1.0.0',
    endpoints: {
      auth: {
        login: 'POST /api/users/login',
        register: 'POST /api/users/register',
        profile: 'GET /api/users/profile'
      },
      users: {
        list: 'GET /api/users',
        getById: 'GET /api/users/:id',
        update: 'PUT /api/users/:id',
        updateStatus: 'PUT /api/users/:id/status'
      },
      accounts: {
        list: 'GET /api/accounts',
        create: 'POST /api/accounts',
        getById: 'GET /api/accounts/:id',
        update: 'PUT /api/accounts/:id',
        delete: 'DELETE /api/accounts/:id',
        stats: 'GET /api/accounts/stats'
      },
      groups: {
        list: 'GET /api/groups',
        create: 'POST /api/groups',
        getById: 'GET /api/groups/:id',
        update: 'PUT /api/groups/:id',
        delete: 'DELETE /api/groups/:id',
        addUser: 'POST /api/groups/:id/users',
        removeUser: 'DELETE /api/groups/:id/users/:userId'
      },
      events: {
        list: 'GET /api/events',
        create: 'POST /api/events',
        getById: 'GET /api/events/:id',
        update: 'PUT /api/events/:id',
        delete: 'DELETE /api/events/:id',
        addParticipant: 'POST /api/events/:id/participants',
        removeParticipant: 'DELETE /api/events/:id/participants/:userId'
      },
      roles: {
        list: 'GET /api/roles',
        getById: 'GET /api/roles/:id',
        hierarchy: 'GET /api/roles/hierarchy'
      }
    }
  });
});

// ===== RUTAS DE AUTENTICACIÓN =====

// Login
app.post('/api/users/login', async (req, res) => {
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
        avatarUrl = await generateSignedUrl(user.avatar, 3600); // 1 hora
      } catch (error) {
        console.error('Error generando URL firmada para avatar:', error);
        // Si falla la URL firmada, usar la URL directa
        avatarUrl = user.avatar;
      }
    }

    // Generar token JWT
    const token = user.generateToken();

    res.json({
      success: true,
      message: 'Login exitoso',
      data: {
        token,
        user: {
          _id: user._id,
          email: user.email,
          nombre: user.name,
          role: user.role,
          avatar: avatarUrl,
          activo: user.status === 'approved',
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        },
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
app.post('/api/users/register', async (req, res) => {
  try {
    const { email, password, nombre } = req.body;

    if (!email || !password || !nombre) {
      return res.status(400).json({
        success: false,
        message: 'Email, contraseña y nombre son requeridos'
      });
    }

    // Simular registro exitoso para pruebas
    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      data: {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
        user: {
          _id: '64f8a1b2c3d4e5f6a7b8c9d0',
          email: email,
          nombre: nombre,
          role: {
            _id: '64f8a1b2c3d4e5f6a7b8c9d1',
            nombre: 'familyviewer',
            descripcion: 'Visualizador de familia',
            nivel: 5
          },
          activo: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
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

// Verificar token
app.get('/api/auth/verify', authenticateToken, async (req, res) => {
  try {
    // Buscar el usuario completo para obtener el avatar
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Generar URL firmada para el avatar si existe
    let avatarUrl = null;
    if (user.avatar) {
      try {
        avatarUrl = await generateSignedUrl(user.avatar, 3600); // 1 hora
      } catch (error) {
        console.error('Error generando URL firmada para avatar:', error);
        // Si falla la URL firmada, usar la URL directa
        avatarUrl = user.avatar;
      }
    }

    res.json({
      success: true,
      message: 'Token válido',
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: avatarUrl,
        status: user.status,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Error verificando token:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para verificar configuración JWT (solo para debugging)
app.get('/api/auth/config', (req, res) => {
  res.json({
    success: true,
    jwt_secret_length: config.JWT_SECRET.length,
    jwt_expire: config.JWT_EXPIRE,
    message: 'Configuración JWT actual'
  });
});

// Obtener perfil
app.get('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    // Buscar el usuario completo para obtener el avatar
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Generar URL firmada para el avatar si existe
    let avatarUrl = null;
    if (user.avatar) {
      try {
        avatarUrl = await generateSignedUrl(user.avatar, 3600); // 1 hora
      } catch (error) {
        console.error('Error generando URL firmada para avatar:', error);
        // Si falla la URL firmada, usar la URL directa
        avatarUrl = user.avatar;
      }
    }

    res.json({
      success: true,
      data: {
        _id: user._id,
        email: user.email,
        nombre: user.name,
        role: user.role,
        telefono: user.telefono,
        avatar: avatarUrl,
        activo: user.status === 'approved',
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
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

// Actualizar perfil
app.put('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const { name, email, phone, telefono } = req.body;
    const userId = req.user._id;

    console.log('🔍 [Server] Actualizando perfil para usuario:', userId);
    console.log('📝 Datos recibidos:', { name, email, phone, telefono });

    // Buscar el usuario
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    console.log('🔍 Usuario encontrado antes de actualizar:', {
      _id: user._id,
      email: user.email,
      name: user.name,
      telefono: user.telefono,
      status: user.status
    });

    // Verificar si el email ya existe (si se está cambiando)
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'El email ya está en uso'
        });
      }
    }

    // Actualizar campos
    if (name) user.name = name;
    if (email) user.email = email;
    
    // Manejar tanto 'phone' como 'telefono' para compatibilidad
    if (phone) user.telefono = phone;
    if (telefono) user.telefono = telefono;

    await user.save();

    console.log('✅ Perfil actualizado exitosamente');
    console.log('📝 Usuario después de guardar:', {
      _id: user._id,
      email: user.email,
      name: user.name,
      telefono: user.telefono,
      status: user.status
    });

    // Generar URL firmada para el avatar si existe
    let avatarUrl = null;
    if (user.avatar) {
      try {
        avatarUrl = await generateSignedUrl(user.avatar, 3600); // 1 hora
      } catch (error) {
        console.error('Error generando URL firmada para avatar:', error);
        // Si falla la URL firmada, usar la URL directa
        avatarUrl = user.avatar;
      }
    }

    res.json({
      success: true,
      message: 'Perfil actualizado exitosamente',
      data: {
        _id: user._id,
        email: user.email,
        nombre: user.name,
        role: user.role,
        telefono: user.telefono,
        avatar: avatarUrl,
        activo: user.status === 'approved',
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Actualizar avatar del usuario
app.put('/api/users/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  console.log('🖼️ [AVATAR ENDPOINT] Petición recibida');
  console.log('🖼️ [AVATAR ENDPOINT] Headers:', req.headers);
  console.log('🖼️ [AVATAR ENDPOINT] Body:', req.body);
  console.log('🖼️ [AVATAR ENDPOINT] File:', req.file);
  try {
    const userId = req.user._id;

    console.log('🖼️ [UPDATE AVATAR] Iniciando actualización de avatar');
    console.log('👤 [UPDATE AVATAR] Usuario:', userId);
    console.log('📁 [UPDATE AVATAR] Archivo recibido:', req.file);

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó ninguna imagen'
      });
    }

    // El archivo se guardó localmente, generar URL accesible
    const imageKey = `avatars/${userId}/${req.file.filename}`;
    console.log('🖼️ [UPDATE AVATAR] Archivo guardado localmente:', req.file.filename);
    
    // Generar URL local accesible (como funciona para las actividades)
    const avatarUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    console.log('🖼️ [UPDATE AVATAR] URL local generada:', avatarUrl);

    // Actualizar el usuario con la nueva imagen
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        avatar: imageKey,
        updatedAt: new Date()
      },
      { new: true }
    ).populate('role');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    console.log('✅ [UPDATE AVATAR] Avatar actualizado exitosamente');

    res.json({
      success: true,
      message: 'Avatar actualizado exitosamente',
      data: {
        user: {
          _id: updatedUser._id,
          name: updatedUser.name,
          email: updatedUser.email,
          avatar: avatarUrl,
          role: updatedUser.role
        }
      }
    });

  } catch (error) {
    console.error('Error actualizando avatar:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Actualizar avatar del estudiante (solo familyadmin)
app.put('/api/students/:studentId/avatar', authenticateToken, uploadStudentAvatarToS3.single('avatar'), async (req, res) => {
  console.log('🖼️ [STUDENT AVATAR ENDPOINT] Petición recibida');
  console.log('🖼️ [STUDENT AVATAR ENDPOINT] Student ID:', req.params.studentId);
  console.log('🖼️ [STUDENT AVATAR ENDPOINT] File:', req.file);
  
  try {
    const { studentId } = req.params;
    const userId = req.user._id;

    console.log('🖼️ [UPDATE STUDENT AVATAR] Iniciando actualización de avatar del estudiante');
    console.log('👤 [UPDATE STUDENT AVATAR] Usuario:', userId);
    console.log('🎓 [UPDATE STUDENT AVATAR] Estudiante:', studentId);
    console.log('📁 [UPDATE STUDENT AVATAR] Archivo recibido:', req.file);

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó ninguna imagen'
      });
    }

    // Verificar que el usuario es familyadmin y tiene acceso al estudiante
    const userAssociation = await Shared.findOne({
      user: userId,
      student: studentId,
      status: 'active'
    }).populate('role');

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar este estudiante'
      });
    }

    if (userAssociation.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los familyadmin pueden actualizar avatares de estudiantes'
      });
    }

    // Buscar el estudiante
    const Student = require('./shared/models/Student');
    const student = await Student.findById(studentId);
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado'
      });
    }

    // El archivo se subió directamente a S3 usando multer-s3
    console.log('🖼️ [UPDATE STUDENT AVATAR] Archivo subido a S3 usando multer-s3');
    console.log('🖼️ [UPDATE STUDENT AVATAR] Archivo info:', {
      location: req.file.location,
      key: req.file.key,
      bucket: req.file.bucket
    });
    
    // Guardar la key de S3 (no la URL completa)
    const avatarKey = req.file.key;
    console.log('🖼️ [UPDATE STUDENT AVATAR] Key de S3 guardada:', avatarKey);

    // Actualizar el estudiante con la nueva imagen
    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      { 
        avatar: avatarKey, // Guardar la key de S3 (no la URL completa)
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!updatedStudent) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado'
      });
    }

    console.log('✅ [UPDATE STUDENT AVATAR] Avatar del estudiante actualizado exitosamente');

    // Generar URL firmada para la respuesta
    const { generateSignedUrl } = require('./config/s3.config');
    const signedUrl = await generateSignedUrl(avatarKey, 3600); // 1 hora
    
    console.log('🖼️ [UPDATE STUDENT AVATAR] URL firmada generada:', signedUrl);

    res.json({
      success: true,
      message: 'Avatar del estudiante actualizado exitosamente',
      data: {
        student: {
          _id: updatedStudent._id,
          nombre: updatedStudent.nombre,
          apellido: updatedStudent.apellido,
          avatar: signedUrl // Devolver la URL firmada
        }
      }
    });

  } catch (error) {
    console.error('Error actualizando avatar del estudiante:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint de prueba para verificar configuración de S3 para avatares de estudiantes
app.get('/api/test-student-avatar-s3', async (req, res) => {
  try {
    console.log('🧪 [TEST STUDENT AVATAR S3] Probando configuración...');
    
    // Verificar configuración
    const config = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ? 'Configurado' : 'No configurado',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ? 'Configurado' : 'No configurado',
      region: process.env.AWS_REGION || 'us-east-1',
      bucketName: process.env.AWS_S3_BUCKET_NAME || 'No configurado'
    };
    
    console.log('🧪 [TEST STUDENT AVATAR S3] Configuración:', config);
    
    // Intentar generar una URL firmada de prueba para estudiantes
    const testKey = 'students/test/avatar-test.jpg';
    const { s3 } = require('./config/s3.config');
    
    // Verificar que el bucket existe
    try {
      await s3.headBucket({ Bucket: process.env.AWS_S3_BUCKET_NAME }).promise();
      console.log('✅ [TEST STUDENT AVATAR S3] Bucket existe y es accesible');
    } catch (bucketError) {
      console.error('❌ [TEST STUDENT AVATAR S3] Error accediendo al bucket:', bucketError);
    }
    
    res.json({
      success: true,
      message: 'Configuración de S3 para avatares de estudiantes verificada',
      data: {
        config,
        testKey
      }
    });
  } catch (error) {
    console.error('❌ [TEST STUDENT AVATAR S3] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error en configuración de S3 para avatares de estudiantes',
      error: error.message
    });
  }
});

// ===== RUTAS DE USUARIOS =====

// Endpoint de prueba para S3
app.get('/api/test-s3', async (req, res) => {
  try {
    console.log('🧪 [TEST S3] Probando configuración de S3...');
    console.log('🧪 [TEST S3] Configuración:', {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ? 'Configurado' : 'No configurado',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ? 'Configurado' : 'No configurado',
      region: process.env.AWS_REGION || 'us-east-1',
      bucketName: process.env.AWS_S3_BUCKET_NAME || 'No configurado'
    });
    
    // Intentar generar una URL firmada de prueba
    const testKey = 'test/avatar-test.jpg';
    const testUrl = generateSignedUrl(testKey, 3600);
    
    res.json({
      success: true,
      message: 'Configuración de S3 verificada',
      data: {
        config: {
          accessKeyId: !!process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: !!process.env.AWS_SECRET_ACCESS_KEY,
          region: process.env.AWS_REGION || 'us-east-1',
          bucketName: process.env.AWS_S3_BUCKET_NAME || null
        },
        testUrl: testUrl,
        testKey: testKey
      }
    });
  } catch (error) {
    console.error('❌ [TEST S3] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error en configuración de S3',
      error: error.message
    });
  }
});

// Aprobar asociación pendiente
app.put('/api/users/approve-association/:associationId', authenticateToken, async (req, res) => {
  try {
    const { associationId } = req.params;
    const currentUser = req.user;

    // Verificar que el usuario actual es adminaccount o superadmin
    if (!['adminaccount', 'superadmin'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para aprobar asociaciones'
      });
    }

    // Buscar la asociación
    const association = await Shared.findById(associationId)
      .populate('user', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('role', 'nombre');

    if (!association) {
      return res.status(404).json({
        success: false,
        message: 'Asociación no encontrada'
      });
    }

    // Verificar que la asociación esté pendiente
    if (association.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'La asociación ya no está pendiente de aprobación'
      });
    }

    // Verificar permisos: adminaccount solo puede aprobar asociaciones de su cuenta
    if (currentUser.role?.nombre === 'adminaccount') {
      console.log('🔍 Verificando permisos para aprobar asociación...');
      console.log('👤 Usuario ID:', currentUser._id);
      console.log('🏢 Cuenta de la asociación:', association.account._id);
      
      const userAssociations = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      });
      
      console.log('📋 Asociaciones del usuario encontradas:', userAssociations.length);
      
      const userAccountIds = userAssociations.map(a => a.account.toString());
      console.log('🏢 IDs de cuentas del usuario:', userAccountIds);
      
      if (!userAccountIds.includes(association.account._id.toString())) {
        console.log('❌ Permiso denegado: La cuenta no pertenece al usuario');
        return res.status(403).json({
          success: false,
          message: 'Solo puedes aprobar asociaciones de tu cuenta'
        });
      }
      
      console.log('✅ Permiso concedido: La cuenta pertenece al usuario');
    }

    // Aprobar la asociación
    association.status = 'active';
    await association.save();

    console.log(`✅ Asociación aprobada: ${association.user.name} en ${association.account.nombre}`);

    res.json({
      success: true,
      message: 'Asociación aprobada exitosamente',
      data: {
        _id: association._id,
        user: {
          _id: association.user._id,
          name: association.user.name,
          email: association.user.email
        },
        account: {
          _id: association.account._id,
          nombre: association.account.nombre,
          razonSocial: association.account.razonSocial
        },
        role: {
          _id: association.role._id,
          nombre: association.role.nombre
        },
        status: association.status,
        updatedAt: association.updatedAt
      }
    });

  } catch (error) {
    console.error('Error aprobando asociación:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Rechazar asociación pendiente
app.put('/api/users/reject-association/:associationId', authenticateToken, async (req, res) => {
  try {
    const { associationId } = req.params;
    const currentUser = req.user;

    // Verificar que el usuario actual es adminaccount o superadmin
    if (!['adminaccount', 'superadmin'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para rechazar asociaciones'
      });
    }

    // Buscar la asociación
    const association = await Shared.findById(associationId)
      .populate('user', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('role', 'nombre');

    if (!association) {
      return res.status(404).json({
        success: false,
        message: 'Asociación no encontrada'
      });
    }

    // Verificar que la asociación esté pendiente
    if (association.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'La asociación ya no está pendiente de aprobación'
      });
    }

    // Verificar permisos: adminaccount solo puede rechazar asociaciones de su cuenta
    if (currentUser.role?.nombre === 'adminaccount') {
      console.log('🔍 Verificando permisos para rechazar asociación...');
      console.log('👤 Usuario ID:', currentUser._id);
      console.log('🏢 Cuenta de la asociación:', association.account._id);
      
      const userAssociations = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      });
      
      console.log('📋 Asociaciones del usuario encontradas:', userAssociations.length);
      
      const userAccountIds = userAssociations.map(a => a.account.toString());
      console.log('🏢 IDs de cuentas del usuario:', userAccountIds);
      
      if (!userAccountIds.includes(association.account._id.toString())) {
        console.log('❌ Permiso denegado: La cuenta no pertenece al usuario');
        return res.status(403).json({
          success: false,
          message: 'Solo puedes rechazar asociaciones de tu cuenta'
        });
      }
      
      console.log('✅ Permiso concedido: La cuenta pertenece al usuario');
    }

    // Rechazar la asociación (cambiar a inactive)
    association.status = 'inactive';
    await association.save();

    console.log(`❌ Asociación rechazada: ${association.user.name} en ${association.account.nombre}`);

    res.json({
      success: true,
      message: 'Asociación rechazada exitosamente',
      data: {
        _id: association._id,
        user: {
          _id: association.user._id,
          name: association.user.name,
          email: association.user.email
        },
        account: {
          _id: association.account._id,
          nombre: association.account.nombre,
          razonSocial: association.account.razonSocial
        },
        role: {
          _id: association.role._id,
          nombre: association.role.nombre
        },
        status: association.status,
        updatedAt: association.updatedAt
      }
    });

  } catch (error) {
    console.error('Error rechazando asociación:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Obtener asociaciones pendientes
app.get('/api/users/pending-associations', authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;

    // Verificar que el usuario actual es adminaccount o superadmin
    if (!['adminaccount', 'superadmin'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver asociaciones pendientes'
      });
    }

    let query = { status: 'pending' };

    // Si es adminaccount, solo mostrar asociaciones de su cuenta
    if (currentUser.role?.nombre === 'adminaccount') {
      console.log('🔍 Adminaccount buscando asociaciones pendientes...');
      console.log('👤 Usuario ID:', currentUser._id);
      
      const userAssociations = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      });
      
      console.log('📋 Asociaciones del usuario encontradas:', userAssociations.length);
      
      const userAccountIds = userAssociations.map(a => a.account.toString());
      console.log('🏢 IDs de cuentas del usuario:', userAccountIds);
      
      query.account = { $in: userAccountIds };
      console.log('🔍 Query final para asociaciones pendientes:', JSON.stringify(query, null, 2));
    }

    const pendingAssociations = await Shared.find(query)
      .populate('user', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('role', 'nombre')
      .populate('division', 'nombre descripcion')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: pendingAssociations.map(association => ({
        _id: association._id,
        user: {
          _id: association.user._id,
          name: association.user.name,
          email: association.user.email
        },
        account: {
          _id: association.account._id,
          nombre: association.account.nombre,
          razonSocial: association.account.razonSocial
        },
        role: {
          _id: association.role._id,
          nombre: association.role.nombre
        },
        division: association.division ? {
          _id: association.division._id,
          nombre: association.division.nombre,
          descripcion: association.division.descripcion
        } : null,
        status: association.status,
        createdAt: association.createdAt,
        updatedAt: association.updatedAt
      }))
    });

  } catch (error) {
    console.error('Error obteniendo asociaciones pendientes:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Registro desde app mobile (solo familyview)
app.post('/api/users/register-mobile', async (req, res) => {
  try {
    console.log('🎯 [REGISTER MOBILE] Iniciando registro desde app móvil');
    console.log('📦 [REGISTER MOBILE] Body recibido:', JSON.stringify(req.body, null, 2));
    console.log('🔍 [REGISTER MOBILE] Campos disponibles:', Object.keys(req.body));
    
    const { 
      email, 
      password, 
      nombre, 
      apellido,
      telefono
    } = req.body;

    // Validaciones básicas
    console.log('🔍 [REGISTER MOBILE] Validando campos requeridos...');
    console.log('📋 [REGISTER MOBILE] Campos:', {
      email: !!email,
      password: !!password,
      nombre: !!nombre,
      apellido: !!apellido,
      telefono: !!telefono
    });
    console.log('📋 [REGISTER MOBILE] Campos requeridos:', {
      email: !!email,
      password: !!password,
      nombre: !!nombre
    });
    
    if (!email || !password || !nombre) {
      const missingFields = [];
      if (!email) missingFields.push('email');
      if (!password) missingFields.push('password');
      if (!nombre) missingFields.push('nombre');
      
      console.log('❌ [REGISTER MOBILE] Campos faltantes:', missingFields);
      
      return res.status(400).json({
        success: false,
        message: `Campos requeridos faltantes: ${missingFields.join(', ')}`
      });
    }

    // Buscar solicitudes pendientes para este email
    console.log('🔍 [REGISTER MOBILE] Buscando solicitudes pendientes para:', email);
    const pendingRequests = await RequestedShared.findPendingByEmail(email);
    console.log('📋 [REGISTER MOBILE] Solicitudes pendientes encontradas:', pendingRequests.length);

    // Buscar usuario existente por email
    let user = await User.findOne({ email });
    
    if (user) {
      console.log('👤 Usuario existente encontrado:', user.email);
      return res.status(400).json({
        success: false,
        message: 'El usuario ya existe en el sistema'
      });
    }

    console.log('🆕 Creando nuevo usuario familyviewer:', email);
    
    // Obtener el rol familyviewer
    const role = await Role.findOne({ nombre: 'familyviewer' });
    
    if (!role) {
      console.log('❌ [REGISTER MOBILE] Rol familyviewer no encontrado');
      return res.status(500).json({
        success: false,
        message: 'Rol familyviewer no encontrado en el sistema'
      });
    }

    // Crear nuevo usuario
    const fullName = apellido ? `${nombre} ${apellido}` : nombre;
    user = new User({
      name: fullName,
      email: email,
      password: password,
      role: role._id,
      status: 'approved',
      telefono: telefono || null
    });

    await user.save();
    console.log('✅ Usuario familyviewer creado exitosamente');



    // Procesar solicitudes pendientes si existen
    if (pendingRequests.length > 0) {
      console.log('🔍 [REGISTER] Procesando solicitudes pendientes:', pendingRequests.length);
      
      for (const request of pendingRequests) {
        try {
          // Crear la asociación solicitada
          const requestedShared = new Shared({
            user: user._id,
            account: request.account._id,
            division: request.division?._id,
            student: request.student?._id,
            role: request.role._id,
            status: 'active',
            createdBy: request.requestedBy
          });
          
          await requestedShared.save();
          
          // Marcar la solicitud como completada
          await RequestedShared.markAsCompleted(request._id, user._id);
          
          console.log('✅ [REGISTER] Asociación solicitada creada para:', request.account.nombre);
        } catch (error) {
          console.error('❌ [REGISTER] Error al procesar solicitud pendiente:', error);
        }
      }
    }

    // Generar URL firmada para el avatar si existe
    let avatarUrl = null;
    if (user.avatar) {
      try {
        avatarUrl = await generateSignedUrl(user.avatar, 3600); // 1 hora
      } catch (error) {
        console.error('Error generando URL firmada para avatar:', error);
        // Si falla la URL firmada, usar la URL directa
        avatarUrl = user.avatar;
      }
    }

    res.status(201).json({
      success: true,
      message: pendingRequests.length > 0 
        ? 'Usuario registrado exitosamente y asociaciones creadas'
        : 'Usuario registrado exitosamente. No hay asociaciones pendientes.',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: avatarUrl,
          status: user.status
        },
        associationsCreated: pendingRequests.length
      }
    });

  } catch (error) {
    console.error('Error en registro mobile:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Listar usuarios
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';

    // Construir query de búsqueda
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Filtrar según el rol del usuario
    const currentUser = req.user;
    console.log('🔍 Usuario actual:', currentUser.email, 'Rol:', currentUser.role?.nombre);

    // Si el usuario es superadmin, puede ver todos los usuarios
    if (currentUser.role?.nombre === 'superadmin') {
      console.log('👑 Superadmin: mostrando todos los usuarios');
    } 
    // Si el usuario es adminaccount, solo puede ver usuarios de su cuenta
    else if (currentUser.role?.nombre === 'adminaccount') {
      console.log('🏢 Adminaccount: filtrando usuarios por cuenta');
      console.log('👤 Usuario actual ID:', currentUser._id);
      
      // Buscar las asociaciones del usuario en la tabla shared
      const userAssociations = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).populate('account');
      
      if (userAssociations.length > 0) {
        console.log('📋 Asociaciones encontradas:', userAssociations.length);
        const accountIds = userAssociations.map(assoc => assoc.account._id);
        console.log('🏢 IDs de cuentas:', accountIds);
        
        // Buscar usuarios que tienen asociaciones en estas cuentas
        const userAssociationsInAccounts = await Shared.find({
          account: { $in: accountIds },
          status: { $in: ['active', 'pending'] }
        }).select('user');
        
        const userIds = userAssociationsInAccounts.map(assoc => assoc.user);
        console.log('👥 Usuarios encontrados en las cuentas:', userIds.length);
        
        // Filtrar usuarios que pertenecen a estas cuentas
        query._id = { $in: userIds };
      } else {
        console.log('⚠️ No se encontraron asociaciones para el usuario');
        // Si no tiene asociaciones, no mostrar usuarios
        query._id = null; // Esto no devolverá resultados
      }
    }
    // Para otros roles, no mostrar usuarios
    else {
      console.log('🚫 Rol no autorizado:', currentUser.role?.nombre);
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver usuarios'
      });
    }

    // Obtener datos reales de la base de datos
    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .populate('role')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        users: users.map(user => ({
          _id: user._id,
          email: user.email,
          nombre: user.name,
          role: user.role,
          activo: user.status === 'approved',
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        })),
        total,
        page,
        limit
      }
    });
  } catch (error) {
    console.error('Error listando usuarios:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ===== RUTAS DE GRUPOS (DIVISIONES) =====

// Listar grupos con filtros por cuenta
app.get('/api/grupos', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const cuentaId = req.query.cuentaId;

    // Construir query de búsqueda
    const query = {};
    
    // Filtro por cuenta según el rol del usuario
    if (req.user.role.nombre === 'superadmin') {
      // Superadmin puede ver todos los grupos
      if (cuentaId) {
        query.cuenta = cuentaId;
      }
    } else if (req.user.role.nombre === 'adminaccount') {
      // Adminaccount solo puede ver grupos de sus cuentas
      console.log('🔍 Adminaccount buscando grupos...');
      console.log('👤 Usuario ID:', req.user._id);
      
      const userAccounts = await Shared.find({ 
        user: req.user._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      
      console.log('📋 Asociaciones encontradas:', userAccounts.length);
      
      const accountIds = userAccounts.map(ah => ah.account);
      console.log('🏢 IDs de cuentas:', accountIds);
      
      query.cuenta = { $in: accountIds };
      console.log('🔍 Query final:', JSON.stringify(query, null, 2));
      
      if (cuentaId) {
        // Verificar que la cuenta solicitada pertenece al usuario
        if (!accountIds.includes(cuentaId)) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para ver grupos de esta cuenta'
          });
        }
        query.cuenta = cuentaId;
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver grupos'
      });
    }

    // Búsqueda por nombre
    if (search) {
      query.nombre = { $regex: search, $options: 'i' };
    }

    // Obtener datos reales de la base de datos
    console.log('🔍 Ejecutando query en Grupo...');
    console.log('📊 Query:', JSON.stringify(query, null, 2));
    
    const total = await Grupo.countDocuments(query);
    console.log('📊 Total grupos encontrados:', total);
    
    const grupos = await Grupo.find(query)
      .populate('cuenta', 'nombre razonSocial')
      .populate('creadoPor', 'name email')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        grupos: grupos.map(grupo => ({
          _id: grupo._id,
          nombre: grupo.nombre,
          descripcion: grupo.descripcion,
          cuenta: grupo.cuenta,
          activo: grupo.activo,
          creadoPor: grupo.creadoPor,
          createdAt: grupo.createdAt,
          updatedAt: grupo.updatedAt
        })),
        total,
        page,
        limit
      }
    });
  } catch (error) {
    console.error('Error listando grupos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Crear nuevo grupo
app.post('/api/grupos', authenticateToken, async (req, res) => {
  try {
    const { nombre, descripcion, cuentaId } = req.body;

    // Validaciones básicas
    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: 'Nombre es requerido'
      });
    }

    let targetCuentaId = cuentaId;

    // Verificar permisos según rol
    if (req.user.role.nombre === 'superadmin') {
      // Superadmin puede crear grupos en cualquier cuenta
      if (!cuentaId) {
        return res.status(400).json({
          success: false,
          message: 'Cuenta es requerida para superadmin'
        });
      }
    } else if (req.user.role.nombre === 'adminaccount') {
      // Adminaccount solo puede crear grupos en su cuenta asociada
      const userAccount = await Shared.findOne({
        user: req.user._id,
        status: { $in: ['active', 'pending'] }
      }).populate('account');

      if (!userAccount) {
        return res.status(403).json({
          success: false,
          message: 'No tienes una cuenta asociada'
        });
      }

      // Si se especifica una cuentaId, debe ser la misma que la del admin
      if (cuentaId && cuentaId !== userAccount.account._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Solo puedes crear grupos en tu cuenta asociada'
        });
      }

      // Usar automáticamente la cuenta del admin
      targetCuentaId = userAccount.account._id;
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear grupos'
      });
    }

    // Verificar que la cuenta existe
    const cuenta = await Account.findById(targetCuentaId);
    if (!cuenta) {
      return res.status(400).json({
        success: false,
        message: 'La cuenta especificada no existe'
      });
    }

    // Crear el grupo
    const grupo = new Grupo({
      nombre,
      descripcion: descripcion || '',
      cuenta: targetCuentaId,
      activo: true,
      creadoPor: req.user._id
    });

    await grupo.save();

    // Populate para la respuesta
    await grupo.populate('cuenta', 'nombre razonSocial');
    await grupo.populate('creadoPor', 'name email');

    res.status(201).json({
      success: true,
      message: 'Grupo creado exitosamente',
      data: {
        grupo: {
          _id: grupo._id,
          nombre: grupo.nombre,
          descripcion: grupo.descripcion,
          cuenta: grupo.cuenta,
          activo: grupo.activo,
          creadoPor: grupo.creadoPor,
          createdAt: grupo.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Error creando grupo:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// Obtener divisiones por cuenta para registro mobile
app.get('/api/grupos/mobile/:cuentaId', async (req, res) => {
  try {
    const { cuentaId } = req.params;

    // Verificar que la cuenta existe y está activa
    const cuenta = await Account.findById(cuentaId);
    if (!cuenta || cuenta.activo === false) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada o inactiva'
      });
    }

    // Obtener divisiones activas de la cuenta
    const grupos = await Grupo.find({ 
      cuenta: cuentaId, 
      activo: true 
    })
    .select('nombre descripcion _id')
    .sort({ nombre: 1 });

    res.json({
      success: true,
      data: {
        grupos: grupos,
        total: grupos.length,
        cuenta: {
          _id: cuenta._id,
          nombre: cuenta.nombre,
          razonSocial: cuenta.razonSocial
        }
      }
    });
  } catch (error) {
    console.error('Error obteniendo divisiones para mobile:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Obtener grupo por ID
app.get('/api/grupos/:id', authenticateToken, async (req, res) => {
  try {
    const grupo = await Grupo.findById(req.params.id)
      .populate('cuenta', 'nombre razonSocial')
      .populate('creadoPor', 'name email');

    if (!grupo) {
      return res.status(404).json({
        success: false,
        message: 'Grupo no encontrado'
      });
    }

    // Verificar permisos
    if (req.user.role.nombre === 'superadmin') {
      // Superadmin puede ver cualquier grupo
    } else if (req.user.role.nombre === 'adminaccount') {
      // Adminaccount solo puede ver grupos de sus cuentas
      const userAccount = await Shared.findOne({
        user: req.user._id,
        account: grupo.cuenta._id,
        status: 'active'
      });

      if (!userAccount) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para ver este grupo'
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver grupos'
      });
    }

    res.json({
      success: true,
      data: {
        grupo: {
          _id: grupo._id,
          nombre: grupo.nombre,
          descripcion: grupo.descripcion,
          cuenta: grupo.cuenta,
          activo: grupo.activo,
          creadoPor: grupo.creadoPor,
          createdAt: grupo.createdAt,
          updatedAt: grupo.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('Error obteniendo grupo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Actualizar grupo
app.put('/api/grupos/:id', authenticateToken, async (req, res) => {
  try {
    const { nombre, descripcion, activo } = req.body;

    const grupo = await Grupo.findById(req.params.id)
      .populate('cuenta', 'nombre razonSocial');

    if (!grupo) {
      return res.status(404).json({
        success: false,
        message: 'Grupo no encontrado'
      });
    }

    // Verificar permisos
    if (req.user.role.nombre === 'superadmin') {
      // Superadmin puede editar cualquier grupo
    } else if (req.user.role.nombre === 'adminaccount') {
      // Adminaccount solo puede editar grupos de sus cuentas
      const userAccount = await Shared.findOne({
        user: req.user._id,
        account: grupo.cuenta._id,
        status: 'active'
      });

      if (!userAccount) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para editar este grupo'
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para editar grupos'
      });
    }

    // Actualizar campos
    if (nombre !== undefined) grupo.nombre = nombre;
    if (descripcion !== undefined) grupo.descripcion = descripcion;
    if (activo !== undefined) grupo.activo = activo;

    await grupo.save();

    // Populate para la respuesta
    await grupo.populate('creadoPor', 'name email');

    res.json({
      success: true,
      message: 'Grupo actualizado exitosamente',
      data: {
        grupo: {
          _id: grupo._id,
          nombre: grupo.nombre,
          descripcion: grupo.descripcion,
          cuenta: grupo.cuenta,
          activo: grupo.activo,
          creadoPor: grupo.creadoPor,
          createdAt: grupo.createdAt,
          updatedAt: grupo.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('Error actualizando grupo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Eliminar grupo
app.delete('/api/grupos/:id', authenticateToken, async (req, res) => {
  try {
    const grupo = await Grupo.findById(req.params.id)
      .populate('cuenta', 'nombre razonSocial');

    if (!grupo) {
      return res.status(404).json({
        success: false,
        message: 'Grupo no encontrado'
      });
    }

    // Verificar permisos
    if (req.user.role.nombre === 'superadmin') {
      // Superadmin puede eliminar cualquier grupo
    } else if (req.user.role.nombre === 'adminaccount') {
      // Adminaccount solo puede eliminar grupos de sus cuentas
      const userAccount = await Shared.findOne({
        user: req.user._id,
        account: grupo.cuenta._id,
        status: 'active'
      });

      if (!userAccount) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para eliminar este grupo'
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar grupos'
      });
    }

    await Grupo.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Grupo eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando grupo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ===== RUTAS DE CUENTAS =====

// Obtener cuentas para registro mobile (solo cuentas activas)
app.get('/api/accounts/mobile', async (req, res) => {
  try {
    const accounts = await Account.find({ activo: { $ne: false } })
      .select('nombre razonSocial _id')
      .sort({ nombre: 1 });

    res.json({
      success: true,
      data: {
        accounts: accounts,
        total: accounts.length
      }
    });
  } catch (error) {
    console.error('Error obteniendo cuentas para mobile:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});



// Listar cuentas
app.get('/api/accounts', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';

    // Construir query de búsqueda
    const query = {};
    if (search) {
      query.$or = [
        { nombre: { $regex: search, $options: 'i' } },
        { razonSocial: { $regex: search, $options: 'i' } }
      ];
    }

    // Filtrar según el rol del usuario
    const currentUser = req.user;
    console.log('🔍 Usuario actual:', currentUser.email, 'Rol:', currentUser.role?.nombre);

    // Solo superadmin puede ver todas las cuentas
    if (currentUser.role?.nombre !== 'superadmin') {
      console.log('🚫 Usuario no autorizado para ver cuentas:', currentUser.role?.nombre);
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver cuentas'
      });
    }

    console.log('👑 Superadmin: mostrando todas las cuentas');

    // Obtener datos reales de la base de datos
    const total = await Account.countDocuments(query);
    const accounts = await Account.find(query)
      .populate({
        path: 'usuarioAdministrador',
        select: 'name email status',
        populate: {
          path: 'role',
          select: 'nombre descripcion nivel'
        }
      })
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    // Generar URLs firmadas para los logos
    const accountsWithSignedUrls = accounts.map(account => {
      const accountObj = account.toObject();
      if (accountObj.logo) {
        accountObj.logoSignedUrl = generateSignedUrl(accountObj.logo, 3600); // 1 hora
      }
      return accountObj;
    });

    res.json({
      success: true,
      data: {
        accounts: accountsWithSignedUrls,
        total,
        page,
        limit
      }
    });
  } catch (error) {
    console.error('Error listando cuentas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Crear cuenta
app.post('/api/accounts', authenticateToken, async (req, res) => {
  try {
    const { nombre, razonSocial, address, emailAdmin, nombreAdmin, logo } = req.body;

    if (!nombre || !razonSocial || !address || !emailAdmin || !nombreAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son requeridos'
      });
    }

    // Verificar si ya existe una cuenta con el mismo nombre
    const existingAccount = await Account.findOne({ nombre });
    if (existingAccount) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una cuenta con ese nombre'
      });
    }

    // Verificar si ya existe un usuario con el email del administrador
    const existingUser = await User.findOne({ email: emailAdmin });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un usuario con ese email de administrador'
      });
    }

    // Obtener el rol de administrador de cuenta
    const adminRole = await Role.findOne({ nombre: 'adminaccount' });
    if (!adminRole) {
      return res.status(500).json({
        success: false,
        message: 'Rol de administrador no encontrado'
      });
    }

    // Crear usuario administrador primero
    const adminUser = new User({
      name: nombreAdmin,
      email: emailAdmin,
      password: 'admin123', // Contraseña genérica
      role: adminRole._id,
      status: 'approved'
    });

    await adminUser.save();

    // Crear nueva cuenta con el usuario administrador
    const account = new Account({
      nombre,
      razonSocial,
      address,
      emailAdmin,
      nombreAdmin,
      logo: logo || 'https://via.placeholder.com/150',
      activo: true,
      usuarioAdministrador: adminUser._id
    });

    await account.save();

    // Actualizar el usuario con la cuenta asignada
    adminUser.account = account._id;
    await adminUser.save();

    // Crear asociación del admin de la cuenta
    await createAssociationByRole(
      adminUser._id, 
      account._id, 
      'adminaccount', 
      null, 
      null, 
      req.user._id
    );

    // Populate el usuario administrador
    await account.populate('usuarioAdministrador');

    res.status(201).json({
      success: true,
      message: 'Cuenta creada exitosamente con usuario administrador',
      data: {
        account,
        adminUser: {
          _id: adminUser._id,
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role,
          status: adminUser.status
        }
      }
    });
  } catch (error) {
    console.error('Error creando cuenta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Obtener cuenta por ID
app.get('/api/accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const account = await Account.findById(id).populate({
      path: 'usuarioAdministrador',
      select: 'name email status',
      populate: {
        path: 'role',
        select: 'nombre descripcion nivel'
      }
    });
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada'
      });
    }

    // Generar URL firmada para el logo
    const accountObj = account.toObject();
    if (accountObj.logo) {
      accountObj.logoSignedUrl = generateSignedUrl(accountObj.logo, 3600); // 1 hora
    }

    res.json({
      success: true,
      data: accountObj
    });
  } catch (error) {
    console.error('Error obteniendo cuenta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Actualizar cuenta
app.put('/api/accounts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, razonSocial, address, emailAdmin, nombreAdmin, logo, activo } = req.body;

    const account = await Account.findById(id);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada'
      });
    }

    // Verificar si el nombre ya existe en otra cuenta
    if (nombre && nombre !== account.nombre) {
      const existingAccount = await Account.findOne({ nombre, _id: { $ne: id } });
      if (existingAccount) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe una cuenta con ese nombre'
        });
      }
    }

    // Obtener el usuario administrador actual
    const adminUser = await User.findById(account.usuarioAdministrador);
    if (!adminUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario administrador no encontrado'
      });
    }

    // Actualizar campos de la cuenta
    if (nombre) account.nombre = nombre;
    if (razonSocial) account.razonSocial = razonSocial;
    if (address) account.address = address;
    if (logo) account.logo = logo;
    if (typeof activo === 'boolean') account.activo = activo;

    // Actualizar campos del usuario administrador
    if (emailAdmin && emailAdmin !== adminUser.email) {
      // Verificar que el nuevo email no esté en uso
      const existingUser = await User.findOne({ email: emailAdmin, _id: { $ne: adminUser._id } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe un usuario con ese email'
        });
      }
      adminUser.email = emailAdmin;
    }

    if (nombreAdmin && nombreAdmin !== adminUser.name) {
      adminUser.name = nombreAdmin;
    }

    // Guardar cambios
    account.updatedAt = new Date();
    await account.save();
    await adminUser.save();

    // Populate el usuario administrador
    await account.populate({
      path: 'usuarioAdministrador',
      select: 'name email status',
      populate: {
        path: 'role',
        select: 'nombre descripcion nivel'
      }
    });

    // Generar URL firmada para el logo
    const accountObj = account.toObject();
    if (accountObj.logo) {
      accountObj.logoSignedUrl = generateSignedUrl(accountObj.logo, 3600); // 1 hora
    }

    res.json({
      success: true,
      message: 'Cuenta actualizada exitosamente',
      data: accountObj
    });
  } catch (error) {
    console.error('Error actualizando cuenta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Eliminar cuenta
app.delete('/api/accounts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const account = await Account.findById(id);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada'
      });
    }

    await Account.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Cuenta eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error eliminando cuenta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Estadísticas de cuentas
app.get('/api/accounts/stats', async (req, res) => {
  try {
    const total = await Account.countDocuments();
    const activas = await Account.countDocuments({ activo: true });
    const inactivas = await Account.countDocuments({ activo: false });

    res.json({
      success: true,
      data: {
        total,
        activas,
        inactivas,
        porcentajeActivas: total > 0 ? Math.round((activas / total) * 100) : 0
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ===== RUTAS DE IMÁGENES =====

// Renovar URL firmada de imagen
app.post('/api/images/refresh-signed-url', authenticateToken, async (req, res) => {
  try {
    const { imageKey } = req.body;
    
    if (!imageKey) {
      return res.status(400).json({
        success: false,
        message: 'imageKey es requerido'
      });
    }

    const signedUrl = generateSignedUrl(imageKey, 3600); // 1 hora

    if (!signedUrl) {
      return res.status(500).json({
        success: false,
        message: 'Error generando URL firmada'
      });
    }

    res.json({
      success: true,
      data: {
        imageKey,
        signedUrl
      }
    });
  } catch (error) {
    console.error('Error renovando URL firmada:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ===== RUTAS DE GRUPOS =====

// Listar grupos
app.get('/api/groups', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const accountId = req.query.accountId;

    // Simular datos de grupos
    const groups = [
      {
        _id: '64f8a1b2c3d4e5f6a7b8c9d0',
        nombre: 'Grupo Ejemplo',
        descripcion: 'Descripción del grupo',
        account: accountId || '64f8a1b2c3d4e5f6a7b8c9d1',
        creadoPor: '64f8a1b2c3d4e5f6a7b8c9d2',
        usuarios: ['64f8a1b2c3d4e5f6a7b8c9d3'],
        permisos: ['leer', 'escribir'],
        activo: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    res.json({
      success: true,
      data: {
        groups,
        total: groups.length,
        page,
        limit
      }
    });
  } catch (error) {
    console.error('Error listando grupos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Obtener grupos por cuenta
app.get('/api/groups/account/:accountId', authenticateToken, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { userId } = req.user;
    const { activo } = req.query;

    // Verificar que el usuario tiene acceso a esta cuenta
    const user = await User.findById(userId).populate('role');
    const userAssociation = await Shared.findOne({
      user: userId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation && user.role?.nombre !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver grupos de esta cuenta'
      });
    }

    // Buscar grupos de la cuenta
    let query = { account: accountId };
    
    // Filtrar por estado activo si se especifica
    if (activo !== undefined) {
      query.activo = activo === 'true';
    }

    const grupos = await Group.find(query)
      .populate('creadoPor', 'name email')
      .sort({ createdAt: -1 });

    console.log(`📊 Encontrados ${grupos.length} grupos para la cuenta ${accountId}`);

    res.json({
      success: true,
      data: {
        grupos: grupos.map(grupo => ({
          _id: grupo._id,
          nombre: grupo.nombre,
          descripcion: grupo.descripcion,
          activo: grupo.activo,
          creadoPor: grupo.creadoPor ? {
            _id: grupo.creadoPor._id,
            name: grupo.creadoPor.name,
            email: grupo.creadoPor.email
          } : null,
          createdAt: grupo.createdAt,
          updatedAt: grupo.updatedAt
        }))
      }
    });

  } catch (error) {
    console.error('Error obteniendo grupos por cuenta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ===== RUTAS DE EVENTOS =====

// Listar eventos
app.get('/api/events', authenticateToken, async (req, res) => {
  try {
    const { accountId, search, page = 1, limit = 20 } = req.query;
    const currentUser = req.user;

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver eventos'
      });
    }

    let query = {};

    // Filtro por cuenta según el rol del usuario
    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin puede ver todos los eventos
      if (accountId) {
        query.cuenta = accountId;
      }
    } else if (currentUser.role?.nombre === 'adminaccount') {
      // Adminaccount solo puede ver eventos de sus cuentas
      const userAccounts = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      
      const accountIds = userAccounts.map(ah => ah.account);
      query.cuenta = { $in: accountIds };
      
      if (accountId) {
        // Verificar que la cuenta solicitada pertenece al usuario
        if (!accountIds.includes(accountId)) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para ver eventos de esta cuenta'
          });
        }
        query.cuenta = accountId;
      }
    } else if (currentUser.role?.nombre === 'coordinador') {
      // Coordinador puede ver eventos de sus cuentas
      if (accountId) {
        query.cuenta = accountId;
      }
    }

    // Búsqueda por nombre o descripción
    if (search) {
      query.$or = [
        { nombre: { $regex: search, $options: 'i' } },
        { descripcion: { $regex: search, $options: 'i' } }
      ];
    }

    // Obtener datos reales de la base de datos
    const total = await Event.countDocuments(query);
    const events = await Event.find(query)
      .populate('organizador', 'name email')
      .populate('cuenta', 'nombre razonSocial')
      .populate('metadatos.creadoPor', 'name email')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ fechaInicio: 1 });

    res.json({
      success: true,
      data: {
        events: events.map(event => ({
          _id: event._id,
          nombre: event.nombre,
          descripcion: event.descripcion,
          categoria: event.categoria,
          fechaInicio: event.fechaInicio,
          fechaFin: event.fechaFin,
          ubicacion: event.ubicacion,
          organizador: event.organizador,
          cuenta: event.cuenta,
          capacidadMaxima: event.capacidadMaxima,
          participantes: event.participantes,
          estado: event.estado,
          esPublico: event.esPublico,
          requiereAprobacion: event.requiereAprobacion,
          imagen: event.imagen,
          tags: event.tags,
          metadatos: event.metadatos,
          createdAt: event.createdAt,
          updatedAt: event.updatedAt
        })),
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error listando eventos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ===== RUTAS DE ROLES =====

// Listar roles
app.get('/api/roles', async (req, res) => {
  try {
    // Simular datos de roles
    const roles = [
      {
        _id: '64f8a1b2c3d4e5f6a7b8c9d1',
        nombre: 'superadmin',
        descripcion: 'Super administrador con acceso total al sistema',
        permisos: ['todos'],
        nivel: 1,
        activo: true,
        esRolSistema: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        _id: '64f8a1b2c3d4e5f6a7b8c9d2',
        nombre: 'adminaccount',
        descripcion: 'Administrador de cuenta con permisos completos dentro de su cuenta',
        permisos: ['usuarios', 'cuentas', 'grupos', 'eventos'],
        nivel: 2,
        activo: true,
        esRolSistema: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    
    res.json({
      success: true,
      data: roles
    });
  } catch (error) {
    console.error('Error listando roles:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Jerarquía de roles
app.get('/api/roles/hierarchy', async (req, res) => {
  try {
    const hierarchy = {
      1: 'superadmin',
      2: 'adminaccount',
      3: 'coordinador',
      4: 'familyadmin',
      5: 'familyviewer'
    };
    
    res.json({
      success: true,
      data: hierarchy
    });
  } catch (error) {
    console.error('Error obteniendo jerarquía:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ===== RUTAS DE ASISTENCIAS =====

// Listar asistencias por cuenta
app.get('/api/asistencias', authenticateToken, async (req, res) => {
  try {
    const { accountId, grupoId, alumnoId, fechaInicio, fechaFin, page = 1, limit = 20 } = req.query;
    const currentUser = req.user;

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver asistencias'
      });
    }

    let query = { activo: true };

    // Filtro por cuenta según el rol del usuario
    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin puede ver todas las asistencias
      if (accountId) {
        query.account = accountId;
      }
    } else if (currentUser.role?.nombre === 'adminaccount') {
      // Adminaccount solo puede ver asistencias de sus cuentas
      const userAccounts = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      
      const accountIds = userAccounts.map(ah => ah.account);
      query.account = { $in: accountIds };
      
      if (accountId) {
        // Verificar que la cuenta solicitada pertenece al usuario
        if (!accountIds.includes(accountId)) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para ver asistencias de esta cuenta'
          });
        }
        query.account = accountId;
      }
    } else if (currentUser.role?.nombre === 'coordinador') {
      // Coordinador puede ver asistencias de sus grupos
      if (accountId) {
        query.account = accountId;
      }
    }

    // Filtros adicionales
    if (grupoId) {
      query.grupo = grupoId;
    }
    
    if (alumnoId) {
      query.alumno = alumnoId;
    }
    
    if (fechaInicio && fechaFin) {
      query.fecha = {
        $gte: new Date(fechaInicio),
        $lte: new Date(fechaFin)
      };
    }

    // Obtener datos reales de la base de datos
    const total = await Asistencia.countDocuments(query);
    const asistencias = await Asistencia.find(query)
      .populate('alumno', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('grupo', 'nombre descripcion')
      .populate('registradoPor', 'name email')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ fecha: -1, horaLlegada: -1 });

    res.json({
      success: true,
      data: {
        asistencias: asistencias.map(asistencia => ({
          _id: asistencia._id,
          alumno: asistencia.alumno,
          account: asistencia.account,
          grupo: asistencia.grupo,
          fecha: asistencia.fecha,
          estado: asistencia.estado,
          horaLlegada: asistencia.horaLlegada,
          horaSalida: asistencia.horaSalida,
          observaciones: asistencia.observaciones,
          registradoPor: asistencia.registradoPor,
          activo: asistencia.activo,
          createdAt: asistencia.createdAt,
          updatedAt: asistencia.updatedAt
        })),
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error listando asistencias:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Registrar nueva asistencia
app.post('/api/asistencias', authenticateToken, async (req, res) => {
  try {
    const { alumnoId, accountId, grupoId, fecha, estado, horaLlegada, horaSalida, observaciones } = req.body;
    const currentUser = req.user;

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para registrar asistencias'
      });
    }

    // Validaciones
    if (!alumnoId || !accountId || !grupoId || !fecha) {
      return res.status(400).json({
        success: false,
        message: 'alumnoId, accountId, grupoId y fecha son requeridos'
      });
    }

    // Verificar que el alumno existe
    const alumno = await User.findById(alumnoId);
    if (!alumno) {
      return res.status(404).json({
        success: false,
        message: 'Alumno no encontrado'
      });
    }

    // Verificar que la cuenta existe
    console.log('🔍 [ASISTENCIA] accountId recibido:', accountId, typeof accountId);
    console.log('🔍 [ASISTENCIA] Modelo Account disponible:', !!Account);
    console.log('🔍 [ASISTENCIA] Iniciando búsqueda de cuenta...');
    try {
      const account = await Account.findById(accountId);
      console.log('🔍 [ASISTENCIA] Resultado de Account.findById:', account);
      if (!account) {
        console.log('❌ [ASISTENCIA] Cuenta no encontrada para ID:', accountId);
        return res.status(400).json({
          success: false,
          message: 'La cuenta especificada no existe'
        });
      }
      console.log('✅ [ASISTENCIA] Cuenta encontrada:', account.nombre);
    } catch (e) {
      console.error('❌ [ASISTENCIA] Error en Account.findById:', e);
      return res.status(500).json({
        success: false,
        message: 'Error buscando la cuenta',
        error: e.message
      });
    }

    // Verificar que el grupo existe
    const grupo = await Grupo.findById(grupoId);
    if (!grupo) {
      return res.status(404).json({
        success: false,
        message: 'Grupo no encontrado'
      });
    }

    // Verificar permisos según rol
    if (currentUser.role?.nombre === 'adminaccount') {
      const userAccounts = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      
      const accountIds = userAccounts.map(ah => ah.account.toString());
      if (!accountIds.includes(accountId)) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para registrar asistencias en esta cuenta'
        });
      }
    }

    // Verificar si ya existe una asistencia para este alumno en esta fecha y grupo
    const fechaAsistencia = new Date(fecha);
    const asistenciaExistente = await Asistencia.existeAsistencia(alumnoId, fechaAsistencia, grupoId);
    
    if (asistenciaExistente) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una asistencia registrada para este alumno en esta fecha y grupo'
      });
    }

    // Crear nueva asistencia
    const nuevaAsistencia = new Asistencia({
      alumno: alumnoId,
      account: accountId,
      grupo: grupoId,
      fecha: fechaAsistencia,
      estado: estado || 'presente',
      horaLlegada: horaLlegada ? new Date(horaLlegada) : null,
      horaSalida: horaSalida ? new Date(horaSalida) : null,
      observaciones,
      registradoPor: currentUser._id
    });

    await nuevaAsistencia.save();

    // Obtener la asistencia con datos poblados
    const asistenciaGuardada = await Asistencia.findById(nuevaAsistencia._id)
      .populate('alumno', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('grupo', 'nombre descripcion')
      .populate('registradoPor', 'name email');

    console.log(`✅ Asistencia registrada: ${asistenciaGuardada.alumno.name} en ${asistenciaGuardada.grupo.nombre}`);

    res.status(201).json({
      success: true,
      message: 'Asistencia registrada exitosamente',
      data: asistenciaGuardada
    });

  } catch (error) {
    console.error('Error registrando asistencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Actualizar asistencia
app.put('/api/asistencias/:asistenciaId', authenticateToken, async (req, res) => {
  try {
    const { asistenciaId } = req.params;
    const { estado, horaLlegada, horaSalida, observaciones } = req.body;
    const currentUser = req.user;

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar asistencias'
      });
    }

    // Buscar la asistencia
    const asistencia = await Asistencia.findById(asistenciaId)
      .populate('alumno', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('grupo', 'nombre descripcion')
      .populate('registradoPor', 'name email');

    if (!asistencia) {
      return res.status(404).json({
        success: false,
        message: 'Asistencia no encontrada'
      });
    }

    // Verificar permisos según rol
    if (currentUser.role?.nombre === 'adminaccount') {
      const userAccounts = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      
      const accountIds = userAccounts.map(ah => ah.account.toString());
      if (!accountIds.includes(asistencia.account._id.toString())) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para actualizar asistencias de esta cuenta'
        });
      }
    }

    // Actualizar campos
    if (estado) asistencia.estado = estado;
    if (horaLlegada !== undefined) asistencia.horaLlegada = horaLlegada ? new Date(horaLlegada) : null;
    if (horaSalida !== undefined) asistencia.horaSalida = horaSalida ? new Date(horaSalida) : null;
    if (observaciones !== undefined) asistencia.observaciones = observaciones;

    await asistencia.save();

    console.log(`✅ Asistencia actualizada: ${asistencia.alumno.name} en ${asistencia.grupo.nombre}`);

    res.json({
      success: true,
      message: 'Asistencia actualizada exitosamente',
      data: asistencia
    });

  } catch (error) {
    console.error('Error actualizando asistencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Eliminar asistencia (marcar como inactiva)
app.delete('/api/asistencias/:asistenciaId', authenticateToken, async (req, res) => {
  try {
    const { asistenciaId } = req.params;
    const currentUser = req.user;

    // Verificar permisos
    if (!['adminaccount', 'superadmin'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar asistencias'
      });
    }

    // Buscar la asistencia
    const asistencia = await Asistencia.findById(asistenciaId)
      .populate('alumno', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('grupo', 'nombre descripcion');

    if (!asistencia) {
      return res.status(404).json({
        success: false,
        message: 'Asistencia no encontrada'
      });
    }

    // Verificar permisos según rol
    if (currentUser.role?.nombre === 'adminaccount') {
      const userAccounts = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      
      const accountIds = userAccounts.map(ah => ah.account.toString());
      if (!accountIds.includes(asistencia.account._id.toString())) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para eliminar asistencias de esta cuenta'
        });
      }
    }

    // Marcar como inactiva
    asistencia.activo = false;
    await asistencia.save();

    console.log(`❌ Asistencia eliminada: ${asistencia.alumno.name} en ${asistencia.grupo.nombre}`);

    res.json({
      success: true,
      message: 'Asistencia eliminada exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando asistencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ===== RUTAS DE ACTIVITY =====

// Listar actividades
app.get('/api/activities', authenticateToken, async (req, res) => {
  try {
    const { accountId, userId, tipo, entidad, fechaInicio, fechaFin, page = 1, limit = 50 } = req.query;
    const currentUser = req.user;

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver actividades'
      });
    }

    let query = { activo: true };

    // Filtro por cuenta según el rol del usuario
    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin puede ver todas las actividades
      if (accountId) {
        query.account = accountId;
      }
    } else if (currentUser.role?.nombre === 'adminaccount') {
      // Adminaccount solo puede ver actividades de sus cuentas
      const userAccounts = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      
      const accountIds = userAccounts.map(ah => ah.account);
      query.account = { $in: accountIds };
      
      if (accountId) {
        // Verificar que la cuenta solicitada pertenece al usuario
        if (!accountIds.includes(accountId)) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para ver actividades de esta cuenta'
          });
        }
        query.account = accountId;
      }
    } else if (currentUser.role?.nombre === 'coordinador') {
      // Coordinador puede ver actividades de sus cuentas
      if (accountId) {
        query.account = accountId;
      }
    }

    // Filtros adicionales
    if (userId) {
      query.usuario = userId;
    }
    
    if (tipo) {
      query.tipo = tipo;
    }
    
    if (entidad) {
      query.entidad = entidad;
    }
    
    if (fechaInicio && fechaFin) {
      query.createdAt = {
        $gte: new Date(fechaInicio),
        $lte: new Date(fechaFin)
      };
    }

    // Obtener datos reales de la base de datos
    const total = await Activity.countDocuments(query);
    const activities = await Activity.find(query)
      .populate('usuario', 'name email')
      .populate('account', 'nombre razonSocial')
      .sort({ createdAt: -1 })
      .limit(50); // Limitar a las últimas 50 actividades

    res.json({
      success: true,
      data: {
        activities: activities.map(activity => ({
          _id: activity._id,
          usuario: activity.usuario,
          account: activity.account,
          tipo: activity.tipo,
          entidad: activity.entidad,
          entidadId: activity.entidadId,
          descripcion: activity.descripcion,
          datos: activity.datos,
          ip: activity.ip,
          userAgent: activity.userAgent,
          activo: activity.activo,
          createdAt: activity.createdAt,
          updatedAt: activity.updatedAt
        })),
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error listando actividades:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Registrar actividad (helper para otros endpoints)
const registrarActividad = async (data) => {
  try {
    await Activity.registrarActividad({
      usuario: data.usuario,
      account: data.account,
      tipo: data.tipo,
      entidad: data.entidad,
      entidadId: data.entidadId,
      descripcion: data.descripcion,
      datos: data.datos || {},
      ip: data.ip,
      userAgent: data.userAgent
    });
  } catch (error) {
    console.error('Error registrando actividad:', error);
  }
};

// Endpoint para eliminar una actividad
app.delete('/api/activities/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    console.log('🗑️ [DELETE ACTIVITY] Iniciando eliminación de actividad:', id);
    console.log('👤 [DELETE ACTIVITY] Usuario:', userId);

    // Verificar que el usuario tiene permisos para eliminar actividades
    const user = await User.findById(userId).populate('role');
    const userRole = user?.role?.nombre;

    console.log('🎭 [DELETE ACTIVITY] Rol del usuario:', userRole);

    if (userRole !== 'coordinador') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar actividades'
      });
    }

    // Buscar la actividad
    const activity = await Activity.findById(id);
    
    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Actividad no encontrada'
      });
    }

    // Verificar que el usuario tiene acceso a la institución de la actividad
    const userAssociation = await Shared.findOne({
      user: userId,
      account: activity.account,
      status: 'active'
    });

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes acceso a esta institución'
      });
    }

    // Eliminar la actividad (soft delete)
    activity.activo = false;
    await activity.save();

    console.log('✅ [DELETE ACTIVITY] Actividad eliminada exitosamente');

    res.json({
      success: true,
      message: 'Actividad eliminada exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando actividad:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para obtener actividades filtradas por institución y división (para mobile)
app.get('/api/activities/mobile', authenticateToken, async (req, res) => {
  try {
    const { accountId, divisionId } = req.query;
    const userId = req.user._id;

    console.log('🎯 [ACTIVITIES MOBILE] Iniciando búsqueda de actividades');
    console.log('👤 [ACTIVITIES MOBILE] Usuario:', userId);
    console.log('🏢 [ACTIVITIES MOBILE] AccountId:', accountId);
    console.log('📚 [ACTIVITIES MOBILE] DivisionId:', divisionId);

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'accountId es requerido'
      });
    }

    // Verificar que el usuario tenga acceso a esta cuenta
    const userAssociation = await Shared.findOne({
      user: userId,
      account: accountId,
      status: 'active'
    }).populate('role student');

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes acceso a esta institución'
      });
    }

    console.log('🔍 [ACTIVITIES MOBILE] Asociación del usuario:', {
      role: userAssociation.role?.nombre,
      student: userAssociation.student?._id,
      studentName: userAssociation.student ? `${userAssociation.student.nombre} ${userAssociation.student.apellido}` : 'N/A'
    });

    // Construir query base según el rol del usuario
    const userRole = userAssociation.role?.nombre;
    const userStudent = userAssociation.student?._id;
    
    console.log('🎭 [ACTIVITIES MOBILE] Rol del usuario:', userRole);
    console.log('👨‍🎓 [ACTIVITIES MOBILE] Estudiante vinculado:', userStudent);

    let query = {
      account: accountId,
      activo: true
    };

    // Filtrar por fecha: solo actividades del día actual
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    
    query.createdAt = {
      $gte: startOfDay,
      $lte: endOfDay
    };

    // Agregar filtro por división si se proporciona
    if (divisionId) {
      query.division = divisionId;
    }

    // Filtrar según el rol del usuario
    if (userRole === 'coordinador') {
      console.log('👨‍💼 [ACTIVITIES MOBILE] Coordinador: mostrando todas las actividades del día');
      // Coordinador ve todas las actividades del día (no se agrega filtro adicional)
    } else if (userRole === 'familyadmin' || userRole === 'familyviewer') {
      if (userStudent) {
        console.log('👨‍👩‍👧‍👦 [ACTIVITIES MOBILE] Familyadmin/Viewer: filtrando por estudiante vinculado');
        // Familyadmin/Viewer solo ve actividades donde su estudiante esté en participantes
        query.participantes = userStudent;
      } else {
        console.log('⚠️ [ACTIVITIES MOBILE] Familyadmin/Viewer sin estudiante vinculado: no hay actividades');
        // Si no tiene estudiante vinculado, no mostrar actividades
        query.participantes = null; // Esto no devolverá resultados
      }
    } else {
      console.log('❓ [ACTIVITIES MOBILE] Rol no reconocido:', userRole);
      // Para otros roles, no mostrar actividades
      query.participantes = null; // Esto no devolverá resultados
    }

    console.log('🔍 [ACTIVITIES MOBILE] Query final:', JSON.stringify(query, null, 2));

    // Obtener actividades
    const activities = await Activity.find(query)
      .populate('usuario', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('division', 'nombre descripcion')
      .populate('participantes', 'nombre apellido dni')
      .sort({ createdAt: -1 })
      .limit(50); // Limitar a las últimas 50 actividades

    console.log('📊 [ACTIVITIES MOBILE] Actividades encontradas:', activities.length);
    activities.forEach((activity, index) => {
      console.log(`📋 [ACTIVITIES MOBILE] Actividad ${index + 1}:`, {
        id: activity._id,
        titulo: activity.titulo,
        participantes: activity.participantes?.map(p => p._id) || [],
        createdAt: activity.createdAt
      });
    });

    // Generar URLs firmadas para las imágenes
    const activitiesWithSignedUrls = await Promise.all(activities.map(async (activity) => {
      let imagenesSignedUrls = [];
      
      // Si la actividad tiene imágenes, generar URLs firmadas
      if (activity.imagenes && Array.isArray(activity.imagenes)) {
        try {
          imagenesSignedUrls = await Promise.all(activity.imagenes.map(async (imageKey) => {
            // Generar URL firmada usando la key directamente
            const signedUrl = await generateSignedUrl(imageKey);
            return signedUrl;
          }));
        } catch (error) {
          console.error('Error generando URLs firmadas para actividad:', activity._id, error);
          imagenesSignedUrls = []; // No devolver URLs si falla
        }
      }

      // Formatear participantes como string de nombres
      const participantesNombres = Array.isArray(activity.participantes) 
        ? activity.participantes
          .filter(p => p) // Filtrar participantes nulos/undefined
          .map(p => `${p.nombre} ${p.apellido}`)
          .join(', ')
        : '';

      return {
        _id: activity._id,
        usuario: activity.usuario,
        account: activity.account,
        division: activity.division,
        tipo: activity.tipo,
        entidad: activity.entidad,
        entidadId: activity.entidadId,
        descripcion: activity.descripcion,
        titulo: activity.titulo,
        participantes: participantesNombres,
        imagenes: imagenesSignedUrls,
        datos: activity.datos || {},
        activo: activity.activo,
        createdAt: activity.createdAt,
        updatedAt: activity.updatedAt
      };
    }));

    console.log('🔍 Debug - Activities with signed URLs:', JSON.stringify(activitiesWithSignedUrls, null, 2));

    res.json({
      success: true,
      data: {
        activities: activitiesWithSignedUrls
      }
    });
  } catch (error) {
    console.error('Error obteniendo actividades para mobile:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Rutas de upload
app.use('/api/upload', uploadRoutes);

// Endpoint para subir imágenes
app.post('/api/upload-image', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó ningún archivo'
      });
    }

    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    
    res.json({
      success: true,
      imageUrl: imageUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({
      success: false,
      message: 'Error al subir la imagen'
    });
  }
});

// Endpoint para crear actividades
app.post('/api/activities', authenticateToken, async (req, res) => {
  try {
    const { titulo, participantes, descripcion, imagenes, accountId, divisionId, userId } = req.body;

    if (!titulo || !participantes || !accountId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos obligatorios'
      });
    }

    // Verificar que el usuario tiene acceso a la cuenta
    const userAssociation = await Shared.findOne({
      user: userId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear actividades en esta cuenta'
      });
    }

    // Validar que participantes sea un array
    if (!Array.isArray(participantes)) {
      return res.status(400).json({
        success: false,
        message: 'Participantes debe ser un array de IDs de estudiantes'
      });
    }

    // Crear la actividad
    const activity = new Activity({
      titulo,
      participantes, // Guardar el array de IDs tal como viene del mobile
      descripcion: descripcion || '',
      imagenes: imagenes || [],
      account: accountId,
      division: divisionId,
      createdBy: userId,
      usuario: userId,
      tipo: 'create',
      entidad: 'event'
    });

    await activity.save();

    res.json({
      success: true,
      message: 'Actividad creada correctamente',
      activity: activity
    });
  } catch (error) {
    console.error('Error creating activity:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para eliminar actividades
app.delete('/api/activities/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;

    // Verificar que la actividad existe
    const activity = await Activity.findById(id);

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Actividad no encontrada'
      });
    }

    // Verificar permisos (solo superadmin puede eliminar actividades)
    const user = await User.findById(userId).populate('role');

    if (user.role?.nombre !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar actividades'
      });
    }

    // Eliminar la actividad
    await Activity.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Actividad eliminada correctamente'
    });
  } catch (error) {
    console.error('Error deleting activity:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ==================== ENDPOINTS PARA ALUMNOS ====================

// Endpoint para obtener alumnos por institución y división
app.get('/api/students', authenticateToken, async (req, res) => {
  try {
    const { accountId, divisionId, year } = req.query;
    const { userId } = req.user;

    if (!accountId || !divisionId) {
      return res.status(400).json({
        success: false,
        message: 'accountId y divisionId son requeridos'
      });
    }

    // Verificar permisos del usuario
    const user = await User.findById(userId).populate('role');
    const userAssociation = await Shared.findOne({
      user: userId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation && user.role?.nombre !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para acceder a esta institución'
      });
    }

    // Construir query
    const query = {
      account: accountId,
      division: divisionId
    };

    if (year) {
      query.year = parseInt(year);
    }

    const students = await Student.find(query)
      .populate('account', 'nombre razonSocial')
      .populate('division', 'nombre descripcion')
      .sort({ apellido: 1, nombre: 1 });

    res.json({
      success: true,
      data: {
        students,
        total: students.length
      }
    });
  } catch (error) {
    console.error('Error obteniendo alumnos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para obtener alumnos por cuenta y división seleccionada
app.get('/api/students/by-account-division', authenticateToken, async (req, res) => {
  try {
    const { accountId, divisionId, year } = req.query;
    const { userId } = req.user;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'accountId es requerido'
      });
    }

    // Verificar permisos del usuario para esta cuenta
    const userAssociation = await Shared.findOne({
      user: userId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para acceder a esta institución'
      });
    }

    // Construir query
    const query = {
      account: accountId
    };

    // Si se especifica división, filtrar por ella
    if (divisionId) {
      query.division = divisionId;
    }

    if (year) {
      query.year = parseInt(year);
    }

    const students = await Student.find(query)
      .populate('account', 'nombre razonSocial')
      .populate('division', 'nombre descripcion')
      .sort({ apellido: 1, nombre: 1 });

    res.json({
      success: true,
      data: {
        students,
        total: students.length
      }
    });
  } catch (error) {
    console.error('Error obteniendo alumnos por cuenta y división:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para descargar plantilla de estudiantes
app.get('/api/students/template', authenticateToken, async (req, res) => {
  try {
    // Crear datos de ejemplo para la plantilla
    const templateData = [
      ['Nombre', 'Apellido', 'DNI', 'Email', 'Año', 'Nombre Tutor', 'Email Tutor', 'DNI Tutor'],
      ['Juan', 'Pérez', '12345678', 'juan.perez@email.com', '2024', 'Carlos Pérez', 'carlos.perez@email.com', '87654321'],
      ['María', 'García', '23456789', 'maria.garcia@email.com', '2024', 'Ana García', 'ana.garcia@email.com', '76543210'],
      ['Pedro', 'López', '34567890', 'pedro.lopez@email.com', '2024', 'Luis López', 'luis.lopez@email.com', '65432109']
    ];

    // Crear el workbook y worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(templateData);

    // Ajustar el ancho de las columnas
    worksheet['!cols'] = [
      { width: 15 }, // Nombre
      { width: 15 }, // Apellido
      { width: 12 }, // DNI
      { width: 25 }, // Email
      { width: 8 },  // Año
      { width: 15 }, // Nombre Tutor
      { width: 25 }, // Email Tutor
      { width: 12 }  // DNI Tutor
    ];

    // Agregar el worksheet al workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Estudiantes');

    // Generar el buffer del archivo
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Configurar headers para la descarga
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_estudiantes.xlsx"');
    res.setHeader('Content-Length', buffer.length);

    // Enviar el archivo
    res.send(buffer);

  } catch (error) {
    console.error('Error generando plantilla de estudiantes:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando plantilla de estudiantes'
    });
  }
});

// Endpoint para cargar alumnos desde Excel
app.post('/api/students/upload-excel', authenticateToken, uploadExcel.single('excel'), async (req, res) => {
  try {
    console.log('📁 Archivo recibido:', req.file);
    console.log('📋 Body recibido:', req.body);
    
    const { accountId, divisionId, year } = req.body;
    const { userId } = req.user;

    if (!accountId || !divisionId || !year || !req.file) {
      console.log('❌ Datos faltantes:', { accountId, divisionId, year, hasFile: !!req.file });
      return res.status(400).json({
        success: false,
        message: 'accountId, divisionId, year y archivo Excel son requeridos'
      });
    }

    // Verificar permisos del usuario
    const user = await User.findById(userId).populate('role');
    const userAssociation = await Shared.findOne({
      user: userId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation && user.role?.nombre !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para cargar alumnos en esta institución'
      });
    }

    // Verificar que la institución y división existen
    const account = await Account.findById(accountId);
    const division = await Grupo.findById(divisionId);

    if (!account || !division) {
      return res.status(404).json({
        success: false,
        message: 'Institución o división no encontrada'
      });
    }

    // Procesar el archivo Excel
    console.log('📖 Leyendo archivo Excel:', req.file.path);
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    console.log('📊 Datos extraídos:', data.length, 'filas');

    const results = {
      success: 0,
      errors: [],
      total: data.length
    };

    // Procesar cada fila
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2; // +2 porque Excel empieza en 1 y tenemos headers

      try {
        // Verificar si la fila está vacía (todos los campos requeridos están vacíos)
        const isRowEmpty = !row.nombre && !row.apellido && !row.dni && !row.dniTutor && !row.nombreTutor && !row.emailTutor;
        if (isRowEmpty) {
          continue; // Saltar filas completamente vacías
        }

        // Validar campos requeridos del alumno
        if (!row.nombre || !row.apellido || !row.dni) {
          const missingFields = [];
          if (!row.nombre) missingFields.push('nombre');
          if (!row.apellido) missingFields.push('apellido');
          if (!row.dni) missingFields.push('dni');
          
          results.errors.push({
            row: rowNumber,
            error: `Faltan campos requeridos del alumno: ${missingFields.join(', ')}`
          });
          continue;
        }

        // Validar campos requeridos del tutor
        if (!row.dniTutor || !row.nombreTutor || !row.emailTutor) {
          const missingFields = [];
          if (!row.dniTutor) missingFields.push('dniTutor');
          if (!row.nombreTutor) missingFields.push('nombreTutor');
          if (!row.emailTutor) missingFields.push('emailTutor');
          
          results.errors.push({
            row: rowNumber,
            error: `Faltan campos requeridos del tutor: ${missingFields.join(', ')}`
          });
          continue;
        }

        // Validar formato de email solo si está presente
        if (row.email) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(row.email)) {
            results.errors.push({
              row: rowNumber,
              error: 'Formato de email inválido'
            });
            continue;
          }
        }

        // Verificar si el alumno ya existe
        const queryConditions = [{ dni: String(row.dni).trim() }];
        
        // Solo agregar email a la búsqueda si está presente
        if (row.email) {
          queryConditions.push({ email: String(row.email).toLowerCase().trim() });
        }
        
        const existingStudent = await Student.findOne({
          $or: queryConditions
        });

        if (existingStudent) {
          const errorMessage = row.email 
            ? `Alumno ya existe con email ${String(row.email).trim()} o DNI ${String(row.dni).trim()}`
            : `Alumno ya existe con DNI ${String(row.dni).trim()}`;
          
          results.errors.push({
            row: rowNumber,
            error: errorMessage
          });
          continue;
        }

        // Manejar el tutor
        let tutorUser = null;
        
        // Buscar si el tutor ya existe
        const existingTutor = await User.findOne({
          $or: [
            { email: String(row.emailTutor).toLowerCase().trim() },
            { dni: String(row.dniTutor).trim() }
          ]
        });

        if (existingTutor) {
          tutorUser = existingTutor;
          console.log(`✅ Tutor encontrado: ${existingTutor.email}`);
          
          // Verificar si ya tiene una asociación con esta cuenta y grupo
          const existingAssociation = await Shared.findOne({
            user: existingTutor._id,
            account: accountId,
            division: divisionId,
            status: 'active'
          });
          
          if (existingAssociation) {
            console.log(`ℹ️ Tutor ya tiene asociación con esta cuenta y grupo`);
          } else {
            console.log(`⚠️ Tutor existe pero no tiene asociación con esta cuenta/grupo`);
          }
        } else {
          // Crear nuevo tutor
          console.log(`🆕 Creando nuevo tutor: ${row.emailTutor}`);
          
          // Obtener el rol de tutor (usamos familyadmin que es el más apropiado para padres/tutores)
          const tutorRole = await Role.findOne({ nombre: 'familyadmin' });
          if (!tutorRole) {
            results.errors.push({
              row: rowNumber,
              error: 'Rol de tutor no encontrado en el sistema'
            });
            continue;
          }

          // Crear el usuario tutor
          const tutorData = {
            name: String(row.nombreTutor).trim(),
            email: String(row.emailTutor).toLowerCase().trim(),
            password: 'tutor123', // Contraseña por defecto
            role: tutorRole._id,
            status: 'approved', // Aprobado automáticamente
            dni: String(row.dniTutor).trim()
          };

          tutorUser = new User(tutorData);
          await tutorUser.save();
          console.log(`✅ Tutor creado: ${tutorUser.email}`);

          // La asociación se creará después de crear el alumno
          console.log(`⏳ Asociación del tutor se creará después de crear el alumno...`);
        }

        // Crear el alumno
        console.log(`👤 Creando alumno...`);
        const studentData = {
          nombre: String(row.nombre).trim(),
          apellido: String(row.apellido).trim(),
          dni: String(row.dni).trim(),
          account: accountId,
          division: divisionId,
          year: parseInt(year),
          tutor: tutorUser._id, // Vincular al tutor
          createdBy: userId
        };
        
        // Solo agregar email si está presente
        if (row.email) {
          studentData.email = String(row.email).toLowerCase().trim();
        }
        
        console.log(`📝 Datos del alumno:`, studentData);
        const student = new Student(studentData);

        await student.save();
        console.log(`✅ Alumno creado exitosamente: ${student.nombre} ${student.apellido}`);
        
        // Crear asociación del tutor con institución + grupo + alumno específico
        console.log(`🔗 Creando asociación completa del tutor...`);
        
        // Verificar si ya existe una asociación para este tutor con este alumno
        const existingStudentAssociation = await Shared.findOne({
          user: tutorUser._id,
          account: accountId,
          division: divisionId,
          student: student._id,
          status: 'active'
        });
        
        if (existingStudentAssociation) {
          console.log(`ℹ️ Asociación tutor-alumno ya existe`);
        } else {
          await createAssociationByRole(
            tutorUser._id, 
            accountId, 
            'familyadmin', 
            divisionId, 
            student._id, 
            userId
          );
        }
        
        results.success++;

      } catch (error) {
        console.log(`❌ Error en fila ${rowNumber}:`, error.message);
        console.log(`❌ Stack trace:`, error.stack);
        results.errors.push({
          row: rowNumber,
          error: error.message
        });
      }
    }

    // Eliminar el archivo temporal
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: `Carga completada. ${results.success} alumnos cargados exitosamente.`,
      data: results
    });

  } catch (error) {
    console.error('Error cargando alumnos desde Excel:', error);
    
    // Eliminar archivo temporal si existe
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint de prueba para descargar plantilla de coordinadores (sin auth)
app.get('/api/coordinators/template-test', async (req, res) => {
  try {
    console.log('📄 Generando plantilla de coordinadores (test)...');
    
    // Crear datos de ejemplo para la plantilla
    const templateData = [
      ['Nombre', 'Email', 'DNI'],
      ['Juan Pérez', 'juan.perez@institucion.com', '12345678'],
      ['María García', 'maria.garcia@institucion.com', '87654321'],
      ['Carlos López', 'carlos.lopez@institucion.com', '11223344']
    ];

    // Crear el workbook y worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(templateData);

    // Ajustar el ancho de las columnas
    worksheet['!cols'] = [
      { width: 20 }, // Nombre
      { width: 30 }, // Email
      { width: 15 }  // DNI
    ];

    // Agregar el worksheet al workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Coordinadores');

    // Generar el archivo temporal
    const tempFilePath = path.join(__dirname, 'temp_template.xlsx');
    XLSX.writeFile(workbook, tempFilePath);

    console.log(`📊 Archivo generado: ${tempFilePath}`);

    // Leer el archivo y enviarlo
    const fileBuffer = fs.readFileSync(tempFilePath);
    
    // Configurar headers para la descarga
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_coordinadores_test.xlsx"');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    // Enviar el archivo
    res.send(fileBuffer);
    
    // Limpiar archivo temporal
    fs.unlinkSync(tempFilePath);
    
    console.log('✅ Plantilla enviada exitosamente');

  } catch (error) {
    console.error('❌ Error generando plantilla:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando plantilla'
    });
  }
});

// Endpoint para descargar plantilla de coordinadores
app.get('/api/coordinators/template', authenticateToken, async (req, res) => {
  try {
    console.log('📄 Generando plantilla de coordinadores...');
    
    // Crear datos de ejemplo para la plantilla
    const templateData = [
      ['Nombre', 'Email', 'DNI'],
      ['Juan Pérez', 'juan.perez@institucion.com', '12345678'],
      ['María García', 'maria.garcia@institucion.com', '87654321'],
      ['Carlos López', 'carlos.lopez@institucion.com', '11223344']
    ];

    // Crear el workbook y worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(templateData);

    // Ajustar el ancho de las columnas
    worksheet['!cols'] = [
      { width: 20 }, // Nombre
      { width: 30 }, // Email
      { width: 15 }  // DNI
    ];

    // Agregar el worksheet al workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Coordinadores');

    // Generar el buffer directamente
    const buffer = XLSX.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx'
    });

    console.log(`📊 Archivo generado: ${buffer.length} bytes`);
    
    // Configurar headers para la descarga
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_coordinadores.xlsx"');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    // Enviar el archivo
    res.send(buffer);
    
    console.log('✅ Plantilla enviada exitosamente');

  } catch (error) {
    console.error('❌ Error generando plantilla:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando plantilla'
    });
  }
});

// Endpoint para cargar coordinadores desde Excel
app.post('/api/coordinators/upload-excel', authenticateToken, uploadExcel.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se ha proporcionado ningún archivo'
      });
    }

    const { userId } = req.user;
    const { divisionId } = req.body; // ID de la división donde se cargarán los coordinadores

    if (!divisionId) {
      return res.status(400).json({
        success: false,
        message: 'ID de división es requerido'
      });
    }

    // Verificar que la división existe
    const division = await Grupo.findById(divisionId);
    if (!division) {
      return res.status(404).json({
        success: false,
        message: 'División no encontrada'
      });
    }

    // Verificar permisos del usuario
    const currentUser = await User.findById(userId).populate('role');
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Solo superadmin y adminaccount pueden cargar coordinadores
    if (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para cargar coordinadores'
      });
    }

    // Si es adminaccount, verificar que pertenece a la cuenta de la división
    if (currentUser.role?.nombre === 'adminaccount') {
      const userAssociation = await Shared.findOne({
        user: currentUser._id,
        account: division.cuenta,
        status: 'active'
      });

      if (!userAssociation) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para cargar coordinadores en esta división'
        });
      }
    }

    // Leer el archivo Excel
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Validar que hay datos
    if (data.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'El archivo debe contener al menos una fila de datos (excluyendo encabezados)'
      });
    }

    const results = {
      success: 0,
      errors: []
    };

    // Obtener el rol de coordinador
    const coordinadorRole = await Role.findOne({ nombre: 'coordinador' });
    if (!coordinadorRole) {
      return res.status(500).json({
        success: false,
        message: 'Rol de coordinador no encontrado en el sistema'
      });
    }

    // Procesar cada fila (empezar desde la fila 2, saltando encabezados)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 1;

      try {
        // Verificar si la fila está vacía
        const isRowEmpty = !row[0] && !row[1] && !row[2];
        if (isRowEmpty) {
          console.log(`⏭️ Fila ${rowNumber} está vacía, saltando...`);
          continue;
        }

        // Extraer datos de la fila
        const nombre = String(row[0] || '').trim();
        const email = String(row[1] || '').toLowerCase().trim();
        const dni = String(row[2] || '').trim();

        // Validar campos requeridos
        if (!nombre || !email || !dni) {
          const missingFields = [];
          if (!nombre) missingFields.push('nombre');
          if (!email) missingFields.push('email');
          if (!dni) missingFields.push('dni');
          
          results.errors.push({
            row: rowNumber,
            error: `Faltan campos requeridos: ${missingFields.join(', ')}`
          });
          continue;
        }

        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          results.errors.push({
            row: rowNumber,
            error: 'Formato de email inválido'
          });
          continue;
        }

        // Verificar si el coordinador ya existe
        const existingCoordinator = await User.findOne({
          $or: [
            { email: email },
            { dni: dni }
          ]
        });

        let coordinatorUser = null;

        if (existingCoordinator) {
          coordinatorUser = existingCoordinator;
          console.log(`✅ Coordinador encontrado: ${existingCoordinator.email}`);
        } else {
          // Crear nuevo coordinador
          console.log(`🆕 Creando nuevo coordinador: ${email}`);
          
          // Crear el usuario coordinador
          const coordinatorData = {
            name: nombre,
            email: email,
            password: 'coordinador123', // Contraseña por defecto
            role: coordinadorRole._id,
            status: 'approved', // Aprobado automáticamente
            dni: dni
          };

          coordinatorUser = new User(coordinatorData);
          await coordinatorUser.save();
          console.log(`✅ Coordinador creado: ${coordinatorUser.email}`);
        }

        // Verificar si ya existe una asociación para este coordinador con esta división
        const existingAssociation = await Shared.findOne({
          user: coordinatorUser._id,
          account: division.cuenta,
          division: divisionId,
          status: 'active'
        });

        if (existingAssociation) {
          console.log(`ℹ️ Coordinador ya tiene asociación con esta división`);
        } else {
          // Crear asociación del coordinador con institución + división
          console.log(`🔗 Creando asociación del coordinador...`);
          await createAssociationByRole(
            coordinatorUser._id,
            division.cuenta,
            'coordinador',
            divisionId,
            null,
            userId
          );
        }

        results.success++;

      } catch (error) {
        console.log(`❌ Error en fila ${rowNumber}:`, error.message);
        console.log(`❌ Stack trace:`, error.stack);
        results.errors.push({
          row: rowNumber,
          error: error.message
        });
      }
    }

    // Eliminar el archivo temporal
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: `Carga completada. ${results.success} coordinadores cargados exitosamente.`,
      data: results
    });

  } catch (error) {
    console.error('Error cargando coordinadores desde Excel:', error);
    
    // Eliminar archivo temporal si existe
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para obtener coordinadores por división
app.get('/api/coordinators/by-division/:divisionId', authenticateToken, async (req, res) => {
  try {
    const { divisionId } = req.params;
    const { userId } = req.user;

    console.log('🔍 Obteniendo coordinadores para división:', divisionId);

    // Verificar que la división existe
    const division = await Grupo.findById(divisionId);
    if (!division) {
      return res.status(404).json({
        success: false,
        message: 'División no encontrada'
      });
    }

    // Verificar permisos del usuario
    const currentUser = await User.findById(userId).populate('role');
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Solo superadmin y adminaccount pueden ver coordinadores
    if (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver coordinadores'
      });
    }

    // Si es adminaccount, verificar que pertenece a la cuenta de la división
    if (currentUser.role?.nombre === 'adminaccount') {
      const userAssociation = await Shared.findOne({
        user: currentUser._id,
        account: division.cuenta,
        status: 'active'
      });

      if (!userAssociation) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para ver coordinadores de esta división'
        });
      }
    }

    // Buscar todas las asociaciones de coordinadores para esta división
    const coordinadorAssociations = await Shared.find({
      division: divisionId,
      status: 'active'
    }).populate([
      {
        path: 'user',
        select: 'name email status createdAt'
      },
      {
        path: 'role',
        select: 'nombre descripcion'
      }
    ]);

    // Filtrar solo los coordinadores
    const coordinadores = coordinadorAssociations.filter(association => 
      association.role?.nombre === 'coordinador'
    );

    console.log(`📊 Encontrados ${coordinadores.length} coordinadores para la división ${division.nombre}`);

    res.json({
      success: true,
      data: {
        division: {
          _id: division._id,
          nombre: division.nombre,
          descripcion: division.descripcion
        },
        coordinadores: coordinadores.map(association => ({
          _id: association.user._id,
          nombre: association.user.name,
          email: association.user.email,
          activo: association.user.status === 'approved',
          asociacionId: association._id,
          fechaAsociacion: association.createdAt
        }))
      }
    });

  } catch (error) {
    console.error('Error obteniendo coordinadores por división:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para obtener todos los coordinadores
app.get('/api/coordinators', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;

    console.log('🔍 Obteniendo todos los coordinadores...');

    // Verificar permisos del usuario
    const currentUser = await User.findById(userId).populate('role');
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Solo superadmin y adminaccount pueden ver coordinadores
    if (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver coordinadores'
      });
    }

    // Buscar todas las asociaciones de coordinadores
    let query = {
      status: 'active'
    };

    // Si es adminaccount, filtrar solo por sus cuentas
    if (currentUser.role?.nombre === 'adminaccount') {
      const userAssociations = await Shared.find({
        user: currentUser._id,
        status: 'active'
      });
      
      const accountIds = userAssociations.map(assoc => assoc.account);
      query.account = { $in: accountIds };
    }

    const coordinadorAssociations = await Shared.find(query).populate([
      {
        path: 'user',
        select: 'name email status createdAt'
      },
      {
        path: 'role',
        select: 'nombre descripcion'
      },
      {
        path: 'account',
        select: 'nombre razonSocial'
      },
      {
        path: 'division',
        select: 'nombre descripcion'
      }
    ]);

    // Filtrar solo los coordinadores
    const coordinadores = coordinadorAssociations.filter(association => 
      association.role?.nombre === 'coordinador'
    );

    console.log(`📊 Encontrados ${coordinadores.length} coordinadores totales`);

    res.json({
      success: true,
      data: {
        coordinadores: coordinadores.map(association => ({
          _id: association.user._id,
          nombre: association.user.name,
          email: association.user.email,
          activo: association.user.status === 'approved',
          asociacionId: association._id,
          fechaAsociacion: association.createdAt,
          division: association.division ? {
            _id: association.division._id,
            nombre: association.division.nombre,
            descripcion: association.division.descripcion
          } : null,
          account: association.account ? {
            _id: association.account._id,
            nombre: association.account.nombre,
            razonSocial: association.account.razonSocial
          } : null
        }))
      }
    });

  } catch (error) {
    console.error('Error obteniendo coordinadores:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para obtener todos los tutores
app.get('/api/tutors', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;

    console.log('🔍 Obteniendo todos los tutores...');

    // Verificar permisos del usuario
    const currentUser = await User.findById(userId).populate('role');
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Solo superadmin y adminaccount pueden ver tutores
    if (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver tutores'
      });
    }

    // Buscar todas las asociaciones de tutores
    let query = {
      status: 'active'
    };

    // Si es adminaccount, filtrar solo por sus cuentas
    if (currentUser.role?.nombre === 'adminaccount') {
      const userAssociations = await Shared.find({
        user: currentUser._id,
        status: 'active'
      });
      
      const accountIds = userAssociations.map(assoc => assoc.account);
      query.account = { $in: accountIds };
    }

    const tutorAssociations = await Shared.find(query).populate([
      {
        path: 'user',
        select: 'name email status createdAt'
      },
      {
        path: 'role',
        select: 'nombre descripcion'
      },
      {
        path: 'account',
        select: 'nombre razonSocial'
      },
      {
        path: 'division',
        select: 'nombre descripcion'
      },
      {
        path: 'student',
        select: 'nombre apellido'
      }
    ]);

    // Filtrar solo los tutores (familyadmin) y que tengan usuario válido
    const tutores = tutorAssociations.filter(association => 
      association.role?.nombre === 'familyadmin' && association.user
    );

    console.log(`📊 Encontrados ${tutores.length} tutores totales`);

    res.json({
      success: true,
      data: {
        tutores: tutores.map(association => ({
          _id: association.user?._id || null,
          nombre: association.user?.name || 'N/A',
          email: association.user?.email || 'N/A',
          activo: association.user?.status === 'approved',
          asociacionId: association._id,
          fechaAsociacion: association.createdAt,
          division: association.division ? {
            _id: association.division._id,
            nombre: association.division.nombre,
            descripcion: association.division.descripcion
          } : null,
          account: association.account ? {
            _id: association.account._id,
            nombre: association.account.nombre,
            razonSocial: association.account.razonSocial
          } : null,
          student: association.student ? {
            _id: association.student._id,
            nombre: association.student.nombre,
            apellido: association.student.apellido
          } : null
        }))
      }
    });

  } catch (error) {
    console.error('Error obteniendo tutores:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para obtener tutores por división
app.get('/api/tutors/by-division/:divisionId', authenticateToken, async (req, res) => {
  try {
    const { divisionId } = req.params;
    const { userId } = req.user;

    console.log('🔍 Obteniendo tutores para división:', divisionId);

    // Verificar que la división existe
    const division = await Grupo.findById(divisionId);
    if (!division) {
      return res.status(404).json({
        success: false,
        message: 'División no encontrada'
      });
    }

    // Verificar permisos del usuario
    const currentUser = await User.findById(userId).populate('role');
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Solo superadmin y adminaccount pueden ver tutores
    if (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver tutores'
      });
    }

    // Si es adminaccount, verificar que pertenece a la cuenta de la división
    if (currentUser.role?.nombre === 'adminaccount') {
      const userAssociation = await Shared.findOne({
        user: currentUser._id,
        account: division.cuenta,
        status: 'active'
      });

      if (!userAssociation) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para ver tutores de esta división'
        });
      }
    }

    // Buscar todas las asociaciones de tutores para esta división
    const tutorAssociations = await Shared.find({
      division: divisionId,
      status: 'active'
    }).populate([
      {
        path: 'user',
        select: 'name email status createdAt'
      },
      {
        path: 'role',
        select: 'nombre descripcion'
      },
      {
        path: 'student',
        select: 'nombre apellido'
      }
    ]);

    // Filtrar solo los tutores (familyadmin) y que tengan usuario válido
    const tutores = tutorAssociations.filter(association => 
      association.role?.nombre === 'familyadmin' && association.user
    );

    console.log(`📊 Encontrados ${tutores.length} tutores para la división ${division.nombre}`);

    res.json({
      success: true,
      data: {
        division: {
          _id: division._id,
          nombre: division.nombre,
          descripcion: division.descripcion
        },
        tutores: tutores.map(association => ({
          _id: association.user?._id || null,
          nombre: association.user?.name || 'N/A',
          email: association.user?.email || 'N/A',
          activo: association.user?.status === 'approved',
          asociacionId: association._id,
          fechaAsociacion: association.createdAt,
          student: association.student ? {
            _id: association.student._id,
            nombre: association.student.nombre,
            apellido: association.student.apellido
          } : null
        }))
      }
    });

  } catch (error) {
    console.error('Error obteniendo tutores por división:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para eliminar alumno
app.delete('/api/students/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;

    // Verificar que el alumno existe
    const student = await Student.findById(id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Alumno no encontrado'
      });
    }

    // Verificar permisos
    const user = await User.findById(userId).populate('role');
    const userAssociation = await Shared.findOne({
      user: userId,
      account: student.account,
      status: 'active'
    });

    if (!userAssociation && user.role?.nombre !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar este alumno'
      });
    }

    // Eliminar el alumno completamente de la base de datos
    await Student.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Alumno eliminado correctamente'
    });
  } catch (error) {
    console.error('Error eliminando alumno:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para guardar asistencia
app.post('/api/asistencia', authenticateToken, async (req, res) => {
  try {
    console.log('🚀 [ASISTENCIA] Iniciando endpoint de asistencia...');
    console.log('📥 Datos recibidos en /api/asistencia:', JSON.stringify(req.body, null, 2));
    console.log('👤 Usuario:', req.user);
    
    const { accountId, divisionId, estudiantes } = req.body;
    const { userId } = req.user;

    console.log('🔍 [ASISTENCIA] Validando datos básicos...');
    console.log('🔍 [ASISTENCIA] accountId:', accountId);
    console.log('🔍 [ASISTENCIA] divisionId:', divisionId);
    console.log('🔍 [ASISTENCIA] estudiantes:', estudiantes);

    // Validaciones básicas
    console.log('🔍 [ASISTENCIA] Validaciones básicas...');
    console.log('🔍 [ASISTENCIA] accountId existe:', !!accountId);
    console.log('🔍 [ASISTENCIA] divisionId existe:', !!divisionId);
    console.log('🔍 [ASISTENCIA] estudiantes existe:', !!estudiantes);
    console.log('🔍 [ASISTENCIA] estudiantes es array:', Array.isArray(estudiantes));
    
    if (!accountId || !divisionId || !estudiantes || !Array.isArray(estudiantes)) {
      console.log('❌ [ASISTENCIA] Validación básica falló');
      return res.status(400).json({
        success: false,
        message: 'accountId, divisionId y estudiantes (array) son requeridos'
      });
    }
    
    console.log('✅ [ASISTENCIA] Validaciones básicas pasaron, continuando...');
    console.log('🔍 [ASISTENCIA] Llegando a validación de cuenta...');

    // Verificar que la cuenta existe
    console.log('🔍 [ASISTENCIA] accountId recibido:', accountId, typeof accountId);
    console.log('🔍 [ASISTENCIA] Modelo Account disponible:', !!Account);
    console.log('🔍 [ASISTENCIA] Iniciando búsqueda de cuenta...');
    try {
      const account = await Account.findById(accountId);
      console.log('🔍 [ASISTENCIA] Resultado de Account.findById:', account);
      if (!account) {
        console.log('❌ [ASISTENCIA] Cuenta no encontrada para ID:', accountId);
        return res.status(400).json({
          success: false,
          message: 'La cuenta especificada no existe'
        });
      }
      console.log('✅ [ASISTENCIA] Cuenta encontrada:', account.nombre);
    } catch (e) {
      console.error('❌ [ASISTENCIA] Error en Account.findById:', e);
      return res.status(500).json({
        success: false,
        message: 'Error buscando la cuenta',
        error: e.message
      });
    }

    // Verificar que la división existe
    const division = await Grupo.findById(divisionId);
    if (!division) {
      return res.status(400).json({
        success: false,
        message: 'La división especificada no existe'
      });
    }

    // Verificar permisos del usuario
    const userAssociation = await Shared.findOne({
      user: userId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para registrar asistencia en esta cuenta'
      });
    }

    // Verificar que todos los estudiantes existen y pertenecen a la división
    const studentIds = estudiantes.map(e => e.studentId);
    const students = await Student.find({
      _id: { $in: studentIds },
      account: accountId,
      division: divisionId
    });

    if (students.length !== estudiantes.length) {
      return res.status(400).json({
        success: false,
        message: 'Algunos estudiantes no existen o no pertenecen a la división especificada'
      });
    }

    // Crear fecha para el día actual (solo fecha, sin hora)
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const fechaStr = `${yyyy}-${mm}-${dd}`;

    // Verificar si ya existe una asistencia para hoy
    const existingAsistencia = await Asistencia.findOne({
      account: accountId,
      division: divisionId,
      fecha: fechaStr
    });

    if (existingAsistencia) {
      // Actualizar la asistencia existente
      existingAsistencia.estudiantes = estudiantes.map(e => ({
        student: e.studentId,
        presente: e.presente
      }));
      
      await existingAsistencia.save();
      
      // Contar estudiantes presentes
      const presentes = estudiantes.filter(e => e.presente).length;
      const total = estudiantes.length;

      return res.status(200).json({
        success: true,
        message: `Asistencia actualizada exitosamente. ${presentes} de ${total} estudiantes presentes.`,
        data: {
          id: existingAsistencia._id,
          fecha: existingAsistencia.fecha,
          total: total,
          presentes: presentes
        }
      });
    }

    // Crear el registro de asistencia
    const asistenciaData = {
      account: accountId,
      division: divisionId,
      fecha: fechaStr,
      estudiantes: estudiantes.map(e => ({
        student: e.studentId,
        presente: e.presente
      })),
      creadoPor: userId
    };

    const asistencia = new Asistencia(asistenciaData);
    await asistencia.save();

    // Contar estudiantes presentes
    const presentes = estudiantes.filter(e => e.presente).length;
    const total = estudiantes.length;

    res.status(201).json({
      success: true,
      message: `Asistencia guardada exitosamente. ${presentes} de ${total} estudiantes presentes.`,
      data: {
        id: asistencia._id,
        fecha: asistencia.fecha,
        total: total,
        presentes: presentes
      }
    });

  } catch (error) {
    console.error('❌ [ASISTENCIA] Error general en endpoint:', error);
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

// Obtener asistencia por cuenta, división y fecha
app.get('/api/asistencia/by-date', authenticateToken, async (req, res) => {
  try {
    const { accountId, divisionId, date } = req.query;
    if (!accountId || !divisionId) {
      return res.status(400).json({ success: false, message: 'accountId y divisionId son requeridos' });
    }
    
    console.log('🔍 [GET ASISTENCIA] Parámetros recibidos:', { accountId, divisionId, date });
    
    const fechaStr = date || new Date().toISOString().split('T')[0];
    
    console.log('🔍 [GET ASISTENCIA] fechaStr:', fechaStr);
    
    const asistencia = await Asistencia.findOne({
      account: accountId,
      division: divisionId,
      fecha: fechaStr
    });
    
    console.log('🔍 [GET ASISTENCIA] Resultado de búsqueda:', asistencia);
    
    if (!asistencia) {
      console.log('🔍 [GET ASISTENCIA] No se encontró asistencia');
      return res.json({ success: true, data: null });
    }
    
    console.log('🔍 [GET ASISTENCIA] Asistencia encontrada:', asistencia);
    res.json({ success: true, data: asistencia });
  } catch (error) {
    console.error('❌ [GET ASISTENCIA] Error:', error);
    res.status(500).json({ success: false, message: 'Error interno', error: error.message });
  }
});

// ==================== ENDPOINTS DE NOTIFICACIONES ====================

// Obtener notificaciones del usuario
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { 
      limit = 20, 
      skip = 0, 
      unreadOnly = false,
      accountId,
      divisionId,
      userRole,
      isCoordinador
    } = req.query;
    
    console.log('🔔 [GET NOTIFICATIONS] Usuario:', userId);
    console.log('🔔 [GET NOTIFICATIONS] Parámetros:', { accountId, divisionId, userRole, isCoordinador });
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    console.log('🔔 [GET NOTIFICATIONS] Rol del usuario:', user.role?.nombre);
    
    const options = {
      limit: parseInt(limit),
      skip: parseInt(skip),
      unreadOnly: unreadOnly === 'true',
      accountId,
      divisionId,
      userRole: user.role?.nombre,
      isCoordinador: user.role?.nombre === 'coordinador'
    };
    
    const notifications = await Notification.getUserNotifications(userId, options);
    
    console.log('🔔 [GET NOTIFICATIONS] Notificaciones encontradas:', notifications.length);
    
    res.json({
      success: true,
      data: notifications
    });
    
  } catch (error) {
    console.error('❌ [GET NOTIFICATIONS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener notificaciones'
    });
  }
});

// Marcar notificación como leída
app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const notificationId = req.params.id;
    
    console.log('🔔 [MARK READ] Usuario:', userId, 'Notificación:', notificationId);
    
    const notification = await Notification.findById(notificationId);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notificación no encontrada'
      });
    }
    
    await notification.markAsRead(userId);
    
    console.log('🔔 [MARK READ] Notificación marcada como leída');
    
    res.json({
      success: true,
      message: 'Notificación marcada como leída'
    });
    
  } catch (error) {
    console.error('❌ [MARK READ] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al marcar notificación como leída'
    });
  }
});

// Eliminar notificación
app.delete('/api/notifications/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const notificationId = req.params.id;
    
    console.log('🔔 [DELETE] Usuario:', userId, 'Notificación:', notificationId);
    
    const notification = await Notification.findById(notificationId);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notificación no encontrada'
      });
    }
    
    // Verificar permisos: solo el remitente o un superadmin puede eliminar
    const user = await User.findById(userId).populate('role');
    const isSuperAdmin = user?.role?.nombre === 'superadmin';
    const isSender = notification.sender.toString() === userId;
    
    if (!isSuperAdmin && !isSender) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar esta notificación'
      });
    }
    
    await Notification.findByIdAndDelete(notificationId);
    
    console.log('🔔 [DELETE] Notificación eliminada');
    
    res.json({
      success: true,
      message: 'Notificación eliminada correctamente'
    });
    
  } catch (error) {
    console.error('❌ [DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar notificación'
    });
  }
});

// Endpoint de prueba para verificar que el servidor funciona
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'Servidor funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});

// Endpoint para obtener datos de ejemplo del usuario (sin autenticación)
app.get('/api/users/example', (req, res) => {
  const exampleUser = {
    _id: 'juan-perez-id',
    name: 'Juan Pérez',
    email: 'juan.perez@test.com',
    telefono: '+54 9 11 5555-1234',
    avatar: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  res.json({
    success: true,
    data: exampleUser
  });
});

// Endpoint para obtener datos del usuario actual
app.get('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Endpoint para actualizar datos del usuario (sin autenticación para testing)
app.put('/api/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, phone, telefono } = req.body;

    // Log para debuggear qué datos llegan
    console.log('🔍 [Server] Datos recibidos:', {
      userId,
      body: req.body,
      name,
      phone,
      telefono
    });

    // Para testing, simular actualización con datos de ejemplo
    const updatedUser = {
      _id: userId,
      name: name || 'Juan Pérez',
      email: 'juan.perez@test.com',
      telefono: phone || telefono || '+54 9 11 5555-1234',
      avatar: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    console.log('🔍 [Server] Usuario actualizado (simulado):', updatedUser);

    res.json({
      success: true,
      data: updatedUser
    });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Endpoint para subir avatar del usuario (sin autenticación para testing)
app.post('/api/users/:userId/avatar', upload.single('avatar'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se proporcionó imagen' });
    }

    // Para testing, simular subida a S3
    const avatarUrl = `https://s3.amazonaws.com/ki-bucket/avatars/${userId}/${Date.now()}-${req.file.originalname}`;
    
    console.log('🔍 [Server] Avatar simulado:', avatarUrl);

    res.json({
      success: true,
      avatarUrl: avatarUrl,
      message: 'Avatar actualizado correctamente'
    });
  } catch (error) {
    console.error('Error al subir avatar:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Endpoint para eliminar avatar del usuario
app.delete('/api/users/:userId/avatar', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verificar que el usuario solo puede eliminar su propio avatar
    if (req.user.userId !== userId) {
      return res.status(403).json({ success: false, message: 'No tienes permisos para actualizar este usuario' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    // Eliminar avatar anterior de S3 si existe
    if (user.avatar) {
      const key = user.avatar.split('/').pop();
      try {
        await s3.deleteObject({
          Bucket: S3_BUCKET_NAME,
          Key: `avatars/${userId}/${key}`
        }).promise();
      } catch (s3Error) {
        console.error('Error al eliminar archivo de S3:', s3Error);
      }
    }

    // Limpiar avatar del usuario
    user.avatar = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Avatar eliminado correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar avatar:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Obtener notificaciones para el backoffice (servicio específico)
app.get('/api/backoffice/notifications', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { 
      limit = 100, 
      skip = 0, 
      accountId,
      divisionId,
      type,
      search
    } = req.query;
    
    console.log('🔔 [BACKOFFICE NOTIFICATIONS] Usuario:', userId);
    console.log('🔔 [BACKOFFICE NOTIFICATIONS] Parámetros:', { accountId, divisionId, type, search });
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    console.log('🔔 [BACKOFFICE NOTIFICATIONS] Rol del usuario:', user.role?.nombre);
    
    // Construir query base
    let query = {};
    
    // Lógica según el rol
    if (user.role?.nombre === 'superadmin') {
      // Superadmin ve todas las notificaciones de todas las cuentas
      if (accountId) {
        query.account = accountId;
      }
    } else if (user.role?.nombre === 'adminaccount') {
      // Adminaccount ve todas las notificaciones de su cuenta
      query.account = user.account?._id;
    } else {
      // Otros roles no tienen acceso al backoffice
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para acceder a esta sección'
      });
    }
    
    // Filtros adicionales
    if (divisionId) {
      query.division = divisionId;
    }
    
    if (type && type !== 'all') {
      query.type = type;
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } }
      ];
    }
    
    console.log('🔔 [BACKOFFICE NOTIFICATIONS] Query final:', JSON.stringify(query, null, 2));
    
    // Obtener total de notificaciones para la paginación
    const total = await Notification.countDocuments(query);
    
    // Obtener notificaciones con paginación
    const notifications = await Notification.find(query)
      .populate('sender', 'nombre email')
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('recipients', 'nombre email') // Agregar población de destinatarios
      .sort({ sentAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    // Calcular información de paginación
    const currentPage = Math.floor(parseInt(skip) / parseInt(limit)) + 1;
    const totalPages = Math.ceil(total / parseInt(limit));
    const hasNextPage = currentPage < totalPages;
    const hasPrevPage = currentPage > 1;
    
    console.log('🔔 [BACKOFFICE NOTIFICATIONS] Notificaciones encontradas:', notifications.length);
    console.log('🔔 [BACKOFFICE NOTIFICATIONS] Paginación:', { currentPage, totalPages, total });
    
    res.json({
      success: true,
      data: notifications,
      pagination: {
        currentPage,
        totalPages,
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNextPage,
        hasPrevPage
      }
    });
    
  } catch (error) {
    console.error('❌ [BACKOFFICE NOTIFICATIONS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener notificaciones'
    });
  }
});

// Enviar nueva notificación
app.post('/api/notifications', authenticateToken, async (req, res) => {
  try {
    console.log('🔔 [SEND NOTIFICATION] Iniciando...');
    const { title, message, type, accountId, divisionId, recipients = [] } = req.body;
    const userId = req.user.userId;

    console.log('🔔 [SEND NOTIFICATION] Datos recibidos:', { title, message, type, accountId, divisionId, recipients });

    // Validar campos requeridos
    if (!title || !message || !type || !accountId) {
      console.log('❌ [SEND NOTIFICATION] Campos faltantes');
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: título, mensaje, tipo y cuenta'
      });
    }

    // Validar tipo de notificación
    if (!['informacion', 'comunicacion'].includes(type)) {
      console.log('❌ [SEND NOTIFICATION] Tipo inválido:', type);
      return res.status(400).json({
        success: false,
        message: 'Tipo de notificación inválido. Debe ser "informacion" o "comunicacion"'
      });
    }

    // Verificar que el usuario tiene permisos para la cuenta
    console.log('🔔 [SEND NOTIFICATION] Verificando permisos...');
    const userAssociation = await Shared.findOne({
      user: userId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation) {
      console.log('❌ [SEND NOTIFICATION] Sin permisos');
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para enviar notificaciones a esta cuenta'
      });
    }

    console.log('🔔 [SEND NOTIFICATION] Creando notificación...');
    // Crear la notificación
    const notification = new Notification({
      title,
      message,
      type,
      sender: userId,
      account: accountId,
      division: divisionId,
      recipients,
      status: 'sent',
      priority: 'medium',
      readBy: [],
      sentAt: new Date()
    });

    await notification.save();
    console.log('🔔 [SEND NOTIFICATION] Notificación guardada:', notification._id);

    // Populate sender info
    await notification.populate('sender', 'nombre email');

    res.status(201).json({
      success: true,
      message: 'Notificación enviada exitosamente',
      data: {
        id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        sentAt: notification.sentAt
      }
    });

  } catch (error) {
    console.error('❌ [SEND NOTIFICATION] Error completo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al enviar notificación'
    });
  }
});

// Obtener usuarios disponibles para enviar notificaciones
app.get('/api/notifications/recipients', authenticateToken, async (req, res) => {
  try {
    const { accountId, divisionId } = req.query;
    
    console.log('🔔 [GET RECIPIENTS] Parámetros:', { accountId, divisionId });
    
    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'accountId es requerido'
      });
    }
    
    // Buscar usuarios asociados a la cuenta/división
    let query = { account: accountId };
    
    if (divisionId) {
      query.division = divisionId;
    }
    
    const associations = await Shared.find(query)
      .populate('user', 'nombre email')
      .populate('account', 'nombre')
      .populate('division', 'nombre');
    
    const recipients = associations.map(assoc => ({
      id: assoc.user._id,
      nombre: assoc.user.nombre,
      email: assoc.user.email,
      account: assoc.account.nombre,
      division: assoc.division?.nombre || 'Sin división'
    }));
    
    console.log('🔔 [GET RECIPIENTS] Destinatarios encontrados:', recipients.length);
    
    res.json({
      success: true,
      data: recipients
    });
    
  } catch (error) {
    console.error('❌ [GET RECIPIENTS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener destinatarios'
    });
  }
});

// ===== NUEVOS ENDPOINTS DE EVENTOS =====

// Crear evento (solo coordinadores)
app.post('/api/events/create', authenticateToken, async (req, res) => {
  try {
    const { titulo, descripcion, fecha, hora, lugar, institutionId, divisionId } = req.body;
    const currentUser = req.user;

    console.log('📅 [CREATE EVENT] Datos recibidos:', { titulo, descripcion, fecha, hora, lugar, institutionId, divisionId });
    console.log('👤 [CREATE EVENT] Usuario:', currentUser._id, currentUser.role?.nombre);

    // Verificar que el usuario es coordinador
    if (currentUser.role?.nombre !== 'coordinador') {
      return res.status(403).json({
        success: false,
        message: 'Solo los coordinadores pueden crear eventos'
      });
    }

    // Validar campos requeridos
    if (!titulo || !descripcion || !fecha || !hora) {
      return res.status(400).json({
        success: false,
        message: 'Título, descripción, fecha y hora son requeridos'
      });
    }

    // Resolver la asociación del usuario en base a institutionId/divisionId si se recibieron
    const assocFilter = {
      user: currentUser._id,
      status: { $in: ['active', 'pending'] }
    };
    if (institutionId) {
      assocFilter.account = institutionId;
    }
    if (divisionId) {
      assocFilter.division = divisionId;
    }

    const userAssociation = await Shared.findOne(assocFilter).populate('account division');

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: institutionId || divisionId
          ? 'No tienes acceso a la institución/división indicada'
          : 'Usuario no tiene asociaciones activas'
      });
    }

    // Crear el evento
    const newEvent = new Event({
      titulo,
      descripcion,
      fecha: new Date(fecha),
      hora,
      lugar: lugar || '',
      creador: currentUser._id,
      institucion: userAssociation.account._id,
      division: userAssociation.division?._id || null,
      estado: 'activo'
    });

    await newEvent.save();
    console.log('📅 [CREATE EVENT] Evento creado:', newEvent._id);

    // Populate para la respuesta
    await newEvent.populate('creador', 'name email');
    await newEvent.populate('institucion', 'nombre');
    await newEvent.populate('division', 'nombre');

    res.status(201).json({
      success: true,
      message: 'Evento creado exitosamente',
      data: {
        _id: newEvent._id,
        titulo: newEvent.titulo,
        descripcion: newEvent.descripcion,
        fecha: newEvent.fecha,
        hora: newEvent.hora,
        lugar: newEvent.lugar,
        estado: newEvent.estado,
        creador: newEvent.creador,
        institucion: newEvent.institucion,
        division: newEvent.division,
        createdAt: newEvent.createdAt
      }
    });

  } catch (error) {
    console.error('❌ [CREATE EVENT] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al crear evento'
    });
  }
});

// Obtener eventos por institución (para todos los roles)
app.get('/api/events/institution/:institutionId', authenticateToken, async (req, res) => {
  try {
    const { institutionId } = req.params;
    const { page = 1, limit = 20, divisionId } = req.query;
    const currentUser = req.user;

    console.log('📅 [GET EVENTS] Institución:', institutionId);
    if (divisionId) console.log('📚 [GET EVENTS] División:', divisionId);
    console.log('👤 [GET EVENTS] Usuario:', currentUser._id, currentUser.role?.nombre);

    // Verificar que el usuario tiene acceso a la institución
    const assocFilter = {
      user: currentUser._id,
      account: institutionId,
      status: { $in: ['active', 'pending'] }
    };
    if (divisionId) {
      // Si se solicita una división específica, validar acceso a esa división
      assocFilter.division = divisionId;
    }
    const userAssociation = await Shared.findOne(assocFilter);

    if (!userAssociation) {
      // Requerimiento: no retornar 404/403 cuando no hay acceso o no hay datos.
      // Responder 200 con lista vacía para mantener idempotencia del GET.
      return res.json({
        success: true,
        data: {
          events: [],
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit)
        }
      });
    }

    // Obtener eventos
    const query = { institucion: institutionId };
    if (divisionId) {
      query.division = divisionId;
    }
    const total = await Event.countDocuments(query);
    const events = await Event.find(query)
      .populate('creador', 'name email')
      .populate('institucion', 'nombre')
      .populate('division', 'nombre')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ fecha: 1 });

    console.log('📅 [GET EVENTS] Eventos encontrados:', events.length);
    
    res.json({
      success: true,
      data: {
        events: events.map(event => ({
          _id: event._id,
          titulo: event.titulo,
          descripcion: event.descripcion,
          fecha: event.fecha,
          hora: event.hora,
          lugar: event.lugar,
          estado: event.estado,
          creador: event.creador,
          institucion: event.institucion,
          division: event.division,
          createdAt: event.createdAt
        })),
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('❌ [GET EVENTS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al obtener eventos'
    });
  }
});

// ===== ENDPOINTS PARA LOGOS DE CUENTAS =====

// Actualizar logo de una cuenta
app.put('/api/accounts/:accountId/logo', authenticateToken, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { imageKey } = req.body;
    const currentUser = req.user;

    console.log('🖼️ [UPDATE LOGO] Cuenta:', accountId);
    console.log('🖼️ [UPDATE LOGO] Image Key:', imageKey);
    console.log('👤 [UPDATE LOGO] Usuario:', currentUser._id, currentUser.role?.nombre);

    // Verificar que el usuario tiene permisos para actualizar la cuenta
    if (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar logos de cuentas'
      });
    }

    // Verificar que la cuenta existe
    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada'
      });
    }

    // Si el usuario es adminaccount, verificar que pertenece a esa cuenta
    if (currentUser.role?.nombre === 'adminaccount') {
      const userAssociation = await Shared.findOne({
        user: currentUser._id,
        account: accountId,
        status: 'active'
      });

      if (!userAssociation) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para actualizar esta cuenta'
        });
      }
    }

    // Actualizar el logo de la cuenta
    account.logo = imageKey;
    await account.save();

    console.log('🖼️ [UPDATE LOGO] Logo actualizado exitosamente');

    res.json({
      success: true,
      message: 'Logo actualizado exitosamente',
      data: {
        accountId: account._id,
        logo: account.logo,
        logoUrl: `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${imageKey}`
      }
    });

  } catch (error) {
    console.error('❌ [UPDATE LOGO] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al actualizar el logo'
    });
  }
});

// Obtener logo de una cuenta
app.get('/api/accounts/:accountId/logo', authenticateToken, async (req, res) => {
  try {
    const { accountId } = req.params;
    const currentUser = req.user;

    console.log('🖼️ [GET LOGO] Cuenta:', accountId);
    console.log('👤 [GET LOGO] Usuario:', currentUser._id);

    // Verificar que la cuenta existe
    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada'
      });
    }

    // Verificar que el usuario tiene acceso a la cuenta
    const userAssociation = await Shared.findOne({
      user: currentUser._id,
      account: accountId,
      status: { $in: ['active', 'pending'] }
    });

    if (!userAssociation && currentUser.role?.nombre !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes acceso a esta cuenta'
      });
    }

    const logoUrl = account.logo 
      ? `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${account.logo}`
      : null;

    res.json({
      success: true,
      data: {
        accountId: account._id,
        logo: account.logo,
        logoUrl: logoUrl
      }
    });

  } catch (error) {
    console.error('❌ [GET LOGO] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al obtener el logo'
    });
  }
});

// ===== ENDPOINTS DE ASISTENCIAS PARA BACKOFFICE =====

// Obtener asistencias del backoffice con paginación
app.get('/api/backoffice/asistencias', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { 
      page = 1, 
      limit = 10, 
      accountId,
      grupoId,
      alumnoId,
      fechaInicio,
      fechaFin,
      estado,
      search
    } = req.query;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS] Usuario:', userId);
    console.log('📊 [BACKOFFICE ASISTENCIAS] Parámetros:', { accountId, grupoId, alumnoId, fechaInicio, fechaFin, estado, search });
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    console.log('📊 [BACKOFFICE ASISTENCIAS] Rol del usuario:', user.role?.nombre);
    
    // Construir query base
    let query = {};
    
    // Lógica según el rol
    if (user.role?.nombre === 'superadmin') {
      // Superadmin ve todas las asistencias de todas las cuentas
      if (accountId) {
        query.account = accountId;
      }
    } else if (user.role?.nombre === 'adminaccount') {
      // Adminaccount ve todas las asistencias de su cuenta
      query.account = user.account?._id;
    } else {
      // Otros roles no tienen acceso al backoffice
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para acceder a esta sección'
      });
    }
    
    // Filtros adicionales
    if (grupoId) {
      query.grupo = grupoId;
    }
    
    if (alumnoId) {
      query.alumno = alumnoId;
    }
    
    if (fechaInicio && fechaFin) {
      query.fecha = {
        $gte: new Date(fechaInicio),
        $lte: new Date(fechaFin)
      };
    } else if (fechaInicio) {
      query.fecha = { $gte: new Date(fechaInicio) };
    } else if (fechaFin) {
      query.fecha = { $lte: new Date(fechaFin) };
    }
    
    if (estado && estado !== 'all') {
      query.estado = estado;
    }
    
    if (search) {
      query.$or = [
        { 'alumno.nombre': { $regex: search, $options: 'i' } },
        { 'alumno.email': { $regex: search, $options: 'i' } },
        { observaciones: { $regex: search, $options: 'i' } }
      ];
    }
    
    console.log('📊 [BACKOFFICE ASISTENCIAS] Query final:', JSON.stringify(query, null, 2));
    
    // Obtener total de asistencias para la paginación
    const total = await Asistencia.countDocuments(query);
    
    // Calcular skip para paginación
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Obtener asistencias con paginación
    const asistencias = await Asistencia.find(query)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('creadoPor', 'nombre email')
      .populate('estudiantes.student', 'nombre apellido email')
      .sort({ fecha: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Calcular información de paginación
    const currentPage = parseInt(page);
    const totalPages = Math.ceil(total / parseInt(limit));
    const hasNextPage = currentPage < totalPages;
    const hasPrevPage = currentPage > 1;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS] Asistencias encontradas:', asistencias.length);
    console.log('📊 [BACKOFFICE ASISTENCIAS] Paginación:', { currentPage, totalPages, total });
    
    res.json({
      success: true,
      data: asistencias,
      pagination: {
        currentPage,
        totalPages,
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNextPage,
        hasPrevPage
      }
    });
    
  } catch (error) {
    console.error('❌ [BACKOFFICE ASISTENCIAS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener asistencias'
    });
  }
});

// Crear asistencia desde el backoffice
app.post('/api/backoffice/asistencias', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { alumnoId, accountId, grupoId, fecha, estado, horaLlegada, horaSalida, observaciones } = req.body;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS CREATE] Usuario:', userId);
    console.log('📊 [BACKOFFICE ASISTENCIAS CREATE] Datos:', { alumnoId, accountId, grupoId, fecha, estado });
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Verificar permisos
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear asistencias'
      });
    }
    
    // Para adminaccount, verificar que la cuenta pertenece al usuario
    if (user.role?.nombre === 'adminaccount' && accountId !== user.account?._id?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear asistencias en esta cuenta'
      });
    }
    
    // Verificar que el alumno existe y pertenece a la cuenta
    const alumno = await User.findById(alumnoId);
    if (!alumno) {
      return res.status(404).json({
        success: false,
        message: 'Alumno no encontrado'
      });
    }
    
    // Verificar que el grupo existe y pertenece a la cuenta (si se proporciona)
    if (grupoId) {
      const grupo = await Group.findById(grupoId);
      if (!grupo || grupo.account.toString() !== accountId) {
        return res.status(404).json({
          success: false,
          message: 'Grupo no encontrado o no pertenece a la cuenta'
        });
      }
    }
    
    // Crear la asistencia
    const nuevaAsistencia = new Asistencia({
      account: accountId,
      division: grupoId,
      fecha: fecha,
      estudiantes: [{
        student: alumnoId,
        presente: estado === 'presente'
      }],
      creadoPor: userId
    });
    
    await nuevaAsistencia.save();
    
    // Poblar los datos para la respuesta
    await nuevaAsistencia.populate('account', 'nombre');
    await nuevaAsistencia.populate('division', 'nombre');
    await nuevaAsistencia.populate('creadoPor', 'nombre email');
    await nuevaAsistencia.populate('estudiantes.student', 'nombre apellido email');
    
    console.log('📊 [BACKOFFICE ASISTENCIAS CREATE] Asistencia creada exitosamente');
    
    res.status(201).json({
      success: true,
      message: 'Asistencia registrada exitosamente',
      data: nuevaAsistencia
    });
    
  } catch (error) {
    console.error('❌ [BACKOFFICE ASISTENCIAS CREATE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear asistencia'
    });
  }
});

// Actualizar asistencia desde el backoffice
app.put('/api/backoffice/asistencias/:asistenciaId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { asistenciaId } = req.params;
    const { estado, horaLlegada, horaSalida, observaciones } = req.body;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS UPDATE] Usuario:', userId);
    console.log('📊 [BACKOFFICE ASISTENCIAS UPDATE] Asistencia:', asistenciaId);
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Verificar permisos
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar asistencias'
      });
    }
    
    // Buscar la asistencia
    const asistencia = await Asistencia.findById(asistenciaId);
    if (!asistencia) {
      return res.status(404).json({
        success: false,
        message: 'Asistencia no encontrada'
      });
    }
    
    // Para adminaccount, verificar que la asistencia pertenece a su cuenta
    if (user.role?.nombre === 'adminaccount' && asistencia.account.toString() !== user.account?._id?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar esta asistencia'
      });
    }
    
    // Actualizar la asistencia
    const updateData = {};
    if (estado) {
      // Actualizar el estado del estudiante en el array
      updateData.$set = {
        'estudiantes.$.presente': estado === 'presente'
      };
    }
    
    const asistenciaActualizada = await Asistencia.findByIdAndUpdate(
      asistenciaId,
      updateData,
      { new: true }
    ).populate('account', 'nombre')
     .populate('division', 'nombre')
     .populate('creadoPor', 'nombre email')
     .populate('estudiantes.student', 'nombre apellido email');
    
    console.log('📊 [BACKOFFICE ASISTENCIAS UPDATE] Asistencia actualizada exitosamente');
    
    res.json({
      success: true,
      message: 'Asistencia actualizada exitosamente',
      data: asistenciaActualizada
    });
    
  } catch (error) {
    console.error('❌ [BACKOFFICE ASISTENCIAS UPDATE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar asistencia'
    });
  }
});

// Eliminar asistencia desde el backoffice
app.delete('/api/backoffice/asistencias/:asistenciaId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { asistenciaId } = req.params;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS DELETE] Usuario:', userId);
    console.log('📊 [BACKOFFICE ASISTENCIAS DELETE] Asistencia:', asistenciaId);
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Verificar permisos
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar asistencias'
      });
    }
    
    // Buscar la asistencia
    const asistencia = await Asistencia.findById(asistenciaId);
    if (!asistencia) {
      return res.status(404).json({
        success: false,
        message: 'Asistencia no encontrada'
      });
    }
    
    // Para adminaccount, verificar que la asistencia pertenece a su cuenta
    if (user.role?.nombre === 'adminaccount' && asistencia.account.toString() !== user.account?._id?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar esta asistencia'
      });
    }
    
    // Eliminar la asistencia
    await Asistencia.findByIdAndDelete(asistenciaId);
    
    console.log('📊 [BACKOFFICE ASISTENCIAS DELETE] Asistencia eliminada exitosamente');
    
    res.json({
      success: true,
      message: 'Asistencia eliminada exitosamente'
    });
    
  } catch (error) {
    console.error('❌ [BACKOFFICE ASISTENCIAS DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar asistencia'
    });
  }
});

// Obtener estadísticas de asistencias
app.get('/api/backoffice/asistencias/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { accountId, fechaInicio, fechaFin } = req.query;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS STATS] Usuario:', userId);
    console.log('📊 [BACKOFFICE ASISTENCIAS STATS] Parámetros:', { accountId, fechaInicio, fechaFin });
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Verificar permisos
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver estadísticas'
      });
    }
    
    // Construir query base
    let query = {};
    
    // Lógica según el rol
    if (user.role?.nombre === 'superadmin') {
      if (accountId) {
        query.account = accountId;
      }
    } else if (user.role?.nombre === 'adminaccount') {
      query.account = user.account?._id;
    }
    
    // Filtros de fecha
    if (fechaInicio && fechaFin) {
      query.fecha = {
        $gte: new Date(fechaInicio),
        $lte: new Date(fechaFin)
      };
    } else if (fechaInicio) {
      query.fecha = { $gte: new Date(fechaInicio) };
    } else if (fechaFin) {
      query.fecha = { $lte: new Date(fechaFin) };
    }
    
    // Obtener estadísticas
    const totalAsistencias = await Asistencia.countDocuments(query);
    
    const statsPorEstado = await Asistencia.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$estado',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const statsPorDia = await Asistencia.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$fecha' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 30 }
    ]);
    
    console.log('📊 [BACKOFFICE ASISTENCIAS STATS] Estadísticas calculadas exitosamente');
    
    res.json({
      success: true,
      data: {
        totalAsistencias,
        statsPorEstado,
        statsPorDia
      }
    });
    
  } catch (error) {
    console.error('❌ [BACKOFFICE ASISTENCIAS STATS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas'
    });
  }
});

// Exportar asistencias a CSV
app.get('/api/backoffice/asistencias/export', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { accountId, grupoId, fechaInicio, fechaFin, estado } = req.query;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS EXPORT] Usuario:', userId);
    console.log('📊 [BACKOFFICE ASISTENCIAS EXPORT] Parámetros:', { accountId, grupoId, fechaInicio, fechaFin, estado });
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Verificar permisos
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para exportar asistencias'
      });
    }
    
    // Construir query base
    let query = {};
    
    // Lógica según el rol
    if (user.role?.nombre === 'superadmin') {
      if (accountId) {
        query.account = accountId;
      }
    } else if (user.role?.nombre === 'adminaccount') {
      query.account = user.account?._id;
    }
    
    // Filtros adicionales
    if (grupoId) {
      query.grupo = grupoId;
    }
    
    if (fechaInicio && fechaFin) {
      query.fecha = {
        $gte: new Date(fechaInicio),
        $lte: new Date(fechaFin)
      };
    } else if (fechaInicio) {
      query.fecha = { $gte: new Date(fechaInicio) };
    } else if (fechaFin) {
      query.fecha = { $lte: new Date(fechaFin) };
    }
    
    if (estado && estado !== 'all') {
      query.estado = estado;
    }
    
    // Obtener asistencias
    const asistencias = await Asistencia.find(query)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('creadoPor', 'nombre email')
      .populate('estudiantes.student', 'nombre apellido email')
      .sort({ fecha: -1, createdAt: -1 });
    
    // Generar CSV
    const csvHeader = 'Fecha,Alumno,Email,Cuenta,Grupo,Estado,Hora Llegada,Hora Salida,Observaciones,Registrado Por\n';
    
    const csvRows = asistencias.flatMap(asistencia => {
      const fecha = new Date(asistencia.fecha).toLocaleDateString('es-ES');
      const cuenta = asistencia.account?.nombre || 'N/A';
      const grupo = asistencia.division?.nombre || 'N/A';
      const registradoPor = asistencia.creadoPor?.nombre || 'N/A';
      
      return asistencia.estudiantes.map(estudiante => {
        const alumno = estudiante.student ? `${estudiante.student.nombre} ${estudiante.student.apellido}` : 'N/A';
        const email = estudiante.student?.email || 'N/A';
        const estado = estudiante.presente ? 'presente' : 'ausente';
        
        return `"${fecha}","${alumno}","${email}","${cuenta}","${grupo}","${estado}","N/A","N/A","N/A","${registradoPor}"`;
      });
    }).join('\n');
    
    const csvContent = csvHeader + csvRows;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS EXPORT] CSV generado exitosamente');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="asistencias_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
    
  } catch (error) {
    console.error('❌ [BACKOFFICE ASISTENCIAS EXPORT] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al exportar asistencias'
    });
  }
});

// ========================================
// ENDPOINTS CRUD PARA PICKUP (QUIÉN RETIRA)
// ========================================

// Obtener todas las personas autorizadas por cuenta (para backoffice)
app.get('/api/pickup/account/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { page = 1, limit = 20, division, student } = req.query;
    
    let query = { account: accountId, status: 'active' };
    
    if (division) {
      query.division = division;
    }
    
    if (student) {
      query.student = student;
    }
    
    const skip = (page - 1) * limit;
    
    const pickups = await Pickup.find(query)
      .populate('division', 'nombre')
      .populate('student', 'nombre apellido')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Pickup.countDocuments(query);
    
    res.json({
      success: true,
      data: pickups,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error al obtener personas autorizadas:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Obtener personas autorizadas por estudiante (para mobile)
app.get('/api/pickup/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const pickups = await Pickup.find({ student: studentId, status: 'active' })
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('student', 'nombre apellido')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: pickups
    });
  } catch (error) {
    console.error('Error al obtener personas autorizadas por estudiante:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Crear nueva persona autorizada
app.post('/api/pickup', async (req, res) => {
  try {
    const { account, division, student, nombre, apellido, dni, createdBy } = req.body;
    
    // Validar que no exista una persona con el mismo DNI para el mismo estudiante
    const existingPickup = await Pickup.findOne({ 
      student, 
      dni, 
      status: 'active' 
    });
    
    if (existingPickup) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una persona autorizada con este DNI para este estudiante'
      });
    }
    
    const pickup = new Pickup({
      account,
      division,
      student,
      nombre,
      apellido,
      dni,
      createdBy
    });
    
    await pickup.save();
    
    const populatedPickup = await Pickup.findById(pickup._id)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('student', 'nombre apellido')
      .populate('createdBy', 'name');
    
    res.status(201).json({
      success: true,
      data: populatedPickup,
      message: 'Persona autorizada creada correctamente'
    });
  } catch (error) {
    console.error('Error al crear persona autorizada:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Actualizar persona autorizada
app.put('/api/pickup/:pickupId', async (req, res) => {
  try {
    const { pickupId } = req.params;
    const { nombre, apellido, dni } = req.body;
    
    const pickup = await Pickup.findById(pickupId);
    if (!pickup) {
      return res.status(404).json({ success: false, message: 'Persona autorizada no encontrada' });
    }
    
    // Validar que no exista otra persona con el mismo DNI para el mismo estudiante
    if (dni && dni !== pickup.dni) {
      const existingPickup = await Pickup.findOne({ 
        student: pickup.student, 
        dni, 
        status: 'active',
        _id: { $ne: pickupId }
      });
      
      if (existingPickup) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe una persona autorizada con este DNI para este estudiante'
        });
      }
    }
    
    if (nombre) pickup.nombre = nombre;
    if (apellido) pickup.apellido = apellido;
    if (dni) pickup.dni = dni;
    
    await pickup.save();
    
    const updatedPickup = await Pickup.findById(pickupId)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('student', 'nombre apellido')
      .populate('createdBy', 'name');
    
    res.json({
      success: true,
      data: updatedPickup,
      message: 'Persona autorizada actualizada correctamente'
    });
  } catch (error) {
    console.error('Error al actualizar persona autorizada:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Eliminar persona autorizada (soft delete)
app.delete('/api/pickup/:pickupId', async (req, res) => {
  try {
    const { pickupId } = req.params;
    
    const pickup = await Pickup.findById(pickupId);
    if (!pickup) {
      return res.status(404).json({ success: false, message: 'Persona autorizada no encontrada' });
    }
    
    pickup.status = 'inactive';
    await pickup.save();
    
    res.json({
      success: true,
      message: 'Persona autorizada eliminada correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar persona autorizada:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// ========================================
// ENDPOINTS ADICIONALES PARA PICKUP SECTION
// ========================================

// Obtener divisiones por cuenta (para el frontend de pickup)
app.get('/divisions/account/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    
    // Buscar grupos que pertenecen a esta cuenta
    const grupos = await Grupo.find({ cuenta: accountId, activo: true })
      .populate('cuenta', 'nombre')
      .sort({ nombre: 1 });
    
    // Transformar grupos a formato de divisiones
    const divisions = grupos.map(grupo => ({
      _id: grupo._id,
      nombre: grupo.nombre
    }));
    
    res.json({
      success: true,
      data: divisions
    });
  } catch (error) {
    console.error('Error al obtener divisiones por cuenta:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Obtener estudiantes por división (para el frontend de pickup)
app.get('/students/division/:divisionId', async (req, res) => {
  try {
    const { divisionId } = req.params;
    
    // Buscar estudiantes que pertenecen a esta división (grupo)
    const students = await Student.find({ division: divisionId })
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .sort({ apellido: 1, nombre: 1 });
    
    res.json({
      success: true,
      data: students
    });
  } catch (error) {
    console.error('Error al obtener estudiantes por división:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// ========================================
// ENDPOINTS ESPECÍFICOS PARA MOBILE APP
// ========================================

// Obtener pickups para familyadmin por institución + división
app.get('/api/pickups/familyadmin', authenticateToken, async (req, res) => {
  try {
    console.log('🎯 [PICKUP FAMILYADMIN GET] Obteniendo pickups');
    const { userId } = req.user;
    const { division, student, page = 1, limit = 20 } = req.query;
    
    console.log('👤 [PICKUP FAMILYADMIN GET] Usuario:', userId);
    console.log('📋 [PICKUP FAMILYADMIN GET] Query params:', { division, student, page, limit });
    
    // Verificar que el usuario es familyadmin
    const user = await User.findById(userId).populate('role');
    if (user.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores familiares pueden acceder a esta información'
      });
    }
    
    // Obtener las asociaciones del usuario
    const userAssociations = await Shared.find({
      user: userId,
      status: 'active'
    }).populate('account division student');
    
    console.log('🔍 [PICKUP FAMILYADMIN GET] Asociaciones encontradas:', userAssociations.length);
    console.log('👥 [PICKUP FAMILYADMIN GET] Asociaciones:', userAssociations.map(assoc => ({
      account: assoc.account?.nombre,
      division: assoc.division?.nombre,
      student: assoc.student ? `${assoc.student.nombre} ${assoc.student.apellido}` : 'Sin estudiante'
    })));
    
    if (userAssociations.length === 0) {
      console.log('❌ [PICKUP FAMILYADMIN GET] No hay asociaciones activas');
      return res.json({
        success: true,
        data: {
          pickups: [],
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit)
        }
      });
    }
    
    // Construir query para buscar pickups de los estudiantes asociados al usuario
    const studentIds = userAssociations
      .filter(assoc => assoc.student)
      .map(assoc => assoc.student._id);
    
    console.log('🎓 [PICKUP FAMILYADMIN GET] Student IDs:', studentIds);
    
    let query = {
      student: { $in: studentIds },
      status: 'active'
    };
    
    // Filtrar por división si se especifica
    if (division && division !== 'all') {
      query.division = division;
    }
    
    // Filtrar por estudiante si se especifica
    if (student && student !== 'all') {
      query.student = student;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    console.log('🔍 [PICKUP FAMILYADMIN GET] Query final:', JSON.stringify(query, null, 2));
    
    const pickups = await Pickup.find(query)
      .populate('account', 'nombre')
      .populate('student', 'nombre apellido')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Pickup.countDocuments(query);
    
    console.log('📦 [PICKUP FAMILYADMIN GET] Pickups encontrados:', pickups.length);
    console.log('📊 [PICKUP FAMILYADMIN GET] Total en BD:', total);
    
    res.json({
      success: true,
      data: {
        pickups,
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error al obtener pickups para familyadmin:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Crear pickup para familyadmin
app.post('/api/pickups/familyadmin', authenticateToken, async (req, res) => {
  try {
    console.log('🎯 [PICKUP FAMILYADMIN] Iniciando creación de pickup');
    const { userId } = req.user;
    const { nombre, apellido, dni, divisionId } = req.body;
    
    console.log('👤 [PICKUP FAMILYADMIN] Usuario:', userId);
    console.log('📝 [PICKUP FAMILYADMIN] Datos recibidos:', {
      nombre, apellido, dni, divisionId
    });
    
    // Verificar que el usuario es familyadmin
    const user = await User.findById(userId).populate('role');
    if (user.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores familiares pueden crear personas autorizadas'
      });
    }
    
    // Buscar la asociación del usuario para obtener la institución y estudiante
    const userAssociation = await Shared.findOne({
      user: userId,
      status: 'active'
    }).populate('account student');
    
    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes asociaciones activas'
      });
    }
    
    // Verificar que el usuario tiene un estudiante asociado
    if (!userAssociation.student) {
      return res.status(404).json({
        success: false,
        message: 'No tienes estudiantes asociados'
      });
    }
    
    // Validar que no exista una persona con el mismo DNI para el mismo estudiante
    const existingPickup = await Pickup.findOne({ 
      student: userAssociation.student._id, 
      dni, 
      status: 'active' 
    });
    
    if (existingPickup) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una persona autorizada con este DNI para este estudiante'
      });
    }
    
    const pickup = new Pickup({
      account: userAssociation.account._id,
      division: divisionId,
      student: userAssociation.student._id,
      nombre,
      apellido,
      dni,
      createdBy: userId
    });
    
    await pickup.save();
    
    const populatedPickup = await Pickup.findById(pickup._id)
      .populate('account', 'nombre')
      .populate('student', 'nombre apellido')
      .populate('createdBy', 'name');
    
    res.status(201).json({
      success: true,
      data: {
        pickup: populatedPickup
      },
      message: 'Persona autorizada creada correctamente'
    });
  } catch (error) {
    console.error('Error al crear pickup para familyadmin:', error);
    
    // Manejar errores de validación de Mongoose
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false, 
        message: 'Error de validación',
        errors: validationErrors
      });
    }
    
    // Manejar otros errores
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Eliminar pickup
app.delete('/api/pickup/:id', authenticateToken, async (req, res) => {
  try {
    console.log('🗑️ [PICKUP DELETE] Eliminando pickup:', req.params.id);
    const { userId } = req.user;
    const { id } = req.params;
    
    // Verificar que el usuario es familyadmin
    const user = await User.findById(userId).populate('role');
    if (user.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores familiares pueden eliminar personas autorizadas'
      });
    }
    
    // Buscar el pickup
    const pickup = await Pickup.findById(id);
    if (!pickup) {
      return res.status(404).json({
        success: false,
        message: 'Persona autorizada no encontrada'
      });
    }
    
    // Verificar que el usuario tiene permisos para eliminar este pickup
    const userAssociation = await Shared.findOne({
      user: userId,
      student: pickup.student,
      status: 'active'
    });
    
    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar esta persona autorizada'
      });
    }
    
    // Eliminar el pickup (soft delete)
    pickup.status = 'inactive';
    await pickup.save();
    
    console.log('✅ [PICKUP DELETE] Pickup eliminado correctamente');
    
    res.json({
      success: true,
      message: 'Persona autorizada eliminada correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar pickup:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Obtener asociaciones del usuario
app.get('/api/shared/user', authenticateToken, async (req, res) => {
  try {
    console.log('🎯 [SHARED GET] Obteniendo asociaciones del usuario');
    const { userId } = req.user;
    
    console.log('👤 [SHARED GET] Usuario:', userId);
    
    // Obtener todas las asociaciones del usuario
    const userAssociations = await Shared.find({
      user: userId,
      status: 'active'
    }).populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('student', 'nombre apellido avatar')
      .populate('role', 'nombre')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    // Generar URLs firmadas para los avatares de estudiantes
    console.log('🔍 [SHARED GET] Generando URLs para avatares de estudiantes...');
    const associationsWithSignedUrls = await Promise.all(userAssociations.map(async (association) => {
      console.log('🔍 [SHARED GET] Asociación:', {
        id: association._id,
        studentId: association.student?._id,
        studentName: association.student?.nombre,
        studentAvatar: association.student?.avatar
      });
      
      if (association.student && association.student.avatar) {
        try {
          console.log('🔍 [SHARED GET] Procesando avatar del estudiante:', association.student._id);
          console.log('🔍 [SHARED GET] Avatar original:', association.student.avatar);
          
          // Verificar si es una key de S3 o una URL local
          if (association.student.avatar.startsWith('http')) {
            console.log('🔍 [SHARED GET] Es una URL completa, usando tal como está');
            // Es una URL completa (puede ser local o S3), no hacer nada
          } else if (association.student.avatar.includes('students/')) {
            // Es una key de S3 para estudiantes, generar URL firmada
            console.log('🔍 [SHARED GET] Es una key de S3 para estudiantes, generando URL firmada');
            const { generateSignedUrl } = require('./config/s3.config');
            const signedUrl = await generateSignedUrl(association.student.avatar, 3600); // 1 hora
            console.log('🔍 [SHARED GET] URL firmada generada:', signedUrl);
            association.student.avatar = signedUrl;
          } else {
            // Es una key local, generar URL local
            const localUrl = `${req.protocol}://${req.get('host')}/uploads/${association.student.avatar.split('/').pop()}`;
            console.log('🔍 [SHARED GET] URL local generada:', localUrl);
            association.student.avatar = localUrl;
          }
        } catch (error) {
          console.error('❌ [SHARED GET] Error procesando avatar del estudiante:', association.student._id, error);
          // Si falla, usar URL directa
          const fallbackUrl = `${req.protocol}://${req.get('host')}/uploads/${association.student.avatar.split('/').pop()}`;
          console.log('🔍 [SHARED GET] Usando URL de fallback:', fallbackUrl);
          association.student.avatar = fallbackUrl;
        }
      } else {
        console.log('🔍 [SHARED GET] Estudiante sin avatar:', association.student?._id);
      }
      return association;
    }));
    
    console.log('📦 [SHARED GET] Asociaciones encontradas:', associationsWithSignedUrls.length);
    
    res.json({
      success: true,
      data: {
        associations: associationsWithSignedUrls
      }
    });
  } catch (error) {
    console.error('Error al obtener asociaciones del usuario:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Endpoint para obtener asociaciones de un estudiante específico
app.get('/api/shared/student/:studentId', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { userId } = req.user;

    console.log('🔍 [SHARED STUDENT] Buscando asociaciones para estudiante:', studentId);
    console.log('👤 [SHARED STUDENT] Usuario solicitante:', userId);

    // Verificar que el usuario tiene permisos para ver este estudiante
    // (solo superadmin, adminaccount, coordinador pueden ver)
    const user = await User.findById(userId).populate('role');
    const userRole = user?.role?.nombre;

    console.log('🎭 [SHARED STUDENT] Rol del usuario:', userRole);

    if (!['superadmin', 'adminaccount', 'coordinador'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver las vinculaciones de estudiantes'
      });
    }

    // Buscar todas las asociaciones donde este estudiante esté vinculado
    const associations = await Shared.find({
      student: studentId,
      status: { $in: ['active', 'inactive'] } // Mostrar tanto activas como inactivas
    }).populate('user account division role createdBy');

    console.log('📊 [SHARED STUDENT] Asociaciones encontradas:', associations.length);

    res.json({
      success: true,
      data: {
        associations
      }
    });
  } catch (error) {
    console.error('Error obteniendo asociaciones del estudiante:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Crear nueva asociación (solo familyadmin)
app.post('/api/shared', authenticateToken, async (req, res) => {
  try {
    console.log('🎯 [SHARED POST] Creando nueva asociación');
    const { userId } = req.user;
    const { accountId, divisionId, studentId, roleName } = req.body;
    
    console.log('👤 [SHARED POST] Usuario:', userId);
    console.log('📝 [SHARED POST] Datos recibidos:', {
      accountId, divisionId, studentId, roleName
    });
    
    // Verificar que el usuario es familyadmin
    const user = await User.findById(userId).populate('role');
    if (user.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores familiares pueden crear asociaciones'
      });
    }
    
    // Verificar que la cuenta existe
    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Institución no encontrada'
      });
    }
    
    // Verificar que el rol existe
    const role = await Role.findOne({ nombre: roleName });
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }
    
    // Verificar que la división existe si se proporciona
    if (divisionId) {
      const division = await Grupo.findById(divisionId);
      if (!division) {
        return res.status(404).json({
          success: false,
          message: 'División no encontrada'
        });
      }
    }
    
    // Verificar que el estudiante existe si se proporciona
    if (studentId) {
      const student = await Student.findById(studentId);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Estudiante no encontrado'
        });
      }
    }
    
    // Crear la asociación
    const association = new Shared({
      user: userId,
      account: accountId,
      division: divisionId,
      student: studentId,
      role: role._id,
      status: 'active',
      createdBy: userId
    });
    
    await association.save();
    
    // Populate para la respuesta
    const populatedAssociation = await Shared.findById(association._id)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('student', 'nombre apellido')
      .populate('role', 'nombre')
      .populate('createdBy', 'name');
    
    console.log('✅ [SHARED POST] Asociación creada correctamente');
    
    res.status(201).json({
      success: true,
      data: {
        association: populatedAssociation
      },
      message: 'Asociación creada correctamente'
    });
  } catch (error) {
    console.error('Error al crear asociación:', error);
    
    // Manejar errores de validación de Mongoose
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false, 
        message: 'Error de validación',
        errors: validationErrors
      });
    }
    
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Eliminar asociación (solo familyadmin)
app.delete('/api/shared/:id', authenticateToken, async (req, res) => {
  try {
    console.log('🗑️ [SHARED DELETE] Eliminando asociación:', req.params.id);
    const { userId } = req.user;
    const { id } = req.params;
    
    // Verificar que el usuario es familyadmin
    const user = await User.findById(userId).populate('role');
    if (user.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores familiares pueden eliminar asociaciones'
      });
    }
    
    // Buscar la asociación
    const association = await Shared.findById(id);
    if (!association) {
      return res.status(404).json({
        success: false,
        message: 'Asociación no encontrada'
      });
    }
    
    // Verificar que el usuario es el propietario de la asociación
    if (association.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar esta asociación'
      });
    }
    
    // Eliminar la asociación (soft delete)
    association.status = 'inactive';
    await association.save();
    
    console.log('✅ [SHARED DELETE] Asociación eliminada correctamente');
    
    res.json({
      success: true,
      message: 'Asociación eliminada correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar asociación:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Solicitar asociación por email
app.post('/api/shared/request', authenticateToken, async (req, res) => {
  try {
    console.log('🎯 [SHARED REQUEST] Solicitando asociación por email');
    const { userId } = req.user;
    const { email } = req.body;
    
    console.log('👤 [SHARED REQUEST] Usuario solicitante:', userId);
    console.log('📧 [SHARED REQUEST] Email solicitado:', email);
    
    // Verificar que el usuario es familyadmin
    const user = await User.findById(userId).populate('role');
    if (user.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores familiares pueden solicitar asociaciones'
      });
    }
    
    // Obtener la asociación activa del usuario para usar sus datos
    const userAssociation = await Shared.findOne({
      user: userId,
      status: 'active'
    }).populate('account division student role');
    
    if (!userAssociation) {
      return res.status(404).json({
        success: false,
        message: 'No tienes una asociación activa para usar como referencia'
      });
    }
    
    // Verificar si el email ya existe en users
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    
    if (existingUser) {
      console.log('✅ [SHARED REQUEST] Usuario encontrado, creando asociación directa');
      
      // Verificar si ya existe una asociación para este usuario en la misma cuenta
      const existingShared = await Shared.findOne({
        user: existingUser._id,
        account: userAssociation.account._id,
        status: 'active'
      });
      
      if (existingShared) {
        return res.status(400).json({
          success: false,
          message: 'El usuario ya tiene una asociación activa en esta institución'
        });
      }
      
      // Crear la asociación directamente
      const newShared = new Shared({
        user: existingUser._id,
        account: userAssociation.account._id,
        division: userAssociation.division?._id,
        student: userAssociation.student?._id,
        role: userAssociation.role._id,
        status: 'active',
        createdBy: userId
      });
      
      await newShared.save();
      
      console.log('✅ [SHARED REQUEST] Asociación creada exitosamente');
      
      res.status(201).json({
        success: true,
        message: 'Asociación creada exitosamente',
        data: {
          user: {
            _id: existingUser._id,
            name: existingUser.name,
            email: existingUser.email
          },
          association: newShared
        }
      });
      
    } else {
      console.log('⏳ [SHARED REQUEST] Usuario no encontrado, guardando solicitud pendiente');
      
      // Verificar si ya existe una solicitud pendiente para este email
      const existingRequest = await RequestedShared.findOne({
        requestedEmail: email.toLowerCase(),
        status: 'pending'
      });
      
      if (existingRequest) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe una solicitud pendiente para este email'
        });
      }
      
      // Crear solicitud pendiente
      const requestedShared = new RequestedShared({
        requestedBy: userId,
        requestedEmail: email.toLowerCase(),
        account: userAssociation.account._id,
        division: userAssociation.division?._id,
        student: userAssociation.student?._id,
        role: userAssociation.role._id,
        status: 'pending'
      });
      
      await requestedShared.save();
      
      console.log('✅ [SHARED REQUEST] Solicitud pendiente guardada exitosamente');
      
      res.status(201).json({
        success: true,
        message: 'Solicitud enviada. La asociación se creará cuando el usuario se registre',
        data: {
          request: requestedShared
        }
      });
    }
    
  } catch (error) {
    console.error('Error al solicitar asociación:', error);
    
    // Manejar errores de validación de Mongoose
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false, 
        message: 'Error de validación',
        errors: validationErrors
      });
    }
    
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Middleware para rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint no encontrado'
  });
});

const PORT = config.GATEWAY_PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API Unificada de Kiki corriendo en puerto ${PORT}`);
  console.log(`📡 Health check disponible en http://localhost:${PORT}/health`);
  console.log(`📖 Documentación disponible en http://localhost:${PORT}/api`);
  console.log(`🌐 API accesible desde la red local en http://0.0.0.0:${PORT}`);
});

module.exports = app;
