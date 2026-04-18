const mongoose = require('mongoose');

const formDivisionAssociationSchema = new mongoose.Schema({
  formRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FormRequest',
    required: [true, 'El formulario es obligatorio']
  },
  division: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grupo',
    required: [true, 'La división es obligatoria']
  },
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: [true, 'La cuenta es obligatoria']
  },
  requerido: {
    type: Boolean,
    default: false,
    required: true
  },
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

// Índice único para evitar duplicados
formDivisionAssociationSchema.index({ formRequest: 1, division: 1 }, { unique: true });

// Índices para optimizar consultas
formDivisionAssociationSchema.index({ division: 1, requerido: 1 });
formDivisionAssociationSchema.index({ account: 1 });
formDivisionAssociationSchema.index({ formRequest: 1 });

// Método estático para obtener formularios asociados a una división
formDivisionAssociationSchema.statics.getByDivision = function(divisionId) {
  return this.find({ division: divisionId })
    .populate('formRequest', 'nombre descripcion status preguntas')
    .populate('division', 'nombre')
    .populate('account', 'nombre razonSocial')
    .sort({ createdAt: -1 });
};

// Método estático para obtener divisiones asociadas a un formulario
formDivisionAssociationSchema.statics.getByFormRequest = function(formRequestId) {
  return this.find({ formRequest: formRequestId })
    .populate('division', 'nombre descripcion')
    .populate('account', 'nombre razonSocial')
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model('FormDivisionAssociation', formDivisionAssociationSchema);

