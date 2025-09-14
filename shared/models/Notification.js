const mongoose = require('mongoose');
const Shared = require('./Shared');

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'El título es obligatorio'],
    trim: true,
    maxlength: [100, 'El título no puede exceder 100 caracteres']
  },
  message: {
    type: String,
    required: [true, 'El mensaje es obligatorio'],
    trim: true,
    maxlength: [500, 'El mensaje no puede exceder 500 caracteres']
  },
  type: {
    type: String,
    enum: ['informacion', 'comunicacion', 'institucion'],
    default: 'informacion',
    required: [true, 'El tipo es obligatorio']
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El remitente es obligatorio']
  },
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: [true, 'La cuenta es obligatoria']
  },
  division: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grupo',
    required: false // Opcional, si se envía a toda la institución
  },
  recipients: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'medium', 'high'],
    default: 'normal'
  },
  scheduledFor: {
    type: Date,
    required: false // Para notificaciones programadas
  },
  sentAt: {
    type: Date,
    default: Date.now
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
notificationSchema.index({ sender: 1 });
notificationSchema.index({ account: 1 });
notificationSchema.index({ division: 1 });
notificationSchema.index({ recipients: 1 });
notificationSchema.index({ sentAt: -1 });
notificationSchema.index({ status: 1 });
notificationSchema.index({ type: 1 });

// Método para marcar como leída
notificationSchema.methods.markAsRead = async function(userId) {
  const existingRead = this.readBy.find(read => read.user.toString() === userId.toString());
  
  if (!existingRead) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });
    
    // Actualizar status si todos los destinatarios han leído
    if (this.recipients.length > 0 && this.readBy.length >= this.recipients.length) {
      this.status = 'read';
    }
    
    await this.save();
  }
  
  return this;
};

// Método para verificar si un usuario ha leído la notificación
notificationSchema.methods.isReadBy = function(userId) {
  return this.readBy.some(read => read.user.toString() === userId.toString());
};

// Método estático para obtener notificaciones de un usuario
notificationSchema.statics.getUserNotifications = async function(userId, options = {}) {
  const {
    limit = 20,
    skip = 0,
    unreadOnly = false,
    accountId = null,
    divisionId = null,
    userRole = null,
    isCoordinador = false
  } = options;

  console.log('🔔 [MODEL] getUserNotifications - Parámetros:', { userId, accountId, divisionId, userRole, isCoordinador });

  let query = {};

  // Lógica según el rol del usuario
  if (isCoordinador || userRole === 'coordinador') {
    // Para coordinadores: devolver TODAS las notificaciones de la institución y división
    console.log('🔔 [MODEL] Usuario es coordinador - mostrando todas las notificaciones');
    query = {
      account: accountId
    };
    
    if (divisionId) {
      query.division = divisionId;
    }
  } else if (userRole === 'familyadmin' || userRole === 'familyviewer') {
    // Para familyadmin/familyviewer: buscar estudiantes asociados y obtener sus notificaciones
    console.log('🔔 [MODEL] Usuario es familyadmin/familyviewer - buscando notificaciones de estudiantes asociados');
    
    // Buscar estudiantes asociados al usuario
    const associations = await Shared.find({
      user: userId,
      account: accountId,
      status: 'active'
    }).populate('student', '_id');

    if (associations.length === 0) {
      console.log('🔔 [MODEL] No se encontraron estudiantes asociados');
      return [];
    }

    // Obtener IDs de estudiantes asociados
    const studentIds = associations
      .map(assoc => assoc.student?._id)
      .filter(id => id); // Filtrar IDs válidos

    console.log('🔔 [MODEL] Estudiantes asociados:', studentIds);

    if (studentIds.length === 0) {
      console.log('🔔 [MODEL] No hay estudiantes válidos asociados');
      return [];
    }

    // Buscar notificaciones donde los estudiantes sean destinatarios
    query = {
      account: accountId,
      recipients: { $in: studentIds }
    };
    
    if (divisionId) {
      query.division = divisionId;
    }
  } else {
    // Para otros roles: devolver SOLO las notificaciones donde el usuario es destinatario directo
    console.log('🔔 [MODEL] Usuario es otro rol - mostrando solo notificaciones destinadas al usuario');
    query = {
      account: accountId,
      recipients: userId
    };
    
    if (divisionId) {
      query.division = divisionId;
    }
  }

  // Filtrar por no leídas si se solicita
  if (unreadOnly) {
    query['readBy.user'] = { $ne: userId };
  }

  console.log('🔔 [MODEL] Query final:', JSON.stringify(query, null, 2));

  const notifications = await this.find(query)
    .populate('sender', 'nombre email')
    .populate('account', 'nombre')
    .populate('division', 'nombre')
    .sort({ sentAt: -1 })
    .limit(limit)
    .skip(skip);

  console.log('🔔 [MODEL] Notificaciones encontradas:', notifications.length);
  
  return notifications;
};

module.exports = mongoose.model('Notification', notificationSchema); 