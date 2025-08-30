const mongoose = require('mongoose');

const grupoSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre es obligatorio'],
    trim: true,
    minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
    maxlength: [100, 'El nombre no puede exceder 100 caracteres']
  },
  descripcion: {
    type: String,
    trim: true,
    maxlength: [500, 'La descripción no puede exceder 500 caracteres']
  },
  cuenta: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: [true, 'La cuenta es obligatoria']
  },
  activo: {
    type: Boolean,
    default: true,
    required: [true, 'El estado activo es obligatorio']
  },
  creadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El usuario que crea es obligatorio']
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
grupoSchema.index({ cuenta: 1 });
grupoSchema.index({ activo: 1 });
grupoSchema.index({ nombre: 1 });
grupoSchema.index({ createdAt: -1 });

// Método para obtener información básica
grupoSchema.methods.getBasicInfo = function() {
  return {
    id: this._id,
    nombre: this.nombre,
    descripcion: this.descripcion,
    cuenta: this.cuenta,
    activo: this.activo,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('Grupo', grupoSchema); 