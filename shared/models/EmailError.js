const mongoose = require('mongoose');

const emailErrorSchema = new mongoose.Schema({
  emailType: {
    type: String,
    required: true,
    trim: true
  },
  recipient: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  emailData: {
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
emailErrorSchema.index({ recipient: 1, createdAt: -1 });
emailErrorSchema.index({ emailType: 1, createdAt: -1 });
emailErrorSchema.index({ processedAt: -1 });
emailErrorSchema.index({ createdAt: -1 });

// Método estático para obtener errores recientes
emailErrorSchema.statics.getRecentErrors = async function(recipient = null, hours = 24) {
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const query = {
    createdAt: { $gte: cutoffTime }
  };
  
  if (recipient) {
    query.recipient = recipient;
  }
  
  return await this.find(query).sort({ createdAt: -1 });
};

// Método estático para obtener estadísticas de errores
emailErrorSchema.statics.getErrorStats = async function(hours = 24) {
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const stats = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: cutoffTime }
      }
    },
    {
      $group: {
        _id: '$emailType',
        count: { $sum: 1 },
        uniqueRecipients: { $addToSet: '$recipient' }
      }
    },
    {
      $project: {
        _id: 0,
        emailType: '$_id',
        count: 1,
        uniqueRecipients: { $size: '$uniqueRecipients' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
  
  return stats;
};

module.exports = mongoose.model('EmailError', emailErrorSchema);

