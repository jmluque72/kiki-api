const mongoose = require('mongoose');

const eventAuthorizationSchema = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  familyadmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  autorizado: {
    type: Boolean,
    default: false
  },
  fechaAutorizacion: {
    type: Date
  },
  comentarios: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Índice único para evitar duplicados
eventAuthorizationSchema.index({ event: 1, student: 1 }, { unique: true });

// Middleware para actualizar updatedAt
eventAuthorizationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  if (this.autorizado && !this.fechaAutorizacion) {
    this.fechaAutorizacion = new Date();
  }
  next();
});

module.exports = mongoose.model('EventAuthorization', eventAuthorizationSchema);
