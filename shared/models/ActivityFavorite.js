const mongoose = require('mongoose');

const activityFavoriteSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El usuario es obligatorio']
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'El estudiante es obligatorio']
  },
  activity: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Activity',
    required: [true, 'La actividad es obligatoria']
  },
  addedAt: {
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

// Índice compuesto para evitar duplicados
activityFavoriteSchema.index({ user: 1, student: 1, activity: 1 }, { unique: true });

module.exports = mongoose.model('ActivityFavorite', activityFavoriteSchema);
