/**
 * Logger seguro que no expone información sensible
 * En producción, solo loguea errores y warnings
 * En desarrollo, loguea todo pero sin información sensible
 */

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

// Campos sensibles que nunca deben loguearse
const SENSITIVE_FIELDS = [
  'password',
  'jwt_secret',
  'jwtSecret',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'apikey',
  'authorization',
  'cookie',
  'session'
];

/**
 * Sanitiza un objeto removiendo campos sensibles
 */
const sanitizeData = (data) => {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    
    // Si el campo es sensible, reemplazarlo con [REDACTED]
    if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeData(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

/**
 * Logger con niveles y sanitización automática
 */
const logger = {
  error: (message, ...args) => {
    const sanitizedArgs = args.map(arg => sanitizeData(arg));
    console.error(`[ERROR] ${message}`, ...sanitizedArgs);
  },
  
  warn: (message, ...args) => {
    if (isProduction) {
      const sanitizedArgs = args.map(arg => sanitizeData(arg));
      console.warn(`[WARN] ${message}`, ...sanitizedArgs);
    }
  },
  
  info: (message, ...args) => {
    if (!isProduction) {
      const sanitizedArgs = args.map(arg => sanitizeData(arg));
      console.log(`[INFO] ${message}`, ...sanitizedArgs);
    }
  },
  
  debug: (message, ...args) => {
    if (isDevelopment) {
      const sanitizedArgs = args.map(arg => sanitizeData(arg));
      console.log(`[DEBUG] ${message}`, ...sanitizedArgs);
    }
  },
  
  // Método para loguear sin sanitización (usar con cuidado)
  raw: (message, ...args) => {
    if (!isProduction) {
      console.log(message, ...args);
    }
  }
};

module.exports = logger;

