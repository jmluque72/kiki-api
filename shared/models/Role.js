const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre del rol es obligatorio'],
    unique: true,
    trim: true,
    enum: {
      values: ['superadmin', 'adminaccount', 'coordinador', 'familyadmin', 'familyviewer'],
      message: 'El rol debe ser uno de los valores permitidos'
    }
  },
  descripcion: {
    type: String,
    required: [true, 'La descripción del rol es obligatoria'],
    trim: true,
    maxlength: [500, 'La descripción no puede exceder 500 caracteres']
  },
  permisos: [{
    modulo: {
      type: String,
      required: true,
      enum: ['usuarios', 'cuentas', 'grupos', 'roles', 'reportes', 'configuracion', 'familias']
    },
    acciones: [{
      type: String,
      enum: ['crear', 'leer', 'actualizar', 'eliminar', 'administrar', 'ver']
    }]
  }],
  nivel: {
    type: Number,
    required: [true, 'El nivel del rol es obligatorio'],
    min: [1, 'El nivel mínimo es 1'],
    max: [5, 'El nivel máximo es 5']
  },
  activo: {
    type: Boolean,
    default: true
  },
  esRolSistema: {
    type: Boolean,
    default: true, // Los roles definidos son del sistema
    required: true
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

// Índices para optimizar consultas (nombre ya tiene índice único automático)
roleSchema.index({ nivel: 1 });
roleSchema.index({ activo: 1 });

// Método para obtener información básica
roleSchema.methods.getBasicInfo = function() {
  return {
    id: this._id,
    nombre: this.nombre,
    descripcion: this.descripcion,
    nivel: this.nivel,
    activo: this.activo,
    cantidadPermisos: this.permisos.length
  };
};

// Método para verificar si tiene un permiso específico
roleSchema.methods.tienePermiso = function(modulo, accion) {
  const permisoModulo = this.permisos.find(p => p.modulo === modulo);
  return permisoModulo && permisoModulo.acciones.includes(accion);
};

// Método para verificar si tiene permisos de administrador
roleSchema.methods.esAdministrador = function() {
  return this.nombre === 'superadmin' || this.nombre === 'adminaccount';
};

// Método para verificar si puede gestionar usuarios
roleSchema.methods.puedeGestionarUsuarios = function() {
  return this.tienePermiso('usuarios', 'administrar') || this.esAdministrador();
};

// Método estático para obtener jerarquía de roles
roleSchema.statics.getJerarquia = function() {
  return {
    1: 'superadmin',      // Máximo nivel - acceso total
    2: 'adminaccount',    // Administrador de cuenta
    3: 'coordinador',     // Coordinador de grupos
    4: 'familyadmin',     // Administrador de familia
    5: 'familyviewer'     // Solo visualización de familia
  };
};

// Método estático para obtener roles por nivel
roleSchema.statics.getRolesPorNivel = function(nivelMaximo) {
  return this.find({ 
    nivel: { $gte: nivelMaximo },
    activo: true 
  }).sort({ nivel: 1 });
};

module.exports = mongoose.model('Role', roleSchema); 