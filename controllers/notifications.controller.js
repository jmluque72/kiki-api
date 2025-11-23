const Notification = require('../shared/models/Notification');
const User = require('../shared/models/User');
const Student = require('../shared/models/Student');
const Shared = require('../shared/models/Shared');
const ActiveAssociation = require('../shared/models/ActiveAssociation');
const Device = require('../shared/models/Device');

// Función helper para obtener usuarios familiares de un estudiante
async function getFamilyUsersForStudent(studentId) {
  try {
    console.log('🔔 [FAMILY LOOKUP] Buscando familiares para estudiante:', studentId);
    
    // Buscar asociaciones activas del estudiante con roles familyadmin y familyviewer
    const associations = await Shared.find({
      student: studentId,
      status: 'active',
      'role.nombre': { $in: ['familyadmin', 'familyviewer'] }
    }).populate('user', 'name email').populate('role', 'nombre');
    
    console.log('🔔 [FAMILY LOOKUP] Asociaciones encontradas:', associations.length);
    
    const familyUsers = [];
    
    for (const association of associations) {
      if (association.user && association.role) {
        // Obtener dispositivos activos del usuario
        let devices;
        if (Device.getActiveDevicesForUser) {
          devices = await Device.getActiveDevicesForUser(association.user._id);
        } else {
          devices = await Device.find({
            user: association.user._id,
            activo: true,
            pushToken: { $exists: true, $ne: null }
          });
        }
        
        if (devices.length > 0) {
          familyUsers.push({
            user: association.user,
            role: association.role,
            devices: devices
          });
          console.log('🔔 [FAMILY LOOKUP] Usuario con dispositivos:', association.user.name, '- Dispositivos:', devices.length);
        } else {
          console.log('🔔 [FAMILY LOOKUP] Usuario sin dispositivos activos:', association.user.name);
        }
      }
    }
    
    console.log('🔔 [FAMILY LOOKUP] Total usuarios familiares con dispositivos:', familyUsers.length);
    return familyUsers;
    
  } catch (error) {
    console.error('❌ [FAMILY LOOKUP] Error:', error);
    return [];
  }
}

// Función helper para enviar push notifications (importación condicional)
let sendPushNotificationToStudentFamily;
try {
  // Intentar importar pushNotificationService, pero no fallar si no está disponible
  const pushNotificationService = require('../pushNotificationService');
  
  // Función para enviar push notifications
  sendPushNotificationToStudentFamily = async function(studentId, notification) {
    try {
      console.log('🔔 [PUSH SEND] Enviando push notification para estudiante:', studentId);
      
      // Obtener usuarios familiares
      const familyUsers = await getFamilyUsersForStudent(studentId);
      
      if (familyUsers.length === 0) {
        console.log('🔔 [PUSH SEND] No se encontraron usuarios familiares con dispositivos');
        return { sent: 0, failed: 0 };
      }
      
      let sent = 0;
      let failed = 0;
      
      // Enviar a cada usuario familiar
      for (const familyUser of familyUsers) {
        for (const device of familyUser.devices) {
          try {
            const pushNotification = {
              title: notification.title,
              message: notification.message,
              data: {
                type: 'notification',
                notificationId: notification._id,
                studentId: studentId,
                priority: notification.priority || 'normal'
              }
            };
            
            await pushNotificationService.sendNotification(
              device.pushToken,
              device.platform,
              pushNotification
            );
            
            // Actualizar último uso del dispositivo
            if (device.updateLastUsed) {
              await device.updateLastUsed();
            }
            
            sent++;
            console.log('🔔 [PUSH SEND] ✅ Enviado a:', familyUser.user.name, '-', device.platform);
            
          } catch (error) {
            failed++;
            console.error('🔔 [PUSH SEND] ❌ Error enviando a:', familyUser.user.name, '-', error.message);
            
            // Si el token es inválido, desactivar el dispositivo
            if (error.message.includes('InvalidRegistration') || error.message.includes('NotRegistered')) {
              if (device.deactivate) {
                await device.deactivate();
              } else {
                await Device.findByIdAndUpdate(device._id, { activo: false });
              }
            }
          }
        }
      }
      
      console.log('🔔 [PUSH SEND] Total enviados:', sent, 'Fallidos:', failed);
      return { sent, failed };
      
    } catch (error) {
      console.error('🔔 [PUSH SEND] Error general:', error);
      return { sent: 0, failed: 0 };
    }
  };
} catch (error) {
  console.warn('⚠️ [NOTIFICATIONS] pushNotificationService no disponible:', error.message);
  // Función stub que no hace nada si el servicio no está disponible
  sendPushNotificationToStudentFamily = async function(studentId, notification) {
    console.warn('⚠️ [PUSH SEND] Push notifications no disponibles');
    return { sent: 0, failed: 0 };
  };
}

/**
 * Obtener notificaciones del calendario para backoffice
 */
const getCalendarNotifications = async (req, res) => {
  try {
    const { 
      divisionId,
      fechaInicio,
      fechaFin
    } = req.query;
    
    console.log('📅 [CALENDAR NOTIFICATIONS] Parámetros:', { divisionId, fechaInicio, fechaFin });
    
    // Verificar permisos del usuario
    let currentUser;
    if (req.user.isCognitoUser) {
      currentUser = await User.findOne({ email: req.user.email }).populate('role');
    } else {
      const { userId } = req.user;
      currentUser = await User.findById(userId).populate('role');
    }
    
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    console.log('📅 [CALENDAR NOTIFICATIONS] Rol del usuario:', currentUser.role?.nombre);
    
    // Construir query base
    let query = {};
    
    // Lógica según el rol
    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin ve todas las notificaciones de todas las cuentas
      // No filtrar por cuenta específica
    } else if (currentUser.role?.nombre === 'adminaccount') {
      // Adminaccount ve todas las notificaciones de su cuenta
      if (req.userInstitution) {
        query.account = req.userInstitution._id;
      } else {
        return res.status(403).json({
          success: false,
          message: 'No tienes una institución asignada'
        });
      }
    } else {
      // Otros roles no tienen acceso al backoffice
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para acceder a esta sección'
      });
    }
    
    // Filtros adicionales
    if (divisionId) {
      query.division = divisionId;
    }
    
    if (fechaInicio && fechaFin) {
      // Crear fechas UTC para evitar problemas de zona horaria
      const startDate = new Date(fechaInicio + 'T00:00:00.000Z');
      const endDate = new Date(fechaFin + 'T23:59:59.999Z');
      
      query.sentAt = {
        $gte: startDate,
        $lte: endDate
      };
      
      console.log('📅 [CALENDAR NOTIFICATIONS] Filtro de fechas:', {
        fechaInicio: startDate.toISOString(),
        fechaFin: endDate.toISOString()
      });
    }
    
    console.log('📅 [CALENDAR NOTIFICATIONS] Query:', JSON.stringify(query, null, 2));
    
    // Buscar notificaciones
    const notifications = await Notification.find(query)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('sender', 'name email')
      .sort({ sentAt: -1 })
      .lean();
    
    console.log('📅 [CALENDAR NOTIFICATIONS] Notificaciones encontradas:', notifications.length);
    
    // Agrupar notificaciones por fecha
    const calendarData = {};
    
    notifications.forEach(notification => {
      // Usar fecha local en lugar de UTC para evitar problemas de zona horaria
      const sentAtDate = new Date(notification.sentAt);
      const year = sentAtDate.getFullYear();
      const month = String(sentAtDate.getMonth() + 1).padStart(2, '0');
      const day = String(sentAtDate.getDate()).padStart(2, '0');
      const fecha = `${year}-${month}-${day}`;
      
      if (!calendarData[fecha]) {
        calendarData[fecha] = {
          fecha: fecha,
          totalNotificaciones: 0,
          notificaciones: []
        };
      }
      
      calendarData[fecha].totalNotificaciones++;
      calendarData[fecha].notificaciones.push(notification);
    });
    
    console.log('📅 [CALENDAR NOTIFICATIONS] Datos del calendario:', Object.keys(calendarData).length, 'días');
    
    res.json({
      success: true,
      data: calendarData
    });
    
  } catch (error) {
    console.error('❌ [CALENDAR NOTIFICATIONS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener datos del calendario'
    });
  }
};

/**
 * Obtener notificaciones del usuario (endpoint general)
 */
const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const { 
      limit = 20, 
      skip = 0, 
      unreadOnly = false,
      accountId,
      divisionId,
      userRole,
      isCoordinador
    } = req.query;
    
    console.log('🔔 [GET NOTIFICATIONS] Usuario:', userId);
    console.log('🔔 [GET NOTIFICATIONS] Parámetros:', { accountId, divisionId, userRole, isCoordinador });
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    console.log('🔔 [GET NOTIFICATIONS] Rol del usuario (base):', user.role?.nombre);

    // Usar rol de la asociación activa si existe
    const activeAssociation = await ActiveAssociation.findOne({ user: userId }).populate('role');
    const effectiveRole = activeAssociation?.role?.nombre || user.role?.nombre;
    const effectiveIsCoordinador = effectiveRole === 'coordinador';
    console.log('🔔 [GET NOTIFICATIONS] Rol efectivo:', effectiveRole);
    
    const options = {
      limit: parseInt(limit),
      skip: parseInt(skip),
      unreadOnly: unreadOnly === 'true',
      accountId,
      divisionId,
      userRole: effectiveRole,
      isCoordinador: effectiveIsCoordinador
    };
    
    let notifications = await Notification.getUserNotifications(userId, options);
    
    console.log('🔔 [GET NOTIFICATIONS] Notificaciones encontradas:', notifications.length);
    
    // Si el usuario es familyadmin o familyviewer, poblar recipients con información del estudiante
    if (effectiveRole === 'familyadmin' || effectiveRole === 'familyviewer') {
      // Recopilar todos los recipient IDs de todas las notificaciones
      const allRecipientIds = [];
      notifications.forEach(notification => {
        if (notification.recipients && notification.recipients.length > 0) {
          allRecipientIds.push(...notification.recipients.map(r => r._id || r));
        }
      });
      
      // Hacer consultas en batch para estudiantes y usuarios
      const uniqueRecipientIds = [...new Set(allRecipientIds.map(id => id.toString()))];
      
      const [students, users] = await Promise.all([
        Student.find({ _id: { $in: uniqueRecipientIds } }).select('_id nombre apellido email'),
        User.find({ _id: { $in: uniqueRecipientIds } }).select('_id name email')
      ]);
      
      // Crear mapas para búsqueda rápida
      const studentsMap = new Map(students.map(s => [s._id.toString(), s]));
      const usersMap = new Map(users.map(u => [u._id.toString(), u]));
      
      // Poblar recipients para cada notificación
      const populatedNotifications = notifications.map(notification => {
        let notificationObj = notification.toObject();
        
        if (notification.recipients && notification.recipients.length > 0) {
          const populatedRecipients = notification.recipients.map(recipientId => {
            const id = recipientId._id ? recipientId._id.toString() : recipientId.toString();
            
            // Buscar primero en estudiantes
            let recipient = studentsMap.get(id);
            if (recipient) {
              const recipientObj = recipient.toObject();
              recipientObj.nombre = `${recipientObj.nombre} ${recipientObj.apellido}`;
              return recipientObj;
            }
            
            // Si no es estudiante, buscar en usuarios
            recipient = usersMap.get(id);
            if (recipient) {
              const recipientObj = recipient.toObject();
              recipientObj.nombre = recipientObj.name;
              return recipientObj;
            }
            
            return null;
          }).filter(r => r !== null);
          
          notificationObj.recipients = populatedRecipients;
        }
        
        return notificationObj;
      });
      
      notifications = populatedNotifications;
    }
    
    res.json({
      success: true,
      data: notifications
    });
    
  } catch (error) {
    console.error('❌ [GET NOTIFICATIONS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener notificaciones'
    });
  }
};

/**
 * Obtener notificaciones para usuarios familia (familyadmin/familyviewer)
 */
const getFamilyNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const { 
      limit = 20, 
      skip = 0, 
      unreadOnly = false,
      accountId,
      divisionId
    } = req.query;
    
    console.log('🔔 [GET FAMILY NOTIFICATIONS] Usuario:', userId);
    console.log('🔔 [GET FAMILY NOTIFICATIONS] Parámetros:', { accountId, divisionId, unreadOnly });
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Obtener la asociación activa del usuario
    const activeAssociation = await ActiveAssociation.findOne({ user: userId }).populate('role');
    console.log('🔔 [GET FAMILY NOTIFICATIONS] Buscando ActiveAssociation para userId:', userId);
    console.log('🔔 [GET FAMILY NOTIFICATIONS] ActiveAssociation encontrada:', activeAssociation ? {
      id: activeAssociation._id,
      activeShared: activeAssociation.activeShared,
      role: activeAssociation.role?.nombre
    } : null);
    
    if (!activeAssociation || !activeAssociation.activeShared || !activeAssociation.activeShared.student) {
      console.log('🔔 [GET FAMILY NOTIFICATIONS] No hay asociación activa o estudiante activo');
      return res.json({
        success: true,
        data: []
      });
    }
    
    const studentId = activeAssociation.activeShared.student;
    console.log('🔔 [GET FAMILY NOTIFICATIONS] Estudiante activo:', studentId);
    
    // Construir query para notificaciones
    let query = {
      recipients: studentId
    };
    
    if (accountId) {
      query.account = accountId;
    }
    
    if (divisionId) {
      query.division = divisionId;
    }
    
    if (unreadOnly === 'true') {
      query['readBy.user'] = { $ne: userId };
    }
    
    console.log('🔔 [GET FAMILY NOTIFICATIONS] Query:', JSON.stringify(query, null, 2));
    
    // Obtener notificaciones
    const notifications = await Notification.find(query)
      .populate('sender', 'name email')
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .sort({ sentAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    console.log('🔔 [GET FAMILY NOTIFICATIONS] Notificaciones encontradas:', notifications.length);
    
    res.json({
      success: true,
      data: notifications
    });
    
  } catch (error) {
    console.error('❌ [GET FAMILY NOTIFICATIONS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener conteo de notificaciones familia'
    });
  }
};

/**
 * Obtener detalles de una notificación
 */
const getNotificationDetails = async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user._id;
    
    console.log('🔔 [GET NOTIFICATION DETAILS] ID:', notificationId);
    console.log('🔔 [GET NOTIFICATION DETAILS] Usuario:', userId);
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Buscar la notificación con detalles básicos
    const notification = await Notification.findById(notificationId)
      .populate('sender', 'name email')
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('readBy.user', 'name email');
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notificación no encontrada'
      });
    }
    
    // Verificar que el usuario tenga acceso a esta notificación
    // Usar rol efectivo de ActiveAssociation si existe
    const activeAssociation = await ActiveAssociation.findOne({ user: userId }).populate('role');
    const effectiveRole = activeAssociation?.role?.nombre || user.role?.nombre;
    const isCoordinador = effectiveRole === 'coordinador';
    const hasAccess = isCoordinador || 
                     notification.recipients.some(recipient => recipient.toString() === userId);
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver esta notificación'
      });
    }
    
    // Poblar destinatarios manualmente (usuarios y estudiantes)
    let notificationObj = notification.toObject();
    
    if (notification.recipients && notification.recipients.length > 0) {
      const populatedRecipients = [];
      
      for (let recipientId of notification.recipients) {
        // Intentar buscar como usuario
        let recipient = await User.findById(recipientId).select('name email');
        
        // Si no es usuario, buscar como estudiante
        if (!recipient) {
          recipient = await Student.findById(recipientId).select('nombre apellido email');
        }
        
        if (recipient) {
          // Normalizar el nombre para usuarios y estudiantes
          const recipientObj = recipient.toObject();
          if (recipientObj.name) {
            // Es un usuario, usar 'name' como 'nombre'
            recipientObj.nombre = recipientObj.name;
          } else if (recipientObj.nombre && recipientObj.apellido) {
            // Es un estudiante, combinar nombre y apellido
            recipientObj.nombre = `${recipientObj.nombre} ${recipientObj.apellido}`;
          }
          populatedRecipients.push(recipientObj);
        }
      }
      
      notificationObj.recipients = populatedRecipients;
    }

    // Poblar readBy.user manualmente para asegurar que tenga el campo nombre
    if (notificationObj.readBy && notificationObj.readBy.length > 0) {
      const populatedReadBy = [];
      
      for (let readEntry of notificationObj.readBy) {
        if (readEntry.user && readEntry.user._id) {
          // Buscar el usuario completo
          const user = await User.findById(readEntry.user._id).select('name email');
          if (user) {
            populatedReadBy.push({
              user: {
                _id: user._id,
                nombre: user.name, // User model usa 'name', no 'nombre'
                email: user.email
              },
              readAt: readEntry.readAt,
              _id: readEntry._id
            });
          } else {
            // Si no se encuentra el usuario, mantener la entrada original
            populatedReadBy.push(readEntry);
          }
        } else {
          populatedReadBy.push(readEntry);
        }
      }
      
      notificationObj.readBy = populatedReadBy;
    }
    
    // Calcular estadísticas corregidas
    const totalRecipients = notificationObj.recipients?.length || 0;
    
    // Filtrar readBy para excluir coordinadores
    const readByParents = notificationObj.readBy?.filter(readEntry => {
      if (!readEntry.user) return false;
      // Verificar si el usuario que leyó es coordinador
      return readEntry.user.role?.nombre !== 'coordinador';
    }) || [];
    
    // Para la lista de pendientes, necesitamos encontrar qué estudiantes tienen padres que ya leyeron
    const studentsWithParentsRead = new Set();
    
    if (readByParents.length > 0) {
      // Buscar asociaciones de los usuarios que leyeron para encontrar sus estudiantes
      for (let readEntry of readByParents) {
        const associations = await Shared.find({
          user: readEntry.user._id,
          status: 'active'
        }).populate('student', '_id');
        
        associations.forEach(assoc => {
          if (assoc.student) {
            studentsWithParentsRead.add(assoc.student._id.toString());
          }
        });
      }
    }
    
    // Filtrar destinatarios pendientes (estudiantes cuyos padres NO han leído)
    const pendingRecipients = [];
    
    if (notificationObj.recipients && notificationObj.recipients.length > 0) {
      for (let recipient of notificationObj.recipients) {
        // Si es un estudiante, verificar si sus padres ya leyeron
        if (recipient._id && !studentsWithParentsRead.has(recipient._id.toString())) {
          // Buscar el tutor (familyadmin) de este estudiante
          const tutorAssociation = await Shared.findOne({
            student: recipient._id,
            status: 'active'
          }).populate('user', 'name email').populate('role', 'nombre');
          
          // Solo incluir si el tutor es familyadmin
          if (tutorAssociation && tutorAssociation.role?.nombre === 'familyadmin') {
            pendingRecipients.push({
              ...recipient,
              tutor: {
                name: tutorAssociation.user?.name,
                email: tutorAssociation.user?.email
              }
            });
          } else {
            // Si no tiene tutor familyadmin, incluir sin tutor
            pendingRecipients.push({
              ...recipient,
              tutor: null
            });
          }
        }
      }
    }
    
    // Agregar estadísticas corregidas al objeto de respuesta
    notificationObj.stats = {
      totalRecipients,
      readByParents: readByParents.length,
      pendingRecipients: pendingRecipients.length
    };
    
    // Agregar lista de pendientes corregida
    notificationObj.pendingRecipients = pendingRecipients;
    
    console.log('🔔 [GET NOTIFICATION DETAILS] Notificación encontrada:', notification.title);
    console.log('🔔 [GET NOTIFICATION DETAILS] Total destinatarios:', totalRecipients);
    console.log('🔔 [GET NOTIFICATION DETAILS] Leídas por padres:', readByParents.length);
    console.log('🔔 [GET NOTIFICATION DETAILS] Pendientes:', pendingRecipients.length);
    
    res.json({
      success: true,
      data: notificationObj
    });
    
  } catch (error) {
    console.error('❌ [GET NOTIFICATION DETAILS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener detalles de la notificación'
    });
  }
};

/**
 * Marcar notificación como leída
 */
const markNotificationAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const notificationId = req.params.id;
    
    console.log('🔔 [MARK READ] Usuario:', userId, 'Notificación:', notificationId);
    
    const notification = await Notification.findById(notificationId);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notificación no encontrada'
      });
    }
    
    await notification.markAsRead(userId);
    
    console.log('🔔 [MARK READ] Notificación marcada como leída');
    
    res.json({
      success: true,
      message: 'Notificación marcada como leída'
    });
    
  } catch (error) {
    console.error('❌ [MARK READ] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al marcar notificación como leída'
    });
  }
};

/**
 * Eliminar notificación
 */
const deleteNotification = async (req, res) => {
  try {
    const userId = req.user._id;
    const notificationId = req.params.id;
    
    console.log('🔔 [DELETE] Usuario:', userId, 'Notificación:', notificationId);
    
    const notification = await Notification.findById(notificationId);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notificación no encontrada'
      });
    }
    
    // Verificar permisos: remitente, superadmin, coordinador o adminaccount puede eliminar
    const user = await User.findById(userId).populate('role');
    const isSuperAdmin = user?.role?.nombre === 'superadmin';
    const isCoordinador = user?.role?.nombre === 'coordinador';
    const isAdminAccount = user?.role?.nombre === 'adminaccount';
    const isSender = notification.sender.toString() === userId;
    
    console.log('🔔 [DELETE] Verificando permisos:', {
      userId,
      userRole: user?.role?.nombre,
      isSuperAdmin,
      isCoordinador,
      isAdminAccount,
      isSender,
      notificationSender: notification.sender.toString()
    });
    
    if (!isSuperAdmin && !isCoordinador && !isAdminAccount && !isSender) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar esta notificación'
      });
    }
    
    await Notification.findByIdAndDelete(notificationId);
    
    console.log('🔔 [DELETE] Notificación eliminada');
    
    res.json({
      success: true,
      message: 'Notificación eliminada correctamente'
    });
    
  } catch (error) {
    console.error('❌ [DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar notificación'
    });
  }
};

/**
 * Obtener conteo de notificaciones sin leer
 */
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;
    
    console.log('🔔 [UNREAD COUNT] Usuario:', userId);
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Solo familyadmin y familyviewer pueden ver notificaciones
    if (!['familyadmin', 'familyviewer'].includes(user.role?.nombre)) {
      return res.json({
        success: true,
        data: { count: 0 }
      });
    }
    
    console.log('🔔 [UNREAD COUNT] Rol del usuario:', user.role?.nombre);
    
    // Para familyadmin/familyviewer: buscar estudiantes asociados y obtener sus notificaciones
    console.log('🔔 [UNREAD COUNT] Usuario es familyadmin/familyviewer - buscando notificaciones de estudiantes asociados');
    
    // Obtener todas las asociaciones del usuario
    const userAssociations = await Shared.find({ 
      user: userId, 
      status: 'active' 
    }).populate('account division student');
    
    if (userAssociations.length === 0) {
      console.log('🔔 [UNREAD COUNT] No se encontraron asociaciones activas');
      return res.json({
        success: true,
        data: { count: 0 }
      });
    }
    
    // Obtener IDs de estudiantes asociados
    const studentIds = userAssociations
      .map(assoc => assoc.student?._id)
      .filter(id => id); // Filtrar IDs válidos
    
    console.log('🔔 [UNREAD COUNT] Estudiantes asociados:', studentIds);
    
    if (studentIds.length === 0) {
      console.log('🔔 [UNREAD COUNT] No hay estudiantes válidos asociados');
      return res.json({
        success: true,
        data: { count: 0 }
      });
    }
    
    // Obtener IDs de cuentas del usuario
    const accountIds = userAssociations.map(assoc => assoc.account._id);
    
    console.log('🔔 [UNREAD COUNT] Cuentas del usuario:', accountIds);
    
    // Construir query para notificaciones
    const query = {
      account: { $in: accountIds },
      recipients: { $in: studentIds }, // Notificaciones dirigidas a los estudiantes asociados
      'readBy.user': { $ne: userId } // Excluir las que ya fueron leídas por este usuario
    };
    
    console.log('🔔 [UNREAD COUNT] Query:', JSON.stringify(query, null, 2));
    
    // Contar notificaciones sin leer
    const unreadCount = await Notification.countDocuments(query);
    
    console.log('🔔 [UNREAD COUNT] Conteo sin leer:', unreadCount);
    
    res.json({
      success: true,
      data: { count: unreadCount }
    });
    
  } catch (error) {
    console.error('❌ [UNREAD COUNT] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Obtener conteo de notificaciones sin leer para usuarios familia (endpoint específico)
 */
const getFamilyUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const { accountId } = req.query;
    
    console.log('🔔 [FAMILY UNREAD COUNT] Usuario:', userId);
    console.log('🔔 [FAMILY UNREAD COUNT] AccountId:', accountId);
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Obtener la asociación activa del usuario
    const activeAssociation = await ActiveAssociation.findOne({ user: userId }).populate('role');
    
    if (!activeAssociation || !activeAssociation.activeShared || !activeAssociation.activeShared.student) {
      return res.json({
        success: true,
        data: { count: 0 }
      });
    }
    
    const studentId = activeAssociation.activeShared.student;
    
    // Construir query para notificaciones
    let query = {
      recipients: studentId,
      'readBy.user': { $ne: userId }
    };
    
    if (accountId) {
      query.account = accountId;
    }
    
    // Contar notificaciones sin leer
    const unreadCount = await Notification.countDocuments(query);
    
    res.json({
      success: true,
      data: { count: unreadCount }
    });
    
  } catch (error) {
    console.error('❌ [FAMILY UNREAD COUNT] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener conteo de notificaciones familia'
    });
  }
};

/**
 * Obtener notificaciones para el backoffice (servicio específico)
 */
const getBackofficeNotifications = async (req, res) => {
  try {
    // Verificar permisos del usuario
    let currentUser;
    if (req.user.isCognitoUser) {
      currentUser = await User.findOne({ email: req.user.email }).populate('role');
    } else {
      const { userId } = req.user;
      currentUser = await User.findById(userId).populate('role');
    }
    
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    const userId = currentUser._id;
    const { 
      limit = 100, 
      skip = 0, 
      accountId,
      divisionId,
      type,
      search
    } = req.query;
    
    console.log('🔔 [BACKOFFICE NOTIFICATIONS] Usuario:', userId);
    console.log('🔔 [BACKOFFICE NOTIFICATIONS] Parámetros:', { accountId, divisionId, type, search });
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    console.log('🔔 [BACKOFFICE NOTIFICATIONS] Rol del usuario:', user.role?.nombre);
    
    // Construir query base
    let query = {};
    
    // Lógica según el rol
    if (user.role?.nombre === 'superadmin') {
      // Superadmin ve todas las notificaciones de todas las cuentas
      if (accountId) {
        query.account = accountId;
      }
    } else if (user.role?.nombre === 'adminaccount') {
      // Adminaccount ve todas las notificaciones de su cuenta
      query.account = user.account?._id;
    } else {
      // Otros roles no tienen acceso al backoffice
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para acceder a esta sección'
      });
    }
    
    // Filtros adicionales
    if (divisionId) {
      query.division = divisionId;
    }
    
    if (type && type !== 'all') {
      query.type = type;
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } }
      ];
    }
    
    console.log('🔔 [BACKOFFICE NOTIFICATIONS] Query final:', JSON.stringify(query, null, 2));
    
    // Obtener total de notificaciones para la paginación
    const total = await Notification.countDocuments(query);
    
    // Obtener notificaciones con paginación
    const notifications = await Notification.find(query)
      .populate('sender', 'name email')
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .sort({ sentAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    // Poblar destinatarios manualmente (usuarios y estudiantes)
    const populatedNotifications = [];
    
    for (let notification of notifications) {
      // Convertir a objeto plano primero
      let notificationObj = notification.toObject();
      
      if (notification.recipients && notification.recipients.length > 0) {
        const populatedRecipients = [];
        
        for (let recipientId of notification.recipients) {
          // Intentar buscar como usuario
          let recipient = await User.findById(recipientId).select('name email');
          
          // Si no es usuario, buscar como estudiante
          if (!recipient) {
            recipient = await Student.findById(recipientId).select('nombre apellido email');
          }
          
          if (recipient) {
            // Normalizar el nombre para usuarios y estudiantes
            const recipientObj = recipient.toObject();
            if (recipientObj.name) {
              // Es un usuario, usar 'name' como 'nombre'
              recipientObj.nombre = recipientObj.name;
            } else if (recipientObj.nombre && recipientObj.apellido) {
              // Es un estudiante, combinar nombre y apellido
              recipientObj.nombre = `${recipientObj.nombre} ${recipientObj.apellido}`;
            }
            populatedRecipients.push(recipientObj);
          }
        }
        
        notificationObj.recipients = populatedRecipients;
      }
      
      populatedNotifications.push(notificationObj);
    }
    
    // Calcular información de paginación
    const currentPage = Math.floor(parseInt(skip) / parseInt(limit)) + 1;
    const totalPages = Math.ceil(total / parseInt(limit));
    const hasNextPage = currentPage < totalPages;
    const hasPrevPage = currentPage > 1;
    
    console.log('🔔 [BACKOFFICE NOTIFICATIONS] Notificaciones encontradas:', populatedNotifications.length);
    console.log('🔔 [BACKOFFICE NOTIFICATIONS] Paginación:', { currentPage, totalPages, total });
    
    res.json({
      success: true,
      data: populatedNotifications,
      pagination: {
        currentPage,
        totalPages,
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNextPage,
        hasPrevPage
      }
    });
    
  } catch (error) {
    console.error('❌ [BACKOFFICE NOTIFICATIONS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener notificaciones'
    });
  }
};

/**
 * Enviar nueva notificación
 */
const sendNotification = async (req, res) => {
  try {
    console.log('🔔 [SEND NOTIFICATION] Iniciando...');
    const { title, message, type, accountId, divisionId, recipients = [] } = req.body;
    const userId = req.user._id;

    console.log('🔔 [SEND NOTIFICATION] Datos recibidos:', { title, message, type, accountId, divisionId, recipients });

    // Validar campos requeridos
    if (!title || !message || !type || !accountId) {
      console.log('❌ [SEND NOTIFICATION] Campos faltantes');
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: título, mensaje, tipo y cuenta'
      });
    }

    // Validar tipo de notificación
    if (!['informacion', 'comunicacion', 'institucion', 'coordinador'].includes(type)) {
      console.log('❌ [SEND NOTIFICATION] Tipo inválido:', type);
      return res.status(400).json({
        success: false,
        message: 'Tipo de notificación inválido. Debe ser "informacion", "comunicacion", "institucion" o "coordinador"'
      });
    }

    // Verificar que el usuario tiene permisos para la cuenta
    console.log('🔔 [SEND NOTIFICATION] Verificando permisos...');
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      console.log('❌ [SEND NOTIFICATION] Usuario no encontrado');
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    console.log('🔔 [SEND NOTIFICATION] Usuario:', user.email, 'Rol:', user.role?.nombre);
    
    // Verificar permisos según el rol
    if (user.role?.nombre === 'adminaccount') {
      // Adminaccount puede enviar notificaciones a su cuenta
      if (user.account?._id?.toString() !== accountId) {
        // Si no tiene cuenta asignada directamente, verificar asociación en Shared
        console.log('🔔 [SEND NOTIFICATION] Adminaccount sin cuenta directa, verificando asociación en Shared...');
        const userAssociation = await Shared.findOne({
          user: userId,
          account: accountId,
          status: 'active'
        });

        if (!userAssociation) {
          console.log('❌ [SEND NOTIFICATION] Adminaccount no tiene permisos para esta cuenta');
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para enviar notificaciones a esta cuenta'
          });
        }
        console.log('✅ [SEND NOTIFICATION] Adminaccount tiene asociación activa en Shared');
      } else {
        console.log('✅ [SEND NOTIFICATION] Adminaccount tiene cuenta asignada directamente');
      }
    } else if (user.role?.nombre === 'superadmin') {
      // Superadmin puede enviar a cualquier cuenta
      console.log('🔔 [SEND NOTIFICATION] Superadmin - permisos otorgados');
    } else {
      // Para otros roles, verificar asociación en Shared
      const userAssociation = await Shared.findOne({
        user: userId,
        account: accountId,
        status: 'active'
      });

      if (!userAssociation) {
        console.log('❌ [SEND NOTIFICATION] Sin permisos - no hay asociación activa');
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para enviar notificaciones a esta cuenta'
        });
      }
    }

    console.log('🔔 [SEND NOTIFICATION] Creando notificación...');
    // Crear la notificación
    const notification = new Notification({
      title,
      message,
      type,
      sender: userId,
      account: accountId,
      division: divisionId,
      recipients,
      status: 'sent',
      priority: 'normal',
      readBy: [],
      sentAt: new Date()
    });

    await notification.save();
    console.log('🔔 [SEND NOTIFICATION] Notificación guardada:', notification._id);

    // Enviar push notifications a usuarios familiares de estudiantes
    if (recipients && recipients.length > 0) {
      console.log('🔔 [SEND NOTIFICATION] Enviando push notifications a familiares...');
      
      // Verificar si los destinatarios son estudiantes
      const students = await Student.find({ _id: { $in: recipients } });
      
      if (students.length > 0) {
        console.log('🔔 [SEND NOTIFICATION] Encontrados', students.length, 'estudiantes destinatarios');
        
        // Enviar push notification a cada estudiante
        for (const student of students) {
          try {
            const pushResult = await sendPushNotificationToStudentFamily(student._id, notification);
            console.log('🔔 [SEND NOTIFICATION] Push para estudiante', student.nombre, '- Enviados:', pushResult.sent, 'Fallidos:', pushResult.failed);
          } catch (pushError) {
            console.error('🔔 [SEND NOTIFICATION] Error enviando push para estudiante', student.nombre, ':', pushError.message);
          }
        }
      } else {
        console.log('🔔 [SEND NOTIFICATION] No se encontraron estudiantes en los destinatarios');
      }
    }

    // Populate sender info
    await notification.populate('sender', 'name email');
    await notification.populate('account', 'nombre');
    await notification.populate('division', 'nombre');
    // Recipients pueden ser estudiantes o usuarios, se poblarán según corresponda

    const responseData = {
      success: true,
      message: 'Notificación enviada exitosamente',
      data: {
        _id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        sender: notification.sender,
        account: notification.account,
        division: notification.division,
        recipients: notification.recipients,
        readBy: notification.readBy,
        status: notification.status,
        priority: notification.priority,
        sentAt: notification.sentAt,
        createdAt: notification.createdAt,
        updatedAt: notification.updatedAt
      }
    };

    console.log('🔔 [SEND NOTIFICATION] Respuesta exitosa:', JSON.stringify(responseData, null, 2));
    res.status(201).json(responseData);

  } catch (error) {
    console.error('❌ [SEND NOTIFICATION] Error completo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al enviar notificación'
    });
  }
};

/**
 * Obtener usuarios disponibles para enviar notificaciones
 */
const getRecipients = async (req, res) => {
  try {
    const { accountId, divisionId } = req.query;
    
    console.log('🔔 [GET RECIPIENTS] Parámetros:', { accountId, divisionId });
    
    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'accountId es requerido'
      });
    }
    
    // Buscar usuarios asociados a la cuenta/división
    let query = { account: accountId };
    
    if (divisionId) {
      query.division = divisionId;
    }
    
    const associations = await Shared.find(query)
      .populate('user', 'name email')
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('role', 'nombre');
    
    // Filtrar asociaciones que tengan usuario, cuenta y rol válidos
    const recipients = associations
      .filter(assoc => assoc.user && assoc.account && assoc.role)
      .map(assoc => ({
        _id: assoc.user._id,
        nombre: assoc.user.name || 'Sin nombre', // User model usa 'name', no 'nombre'
        email: assoc.user.email || 'Sin email',
        role: {
          nombre: assoc.role.nombre || 'Sin rol'
        },
        account: assoc.account.nombre || 'Sin cuenta',
        division: assoc.division?.nombre || 'Sin división'
      }));
    
    console.log('🔔 [GET RECIPIENTS] Destinatarios encontrados:', recipients.length);
    
    res.json({
      success: true,
      data: recipients
    });
    
  } catch (error) {
    console.error('❌ [GET RECIPIENTS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener destinatarios'
    });
  }
};

module.exports = {
  getCalendarNotifications,
  getNotifications,
  getFamilyNotifications,
  getNotificationDetails,
  markNotificationAsRead,
  deleteNotification,
  getUnreadCount,
  getFamilyUnreadCount,
  getBackofficeNotifications,
  sendNotification,
  getRecipients
};

