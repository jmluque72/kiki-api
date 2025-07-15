const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('../../config/env.config');
const database = require('../../database/connection');
const { errorHandler, notFound } = require('../../shared/middleware/errorHandler');
const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roleRoutes');

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
    message: 'Users Service está funcionando correctamente',
    timestamp: new Date().toISOString(),
    service: 'users-service',
    version: '1.0.0'
  });
});

// Routes
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);

// Middleware de rutas no encontradas
app.use(notFound);

// Middleware de manejo de errores
app.use(errorHandler);

const PORT = config.USERS_SERVICE_PORT;

const server = app.listen(PORT, () => {
  console.log(`🚀 Users Service corriendo en puerto ${PORT}`);
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