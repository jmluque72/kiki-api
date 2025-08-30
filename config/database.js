module.exports = {
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/kiki',
  GATEWAY_PORT: process.env.GATEWAY_PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'tu-secreto-jwt-super-seguro',
  NODE_ENV: process.env.NODE_ENV || 'development'
}; 