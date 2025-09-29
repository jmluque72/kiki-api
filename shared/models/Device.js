const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  pushToken: {
    type: String,
    required: true,
    unique: true
  },
  platform: {
    type: String,
    enum: ['ios', 'android'],
    required: true
  },
  deviceId: {
    type: String,
    required: false // ID único del dispositivo
  },
  appVersion: {
    type: String,
    required: false
  },
  osVersion: {
    type: String,
    required: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastUsed: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Índices para optimizar consultas
deviceSchema.index({ userId: 1 });
deviceSchema.index({ pushToken: 1 });
deviceSchema.index({ platform: 1 });
deviceSchema.index({ isActive: 1 });

// Método estático para obtener dispositivos activos de un usuario
deviceSchema.statics.getActiveDevicesForUser = function(userId) {
  return this.find({
    userId: userId,
    isActive: true
  });
};

// Método estático para obtener dispositivos activos de múltiples usuarios
deviceSchema.statics.getActiveDevicesForUsers = function(userIds) {
  return this.find({
    userId: { $in: userIds },
    isActive: true
  });
};

// Método para desactivar dispositivo
deviceSchema.methods.deactivate = function() {
  this.isActive = false;
  this.lastUsed = new Date();
  return this.save();
};

// Método para actualizar último uso
deviceSchema.methods.updateLastUsed = function() {
  this.lastUsed = new Date();
  return this.save();
};

module.exports = mongoose.model('Device', deviceSchema);
