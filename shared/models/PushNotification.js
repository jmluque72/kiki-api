const mongoose = require('mongoose');

const pushNotificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'El título es obligatorio'],
    trim: true,
    maxlength: [100, 'El título no puede exceder 100 caracteres']
  },
  body: {
    type: String,
    required: [true, 'El cuerpo del mensaje es obligatorio'],
    trim: true,
    maxlength: [500, 'El cuerpo no puede exceder 500 caracteres']
  },
  // Tipo de destinatarios
  targetType: {
    type: String,
    enum: ['institution', 'division', 'users', 'coordinators'],
    required: true
  },
  // Filtros de destinatarios
  filters: {
    // Para 'institution': todos los roles de la institución
    // Para 'division': división específica
    divisionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Grupo',
      required: false
    },
    // Roles a incluir
    roles: [{
      type: String,
      enum: ['coordinador', 'familyadmin', 'familyviewer']
    }],
    // IDs de usuarios específicos (para targetType: 'users')
    userIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    // Incluir coordinadores
    includeCoordinators: {
      type: Boolean,
      default: false
    }
  },
  // Cuenta a la que pertenece
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  // Usuario que creó la notificación
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Estado de la notificación
  status: {
    type: String,
    enum: ['pending', 'processing', 'sent', 'failed', 'partial'],
    default: 'pending'
  },
  // Estadísticas de envío
  stats: {
    totalRecipients: {
      type: Number,
      default: 0
    },
    totalDevices: {
      type: Number,
      default: 0
    },
    sent: {
      type: Number,
      default: 0
    },
    failed: {
      type: Number,
      default: 0
    },
    queued: {
      type: Number,
      default: 0
    }
  },
  // Datos adicionales para la notificación push
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Fecha de envío programado (opcional)
  scheduledAt: {
    type: Date,
    required: false
  },
  // Fecha de envío real
  sentAt: {
    type: Date,
    required: false
  },
  // Errores si los hay
  errors: [{
    deviceToken: String,
    platform: String,
    error: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
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
pushNotificationSchema.index({ account: 1, createdAt: -1 });
pushNotificationSchema.index({ createdBy: 1, createdAt: -1 });
pushNotificationSchema.index({ status: 1, createdAt: -1 });
pushNotificationSchema.index({ 'filters.divisionId': 1 });
pushNotificationSchema.index({ scheduledAt: 1 });

// Método para obtener información básica
pushNotificationSchema.methods.getBasicInfo = function() {
  return {
    id: this._id,
    title: this.title,
    body: this.body,
    targetType: this.targetType,
    status: this.status,
    stats: this.stats,
    createdAt: this.createdAt,
    sentAt: this.sentAt
  };
};

// Método estático para obtener notificaciones por cuenta
pushNotificationSchema.statics.getByAccount = function(accountId, limit = 50) {
  return this.find({ account: accountId })
    .populate('createdBy', 'name email')
    .populate('filters.divisionId', 'nombre')
    .sort({ createdAt: -1 })
    .limit(limit);
};

module.exports = mongoose.model('PushNotification', pushNotificationSchema);

