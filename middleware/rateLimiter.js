const rateLimit = require('express-rate-limit');
const Redis = require('redis');

// Configuración de Redis para rate limiting (opcional)
let redisClient = null;
if (process.env.REDIS_URL) {
  redisClient = Redis.createClient({
    url: process.env.REDIS_URL
  });
  redisClient.connect();
}

// Rate limiter para login
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 intentos por IP en 15 minutos
  message: {
    success: false,
    message: 'Demasiados intentos de login. Intenta nuevamente en 15 minutos.',
    retryAfter: 15 * 60 // segundos
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Usar Redis si está disponible, sino usar memoria
  store: redisClient ? undefined : undefined,
  // Función para generar clave personalizada
  keyGenerator: (req) => {
    // Usar IP + email para rate limiting más granular
    const email = req.body?.email || 'unknown';
    return `login:${req.ip}:${email}`;
  },
  // Función para saltar rate limiting en desarrollo
  skip: (req) => {
    // Saltar en desarrollo local
    if (process.env.NODE_ENV === 'development' && req.ip === '127.0.0.1') {
      return true;
    }
    return false;
  },
  // Handler personalizado para cuando se alcanza el límite
  handler: (req, res) => {
    console.log(`🚨 [RATE LIMIT] IP ${req.ip} excedió límite de login`);
    console.log(`🚨 [RATE LIMIT] User-Agent: ${req.get('User-Agent')}`);
    console.log(`🚨 [RATE LIMIT] Email intentado: ${req.body?.email || 'N/A'}`);
    
    res.status(429).json({
      success: false,
      message: 'Demasiados intentos de login. Intenta nuevamente en 15 minutos.',
      retryAfter: 15 * 60
    });
  }
});

// Rate limiter para registro
const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // máximo 3 registros por IP en 1 hora
  message: {
    success: false,
    message: 'Demasiados intentos de registro. Intenta nuevamente en 1 hora.',
    retryAfter: 60 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.log(`🚨 [RATE LIMIT] IP ${req.ip} excedió límite de registro`);
    
    res.status(429).json({
      success: false,
      message: 'Demasiados intentos de registro. Intenta nuevamente en 1 hora.',
      retryAfter: 60 * 60
    });
  }
});

// Rate limiter para cambio de contraseña
const passwordChangeRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // máximo 3 cambios de contraseña por IP en 1 hora
  message: {
    success: false,
    message: 'Demasiados intentos de cambio de contraseña. Intenta nuevamente en 1 hora.',
    retryAfter: 60 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.log(`🚨 [RATE LIMIT] IP ${req.ip} excedió límite de cambio de contraseña`);
    
    res.status(429).json({
      success: false,
      message: 'Demasiados intentos de cambio de contraseña. Intenta nuevamente en 1 hora.',
      retryAfter: 60 * 60
    });
  }
});

// Rate limiter general para API
const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: process.env.NODE_ENV === 'development' ? 1000 : 100, // Más permisivo en desarrollo
  message: {
    success: false,
    message: 'Demasiadas solicitudes. Intenta nuevamente en 15 minutos.',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.log(`🚨 [RATE LIMIT] IP ${req.ip} excedió límite general de API`);
    
    res.status(429).json({
      success: false,
      message: 'Demasiadas solicitudes. Intenta nuevamente en 15 minutos.',
      retryAfter: 15 * 60
    });
  }
});

// Rate limiter para endpoints sensibles
const sensitiveRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 10, // máximo 10 requests por IP en 5 minutos
  message: {
    success: false,
    message: 'Demasiadas solicitudes a endpoints sensibles. Intenta nuevamente en 5 minutos.',
    retryAfter: 5 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.log(`🚨 [RATE LIMIT] IP ${req.ip} excedió límite de endpoints sensibles`);
    
    res.status(429).json({
      success: false,
      message: 'Demasiadas solicitudes a endpoints sensibles. Intenta nuevamente en 5 minutos.',
      retryAfter: 5 * 60
    });
  }
});

// Función para limpiar rate limits (útil para testing)
const clearRateLimit = async (ip, email = null) => {
  if (redisClient) {
    const key = email ? `login:${ip}:${email}` : `login:${ip}:*`;
    await redisClient.del(key);
    console.log(`🧹 [RATE LIMIT] Limpiado rate limit para IP: ${ip}`);
  }
};

// Función para obtener estadísticas de rate limiting
const getRateLimitStats = async (ip) => {
  if (redisClient) {
    const keys = await redisClient.keys(`login:${ip}:*`);
    const stats = {};
    
    for (const key of keys) {
      const ttl = await redisClient.ttl(key);
      const count = await redisClient.get(key);
      stats[key] = {
        count: parseInt(count) || 0,
        ttl: ttl
      };
    }
    
    return stats;
  }
  
  return null;
};

module.exports = {
  loginRateLimit,
  registerRateLimit,
  passwordChangeRateLimit,
  generalRateLimit,
  sensitiveRateLimit,
  clearRateLimit,
  getRateLimitStats
};
