const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  // Información personal
  nombre: {
    type: String,
    required: true,
    trim: true
  },
  apellido: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: false,
    unique: true,
    sparse: true, // Permite múltiples valores null/undefined
    trim: true,
    lowercase: true
  },
  dni: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  avatar: {
    type: String,
    required: false,
    trim: true
  },
  qrCode: {
    type: String,
    required: false,
    unique: true,
    sparse: true, // Permite múltiples valores null/undefined
    trim: true
  },
  
  // Relaciones
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  division: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grupo',
    required: true
  },
  tutor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Opcional para compatibilidad con datos existentes
  },
  year: {
    type: Number,
    required: true,
    min: 2020,
    max: 2030
  },
  
  // Estado (opcional, no se usa actualmente)
  activo: {
    type: Boolean,
    default: true,
    required: false
  },
  
  // Metadatos
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Índices para optimizar consultas
studentSchema.index({ account: 1, division: 1, year: 1 });
studentSchema.index({ email: 1 });
studentSchema.index({ dni: 1 });
studentSchema.index({ qrCode: 1 });

// Middleware para actualizar updatedAt
studentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Método para obtener nombre completo
studentSchema.methods.getFullName = function() {
  return `${this.nombre} ${this.apellido}`;
};

// Método para generar código QR único
studentSchema.methods.generateQRCode = function() {
  const crypto = require('crypto');
  const data = `${this._id}-${this.dni}-${Date.now()}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
};

// Método estático para buscar por institución y división
studentSchema.statics.findByInstitutionAndDivision = function(accountId, divisionId, year = null) {
  const query = {
    account: accountId,
    division: divisionId,
    activo: true
  };
  
  if (year) {
    query.year = year;
  }
  
  return this.find(query)
    .populate('account', 'nombre razonSocial')
    .populate('division', 'nombre descripcion')
    .sort({ apellido: 1, nombre: 1 });
};

module.exports = mongoose.model('Student', studentSchema); 