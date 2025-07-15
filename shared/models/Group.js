const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre del grupo es obligatorio'],
    trim: true,
    minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
    maxlength: [100, 'El nombre no puede exceder 100 caracteres']
  },
  descripcion: {
    type: String,
    trim: true,
    maxlength: [500, 'La descripción no puede exceder 500 caracteres'],
    default: ''
  },
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: [true, 'El grupo debe pertenecer a una cuenta']
  },
  usuarios: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  rolPorDefecto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: false
  },
  permisos: [{
    modulo: {
      type: String,
      required: true,
      enum: ['usuarios', 'cuentas', 'grupos', 'reportes', 'configuracion', 'familias']
    },
    acciones: [{
      type: String,
      enum: ['crear', 'leer', 'actualizar', 'eliminar', 'administrar', 'ver']
    }]
  }],
  activo: {
    type: Boolean,
    default: true
  },
  creadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Se requiere el usuario que crea el grupo']
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
groupSchema.index({ account: 1, nombre: 1 }, { unique: true }); // Nombre único por cuenta
groupSchema.index({ account: 1, activo: 1 });
groupSchema.index({ usuarios: 1 });
groupSchema.index({ createdAt: -1 });

// Método para obtener información básica
groupSchema.methods.getBasicInfo = function() {
  return {
    id: this._id,
    nombre: this.nombre,
    descripcion: this.descripcion,
    account: this.account,
    cantidadUsuarios: this.usuarios.length,
    rolPorDefecto: this.rolPorDefecto,
    activo: this.activo,
    createdAt: this.createdAt
  };
};

// Método para verificar si un usuario pertenece al grupo
groupSchema.methods.tieneUsuario = function(usuarioId) {
  return this.usuarios.some(usuario => usuario.toString() === usuarioId.toString());
};

// Método para añadir usuario al grupo
groupSchema.methods.agregarUsuario = function(usuarioId) {
  if (!this.tieneUsuario(usuarioId)) {
    this.usuarios.push(usuarioId);
  }
};

// Método para remover usuario del grupo
groupSchema.methods.removerUsuario = function(usuarioId) {
  this.usuarios = this.usuarios.filter(usuario => usuario.toString() !== usuarioId.toString());
};

// Método para verificar permisos
groupSchema.methods.tienePermiso = function(modulo, accion) {
  const permisoModulo = this.permisos.find(p => p.modulo === modulo);
  return permisoModulo && permisoModulo.acciones.includes(accion);
};

module.exports = mongoose.model('Group', groupSchema); 