const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 } // TTL index para auto-eliminación
  },
  isRevoked: {
    type: Boolean,
    default: false,
    index: true
  },
  deviceInfo: {
    userAgent: String,
    ipAddress: String,
    deviceId: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUsedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Índices para optimizar consultas
refreshTokenSchema.index({ userId: 1, isRevoked: 1 });
refreshTokenSchema.index({ token: 1, isRevoked: 1 });
refreshTokenSchema.index({ expiresAt: 1 });

// Método para verificar si el token es válido
refreshTokenSchema.methods.isValid = function() {
  return !this.isRevoked && this.expiresAt > new Date();
};

// Método para revocar el token
refreshTokenSchema.methods.revoke = async function() {
  this.isRevoked = true;
  await this.save();
};

// Método para actualizar último uso
refreshTokenSchema.methods.updateLastUsed = async function() {
  this.lastUsedAt = new Date();
  await this.save();
};

// Método estático para limpiar tokens expirados
refreshTokenSchema.statics.cleanExpiredTokens = async function() {
  const result = await this.deleteMany({
    $or: [
      { expiresAt: { $lt: new Date() } },
      { isRevoked: true }
    ]
  });
  console.log(`🧹 [REFRESH TOKEN] Limpiados ${result.deletedCount} tokens expirados`);
  return result;
};

// Método estático para revocar todos los tokens de un usuario
refreshTokenSchema.statics.revokeAllUserTokens = async function(userId) {
  const result = await this.updateMany(
    { userId, isRevoked: false },
    { isRevoked: true }
  );
  console.log(`🔒 [REFRESH TOKEN] Revocados ${result.modifiedCount} tokens del usuario ${userId}`);
  return result;
};

// Middleware pre-save para generar token único
refreshTokenSchema.pre('save', async function(next) {
  if (this.isNew && !this.token) {
    // Generar token único usando crypto
    const crypto = require('crypto');
    this.token = crypto.randomBytes(64).toString('hex');
    console.log('🔑 [REFRESH TOKEN MODEL] Token generado:', this.token.substring(0, 16) + '...');
  }
  next();
});

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
