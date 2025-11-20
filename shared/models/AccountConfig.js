const mongoose = require('mongoose');

const accountConfigSchema = new mongoose.Schema({
  // Referencia a la cuenta
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true,
    unique: true
  },
  
  // Flag: Si la institución requiere aprobar actividades
  // Si es true: las actividades se crean en estado 'borrador' y deben ser aprobadas
  // Si es false: las actividades se crean directamente en estado 'publicada'
  requiereAprobarActividades: {
    type: Boolean,
    default: true // Por defecto requiere aprobación (comportamiento actual)
  },
  
  // Otros flags de configuración pueden agregarse aquí en el futuro
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
accountConfigSchema.index({ account: 1 });

// Método estático para obtener o crear configuración por defecto
accountConfigSchema.statics.getOrCreateConfig = async function(accountId) {
  let config = await this.findOne({ account: accountId });
  
  if (!config) {
    // Crear configuración por defecto
    config = new this({
      account: accountId,
      requiereAprobarActividades: true // Por defecto requiere aprobación
    });
    await config.save();
  }
  
  return config;
};

module.exports = mongoose.model('AccountConfig', accountConfigSchema);

