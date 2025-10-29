const mongoose = require('mongoose');

const studentActionLogSchema = new mongoose.Schema({
  // Estudiante al que se le registra la acción
  estudiante: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  
  // Acción registrada
  accion: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentAction',
    required: true
  },
  
  // Usuario que registró la acción (profesor)
  registradoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // División/sala donde ocurrió
  division: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grupo',
    required: true
  },
  
  // Cuenta a la que pertenece
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  
  // Fecha y hora de la acción
  fechaAccion: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  // Comentarios adicionales
  comentarios: {
    type: String,
    required: false,
    trim: true,
    maxlength: 500
  },
  
  // Imágenes relacionadas (opcional)
  imagenes: [{
    type: String,
    required: false
  }],
  
  // Estado del registro
  estado: {
    type: String,
    enum: ['registrado', 'confirmado', 'rechazado'],
    default: 'registrado',
    required: true
  },
  
  // Metadatos
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
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
studentActionLogSchema.index({ estudiante: 1, fechaAccion: 1 });
studentActionLogSchema.index({ division: 1, fechaAccion: 1 });
studentActionLogSchema.index({ account: 1, fechaAccion: 1 });
studentActionLogSchema.index({ registradoPor: 1, fechaAccion: 1 });

// Middleware para actualizar updatedAt
studentActionLogSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('StudentActionLog', studentActionLogSchema);
