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

const app = express();

// Conectar a la base de datos
database.connect();

// Middleware de seguridad
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
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

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    database.disconnect();
  });
});

module.exports = app; 