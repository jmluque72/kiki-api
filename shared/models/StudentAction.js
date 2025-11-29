const mongoose = require('mongoose');

const studentActionSchema = new mongoose.Schema({
  // Información básica de la acción
  nombre: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  descripcion: {
    type: String,
    required: false,
    trim: true,
    maxlength: 500
  },
  
  // Relación con la división/sala
  division: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grupo',
    required: true
  },
  
  // Relación con la cuenta
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  
  // Categoría de la acción
  categoria: {
    type: String,
    enum: ['comida', 'bano', 'dormir', 'salud', 'emociones', 'otros'],
    required: true,
    default: 'comida'
  },
  
  // Icono para la interfaz móvil
  icono: {
    type: String,
    required: false,
    default: '📝'
  },
  
  // Color para la interfaz
  color: {
    type: String,
    required: false,
    default: '#3B82F6'
  },
  
  // Estado de la acción
  activo: {
    type: Boolean,
    default: true,
    required: true
  },
  
  // Orden de visualización
  orden: {
    type: Number,
    default: 0,
    required: true
  },
  
  // Valores posibles que puede tomar la acción (ej: ["1 vez", "2 veces", "3 veces"] para "hizo caca")
  valores: {
    type: [String],
    required: false,
    default: null,
    validate: {
      validator: function(val) {
        // Si es null/undefined, está bien (acción sin valores)
        if (!val || val.length === 0) return true;
        // Si tiene valores, deben ser strings no vacíos
        return val.every(v => typeof v === 'string' && v.trim().length > 0);
      },
      message: 'Los valores deben ser texto no vacío'
    }
  },
  
  // Usuario que creó la acción
  creadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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
studentActionSchema.index({ division: 1, activo: 1 });
studentActionSchema.index({ account: 1, activo: 1 });
studentActionSchema.index({ categoria: 1, activo: 1 });

// Middleware para actualizar updatedAt
studentActionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('StudentAction', studentActionSchema);
