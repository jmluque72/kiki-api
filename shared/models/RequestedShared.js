const mongoose = require('mongoose');

const requestedSharedSchema = new mongoose.Schema({
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El usuario que solicita es obligatorio']
  },
  requestedEmail: {
    type: String,
    required: [true, 'El email solicitado es obligatorio'],
    trim: true,
    lowercase: true
  },
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: [true, 'La cuenta es obligatoria']
  },
  division: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grupo'
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student'
  },
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: [true, 'El rol es obligatorio']
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'pending'
  },
  completedAt: {
    type: Date
  },
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Índices para optimizar consultas
requestedSharedSchema.index({ requestedEmail: 1, status: 1 });
requestedSharedSchema.index({ requestedBy: 1 });
requestedSharedSchema.index({ account: 1 });

// Método estático para buscar solicitudes pendientes por email
requestedSharedSchema.statics.findPendingByEmail = function(email) {
  return this.find({ 
    requestedEmail: email.toLowerCase(), 
    status: 'pending' 
  }).populate('account division student role requestedBy');
};

// Método estático para marcar solicitudes como completadas
requestedSharedSchema.statics.markAsCompleted = function(requestId, completedByUserId) {
  return this.findByIdAndUpdate(requestId, {
    status: 'completed',
    completedAt: new Date(),
    completedBy: completedByUserId
  });
};

module.exports = mongoose.model('RequestedShared', requestedSharedSchema);
