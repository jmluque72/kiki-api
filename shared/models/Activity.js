const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  // Usuario que realizó la actividad
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Cuenta a la que pertenece la actividad
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  
  // División a la que pertenece la actividad (opcional)
  division: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grupo',
    required: false
  },
  
  // Tipo de actividad
  tipo: {
    type: String,
    enum: ['login', 'logout', 'create', 'update', 'delete', 'approve', 'reject', 'register'],
    required: true
  },
  
  // Entidad afectada
  entidad: {
    type: String,
    enum: ['user', 'account', 'group', 'event', 'asistencia', 'association'],
    required: true
  },
  
  // ID de la entidad afectada
  entidadId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },
  
  // Descripción de la actividad
  descripcion: {
    type: String,
    required: true,
    maxlength: 500
  },
  
  // Título de la actividad (para actividades creadas desde mobile)
  titulo: {
    type: String,
    required: false,
    maxlength: 200
  },
  
  // Participantes de la actividad (array de IDs de estudiantes)
  participantes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: false
  }],
  
  // Descripción detallada de la tarea
  descripcionTarea: {
    type: String,
    required: false,
    maxlength: 1000
  },
  
  // Imágenes de la actividad
  imagenes: [{
    type: String,
    required: false
  }],
  
  // Usuario que creó la actividad
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  
  // Datos adicionales (opcional)
  datos: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // IP del usuario
  ip: {
    type: String,
    required: false
  },
  
  // User Agent
  userAgent: {
    type: String,
    required: false
  },
  
  // Estado de la actividad
  activo: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Índices para optimizar consultas
activitySchema.index({ usuario: 1, createdAt: -1 });
activitySchema.index({ account: 1, createdAt: -1 });
activitySchema.index({ tipo: 1, createdAt: -1 });
activitySchema.index({ entidad: 1, createdAt: -1 });
activitySchema.index({ createdAt: -1 });

// Método estático para obtener actividades por cuenta
activitySchema.statics.getActivitiesByAccount = function(accountId, fechaInicio, fechaFin, limit = 50) {
  const query = {
    account: accountId,
    activo: true
  };
  
  if (fechaInicio && fechaFin) {
    query.createdAt = {
      $gte: new Date(fechaInicio),
      $lte: new Date(fechaFin)
    };
  }
  
  return this.find(query)
    .populate('usuario', 'name email')
    .populate('account', 'nombre razonSocial')
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Método estático para obtener actividades por usuario
activitySchema.statics.getActivitiesByUser = function(userId, fechaInicio, fechaFin, limit = 50) {
  const query = {
    usuario: userId,
    activo: true
  };
  
  if (fechaInicio && fechaFin) {
    query.createdAt = {
      $gte: new Date(fechaInicio),
      $lte: new Date(fechaFin)
    };
  }
  
  return this.find(query)
    .populate('usuario', 'name email')
    .populate('account', 'nombre razonSocial')
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Método estático para registrar una actividad
activitySchema.statics.registrarActividad = function(data) {
  const actividad = new this({
    usuario: data.usuario,
    account: data.account,
    division: data.division,
    tipo: data.tipo,
    entidad: data.entidad,
    entidadId: data.entidadId,
    descripcion: data.descripcion,
    datos: data.datos || {},
    ip: data.ip,
    userAgent: data.userAgent
  });
  
  return actividad.save();
};

module.exports = mongoose.model('Activity', activitySchema); 