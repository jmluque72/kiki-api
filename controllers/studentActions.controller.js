const StudentAction = require('../shared/models/StudentAction');
const StudentActionLog = require('../shared/models/StudentActionLog');
const Student = require('../shared/models/Student');
const User = require('../shared/models/User');
const Grupo = require('../shared/models/Grupo');
const Group = require('../shared/models/Group');
const Shared = require('../shared/models/Shared');
const mongoose = require('mongoose');

/**
 * Test endpoint
 */
exports.test = async (req, res) => {
  console.log('🎯 [TEST] Endpoint de prueba llamado');
  try {
    res.json({ success: true, message: 'Endpoint de prueba funcionando' });
  } catch (error) {
    console.error('Error en test:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

/**
 * Listar acciones de estudiantes
 */
exports.listActions = async (req, res) => {
  try {
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

    const query = { activa: true };

    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin puede ver todas las acciones
    } else if (currentUser.role?.nombre === 'adminaccount') {
      if (req.userInstitution) {
        const userDivisions = await Grupo.find({ cuenta: req.userInstitution._id }).select('_id');
        const divisionIds = userDivisions.map(d => d._id);
        query.division = { $in: divisionIds };
      } else {
        return res.status(403).json({
          success: false,
          message: 'No tienes una institución asignada'
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver estas acciones'
      });
    }

    const acciones = await StudentAction.find(query)
      .populate('division', 'nombre descripcion')
      .populate('creadoPor', 'nombre email')
      .sort({ orden: 1, nombre: 1 });

    res.json({
      success: true,
      data: acciones
    });
  } catch (error) {
    console.error('Error obteniendo acciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Obtener acciones por división
 */
exports.getActionsByDivision = async (req, res) => {
  try {
    const { divisionId } = req.params;
    const currentUser = req.user;

    console.log('🎯 [STUDENT ACTIONS] Obteniendo acciones para división:', divisionId);
    console.log('🎯 [STUDENT ACTIONS] Rol del usuario:', currentUser.role?.nombre);

    // Permitir a coordinadores, adminaccount, superadmin y tutores (familyadmin)
    const allowedRoles = ['adminaccount', 'superadmin', 'coordinador', 'familyadmin'];
    if (!allowedRoles.includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver acciones de estudiantes'
      });
    }

    const acciones = await StudentAction.find({ 
      division: divisionId, 
      activo: true 
    })
    .select('nombre descripcion division account categoria icono color activo orden valores creadoPor createdAt updatedAt')
    .sort({ orden: 1, nombre: 1 });

    console.log('✅ [STUDENT ACTIONS] Acciones encontradas:', acciones.length);
    console.log('✅ [STUDENT ACTIONS] Ejemplo de acción con valores:', acciones.find(a => a.valores && a.valores.length > 0) ? {
      nombre: acciones.find(a => a.valores && a.valores.length > 0).nombre,
      valores: acciones.find(a => a.valores && a.valores.length > 0).valores
    } : 'No hay acciones con valores');

    res.json({
      success: true,
      data: acciones
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTIONS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Crear nueva acción
 */
exports.createAction = async (req, res) => {
  try {
    const { nombre, descripcion, division, color, orden, valores } = req.body;
    const currentUser = req.user;

    console.log('🎯 [STUDENT ACTIONS CREATE] Datos recibidos:', { nombre, descripcion, division, color, valores });
    console.log('🎯 [STUDENT ACTIONS CREATE] Tipo de valores:', typeof valores, 'Es array?', Array.isArray(valores), 'Longitud:', valores?.length);

    let roleName = null;
    if (typeof currentUser.role === 'string') {
      roleName = currentUser.role;
    } else if (currentUser.role?.nombre) {
      roleName = currentUser.role.nombre;
    } else if (currentUser.role?._id) {
      const Role = require('../shared/models/Role');
      const roleDoc = await Role.findById(currentUser.role._id);
      if (roleDoc) {
        roleName = roleDoc.nombre;
      }
    }

    if (roleName === 'accountadmin') {
      roleName = 'adminaccount';
    }

    if (!['adminaccount', 'superadmin'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear acciones de estudiantes'
      });
    }

    if (!nombre || !division) {
      return res.status(400).json({
        success: false,
        message: 'Nombre y división son requeridos'
      });
    }

    let divisionExists = await Group.findById(division);
    
    if (!divisionExists) {
      const accountId = req.userInstitution?._id || currentUser.account || new mongoose.Types.ObjectId();
      
      divisionExists = new Group({
        _id: division,
        nombre: 'División de Prueba',
        account: accountId,
        descripcion: 'División creada automáticamente para pruebas',
        creadoPor: currentUser._id
      });
      
      await divisionExists.save();
    }
    
    const userAccount = req.userInstitution?._id || currentUser.account;
    
    if (userAccount && divisionExists.account && userAccount.toString() !== divisionExists.account.toString()) {
      const existingDivisionInUserAccount = await Group.findOne({
        account: userAccount,
        nombre: divisionExists.nombre
      });
      
      if (existingDivisionInUserAccount) {
        divisionExists = existingDivisionInUserAccount;
      } else {
        const originalNombre = divisionExists.nombre;
        divisionExists.nombre = `TEMP_${divisionExists._id}_${Date.now()}`;
        await divisionExists.save();
        
        divisionExists.account = userAccount;
        divisionExists.nombre = originalNombre;
        await divisionExists.save();
      }
    }

    // Procesar valores: asegurarse de que sea un array de strings válidos
    let valoresFinales = undefined;
    if (valores !== undefined && valores !== null) {
      if (Array.isArray(valores)) {
        // Filtrar valores vacíos y asegurarse de que sean strings
        const valoresLimpios = valores
          .map(v => typeof v === 'string' ? v.trim() : String(v).trim())
          .filter(v => v.length > 0);
        
        if (valoresLimpios.length > 0) {
          valoresFinales = valoresLimpios;
        }
      } else if (typeof valores === 'string' && valores.trim().length > 0) {
        // Si viene como string, convertirlo a array
        valoresFinales = valores.split(',').map(v => v.trim()).filter(v => v.length > 0);
      }
    }
    
    console.log('🎯 [STUDENT ACTIONS CREATE] Valores finales a guardar:', valoresFinales);

    const nuevaAccion = new StudentAction({
      nombre,
      descripcion,
      division,
      account: divisionExists.account,
      color: color || '#3B82F6',
      orden: orden || 0,
      valores: valoresFinales,
      creadoPor: currentUser._id
    });

    await nuevaAccion.save();
    
    console.log('✅ [STUDENT ACTIONS CREATE] Acción guardada:', {
      _id: nuevaAccion._id,
      nombre: nuevaAccion.nombre,
      valores: nuevaAccion.valores
    });

    res.status(201).json({
      success: true,
      message: 'Acción creada exitosamente',
      data: nuevaAccion
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTIONS CREATE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Actualizar acción
 */
exports.updateAction = async (req, res) => {
  try {
    const { actionId } = req.params;
    const { nombre, descripcion, categoria, icono, color, orden, activo, valores } = req.body;
    const currentUser = req.user;
    
    console.log('🔄 [STUDENT ACTIONS UPDATE] Datos recibidos:', { actionId, valores });
    console.log('🔄 [STUDENT ACTIONS UPDATE] Tipo de valores:', typeof valores, 'Es array?', Array.isArray(valores), 'Longitud:', valores?.length);

    if (!['adminaccount', 'superadmin'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar acciones de estudiantes'
      });
    }

    const accion = await StudentAction.findById(actionId);
    if (!accion) {
      return res.status(404).json({
        success: false,
        message: 'La acción no existe'
      });
    }

    if (nombre) accion.nombre = nombre;
    if (descripcion !== undefined) accion.descripcion = descripcion;
    if (categoria) accion.categoria = categoria;
    if (icono) accion.icono = icono;
    if (color) accion.color = color;
    if (orden !== undefined) accion.orden = orden;
    if (activo !== undefined) accion.activo = activo;
    
    // Manejar valores: si viene undefined, mantener el valor actual; si viene null o array vacío, limpiar; si viene array con valores, actualizar
    if (valores !== undefined) {
      if (valores === null || (Array.isArray(valores) && valores.length === 0)) {
        accion.valores = undefined;
        console.log('🔄 [STUDENT ACTIONS UPDATE] Limpiando valores');
      } else if (Array.isArray(valores) && valores.length > 0) {
        // Filtrar valores vacíos y asegurarse de que sean strings
        const valoresLimpios = valores
          .map(v => typeof v === 'string' ? v.trim() : String(v).trim())
          .filter(v => v.length > 0);
        
        if (valoresLimpios.length > 0) {
          accion.valores = valoresLimpios;
          console.log('🔄 [STUDENT ACTIONS UPDATE] Actualizando valores:', valoresLimpios);
        } else {
          accion.valores = undefined;
          console.log('🔄 [STUDENT ACTIONS UPDATE] Valores vacíos después de limpiar, estableciendo undefined');
        }
      } else if (typeof valores === 'string' && valores.trim().length > 0) {
        // Si viene como string, convertirlo a array
        const valoresArray = valores.split(',').map(v => v.trim()).filter(v => v.length > 0);
        if (valoresArray.length > 0) {
          accion.valores = valoresArray;
          console.log('🔄 [STUDENT ACTIONS UPDATE] Convirtiendo string a array:', valoresArray);
        } else {
          accion.valores = undefined;
        }
      }
    }

    await accion.save();
    
    console.log('✅ [STUDENT ACTIONS UPDATE] Acción actualizada:', {
      _id: accion._id,
      nombre: accion.nombre,
      valores: accion.valores
    });

    res.json({
      success: true,
      message: 'Acción actualizada exitosamente',
      data: accion
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTIONS UPDATE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Eliminar acción
 */
exports.deleteAction = async (req, res) => {
  try {
    const { actionId } = req.params;
    const currentUser = req.user;

    if (!['adminaccount', 'superadmin'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar acciones de estudiantes'
      });
    }

    const accion = await StudentAction.findByIdAndDelete(actionId);
    if (!accion) {
      return res.status(404).json({
        success: false,
        message: 'La acción no existe'
      });
    }

    res.json({
      success: true,
      message: 'Acción eliminada exitosamente'
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTIONS DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Registrar log de acción (versión simple)
 */
exports.createLogSimple = async (req, res) => {
  try {
    const { estudiante, accion, comentarios, imagenes } = req.body;
    const currentUser = req.user;

    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para registrar acciones de estudiantes'
      });
    }

    if (!estudiante || !accion) {
      return res.status(400).json({
        success: false,
        message: 'Estudiante y acción son requeridos'
      });
    }

    const estudianteExists = await Student.findById(estudiante);
    if (!estudianteExists) {
      return res.status(404).json({
        success: false,
        message: 'El estudiante no existe'
      });
    }

    const accionExists = await StudentAction.findById(accion);
    if (!accionExists) {
      return res.status(404).json({
        success: false,
        message: 'La acción no existe'
      });
    }

    const actionLog = new StudentActionLog({
      estudiante,
      accion,
      registradoPor: currentUser._id,
      division: estudianteExists.division,
      account: estudianteExists.account,
      comentarios,
      imagenes: imagenes || []
    });

    await actionLog.save();

    res.status(201).json({
      success: true,
      message: 'Acción registrada exitosamente',
      data: actionLog
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTION LOG] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Registrar log de acción (versión completa con setUserInstitution)
 */
exports.createLog = async (req, res) => {
  try {
    const { estudiante, accion, comentarios, imagenes, fechaAccion, valor } = req.body;
    const currentUser = req.user;

    console.log('🎯 [STUDENT ACTION LOG CREATE] Datos recibidos:', { estudiante, accion, comentarios, valor });

    const student = await Student.findById(estudiante).populate('division');
    if (!student) {
      return res.status(404).json({ success: false, message: 'Estudiante no encontrado' });
    }

    const action = await StudentAction.findById(accion);
    if (!action) {
      return res.status(404).json({ success: false, message: 'Acción no encontrada' });
    }

    if (req.userInstitution && student.division.cuenta.toString() !== req.userInstitution._id.toString()) {
      return res.status(403).json({ success: false, message: 'El estudiante no pertenece a tu institución' });
    }

    const actionLogData = {
      estudiante,
      accion,
      registradoPor: currentUser._id,
      division: student.division._id,
      account: student.division.cuenta,
      fechaAccion: fechaAccion ? new Date(fechaAccion) : new Date(),
      comentarios,
      imagenes: imagenes || [],
      estado: 'registrado'
    };

    // Agregar valor solo si existe y no está vacío
    if (valor && typeof valor === 'string' && valor.trim().length > 0) {
      actionLogData.valor = valor.trim();
      console.log('✅ [STUDENT ACTION LOG CREATE] Valor a guardar:', actionLogData.valor);
    } else {
      console.log('⚠️ [STUDENT ACTION LOG CREATE] No hay valor o está vacío. Valor recibido:', valor);
    }

    console.log('✅ [STUDENT ACTION LOG CREATE] Datos del log a guardar:', {
      accion: action?.nombre,
      valor: actionLogData.valor,
      tieneValor: !!actionLogData.valor,
      todosLosDatos: actionLogData
    });

    const actionLog = new StudentActionLog(actionLogData);

    await actionLog.save();

    // Verificar que se guardó correctamente
    const savedLog = await StudentActionLog.findById(actionLog._id);
    console.log('✅ [STUDENT ACTION LOG CREATE] Log guardado exitosamente. ID:', actionLog._id);
    console.log('✅ [STUDENT ACTION LOG CREATE] Valor guardado en DB (desde savedLog):', savedLog?.valor);
    console.log('✅ [STUDENT ACTION LOG CREATE] Valor en actionLog después de save:', actionLog.valor);

    await actionLog.populate([
      { path: 'estudiante', select: 'nombre apellido avatar' },
      { path: 'accion', select: 'nombre descripcion color categoria' },
      { path: 'registradoPor', select: 'name email' },
      { path: 'division', select: 'nombre descripcion' }
    ]);

    res.json({
      success: true,
      message: 'Acción registrada exitosamente',
      data: actionLog
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTION LOG] Error registrando acción:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Obtener logs de un estudiante (versión simple)
 */
exports.getLogsByStudentSimple = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { fecha } = req.query;
    const currentUser = req.user;

    if (!['adminaccount', 'superadmin', 'coordinador', 'familyadmin', 'familyviewer'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver acciones de estudiantes'
      });
    }

    let fechaFilter = {};
    if (fecha) {
      const startDate = new Date(fecha);
      const endDate = new Date(fecha);
      endDate.setDate(endDate.getDate() + 1);
      
      fechaFilter = {
        fechaAccion: {
          $gte: startDate,
          $lt: endDate
        }
      };
    }

    const acciones = await StudentActionLog.find({
      estudiante: studentId,
      ...fechaFilter
    })
    .populate('accion', 'nombre descripcion categoria icono color')
    .populate('registradoPor', 'name email')
    .sort({ fechaAccion: -1 });

    res.json({
      success: true,
      data: acciones
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTION LOG GET] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Obtener logs de un estudiante (versión completa)
 */
exports.getLogsByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { fecha, fechaInicio, fechaFin } = req.query;
    const currentUser = req.user;
    
    console.log('🔍 [STUDENT ACTION LOG] getLogsByStudent llamado:', {
      studentId,
      fecha,
      fechaInicio,
      fechaFin,
      currentUserId: currentUser._id,
      currentUserEmail: currentUser.email
    });

    const student = await Student.findById(studentId).populate('division');
    if (!student) {
      return res.status(404).json({ success: false, message: 'Estudiante no encontrado' });
    }

    let roleName = null;
    if (typeof currentUser.role === 'string') {
      roleName = currentUser.role;
    } else if (currentUser.role?.nombre) {
      roleName = currentUser.role.nombre;
    }

    let hasAccess = false;
    
    if (roleName === 'familyadmin' || roleName === 'familyview' || roleName === 'familyviewer') {
      // Para familias, verificar que el estudiante está en sus asociaciones
      // Buscar tanto en 'active' como en 'pending' para mayor flexibilidad
      const association = await Shared.findOne({ 
        user: currentUser._id, 
        student: studentId, 
        status: { $in: ['active', 'pending'] }
      });
      
      console.log(`🔍 [STUDENT ACTION LOG] Verificando acceso familiar - Usuario: ${currentUser._id}, Estudiante: ${studentId}`);
      console.log(`🔍 [STUDENT ACTION LOG] Asociación encontrada:`, association ? 'Sí' : 'No');
      
      hasAccess = !!association;
      
      // Si no se encontró con student, intentar buscar por division si el estudiante pertenece a esa división
      if (!hasAccess && student.division) {
        const divisionAssociation = await Shared.findOne({
          user: currentUser._id,
          division: student.division._id,
          status: { $in: ['active', 'pending'] }
        });
        console.log(`🔍 [STUDENT ACTION LOG] Asociación por división encontrada:`, divisionAssociation ? 'Sí' : 'No');
        hasAccess = !!divisionAssociation;
      }
    } else if (roleName === 'coordinador') {
      hasAccess = student.division._id.toString() === currentUser.division?.toString();
    } else if (roleName === 'adminaccount') {
      hasAccess = student.division.cuenta.toString() === req.userInstitution._id.toString();
    }

    if (!hasAccess) {
      console.log(`❌ [STUDENT ACTION LOG] Acceso denegado - Usuario: ${currentUser._id}, Rol: ${roleName}, Estudiante: ${studentId}`);
      return res.status(403).json({ success: false, message: 'No tienes acceso a este estudiante' });
    }

    let dateFilter = {};
    if (fecha) {
      const startDate = new Date(fecha + 'T00:00:00.000Z');
      const endDate = new Date(fecha + 'T23:59:59.999Z');
      dateFilter = { fechaAccion: { $gte: startDate, $lte: endDate } };
    } else if (fechaInicio && fechaFin) {
      // Expandir el rango significativamente para asegurar que incluya todas las acciones
      // Considerar timezone negativo (hasta -12 horas) y positivo (hasta +14 horas)
      const startDate = new Date(fechaInicio + 'T00:00:00.000Z');
      startDate.setUTCDate(startDate.getUTCDate() - 2); // 2 días antes para timezone negativo extremo
      startDate.setUTCHours(0, 0, 0, 0);
      
      const endDate = new Date(fechaFin + 'T23:59:59.999Z');
      endDate.setUTCDate(endDate.getUTCDate() + 2); // 2 días después para timezone positivo extremo
      endDate.setUTCHours(23, 59, 59, 999);
      
      dateFilter = { 
        fechaAccion: { 
          $gte: startDate, 
          $lte: endDate 
        } 
      };
      
      console.log('📅 [STUDENT ACTION LOG] Filtro por rango de fechas (expandido para timezone):', {
        fechaInicio,
        fechaFin,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        startDateLocal: startDate.toLocaleString(),
        endDateLocal: endDate.toLocaleString()
      });
    }

    console.log('🔍 [STUDENT ACTION LOG] Query de búsqueda:', {
      estudiante: studentId,
      dateFilter: dateFilter
    });

    const actions = await StudentActionLog.find({
      estudiante: studentId,
      ...dateFilter
    })
    .populate('accion', 'nombre descripcion color categoria icono')
    .populate('registradoPor', 'name email')
    .populate('division', 'nombre descripcion')
    .sort({ fechaAccion: -1 });

    console.log('✅ [STUDENT ACTION LOG] Total acciones encontradas:', actions.length);
    
    // Log detallado de las acciones encontradas
    if (actions.length > 0) {
      console.log('📋 [STUDENT ACTION LOG] Acciones encontradas:');
      actions.forEach((action, index) => {
        console.log(`  ${index + 1}. ${action.accion?.nombre || 'Sin nombre'} - Fecha: ${action.fechaAccion} - Valor: ${action.valor || 'Sin valor'}`);
      });
    } else {
      console.log('⚠️ [STUDENT ACTION LOG] No se encontraron acciones con los filtros aplicados');
      
      // Debug: buscar todas las acciones del estudiante sin filtro de fecha para ver qué fechas tienen
      const allActions = await StudentActionLog.find({ estudiante: studentId })
        .populate('accion', 'nombre')
        .sort({ fechaAccion: -1 })
        .limit(10)
        .lean();
      console.log('🔍 [STUDENT ACTION LOG] DEBUG - Últimas 10 acciones del estudiante (sin filtro):', allActions.length);
      allActions.forEach((action, index) => {
        const actionDate = new Date(action.fechaAccion);
        const actionDateStr = actionDate.toISOString().split('T')[0];
        console.log(`  ${index + 1}. ${action.accion?.nombre || 'Sin nombre'} - Fecha UTC: ${action.fechaAccion} - Fecha Local: ${actionDate.toLocaleString()} - Fecha String: ${actionDateStr}`);
      });
    }

    // Log para verificar que el campo valor está presente
    const actionsWithValue = actions.filter(a => a.valor);
    console.log('✅ [STUDENT ACTION LOG] Acciones con valor:', actionsWithValue.length);
    if (actionsWithValue.length > 0) {
      console.log('✅ [STUDENT ACTION LOG] Ejemplo de acción con valor:', {
        accion: actionsWithValue[0].accion?.nombre,
        valor: actionsWithValue[0].valor
      });
    }

    res.json({
      success: true,
      message: 'Acciones obtenidas exitosamente',
      data: actions
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTION LOG] Error obteniendo acciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Obtener logs por división
 */
exports.getLogsByDivision = async (req, res) => {
  try {
    const { divisionId } = req.params;
    const { fecha, fechaInicio, fechaFin } = req.query;

    const division = await Grupo.findById(divisionId);
    if (!division) {
      return res.status(404).json({ success: false, message: 'División no encontrada' });
    }

    if (req.userInstitution && division.cuenta.toString() !== req.userInstitution._id.toString()) {
      return res.status(403).json({ success: false, message: 'No tienes acceso a esta división' });
    }

    let dateFilter = {};
    if (fecha) {
      const startDate = new Date(fecha + 'T00:00:00.000Z');
      const endDate = new Date(fecha + 'T23:59:59.999Z');
      dateFilter = { fechaAccion: { $gte: startDate, $lte: endDate } };
    } else if (fechaInicio && fechaFin) {
      const startDate = new Date(fechaInicio + 'T00:00:00.000Z');
      startDate.setUTCDate(startDate.getUTCDate() - 1);
      
      const endDate = new Date(fechaFin + 'T23:59:59.999Z');
      endDate.setUTCDate(endDate.getUTCDate() + 1);
      endDate.setUTCHours(23, 59, 59, 999);
      
      dateFilter = { 
        fechaAccion: { 
          $gte: startDate, 
          $lte: endDate 
        } 
      };
    }

    const query = {
      division: divisionId,
      ...dateFilter
    };
    
    const actions = await StudentActionLog.find(query)
    .populate('estudiante', 'nombre apellido avatar')
    .populate('accion', 'nombre descripcion color categoria icono')
    .populate('registradoPor', 'name email')
    .sort({ fechaAccion: -1 });

    res.json({
      success: true,
      message: 'Acciones obtenidas exitosamente',
      data: actions
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTION LOG] Error obteniendo acciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Obtener logs por cuenta
 */
exports.getLogsByAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { fecha, fechaInicio, fechaFin, divisionId } = req.query;

    if (req.userInstitution && accountId !== req.userInstitution._id.toString()) {
      return res.status(403).json({ success: false, message: 'No tienes acceso a esta cuenta' });
    }

    let dateFilter = {};
    if (fecha) {
      const startDate = new Date(fecha + 'T00:00:00.000Z');
      const endDate = new Date(fecha + 'T23:59:59.999Z');
      dateFilter = { fechaAccion: { $gte: startDate, $lte: endDate } };
    } else if (fechaInicio && fechaFin) {
      const startDate = new Date(fechaInicio + 'T00:00:00.000Z');
      startDate.setUTCDate(startDate.getUTCDate() - 1);
      
      const endDate = new Date(fechaFin + 'T23:59:59.999Z');
      endDate.setUTCDate(endDate.getUTCDate() + 1);
      endDate.setUTCHours(23, 59, 59, 999);
      
      dateFilter = { 
        fechaAccion: { 
          $gte: startDate, 
          $lte: endDate 
        } 
      };
    }

    const query = {
      account: accountId,
      ...dateFilter
    };

    if (divisionId) {
      query.division = divisionId;
    }

    const actions = await StudentActionLog.find(query)
    .populate('estudiante', 'nombre apellido avatar')
    .populate('accion', 'nombre descripcion color categoria icono')
    .populate('registradoPor', 'name email')
    .populate('division', 'nombre descripcion')
    .sort({ fechaAccion: -1 });

    res.json({
      success: true,
      message: 'Acciones obtenidas exitosamente',
      data: actions
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTION LOG] Error obteniendo acciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

