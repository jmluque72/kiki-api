const Asistencia = require('../shared/models/Asistencia');
const User = require('../shared/models/User');
const Student = require('../shared/models/Student');
const Group = require('../shared/models/Group');
const mongoose = require('mongoose');

/**
 * Obtener calendario de asistencias
 */
exports.getCalendarAsistencias = async (req, res) => {
  try {
    const { 
      grupoId,
      fechaInicio,
      fechaFin
    } = req.query;
    
    console.log('📅 [CALENDAR ASISTENCIAS] Parámetros:', { grupoId, fechaInicio, fechaFin });
    
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
    
    // Construir query base
    let query = {};
    
    // Lógica según el rol
    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin ve todas las asistencias
    } else if (currentUser.role?.nombre === 'adminaccount') {
      // Adminaccount ve todas las asistencias de su cuenta
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
    
    // Filtros adicionales
    if (grupoId) {
      query.division = grupoId;
    }
    
    if (fechaInicio && fechaFin) {
      query.fecha = {
        $gte: fechaInicio,
        $lte: fechaFin
      };
    }
    
    console.log('📅 [CALENDAR ASISTENCIAS] Query:', JSON.stringify(query, null, 2));
    
    // Obtener solo fechas y conteos (sin populate para mejor rendimiento)
    const asistencias = await Asistencia.find(query)
      .select('fecha estudiantes')
      .sort({ fecha: -1 });
    
    // Crear mapa de fechas con conteos
    const calendarData = {};
    asistencias.forEach(asistencia => {
      calendarData[asistencia.fecha] = {
        fecha: asistencia.fecha,
        totalEstudiantes: asistencia.estudiantes.length,
        presentes: asistencia.estudiantes.filter(e => e.presente).length,
        ausentes: asistencia.estudiantes.filter(e => !e.presente).length
      };
    });
    
    console.log('📅 [CALENDAR ASISTENCIAS] Datos del calendario:', Object.keys(calendarData).length, 'días');
    
    res.json({
      success: true,
      data: calendarData
    });

  } catch (error) {
    console.error('❌ [CALENDAR ASISTENCIAS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener datos del calendario'
    });
  }
};

/**
 * Obtener asistencias de un día específico
 */
exports.getDayAsistencias = async (req, res) => {
  try {
    const { fecha } = req.params;
    const { grupoId } = req.query;
    
    console.log('📋 [DAY ASISTENCIAS] Fecha:', fecha);
    console.log('📋 [DAY ASISTENCIAS] GrupoId:', grupoId);
    
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
    console.log('📋 [DAY ASISTENCIAS] Usuario:', userId);
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Construir query base
    let query = { fecha };
    
    // Lógica según el rol
    if (user.role?.nombre === 'superadmin') {
      // Superadmin ve todas las asistencias
    } else if (user.role?.nombre === 'adminaccount') {
      // Adminaccount ve todas las asistencias de su cuenta
      query.account = user.account?._id;
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para acceder a esta sección'
      });
    }
    
    // Filtros adicionales
    if (grupoId) {
      query.division = grupoId;
    }
    
    console.log('📋 [DAY ASISTENCIAS] Query:', JSON.stringify(query, null, 2));
    
    // Obtener asistencias con todos los datos poblados
    const asistencias = await Asistencia.find(query)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('creadoPor', 'nombre email')
      .populate({
        path: 'estudiantes.student',
        select: 'nombre apellido email avatar'
      })
      .sort({ createdAt: -1 })
      .lean(); // Usar lean() para obtener objetos planos
    
    // Hacer populate manual de los estudiantes ya que hay inconsistencia entre modelo y datos
    for (let asistencia of asistencias) {
      for (let estudiante of asistencia.estudiantes) {
        // El campo en los datos reales se llama 'estudiante', no 'student'
        const studentId = estudiante.estudiante || estudiante.student;
        
        if (studentId && mongoose.Types.ObjectId.isValid(studentId)) {
          const studentData = await Student.findById(studentId).select('nombre apellido email avatar');
          if (studentData) {
            // Reemplazar el ID con los datos del estudiante
            estudiante.student = studentData;
          }
        }
      }
    }
    
    console.log('📋 [DAY ASISTENCIAS] Asistencias encontradas:', asistencias.length);
    
    res.json({
      success: true,
      data: asistencias
    });

  } catch (error) {
    console.error('❌ [DAY ASISTENCIAS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener asistencias del día'
    });
  }
};

/**
 * Obtener asistencias con paginación
 */
exports.getAsistencias = async (req, res) => {
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
    
    console.log('📊 [BACKOFFICE ASISTENCIAS] Usuario:', userId);
    console.log('📊 [BACKOFFICE ASISTENCIAS] Parámetros:', { accountId, grupoId, alumnoId, fechaInicio, fechaFin, estado, search });
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    console.log('📊 [BACKOFFICE ASISTENCIAS] Rol del usuario:', user.role?.nombre);
    
    // Construir query base
    let query = {};
    
    // Lógica según el rol
    if (user.role?.nombre === 'superadmin') {
      // Superadmin ve todas las asistencias de todas las cuentas
      if (accountId) {
        query.account = accountId;
      }
    } else if (user.role?.nombre === 'adminaccount') {
      // Adminaccount ve todas las asistencias de su cuenta
      query.account = user.account?._id;
    } else {
      // Otros roles no tienen acceso al backoffice
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para acceder a esta sección'
      });
    }
    
    // Filtros adicionales
    if (grupoId) {
      query.division = grupoId;
    }
    
    if (alumnoId) {
      query.alumno = alumnoId;
    }
    
    if (fechaInicio && fechaFin) {
      // El campo fecha es String en formato YYYY-MM-DD, no Date
      console.log('📊 [BACKOFFICE ASISTENCIAS] Aplicando filtro de fechas:', { fechaInicio, fechaFin });
      query.fecha = {
        $gte: fechaInicio,
        $lte: fechaFin
      };
    } else if (fechaInicio) {
      console.log('📊 [BACKOFFICE ASISTENCIAS] Aplicando filtro fecha inicio:', fechaInicio);
      query.fecha = { $gte: fechaInicio };
    } else if (fechaFin) {
      console.log('📊 [BACKOFFICE ASISTENCIAS] Aplicando filtro fecha fin:', fechaFin);
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
    
    console.log('📊 [BACKOFFICE ASISTENCIAS] Query final:', JSON.stringify(query, null, 2));
    console.log('📊 [BACKOFFICE ASISTENCIAS] Query fecha específico:', JSON.stringify(query.fecha, null, 2));
    
    // Obtener total de asistencias para la paginación
    const total = await Asistencia.countDocuments(query);
    
    // Calcular skip para paginación
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Obtener asistencias con paginación
    const asistencias = await Asistencia.find(query)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('creadoPor', 'nombre email')
      .populate({
        path: 'estudiantes.student',
        select: 'nombre apellido email avatar',
        populate: {
          path: 'avatar',
          select: 'url'
        }
      })
      .sort({ fecha: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    console.log('📊 [BACKOFFICE ASISTENCIAS] Asistencias encontradas:', asistencias.length);
    
    // Calcular información de paginación
    const currentPage = parseInt(page);
    const totalPages = Math.ceil(total / parseInt(limit));
    const hasNextPage = currentPage < totalPages;
    const hasPrevPage = currentPage > 1;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS] Paginación:', { currentPage, totalPages, total });
    
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
    console.error('❌ [BACKOFFICE ASISTENCIAS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener asistencias'
    });
  }
};

/**
 * Crear asistencia
 */
exports.createAsistencia = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { alumnoId, accountId, grupoId, fecha, estado, horaLlegada, horaSalida, observaciones } = req.body;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS CREATE] Usuario:', userId);
    console.log('📊 [BACKOFFICE ASISTENCIAS CREATE] Datos:', { alumnoId, accountId, grupoId, fecha, estado });
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Verificar permisos
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear asistencias'
      });
    }
    
    // Para adminaccount, verificar que la cuenta pertenece al usuario
    if (user.role?.nombre === 'adminaccount' && accountId !== user.account?._id?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear asistencias en esta cuenta'
      });
    }
    
    // Verificar que el alumno existe y pertenece a la cuenta
    const alumno = await User.findById(alumnoId);
    if (!alumno) {
      return res.status(404).json({
        success: false,
        message: 'Alumno no encontrado'
      });
    }
    
    // Verificar que el grupo existe y pertenece a la cuenta (si se proporciona)
    if (grupoId) {
      const grupo = await Group.findById(grupoId);
      if (!grupo || grupo.account.toString() !== accountId) {
        return res.status(404).json({
          success: false,
          message: 'Grupo no encontrado o no pertenece a la cuenta'
        });
      }
    }
    
    // Crear la asistencia
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
    
    // Poblar los datos para la respuesta
    await nuevaAsistencia.populate('account', 'nombre');
    await nuevaAsistencia.populate('division', 'nombre');
    await nuevaAsistencia.populate('creadoPor', 'nombre email');
    await nuevaAsistencia.populate('estudiantes.student', 'nombre apellido email');
    
    console.log('📊 [BACKOFFICE ASISTENCIAS CREATE] Asistencia creada exitosamente');
    
    res.status(201).json({
      success: true,
      message: 'Asistencia registrada exitosamente',
      data: nuevaAsistencia
    });
    
  } catch (error) {
    console.error('❌ [BACKOFFICE ASISTENCIAS CREATE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear asistencia'
    });
  }
};

/**
 * Actualizar asistencia
 */
exports.updateAsistencia = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { asistenciaId } = req.params;
    const { estado, horaLlegada, horaSalida, observaciones } = req.body;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS UPDATE] Usuario:', userId);
    console.log('📊 [BACKOFFICE ASISTENCIAS UPDATE] Asistencia:', asistenciaId);
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Verificar permisos
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar asistencias'
      });
    }
    
    // Buscar la asistencia
    const asistencia = await Asistencia.findById(asistenciaId);
    if (!asistencia) {
      return res.status(404).json({
        success: false,
        message: 'Asistencia no encontrada'
      });
    }
    
    // Para adminaccount, verificar que la asistencia pertenece a su cuenta
    if (user.role?.nombre === 'adminaccount' && asistencia.account.toString() !== user.account?._id?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar esta asistencia'
      });
    }
    
    // Actualizar la asistencia
    const updateData = {};
    if (estado) {
      // Actualizar el estado del estudiante en el array
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
    
    console.log('📊 [BACKOFFICE ASISTENCIAS UPDATE] Asistencia actualizada exitosamente');
    
    res.json({
      success: true,
      message: 'Asistencia actualizada exitosamente',
      data: asistenciaActualizada
    });
    
  } catch (error) {
    console.error('❌ [BACKOFFICE ASISTENCIAS UPDATE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar asistencia'
    });
  }
};

/**
 * Eliminar asistencia
 */
exports.deleteAsistencia = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { asistenciaId } = req.params;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS DELETE] Usuario:', userId);
    console.log('📊 [BACKOFFICE ASISTENCIAS DELETE] Asistencia:', asistenciaId);
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Verificar permisos
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar asistencias'
      });
    }
    
    // Buscar la asistencia
    const asistencia = await Asistencia.findById(asistenciaId);
    if (!asistencia) {
      return res.status(404).json({
        success: false,
        message: 'Asistencia no encontrada'
      });
    }
    
    // Para adminaccount, verificar que la asistencia pertenece a su cuenta
    if (user.role?.nombre === 'adminaccount' && asistencia.account.toString() !== user.account?._id?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar esta asistencia'
      });
    }
    
    // Eliminar la asistencia
    await Asistencia.findByIdAndDelete(asistenciaId);
    
    console.log('📊 [BACKOFFICE ASISTENCIAS DELETE] Asistencia eliminada exitosamente');
    
    res.json({
      success: true,
      message: 'Asistencia eliminada exitosamente'
    });
    
  } catch (error) {
    console.error('❌ [BACKOFFICE ASISTENCIAS DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar asistencia'
    });
  }
};

/**
 * Obtener estadísticas de asistencias
 */
exports.getAsistenciasStats = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { accountId, fechaInicio, fechaFin } = req.query;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS STATS] Usuario:', userId);
    console.log('📊 [BACKOFFICE ASISTENCIAS STATS] Parámetros:', { accountId, fechaInicio, fechaFin });
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Verificar permisos
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver estadísticas'
      });
    }
    
    // Construir query base
    let query = {};
    
    // Lógica según el rol
    if (user.role?.nombre === 'superadmin') {
      if (accountId) {
        query.account = accountId;
      }
    } else if (user.role?.nombre === 'adminaccount') {
      query.account = user.account?._id;
    }
    
    // Filtros de fecha
    if (fechaInicio && fechaFin) {
      query.fecha = {
        $gte: fechaInicio,
        $lte: fechaFin
      };
    } else if (fechaInicio) {
      query.fecha = { $gte: new Date(fechaInicio) };
    } else if (fechaFin) {
      query.fecha = { $lte: fechaFin };
    }
    
    // Obtener estadísticas
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
    
    console.log('📊 [BACKOFFICE ASISTENCIAS STATS] Estadísticas calculadas exitosamente');
    
    res.json({
      success: true,
      data: {
        totalAsistencias,
        statsPorEstado,
        statsPorDia
      }
    });
    
  } catch (error) {
    console.error('❌ [BACKOFFICE ASISTENCIAS STATS] Error:', error);
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
    
    console.log('📊 [BACKOFFICE ASISTENCIAS EXPORT] Usuario:', userId);
    console.log('📊 [BACKOFFICE ASISTENCIAS EXPORT] Parámetros:', { accountId, grupoId, fechaInicio, fechaFin, estado });
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Verificar permisos
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para exportar asistencias'
      });
    }
    
    // Construir query base
    let query = {};
    
    // Lógica según el rol
    if (user.role?.nombre === 'superadmin') {
      if (accountId) {
        query.account = accountId;
      }
    } else if (user.role?.nombre === 'adminaccount') {
      query.account = user.account?._id;
    }
    
    // Filtros adicionales
    if (grupoId) {
      query.division = grupoId;
    }
    
    if (fechaInicio && fechaFin) {
      query.fecha = {
        $gte: fechaInicio,
        $lte: fechaFin
      };
    } else if (fechaInicio) {
      query.fecha = { $gte: new Date(fechaInicio) };
    } else if (fechaFin) {
      query.fecha = { $lte: fechaFin };
    }
    
    if (estado && estado !== 'all') {
      query.estado = estado;
    }
    
    // Obtener asistencias
    const asistencias = await Asistencia.find(query)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('creadoPor', 'nombre email')
      .populate('estudiantes.student', 'nombre apellido email')
      .sort({ fecha: -1, createdAt: -1 });
    
    // Generar CSV
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
    
    console.log('📊 [BACKOFFICE ASISTENCIAS EXPORT] CSV generado exitosamente');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="asistencias_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
    
  } catch (error) {
    console.error('❌ [BACKOFFICE ASISTENCIAS EXPORT] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al exportar asistencias'
    });
  }
};

