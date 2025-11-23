const mongoose = require('mongoose');

// Schema para respuestas individuales embebidas en FormResponse
const respuestaSchema = new mongoose.Schema({
  preguntaId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'El ID de la pregunta es obligatorio']
  },
  valor: {
    type: mongoose.Schema.Types.Mixed,
    required: [true, 'El valor de la respuesta es obligatorio']
  }
}, { _id: false });

const formResponseSchema = new mongoose.Schema({
  formRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FormRequest',
    required: [true, 'El formulario es obligatorio']
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'El estudiante es obligatorio']
  },
  tutor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El tutor es obligatorio']
  },
  division: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grupo',
    required: [true, 'La división es obligatoria']
  },
  respuestas: {
    type: [respuestaSchema],
    required: true,
    default: []
  },
  completado: {
    type: Boolean,
    default: false,
    required: true
  },
  fechaCompletado: {
    type: Date,
    required: function() {
      return this.completado === true;
    }
  },
  estado: {
    type: String,
    enum: ['en_progreso', 'completado', 'aprobado', 'rechazado'],
    default: 'en_progreso',
    required: true
  },
  fechaAprobacion: {
    type: Date
  },
  aprobadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  motivoRechazo: {
    type: String
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
formResponseSchema.index({ formRequest: 1, student: 1, tutor: 1 }, { unique: true });
formResponseSchema.index({ student: 1, completado: 1 });
formResponseSchema.index({ tutor: 1, completado: 1 });
formResponseSchema.index({ division: 1, completado: 1 });
formResponseSchema.index({ formRequest: 1, division: 1 });

// Middleware para actualizar fechaCompletado y estado cuando se marca como completado
formResponseSchema.pre('save', function(next) {
  if (this.completado && !this.fechaCompletado) {
    this.fechaCompletado = new Date();
    // Cuando se completa, el estado cambia a 'completado' si no está ya aprobado
    if (this.estado === 'en_progreso') {
      this.estado = 'completado';
    }
  }
  if (!this.completado) {
    this.fechaCompletado = undefined;
    // Si se desmarca como completado, volver a en_progreso
    if (this.estado === 'completado') {
      this.estado = 'en_progreso';
    }
  }
  next();
});

// Método estático para obtener respuestas de un formulario
formResponseSchema.statics.getByFormRequest = function(formRequestId, divisionId = null) {
  const query = { formRequest: formRequestId };
  if (divisionId) {
    query.division = divisionId;
  }
  return this.find(query)
    .populate('formRequest', 'nombre descripcion')
    .populate('student', 'nombre apellido dni')
    .populate('tutor', 'name email')
    .populate('division', 'nombre')
    .sort({ createdAt: -1 });
};

// Método estático para obtener respuestas pendientes de un tutor para un estudiante
formResponseSchema.statics.getPendingForTutor = function(tutorId, studentId) {
  return this.find({
    tutor: tutorId,
    student: studentId,
    completado: false
  })
    .populate('formRequest', 'nombre descripcion preguntas')
    .populate('division', 'nombre')
    .sort({ createdAt: -1 });
};

// Método estático para verificar si hay respuestas requeridas pendientes
formResponseSchema.statics.hasRequiredPending = async function(tutorId, studentId) {
  const FormDivisionAssociation = mongoose.model('FormDivisionAssociation');
  
  // Obtener todas las asociaciones requeridas para el estudiante
  const student = await mongoose.model('Student').findById(studentId);
  if (!student) return false;
  
  const requiredAssociations = await FormDivisionAssociation.find({
    division: student.division,
    requerido: true
  }).populate({
    path: 'formRequest',
    match: { status: 'publicado' }
  });
  
  // Filtrar asociaciones con formularios publicados
  const validAssociations = requiredAssociations.filter(a => a.formRequest);
  
  if (validAssociations.length === 0) return false;
  
  // Verificar si todas las respuestas requeridas están aprobadas
  const formRequestIds = validAssociations.map(a => a.formRequest._id);
  const approvedResponses = await this.find({
    tutor: tutorId,
    student: studentId,
    formRequest: { $in: formRequestIds },
    estado: 'aprobado'
  }).distinct('formRequest');
  
  const approvedFormIds = approvedResponses.map(id => id.toString());
  const requiredFormIds = formRequestIds.map(id => id.toString());
  
  // Si hay algún formulario requerido sin aprobar, retornar true
  return requiredFormIds.some(id => !approvedFormIds.includes(id));
};

module.exports = mongoose.model('FormResponse', formResponseSchema);

