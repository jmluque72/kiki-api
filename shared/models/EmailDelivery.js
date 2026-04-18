const mongoose = require('mongoose');

const emailDeliverySchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  emailType: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  subject: {
    type: String,
    required: true
  },
  messageId: {
    type: String,
    index: true
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'bounced', 'complained', 'failed'],
    default: 'sent',
    index: true
  },
  provider: {
    type: String,
    default: 'gmail'
  },
  sentAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  deliveredAt: {
    type: Date
  },
  bouncedAt: {
    type: Date
  },
  complainedAt: {
    type: Date
  },
  bounceReason: {
    type: String
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
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
emailDeliverySchema.index({ email: 1, sentAt: -1 });
emailDeliverySchema.index({ emailType: 1, sentAt: -1 });
emailDeliverySchema.index({ status: 1, sentAt: -1 });
emailDeliverySchema.index({ sentAt: -1 });

// Método estático para obtener estadísticas de deliverabilidad
emailDeliverySchema.statics.getDeliveryStats = async function(hours = 24) {
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const stats = await this.aggregate([
    {
      $match: {
        sentAt: { $gte: cutoffTime }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        status: '$_id',
        count: 1
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
  
  const total = await this.countDocuments({ sentAt: { $gte: cutoffTime } });
  
  return {
    total,
    byStatus: stats,
    deliveryRate: total > 0 ? ((stats.find(s => s.status === 'delivered')?.count || 0) / total * 100).toFixed(2) : 0,
    bounceRate: total > 0 ? ((stats.find(s => s.status === 'bounced')?.count || 0) / total * 100).toFixed(2) : 0,
    complaintRate: total > 0 ? ((stats.find(s => s.status === 'complained')?.count || 0) / total * 100).toFixed(2) : 0
  };
};

// Método estático para obtener estadísticas por tipo de email
emailDeliverySchema.statics.getStatsByEmailType = async function(hours = 24) {
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const stats = await this.aggregate([
    {
      $match: {
        sentAt: { $gte: cutoffTime }
      }
    },
    {
      $group: {
        _id: {
          emailType: '$emailType',
          status: '$status'
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.emailType',
        total: { $sum: '$count' },
        byStatus: {
          $push: {
            status: '$_id.status',
            count: '$count'
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        emailType: '$_id',
        total: 1,
        byStatus: 1
      }
    },
    {
      $sort: { total: -1 }
    }
  ]);
  
  return stats;
};

module.exports = mongoose.model('EmailDelivery', emailDeliverySchema);

