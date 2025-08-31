const mongoose = require('mongoose');

const passwordResetSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    length: 6
  },
  expiresAt: {
    type: Date,
    required: true
  },
  used: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Índice para búsquedas eficientes
passwordResetSchema.index({ email: 1, code: 1 });
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Método para verificar si el código es válido
passwordResetSchema.methods.isValid = function() {
  return !this.used && this.expiresAt > new Date();
};

// Método para marcar como usado
passwordResetSchema.methods.markAsUsed = function() {
  this.used = true;
  return this.save();
};

module.exports = mongoose.model('PasswordReset', passwordResetSchema);
