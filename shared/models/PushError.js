const mongoose = require('mongoose');

const pushErrorSchema = new mongoose.Schema({
  pushType: {
    type: String,
    required: true,
    trim: true
  },
  deviceToken: {
    type: String,
    required: false,
    trim: true
  },
  platform: {
    type: String,
    enum: ['ios', 'android'],
    required: false
  },
  pushData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  error: {
    type: String,
    required: true
  },
  errorDetails: {
    type: mongoose.Schema.Types.Mixed
  },
  attempts: {
    type: Number,
    default: 1,
    min: 1
  },
  messageId: {
    type: String
  },
  sqsMessageId: {
    type: String
  },
  processedAt: {
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

// Índices para optimizar consultas
pushErrorSchema.index({ deviceToken: 1, createdAt: -1 });
pushErrorSchema.index({ pushType: 1, createdAt: -1 });
pushErrorSchema.index({ platform: 1, createdAt: -1 });
pushErrorSchema.index({ processedAt: -1 });
pushErrorSchema.index({ createdAt: -1 });

// Método estático para obtener errores recientes
pushErrorSchema.statics.getRecentErrors = async function(deviceToken = null, hours = 24) {
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const query = {
    createdAt: { $gte: cutoffTime }
  };
  
  if (deviceToken) {
    query.deviceToken = deviceToken;
  }
  
  return await this.find(query).sort({ createdAt: -1 });
};

// Método estático para obtener estadísticas de errores
pushErrorSchema.statics.getErrorStats = async function(hours = 24) {
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const stats = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: cutoffTime }
      }
    },
    {
      $group: {
        _id: '$pushType',
        count: { $sum: 1 },
        platforms: { $addToSet: '$platform' }
      }
    },
    {
      $project: {
        _id: 0,
        pushType: '$_id',
        count: 1,
        platforms: 1
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
  
  return stats;
};

module.exports = mongoose.model('PushError', pushErrorSchema);

