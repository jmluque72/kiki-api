const mongoose = require('mongoose');
const Shared = require('./Shared');

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'El título es obligatorio'],
    trim: true,
    maxlength: [100, 'El título no puede exceder 100 caracteres']
  },
  message: {
    type: String,
    required: [true, 'El mensaje es obligatorio'],
    trim: true,
    maxlength: [500, 'El mensaje no puede exceder 500 caracteres']
  },
  type: {
    type: String,
    enum: ['informacion', 'comunicacion', 'institucion', 'coordinador', 'tutor'],
    default: 'informacion',
    required: [true, 'El tipo es obligatorio']
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El remitente es obligatorio']
  },
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: [true, 'La cuenta es obligatoria']
  },
  division: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grupo',
    required: false // Opcional, si se envía a toda la institución
  },
  recipients: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Estudiante asociado para notificaciones tipo "tutor" (acciones rápidas)
  associatedStudent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: false
  },
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'read', 'rejected'],
    default: 'sent'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  approvedAt: {
    type: Date,
    required: false
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  rejectedAt: {
    type: Date,
    required: false
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: [500, 'La razón de rechazo no puede exceder 500 caracteres'],
    required: false
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'medium', 'high'],
    default: 'normal'
  },
  scheduledFor: {
    type: Date,
    required: false // Para notificaciones programadas
  },
  sentAt: {
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
notificationSchema.index({ sender: 1 });
notificationSchema.index({ account: 1 });
notificationSchema.index({ division: 1 });
notificationSchema.index({ recipients: 1 });
notificationSchema.index({ sentAt: -1 });
notificationSchema.index({ status: 1 });
notificationSchema.index({ type: 1 });

// Índice compuesto para optimizar consultas de backoffice (filtrar por account y ordenar por sentAt)
// Este índice es crítico para la consulta getAllInstitutionNotifications
notificationSchema.index({ account: 1, sentAt: -1 });

// Método para marcar como leída
notificationSchema.methods.markAsRead = async function(userId) {
  const existingRead = this.readBy.find(read => read.user.toString() === userId.toString());
  
  if (!existingRead) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });
    
    // Actualizar status si todos los destinatarios han leído
    if (this.recipients.length > 0 && this.readBy.length >= this.recipients.length) {
      this.status = 'read';
    }
    
    await this.save();
  }
  
  return this;
};

// Método para verificar si un usuario ha leído la notificación
notificationSchema.methods.isReadBy = function(userId) {
  return this.readBy.some(read => read.user.toString() === userId.toString());
};

// Método estático para obtener notificaciones de un usuario
notificationSchema.statics.getUserNotifications = async function(userId, options = {}) {
  const {
    limit = 20,
    skip = 0,
    unreadOnly = false,
    accountId = null,
    divisionId = null,
    userRole = null,
    isCoordinador = false
  } = options;

  let query = {};

  // Lógica según el rol del usuario
  if (isCoordinador || userRole === 'coordinador') {
    // COORDINADOR: Puede ver notificaciones donde:
    // 1. Él es el sender (notificaciones que él creó)
    // 2. Él está en los recipients (notificaciones tipo "tutor" donde es destinatario)
    
    console.log('🔔 [MODEL] ========== COORDINADOR - INICIO ==========');
    console.log('🔔 [MODEL] userId recibido (raw):', userId, 'tipo:', typeof userId);
    
    // Convertir IDs a ObjectId si es necesario
    const userIdObjectId = mongoose.Types.ObjectId.isValid(userId) 
      ? new mongoose.Types.ObjectId(userId) 
      : userId;
    
    const accountIdObjectId = accountId && mongoose.Types.ObjectId.isValid(accountId)
      ? new mongoose.Types.ObjectId(accountId)
      : accountId;
    
    const divisionIdObjectId = divisionId && mongoose.Types.ObjectId.isValid(divisionId)
      ? new mongoose.Types.ObjectId(divisionId)
      : divisionId;
    
    console.log('🔔 [MODEL] userIdObjectId (convertido):', userIdObjectId.toString());
    console.log('🔔 [MODEL] userIdObjectId (tipo):', userIdObjectId.constructor.name);
    console.log('🔔 [MODEL] accountIdObjectId:', accountIdObjectId?.toString() || 'null/undefined');
    console.log('🔔 [MODEL] divisionIdObjectId:', divisionIdObjectId?.toString() || 'null/undefined');
    
    // Construir las condiciones del $or
    const orConditions = [];
    
    // Condición 1: Notificaciones donde el coordinador es el emisor
    const senderCondition = { sender: userIdObjectId };
    if (accountIdObjectId) {
      senderCondition.account = accountIdObjectId;
    }
    if (divisionIdObjectId) {
      senderCondition.division = divisionIdObjectId;
    }
    orConditions.push(senderCondition);
    
    // Condición 2: Notificaciones donde el coordinador está en recipients
    // Para notificaciones tipo "tutor", los recipients son User IDs (coordinadores)
    // Aplicamos filtro de account si existe, pero no de division (puede ser null)
    // Asegurar que el $in tenga ObjectIds, no strings
    const recipientCondition = {
      recipients: { $in: [userIdObjectId] } // userIdObjectId ya es ObjectId
    };
    if (accountIdObjectId) {
      recipientCondition.account = accountIdObjectId;
    }
    orConditions.push(recipientCondition);
    
    // Verificar que el $in tenga ObjectIds
    console.log('🔔 [MODEL] Verificando $in en recipients:');
    console.log('  - Tipo del elemento en $in:', recipientCondition.recipients.$in[0].constructor.name);
    console.log('  - Es ObjectId?:', recipientCondition.recipients.$in[0] instanceof mongoose.Types.ObjectId);
    
    query = {
      $or: orConditions
    };
    
    console.log('🔔 [MODEL] Query final (JSON):', JSON.stringify(query, null, 2));
    console.log('🔔 [MODEL] Query final (objeto):', query);
    console.log('🔔 [MODEL] ========== COORDINADOR - FIN ==========');
    
  } else if (userRole === 'familyadmin' || userRole === 'familyviewer') {
    // TUTOR: Debe ver notificaciones donde su estudiante activo está en los recipients
    
    // Buscar estudiantes asociados al usuario
    const associations = await Shared.find({
      user: userId,
      account: accountId,
      status: 'active'
    }).populate('student', '_id');

    if (associations.length === 0) {
      return [];
    }

    // Obtener IDs de estudiantes asociados
    const studentIds = associations
      .map(assoc => assoc.student?._id)
      .filter(id => id); // Filtrar IDs válidos

    if (studentIds.length === 0) {
      return [];
    }

    // Buscar notificaciones donde los estudiantes asociados al tutor están en recipients
    query = {
      account: accountId,
      recipients: { $in: studentIds }
    };
    
    if (divisionId) {
      query.division = divisionId;
    }
    
  } else {
    // Para otros roles: devolver SOLO las notificaciones donde el usuario es destinatario directo
    query = {
      account: accountId,
      recipients: userId
    };
    
    if (divisionId) {
      query.division = divisionId;
    }
  }

  // Filtrar por no leídas si se solicita
  if (unreadOnly) {
    // Si ya hay un $or en la query (para coordinadores), necesitamos combinarlo
    if (query.$or) {
      // Guardar el $or existente
      const existingOr = query.$or;
      // Crear nuevo $or que combine las condiciones existentes con las de no leídas
      query.$and = [
        { $or: existingOr },
        {
          $or: [
            { readBy: { $exists: false } },
            { readBy: { $size: 0 } },
            { readBy: { $not: { $elemMatch: { user: userId } } } }
          ]
        }
      ];
      // Eliminar el $or original ya que ahora está en $and
      delete query.$or;
    } else {
      // Si no hay $or, usar el método normal
      query.$or = [
        { readBy: { $exists: false } },
        { readBy: { $size: 0 } },
        { readBy: { $not: { $elemMatch: { user: userId } } } }
      ];
    }
  }

  console.log('🔔 [MODEL] Ejecutando query...');
  const notifications = await this.find(query)
    .populate('sender', 'name email')
    .populate('account', 'nombre')
    .populate('division', 'nombre')
    .populate('associatedStudent', 'nombre apellido')
    .sort({ sentAt: -1 })
    .limit(limit)
    .skip(skip);
  
  console.log('🔔 [MODEL] Notificaciones encontradas:', notifications.length);
  
  // Buscar la notificación específica después de filtrar
  const targetNotificationId = '692b71d6ee867593a6942b2a';
  const targetNotification = notifications.find(n => n._id.toString() === targetNotificationId);
  
  if (targetNotification) {
    console.log('✅ [MODEL] NOTIFICACIÓN TARGET ENCONTRADA en resultados:');
    console.log('  - ID:', targetNotification._id.toString());
    console.log('  - Tipo:', targetNotification.type);
    console.log('  - Sender:', targetNotification.sender?._id?.toString());
    console.log('  - Account:', targetNotification.account?._id?.toString());
    console.log('  - Division:', targetNotification.division?._id?.toString());
    console.log('  - Recipients:', targetNotification.recipients?.map(r => {
      if (typeof r === 'object' && r._id) return r._id.toString();
      return r.toString();
    }).join(', '));
  } else {
    console.log('❌ [MODEL] NOTIFICACIÓN TARGET NO ENCONTRADA en resultados');
    console.log('  - Buscando ID:', targetNotificationId);
    console.log('  - IDs encontrados:', notifications.map(n => n._id.toString()));
    
    // Buscar directamente en la BD sin filtros
    const directNotification = await this.findById(targetNotificationId);
    if (directNotification) {
      console.log('✅ [MODEL] Notificación existe en BD:');
      console.log('  - ID:', directNotification._id.toString());
      console.log('  - Tipo:', directNotification.type);
      console.log('  - Sender:', directNotification.sender?.toString());
      console.log('  - Account:', directNotification.account?.toString());
      console.log('  - Division:', directNotification.division?.toString());
      console.log('  - Recipients (raw):', directNotification.recipients?.map(r => r.toString()).join(', '));
      
      // Verificar si el userId está en recipients
      const userIdString = (isCoordinador || userRole === 'coordinador') 
        ? (mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId).toString() : userId.toString())
        : null;
      
      if (userIdString) {
        const recipientStrings = directNotification.recipients?.map(r => r.toString()) || [];
        const isInRecipients = recipientStrings.includes(userIdString);
        console.log('  - userId buscado:', userIdString);
        console.log('  - ¿Está userId en recipients?:', isInRecipients);
        console.log('  - Recipients strings:', recipientStrings);
      }
      
      // Verificar si cumple alguna condición de la query
      const userIdObjectId = mongoose.Types.ObjectId.isValid(userId) 
        ? new mongoose.Types.ObjectId(userId) 
        : userId;
      const isSender = directNotification.sender?.toString() === userIdObjectId.toString();
      const isInRecipientsCheck = directNotification.recipients?.some(r => {
        const rId = r.toString();
        return rId === userIdObjectId.toString();
      });
      
      console.log('  - ¿Es sender?:', isSender);
      console.log('  - ¿Está en recipients (check)?:', isInRecipientsCheck);
    } else {
      console.log('❌ [MODEL] Notificación NO existe en BD');
    }
  }
  
  if (notifications.length > 0 && (isCoordinador || userRole === 'coordinador')) {
    console.log('🔔 [MODEL] IDs de notificaciones encontradas:', notifications.map(n => n._id.toString()));
    console.log('🔔 [MODEL] Tipos de notificaciones:', notifications.map(n => n.type));
  }

  // Logs de depuración solo si no se encontraron notificaciones para coordinadores
  if ((isCoordinador || userRole === 'coordinador') && notifications.length === 0) {
    console.log('⚠️ [MODEL] Coordinador - No se encontraron notificaciones con la query principal');
    console.log('🔔 [MODEL] Query usada:', JSON.stringify(query, null, 2));
    
    const userIdForTest = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
    const userIdString = userIdForTest.toString();
    
    // Query de prueba 1: Solo buscar por recipients (sin ningún otro filtro)
    const testQuery1 = { recipients: { $in: [userIdForTest] } };
    const testNotifications1 = await this.find(testQuery1).limit(10);
    console.log('🔔 [MODEL] Test 1 (solo recipients, userId:', userIdString, '):', testNotifications1.length, 'notificaciones');
    if (testNotifications1.length > 0) {
      testNotifications1.forEach(n => {
        const recipientStrings = n.recipients?.map(r => {
          if (typeof r === 'object' && r._id) return r._id.toString();
          return r.toString();
        }) || [];
        console.log(`  - ID: ${n._id.toString()}, Tipo: ${n.type}, Account: ${n.account?.toString()}, Division: ${n.division?.toString()}`);
        console.log(`    Recipients: [${recipientStrings.join(', ')}]`);
        console.log(`    ¿Está userId en recipients?: ${recipientStrings.includes(userIdString)}`);
      });
    } else {
      console.log('  ❌ No se encontraron notificaciones con solo el filtro de recipients');
    }
    
    // Query de prueba 2: Buscar notificaciones tipo "tutor"
    const testQuery2 = { type: 'tutor', recipients: { $in: [userIdForTest] } };
    const testNotifications2 = await this.find(testQuery2).limit(10);
    console.log('🔔 [MODEL] Test 2 (tipo tutor + recipients):', testNotifications2.length, 'notificaciones');
    if (testNotifications2.length > 0) {
      testNotifications2.forEach(n => {
        console.log(`  - ID: ${n._id.toString()}, Account: ${n.account?.toString()}, Division: ${n.division?.toString()}`);
      });
    } else {
      console.log('  ❌ No se encontraron notificaciones tipo "tutor" con este userId en recipients');
    }
    
    // Query de prueba 3: Buscar TODAS las notificaciones tipo "tutor" para ver cuáles hay
    const testQuery3 = { type: 'tutor' };
    const testNotifications3 = await this.find(testQuery3).limit(10);
    console.log('🔔 [MODEL] Test 3 (todas las tipo tutor):', testNotifications3.length, 'notificaciones');
    if (testNotifications3.length > 0) {
      testNotifications3.forEach(n => {
        const recipientStrings = n.recipients?.map(r => {
          if (typeof r === 'object' && r._id) return r._id.toString();
          return r.toString();
        }) || [];
        console.log(`  - ID: ${n._id.toString()}, Account: ${n.account?.toString()}, Division: ${n.division?.toString()}`);
        console.log(`    Recipients: [${recipientStrings.join(', ')}]`);
        console.log(`    ¿Está userId (${userIdString}) en recipients?: ${recipientStrings.includes(userIdString)}`);
      });
    }
  }
  
  return notifications;
};

module.exports = mongoose.model('Notification', notificationSchema); 