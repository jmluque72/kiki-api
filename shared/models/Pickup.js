const mongoose = require('mongoose');

const pickupSchema = new mongoose.Schema({
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: [true, 'La cuenta es obligatoria']
  },
  division: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grupo',
    required: [true, 'La división es obligatoria']
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student'
  },
  nombre: {
    type: String,
    required: [true, 'El nombre es obligatorio'],
    trim: true,
    minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
    maxlength: [50, 'El nombre no puede exceder 50 caracteres']
  },
  apellido: {
    type: String,
    required: [true, 'El apellido es obligatorio'],
    trim: true,
    minlength: [2, 'El apellido debe tener al menos 2 caracteres'],
    maxlength: [50, 'El apellido no puede exceder 50 caracteres']
  },
  dni: {
    type: String,
    required: [true, 'El DNI es obligatorio'],
    trim: true,
    match: [/^[0-9]{7,8}$/, 'DNI inválido (debe tener 7 u 8 dígitos)']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El usuario que crea es obligatorio']
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
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
pickupSchema.index({ account: 1, division: 1, student: 1 });
pickupSchema.index({ dni: 1 });
pickupSchema.index({ status: 1 });

// Método estático para obtener personas autorizadas por cuenta
pickupSchema.statics.getByAccount = function(accountId) {
  return this.find({ account: accountId, status: 'active' })
    .populate('student', 'nombre apellido')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 });
};

// Método estático para obtener personas autorizadas por estudiante
pickupSchema.statics.getByStudent = function(studentId) {
  return this.find({ student: studentId, status: 'active' })
    .populate('account', 'nombre')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 });
};

// Método estático para obtener personas autorizadas por cuenta y división
pickupSchema.statics.getByAccountAndDivision = function(accountId, divisionId) {
  return this.find({ account: accountId, division: divisionId, status: 'active' })
    .populate('student', 'nombre apellido')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model('Pickup', pickupSchema);
