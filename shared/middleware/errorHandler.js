const config = require('../../config/env.config');

// Middleware para manejar errores
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log del error
  console.error('Error:', err);

  // Error de validación de Mongoose
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = {
      message,
      statusCode: 400
    };
  }

  // Error de clave duplicada de Mongoose
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `Ya existe un registro con este ${field}`;
    error = {
      message,
      statusCode: 400
    };
  }

  // Error de ObjectId inválido de Mongoose
  if (err.name === 'CastError') {
    const message = 'Recurso no encontrado';
    error = {
      message,
      statusCode: 404
    };
  }

  // Error de JWT
  if (err.name === 'JsonWebTokenError') {
    const message = 'Token inválido';
    error = {
      message,
      statusCode: 401
    };
  }

  // Error de token expirado
  if (err.name === 'TokenExpiredError') {
    const message = 'Token expirado';
    error = {
      message,
      statusCode: 401
    };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Error interno del servidor',
    ...(config.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// Middleware para manejar rutas no encontradas
const notFound = (req, res, next) => {
  // Ignorar rutas que sabemos que no pertenecen al proyecto
  const ignoredPaths = ['/mcp', '/favicon.ico', '/robots.txt'];
  
  if (ignoredPaths.includes(req.originalUrl)) {
    return res.status(404).json({
      success: false,
      message: 'Ruta no encontrada'
    });
  }
  
  const error = new Error(`Ruta no encontrada - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// Clase para errores personalizados
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Función para crear un error async que capture excepciones
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  notFound,
  AppError,
  asyncHandler
}; 