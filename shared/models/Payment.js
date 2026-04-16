const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  division: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grupo',
    required: true
  },
  year: {
    type: Number,
    required: true,
    min: 2020,
    max: 2100
  },
  month: {
    type: Number,
    required: true,
    min: 0,
    max: 12
  },
  amountExpected: {
    type: Number,
    default: 0,
    min: 0
  },
  amountPaid: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['pendiente', 'pagado', 'parcial'],
    default: 'pendiente'
  },
  paidAt: {
    type: Date,
    default: null
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  origen: {
    type: String,
    trim: true,
    maxlength: 50,
    default: null
  },
  referencia: {
    type: String,
    trim: true,
    maxlength: 150,
    default: ''
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

paymentSchema.index({ account: 1, year: 1, month: 1 });
paymentSchema.index({ student: 1, division: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Payment', paymentSchema);
