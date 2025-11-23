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

    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver acciones de estudiantes'
      });
    }

    const acciones = await StudentAction.find({ 
      division: divisionId, 
      activo: true 
    }).sort({ orden: 1, nombre: 1 });

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
    const { nombre, descripcion, division, color, orden } = req.body;
    const currentUser = req.user;

    console.log('🎯 [STUDENT ACTIONS CREATE] Datos recibidos:', { nombre, descripcion, division, color });

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

    const nuevaAccion = new StudentAction({
      nombre,
      descripcion,
      division,
      account: divisionExists.account,
      color: color || '#3B82F6',
      orden: orden || 0,
      creadoPor: currentUser._id
    });

    await nuevaAccion.save();

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
    const { nombre, descripcion, categoria, icono, color, orden, activo } = req.body;
    const currentUser = req.user;

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

    await accion.save();

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
    const { estudiante, accion, comentarios, imagenes, fechaAccion } = req.body;
    const currentUser = req.user;

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

    const actionLog = new StudentActionLog({
      estudiante,
      accion,
      registradoPor: currentUser._id,
      division: student.division._id,
      account: student.division.cuenta,
      fechaAccion: fechaAccion ? new Date(fechaAccion) : new Date(),
      comentarios,
      imagenes: imagenes || [],
      estado: 'registrado'
    });

    await actionLog.save();

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
      const association = await Shared.findOne({ 
        user: currentUser._id, 
        student: studentId, 
        status: 'active' 
      });
      hasAccess = !!association;
    } else if (roleName === 'coordinador') {
      hasAccess = student.division._id.toString() === currentUser.division?.toString();
    } else if (roleName === 'adminaccount') {
      hasAccess = student.division.cuenta.toString() === req.userInstitution._id.toString();
    }

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'No tienes acceso a este estudiante' });
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

    const actions = await StudentActionLog.find({
      estudiante: studentId,
      ...dateFilter
    })
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

