const mongoose = require('mongoose');

const tutorActionSchema = new mongoose.Schema({
  // Tipo de acción (llega_tarde, solicita_reunion, etc.)
  actionType: {
    type: String,
    required: [true, 'El tipo de acción es obligatorio'],
    trim: true
  },
  
  // Título de la acción (para mostrar en notificaciones)
  actionTitle: {
    type: String,
    required: [true, 'El título de la acción es obligatorio'],
    trim: true
  },
  
  // Comentario del tutor
  comment: {
    type: String,
    required: [true, 'El comentario es obligatorio'],
    trim: true,
    maxlength: [500, 'El comentario no puede exceder 500 caracteres']
  },
  
  // Estudiante relacionado
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'El estudiante es obligatorio']
  },
  
  // División/sala del estudiante
  division: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grupo',
    required: [true, 'La división es obligatoria']
  },
  
  // Cuenta a la que pertenece
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: [true, 'La cuenta es obligatoria']
  },
  
  // Tutor que creó la acción
  tutor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El tutor es obligatorio']
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
tutorActionSchema.index({ student: 1, createdAt: -1 });
tutorActionSchema.index({ division: 1, createdAt: -1 });
tutorActionSchema.index({ tutor: 1, createdAt: -1 });
tutorActionSchema.index({ account: 1, createdAt: -1 });

module.exports = mongoose.model('TutorAction', tutorActionSchema);

