const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
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
    trim: true
    // Validación removida: aceptamos cualquier valor que el usuario ingrese
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

// Función helper para aplicar PEPPER a la contraseña
function applyPepper(password) {
  if (!config.PEPPER) {
    return password; // Si no hay PEPPER configurado, retornar sin modificar
  }
  // Combinar contraseña con PEPPER usando HMAC para mayor seguridad
  return crypto.createHmac('sha256', config.PEPPER).update(password).digest('hex') + password;
}

// Middleware pre-save para hashear contraseña
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    // Aplicar PEPPER si está configurado
    // - Para nuevos usuarios: siempre usar PEPPER si está configurado
    // - Para usuarios existentes: usar PEPPER si está configurado (migración automática)
    const shouldUsePepper = !!config.PEPPER;
    const passwordWithPepper = shouldUsePepper ? applyPepper(this.password) : this.password;
    
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(passwordWithPepper, salt);
    
    // Marcar que esta contraseña usa PEPPER si está configurado
    if (config.PEPPER) {
      this.passwordUsesPepper = true;
    }
    
    // Actualizar fechas de contraseña
    this.passwordChangedAt = new Date();
    this.passwordExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 días
    this.passwordExpirationWarnings = []; // Limpiar advertencias
    
    next();
  } catch (error) {
    next(error);
  }
});

// Método para comparar contraseñas (soporta contraseñas con y sin PEPPER)
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return false; // Usuario sin contraseña (ej: Cognito)
  }
  
  // Si la contraseña almacenada usa PEPPER, comparar con PEPPER
  if (this.passwordUsesPepper && config.PEPPER) {
    const passwordWithPepper = applyPepper(candidatePassword);
    const isValid = await bcrypt.compare(passwordWithPepper, this.password);
    
    // Si es válida, retornar true (y se migrará automáticamente en el login)
    return isValid;
  }
  
  // Si no usa PEPPER, intentar comparación normal (compatibilidad con contraseñas antiguas)
  const isValidWithoutPepper = await bcrypt.compare(candidatePassword, this.password);
  
  // Si es válida y tenemos PEPPER configurado, marcar para migración
  if (isValidWithoutPepper && config.PEPPER && !this.passwordUsesPepper) {
    // La migración se hará automáticamente en el login
    return true;
  }
  
  return isValidWithoutPepper;
};

// Método para migrar contraseña a PEPPER (llamado automáticamente después de login exitoso)
userSchema.methods.migratePasswordToPepper = async function(plainPassword) {
  if (!config.PEPPER || this.passwordUsesPepper) {
    return; // Ya usa PEPPER o no está configurado
  }
  
  try {
    // Aplicar PEPPER y re-hashear la contraseña
    const passwordWithPepper = applyPepper(plainPassword);
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(passwordWithPepper, salt);
    
    // Usar updateOne para evitar que el pre-save se ejecute nuevamente
    await this.constructor.updateOne(
      { _id: this._id },
      { 
        password: hashedPassword,
        passwordUsesPepper: true,
        passwordChangedAt: new Date()
      }
    );
    
    // Actualizar el objeto en memoria
    this.password = hashedPassword;
    this.passwordUsesPepper = true;
    
    console.log(`✅ [PEPPER] Contraseña migrada a PEPPER para usuario: ${this.email}`);
  } catch (error) {
    console.error(`❌ [PEPPER] Error migrando contraseña para ${this.email}:`, error);
    // No lanzar error para no interrumpir el login
  }
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