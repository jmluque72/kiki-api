const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  // Información básica del documento
  titulo: {
    type: String,
    required: true,
    trim: true
  },
  descripcion: {
    type: String,
    trim: true
  },
  
  // Tipo de documento
  tipo: {
    type: String,
    required: true,
    enum: ['terminos_condiciones', 'reglamento', 'manual', 'politica', 'otro'],
    default: 'otro'
  },
  
  // Archivo
  archivo: {
    nombre: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    key: {
      type: String,
      required: true
    },
    tamaño: {
      type: Number,
      required: true
    },
    tipoMime: {
      type: String,
      required: true
    }
  },
  
  // Relación con institución
  institucion: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  
  // Relación con quien subió el documento
  subidoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Estado del documento
  activo: {
    type: Boolean,
    default: true
  },
  
  // Fecha de vigencia (opcional)
  fechaVigencia: {
    type: Date
  },
  
  // Versión del documento
  version: {
    type: String,
    default: '1.0'
  },
  
  // Metadatos adicionales
  metadatos: {
    tags: [String],
    categoria: String,
    prioridad: {
      type: String,
      enum: ['baja', 'media', 'alta'],
      default: 'media'
    }
  }
}, {
  timestamps: true
});

// Índices para optimizar consultas
documentSchema.index({ institucion: 1, activo: 1 });
documentSchema.index({ tipo: 1, activo: 1 });
documentSchema.index({ subidoPor: 1 });

// Middleware para validar fechas
documentSchema.pre('save', function(next) {
  if (this.fechaVigencia && this.fechaVigencia < new Date()) {
    this.activo = false;
  }
  next();
});

// Método para obtener documentos activos de una institución
documentSchema.statics.getActiveByInstitution = function(institucionId) {
  return this.find({
    institucion: institucionId,
    activo: true,
    $or: [
      { fechaVigencia: { $exists: false } },
      { fechaVigencia: { $gte: new Date() } }
    ]
  }).populate('subidoPor', 'nombre email');
};

// Método para obtener documentos por tipo
documentSchema.statics.getByType = function(institucionId, tipo) {
  return this.find({
    institucion: institucionId,
    tipo: tipo,
    activo: true
  }).populate('subidoPor', 'nombre email');
};

module.exports = mongoose.model('Document', documentSchema);
