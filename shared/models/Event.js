const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  titulo: {
    type: String,
    required: true,
    trim: true
  },
  descripcion: {
    type: String,
    required: true,
    trim: true
  },
  fecha: {
    type: Date,
    required: true
  },
  hora: {
    type: String,
    required: true
  },
  lugar: {
    type: String,
    trim: true
  },
  estado: {
    type: String,
    enum: ['activo', 'finalizado', 'cancelado'],
    default: 'activo'
  },
  requiereAutorizacion: {
    type: Boolean,
    default: false
  },
  creador: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  institucion: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  division: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  },
  participantes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Middleware para actualizar updatedAt
eventSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Event', eventSchema); 