const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('../../config/env.config');
const database = require('../../database/connection');
const { errorHandler, notFound } = require('../../shared/middleware/errorHandler');
const { createFileServer } = require('../../shared/middleware/fileServer');
const accountRoutes = require('./routes/accountRoutes');
const groupRoutes = require('./routes/groupRoutes');
const eventRoutes = require('./routes/eventRoutes');

const app = express();

// Conectar a la base de datos
database.connect();

// Middleware de seguridad
app.use(helmet());

// CORS
app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin (como apps móviles)
    if (!origin) return callback(null, true);
    
    // Permitir localhost, IPs locales y dominios de producción
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
  max: 100 // límite de 100 requests por IP por ventana de tiempo
});
app.use(limiter);

// Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined'));

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

// Routes
app.use('/api/accounts', accountRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/events', eventRoutes);

// File server para servir imágenes y archivos
app.use('/api/files', createFileServer());

// Middleware de rutas no encontradas
app.use(notFound);

// Middleware de manejo de errores
app.use(errorHandler);

const PORT = config.ACCOUNTS_SERVICE_PORT;

const server = app.listen(PORT, () => {
  console.log(`🚀 Accounts Service corriendo en puerto ${PORT}`);
  console.log(`📡 Health check disponible en http://localhost:${PORT}/health`);
});

// Manejar cierre graceful
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    database.disconnect();
  });
});

module.exports = app; 