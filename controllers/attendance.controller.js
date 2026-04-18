const Asistencia = require('../shared/models/Asistencia');
const User = require('../shared/models/User');
const Account = require('../shared/models/Account');
const Grupo = require('../shared/models/Grupo');
const Shared = require('../shared/models/Shared');
const Student = require('../shared/models/Student');
const mongoose = require('mongoose');

/**
 * Listar asistencias (legacy endpoint)
 */
exports.listAsistencias = async (req, res) => {
  try {
    const { accountId, grupoId, alumnoId, fechaInicio, fechaFin, page = 1, limit = 20 } = req.query;
    const currentUser = req.user;

    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver asistencias'
      });
    }

    let query = { activo: true };

    if (currentUser.role?.nombre === 'superadmin') {
      if (accountId) query.account = accountId;
    } else if (currentUser.role?.nombre === 'adminaccount') {
      const userAccounts = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      const accountIds = userAccounts.map(ah => ah.account);
      query.account = { $in: accountIds };
      if (accountId) {
        if (!accountIds.includes(accountId)) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para ver asistencias de esta cuenta'
          });
        }
        query.account = accountId;
      }
    } else if (currentUser.role?.nombre === 'coordinador') {
      if (accountId) query.account = accountId;
    }

    if (grupoId) query.division = grupoId;
    if (alumnoId) query.alumno = alumnoId;
    if (fechaInicio && fechaFin) {
      query.fecha = { $gte: fechaInicio, $lte: fechaFin };
    }

    const total = await Asistencia.countDocuments(query);
    const asistencias = await Asistencia.find(query)
      .populate('alumno', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('grupo', 'nombre descripcion')
      .populate('registradoPor', 'name email')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ fecha: -1, horaLlegada: -1 });

    res.json({
      success: true,
      data: {
        asistencias: asistencias.map(asistencia => ({
          _id: asistencia._id,
          alumno: asistencia.alumno,
          account: asistencia.account,
          grupo: asistencia.grupo,
          fecha: asistencia.fecha,
          estado: asistencia.estado,
          horaLlegada: asistencia.horaLlegada,
          horaSalida: asistencia.horaSalida,
          observaciones: asistencia.observaciones,
          registradoPor: asistencia.registradoPor,
          activo: asistencia.activo,
          createdAt: asistencia.createdAt,
          updatedAt: asistencia.updatedAt
        })),
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error listando asistencias:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Crear asistencia (legacy endpoint)
 */
exports.createAsistencia = async (req, res) => {
  try {
    const { alumnoId, accountId, grupoId, fecha, estado, horaLlegada, horaSalida, observaciones } = req.body;
    const currentUser = req.user;

    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para registrar asistencias'
      });
    }

    if (!alumnoId || !accountId || !grupoId || !fecha) {
      return res.status(400).json({
        success: false,
        message: 'alumnoId, accountId, grupoId y fecha son requeridos'
      });
    }

    const alumno = await User.findById(alumnoId);
    if (!alumno) {
      return res.status(404).json({
        success: false,
        message: 'Alumno no encontrado'
      });
    }

    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(400).json({
        success: false,
        message: 'La cuenta especificada no existe'
      });
    }

    const grupo = await Grupo.findById(grupoId);
    if (!grupo) {
      return res.status(404).json({
        success: false,
        message: 'Grupo no encontrado'
      });
    }

    if (currentUser.role?.nombre === 'adminaccount') {
      const userAccounts = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      const accountIds = userAccounts.map(ah => ah.account.toString());
      if (!accountIds.includes(accountId)) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para registrar asistencias en esta cuenta'
        });
      }
    }

    const fechaAsistencia = new Date(fecha);
    const asistenciaExistente = await Asistencia.existeAsistencia(alumnoId, fechaAsistencia, grupoId);
    
    if (asistenciaExistente) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una asistencia registrada para este alumno en esta fecha y grupo'
      });
    }

    const nuevaAsistencia = new Asistencia({
      alumno: alumnoId,
      account: accountId,
      grupo: grupoId,
      fecha: fechaAsistencia,
      estado: estado || 'presente',
      horaLlegada: horaLlegada ? new Date(horaLlegada) : null,
      horaSalida: horaSalida ? new Date(horaSalida) : null,
      observaciones,
      registradoPor: currentUser._id
    });

    await nuevaAsistencia.save();

    const asistenciaGuardada = await Asistencia.findById(nuevaAsistencia._id)
      .populate('alumno', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('grupo', 'nombre descripcion')
      .populate('registradoPor', 'name email');

    res.status(201).json({
      success: true,
      message: 'Asistencia registrada exitosamente',
      data: asistenciaGuardada
    });
  } catch (error) {
    console.error('Error registrando asistencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Actualizar asistencia
 */
exports.updateAsistencia = async (req, res) => {
  try {
    const { asistenciaId } = req.params;
    const { estado, horaLlegada, horaSalida, observaciones } = req.body;
    const currentUser = req.user;

    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar asistencias'
      });
    }

    const asistencia = await Asistencia.findById(asistenciaId)
      .populate('alumno', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('grupo', 'nombre descripcion')
      .populate('registradoPor', 'name email');

    if (!asistencia) {
      return res.status(404).json({
        success: false,
        message: 'Asistencia no encontrada'
      });
    }

    if (currentUser.role?.nombre === 'adminaccount') {
      const userAccounts = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      const accountIds = userAccounts.map(ah => ah.account.toString());
      if (!accountIds.includes(asistencia.account._id.toString())) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para actualizar asistencias de esta cuenta'
        });
      }
    }

    if (estado) asistencia.estado = estado;
    if (horaLlegada !== undefined) asistencia.horaLlegada = horaLlegada ? new Date(horaLlegada) : null;
    if (horaSalida !== undefined) asistencia.horaSalida = horaSalida ? new Date(horaSalida) : null;
    if (observaciones !== undefined) asistencia.observaciones = observaciones;

    await asistencia.save();

    res.json({
      success: true,
      message: 'Asistencia actualizada exitosamente',
      data: asistencia
    });
  } catch (error) {
    console.error('Error actualizando asistencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Eliminar asistencia (marcar como inactiva)
 */
exports.deleteAsistencia = async (req, res) => {
  try {
    const { asistenciaId } = req.params;
    const currentUser = req.user;

    if (!['adminaccount', 'superadmin'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar asistencias'
      });
    }

    const asistencia = await Asistencia.findById(asistenciaId)
      .populate('alumno', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('grupo', 'nombre descripcion');

    if (!asistencia) {
      return res.status(404).json({
        success: false,
        message: 'Asistencia no encontrada'
      });
    }

    if (currentUser.role?.nombre === 'adminaccount') {
      const userAccounts = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      const accountIds = userAccounts.map(ah => ah.account.toString());
      if (!accountIds.includes(asistencia.account._id.toString())) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para eliminar asistencias de esta cuenta'
        });
      }
    }

    asistencia.activo = false;
    await asistencia.save();

    res.json({
      success: true,
      message: 'Asistencia eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error eliminando asistencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Guardar asistencia (nuevo formato con estudiantes array)
 */
exports.saveAsistencia = async (req, res) => {
  try {
    const { accountId, divisionId, estudiantes, retiradas } = req.body;
    const { userId } = req.user;

    if (!accountId || !divisionId || !estudiantes || !Array.isArray(estudiantes)) {
      return res.status(400).json({
        success: false,
        message: 'accountId, divisionId y estudiantes (array) son requeridos'
      });
    }

    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(400).json({
        success: false,
        message: 'La cuenta especificada no existe'
      });
    }

    const division = await Grupo.findById(divisionId);
    if (!division) {
      return res.status(400).json({
        success: false,
        message: 'La división especificada no existe'
      });
    }

    const userAssociation = await Shared.findOne({
      user: userId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para registrar asistencia en esta cuenta'
      });
    }

    const studentIds = estudiantes.map(e => e.studentId);
    const students = await Student.find({
      _id: { $in: studentIds },
      account: accountId,
      division: divisionId
    });

    if (students.length !== estudiantes.length) {
      return res.status(400).json({
        success: false,
        message: 'Algunos estudiantes no existen o no pertenecen a la división especificada'
      });
    }

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const fechaStr = `${yyyy}-${mm}-${dd}`;

    const existingAsistencia = await Asistencia.findOne({
      account: accountId,
      division: divisionId,
      fecha: fechaStr
    });

    if (existingAsistencia) {
      existingAsistencia.estudiantes = estudiantes.map(e => {
        const studentData = {
          student: e.studentId,
          presente: e.presente
        };
        
        if (retiradas && retiradas[e.studentId]) {
          const retirada = retiradas[e.studentId];
          studentData.retirado = true;
          studentData.retiradoPor = retirada.withdrawnBy;
          studentData.retiradoPorNombre = retirada.withdrawnByName;
          studentData.retiradoEn = new Date();
        }
        
        return studentData;
      });
      
      await existingAsistencia.save();
      
      const presentes = estudiantes.filter(e => e.presente).length;
      const total = estudiantes.length;

      return res.json({
        success: true,
        message: `Asistencia actualizada exitosamente. ${presentes} de ${total} estudiantes presentes.`,
        data: {
          id: existingAsistencia._id,
          fecha: existingAsistencia.fecha,
          total: total,
          presentes: presentes
        }
      });
    }

    const asistenciaData = {
      account: accountId,
      division: divisionId,
      fecha: fechaStr,
      estudiantes: estudiantes.map(e => {
        const studentData = {
          student: e.studentId,
          presente: e.presente
        };
        
        if (retiradas && retiradas[e.studentId]) {
          const retirada = retiradas[e.studentId];
          studentData.retirado = true;
          studentData.retiradoPor = retirada.withdrawnBy;
          studentData.retiradoPorNombre = retirada.withdrawnByName;
          studentData.retiradoEn = new Date();
        }
        
        return studentData;
      }),
      creadoPor: userId
    };

    const asistencia = new Asistencia(asistenciaData);
    await asistencia.save();

    const presentes = estudiantes.filter(e => e.presente).length;
    const total = estudiantes.length;

    res.status(201).json({
      success: true,
      message: `Asistencia guardada exitosamente. ${presentes} de ${total} estudiantes presentes.`,
      data: {
        id: asistencia._id,
        fecha: asistencia.fecha,
        total: total,
        presentes: presentes
      }
    });
  } catch (error) {
    console.error('Error guardando asistencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Obtener asistencia por fecha
 */
exports.getAsistenciaByDate = async (req, res) => {
  try {
    const { accountId, divisionId, date } = req.query;
    if (!accountId || !divisionId) {
      return res.status(400).json({ success: false, message: 'accountId y divisionId son requeridos' });
    }
    
    const fechaStr = date || new Date().toISOString().split('T')[0];
    
    const asistencia = await Asistencia.findOne({
      account: accountId,
      division: divisionId,
      fecha: fechaStr
    });
    
    if (!asistencia) {
      return res.json({ success: true, data: null });
    }
    
    res.json({ success: true, data: asistencia });
  } catch (error) {
    console.error('Error obteniendo asistencia por fecha:', error);
    res.status(500).json({ success: false, message: 'Error interno', error: error.message });
  }
};

/**
 * Guardar retirada individual
 */
exports.saveRetirada = async (req, res) => {
  try {
    const { accountId, divisionId, studentId, withdrawnBy, withdrawnByName } = req.body;
    const { userId } = req.user;

    if (!accountId || !divisionId || !studentId || !withdrawnBy || !withdrawnByName) {
      return res.status(400).json({
        success: false,
        message: 'accountId, divisionId, studentId, withdrawnBy y withdrawnByName son requeridos'
      });
    }

    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(400).json({
        success: false,
        message: 'La cuenta especificada no existe'
      });
    }

    const division = await Grupo.findById(divisionId);
    if (!division) {
      return res.status(400).json({
        success: false,
        message: 'La división especificada no existe'
      });
    }

    const student = await Student.findOne({
      _id: studentId,
      account: accountId,
      division: divisionId
    });

    if (!student) {
      return res.status(400).json({
        success: false,
        message: 'El estudiante no existe o no pertenece a la división especificada'
      });
    }

    const userAssociation = await Shared.findOne({
      user: userId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para registrar retiradas en esta cuenta'
      });
    }

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const fechaStr = `${yyyy}-${mm}-${dd}`;

    let asistencia = await Asistencia.findOne({
      account: accountId,
      division: divisionId,
      fecha: fechaStr
    });

    if (!asistencia) {
      asistencia = new Asistencia({
        account: accountId,
        division: divisionId,
        fecha: fechaStr,
        estudiantes: [],
        creadoPor: userId
      });
    }

    let studentIndex = asistencia.estudiantes.findIndex(
      e => e.student.toString() === studentId
    );

    if (studentIndex === -1) {
      asistencia.estudiantes.push({
        student: studentId,
        presente: true,
        retirado: true,
        retiradoPor: withdrawnBy,
        retiradoPorNombre: withdrawnByName,
        retiradoEn: new Date()
      });
    } else {
      asistencia.estudiantes[studentIndex].retirado = true;
      asistencia.estudiantes[studentIndex].retiradoPor = withdrawnBy;
      asistencia.estudiantes[studentIndex].retiradoPorNombre = withdrawnByName;
      asistencia.estudiantes[studentIndex].retiradoEn = new Date();
    }

    await asistencia.save();

    res.json({
      success: true,
      message: 'Retirada registrada exitosamente',
      data: {
        studentId,
        withdrawnBy,
        withdrawnByName,
        retiradoEn: new Date()
      }
    });
  } catch (error) {
    console.error('Error guardando retirada:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Obtener asistencias de un estudiante específico
 */
exports.getStudentAttendance = async (req, res) => {
  try {
    const { studentId, accountId, startDate, endDate } = req.query;
    const { userId } = req.user;

    if (!studentId || !accountId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'studentId, accountId, startDate y endDate son requeridos'
      });
    }

    const userAssociation = await Shared.findOne({
      user: userId,
      student: studentId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver las asistencias de este alumno'
      });
    }

    const asistencias = await Asistencia.find({
      account: accountId,
      fecha: {
        $gte: startDate,
        $lte: endDate
      }
    }).populate('estudiantes.student', 'nombre apellido');

    const studentAttendances = [];
    
    asistencias.forEach(asistencia => {
      const studentAttendance = asistencia.estudiantes.find(
        e => e.student._id.toString() === studentId
      );
      
      if (studentAttendance) {
        studentAttendances.push({
          _id: asistencia._id,
          fecha: asistencia.fecha,
          presente: studentAttendance.presente,
          retirado: studentAttendance.retirado || false,
          retiradoPor: studentAttendance.retiradoPor || null,
          retiradoPorNombre: studentAttendance.retiradoPorNombre || null,
          retiradoEn: studentAttendance.retiradoEn || null,
          ingresoEn: studentAttendance.ingresoEn || asistencia.createdAt || null
        });
      }
    });

    const student = await Student.findById(studentId)
      .populate('account', 'nombre')
      .populate('division', 'nombre');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Alumno no encontrado'
      });
    }

    res.json({
      success: true,
      data: {
        student: {
          _id: student._id,
          nombre: student.nombre,
          apellido: student.apellido
        },
        attendances: studentAttendances
      }
    });
  } catch (error) {
    console.error('Error obteniendo asistencias del estudiante:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Obtener calendario de asistencias (backoffice)
 */
exports.getCalendarAsistencias = async (req, res) => {
  try {
    const { grupoId, fechaInicio, fechaFin } = req.query;
    
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
    
    let query = {};
    
    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin ve todas las asistencias
    } else if (currentUser.role?.nombre === 'adminaccount') {
      if (req.userInstitution) {
        query.account = req.userInstitution._id;
      } else {
        return res.status(403).json({
          success: false,
          message: 'No tienes una institución asignada'
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para acceder a esta sección'
      });
    }
    
    if (grupoId) {
      query.division = grupoId;
    }
    
    if (fechaInicio && fechaFin) {
      query.fecha = {
        $gte: fechaInicio,
        $lte: fechaFin
      };
    }
    
    const asistencias = await Asistencia.find(query)
      .select('fecha estudiantes')
      .sort({ fecha: -1 });
    
    const calendarData = {};
    asistencias.forEach(asistencia => {
      calendarData[asistencia.fecha] = {
        fecha: asistencia.fecha,
        totalEstudiantes: asistencia.estudiantes.length,
        presentes: asistencia.estudiantes.filter(e => e.presente).length,
        ausentes: asistencia.estudiantes.filter(e => !e.presente).length
      };
    });
    
    res.json({
      success: true,
      data: calendarData
    });
  } catch (error) {
    console.error('Error obteniendo calendario de asistencias:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener datos del calendario'
    });
  }
};

/**
 * Obtener asistencias de un día específico (backoffice)
 */
exports.getDayAsistencias = async (req, res) => {
  try {
    const { fecha } = req.params;
    const { grupoId } = req.query;
    
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
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    let query = { fecha };
    
    if (user.role?.nombre === 'superadmin') {
      // Superadmin ve todas las asistencias
    } else if (user.role?.nombre === 'adminaccount') {
      query.account = user.account?._id;
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para acceder a esta sección'
      });
    }
    
    if (grupoId) {
      query.division = grupoId;
    }
    
    const asistencias = await Asistencia.find(query)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('creadoPor', 'nombre email')
      .populate({
        path: 'estudiantes.student',
        select: 'nombre apellido email avatar'
      })
      .sort({ createdAt: -1 })
      .lean();
    
    for (let asistencia of asistencias) {
      for (let estudiante of asistencia.estudiantes) {
        const studentId = estudiante.estudiante || estudiante.student;
        
        if (studentId && mongoose.Types.ObjectId.isValid(studentId)) {
          const studentData = await Student.findById(studentId).select('nombre apellido email avatar');
          if (studentData) {
            estudiante.student = studentData;
          }
        }
      }
    }
    
    res.json({
      success: true,
      data: asistencias
    });
  } catch (error) {
    console.error('Error obteniendo asistencias del día:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener asistencias del día'
    });
  }
};

/**
 * Obtener asistencias del backoffice con paginación
 */
exports.getBackofficeAsistencias = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { 
      page = 1, 
      limit = 10, 
      accountId,
      grupoId,
      alumnoId,
      fechaInicio,
      fechaFin,
      estado,
      search
    } = req.query;
    
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    let query = {};
    
    if (user.role?.nombre === 'superadmin') {
      if (accountId) {
        query.account = accountId;
      }
    } else if (user.role?.nombre === 'adminaccount') {
      query.account = user.account?._id;
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para acceder a esta sección'
      });
    }
    
    if (grupoId) {
      query.division = grupoId;
    }
    
    if (alumnoId) {
      query.alumno = alumnoId;
    }
    
    if (fechaInicio && fechaFin) {
      query.fecha = {
        $gte: fechaInicio,
        $lte: fechaFin
      };
    } else if (fechaInicio) {
      query.fecha = { $gte: fechaInicio };
    } else if (fechaFin) {
      query.fecha = { $lte: fechaFin };
    }
    
    if (estado && estado !== 'all') {
      query.estado = estado;
    }
    
    if (search) {
      query.$or = [
        { 'alumno.nombre': { $regex: search, $options: 'i' } },
        { 'alumno.email': { $regex: search, $options: 'i' } },
        { observaciones: { $regex: search, $options: 'i' } }
      ];
    }
    
    const total = await Asistencia.countDocuments(query);
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const asistencias = await Asistencia.find(query)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('creadoPor', 'nombre email')
      .populate({
        path: 'estudiantes.student',
        select: 'nombre apellido email avatar'
      })
      .sort({ fecha: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const currentPage = parseInt(page);
    const totalPages = Math.ceil(total / parseInt(limit));
    const hasNextPage = currentPage < totalPages;
    const hasPrevPage = currentPage > 1;
    
    res.json({
      success: true,
      data: asistencias,
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
    console.error('Error obteniendo asistencias del backoffice:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener asistencias'
    });
  }
};

/**
 * Crear asistencia desde el backoffice
 */
exports.createBackofficeAsistencia = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { alumnoId, accountId, grupoId, fecha, estado } = req.body;
    
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear asistencias'
      });
    }
    
    if (user.role?.nombre === 'adminaccount' && accountId !== user.account?._id?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear asistencias en esta cuenta'
      });
    }
    
    const alumno = await User.findById(alumnoId);
    if (!alumno) {
      return res.status(404).json({
        success: false,
        message: 'Alumno no encontrado'
      });
    }
    
    if (grupoId) {
      const grupo = await Grupo.findById(grupoId);
      if (!grupo || grupo.account.toString() !== accountId) {
        return res.status(404).json({
          success: false,
          message: 'Grupo no encontrado o no pertenece a la cuenta'
        });
      }
    }
    
    const nuevaAsistencia = new Asistencia({
      account: accountId,
      division: grupoId,
      fecha: fecha,
      estudiantes: [{
        student: alumnoId,
        presente: estado === 'presente'
      }],
      creadoPor: userId
    });
    
    await nuevaAsistencia.save();
    
    await nuevaAsistencia.populate('account', 'nombre');
    await nuevaAsistencia.populate('division', 'nombre');
    await nuevaAsistencia.populate('creadoPor', 'nombre email');
    await nuevaAsistencia.populate('estudiantes.student', 'nombre apellido email');
    
    res.status(201).json({
      success: true,
      message: 'Asistencia registrada exitosamente',
      data: nuevaAsistencia
    });
  } catch (error) {
    console.error('Error creando asistencia desde backoffice:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear asistencia'
    });
  }
};

/**
 * Actualizar asistencia desde el backoffice
 */
exports.updateBackofficeAsistencia = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { asistenciaId } = req.params;
    const { estado } = req.body;
    
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar asistencias'
      });
    }
    
    const asistencia = await Asistencia.findById(asistenciaId);
    if (!asistencia) {
      return res.status(404).json({
        success: false,
        message: 'Asistencia no encontrada'
      });
    }
    
    if (user.role?.nombre === 'adminaccount' && asistencia.account.toString() !== user.account?._id?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar esta asistencia'
      });
    }
    
    const updateData = {};
    if (estado) {
      updateData.$set = {
        'estudiantes.$.presente': estado === 'presente'
      };
    }
    
    const asistenciaActualizada = await Asistencia.findByIdAndUpdate(
      asistenciaId,
      updateData,
      { new: true }
    ).populate('account', 'nombre')
     .populate('division', 'nombre')
     .populate('creadoPor', 'nombre email')
     .populate('estudiantes.student', 'nombre apellido email');
    
    res.json({
      success: true,
      message: 'Asistencia actualizada exitosamente',
      data: asistenciaActualizada
    });
  } catch (error) {
    console.error('Error actualizando asistencia desde backoffice:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar asistencia'
    });
  }
};

/**
 * Eliminar asistencia desde el backoffice
 */
exports.deleteBackofficeAsistencia = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { asistenciaId } = req.params;
    
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar asistencias'
      });
    }
    
    const asistencia = await Asistencia.findById(asistenciaId);
    if (!asistencia) {
      return res.status(404).json({
        success: false,
        message: 'Asistencia no encontrada'
      });
    }
    
    if (user.role?.nombre === 'adminaccount' && asistencia.account.toString() !== user.account?._id?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar esta asistencia'
      });
    }
    
    await Asistencia.findByIdAndDelete(asistenciaId);
    
    res.json({
      success: true,
      message: 'Asistencia eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error eliminando asistencia desde backoffice:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar asistencia'
    });
  }
};

/**
 * Obtener estadísticas de asistencias
 */
exports.getAttendanceStats = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { accountId, fechaInicio, fechaFin } = req.query;
    
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver estadísticas'
      });
    }
    
    let query = {};
    
    if (user.role?.nombre === 'superadmin') {
      if (accountId) {
        query.account = accountId;
      }
    } else if (user.role?.nombre === 'adminaccount') {
      query.account = user.account?._id;
    }
    
    if (fechaInicio && fechaFin) {
      query.fecha = {
        $gte: fechaInicio,
        $lte: fechaFin
      };
    } else if (fechaInicio) {
      query.fecha = { $gte: fechaInicio };
    } else if (fechaFin) {
      query.fecha = { $lte: fechaFin };
    }
    
    const totalAsistencias = await Asistencia.countDocuments(query);
    
    const statsPorEstado = await Asistencia.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$estado',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const statsPorDia = await Asistencia.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$fecha' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 30 }
    ]);
    
    res.json({
      success: true,
      data: {
        totalAsistencias,
        statsPorEstado,
        statsPorDia
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas de asistencias:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas'
    });
  }
};

/**
 * Exportar asistencias a CSV
 */
exports.exportAsistencias = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { accountId, grupoId, fechaInicio, fechaFin, estado } = req.query;
    
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para exportar asistencias'
      });
    }
    
    let query = {};
    
    if (user.role?.nombre === 'superadmin') {
      if (accountId) {
        query.account = accountId;
      }
    } else if (user.role?.nombre === 'adminaccount') {
      query.account = user.account?._id;
    }
    
    if (grupoId) {
      query.division = grupoId;
    }
    
    if (fechaInicio && fechaFin) {
      query.fecha = {
        $gte: fechaInicio,
        $lte: fechaFin
      };
    } else if (fechaInicio) {
      query.fecha = { $gte: fechaInicio };
    } else if (fechaFin) {
      query.fecha = { $lte: fechaFin };
    }
    
    if (estado && estado !== 'all') {
      query.estado = estado;
    }
    
    const asistencias = await Asistencia.find(query)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('creadoPor', 'nombre email')
      .populate('estudiantes.student', 'nombre apellido email')
      .sort({ fecha: -1, createdAt: -1 });
    
    const csvHeader = 'Fecha,Alumno,Email,Cuenta,Grupo,Estado,Hora Llegada,Hora Salida,Observaciones,Registrado Por\n';
    
    const csvRows = asistencias.flatMap(asistencia => {
      const fecha = new Date(asistencia.fecha).toLocaleDateString('es-ES');
      const cuenta = asistencia.account?.nombre || 'N/A';
      const grupo = asistencia.division?.nombre || 'N/A';
      const registradoPor = asistencia.creadoPor?.nombre || 'N/A';
      
      return asistencia.estudiantes.map(estudiante => {
        const alumno = estudiante.student ? `${estudiante.student.nombre} ${estudiante.student.apellido}` : 'N/A';
        const email = estudiante.student?.email || 'N/A';
        const estado = estudiante.presente ? 'presente' : 'ausente';
        
        return `"${fecha}","${alumno}","${email}","${cuenta}","${grupo}","${estado}","N/A","N/A","N/A","${registradoPor}"`;
      });
    }).join('\n');
    
    const csvContent = csvHeader + csvRows;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="asistencias_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error exportando asistencias:', error);
    res.status(500).json({
      success: false,
      message: 'Error al exportar asistencias'
    });
  }
};

