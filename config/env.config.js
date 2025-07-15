require('dotenv').config();

module.exports = {
  // Base de datos
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/microservices_db',
  
  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key-here-change-this-in-production',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
  
  // Puertos de los microservicios
  GATEWAY_PORT: process.env.GATEWAY_PORT || 3000,
  USERS_SERVICE_PORT: process.env.USERS_SERVICE_PORT || 3001,
  ACCOUNTS_SERVICE_PORT: process.env.ACCOUNTS_SERVICE_PORT || 3002,
  
  // URLs de los microservicios
  USERS_SERVICE_URL: process.env.USERS_SERVICE_URL || 'http://localhost:3001',
  ACCOUNTS_SERVICE_URL: process.env.ACCOUNTS_SERVICE_URL || 'http://localhost:3002',
  
  // Configuración de entorno
  NODE_ENV: process.env.NODE_ENV || 'development'
}; 