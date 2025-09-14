const mongoose = require('mongoose');

const asistenciaSchema = new mongoose.Schema({
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  division: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grupo',
    required: true
  },
  fecha: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^\d{4}-\d{2}-\d{2}$/.test(v);
      },
      message: 'La fecha debe estar en formato YYYY-MM-DD'
    }
  },
  estudiantes: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true
    },
    presente: {
      type: Boolean,
      required: true,
      default: false
    },
    retirado: {
      type: Boolean,
      default: false
    },
    retiradoPor: {
      type: String,
      enum: ['familyadmin', 'familyviewer', 'contact'],
      default: null
    },
    retiradoPorNombre: {
      type: String,
      default: null
    },
    retiradoEn: {
      type: Date,
      default: null
    }
  }],
  creadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Índice compuesto para evitar duplicados de asistencia en el mismo día
asistenciaSchema.index({ account: 1, division: 1, fecha: 1 }, { unique: true });

module.exports = mongoose.model('Asistencia', asistenciaSchema); 