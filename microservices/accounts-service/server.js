const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Importar configuración
const config = require('../../config/env.config');

// Importar modelos
const User = require('../../shared/models/User');
const Account = require('../../shared/models/Account');
const Group = require('../../shared/models/Group');
const Role = require('../../shared/models/Role');
const Shared = require('../../shared/models/Shared');
const ActiveAssociation = require('../../shared/models/ActiveAssociation');

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
  .then(() => console.log('✅ Accounts Service conectado a MongoDB'))
  .catch(err => console.error('❌ Error conectando Accounts Service a MongoDB:', err));

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
    message: 'Accounts Service está funcionando correctamente',
    timestamp: new Date().toISOString(),
    service: 'accounts-service',
    version: '1.0.0'
  });
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

    // Verificar permisos (solo superadmin puede crear cuentas)
    if (req.user.role.nombre !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear cuentas'
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

    // Crear asociación entre el admin y la cuenta
    const shared = new Shared({
      user: adminUser._id,
      account: account._id,
      role: adminRole._id,
      status: 'active',
      createdBy: req.user._id
    });

    await shared.save();

    res.status(201).json({
      success: true,
      message: 'Cuenta creada exitosamente',
      data: {
        account,
        adminUser: {
          _id: adminUser._id,
          email: adminUser.email,
          nombre: adminUser.name
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
app.get('/api/accounts/:id', authenticateToken, async (req, res) => {
  try {
    const account = await Account.findById(req.params.id);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada'
      });
    }

    // Verificar permisos
    if (req.user.role.nombre !== 'superadmin') {
      const userAccounts = await Shared.find({ 
        user: req.user._id, 
        account: req.params.id,
        status: 'active' 
      });
      
      if (userAccounts.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para ver esta cuenta'
        });
      }
    }

    res.json({
      success: true,
      data: account
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
    const { nombre, razonSocial, address, logo } = req.body;
    
    const account = await Account.findById(req.params.id);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada'
      });
    }

    // Verificar permisos
    if (req.user.role.nombre !== 'superadmin') {
      const userAccounts = await Shared.find({ 
        user: req.user._id, 
        account: req.params.id,
        status: 'active' 
      });
      
      if (userAccounts.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para actualizar esta cuenta'
        });
      }
    }

    // Actualizar campos
    if (nombre) account.nombre = nombre;
    if (razonSocial) account.razonSocial = razonSocial;
    if (address) account.address = address;
    if (logo !== undefined) account.logo = logo;

    await account.save();

    res.json({
      success: true,
      message: 'Cuenta actualizada exitosamente',
      data: account
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
    // Solo superadmin puede eliminar cuentas
    if (req.user.role.nombre !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar cuentas'
      });
    }

    const account = await Account.findById(req.params.id);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada'
      });
    }

    // Verificar si tiene grupos asociados
    const groupsCount = await Group.countDocuments({ account: req.params.id });
    if (groupsCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar la cuenta porque tiene grupos asociados'
      });
    }

    await Account.findByIdAndDelete(req.params.id);

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
app.get('/api/accounts/stats', authenticateToken, async (req, res) => {
  try {
    // Solo superadmin puede ver estadísticas
    if (req.user.role.nombre !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver estadísticas'
      });
    }

    const totalAccounts = await Account.countDocuments();
    const activeAccounts = await Account.countDocuments({ activo: true });
    const totalGroups = await Group.countDocuments();
    const totalUsers = await User.countDocuments();

    res.json({
      success: true,
      data: {
        totalAccounts,
        activeAccounts,
        totalGroups,
        totalUsers
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

    // Filtro por permisos
    if (req.user.role.nombre !== 'superadmin') {
      const userAccounts = await Shared.find({ 
        user: req.user._id, 
        status: 'active' 
      }).select('account');
      
      const accountIds = userAccounts.map(ah => ah.account);
      query.account = { $in: accountIds };
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

const PORT = config.ACCOUNTS_SERVICE_PORT || 3003;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🏢 Accounts Service corriendo en puerto ${PORT}`);
  console.log(`📡 Health check disponible en http://localhost:${PORT}/health`);
  console.log(`🌐 API accesible desde la red local en http://0.0.0.0:${PORT}`);
});

module.exports = app;
