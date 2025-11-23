const formRequestService = require('../services/formRequestService');
const Student = require('../shared/models/Student');
const Notification = require('../shared/models/Notification');

// Importar función de push notifications
const Device = require('../shared/models/Device');
const Shared = require('../shared/models/Shared');

// Función helper para obtener usuarios familiares de un estudiante
async function getFamilyUsersForStudent(studentId) {
  try {
    console.log('🔔 [FAMILY LOOKUP] Buscando familiares para estudiante:', studentId);
    
    const associations = await Shared.find({
      student: studentId,
      status: 'active',
      'role.nombre': { $in: ['familyadmin', 'familyviewer'] }
    }).populate('user', 'name email').populate('role', 'nombre');
    
    console.log('🔔 [FAMILY LOOKUP] Asociaciones encontradas:', associations.length);
    
    const familyUsers = [];
    
    for (const association of associations) {
      if (association.user && association.role) {
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
    console.error('❌ [FAMILY LOOKUP] Error obteniendo usuarios familiares:', error);
    return [];
  }
}

// Función para enviar push notifications
let sendPushNotificationToStudentFamily;
try {
  const pushNotificationService = require('../pushNotificationService');
  
  sendPushNotificationToStudentFamily = async function(studentId, notification) {
    try {
      console.log('🔔 [PUSH SEND] Enviando push notification para estudiante:', studentId);
      
      const familyUsers = await getFamilyUsersForStudent(studentId);
      
      if (familyUsers.length === 0) {
        console.log('🔔 [PUSH SEND] No se encontraron usuarios familiares con dispositivos');
        return { sent: 0, failed: 0 };
      }
      
      let sent = 0;
      let failed = 0;
      
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
            
            if (device.updateLastUsed) {
              await device.updateLastUsed();
            }
            
            sent++;
            console.log('🔔 [PUSH SEND] ✅ Enviado a:', familyUser.user.name, '-', device.platform);
            
          } catch (error) {
            failed++;
            console.error('🔔 [PUSH SEND] ❌ Error enviando a:', familyUser.user.name, '-', error.message);
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
  console.warn('⚠️ [FORM-REQUESTS] pushNotificationService no disponible:', error.message);
  sendPushNotificationToStudentFamily = async function(studentId, notification) {
    console.warn('⚠️ [PUSH SEND] Push notifications no disponibles');
    return { sent: 0, failed: 0 };
  };
}

/**
 * Crear formulario (Backoffice)
 */
const createFormRequest = async (req, res) => {
  try {
    const { nombre, descripcion, status, preguntas } = req.body;
    const user = req.user;
    
    // Verificar permisos: adminaccount, superadmin o coordinador
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear formularios'
      });
    }

    // Obtener accountId según el rol
    let accountId = req.userInstitution?._id;
    if (roleName === 'superadmin' && req.body.account) {
      accountId = req.body.account;
    }
    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo determinar la institución'
      });
    }

    const formRequest = await formRequestService.createFormRequest({
      nombre,
      descripcion,
      account: accountId,
      createdBy: user._id,
      status: status || 'borrador',
      preguntas
    });

    res.json({
      success: true,
      message: 'Formulario creado exitosamente',
      data: formRequest
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error creando formulario:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al crear formulario'
    });
  }
};

/**
 * Listar formularios de institución (Backoffice)
 */
const getFormRequestsByAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { status } = req.query;
    const user = req.user;
    
    // Verificar permisos
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver formularios'
      });
    }

    // Verificar acceso a la cuenta (si no es superadmin)
    if (roleName !== 'superadmin') {
      const userAccountId = req.userInstitution?._id?.toString();
      if (userAccountId !== accountId) {
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a esta institución'
        });
      }
    }

    const formRequests = await formRequestService.getFormRequestsByAccount(accountId, status);

    // Obtener divisiones asociadas para cada formulario
    const formRequestsWithDivisions = await Promise.all(
      formRequests.map(async (form) => {
        const divisions = await formRequestService.getDivisionsByFormRequest(form._id);
        return {
          ...form.toObject(),
          divisions: divisions.map(d => ({
            _id: d.division._id,
            nombre: d.division.nombre,
            requerido: d.requerido
          }))
        };
      })
    );

    res.json({
      success: true,
      data: formRequestsWithDivisions
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error obteniendo formularios:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener formularios'
    });
  }
};

/**
 * Obtener formulario por ID (Backoffice)
 */
const getFormRequestById = async (req, res) => {
  try {
    const { formId } = req.params;
    const user = req.user;
    
    // Verificar permisos
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver formularios'
      });
    }

    const formRequest = await formRequestService.getFormRequestById(formId);
    
    // Verificar acceso a la cuenta (si no es superadmin)
    if (roleName !== 'superadmin') {
      const userAccountId = req.userInstitution?._id?.toString();
      const formAccountId = formRequest.account._id?.toString();
      if (userAccountId !== formAccountId) {
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a este formulario'
        });
      }
    }

    // Obtener divisiones asociadas
    const divisions = await formRequestService.getDivisionsByFormRequest(formId);

    res.json({
      success: true,
      data: {
        ...formRequest.toObject(),
        divisions: divisions.map(d => ({
          _id: d.division._id,
          nombre: d.division.nombre,
          requerido: d.requerido
        }))
      }
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error obteniendo formulario:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener formulario'
    });
  }
};

/**
 * Actualizar formulario (Backoffice)
 */
const updateFormRequest = async (req, res) => {
  try {
    const { formId } = req.params;
    const { nombre, descripcion, status, preguntas } = req.body;
    const user = req.user;
    
    // Verificar permisos
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar formularios'
      });
    }

    // Verificar acceso al formulario
    const existingForm = await formRequestService.getFormRequestById(formId);
    if (roleName !== 'superadmin') {
      const userAccountId = req.userInstitution?._id?.toString();
      const formAccountId = existingForm.account._id?.toString();
      if (userAccountId !== formAccountId) {
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a este formulario'
        });
      }
    }

    const updateData = {};
    if (nombre !== undefined) updateData.nombre = nombre;
    if (descripcion !== undefined) updateData.descripcion = descripcion;
    if (status !== undefined) updateData.status = status;
    if (preguntas !== undefined) updateData.preguntas = preguntas;

    const formRequest = await formRequestService.updateFormRequest(formId, updateData);

    res.json({
      success: true,
      message: 'Formulario actualizado exitosamente',
      data: formRequest
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error actualizando formulario:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al actualizar formulario'
    });
  }
};

/**
 * Eliminar formulario (Backoffice)
 */
const deleteFormRequest = async (req, res) => {
  try {
    const { formId } = req.params;
    const user = req.user;
    
    // Verificar permisos
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar formularios'
      });
    }

    // Verificar acceso al formulario
    const existingForm = await formRequestService.getFormRequestById(formId);
    if (roleName !== 'superadmin') {
      const userAccountId = req.userInstitution?._id?.toString();
      const formAccountId = existingForm.account._id?.toString();
      if (userAccountId !== formAccountId) {
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a este formulario'
        });
      }
    }

    await formRequestService.deleteFormRequest(formId);

    res.json({
      success: true,
      message: 'Formulario eliminado exitosamente'
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error eliminando formulario:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al eliminar formulario'
    });
  }
};

/**
 * Asociar formulario a división (Backoffice)
 */
const associateFormToDivision = async (req, res) => {
  try {
    const { formId } = req.params;
    const { divisionId, requerido } = req.body;
    const user = req.user;
    
    console.log('📋 [FORM-ASSOCIATE] Iniciando asociación:', { formId, divisionId, requerido, userId: user._id });
    
    // Validar que divisionId esté presente
    if (!divisionId) {
      return res.status(400).json({
        success: false,
        message: 'El ID de la división es requerido'
      });
    }
    
    // Verificar permisos
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para asociar formularios'
      });
    }

    // Verificar acceso al formulario
    const existingForm = await formRequestService.getFormRequestById(formId);
    if (!existingForm) {
      return res.status(404).json({
        success: false,
        message: 'Formulario no encontrado'
      });
    }

    console.log('📋 [FORM-ASSOCIATE] Formulario encontrado:', { 
      formId: existingForm._id, 
      status: existingForm.status,
      account: existingForm.account 
    });

    if (roleName !== 'superadmin') {
      const userAccountId = req.userInstitution?._id?.toString();
      const formAccountId = existingForm.account?._id?.toString() || existingForm.account?.toString();
      console.log('📋 [FORM-ASSOCIATE] Verificando acceso:', { userAccountId, formAccountId });
      if (userAccountId !== formAccountId) {
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a este formulario'
        });
      }
    }

    // Verificar que el formulario esté publicado
    if (existingForm.status !== 'publicado') {
      console.log('📋 [FORM-ASSOCIATE] Formulario no publicado:', existingForm.status);
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden asociar formularios publicados'
      });
    }

    // Obtener accountId
    let accountId = req.userInstitution?._id;
    if (roleName === 'superadmin') {
      accountId = existingForm.account?._id || existingForm.account;
    }

    console.log('📋 [FORM-ASSOCIATE] accountId determinado:', { 
      accountId, 
      accountIdType: typeof accountId,
      roleName,
      userInstitutionId: req.userInstitution?._id,
      formAccountId: existingForm.account?._id || existingForm.account
    });

    if (!accountId) {
      console.error('❌ [FORM-ASSOCIATE] accountId no encontrado:', { 
        roleName, 
        userInstitution: req.userInstitution, 
        formAccount: existingForm.account 
      });
      return res.status(400).json({
        success: false,
        message: 'No se pudo determinar la institución'
      });
    }

    console.log('📋 [FORM-ASSOCIATE] Datos validados:', { formId, divisionId, accountId, requerido, createdBy: user._id });

    let association;
    try {
      association = await formRequestService.associateFormToDivision(
        formId,
        divisionId,
        accountId,
        requerido || false,
        user._id
      );
      console.log('📋 [FORM-ASSOCIATE] Asociación creada exitosamente:', association._id);
    } catch (serviceError) {
      console.error('❌ [FORM-ASSOCIATE] Error en servicio:', serviceError);
      return res.status(400).json({
        success: false,
        message: serviceError.message || 'Error al asociar formulario a división'
      });
    }

    // Enviar notificaciones a tutores de la división
    try {
      console.log('📋 [FORM-ASSOCIATE] Enviando notificaciones a tutores de la división:', divisionId);
      
      // Obtener todos los estudiantes de la división
      const students = await Student.find({
        division: divisionId,
        activo: true
      });

      console.log('📋 [FORM-ASSOCIATE] Estudiantes encontrados:', students.length);

      if (students.length > 0) {
        // Crear notificación para todos los estudiantes
        const studentIds = students.map(student => student._id);
        const formRequest = await formRequestService.getFormRequestById(formId);
        
        const notification = new Notification({
          title: `Nuevo formulario: ${formRequest.nombre}`,
          message: `${formRequest.descripcion || 'Hay un nuevo formulario disponible para completar.'}\n\n${requerido ? '⚠️ Este formulario es requerido y debe ser completado.' : ''}`,
          type: 'informacion',
          sender: user._id,
          account: accountId,
          division: divisionId,
          recipients: studentIds,
          status: 'sent',
          priority: requerido ? 'high' : 'normal'
        });

        await notification.save();
        console.log('📋 [FORM-ASSOCIATE] Notificación creada para', studentIds.length, 'estudiantes');

        // Enviar push notifications a tutores
        let totalSent = 0;
        let totalFailed = 0;

        for (const studentId of studentIds) {
          try {
            const pushResult = await sendPushNotificationToStudentFamily(studentId, notification);
            totalSent += pushResult.sent;
            totalFailed += pushResult.failed;
            console.log('📋 [FORM-ASSOCIATE] Push para estudiante', studentId, '- Enviados:', pushResult.sent, 'Fallidos:', pushResult.failed);
          } catch (pushError) {
            console.error('📋 [FORM-ASSOCIATE] Error enviando push para estudiante', studentId, ':', pushError.message);
            totalFailed++;
          }
        }

        console.log('📋 [FORM-ASSOCIATE] Resumen push notifications - Total enviados:', totalSent, 'Total fallidos:', totalFailed);
      }
    } catch (notificationError) {
      console.error('❌ [FORM-ASSOCIATE] Error enviando notificaciones:', notificationError);
      // No fallar la asociación si fallan las notificaciones
    }

    res.json({
      success: true,
      message: 'Formulario asociado a división exitosamente',
      data: association
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error asociando formulario:', error);
    const statusCode = error.message?.includes('no encontrado') || error.message?.includes('requerido') || error.message?.includes('No se pudo') ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error al asociar formulario'
    });
  }
};

/**
 * Ver respuestas de un formulario (Backoffice)
 */
const getFormResponses = async (req, res) => {
  try {
    const { formId } = req.params;
    const { divisionId } = req.query;
    const user = req.user;
    
    // Verificar permisos
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver respuestas'
      });
    }

    const responses = await formRequestService.getFormResponses(formId, divisionId);

    res.json({
      success: true,
      data: responses
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error obteniendo respuestas:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener respuestas'
    });
  }
};

/**
 * Ver todas las respuestas de una división (Backoffice)
 */
const getFormResponsesByDivision = async (req, res) => {
  try {
    const { divisionId } = req.params;
    const user = req.user;
    
    // Verificar permisos
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver respuestas'
      });
    }

    const responses = await formRequestService.getFormResponsesByDivision(divisionId);

    res.json({
      success: true,
      data: responses
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error obteniendo respuestas por división:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener respuestas'
    });
  }
};

/**
 * Obtener formularios pendientes (App Móvil)
 */
const getPendingFormsForTutor = async (req, res) => {
  try {
    const { tutorId, studentId } = req.params;
    const user = req.user;
    
    console.log('📋 [FORM-REQUESTS] Obteniendo formularios pendientes:', {
      tutorId,
      studentId,
      userId: user._id,
      userRole: user.role?.nombre || user.role
    });
    
    // Verificar que el usuario es el tutor
    if (user._id.toString() !== tutorId) {
      console.log('❌ [FORM-REQUESTS] Usuario no coincide con tutorId');
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver estos formularios'
      });
    }

    // Verificar que el usuario es familyadmin
    const roleName = user.role?.nombre || user.role;
    if (roleName !== 'familyadmin') {
      console.log('❌ [FORM-REQUESTS] Usuario no es familyadmin:', roleName);
      return res.status(403).json({
        success: false,
        message: 'Solo los tutores pueden ver formularios pendientes'
      });
    }

    console.log('📋 [FORM-REQUESTS] Llamando a getPendingFormsForTutor...');
    const pendingForms = await formRequestService.getPendingFormsForTutor(tutorId, studentId);
    console.log('📋 [FORM-REQUESTS] Formularios pendientes encontrados:', pendingForms.length);

    res.json({
      success: true,
      data: pendingForms
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error obteniendo formularios pendientes:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener formularios pendientes'
    });
  }
};

/**
 * Obtener todos los formularios (pendientes y completados) (App Móvil)
 */
const getAllFormsForTutor = async (req, res) => {
  try {
    const { tutorId, studentId } = req.params;
    const user = req.user;
    
    console.log('📋 [FORM-REQUESTS] Obteniendo todos los formularios:', {
      tutorId,
      studentId,
      userId: user._id,
      userRole: user.role?.nombre || user.role
    });
    
    // Verificar que el usuario es el tutor
    if (user._id.toString() !== tutorId) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver estos formularios'
      });
    }

    // Verificar que el usuario es familyadmin
    const roleName = user.role?.nombre || user.role;
    if (roleName !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los tutores pueden ver formularios'
      });
    }

    console.log('📋 [FORM-REQUESTS] Llamando a getAllFormsForTutor...');
    const allForms = await formRequestService.getAllFormsForTutor(tutorId, studentId);
    console.log('📋 [FORM-REQUESTS] Formularios encontrados:', allForms.length);

    res.json({
      success: true,
      data: allForms
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error obteniendo formularios:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener formularios'
    });
  }
};

/**
 * Guardar/actualizar respuesta (App Móvil)
 */
const saveFormResponse = async (req, res) => {
  try {
    const { formId } = req.params;
    const { studentId, respuestas, completado } = req.body;
    const user = req.user;
    
    // Verificar que el usuario es familyadmin
    const roleName = user.role?.nombre || user.role;
    if (roleName !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los tutores pueden completar formularios'
      });
    }

    // Verificar que el estudiante pertenece al tutor
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado'
      });
    }

    if (student.tutor?.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para completar formularios de este estudiante'
      });
    }

    const formResponse = await formRequestService.saveFormResponse(
      formId,
      studentId,
      user._id,
      respuestas,
      completado || false
    );

    res.json({
      success: true,
      message: completado ? 'Formulario completado exitosamente' : 'Borrador guardado exitosamente',
      data: formResponse
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error guardando respuesta:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al guardar respuesta'
    });
  }
};

/**
 * Aprobar respuesta (Backoffice)
 */
const approveFormResponse = async (req, res) => {
  try {
    const { responseId } = req.params;
    const user = req.user;
    
    // Verificar permisos
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para aprobar respuestas'
      });
    }

    const formResponse = await formRequestService.approveFormResponse(responseId, user._id);

    res.json({
      success: true,
      message: 'Respuesta aprobada exitosamente',
      data: formResponse
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error aprobando respuesta:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al aprobar respuesta'
    });
  }
};

/**
 * Rechazar respuesta (Backoffice)
 */
const rejectFormResponse = async (req, res) => {
  try {
    const { responseId } = req.params;
    const { motivoRechazo } = req.body;
    const user = req.user;
    
    // Verificar permisos
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para rechazar respuestas'
      });
    }

    const formResponse = await formRequestService.rejectFormResponse(responseId, user._id, motivoRechazo || '');

    res.json({
      success: true,
      message: 'Respuesta rechazada. El tutor deberá completarla nuevamente.',
      data: formResponse
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error rechazando respuesta:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al rechazar respuesta'
    });
  }
};

/**
 * Obtener respuesta guardada (App Móvil)
 */
const getFormResponse = async (req, res) => {
  try {
    const { formId, studentId } = req.params;
    const user = req.user;
    
    // Verificar que el usuario es familyadmin
    const roleName = user.role?.nombre || user.role;
    if (roleName !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los tutores pueden ver respuestas'
      });
    }

    // Verificar que el estudiante pertenece al tutor
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado'
      });
    }

    if (student.tutor?.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver respuestas de este estudiante'
      });
    }

    const formResponse = await formRequestService.getFormResponse(formId, studentId, user._id);

    res.json({
      success: true,
      data: formResponse
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error obteniendo respuesta:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener respuesta'
    });
  }
};

/**
 * Verificar formularios requeridos pendientes (App Móvil)
 */
const checkRequiredFormsPending = async (req, res) => {
  try {
    const { tutorId, studentId } = req.params;
    const user = req.user;
    
    // Verificar que el usuario es el tutor
    if (user._id.toString() !== tutorId) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para verificar formularios'
      });
    }

    const hasRequiredPending = await formRequestService.checkRequiredFormsPending(tutorId, studentId);

    res.json({
      success: true,
      data: {
        hasRequiredPending
      }
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error verificando formularios requeridos:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al verificar formularios requeridos'
    });
  }
};

module.exports = {
  createFormRequest,
  getFormRequestsByAccount,
  getFormRequestById,
  updateFormRequest,
  deleteFormRequest,
  associateFormToDivision,
  getFormResponses,
  getFormResponsesByDivision,
  getPendingFormsForTutor,
  getAllFormsForTutor,
  saveFormResponse,
  approveFormResponse,
  rejectFormResponse,
  getFormResponse,
  checkRequiredFormsPending
};

