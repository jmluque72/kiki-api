const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');

// Importar configuración
const config = require('../../config/env.config');

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

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API Gateway está funcionando correctamente',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      auth: `http://localhost:${config.AUTH_SERVICE_PORT || 3004}`,
      users: `http://localhost:${config.USERS_SERVICE_PORT || 3002}`,
      accounts: `http://localhost:${config.ACCOUNTS_SERVICE_PORT || 3003}`,
      events: `http://localhost:${config.EVENTS_SERVICE_PORT || 3005}`,
      groups: `http://localhost:${config.GROUPS_SERVICE_PORT || 3005}`,
      activities: `http://localhost:${config.ACTIVITIES_SERVICE_PORT || 3006}`,
      notifications: `http://localhost:${config.NOTIFICATIONS_SERVICE_PORT || 3007}`,
      files: `http://localhost:${config.FILES_SERVICE_PORT || 3008}`
    }
  });
});

// Documentación de la API
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Microservices API Gateway',
    version: '1.0.0',
    endpoints: {
      auth: {
        login: 'POST /api/auth/login',
        register: 'POST /api/auth/register',
        profile: 'GET /api/auth/profile',
        forgotPassword: 'POST /api/auth/forgot-password',
        resetPassword: 'POST /api/auth/reset-password'
      },
      users: {
        list: 'GET /api/users',
        getById: 'GET /api/users/:id',
        update: 'PUT /api/users/:id',
        updateStatus: 'PUT /api/users/:id/status',
        activeAssociation: 'GET /api/users/active-association'
      },
      roles: {
        list: 'GET /api/roles',
        getById: 'GET /api/roles/:id',
        hierarchy: 'GET /api/roles/hierarchy'
      },
      accounts: {
        list: 'GET /api/accounts',
        create: 'POST /api/accounts',
        getById: 'GET /api/accounts/:id',
        update: 'PUT /api/accounts/:id',
        delete: 'DELETE /api/accounts/:id',
        stats: 'GET /api/accounts/stats'
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
      groups: {
        list: 'GET /api/groups',
        create: 'POST /api/groups',
        getById: 'GET /api/groups/:id',
        update: 'PUT /api/groups/:id',
        delete: 'DELETE /api/groups/:id',
        addUser: 'POST /api/groups/:id/users',
        removeUser: 'DELETE /api/groups/:id/users/:userId'
      },
      activities: {
        list: 'GET /api/activities',
        create: 'POST /api/activities',
        getById: 'GET /api/activities/:id',
        update: 'PUT /api/activities/:id',
        delete: 'DELETE /api/activities/:id',
        favorites: 'GET /api/activities/favorites',
        addFavorite: 'POST /api/activities/:id/favorite',
        removeFavorite: 'DELETE /api/activities/:id/favorite'
      },
      notifications: {
        list: 'GET /api/notifications',
        create: 'POST /api/notifications',
        getById: 'GET /api/notifications/:id',
        update: 'PUT /api/notifications/:id',
        delete: 'DELETE /api/notifications/:id',
        send: 'POST /api/notifications/send'
      },
      files: {
        upload: 'POST /api/files/upload',
        getSignedUrl: 'GET /api/files/signed-url',
        delete: 'DELETE /api/files/:id'
      }
    },
    services: {
      auth: 'Authentication and user management',
      users: 'User CRUD and role management',
      accounts: 'Institution and account management',
      events: 'Event management and scheduling',
      groups: 'Group and division management',
      activities: 'Activity and assignment management',
      notifications: 'Push and email notifications',
      files: 'File upload and management'
    }
  });
});

// ===== PROXY CONFIGURATION =====

// Auth Service Proxy
app.use('/api/auth', createProxyMiddleware({
  target: `http://localhost:${config.AUTH_SERVICE_PORT || 3004}`,
  changeOrigin: true,
  pathRewrite: {
    '^/api/auth': '/api/auth'
  },
  onError: (err, req, res) => {
    console.error('Auth Service Error:', err);
    res.status(503).json({
      success: false,
      message: 'Auth Service no disponible'
    });
  }
}));

// Users Service Proxy
app.use('/api/users', createProxyMiddleware({
  target: `http://localhost:${config.USERS_SERVICE_PORT || 3002}`,
  changeOrigin: true,
  pathRewrite: {
    '^/api/users': '/api/users'
  },
  onError: (err, req, res) => {
    console.error('Users Service Error:', err);
    res.status(503).json({
      success: false,
      message: 'Users Service no disponible'
    });
  }
}));

// Roles Service Proxy (parte de Users Service)
app.use('/api/roles', createProxyMiddleware({
  target: `http://localhost:${config.USERS_SERVICE_PORT || 3002}`,
  changeOrigin: true,
  pathRewrite: {
    '^/api/roles': '/api/roles'
  },
  onError: (err, req, res) => {
    console.error('Roles Service Error:', err);
    res.status(503).json({
      success: false,
      message: 'Roles Service no disponible'
    });
  }
}));

// Accounts Service Proxy
app.use('/api/accounts', createProxyMiddleware({
  target: `http://localhost:${config.ACCOUNTS_SERVICE_PORT || 3003}`,
  changeOrigin: true,
  pathRewrite: {
    '^/api/accounts': '/api/accounts'
  },
  onError: (err, req, res) => {
    console.error('Accounts Service Error:', err);
    res.status(503).json({
      success: false,
      message: 'Accounts Service no disponible'
    });
  }
}));

// Events Service Proxy
app.use('/api/events', createProxyMiddleware({
  target: `http://localhost:${config.EVENTS_SERVICE_PORT || 3005}`,
  changeOrigin: true,
  pathRewrite: {
    '^/api/events': '/api/events'
  },
  onError: (err, req, res) => {
    console.error('Events Service Error:', err);
    res.status(503).json({
      success: false,
      message: 'Events Service no disponible'
    });
  }
}));

// Groups Service Proxy (parte de Accounts Service)
app.use('/api/groups', createProxyMiddleware({
  target: `http://localhost:${config.ACCOUNTS_SERVICE_PORT || 3003}`,
  changeOrigin: true,
  pathRewrite: {
    '^/api/groups': '/api/groups'
  },
  onError: (err, req, res) => {
    console.error('Groups Service Error:', err);
    res.status(503).json({
      success: false,
      message: 'Groups Service no disponible'
    });
  }
}));

// Events Service Proxy
app.use('/api/events', createProxyMiddleware({
  target: `http://localhost:${config.EVENTS_SERVICE_PORT || 3004}`,
  changeOrigin: true,
  pathRewrite: {
    '^/api/events': '/api/events'
  },
  onError: (err, req, res) => {
    console.error('Events Service Error:', err);
    res.status(503).json({
      success: false,
      message: 'Events Service no disponible'
    });
  }
}));

// Groups Service Proxy
app.use('/api/groups', createProxyMiddleware({
  target: `http://localhost:${config.GROUPS_SERVICE_PORT || 3005}`,
  changeOrigin: true,
  pathRewrite: {
    '^/api/groups': '/api/groups'
  },
  onError: (err, req, res) => {
    console.error('Groups Service Error:', err);
    res.status(503).json({
      success: false,
      message: 'Groups Service no disponible'
    });
  }
}));

// Activities Service Proxy
app.use('/api/activities', createProxyMiddleware({
  target: `http://localhost:${config.ACTIVITIES_SERVICE_PORT || 3006}`,
  changeOrigin: true,
  pathRewrite: {
    '^/api/activities': '/api/activities'
  },
  onError: (err, req, res) => {
    console.error('Activities Service Error:', err);
    res.status(503).json({
      success: false,
      message: 'Activities Service no disponible'
    });
  }
}));

// Notifications Service Proxy
app.use('/api/notifications', createProxyMiddleware({
  target: `http://localhost:${config.NOTIFICATIONS_SERVICE_PORT || 3007}`,
  changeOrigin: true,
  pathRewrite: {
    '^/api/notifications': '/api/notifications'
  },
  onError: (err, req, res) => {
    console.error('Notifications Service Error:', err);
    res.status(503).json({
      success: false,
      message: 'Notifications Service no disponible'
    });
  }
}));

// Files Service Proxy
app.use('/api/files', createProxyMiddleware({
  target: `http://localhost:${config.FILES_SERVICE_PORT || 3008}`,
  changeOrigin: true,
  pathRewrite: {
    '^/api/files': '/api/files'
  },
  onError: (err, req, res) => {
    console.error('Files Service Error:', err);
    res.status(503).json({
      success: false,
      message: 'Files Service no disponible'
    });
  }
}));

// Middleware de manejo de errores
app.use((err, req, res, next) => {
  console.error('Gateway Error:', err);
  res.status(500).json({
    success: false,
    message: 'Error interno del gateway'
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
  console.log(`🌐 API Gateway corriendo en puerto ${PORT}`);
  console.log(`📡 Health check disponible en http://localhost:${PORT}/health`);
  console.log(`📖 Documentación disponible en http://localhost:${PORT}/api`);
  console.log(`🌐 API accesible desde la red local en http://0.0.0.0:${PORT}`);
  console.log('\n🔗 Servicios disponibles:');
  console.log(`   🔐 Auth Service: http://localhost:${config.AUTH_SERVICE_PORT || 3001}`);
  console.log(`   👥 Users Service: http://localhost:${config.USERS_SERVICE_PORT || 3002}`);
  console.log(`   🏢 Accounts Service: http://localhost:${config.ACCOUNTS_SERVICE_PORT || 3003}`);
  console.log(`   📅 Events Service: http://localhost:${config.EVENTS_SERVICE_PORT || 3004}`);
  console.log(`   👨‍👩‍👧‍👦 Groups Service: http://localhost:${config.GROUPS_SERVICE_PORT || 3005}`);
  console.log(`   📚 Activities Service: http://localhost:${config.ACTIVITIES_SERVICE_PORT || 3006}`);
  console.log(`   🔔 Notifications Service: http://localhost:${config.NOTIFICATIONS_SERVICE_PORT || 3007}`);
  console.log(`   📁 Files Service: http://localhost:${config.FILES_SERVICE_PORT || 3008}`);
});

module.exports = app;
