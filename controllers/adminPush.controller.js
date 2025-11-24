const PushNotification = require('../shared/models/PushNotification');
const { generateRecipients } = require('../services/pushNotificationService');
const { sendNotificationToQueue } = require('../services/sqsPushService');
const Shared = require('../shared/models/Shared');
const Role = require('../shared/models/Role');
const logger = require('../utils/logger');

/**
 * Obtener usuarios (tutores y coordinadores) de una división para selección
 */
async function getUsersByDivision(req, res) {
  try {
    const { divisionId } = req.params;
    const accountId = req.userInstitution?._id;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo determinar la cuenta del usuario'
      });
    }

    if (!divisionId) {
      return res.status(400).json({
        success: false,
        message: 'divisionId es requerido'
      });
    }

    // Obtener roles
    const tutorRoles = await Role.find({ nombre: { $in: ['familyadmin', 'familyviewer'] } });
    const coordinatorRole = await Role.findOne({ nombre: 'coordinador' });
    
    const tutorRoleIds = tutorRoles.map(r => r._id);
    const allRoleIds = coordinatorRole 
      ? [...tutorRoleIds, coordinatorRole._id]
      : tutorRoleIds;

    // Buscar asociaciones de la división
    // Nota: No filtramos por account aquí porque los coordinadores pueden estar asociados
    // a la división sin tener account específico, similar a getCoordinatorsByDivision
    const associations = await Shared.find({
      division: divisionId,
      role: { $in: allRoleIds },
      status: 'active'
    })
    .populate('user', 'name email nombre status')
    .populate('role', 'nombre descripcion')
    .populate('student', 'nombre apellido')
    .populate('account', 'nombre razonSocial');

    // Filtrar y formatear usuarios
    // Filtrar por account si está disponible, y solo usuarios activos
    const users = [];
    const userMap = new Map();

    associations.forEach(assoc => {
      // Filtrar por account si está disponible (para asegurar que pertenecen a la cuenta correcta)
      const assocAccountId = assoc.account?._id?.toString() || assoc.account?.toString();
      const targetAccountId = accountId?.toString();
      
      // Si hay accountId, filtrar por él; si no, incluir todos
      if (targetAccountId && assocAccountId && assocAccountId !== targetAccountId) {
        return; // Saltar esta asociación si no coincide con el account
      }
      
      if (assoc.user && (assoc.user.status === 'active' || assoc.user.status === 'approved')) {
        const userId = assoc.user._id.toString();
        if (!userMap.has(userId)) {
          userMap.set(userId, {
            _id: assoc.user._id,
            name: assoc.user.nombre || assoc.user.name,
            email: assoc.user.email,
            roles: [],
            students: []
          });
        }
        const user = userMap.get(userId);
        if (assoc.role && !user.roles.includes(assoc.role.nombre)) {
          user.roles.push(assoc.role.nombre);
        }
        if (assoc.student) {
          user.students.push({
            _id: assoc.student._id,
            nombre: assoc.student.nombre,
            apellido: assoc.student.apellido
          });
        }
      }
    });

    res.json({
      success: true,
      data: Array.from(userMap.values())
    });
  } catch (error) {
    logger.error('❌ [ADMIN PUSH] Error obteniendo usuarios por división:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo usuarios',
      error: error.message
    });
  }
}

/**
 * Crear una notificación push administrativa
 */
async function createPushNotification(req, res) {
  try {
    const { title, body, targetType, filters, scheduledAt } = req.body;
    const { userId } = req.user;
    const accountId = req.userInstitution?._id;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo determinar la cuenta del usuario'
      });
    }

    // Validar campos requeridos
    if (!title || !body || !targetType) {
      return res.status(400).json({
        success: false,
        message: 'title, body y targetType son requeridos'
      });
    }

    // Generar destinatarios
    logger.info(`📱 [ADMIN PUSH] Generando destinatarios para targetType: ${targetType}`);
    const recipients = await generateRecipients(filters || {}, targetType, accountId);

    // Calcular estadísticas
    const totalRecipients = recipients.length;
    const totalDevices = recipients.reduce((sum, r) => sum + r.devices.length, 0);

    // Crear la notificación push
    const pushNotification = new PushNotification({
      title,
      body,
      targetType,
      filters: filters || {},
      account: accountId,
      createdBy: userId,
      status: 'pending',
      stats: {
        totalRecipients,
        totalDevices,
        sent: 0,
        failed: 0,
        queued: 0
      },
      data: {
        type: 'admin_notification',
        accountId: accountId.toString()
      },
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null
    });

    await pushNotification.save();

    // Enviar notificaciones a la cola SQS
    logger.info(`📤 [ADMIN PUSH] Enviando ${totalDevices} notificaciones a cola SQS`);
    let queued = 0;
    let failed = 0;

    for (const recipient of recipients) {
      for (const device of recipient.devices) {
        try {
          const notification = {
            title,
            message: body,
            data: {
              type: 'admin_notification',
              notificationId: pushNotification._id.toString(),
              accountId: accountId.toString()
            },
            badge: 1,
            sound: 'default'
          };

          const result = await sendNotificationToQueue(
            device.pushToken,
            device.platform,
            notification
          );

          if (result.success) {
            queued++;
          } else {
            failed++;
            // Guardar error
            pushNotification.errors.push({
              deviceToken: device.pushToken.substring(0, 20) + '...',
              platform: device.platform,
              error: result.error || 'Error desconocido',
              timestamp: new Date()
            });
          }
        } catch (error) {
          failed++;
          logger.error(`❌ [ADMIN PUSH] Error enviando a cola para dispositivo ${device._id}:`, error);
          pushNotification.errors.push({
            deviceToken: device.pushToken.substring(0, 20) + '...',
            platform: device.platform,
            error: error.message,
            timestamp: new Date()
          });
        }
      }
    }

    // Actualizar estadísticas
    pushNotification.stats.queued = queued;
    pushNotification.stats.failed = failed;
    pushNotification.status = queued > 0 ? (failed > 0 ? 'partial' : 'processing') : 'failed';
    pushNotification.sentAt = queued > 0 ? new Date() : null;
    await pushNotification.save();

    logger.info(`✅ [ADMIN PUSH] Notificación creada: ${pushNotification._id}, Enviados a cola: ${queued}, Fallidos: ${failed}`);

    res.status(201).json({
      success: true,
      message: 'Notificación push creada y enviada a cola',
      data: {
        notification: pushNotification.getBasicInfo(),
        stats: pushNotification.stats
      }
    });
  } catch (error) {
    logger.error('❌ [ADMIN PUSH] Error creando notificación push:', error);
    res.status(500).json({
      success: false,
      message: 'Error creando notificación push',
      error: error.message
    });
  }
}

/**
 * Listar notificaciones push administrativas
 */
async function listPushNotifications(req, res) {
  try {
    const accountId = req.userInstitution?._id;
    const { page = 1, limit = 20, status } = req.query;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo determinar la cuenta del usuario'
      });
    }

    const query = { account: accountId };
    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const notifications = await PushNotification.find(query)
      .populate('createdBy', 'name email')
      .populate('filters.divisionId', 'nombre')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await PushNotification.countDocuments(query);

    res.json({
      success: true,
      data: notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('❌ [ADMIN PUSH] Error listando notificaciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error listando notificaciones push',
      error: error.message
    });
  }
}

/**
 * Obtener detalles de una notificación push
 */
async function getPushNotification(req, res) {
  try {
    const { id } = req.params;
    const accountId = req.userInstitution?._id;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo determinar la cuenta del usuario'
      });
    }

    const notification = await PushNotification.findOne({
      _id: id,
      account: accountId
    })
      .populate('createdBy', 'name email')
      .populate('filters.divisionId', 'nombre')
      .populate('filters.userIds', 'name email');

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notificación push no encontrada'
      });
    }

    res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    logger.error('❌ [ADMIN PUSH] Error obteniendo notificación:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo notificación push',
      error: error.message
    });
  }
}

module.exports = {
  createPushNotification,
  listPushNotifications,
  getPushNotification,
  getUsersByDivision
};
