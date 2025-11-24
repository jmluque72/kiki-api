require('dotenv').config();

// Validar variables críticas de seguridad
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET) {
    console.error('❌ [SECURITY] JWT_SECRET no está configurado en producción');
    console.error('❌ [SECURITY] Esto es un riesgo crítico de seguridad');
    process.exit(1);
  }
  
  if (process.env.JWT_SECRET.length < 32) {
    console.error('❌ [SECURITY] JWT_SECRET debe tener al menos 32 caracteres');
    process.exit(1);
  }
}

// Validar JWT_SECRET en todos los entornos (sin fallback inseguro)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ [SECURITY] JWT_SECRET no está configurado');
  console.error('❌ [SECURITY] Por favor, configura JWT_SECRET en el archivo .env');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
  // En desarrollo, usar un secreto temporal pero advertir
  console.warn('⚠️  [SECURITY] Usando secreto temporal para desarrollo. NO usar en producción.');
}

module.exports = {
  // Base de datos
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/microservices_db',
  
  // JWT - Sin fallback inseguro
  JWT_SECRET: JWT_SECRET || (process.env.NODE_ENV === 'development' ? 'dev-secret-temporary-only' : null),
  JWT_EXPIRE: process.env.JWT_EXPIRES_IN || '30d',
  
  // Puertos de los microservicios
  GATEWAY_PORT: process.env.GATEWAY_PORT || 3000,
  USERS_SERVICE_PORT: process.env.USERS_SERVICE_PORT || 3001,
  ACCOUNTS_SERVICE_PORT: process.env.ACCOUNTS_SERVICE_PORT || 3002,
  
  // URLs de los microservicios
  USERS_SERVICE_URL: process.env.USERS_SERVICE_URL || 'http://localhost:3001',
  ACCOUNTS_SERVICE_URL: process.env.ACCOUNTS_SERVICE_URL || 'http://localhost:3002',
  
  // Configuración de entorno
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Configuración de email SMTP
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: process.env.SMTP_PORT || 587,
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  
  // PEPPER para seguridad adicional de contraseñas
  PEPPER: process.env.PEPPER || ''
}; 