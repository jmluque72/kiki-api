const mongoose = require('mongoose');

const loginAttemptSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    required: true
  },
  success: {
    type: Boolean,
    required: true,
    default: false
  },
  failureReason: {
    type: String,
    enum: [
      'invalid_credentials',
      'user_not_found',
      'user_inactive',
      'user_not_approved',
      'password_incorrect',
      'rate_limit_exceeded',
      'two_factor_required',
      'two_factor_invalid',
      'account_locked',
      'other'
    ]
  },
  twoFactorUsed: {
    type: Boolean,
    default: false
  },
  deviceInfo: {
    type: {
      platform: String,
      browser: String,
      version: String,
      isMobile: Boolean
    }
  },
  location: {
    country: String,
    region: String,
    city: String,
    timezone: String
  },
  riskScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  suspiciousActivity: {
    type: Boolean,
    default: false
  },
  blocked: {
    type: Boolean,
    default: false
  },
  blockedUntil: {
    type: Date
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
loginAttemptSchema.index({ email: 1, createdAt: -1 });
loginAttemptSchema.index({ ipAddress: 1, createdAt: -1 });
loginAttemptSchema.index({ success: 1, createdAt: -1 });
loginAttemptSchema.index({ suspiciousActivity: 1, createdAt: -1 });
loginAttemptSchema.index({ blocked: 1, blockedUntil: 1 });
loginAttemptSchema.index({ createdAt: -1 });

// Método estático para obtener intentos fallidos recientes
loginAttemptSchema.statics.getRecentFailedAttempts = async function(email, ipAddress, timeWindow = 15) {
  const cutoffTime = new Date(Date.now() - timeWindow * 60 * 1000); // minutos
  
  const attempts = await this.find({
    $or: [
      { email: email },
      { ipAddress: ipAddress }
    ],
    success: false,
    createdAt: { $gte: cutoffTime }
  }).sort({ createdAt: -1 });
  
  return attempts;
};

// Método estático para calcular score de riesgo
loginAttemptSchema.statics.calculateRiskScore = function(attempt) {
  let score = 0;
  
  // Intentos fallidos recientes
  if (attempt.success === false) {
    score += 20;
  }
  
  // Múltiples IPs para el mismo email
  if (attempt.email) {
    score += 10;
  }
  
  // User-Agent sospechoso
  if (attempt.userAgent && (
    attempt.userAgent.includes('bot') ||
    attempt.userAgent.includes('crawler') ||
    attempt.userAgent.includes('spider')
  )) {
    score += 30;
  }
  
  // Horarios inusuales (3 AM - 6 AM)
  const hour = new Date().getHours();
  if (hour >= 3 && hour <= 6) {
    score += 15;
  }
  
  // Patrones de email sospechosos
  if (attempt.email && (
    attempt.email.includes('test') ||
    attempt.email.includes('admin') ||
    attempt.email.includes('root')
  )) {
    score += 25;
  }
  
  return Math.min(score, 100);
};

// Método estático para detectar actividad sospechosa
loginAttemptSchema.statics.detectSuspiciousActivity = async function(email, ipAddress) {
  const recentAttempts = await this.getRecentFailedAttempts(email, ipAddress, 60); // 1 hora
  
  // Múltiples intentos fallidos
  if (recentAttempts.length >= 5) {
    return {
      suspicious: true,
      reason: 'multiple_failed_attempts',
      count: recentAttempts.length
    };
  }
  
  // Múltiples IPs para el mismo email
  const uniqueIPs = new Set(recentAttempts.map(attempt => attempt.ipAddress));
  if (uniqueIPs.size >= 3) {
    return {
      suspicious: true,
      reason: 'multiple_ips',
      count: uniqueIPs.size
    };
  }
  
  // Patrones de tiempo sospechosos (intentos muy rápidos)
  const now = new Date();
  const rapidAttempts = recentAttempts.filter(attempt => 
    (now - attempt.createdAt) < 60000 // menos de 1 minuto
  );
  
  if (rapidAttempts.length >= 3) {
    return {
      suspicious: true,
      reason: 'rapid_attempts',
      count: rapidAttempts.length
    };
  }
  
  return { suspicious: false };
};

// Método estático para bloquear IP temporalmente
loginAttemptSchema.statics.blockIP = async function(ipAddress, durationMinutes = 60) {
  const blockedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
  
  await this.updateMany(
    { ipAddress: ipAddress },
    { 
      blocked: true, 
      blockedUntil: blockedUntil 
    }
  );
  
  console.log(`🚫 [LOGIN MONITOR] IP ${ipAddress} bloqueada hasta ${blockedUntil}`);
  return blockedUntil;
};

// Método estático para obtener estadísticas
loginAttemptSchema.statics.getStats = async function(timeWindow = 24) {
  const cutoffTime = new Date(Date.now() - timeWindow * 60 * 60 * 1000); // horas
  
  const stats = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: cutoffTime }
      }
    },
    {
      $group: {
        _id: null,
        totalAttempts: { $sum: 1 },
        successfulAttempts: {
          $sum: { $cond: ['$success', 1, 0] }
        },
        failedAttempts: {
          $sum: { $cond: ['$success', 0, 1] }
        },
        suspiciousAttempts: {
          $sum: { $cond: ['$suspiciousActivity', 1, 0] }
        },
        blockedAttempts: {
          $sum: { $cond: ['$blocked', 1, 0] }
        },
        uniqueIPs: { $addToSet: '$ipAddress' },
        uniqueEmails: { $addToSet: '$email' }
      }
    },
    {
      $project: {
        _id: 0,
        totalAttempts: 1,
        successfulAttempts: 1,
        failedAttempts: 1,
        suspiciousAttempts: 1,
        blockedAttempts: 1,
        uniqueIPs: { $size: '$uniqueIPs' },
        uniqueEmails: { $size: '$uniqueEmails' },
        successRate: {
          $multiply: [
            { $divide: ['$successfulAttempts', '$totalAttempts'] },
            100
          ]
        }
      }
    }
  ]);
  
  return stats[0] || {
    totalAttempts: 0,
    successfulAttempts: 0,
    failedAttempts: 0,
    suspiciousAttempts: 0,
    blockedAttempts: 0,
    uniqueIPs: 0,
    uniqueEmails: 0,
    successRate: 0
  };
};

module.exports = mongoose.model('LoginAttempt', loginAttemptSchema);
