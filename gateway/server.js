const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');

const config = require('../config/env.config');
const { errorHandler, notFound } = require('../shared/middleware/errorHandler');

const app = express();

// Middleware de seguridad
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
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

// Health check del gateway
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API Gateway está funcionando correctamente',
    timestamp: new Date().toISOString(),
    services: {
      gateway: 'healthy',
      usersService: config.USERS_SERVICE_URL,
      accountsService: config.ACCOUNTS_SERVICE_URL
    },
    version: '1.0.0'
  });
});

// Endpoint para información de la API
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Microservices API Gateway',
    version: '1.0.0',
    endpoints: {
      users: '/api/users',
      accounts: '/api/accounts',
      groups: '/api/groups',
      roles: '/api/roles'
    },
    documentation: {
      users: {
        register: 'POST /api/users/register',
        login: 'POST /api/users/login',
        profile: 'GET /api/users/profile',
        updateProfile: 'PUT /api/users/profile',
        getAllUsers: 'GET /api/users (admin only)',
        getUserById: 'GET /api/users/:id (admin only)',
        deactivateUser: 'PUT /api/users/:id/deactivate (admin only)'
      },
      accounts: {
        create: 'POST /api/accounts',
        getAll: 'GET /api/accounts',
        getById: 'GET /api/accounts/:id',
        update: 'PUT /api/accounts/:id',
        delete: 'DELETE /api/accounts/:id',
        stats: 'GET /api/accounts/stats'
      },
      groups: {
        create: 'POST /api/groups',
        getByAccount: 'GET /api/groups/account/:accountId',
        getById: 'GET /api/groups/:id',
        update: 'PUT /api/groups/:id',
        delete: 'DELETE /api/groups/:id',
        addUser: 'POST /api/groups/:id/users',
        removeUser: 'DELETE /api/groups/:id/users',
        stats: 'GET /api/groups/account/:accountId/stats'
      },
      roles: {
        getAll: 'GET /api/roles',
        getById: 'GET /api/roles/:id',
        getByName: 'GET /api/roles/name/:nombre',
        getHierarchy: 'GET /api/roles/hierarchy',
        getByLevel: 'GET /api/roles/level/:nivel',
        checkPermissions: 'GET /api/roles/:id/permissions',
        create: 'POST /api/roles (superadmin only)',
        update: 'PUT /api/roles/:id (superadmin only)',
        delete: 'DELETE /api/roles/:id (superadmin only)',
        initialize: 'POST /api/roles/initialize (superadmin only)'
      },
      accountFields: {
        required: ['nombre', 'razonSocial', 'address', 'emailAdmin', 'passwordAdmin'],
        optional: ['logo', 'nombreAdmin']
      },
      groupFields: {
        required: ['nombre', 'account', 'creadoPor'],
        optional: ['descripcion', 'usuarios', 'permisos', 'activo']
      },
      roleFields: {
        required: ['nombre', 'descripcion', 'permisos', 'nivel'],
        optional: ['activo', 'esRolSistema'],
        availableRoles: ['superadmin', 'adminaccount', 'coordinador', 'familyadmin', 'familyviewer']
      }
    }
  });
});

// Configuración del proxy para Users Service
const usersProxy = createProxyMiddleware({
  target: config.USERS_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/users': '/api/users'
  },
  onError: (err, req, res) => {
    console.error('Proxy error (Users Service):', err);
    res.status(503).json({
      success: false,
      message: 'Users Service no disponible',
      error: 'Service temporarily unavailable'
    });
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`Proxy request to Users Service: ${req.method} ${req.url}`);
  }
});

// Configuración del proxy para Accounts Service
const accountsProxy = createProxyMiddleware({
  target: config.ACCOUNTS_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/accounts': '/api/accounts'
  },
  onError: (err, req, res) => {
    console.error('Proxy error (Accounts Service):', err);
    res.status(503).json({
      success: false,
      message: 'Accounts Service no disponible',
      error: 'Service temporarily unavailable'
    });
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`Proxy request to Accounts Service: ${req.method} ${req.url}`);
  }
});

// Configuración del proxy para Groups Service (dentro de Accounts Service)
const groupsProxy = createProxyMiddleware({
  target: config.ACCOUNTS_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/groups': '/api/groups'
  },
  onError: (err, req, res) => {
    console.error('Proxy error (Groups Service):', err);
    res.status(503).json({
      success: false,
      message: 'Groups Service no disponible',
      error: 'Service temporarily unavailable'
    });
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`Proxy request to Groups Service: ${req.method} ${req.url}`);
  }
});

// Configuración del proxy para Roles Service (dentro de Users Service)
const rolesProxy = createProxyMiddleware({
  target: config.USERS_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/roles': '/api/roles'
  },
  onError: (err, req, res) => {
    console.error('Proxy error (Roles Service):', err);
    res.status(503).json({
      success: false,
      message: 'Roles Service no disponible',
      error: 'Service temporarily unavailable'
    });
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`Proxy request to Roles Service: ${req.method} ${req.url}`);
  }
});

// Rutas del proxy
app.use('/api/users', usersProxy);
app.use('/api/accounts', accountsProxy);
app.use('/api/groups', groupsProxy);
app.use('/api/roles', rolesProxy);

// Middleware de rutas no encontradas
app.use(notFound);

// Middleware de manejo de errores
app.use(errorHandler);

const PORT = config.GATEWAY_PORT;

const server = app.listen(PORT, () => {
  console.log(`🚀 API Gateway corriendo en puerto ${PORT}`);
  console.log(`📡 Health check disponible en http://localhost:${PORT}/health`);
  console.log(`📖 Documentación disponible en http://localhost:${PORT}/api`);
  console.log(`🔄 Proxying to:`);
  console.log(`   - Users Service: ${config.USERS_SERVICE_URL}`);
  console.log(`   - Accounts Service: ${config.ACCOUNTS_SERVICE_URL}`);
});

// Manejar cierre graceful
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

module.exports = app; 