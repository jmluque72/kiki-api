const mongoose = require('mongoose');

const paymentConfigSchema = new mongoose.Schema({
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true,
    unique: true
  },

  // Matrícula anual: si la institución cobra y monto (legacy, preferir matriculaPorDivision)
  matriculaAnual: {
    cobran: {
      type: Boolean,
      default: false
    },
    monto: {
      type: Number,
      default: 0,
      min: 0
    }
  },

  // Matrícula anual por división (se cobra una vez al año por estudiante)
  matriculaPorDivision: [{
    division: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Grupo',
      required: true
    },
    monto: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    }
  }],

  // Cuota mensual por división (Grupo)
  cuotaPorDivision: [{
    division: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Grupo',
      required: true
    },
    monto: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    }
  }],

  // Productos vendibles con precio configurable por institución
  productos: [{
    nombre: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    precio: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    activo: {
      type: Boolean,
      default: true
    }
  }],

  moneda: {
    type: String,
    default: 'ARS',
    trim: true,
    maxlength: 10
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function (doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

paymentConfigSchema.index({ account: 1 });

paymentConfigSchema.statics.getOrCreateConfig = async function (accountId) {
  let config = await this.findOne({ account: accountId });
  if (!config) {
    config = new this({
      account: accountId,
      matriculaAnual: { cobran: false, monto: 0 },
      matriculaPorDivision: [],
      cuotaPorDivision: [],
      productos: [],
      moneda: 'ARS'
    });
    await config.save();
  }
  return config;
};

module.exports = mongoose.model('PaymentConfig', paymentConfigSchema);
