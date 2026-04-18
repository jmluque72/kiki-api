const Activity = require('../shared/models/Activity');
const User = require('../shared/models/User');
const Account = require('../shared/models/Account');
const Shared = require('../shared/models/Shared');
const AccountConfig = require('../shared/models/AccountConfig');
const ActivityFavorite = require('../shared/models/ActivityFavorite');
const Student = require('../shared/models/Student');
const ActiveAssociation = require('../shared/models/ActiveAssociation');
const { generateSignedUrl } = require('../config/s3.config');

/**
 * Listar actividades (backoffice)
 */
exports.listActivities = async (req, res) => {
  try {
    const { accountId, userId, tipo, entidad, fechaInicio, fechaFin, page = 1, limit = 50 } = req.query;
    const currentUser = req.user;

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver actividades'
      });
    }

    // Incluir actividades activas y en borrador para el backoffice
    let query = { 
      activo: true,
      $or: [
        { estado: { $exists: false } }, // Actividades sin estado (legacy)
        { estado: 'publicada' },
        { estado: 'borrador' }
      ]
    };

    // Filtro por cuenta según el rol del usuario
    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin puede ver todas las actividades
      if (accountId) {
        query.account = accountId;
      }
    } else if (currentUser.role?.nombre === 'adminaccount') {
      // Adminaccount solo puede ver actividades de sus cuentas
      if (req.userInstitution) {
        console.log('🏢 Institución del usuario:', req.userInstitution.nombre, req.userInstitution._id);
        
        query.account = req.userInstitution._id;
        
        if (accountId) {
          // Verificar que la cuenta solicitada pertenece al usuario
          if (accountId !== req.userInstitution._id.toString()) {
            return res.status(403).json({
              success: false,
              message: 'No tienes permisos para ver actividades de esta cuenta'
            });
          }
          query.account = accountId;
        }
      } else {
        console.log('⚠️ Usuario sin institución asignada');
        query.account = null; // No mostrar actividades
      }
    } else if (currentUser.role?.nombre === 'coordinador') {
      // Coordinador puede ver actividades de sus cuentas
      if (accountId) {
        query.account = accountId;
      }
    }

    // Filtros adicionales
    if (userId) {
      query.usuario = userId;
    }
    
    if (tipo) {
      query.tipo = tipo;
    }
    
    if (entidad) {
      query.entidad = entidad;
    }
    
    if (fechaInicio && fechaFin) {
      query.createdAt = {
        $gte: fechaInicio,
        $lte: fechaFin
      };
    }

    // Obtener datos reales de la base de datos
    const total = await Activity.countDocuments(query);
    const activities = await Activity.find(query)
      .populate('usuario', 'name email')
      .populate('account', 'nombre razonSocial')
      .sort({ createdAt: -1 })
      .limit(50); // Limitar a las últimas 50 actividades

    res.json({
      success: true,
      data: {
        activities: activities.map(activity => ({
          _id: activity._id,
          usuario: activity.usuario,
          account: activity.account,
          tipo: activity.tipo,
          entidad: activity.entidad,
          entidadId: activity.entidadId,
          descripcion: activity.descripcion,
          datos: activity.datos,
          ip: activity.ip,
          userAgent: activity.userAgent,
          activo: activity.activo,
          createdAt: activity.createdAt,
          updatedAt: activity.updatedAt
        })),
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error listando actividades:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Crear actividad
 */
exports.createActivity = async (req, res) => {
  try {
    const { titulo, participantes, descripcion, imagenes, accountId, divisionId, userId } = req.body;

    if (!titulo || !participantes || !accountId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos obligatorios'
      });
    }

    // Verificar que el usuario tiene acceso a la cuenta
    const userAssociation = await Shared.findOne({
      user: userId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear actividades en esta cuenta'
      });
    }

    // Validar que participantes sea un array
    if (!Array.isArray(participantes)) {
      return res.status(400).json({
        success: false,
        message: 'Participantes debe ser un array de IDs de estudiantes'
      });
    }

    // Obtener configuración de la cuenta para determinar el estado inicial
    const accountConfig = await AccountConfig.getOrCreateConfig(accountId);
    console.log('⚙️ [ACTIVITIES] Configuración de cuenta:', {
      accountId,
      requiereAprobarActividades: accountConfig.requiereAprobarActividades
    });

    // Determinar el estado inicial según la configuración
    // Si requiereAprobarActividades es true: 'borrador' (debe ser aprobada)
    // Si requiereAprobarActividades es false: 'publicada' (se publica directamente)
    const estadoInicial = accountConfig.requiereAprobarActividades ? 'borrador' : 'publicada';
    console.log('⚙️ [ACTIVITIES] Estado inicial de la actividad:', estadoInicial);

    // Crear la actividad
    const activity = new Activity({
      titulo,
      participantes, // Guardar el array de IDs tal como viene del mobile
      descripcion: descripcion || '',
      imagenes: imagenes || [],
      account: accountId,
      division: divisionId,
      createdBy: userId,
      usuario: userId,
      tipo: 'create',
      entidad: 'event',
      estado: estadoInicial
    });

    await activity.save();

    res.json({
      success: true,
      message: 'Actividad creada correctamente',
      activity: activity
    });
  } catch (error) {
    console.error('Error creating activity:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Cambiar estado de actividad
 */
exports.updateActivityStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    const currentUser = req.user;

    // Verificar que el estado sea válido
    if (!['borrador', 'publicada'].includes(estado)) {
      return res.status(400).json({
        success: false,
        message: 'Estado inválido. Debe ser "borrador" o "publicada"'
      });
    }

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para cambiar el estado de actividades'
      });
    }

    // Buscar la actividad
    const activity = await Activity.findById(id);
    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Actividad no encontrada'
      });
    }

    // Verificar que el usuario tenga acceso a esta actividad
    if (currentUser.role?.nombre === 'adminaccount') {
      console.log('🔍 [DEBUG] Verificando permisos para adminaccount');
      console.log('🔍 [DEBUG] currentUser.userId:', currentUser.userId);
      console.log('🔍 [DEBUG] activity.account:', activity.account);
      
      const userAccounts = await Shared.find({ 
        user: currentUser.userId, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      
      console.log('🔍 [DEBUG] userAccounts encontradas:', userAccounts.length);
      console.log('🔍 [DEBUG] userAccounts:', userAccounts);
      
      const accountIds = userAccounts.map(ah => ah.account);
      console.log('🔍 [DEBUG] accountIds del usuario:', accountIds);
      console.log('🔍 [DEBUG] activity.account:', activity.account);
      console.log('🔍 [DEBUG] activity.account.toString():', activity.account.toString());
      
      // Verificar si alguna de las cuentas del usuario coincide con la cuenta de la actividad
      const hasAccess = accountIds.some(accountId => accountId.equals(activity.account));
      console.log('🔍 [DEBUG] ¿Usuario tiene acceso?', hasAccess);
      
      if (!hasAccess) {
        console.log('❌ [DEBUG] Usuario no tiene acceso a esta actividad');
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para modificar esta actividad'
        });
      }
      console.log('✅ [DEBUG] Usuario tiene acceso a la actividad');
    }

    // Actualizar el estado
    activity.estado = estado;
    await activity.save();

    res.json({
      success: true,
      message: `Actividad ${estado === 'publicada' ? 'publicada' : 'marcada como borrador'} correctamente`,
      activity: activity
    });
  } catch (error) {
    console.error('Error changing activity status:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Eliminar actividad (coordinador)
 */
exports.deleteActivityCoordinator = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    console.log('🗑️ [DELETE ACTIVITY] Iniciando eliminación de actividad:', id);
    console.log('👤 [DELETE ACTIVITY] Usuario:', userId);

    // Verificar que el usuario tiene permisos para eliminar actividades
    const user = await User.findById(userId).populate('role');
    const userRole = user?.role?.nombre;

    console.log('🎭 [DELETE ACTIVITY] Rol del usuario:', userRole);

    if (userRole !== 'coordinador') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar actividades'
      });
    }

    // Buscar la actividad
    const activity = await Activity.findById(id);
    
    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Actividad no encontrada'
      });
    }

    // Verificar que el usuario tiene acceso a la institución de la actividad
    const userAssociation = await Shared.findOne({
      user: userId,
      account: activity.account,
      status: 'active'
    });

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes acceso a esta institución'
      });
    }

    // Eliminar la actividad (soft delete)
    activity.activo = false;
    await activity.save();

    console.log('✅ [DELETE ACTIVITY] Actividad eliminada exitosamente');

    res.json({
      success: true,
      message: 'Actividad eliminada exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando actividad:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Eliminar actividad (superadmin)
 */
exports.deleteActivitySuperAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;

    // Verificar que la actividad existe
    const activity = await Activity.findById(id);

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Actividad no encontrada'
      });
    }

    // Verificar permisos (solo superadmin puede eliminar actividades)
    const user = await User.findById(userId).populate('role');

    if (user.role?.nombre !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar actividades'
      });
    }

    // Eliminar la actividad
    await Activity.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Actividad eliminada correctamente'
    });
  } catch (error) {
    console.error('Error deleting activity:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Obtener actividades para mobile
 */
exports.getMobileActivities = async (req, res) => {
  try {
    const { accountId, divisionId, selectedDate } = req.query;
    const userId = req.user._id;

    console.log('🎯 [ACTIVITIES MOBILE] Iniciando búsqueda de actividades');
    console.log('👤 [ACTIVITIES MOBILE] Usuario:', userId);
    console.log('🏢 [ACTIVITIES MOBILE] AccountId:', accountId);
    console.log('📚 [ACTIVITIES MOBILE] DivisionId:', divisionId);
    console.log('📅 [ACTIVITIES MOBILE] selectedDate recibido (raw):', selectedDate);
    console.log('📅 [ACTIVITIES MOBILE] Tipo de selectedDate:', typeof selectedDate);

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'accountId es requerido'
      });
    }

    // Obtener la asociación activa del usuario (fuente de verdad única)
    const activeAssociation = await ActiveAssociation.getActiveAssociation(userId);
    
    if (!activeAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes una asociación activa configurada'
      });
    }

    // Verificar que la asociación activa pertenezca a la cuenta solicitada
    if (activeAssociation.account._id.toString() !== accountId) {
      return res.status(403).json({
        success: false,
        message: 'La asociación activa no pertenece a esta institución'
      });
    }

    // CRÍTICO: Obtener el estudiante desde activeShared (Shared), no del campo desnormalizado
    // activeShared es la fuente de verdad única
    let userStudent = null;
    let userRole = null;
    
    if (activeAssociation.activeShared) {
      // Obtener el Shared document completo con populate
      const sharedDoc = await Shared.findById(activeAssociation.activeShared)
        .populate('role')
        .populate('student');
      
      if (sharedDoc) {
        userStudent = sharedDoc.student?._id;
        userRole = sharedDoc.role?.nombre;
        
        console.log('🔍 [ACTIVITIES MOBILE] Asociación activa (desde activeShared):', {
          activeSharedId: activeAssociation.activeShared._id || activeAssociation.activeShared,
          role: userRole,
          student: userStudent,
          studentName: sharedDoc.student ? `${sharedDoc.student.nombre} ${sharedDoc.student.apellido}` : 'N/A'
        });
      } else {
        console.error('❌ [ACTIVITIES MOBILE] activeShared no encontrado:', activeAssociation.activeShared);
        return res.status(403).json({
          success: false,
          message: 'La asociación activa no es válida'
        });
      }
    } else {
      console.error('❌ [ACTIVITIES MOBILE] activeAssociation no tiene activeShared');
      return res.status(403).json({
        success: false,
        message: 'La asociación activa no tiene una asociación compartida válida'
      });
    }
    
    console.log('🎭 [ACTIVITIES MOBILE] Rol del usuario:', userRole);
    console.log('👨‍🎓 [ACTIVITIES MOBILE] Estudiante vinculado:', userStudent);

    let query = {
      account: accountId,
      activo: true,
      $or: [
        { estado: 'publicada' }, // Actividades explícitamente publicadas
        { estado: { $exists: false } } // Actividades existentes sin campo estado (compatibilidad)
      ]
    };

    // Filtrar por fecha: cuando hay fecha seleccionada, devolver actividades menores a esa fecha
    // (porque las actividades se muestran ordenadas por fecha más grande primero)
    let dateFilter = null;
    if (selectedDate) {
      // Parsear la fecha desde el string ISO
      const selected = new Date(selectedDate);
      console.log('📅 [ACTIVITIES MOBILE] Fecha parseada desde string:', selected.toISOString());
      
      // Extraer año, mes y día de la fecha parseada
      // Usar métodos UTC para evitar problemas de zona horaria
      const year = selected.getUTCFullYear();
      const month = selected.getUTCMonth();
      const day = selected.getUTCDate();
      
      console.log('📅 [ACTIVITIES MOBILE] Año:', year, 'Mes:', month, 'Día:', day);
      
      // Crear fecha límite al inicio del día seleccionado en UTC
      const endDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
      
      dateFilter = {
        endDate
      };
      console.log('📅 [ACTIVITIES MOBILE] Límite superior UTC (actividades menores a):', endDate.toISOString());
      console.log('📅 [ACTIVITIES MOBILE] Límite superior timestamp:', endDate.getTime());
      console.log('📅 [ACTIVITIES MOBILE] Filtro aplicado: createdAt <', endDate.toISOString());
    } else {
      console.log('📅 [ACTIVITIES MOBILE] Sin filtro de fecha - mostrando todas las actividades');
    }

    // Agregar filtro por división si se proporciona
    if (divisionId) {
      query.division = divisionId;
      console.log('🏢 [ACTIVITIES MOBILE] Filtro por división aplicado:', divisionId);
    } else {
      console.log('🏢 [ACTIVITIES MOBILE] Sin filtro de división');
    }

    // Filtrar según el rol del usuario
    if (userRole === 'coordinador') {
      console.log('👨‍💼 [ACTIVITIES MOBILE] Coordinador: mostrando todas las actividades del día');
      // Coordinador ve todas las actividades del día (no se agrega filtro adicional)
    } else if (userRole === 'familyadmin' || userRole === 'familyviewer') {
      if (userStudent) {
        console.log('👨‍👩‍👧‍👦 [ACTIVITIES MOBILE] Familyadmin/Viewer: filtrando por estudiante vinculado');
        // Familyadmin/Viewer solo ve actividades donde su estudiante esté en participantes
        query.participantes = userStudent;
      } else {
        console.log('⚠️ [ACTIVITIES MOBILE] Familyadmin/Viewer sin estudiante vinculado: no hay actividades');
        // Si no tiene estudiante vinculado, no mostrar actividades
        query.participantes = null; // Esto no devolverá resultados
      }
    } else {
      console.log('❓ [ACTIVITIES MOBILE] Rol no reconocido:', userRole);
      // Para otros roles, no mostrar actividades
      query.participantes = null; // Esto no devolverá resultados
    }

    console.log('🔍 [ACTIVITIES MOBILE] Query base:', JSON.stringify(query, null, 2));

    let activities = [];

    if (dateFilter) {
      // CASO 1: Hay fecha seleccionada
      // Devolver solo actividades menores a la fecha seleccionada
      // (porque las actividades se muestran ordenadas por fecha más grande primero)
      const dateQuery = {
        ...query,
        createdAt: {
          $lt: dateFilter.endDate
        }
      };
      
      console.log('📅 [ACTIVITIES MOBILE] Query completo con filtro de fecha:');
      console.log(JSON.stringify({
        ...query,
        createdAt: {
          $lt: dateFilter.endDate.toISOString()
        }
      }, null, 2));
      console.log('📅 [ACTIVITIES MOBILE] dateQuery object (para MongoDB):', {
        account: dateQuery.account,
        activo: dateQuery.activo,
        'createdAt.$lt': dateQuery.createdAt.$lt,
        'createdAt.$lt ISO': dateQuery.createdAt.$lt.toISOString(),
        'createdAt.$lt timestamp': dateQuery.createdAt.$lt.getTime()
      });
      console.log('📅 [ACTIVITIES MOBILE] Buscando actividades con createdAt <', dateFilter.endDate.toISOString());
      console.log('📅 [ACTIVITIES MOBILE] Timestamp límite:', dateFilter.endDate.getTime());
      
      // Verificar que el filtro esté presente antes de ejecutar la consulta
      if (!dateQuery.createdAt || !dateQuery.createdAt.$lt) {
        console.error('❌ [ACTIVITIES MOBILE] ERROR: El filtro de fecha no está presente en la consulta!');
      }
      
      activities = await Activity.find(dateQuery)
        .populate('usuario', 'name email')
        .populate('account', 'nombre razonSocial')
        .populate('division', 'nombre descripcion')
        .populate('participantes', 'nombre apellido dni')
        .sort({ createdAt: -1 }) // Orden cronológico descendente (más recientes primero)
        .limit(100); // Limitar a las últimas 100 actividades
      
      console.log('📅 [ACTIVITIES MOBILE] Actividades encontradas:', activities.length);
      // Log de las primeras 5 actividades para verificar las fechas
      if (activities.length > 0) {
        console.log('📅 [ACTIVITIES MOBILE] Primeras 5 actividades encontradas:');
        const limitTimestamp = dateFilter.endDate.getTime();
        activities.slice(0, 5).forEach((act, idx) => {
          const actTimestamp = act.createdAt.getTime();
          const isBeforeLimit = actTimestamp < limitTimestamp;
          console.log(`  ${idx + 1}. createdAt: ${act.createdAt.toISOString()}, Timestamp: ${actTimestamp}, Límite: ${limitTimestamp}, ¿Es menor? ${isBeforeLimit}`);
          if (!isBeforeLimit) {
            console.error(`  ⚠️ ERROR: Actividad ${idx + 1} tiene fecha mayor o igual al límite!`);
          }
        });
      }
    } else {
      // CASO 2: No hay fecha seleccionada - mostrar las últimas actividades
      const totalActivities = await Activity.countDocuments(query);
      console.log('📊 [ACTIVITIES MOBILE] Total actividades en DB que coinciden con query:', totalActivities);
      
      activities = await Activity.find(query)
        .populate('usuario', 'name email')
        .populate('account', 'nombre razonSocial')
        .populate('division', 'nombre descripcion')
        .populate('participantes', 'nombre apellido dni')
        .sort({ createdAt: -1 })
        .limit(100); // Limitar a las últimas 100 actividades
      
      console.log('📊 [ACTIVITIES MOBILE] Actividades encontradas:', activities.length, '(máximo 100 actividades)');
    }
    activities.forEach((activity, index) => {
      console.log(`📋 [ACTIVITIES MOBILE] Actividad ${index + 1}:`, {
        id: activity._id,
        titulo: activity.titulo,
        participantes: activity.participantes?.map(p => p._id) || [],
        createdAt: activity.createdAt
      });
    });

    // Generar URLs firmadas para las imágenes
    const activitiesWithSignedUrls = await Promise.all(activities.map(async (activity) => {
      let imagenesSignedUrls = [];
      
      // Si la actividad tiene imágenes, generar URLs firmadas
      if (activity.imagenes && Array.isArray(activity.imagenes)) {
        try {
          imagenesSignedUrls = await Promise.all(activity.imagenes.map(async (imageKey) => {
            // Generar URL firmada usando la key directamente
            const signedUrl = await generateSignedUrl(imageKey);
            return signedUrl;
          }));
        } catch (error) {
          console.error('Error generando URLs firmadas para actividad:', activity._id, error);
          imagenesSignedUrls = []; // No devolver URLs si falla
        }
      }

      // Formatear participantes como string de nombres
      const participantesNombres = Array.isArray(activity.participantes) 
        ? activity.participantes
          .filter(p => p) // Filtrar participantes nulos/undefined
          .map(p => `${p.nombre} ${p.apellido}`)
          .join(', ')
        : '';

      return {
        _id: activity._id,
        usuario: activity.usuario,
        account: activity.account,
        division: activity.division,
        tipo: activity.tipo,
        entidad: activity.entidad,
        entidadId: activity.entidadId,
        descripcion: activity.descripcion,
        titulo: activity.titulo,
        participantes: participantesNombres,
        imagenes: imagenesSignedUrls,
        datos: activity.datos || {},
        activo: activity.activo,
        createdAt: activity.createdAt,
        updatedAt: activity.updatedAt
      };
    }));

    console.log('🔍 Debug - Activities with signed URLs:', JSON.stringify(activitiesWithSignedUrls, null, 2));

    res.json({
      success: true,
      data: {
        activities: activitiesWithSignedUrls
      }
    });
  } catch (error) {
    console.error('Error obteniendo actividades para mobile:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Obtener datos del calendario de actividades (backoffice)
 */
exports.getCalendarActivities = async (req, res) => {
  try {
    const { divisionId, fechaInicio, fechaFin } = req.query;
    
    // Verificar permisos del usuario
    let currentUser;
    if (req.user.isCognitoUser) {
      currentUser = await User.findOne({ email: req.user.email }).populate('role');
    } else {
      currentUser = req.user;
    }
    
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    console.log('📅 [BACKOFFICE ACTIVITIES] Obteniendo datos del calendario');
    console.log('📅 [BACKOFFICE ACTIVITIES] DivisionId:', divisionId);
    console.log('📅 [BACKOFFICE ACTIVITIES] FechaInicio:', fechaInicio);
    console.log('📅 [BACKOFFICE ACTIVITIES] FechaFin:', fechaFin);
    console.log('📅 [BACKOFFICE ACTIVITIES] User role:', currentUser.role?.nombre);
    console.log('📅 [BACKOFFICE ACTIVITIES] User ID:', currentUser._id);

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver actividades'
      });
    }

    if (!divisionId || !fechaInicio || !fechaFin) {
      return res.status(400).json({
        success: false,
        message: 'divisionId, fechaInicio y fechaFin son requeridos'
      });
    }

    // Construir query base según el rol del usuario
    let query = {
      division: divisionId,
      activo: true
    };

    // Para adminaccount, no filtrar por estado (ver todas las actividades)
    if (currentUser.role?.nombre === 'adminaccount') {
      // Adminaccount puede ver todas las actividades sin filtro de estado
      console.log('👨‍💼 [BACKOFFICE ACTIVITIES] Adminaccount - sin filtro de estado (ver todas)');
    } else {
      // Para otros roles, incluir filtro de estado
      query.$or = [
        { estado: { $exists: false } }, // Actividades sin estado (legacy)
        { estado: 'publicada' },
        { estado: 'borrador' }
      ];
    }

    // Filtro por cuenta según el rol del usuario
    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin puede ver todas las actividades
    } else if (currentUser.role?.nombre === 'adminaccount') {
      // Adminaccount solo puede ver actividades de sus cuentas
      const userAccounts = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      
      const accountIds = userAccounts.map(ah => ah.account);
      query.account = { $in: accountIds };
    } else if (currentUser.role?.nombre === 'coordinador') {
      // Coordinador puede ver actividades de sus cuentas
      const userAccounts = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      
      const accountIds = userAccounts.map(ah => ah.account);
      query.account = { $in: accountIds };
    }

    // Filtro por fecha - CORREGIDO: usar UTC para evitar problemas de timezone
    // Convertir a objetos Date si vienen como strings
    const fechaInicioDate = new Date(fechaInicio);
    const fechaFinDate = new Date(fechaFin);
    
    // Convertir a UTC para evitar problemas de timezone
    const fechaInicioUTC = new Date(fechaInicioDate.getTime() - (fechaInicioDate.getTimezoneOffset() * 60000));
    const fechaFinUTC = new Date(fechaFinDate.getTime() - (fechaFinDate.getTimezoneOffset() * 60000));
    
    console.log('🌍 [BACKOFFICE ACTIVITIES] Filtro de fechas UTC:');
    console.log('  - Fecha inicio original:', fechaInicio);
    console.log('  - Fecha inicio local:', fechaInicioDate.toISOString());
    console.log('  - Fecha inicio UTC:', fechaInicioUTC.toISOString());
    console.log('  - Fecha fin original:', fechaFin);
    console.log('  - Fecha fin local:', fechaFinDate.toISOString());
    console.log('  - Fecha fin UTC:', fechaFinUTC.toISOString());
    
    // Para el backoffice, mostrar todas las actividades del mes del calendario
    // Filtro de fechas simplificado - solo por mes del calendario
    query.$or = [
      // Actividades con fechas definidas que caen en el rango del mes
      {
        fechaInicio: { $exists: true, $ne: null },
        fechaFin: { $exists: true, $ne: null },
        $or: [
          { fechaInicio: { $gte: fechaInicioUTC, $lte: fechaFinUTC } },
          { fechaFin: { $gte: fechaInicioUTC, $lte: fechaFinUTC } },
          { 
            fechaInicio: { $lte: fechaInicioUTC },
            fechaFin: { $gte: fechaFinUTC }
          }
        ]
      },
      // Actividades sin fechas definidas - mostrar todas del mes
      {
        $or: [
          { fechaInicio: { $exists: false } },
          { fechaInicio: null },
          { fechaFin: { $exists: false } },
          { fechaFin: null }
        ]
      }
    ];

    console.log('📅 [BACKOFFICE ACTIVITIES] Query:', JSON.stringify(query, null, 2));
    
    // Log específico para adminaccount
    if (currentUser.role?.nombre === 'adminaccount') {
      console.log('👨‍💼 [BACKOFFICE ACTIVITIES] Adminaccount debug - User ID:', currentUser._id);
      console.log('👨‍💼 [BACKOFFICE ACTIVITIES] Adminaccount debug - Query account filter:', query.account);
      
      // Verificar cuántas actividades hay en total para esta división
      const totalActivities = await Activity.countDocuments({
        division: divisionId,
        activo: true
      });
      console.log('👨‍💼 [BACKOFFICE ACTIVITIES] Total actividades en división (sin filtro de cuenta):', totalActivities);
      
      // Verificar cuántas actividades hay para la cuenta específica
      if (query.account) {
        const accountActivities = await Activity.countDocuments({
          division: divisionId,
          activo: true,
          account: query.account
        });
        console.log('👨‍💼 [BACKOFFICE ACTIVITIES] Actividades para cuenta filtrada:', accountActivities);
        console.log('👨‍💼 [BACKOFFICE ACTIVITIES] Cuenta filtrada:', query.account);
      }
    }

    // Obtener actividades
    const activities = await Activity.find(query)
      .populate('account', 'nombre razonSocial')
      .populate('division', 'nombre descripcion')
      .populate('usuario', 'name email')
      .populate('participantes', 'nombre apellido')
      .sort({ createdAt: -1 });

    console.log('📅 [BACKOFFICE ACTIVITIES] Actividades encontradas:', activities.length);
    
    // Log detallado de las actividades encontradas
    if (currentUser.role?.nombre === 'adminaccount') {
      console.log('👨‍💼 [BACKOFFICE ACTIVITIES] Detalle de actividades encontradas:');
      activities.forEach((activity, index) => {
        console.log(`👨‍💼 [BACKOFFICE ACTIVITIES] Actividad ${index + 1}:`, {
          id: activity._id,
          titulo: activity.titulo,
          account: activity.account?._id || activity.account,
          estado: activity.estado,
          activo: activity.activo
        });
      });
    }

    // Agrupar por fecha y generar URLs firmadas para las imágenes
    const calendarData = {};
    
    for (const activity of activities) {
      const fecha = activity.createdAt.toISOString().split('T')[0];
      
      if (!calendarData[fecha]) {
        calendarData[fecha] = {
          fecha: fecha,
          totalActividades: 0,
          actividades: []
        };
      }
      
      // Generar URLs firmadas para las imágenes y videos
      let imagenesSignedUrls = [];
      if (activity.imagenes && Array.isArray(activity.imagenes)) {
        try {
          imagenesSignedUrls = await Promise.all(activity.imagenes.map(async (mediaKey) => {
            // Generar URL firmada usando la key directamente
            const signedUrl = await generateSignedUrl(mediaKey, 172800); // 2 días
            return signedUrl;
          }));
        } catch (error) {
          console.error('Error generando URLs firmadas para actividad:', activity._id, error);
          imagenesSignedUrls = []; // No devolver URLs si falla
        }
      }
      
      calendarData[fecha].totalActividades++;
      calendarData[fecha].actividades.push({
        _id: activity._id,
        titulo: activity.titulo,
        descripcion: activity.descripcion,
        fecha: activity.createdAt.toISOString().split('T')[0],
        hora: activity.createdAt.toTimeString().split(' ')[0],
        lugar: activity.lugar || '',
        estado: activity.estado || 'publicada', // Actividades existentes sin estado se consideran publicadas
        categoria: activity.categoria || 'general',
        imagenes: imagenesSignedUrls,
        objetivos: activity.objetivos || [],
        materiales: activity.materiales || [],
        evaluacion: activity.evaluacion || '',
        observaciones: activity.observaciones || '',
        participantes: activity.participantes || [],
        creador: {
          name: activity.usuario?.name || 'Desconocido'
        },
        institucion: {
          _id: activity.account?._id,
          nombre: activity.account?.nombre || 'Sin institución'
        },
        division: activity.division ? {
          _id: activity.division._id,
          nombre: activity.division.nombre
        } : null
      });
    }

    console.log('📅 [BACKOFFICE ACTIVITIES] Datos del calendario generados:', Object.keys(calendarData).length, 'días');

    res.json({
      success: true,
      data: calendarData
    });

  } catch (error) {
    console.error('Error obteniendo datos del calendario:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Eliminar actividad desde backoffice (solo adminaccount)
 */
exports.deleteActivityBackoffice = async (req, res) => {
  try {
    console.log('🗑️ [BACKOFFICE DELETE] ===== INICIO DELETE ACTIVIDAD =====');
    console.log('🗑️ [BACKOFFICE DELETE] Headers:', req.headers);
    console.log('🗑️ [BACKOFFICE DELETE] Authorization:', req.headers.authorization);
    
    const { id } = req.params;
    const currentUser = req.user;
    
    console.log('🗑️ [BACKOFFICE DELETE] ID de actividad:', id);
    console.log('🗑️ [BACKOFFICE DELETE] Usuario autenticado:', currentUser);

    console.log('🗑️ [BACKOFFICE DELETE] Eliminando actividad:', id);
    console.log('🗑️ [BACKOFFICE DELETE] Usuario:', currentUser._id, currentUser.role?.nombre);
    console.log('🗑️ [BACKOFFICE DELETE] Role completo:', currentUser.role);
    console.log('🗑️ [BACKOFFICE DELETE] Role nombre:', currentUser.role?.nombre);
    console.log('🗑️ [BACKOFFICE DELETE] ¿Es adminaccount?', currentUser.role?.nombre === 'adminaccount');

    // Verificar que solo adminaccount puede eliminar actividades
    if (currentUser.role?.nombre !== 'adminaccount') {
      console.log('🗑️ [BACKOFFICE DELETE] ERROR: Usuario no es adminaccount');
      console.log('🗑️ [BACKOFFICE DELETE] Role actual:', currentUser.role?.nombre);
      return res.status(403).json({ 
        success: false, 
        message: 'Solo los usuarios adminaccount pueden eliminar actividades' 
      });
    }

    // Verificar que la actividad existe
    const actividad = await Activity.findById(id);
    if (!actividad) {
      return res.status(404).json({ 
        success: false, 
        message: 'Actividad no encontrada' 
      });
    }

    // Verificar que la actividad pertenece a una cuenta asociada del usuario
    const userAccounts = await Shared.find({ 
      user: currentUser._id, 
      status: { $in: ['active', 'pending'] }
    }).select('account');
    
    const accountIds = userAccounts.map(ah => ah.account);
    
    console.log('🗑️ [BACKOFFICE DELETE] Cuentas asociadas del usuario:', accountIds);
    console.log('🗑️ [BACKOFFICE DELETE] Cuenta de la actividad:', actividad.account.toString());
    console.log('🗑️ [BACKOFFICE DELETE] Cuenta de la actividad (tipo):', typeof actividad.account);
    console.log('🗑️ [BACKOFFICE DELETE] Cuentas asociadas (tipos):', accountIds.map(id => typeof id));
    
    // Convertir todos a string para comparar correctamente
    const accountIdsString = accountIds.map(id => id.toString());
    const actividadAccountString = actividad.account.toString();
    
    console.log('🗑️ [BACKOFFICE DELETE] Cuentas asociadas (strings):', accountIdsString);
    console.log('🗑️ [BACKOFFICE DELETE] Cuenta de la actividad (string):', actividadAccountString);
    console.log('🗑️ [BACKOFFICE DELETE] ¿Puede eliminar?', accountIdsString.includes(actividadAccountString));
    
    if (!accountIdsString.includes(actividadAccountString)) {
      console.log('🗑️ [BACKOFFICE DELETE] ERROR: No tiene permisos para eliminar esta actividad');
      return res.status(403).json({ 
        success: false, 
        message: 'No tienes permisos para eliminar esta actividad' 
      });
    }

    // Eliminar la actividad
    await Activity.findByIdAndDelete(id);

    console.log('🗑️ [BACKOFFICE DELETE] Actividad eliminada:', {
      id: id,
      titulo: actividad.titulo,
      account: actividad.account
    });

    res.json({ 
      success: true, 
      message: 'Actividad eliminada correctamente' 
    });
  } catch (error) {
    console.error('Error eliminando actividad desde backoffice:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
};

/**
 * Obtener actividades del día (backoffice)
 */
exports.getDayActivities = async (req, res) => {
  try {
    const { fecha, divisionId } = req.query;
    const currentUser = req.user;

    console.log('📅 [BACKOFFICE ACTIVITIES DAY] Obteniendo actividades del día');
    console.log('📅 [BACKOFFICE ACTIVITIES DAY] Fecha:', fecha);
    console.log('📅 [BACKOFFICE ACTIVITIES DAY] DivisionId:', divisionId);

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver actividades'
      });
    }

    if (!fecha || !divisionId) {
      return res.status(400).json({
        success: false,
        message: 'fecha y divisionId son requeridos'
      });
    }

    // Construir query base según el rol del usuario
    let query = {
      division: divisionId,
      activo: true
    };

    // Para adminaccount, no filtrar por estado (ver todas las actividades)
    if (currentUser.role?.nombre === 'adminaccount') {
      // Adminaccount puede ver todas las actividades sin filtro de estado
      console.log('👨‍💼 [BACKOFFICE ACTIVITIES DAY] Adminaccount - sin filtro de estado (ver todas)');
    } else {
      // Para otros roles, incluir filtro de estado
      query.$or = [
        { estado: { $exists: false } }, // Actividades sin estado (legacy)
        { estado: 'publicada' },
        { estado: 'borrador' }
      ];
    }

    // Filtro por cuenta según el rol del usuario
    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin puede ver todas las actividades
    } else if (currentUser.role?.nombre === 'adminaccount') {
      // Adminaccount solo puede ver actividades de sus cuentas
      const userAccounts = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      
      const accountIds = userAccounts.map(ah => ah.account);
      query.account = { $in: accountIds };
    } else if (currentUser.role?.nombre === 'coordinador') {
      // Coordinador puede ver actividades de sus cuentas
      const userAccounts = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      
      const accountIds = userAccounts.map(ah => ah.account);
      query.account = { $in: accountIds };
    }

    // Filtro por fecha (todo el día)
    const startDate = new Date(fecha);
    const endDate = new Date(fecha);
    endDate.setDate(endDate.getDate() + 1);
    
    query.createdAt = {
      $gte: startDate,
      $lt: endDate
    };

    console.log('📅 [BACKOFFICE ACTIVITIES DAY] Query:', JSON.stringify(query, null, 2));

    // Obtener actividades
    const activities = await Activity.find(query)
      .populate('account', 'nombre razonSocial')
      .populate('division', 'nombre descripcion')
      .populate('usuario', 'name email')
      .populate('participantes', 'nombre apellido')
      .sort({ createdAt: -1 });

    console.log('📅 [BACKOFFICE ACTIVITIES DAY] Actividades encontradas:', activities.length);

    // Formatear actividades
    const formattedActivities = activities.map(activity => ({
      _id: activity._id,
      titulo: activity.titulo,
      descripcion: activity.descripcion,
      fecha: activity.createdAt.toISOString().split('T')[0],
      hora: activity.createdAt.toTimeString().split(' ')[0],
      lugar: activity.lugar || '',
      estado: activity.estado || 'activa',
      categoria: activity.categoria || 'general',
      imagenes: activity.imagenes || [],
      objetivos: activity.objetivos || [],
      materiales: activity.materiales || [],
      evaluacion: activity.evaluacion || '',
      observaciones: activity.observaciones || '',
      participantes: activity.participantes || [],
      creador: {
        name: activity.usuario?.name || 'Desconocido'
      },
      institucion: {
        _id: activity.account?._id,
        nombre: activity.account?.nombre || 'Sin institución'
      },
      division: activity.division ? {
        _id: activity.division._id,
        nombre: activity.division.nombre
      } : null
    }));

    res.json({
      success: true,
      data: formattedActivities
    });
  } catch (error) {
    console.error('Error obteniendo actividades del día:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Endpoint para agregar/quitar favorito de actividad
exports.toggleActivityFavorite = async (req, res) => {
  try {
    console.log('❤️ [FAVORITE] Agregando/quitando favorito');
    const { activityId } = req.params;
    const userId = req.user.userId;
    const { studentId, isFavorite } = req.body;

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: 'ID del estudiante es requerido'
      });
    }

    // Verificar que la actividad existe
    const activity = await Activity.findById(activityId);
    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Actividad no encontrada'
      });
    }

    // Verificar que el estudiante existe
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado'
      });
    }

    // Verificar que el usuario tiene acceso al estudiante
    // Para usuarios familiares, verificar a través de la asociación en Shared
    const userAssociation = await Shared.findOne({
      user: userId,
      student: studentId,
      status: 'active'
    });

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes acceso a este estudiante'
      });
    }

    if (isFavorite) {
      // Agregar a favoritos
      const existingFavorite = await ActivityFavorite.findOne({
        user: userId,
        student: studentId,
        activity: activityId
      });

      if (!existingFavorite) {
        await ActivityFavorite.create({
          user: userId,
          student: studentId,
          activity: activityId,
          addedAt: new Date()
        });
        console.log('✅ [FAVORITE] Favorito agregado');
      }
    } else {
      // Quitar de favoritos
      await ActivityFavorite.deleteOne({
        user: userId,
        student: studentId,
        activity: activityId
      });
      console.log('✅ [FAVORITE] Favorito eliminado');
    }

    res.json({
      success: true,
      message: isFavorite ? 'Agregado a favoritos' : 'Eliminado de favoritos'
    });

  } catch (error) {
    console.error('❌ [FAVORITE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Endpoint para obtener favoritos de un estudiante
exports.getStudentFavorites = async (req, res) => {
  try {
    console.log('❤️ [FAVORITES] Obteniendo favoritos del estudiante');
    const { studentId } = req.params;
    const userId = req.user.userId;

    // Verificar que el usuario tiene acceso al estudiante
    const userAssociation = await Shared.findOne({
      user: userId,
      student: studentId,
      status: 'active'
    });

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes acceso a este estudiante'
      });
    }

    // Obtener favoritos con detalles de la actividad
    const favorites = await ActivityFavorite.find({
      user: userId,
      student: studentId
    })
    .populate({
      path: 'activity',
      populate: [
        { path: 'account', select: 'nombre' },
        { path: 'division', select: 'nombre' },
        { path: 'usuario', select: 'name email' }
      ]
    })
    .populate({
      path: 'student',
      select: 'nombre apellido'
    })
    .sort({ addedAt: -1 });

    console.log('🔍 [FAVORITES] Favoritos encontrados:', favorites.length);

    // Generar URLs firmadas para las imágenes de las actividades
    const favoritesWithSignedUrls = await Promise.all(favorites.map(async (favorite) => {
      const favoriteObj = favorite.toObject();
      
      // Asegurar que el campo student esté disponible (como ID o como objeto poblado)
      if (!favoriteObj.student) {
        favoriteObj.student = studentId;
      }
      
      // Si la actividad tiene imágenes, generar URLs firmadas
      if (favoriteObj.activity && favoriteObj.activity.imagenes && Array.isArray(favoriteObj.activity.imagenes)) {
        try {
          const imagenesSignedUrls = await Promise.all(favoriteObj.activity.imagenes.map(async (imageKey) => {
            // Generar URL firmada usando la key directamente
            const signedUrl = await generateSignedUrl(imageKey);
            return signedUrl;
          }));
          favoriteObj.activity.imagenes = imagenesSignedUrls;
        } catch (error) {
          console.error('Error generando URLs firmadas para actividad favorita:', favoriteObj.activity._id, error);
          favoriteObj.activity.imagenes = []; // No devolver URLs si falla
        }
      }
      
      return favoriteObj;
    }));

    res.json({
      success: true,
      data: favoritesWithSignedUrls
    });

  } catch (error) {
    console.error('❌ [FAVORITES] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Endpoint para verificar si una actividad es favorita
exports.checkActivityFavorite = async (req, res) => {
  try {
    const { activityId, studentId } = req.params;
    const userId = req.user.userId;

    // Verificar que el usuario tiene acceso al estudiante
    const userAssociation = await Shared.findOne({
      user: userId,
      student: studentId,
      status: 'active'
    });

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes acceso a este estudiante'
      });
    }

    const favorite = await ActivityFavorite.findOne({
      user: userId,
      student: studentId,
      activity: activityId
    });

    res.json({
      success: true,
      isFavorite: !!favorite
    });

  } catch (error) {
    console.error('❌ [FAVORITE CHECK] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

