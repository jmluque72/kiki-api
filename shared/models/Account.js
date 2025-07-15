const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre es obligatorio'],
    trim: true,
    minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
    maxlength: [100, 'El nombre no puede exceder 100 caracteres']
  },
  razonSocial: {
    type: String,
    required: [true, 'La razón social es obligatoria'],
    trim: true,
    minlength: [2, 'La razón social debe tener al menos 2 caracteres'],
    maxlength: [150, 'La razón social no puede exceder 150 caracteres']
  },
  address: {
    type: String,
    required: [true, 'La dirección es obligatoria'],
    trim: true,
    maxlength: [200, 'La dirección no puede exceder 200 caracteres']
  },
  logo: {
    type: String,
    trim: true,
    default: null,
    maxlength: [500, 'La URL del logo no puede exceder 500 caracteres']
  },
  emailAdmin: {
    type: String,
    required: [true, 'El email del administrador es obligatorio'],
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email del administrador inválido']
  },
  passwordAdmin: {
    type: String,
    required: [true, 'La contraseña del administrador es obligatoria'],
    minlength: [6, 'La contraseña debe tener al menos 6 caracteres'],
    select: false // No incluir en consultas por defecto
  },
  usuarioAdministrador: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Se creará automáticamente
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
accountSchema.index({ nombre: 1 });
accountSchema.index({ razonSocial: 1 });
accountSchema.index({ usuarioAdministrador: 1 });
accountSchema.index({ createdAt: -1 });

// Método para obtener información básica
accountSchema.methods.getBasicInfo = function() {
  return {
    id: this._id,
    nombre: this.nombre,
    razonSocial: this.razonSocial,
    address: this.address,
    logo: this.logo,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('Account', accountSchema); 