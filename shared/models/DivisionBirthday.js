const mongoose = require('mongoose');

const divisionBirthdaySchema = new mongoose.Schema({
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: [true, 'La institución es obligatoria']
  },
  division: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grupo',
    required: [true, 'La división es obligatoria']
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'El alumno es obligatorio']
  },
  tipo: {
    type: String,
    required: true,
    enum: {
      values: ['ALUMNO', 'PADRE'],
      message: 'El tipo debe ser ALUMNO o PADRE'
    }
  },
  fechaNacimiento: {
    type: Date,
    required: [true, 'La fecha de nacimiento es obligatoria']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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

divisionBirthdaySchema.index({ account: 1, division: 1 });
divisionBirthdaySchema.index({ division: 1, student: 1, tipo: 1 });

module.exports = mongoose.model('DivisionBirthday', divisionBirthdaySchema, 'divisionbirthdays');
