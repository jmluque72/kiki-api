const mongoose = require('mongoose');

const emailUnsubscribeSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true,
  },
  unsubscribedAt: {
    type: Date,
    default: Date.now
  },
  reason: {
    type: String,
    enum: ['user_request', 'spam_complaint', 'bounce', 'other'],
    default: 'user_request'
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  }
});

// email ya tiene índice único vía unique: true
emailUnsubscribeSchema.index({ unsubscribedAt: -1 });

// Método estático para verificar si un email está desuscrito
emailUnsubscribeSchema.statics.isUnsubscribed = async function(email) {
  if (!email) return false;
  const normalizedEmail = email.toLowerCase().trim();
  const unsubscribe = await this.findOne({ email: normalizedEmail });
  return !!unsubscribe;
};

// Método estático para desuscribir un email
emailUnsubscribeSchema.statics.unsubscribe = async function(email, reason = 'user_request', metadata = {}) {
  const normalizedEmail = email.toLowerCase().trim();
  
  // Verificar si ya está desuscrito
  const existing = await this.findOne({ email: normalizedEmail });
  if (existing) {
    return existing;
  }
  
  // Crear nuevo registro de desuscripción
  return await this.create({
    email: normalizedEmail,
    reason: reason,
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent
  });
};

module.exports = mongoose.model('EmailUnsubscribe', emailUnsubscribeSchema);

