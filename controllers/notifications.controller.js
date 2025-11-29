const mongoose = require('mongoose');
const Notification = require('../shared/models/Notification');
const User = require('../shared/models/User');
const Student = require('../shared/models/Student');
const Shared = require('../shared/models/Shared');
const ActiveAssociation = require('../shared/models/ActiveAssociation');
const Device = require('../shared/models/Device');
const Role = require('../shared/models/Role');

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

// Función helper para enviar push notifications usando SQS
const { sendPushToStudentFamilyToQueue } = require('../services/sqsPushService');

const sendPushNotificationToStudentFamily = async function(studentId, notification) {
  try {
    console.log('🔔 [PUSH SEND] Enviando push notification a cola SQS para estudiante:', studentId);
    
    const pushNotification = {
      title: notification.title,
      message: notification.message,
      data: {
        type: 'notification',
        notificationId: notification._id,
        studentId: studentId,
        priority: notification.priority || 'normal'
      },
      badge: 1,
      sound: 'default'
    };
    
    const result = await sendPushToStudentFamilyToQueue(studentId, pushNotification);
    
    if (result.success) {
      console.log('🔔 [PUSH SEND] ✅ Push notification enviado a cola SQS - MessageId:', result.messageId);
      return { sent: 1, failed: 0, queued: true };
    } else {
      console.error('🔔 [PUSH SEND] ❌ Error enviando a cola SQS:', result.error);
      return { sent: 0, failed: 1, queued: false };
    }
  } catch (error) {
    console.error('🔔 [PUSH SEND] Error general:', error);
    return { sent: 0, failed: 1, queued: false };
  }
};

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
      limit = 10000, // Límite muy alto para mostrar todas las notificaciones
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
    
    // Poblar recipients con información completa (estudiantes y usuarios) para todos los roles
    // Recopilar todos los recipient IDs de todas las notificaciones
    const allRecipientIds = [];
    notifications.forEach((notification, index) => {
      console.log(`🔍 [GET NOTIFICATIONS] Notificación ${index + 1}:`, {
        id: notification._id,
        recipientsCount: notification.recipients?.length || 0,
        recipients: notification.recipients?.map(r => {
          if (typeof r === 'object' && r._id) {
            return r._id.toString();
          }
          return r.toString();
        }) || []
      });
      if (notification.recipients && notification.recipients.length > 0) {
        notification.recipients.forEach(r => {
          const recipientId = r._id || r;
          if (recipientId) {
            allRecipientIds.push(recipientId);
          }
        });
      }
    });
    
    console.log('🔍 [GET NOTIFICATIONS] Total recipient IDs recopilados:', allRecipientIds.length);
    
    // Hacer consultas en batch para estudiantes y usuarios
    const uniqueRecipientIds = [...new Set(allRecipientIds.map(id => id.toString()))];
    
    // También obtener los IDs de los emisores para poblar su información
    const senderIds = notifications.map(n => n.sender?.toString() || n.sender).filter(Boolean);
    
    // Convertir IDs a ObjectId para las consultas
    const recipientObjectIds = uniqueRecipientIds
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));
    const senderObjectIds = senderIds
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));
    const allUserObjectIds = [...new Set([...recipientObjectIds, ...senderObjectIds])];
    
    // Primero identificar qué son estudiantes y qué son usuarios
    const [students, allUsers] = await Promise.all([
      Student.find({ _id: { $in: recipientObjectIds } }).select('_id nombre apellido email'),
      User.find({ _id: { $in: allUserObjectIds } }).select('_id name email')
    ]);
    
    const studentsMap = new Map(students.map(s => [s._id.toString(), s]));
    const usersMap = new Map(allUsers.map(u => [u._id.toString(), u]));
    
    // Identificar qué recipients son estudiantes (no están en usersMap)
    const studentRecipientIds = uniqueRecipientIds.filter(id => 
      studentsMap.has(id) && !usersMap.has(id)
    );
    
    console.log('🔍 [POPULATE] Total unique recipient IDs:', uniqueRecipientIds.length);
    console.log('🔍 [POPULATE] Recipients que son estudiantes:', studentRecipientIds.length);
    console.log('🔍 [POPULATE] Recipients que son usuarios:', uniqueRecipientIds.filter(id => usersMap.has(id)).length);
    console.log('🔍 [POPULATE] Estudiantes en studentsMap:', studentsMap.size);
    console.log('🔍 [POPULATE] Usuarios en usersMap:', usersMap.size);
    
    // Obtener roles de tutores primero
    const tutorRoles = await Role.find({ nombre: { $in: ['familyadmin', 'familyviewer'] } }).select('_id');
    const tutorRoleIds = tutorRoles.map(r => r._id);
    
    // Obtener asociaciones de tutores con estudiantes para identificar tutores
    // 1. Para identificar tutores que son emisores o receptores directos (usuarios)
    const tutorUserIds = [...new Set([...senderIds, ...uniqueRecipientIds.filter(id => usersMap.has(id))])];
    const tutorUserObjectIds = tutorUserIds
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));
    
    console.log('🔍 [POPULATE] Tutor user IDs para buscar asociaciones:', tutorUserIds);
    console.log('🔍 [POPULATE] Tutor user ObjectIds:', tutorUserObjectIds.map(id => id.toString()));
    
    const tutorAssociationsForUsers = tutorUserObjectIds.length > 0 ? await Shared.find({
      user: { $in: tutorUserObjectIds },
      role: { $in: tutorRoleIds },
      status: { $in: ['active', 'pending'] }
    }).populate('student', 'nombre apellido').select('user student status') : [];
    
    console.log('🔍 [POPULATE] Asociaciones encontradas para usuarios tutores:', tutorAssociationsForUsers.length);
    
    // 2. Para identificar tutores asociados a estudiantes que son recipients
    // Convertir IDs de estudiantes a ObjectId si es necesario
    const studentObjectIds = studentRecipientIds.map(id => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        return new mongoose.Types.ObjectId(id);
      }
      return id;
    });
    
    const tutorAssociationsForStudents = studentRecipientIds.length > 0 ? await Shared.find({
      student: { $in: studentObjectIds },
      role: { $in: tutorRoleIds },
      status: { $in: ['active', 'pending'] }
    }).populate('user', 'name email').populate('student', 'nombre apellido').select('user student role status') : [];
    
    console.log('🔍 [POPULATE] IDs de estudiantes recipients:', studentRecipientIds);
    console.log('🔍 [POPULATE] IDs de estudiantes convertidos a ObjectId:', studentObjectIds.map(id => id.toString()));
    console.log('🔍 [POPULATE] Tutor role IDs buscados:', tutorRoleIds.map(id => id.toString()));
    console.log('🔍 [POPULATE] Asociaciones encontradas para estudiantes:', tutorAssociationsForStudents.length);
    if (tutorAssociationsForStudents.length > 0) {
      tutorAssociationsForStudents.forEach((assoc, idx) => {
        console.log(`🔍 [POPULATE] Asociación ${idx + 1}:`, {
          studentId: assoc.student?._id?.toString(),
          studentNombre: assoc.student?.nombre,
          tutorId: assoc.user?._id?.toString(),
          tutorNombre: assoc.user?.name || assoc.user?.nombre,
          status: assoc.status
        });
      });
    } else {
      console.log('⚠️ [POPULATE] NO se encontraron asociaciones. Verificando consulta...');
      // Hacer una consulta de prueba sin filtros para ver qué hay
      const testQuery = await Shared.find({
        student: { $in: studentObjectIds }
      }).populate('user', 'name email').populate('student', 'nombre apellido').populate('role', 'nombre').select('user student role status').limit(5);
      console.log('🔍 [POPULATE] Consulta de prueba (sin filtro de rol):', testQuery.length, 'resultados');
      testQuery.forEach((assoc, idx) => {
        console.log(`🔍 [POPULATE] Test ${idx + 1}:`, {
          studentId: assoc.student?._id?.toString(),
          roleNombre: assoc.role?.nombre,
          status: assoc.status
        });
      });
    }
    
    // Combinar ambas asociaciones
    const allTutorAssociations = [...tutorAssociationsForUsers, ...tutorAssociationsForStudents];
    
    // Crear mapa de tutor -> estudiante (para emisores/receptores que son tutores)
    const tutorStudentMap = new Map();
    tutorAssociationsForUsers.forEach(assoc => {
      if (assoc.user && assoc.student) {
        tutorStudentMap.set(assoc.user._id.toString(), {
          nombre: assoc.student.nombre,
          apellido: assoc.student.apellido
        });
      }
    });
    
    // Crear mapa de estudiante -> tutores (para recipients que son estudiantes)
    const studentTutorsMap = new Map();
    console.log('🔍 [POPULATE] Asociaciones de tutores para estudiantes:', tutorAssociationsForStudents.length);
    tutorAssociationsForStudents.forEach(assoc => {
      if (assoc.student && assoc.user) {
        const studentId = assoc.student._id.toString();
        console.log('🔍 [POPULATE] Asociación encontrada - Estudiante:', studentId, 'Tutor:', assoc.user.name || assoc.user.nombre);
        if (!studentTutorsMap.has(studentId)) {
          studentTutorsMap.set(studentId, []);
        }
        studentTutorsMap.get(studentId).push({
          user: assoc.user,
          student: assoc.student
        });
      }
    });
    
    console.log('🔍 [POPULATE] Mapa estudiante->tutores creado con', studentTutorsMap.size, 'estudiantes');
    
    // Poblar recipients y sender para cada notificación
    const populatedNotifications = notifications.map(notification => {
      let notificationObj = notification.toObject();
      
      // Poblar sender con información del estudiante si es tutor
      if (notificationObj.sender) {
        const senderId = notificationObj.sender._id ? notificationObj.sender._id.toString() : notificationObj.sender.toString();
        const sender = usersMap.get(senderId);
        if (sender) {
          const senderObj = sender.toObject();
          senderObj.nombre = senderObj.name;
          // Si el sender es tutor, agregar información del estudiante
          const studentInfo = tutorStudentMap.get(senderId);
          if (studentInfo) {
            senderObj.associatedStudent = studentInfo;
          }
          notificationObj.sender = senderObj;
        }
      }
      
      if (notification.recipients && notification.recipients.length > 0) {
        const populatedRecipients = [];
        
        console.log('🔍 [POPULATE] Procesando recipients para notificación:', notificationObj._id);
        console.log('🔍 [POPULATE] Recipients raw:', notification.recipients);
        
        for (const recipientId of notification.recipients) {
          // Manejar diferentes formatos de recipientId
          let id;
          if (typeof recipientId === 'object' && recipientId !== null) {
            if (recipientId._id) {
              id = recipientId._id.toString();
            } else if (recipientId.toString) {
              id = recipientId.toString();
            } else {
              console.log('⚠️ [POPULATE] Recipient ID en formato desconocido:', recipientId);
              continue;
            }
          } else if (typeof recipientId === 'string') {
            id = recipientId;
          } else {
            id = recipientId.toString();
          }
          
          console.log('🔍 [POPULATE] Procesando recipient ID:', id, 'Tipo:', typeof recipientId);
          
          // Buscar primero en estudiantes
          let recipient = studentsMap.get(id);
          if (recipient) {
            console.log('✅ [POPULATE] Recipient es estudiante:', recipient.nombre, recipient.apellido);
            // Si el recipient es un estudiante, buscar a los tutores asociados
            const studentObj = recipient.toObject();
            const studentFullName = `${studentObj.nombre} ${studentObj.apellido}`.trim();
            
            // Buscar tutores asociados a este estudiante usando el mapa
            const tutorsForStudent = studentTutorsMap.get(id) || [];
            
            console.log('🔍 [POPULATE] Tutores encontrados para estudiante:', tutorsForStudent.length);
            
            if (tutorsForStudent.length > 0) {
              // Si hay tutores asociados, crear un receptor por cada tutor
              tutorsForStudent.forEach(tutorAssoc => {
                if (tutorAssoc.user) {
                  const tutorUser = tutorAssoc.user;
                  console.log('✅ [POPULATE] Agregando tutor como receptor:', tutorUser.name || tutorUser.nombre);
                  const tutorObj = {
                    _id: tutorUser._id,
                    nombre: tutorUser.name || tutorUser.nombre,
                    email: tutorUser.email,
                    associatedStudent: {
                      nombre: studentObj.nombre,
                      apellido: studentObj.apellido
                    }
                  };
                  populatedRecipients.push(tutorObj);
                }
              });
            } else {
              console.log('⚠️ [POPULATE] No se encontraron tutores para el estudiante, mostrando estudiante directamente');
              // Si no hay tutores asociados, mostrar el estudiante directamente
              const recipientObj = studentObj;
              recipientObj.nombre = studentFullName;
              recipientObj.apellido = studentObj.apellido;
              populatedRecipients.push(recipientObj);
            }
            continue;
          }
          
          // Si no es estudiante, buscar en usuarios
          recipient = usersMap.get(id);
          if (recipient) {
            console.log('✅ [POPULATE] Recipient es usuario:', recipient.name);
            const recipientObj = recipient.toObject();
            recipientObj.nombre = recipientObj.name;
            // Si el receptor es tutor, agregar información del estudiante
            const studentInfo = tutorStudentMap.get(id);
            if (studentInfo) {
              console.log('✅ [POPULATE] Usuario es tutor, agregando estudiante asociado');
              recipientObj.associatedStudent = studentInfo;
            }
            populatedRecipients.push(recipientObj);
            continue;
          }
          
          console.log('⚠️ [POPULATE] Recipient no encontrado ni como estudiante ni como usuario:', id);
        }
        
        console.log('🔍 [POPULATE] Recipients poblados:', populatedRecipients.length);
        notificationObj.recipients = populatedRecipients;
      } else {
        console.log('⚠️ [POPULATE] Notificación sin recipients:', notificationObj._id);
      }
      
      return notificationObj;
    });
    
    notifications = populatedNotifications;
    
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
      limit = 10000, // Límite muy alto para mostrar todas las notificaciones
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
    
    // Obtener la asociación activa del usuario usando el método estático que ya hace populate
    const activeAssociation = await ActiveAssociation.getActiveAssociation(userId);
    console.log('🔔 [GET FAMILY NOTIFICATIONS] Buscando ActiveAssociation para userId:', userId);
    console.log('🔔 [GET FAMILY NOTIFICATIONS] ActiveAssociation encontrada:', activeAssociation ? {
      id: activeAssociation._id,
      student: activeAssociation.student?._id || activeAssociation.student,
      activeShared: activeAssociation.activeShared?._id || activeAssociation.activeShared,
      role: activeAssociation.role?.nombre,
      account: activeAssociation.account?._id || activeAssociation.account
    } : null);
    
    // Verificar que haya asociación activa y estudiante
    // El modelo ActiveAssociation tiene student directamente, pero también puede estar en activeShared si se hace populate
    let studentId = null;
    
    if (activeAssociation) {
      // Intentar obtener student de diferentes formas
      if (activeAssociation.student) {
        studentId = activeAssociation.student._id || activeAssociation.student;
      } else if (activeAssociation.activeShared && activeAssociation.activeShared.student) {
        // Si activeShared está populado, puede tener student
        studentId = activeAssociation.activeShared.student._id || activeAssociation.activeShared.student;
      }
    }
    
    if (!activeAssociation || !studentId) {
      console.log('🔔 [GET FAMILY NOTIFICATIONS] No hay asociación activa o estudiante activo');
      return res.json({
        success: true,
        data: []
      });
    }
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
      // Usar $not con $elemMatch para verificar que el usuario NO está en el array readBy
      query.$or = [
        { readBy: { $exists: false } },
        { readBy: { $size: 0 } },
        { readBy: { $not: { $elemMatch: { user: userId } } } }
      ];
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

    // Poblar readBy.user manualmente para asegurar que tenga el campo nombre y role
    if (notificationObj.readBy && notificationObj.readBy.length > 0) {
      const populatedReadBy = [];
      
      for (let readEntry of notificationObj.readBy) {
        if (readEntry.user && readEntry.user._id) {
          // Buscar el usuario completo con role
          const user = await User.findById(readEntry.user._id)
            .select('name email')
            .populate('role', 'nombre');
          if (user) {
            populatedReadBy.push({
              user: {
                _id: user._id,
                nombre: user.name, // User model usa 'name', no 'nombre'
                email: user.email,
                role: user.role ? {
                  _id: user.role._id,
                  nombre: user.role.nombre
                } : null
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
    const { accountId, divisionId } = req.query; // Aceptar filtros opcionales
    
    console.log('🔔 [UNREAD COUNT] Usuario:', userId);
    console.log('🔔 [UNREAD COUNT] Filtros - accountId:', accountId, 'divisionId:', divisionId);
    
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
    
    // Obtener asociaciones del usuario, filtrando por accountId si se proporciona
    const associationQuery = { 
      user: userId, 
      status: 'active' 
    };
    
    if (accountId) {
      associationQuery.account = accountId;
    }
    
    if (divisionId) {
      associationQuery.division = divisionId;
    }
    
    const userAssociations = await Shared.find(associationQuery)
      .populate('account division student');
    
    if (userAssociations.length === 0) {
      console.log('🔔 [UNREAD COUNT] No se encontraron asociaciones activas con los filtros');
      return res.json({
        success: true,
        data: { count: 0 }
      });
    }
    
    // Obtener IDs de estudiantes asociados
    const studentIds = userAssociations
      .map(assoc => assoc.student?._id)
      .filter(id => id); // Filtrar IDs válidos
    
    console.log('🔔 [UNREAD COUNT] Estudiantes asociados:', studentIds.length);
    
    if (studentIds.length === 0) {
      console.log('🔔 [UNREAD COUNT] No hay estudiantes válidos asociados');
      return res.json({
        success: true,
        data: { count: 0 }
      });
    }
    
    // Obtener IDs de cuentas del usuario (ya filtradas si se proporcionó accountId)
    const accountIds = userAssociations.map(assoc => assoc.account._id);
    
    console.log('🔔 [UNREAD COUNT] Cuentas del usuario:', accountIds.length);
    
    // Construir query para notificaciones
    // Usar $not con $elemMatch para verificar que el usuario NO está en el array readBy
    const query = {
      account: { $in: accountIds },
      recipients: { $in: studentIds }, // Notificaciones dirigidas a los estudiantes asociados
      $or: [
        { readBy: { $exists: false } },
        { readBy: { $size: 0 } },
        { readBy: { $not: { $elemMatch: { user: userId } } } }
      ]
    };
    
    // Agregar filtro de división si se proporciona
    if (divisionId) {
      query.division = divisionId;
    }
    
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
    const { accountId, divisionId } = req.query;
    
    console.log('🔔 [FAMILY UNREAD COUNT] Usuario:', userId);
    console.log('🔔 [FAMILY UNREAD COUNT] AccountId:', accountId, 'DivisionId:', divisionId);
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Obtener la asociación activa del usuario usando el método estático
    const activeAssociation = await ActiveAssociation.getActiveAssociation(userId);
    
    if (!activeAssociation) {
      console.log('🔔 [FAMILY UNREAD COUNT] No hay asociación activa');
      return res.json({
        success: true,
        data: { count: 0 }
      });
    }
    
    // Obtener el estudiante activo de la asociación
    let studentId = null;
    if (activeAssociation.student) {
      studentId = activeAssociation.student._id || activeAssociation.student;
    } else if (activeAssociation.activeShared) {
      // Si activeShared está populado, puede tener student
      const shared = await Shared.findById(activeAssociation.activeShared).populate('student');
      if (shared && shared.student) {
        studentId = shared.student._id || shared.student;
      }
    }
    
    if (!studentId) {
      console.log('🔔 [FAMILY UNREAD COUNT] No hay estudiante activo');
      return res.json({
        success: true,
        data: { count: 0 }
      });
    }
    
    console.log('🔔 [FAMILY UNREAD COUNT] Estudiante activo:', studentId);
    
    // Construir query para notificaciones
    // Usar $not con $elemMatch para verificar que el usuario NO está en el array readBy
    let query = {
      recipients: studentId,
      $or: [
        { readBy: { $exists: false } },
        { readBy: { $size: 0 } },
        { readBy: { $not: { $elemMatch: { user: userId } } } }
      ]
    };
    
    // Filtrar por accountId si se proporciona
    if (accountId) {
      query.account = accountId;
    }
    
    // Filtrar por divisionId si se proporciona
    if (divisionId) {
      query.division = divisionId;
    }
    
    // Construir query base para obtener todas las notificaciones del estudiante
    const baseQuery = {
      recipients: studentId
    };
    
    if (accountId) {
      baseQuery.account = accountId;
    }
    
    if (divisionId) {
      baseQuery.division = divisionId;
    }
    
    console.log('🔔 [FAMILY UNREAD COUNT] Query base:', JSON.stringify(baseQuery, null, 2));
    
    // Obtener todas las notificaciones que coinciden con los filtros
    const allMatchingNotifications = await Notification.find(baseQuery)
      .select('_id title readBy');
    
    console.log('🔔 [FAMILY UNREAD COUNT] Total notificaciones del estudiante:', allMatchingNotifications.length);
    
    // Contar manualmente las no leídas por este usuario específico
    let unreadCount = 0;
    for (const notif of allMatchingNotifications) {
      const isRead = notif.readBy && notif.readBy.some((read) => {
        // read.user puede ser ObjectId o objeto populado
        const readUserId = read.user?._id?.toString() || read.user?.toString();
        const currentUserId = userId.toString();
        return readUserId === currentUserId;
      });
      if (!isRead) {
        unreadCount++;
      }
    }
    
    console.log('🔔 [FAMILY UNREAD COUNT] Conteo final (manual):', unreadCount);
    
    res.json({
      success: true,
      data: { count: unreadCount }
    });
    
  } catch (error) {
    console.error('❌ [FAMILY UNREAD COUNT] Error:', error);
    console.error('❌ [FAMILY UNREAD COUNT] Stack:', error.stack);
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
      limit = 10000, // Límite muy alto para mostrar todas las notificaciones
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

