const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../config/env.config');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'El nombre es obligatorio'],
    trim: true,
    minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
    maxlength: [50, 'El nombre no puede exceder 50 caracteres']
  },
  email: {
    type: String,
    required: [true, 'El email es obligatorio'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email inválido']
  },
  dni: {
    type: String,
    required: false,
    unique: true,
    sparse: true, // Permite múltiples valores null/undefined
    trim: true
  },
        password: {
          type: String,
          required: [true, 'La contraseña es obligatoria'],
          minlength: [6, 'La contraseña debe tener al menos 6 caracteres']
        },
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: [true, 'El rol es obligatorio']
  },
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: false // No todos los usuarios tienen cuenta (ej: superadmin)
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    required: [true, 'El status es obligatorio']
  },
  lastLogin: {
    type: Date
  },
  isFirstLogin: {
    type: Boolean,
    default: true
  },
  // Campos adicionales para registro mobile
  telefono: {
    type: String,
    trim: true,
    match: [/^[\+]?[0-9\s\-\(\)]{7,15}$/, 'Número de teléfono inválido']
  },
  direccion: {
    type: String,
    trim: true,
    maxlength: [200, 'La dirección no puede exceder 200 caracteres']
  },
  fechaNacimiento: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || v <= new Date();
      },
      message: 'La fecha de nacimiento no puede ser futura'
    }
  },
  genero: {
    type: String,
    enum: ['masculino', 'femenino', 'otro', 'prefiero_no_decir'],
    trim: true
  },
  avatar: {
    type: String,
    trim: true
  },
  // Campos para 2FA
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: {
    type: String,
    select: false // No incluir en consultas por defecto
  },
  twoFactorBackupCodes: [{
    type: String,
    select: false
  }],
  // Campos para expiración de contraseñas
  passwordChangedAt: {
    type: Date,
    default: Date.now
  },
  passwordExpiresAt: {
    type: Date,
    default: function() {
      // Por defecto, 90 días desde ahora
      return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    }
  },
  passwordExpirationWarnings: [{
    type: Date,
    default: []
  }]
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.__v;
      return ret;
    }
  }
});

// Middleware pre-save para hashear contraseña
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    
    // Actualizar fechas de contraseña
    this.passwordChangedAt = new Date();
    this.passwordExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 días
    this.passwordExpirationWarnings = []; // Limpiar advertencias
    
    next();
  } catch (error) {
    next(error);
  }
});

// Método para comparar contraseñas
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Método para generar JWT
userSchema.methods.generateToken = function() {
  return jwt.sign(
    { 
      userId: this._id,
      email: this.email,
      role: this.role
    },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRE }
  );
};

// Método para obtener información del rol
userSchema.methods.getRoleInfo = async function() {
  await this.populate('role');
  return this.role;
};

// Método para verificar si tiene un permiso específico
userSchema.methods.hasPermission = async function(modulo, accion) {
  await this.populate('role');
  return this.role && this.role.tienePermiso(modulo, accion);
};

// Método para verificar si es administrador
userSchema.methods.isAdmin = async function() {
  await this.populate('role');
  return this.role && this.role.esAdministrador();
};

// Método para actualizar último login
userSchema.methods.updateLastLogin = async function() {
  this.lastLogin = new Date();
  await this.save();
};

// Método para verificar si la contraseña ha expirado
userSchema.methods.isPasswordExpired = function() {
  return new Date() > this.passwordExpiresAt;
};

// Método para verificar si la contraseña está próxima a expirar
userSchema.methods.isPasswordExpiringSoon = function(daysThreshold = 7) {
  const thresholdDate = new Date(Date.now() + daysThreshold * 24 * 60 * 60 * 1000);
  return this.passwordExpiresAt <= thresholdDate;
};

// Método para obtener días hasta la expiración
userSchema.methods.getDaysUntilPasswordExpiration = function() {
  const now = new Date();
  const diffTime = this.passwordExpiresAt - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
};

// Método para extender la expiración de contraseña
userSchema.methods.extendPasswordExpiration = async function(days = 90) {
  this.passwordExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  this.passwordExpirationWarnings = []; // Limpiar advertencias
  await this.save();
};

// Método para marcar advertencia de expiración
userSchema.methods.markPasswordExpirationWarning = async function() {
  const now = new Date();
  const warningExists = this.passwordExpirationWarnings.some(warning => 
    Math.abs(warning - now) < 24 * 60 * 60 * 1000 // 24 horas
  );
  
  if (!warningExists) {
    this.passwordExpirationWarnings.push(now);
    await this.save();
  }
};

// Índices para optimizar consultas (email ya tiene índice único automático)
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ account: 1 });
userSchema.index({ dni: 1 });
userSchema.index({ createdAt: -1 });

module.exports = mongoose.model('User', userSchema); 