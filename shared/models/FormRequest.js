const mongoose = require('mongoose');

// Schema para preguntas embebidas en FormRequest
const formQuestionSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ['texto', 'opcion_multiple', 'checkbox', 'imagen'],
    required: [true, 'El tipo de pregunta es obligatorio']
  },
  texto: {
    type: String,
    required: [true, 'El texto de la pregunta es obligatorio'],
    trim: true,
    maxlength: [500, 'El texto de la pregunta no puede exceder 500 caracteres']
  },
  requerido: {
    type: Boolean,
    default: false
  },
  opciones: {
    type: [String],
    required: function() {
      return this.tipo === 'opcion_multiple' || this.tipo === 'checkbox';
    },
    validate: {
      validator: function(opciones) {
        if (this.tipo === 'opcion_multiple' || this.tipo === 'checkbox') {
          return opciones && opciones.length > 0;
        }
        return true;
      },
      message: 'Las preguntas de opción múltiple o checkbox deben tener al menos una opción'
    }
  },
  orden: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: true });

const formRequestSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre del formulario es obligatorio'],
    trim: true,
    minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
    maxlength: [200, 'El nombre no puede exceder 200 caracteres']
  },
  descripcion: {
    type: String,
    trim: true,
    maxlength: [1000, 'La descripción no puede exceder 1000 caracteres']
  },
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: [true, 'La cuenta es obligatoria']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El usuario que crea el formulario es obligatorio']
  },
  status: {
    type: String,
    enum: ['borrador', 'publicado'],
    default: 'borrador',
    required: true
  },
  preguntas: {
    type: [formQuestionSchema],
    required: true,
    validate: {
      validator: function(preguntas) {
        return preguntas && preguntas.length > 0;
      },
      message: 'El formulario debe tener al menos una pregunta'
    }
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
formRequestSchema.index({ account: 1, status: 1 });
formRequestSchema.index({ createdBy: 1 });
formRequestSchema.index({ createdAt: -1 });

// Método estático para obtener formularios publicados de una cuenta
formRequestSchema.statics.getPublishedByAccount = function(accountId) {
  return this.find({ account: accountId, status: 'publicado' })
    .populate('account', 'nombre razonSocial')
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });
};

// Método para obtener información básica
formRequestSchema.methods.getBasicInfo = function() {
  return {
    id: this._id,
    nombre: this.nombre,
    descripcion: this.descripcion,
    account: this.account,
    status: this.status,
    preguntasCount: this.preguntas.length,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('FormRequest', formRequestSchema);

