const mongoose = require('mongoose');

const notificationTemplateSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre del template es obligatorio'],
    trim: true,
    maxlength: [100, 'El nombre no puede exceder 100 caracteres']
  },
  texto: {
    type: String,
    required: [true, 'El texto del template es obligatorio'],
    trim: true,
    maxlength: [500, 'El texto no puede exceder 500 caracteres']
  },
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: [true, 'La cuenta es obligatoria']
  },
  creadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El usuario creador es obligatorio']
  },
  activo: {
    type: Boolean,
    default: true
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
notificationTemplateSchema.index({ account: 1 });
notificationTemplateSchema.index({ account: 1, activo: 1 });
notificationTemplateSchema.index({ creadoPor: 1 });

module.exports = mongoose.model('NotificationTemplate', notificationTemplateSchema);
