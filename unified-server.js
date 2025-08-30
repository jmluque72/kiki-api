const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Importar modelos
const User = require('./shared/models/User');
const Account = require('./shared/models/Account');
const Group = require('./shared/models/Group');
const Event = require('./shared/models/Event');
const Role = require('./shared/models/Role');

// Importar configuración
const config = require('./config/env.config');

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

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Conectar a MongoDB
mongoose.connect(config.MONGODB_URI)
  .then(() => console.log('✅ Conectado a MongoDB'))
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

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email y contraseña son requeridos'
      });
    }

    const user = await User.findOne({ email }).populate('role');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Actualizar último login
    user.lastLogin = new Date();
    await user.save();

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
          activo: user.activo,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
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
app.get('/api/users/profile', authenticateToken, async (req, res) => {
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

// ===== RUTAS DE USUARIOS =====

// Listar usuarios
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';

    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

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
          activo: user.activo,
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

// ===== RUTAS DE CUENTAS =====

// Listar cuentas
app.get('/api/accounts', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';

    const query = {};
    
    // Filtro por cuenta según el rol del usuario
    if (req.user.role.nombre === 'superadmin') {
      // Superadmin puede ver todas las cuentas
    } else if (req.user.role.nombre === 'adminaccount') {
      // Adminaccount solo puede ver sus propias cuentas
      const userAccounts = await Shared.find({ 
        user: req.user._id, 
        status: 'active' 
      }).select('account');
      
      const accountIds = userAccounts.map(ah => ah.account);
      query._id = { $in: accountIds };
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver cuentas'
      });
    }
    
    if (search) {
      query.$or = [
        { nombre: { $regex: search, $options: 'i' } },
        { razonSocial: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Account.countDocuments(query);
    const accounts = await Account.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        accounts,
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
    const {
      nombre,
      razonSocial,
      address,
      emailAdmin,
      passwordAdmin,
      nombreAdmin,
      logo
    } = req.body;

    if (!nombre || !razonSocial || !address || !emailAdmin || !passwordAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos obligatorios son requeridos'
      });
    }

    // Crear usuario administrador
    const adminRole = await Role.findOne({ nombre: 'adminaccount' });
    if (!adminRole) {
      return res.status(500).json({
        success: false,
        message: 'Error: Rol de administrador no encontrado'
      });
    }

    const adminUser = new User({
      name: nombreAdmin || `Admin ${nombre}`,
      email: emailAdmin,
      password: passwordAdmin,
      role: adminRole._id,
      status: 'approved'
    });

    await adminUser.save();

    // Crear cuenta
    const account = new Account({
      nombre,
      razonSocial,
      address,
      logo,
      usuarioAdministrador: adminUser._id
    });

    await account.save();

    res.status(201).json({
      success: true,
      message: 'Cuenta creada exitosamente',
      data: account
    });
  } catch (error) {
    console.error('Error creando cuenta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ===== RUTAS DE GRUPOS =====

// Listar grupos
app.get('/api/groups', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const accountId = req.query.accountId;

    const query = {};
    if (accountId) {
      query.account = accountId;
    }

    const total = await Group.countDocuments(query);
    const groups = await Group.find(query)
      .populate('account')
      .populate('creadoPor')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        groups,
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

// ===== RUTAS DE EVENTOS =====

// Listar eventos
app.get('/api/events', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';

    const query = {};
    
    // Filtro por cuenta según el rol del usuario
    if (req.user.role.nombre === 'superadmin') {
      // Superadmin puede ver todos los eventos
    } else if (req.user.role.nombre === 'adminaccount') {
      // Adminaccount solo puede ver eventos de sus cuentas
      const userAccounts = await Shared.find({ 
        user: req.user._id, 
        status: 'active' 
      }).select('account');
      
      const accountIds = userAccounts.map(ah => ah.account);
      query.account = { $in: accountIds };
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver eventos'
      });
    }
    
    if (search) {
      query.$or = [
        { titulo: { $regex: search, $options: 'i' } },
        { descripcion: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Event.countDocuments(query);
    const events = await Event.find(query)
      .populate('account')
      .populate('creadoPor')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ fecha: 1 });

    res.json({
      success: true,
      data: {
        events,
        total,
        page,
        limit
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
app.get('/api/roles', authenticateToken, async (req, res) => {
  try {
    const roles = await Role.find({ activo: true }).sort({ nivel: 1 });
    
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
app.get('/api/roles/hierarchy', authenticateToken, async (req, res) => {
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

const PORT = config.GATEWAY_PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API Unificada de Kiki corriendo en puerto ${PORT}`);
  console.log(`📡 Health check disponible en http://localhost:${PORT}/health`);
  console.log(`📖 Documentación disponible en http://localhost:${PORT}/api`);
  console.log(`🌐 API accesible desde la red local en http://0.0.0.0:${PORT}`);
});

module.exports = app; 