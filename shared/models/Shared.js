const mongoose = require('mongoose');

const sharedSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El usuario es obligatorio']
  },
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: [true, 'La cuenta es obligatoria']
  },
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: [true, 'El rol es obligatorio']
  },
  division: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grupo',
    required: false // Opcional para compatibilidad con datos existentes
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: false // Solo para roles que necesitan asociación con alumno específico
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending'],
    default: 'pending',
    required: [true, 'El status es obligatorio']
  },
  permissions: [{
    module: {
      type: String,
      required: true
    },
    actions: [{
      type: String,
      enum: ['create', 'read', 'update', 'delete', 'admin', 'crear', 'leer', 'actualizar', 'eliminar', 'administrar']
    }]
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El usuario que crea la asociación es obligatorio']
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
sharedSchema.index({ user: 1, account: 1 });
sharedSchema.index({ account: 1, role: 1 });
sharedSchema.index({ user: 1, status: 1 });
sharedSchema.index({ account: 1, status: 1 });
sharedSchema.index({ user: 1, division: 1 });
sharedSchema.index({ user: 1, student: 1 });
sharedSchema.index({ division: 1, student: 1 });

// Método para verificar si un usuario tiene un permiso específico en una cuenta
sharedSchema.methods.hasPermission = function(module, action) {
  const permission = this.permissions.find(p => p.module === module);
  return permission && permission.actions.includes(action);
};

// Método estático para obtener todas las asociaciones de un usuario
sharedSchema.statics.getUserAssociations = function(userId) {
  return this.find({ user: userId, status: { $in: ['active', 'pending'] } })
    .populate('account')
    .populate('role')
    .populate('division')
    .populate('student')
    .populate('permissions');
};

// Método estático para obtener todos los usuarios de una cuenta
sharedSchema.statics.getAccountUsers = function(accountId) {
  return this.find({ account: accountId, status: { $in: ['active', 'pending'] } })
    .populate('user')
    .populate('role')
    .populate('division')
    .populate('student');
};

// Método estático para verificar si un usuario tiene acceso a una cuenta
sharedSchema.statics.hasUserAccess = function(userId, accountId) {
  return this.findOne({ 
    user: userId, 
    account: accountId, 
    status: 'active' 
  });
};

// Método estático para verificar si un usuario tiene una asociación pendiente con una cuenta
sharedSchema.statics.hasPendingAssociation = function(userId, accountId) {
  return this.findOne({ 
    user: userId, 
    account: accountId, 
    status: 'pending' 
  });
};

// Método estático para obtener asociaciones por rol específico
sharedSchema.statics.getAssociationsByRole = function(userId, roleName) {
  return this.find({ 
    user: userId, 
    status: { $in: ['active', 'pending'] } 
  })
  .populate('role')
  .populate('account')
  .populate('division')
  .populate('student')
  .then(associations => {
    return associations.filter(assoc => assoc.role?.nombre === roleName);
  });
};

// Método estático para verificar asociación completa (usuario + cuenta + grupo + alumno)
sharedSchema.statics.hasCompleteAssociation = function(userId, accountId, divisionId = null, studentId = null) {
  const query = {
    user: userId,
    account: accountId,
    status: 'active'
  };
  
  if (divisionId) {
    query.division = divisionId;
  }
  
  if (studentId) {
    query.student = studentId;
  }
  
  return this.findOne(query);
};

module.exports = mongoose.model('Shared', sharedSchema);
