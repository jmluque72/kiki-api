const Event = require('../shared/models/Event');
const EventAuthorization = require('../shared/models/EventAuthorization');
const User = require('../shared/models/User');
const Student = require('../shared/models/Student');
const Account = require('../shared/models/Account');
const Group = require('../shared/models/Group');
const Shared = require('../shared/models/Shared');
const ActiveAssociation = require('../shared/models/ActiveAssociation');

/**
 * Debug endpoint para verificar eventos
 */
exports.debugEventos = async (req, res) => {
  try {
    const { divisionId, fechaInicio, fechaFin } = req.query;
    
    console.log('🔍 [DEBUG EVENTOS] Parámetros:', { divisionId, fechaInicio, fechaFin });
    
    // Query simple para ver todos los eventos
    let query = {};
    
    if (divisionId) {
      query.division = divisionId;
    }
    
    if (fechaInicio && fechaFin) {
      query.fecha = {
        $gte: fechaInicio,
        $lte: fechaFin
      };
    }
    
    console.log('🔍 [DEBUG EVENTOS] Query:', JSON.stringify(query, null, 2));
    
    const eventos = await Event.find(query)
      .populate('institucion', 'nombre')
      .populate('division', 'nombre')
      .lean();
    
    console.log('🔍 [DEBUG EVENTOS] Total eventos encontrados:', eventos.length);
    
    res.json({
      success: true,
      data: {
        total: eventos.length,
        eventos: eventos.map(e => ({
          _id: e._id,
          titulo: e.titulo,
          fecha: e.fecha,
          fechaISO: e.fecha.toISOString(),
          division: e.division?.nombre || 'Sin división',
          institucion: e.institucion?.nombre || 'Sin institución'
        }))
      }
    });
    
  } catch (error) {
    console.error('❌ [DEBUG EVENTOS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener eventos de debug'
    });
  }
};

/**
 * Obtener datos del calendario de eventos
 */
exports.getCalendarEvents = async (req, res) => {
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
      divisionId,
      fechaInicio,
      fechaFin
    } = req.query;
    
    console.log('📅 [CALENDAR EVENTOS] Usuario:', userId);
    console.log('📅 [CALENDAR EVENTOS] Parámetros:', { divisionId, fechaInicio, fechaFin });
    console.log('📅 [CALENDAR EVENTOS] Fechas convertidas:', { 
      fechaInicioDate: new Date(fechaInicio), 
      fechaFinDate: new Date(fechaFin) 
    });
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Construir query base
    let query = {};
    
    // Lógica según el rol
    if (user.role?.nombre === 'superadmin') {
      // Superadmin ve todos los eventos
    } else if (user.role?.nombre === 'adminaccount') {
      // Adminaccount ve todos los eventos de su cuenta
      if (user.account?._id) {
        query.institucion = user.account._id;
      } else {
        // Si no tiene account, usar cuenta por defecto
        query.institucion = '68d47433390104381d43c0ca';
      }
    } else {
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
      
      query.fecha = {
        $gte: startDate,
        $lte: endDate
      };
      
      console.log('📅 [CALENDAR EVENTOS] Filtro de fechas:', {
        fechaInicio: startDate.toISOString(),
        fechaFin: endDate.toISOString()
      });
    }
    
    console.log('📅 [CALENDAR EVENTOS] Query:', JSON.stringify(query, null, 2));
    
    // DEBUG: Buscar TODOS los eventos de la división sin filtro de fecha
    const allEvents = await Event.find({
      institucion: query.institucion,
      division: query.division
    }).lean();
    
    console.log('📅 [CALENDAR EVENTOS] TODOS los eventos de la división:', allEvents.map(e => ({
      id: e._id,
      titulo: e.titulo,
      fecha: e.fecha,
      institucion: e.institucion,
      division: e.division
    })));
    
    // Buscar eventos
    const eventos = await Event.find(query)
      .populate('institucion', 'nombre')
      .populate('division', 'nombre')
      .populate('creador', 'name email')
      .lean();
    
    console.log('📅 [CALENDAR EVENTOS] Eventos encontrados:', eventos.length);
    console.log('📅 [CALENDAR EVENTOS] Eventos detallados:', eventos.map(e => ({
      id: e._id,
      titulo: e.titulo,
      fecha: e.fecha,
      division: e.division?.nombre || 'Sin división'
    })));
    
    // Buscar autorizaciones para cada evento
    const eventosConAutorizaciones = await Promise.all(eventos.map(async (evento) => {
      const autorizaciones = await EventAuthorization.find({ event: evento._id })
        .populate('student', 'nombre email')
        .populate('familyadmin', 'name email')
        .lean();
      
      return {
        ...evento,
        autorizaciones: autorizaciones.map(auth => ({
          _id: auth._id,
          tipo: 'Autorización de evento',
          estado: auth.autorizado ? 'aprobada' : 'pendiente',
          estudiante: {
            _id: auth.student?._id,
            nombre: auth.student?.nombre,
            email: auth.student?.email
          },
          autorizadoPor: {
            _id: auth.familyadmin?._id,
            nombre: auth.familyadmin?.name
          },
          fechaAutorizacion: auth.fechaAutorizacion,
          observaciones: auth.comentarios
        }))
      };
    }));
    
    // Agrupar eventos por fecha
    const calendarData = {};
    
    eventosConAutorizaciones.forEach(evento => {
      const fecha = evento.fecha.toISOString().split('T')[0]; // YYYY-MM-DD
      
      if (!calendarData[fecha]) {
        calendarData[fecha] = {
          fecha: fecha,
          totalEventos: 0,
          eventos: []
        };
      }
      
      calendarData[fecha].totalEventos++;
      calendarData[fecha].eventos.push({
        _id: evento._id,
        titulo: evento.titulo,
        descripcion: evento.descripcion,
        fecha: evento.fecha,
        hora: evento.hora,
        lugar: evento.lugar,
        estado: evento.estado,
        participantes: evento.participantes || [],
        creador: evento.creador,
        institucion: evento.institucion,
        division: evento.division,
        autorizaciones: evento.autorizaciones || []
      });
    });
    
    console.log('📅 [CALENDAR EVENTOS] Datos del calendario generados:', Object.keys(calendarData).length, 'fechas');
    
    res.json({
      success: true,
      data: calendarData
    });
    
  } catch (error) {
    console.error('❌ [CALENDAR EVENTOS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener datos del calendario de eventos'
    });
  }
};

/**
 * Listar eventos
 */
exports.listEvents = async (req, res) => {
  try {
    const { accountId, search, page = 1, limit = 20 } = req.query;
    const currentUser = req.user;

    console.log('📅 [EVENTS] Usuario:', currentUser._id, currentUser.role?.nombre);
    console.log('📅 [EVENTS] Query params:', { accountId, search, page, limit });

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver eventos'
      });
    }

    let query = {};

    // Filtro por institución según el rol del usuario
    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin puede ver todos los eventos
      if (accountId) {
        query.institucion = accountId;
      }
    } else if (currentUser.role?.nombre === 'adminaccount') {
      // Adminaccount solo puede ver eventos de sus cuentas
      try {
        const userAccounts = await Shared.find({ 
          user: currentUser._id, 
          status: { $in: ['active', 'pending'] }
        }).select('account');
        
        const accountIds = userAccounts.map(ah => ah.account);
        query.institucion = { $in: accountIds };
        
        if (accountId) {
          // Verificar que la cuenta solicitada pertenece al usuario
          if (!accountIds.includes(accountId)) {
            return res.status(403).json({
              success: false,
              message: 'No tienes permisos para ver eventos de esta cuenta'
            });
          }
          query.institucion = accountId;
        }
      } catch (error) {
        console.error('Error obteniendo cuentas del usuario:', error);
        return res.status(500).json({
          success: false,
          message: 'Error interno del servidor'
        });
      }
    } else if (currentUser.role?.nombre === 'coordinador') {
      // Coordinador puede ver eventos de sus cuentas
      if (accountId) {
        query.institucion = accountId;
      }
    }

    // Búsqueda por título o descripción
    if (search) {
      query.$or = [
        { titulo: { $regex: search, $options: 'i' } },
        { descripcion: { $regex: search, $options: 'i' } }
      ];
    }

    console.log('📅 [EVENTS] Query final:', JSON.stringify(query, null, 2));

    // Obtener datos reales de la base de datos
    const total = await Event.countDocuments(query);
    console.log('📅 [EVENTS] Total eventos:', total);
    
    const events = await Event.find(query)
      .populate('creador', 'name email')
      .populate('institucion', 'nombre razonSocial')
      .populate('division', 'nombre descripcion')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ fecha: 1 });

    console.log('📅 [EVENTS] Eventos encontrados:', events.length);

    res.json({
      success: true,
      data: {
        events: events.map(event => ({
          _id: event._id,
          titulo: event.titulo,
          descripcion: event.descripcion,
          fecha: event.fecha,
          hora: event.hora,
          lugar: event.lugar,
          estado: event.estado,
          requiereAutorizacion: event.requiereAutorizacion,
          creador: event.creador,
          institucion: event.institucion,
          division: event.division,
          participantes: event.participantes,
          createdAt: event.createdAt,
          updatedAt: event.updatedAt
        })),
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error listando eventos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Crear evento desde backoffice (adminaccount y superadmin)
 */
exports.createEventFromBackoffice = async (req, res) => {
  try {
    const { titulo, descripcion, fecha, hora, lugar, institucion, division, estado, requiereAutorizacion } = req.body;
    const currentUser = req.user;

    console.log('📅 [CREATE EVENT BACKOFFICE] Datos recibidos:', { titulo, descripcion, fecha, hora, lugar, institucion, division, requiereAutorizacion });
    console.log('👤 [CREATE EVENT BACKOFFICE] Usuario:', currentUser._id, currentUser.role?.nombre);

    // Verificar que el usuario tiene permisos para crear eventos
    if (!['adminaccount', 'superadmin'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear eventos'
      });
    }

    // Validar campos requeridos
    if (!titulo || !descripcion || !fecha || !hora || !institucion || !division) {
      return res.status(400).json({
        success: false,
        message: 'Título, descripción, fecha, hora, institución y división son requeridos'
      });
    }

    // Verificar que la institución existe
    const institutionExists = await Account.findById(institucion);
    if (!institutionExists) {
      return res.status(404).json({
        success: false,
        message: 'La institución especificada no existe'
      });
    }

    // Verificar que la división existe
    const divisionExists = await Group.findById(division);
    if (!divisionExists) {
      return res.status(404).json({
        success: false,
        message: 'La división especificada no existe'
      });
    }

    // Crear el evento
    const newEvent = new Event({
      titulo,
      descripcion,
      fecha: new Date(fecha),
      hora,
      lugar: lugar || '',
      creador: currentUser._id,
      institucion: institucion,
      division: division,
      estado: estado || 'activo',
      requiereAutorizacion: requiereAutorizacion || false
    });

    await newEvent.save();
    console.log('📅 [CREATE EVENT BACKOFFICE] Evento creado:', newEvent._id);

    // Populate para la respuesta
    await newEvent.populate('creador', 'name email');
    await newEvent.populate('institucion', 'nombre');
    await newEvent.populate('division', 'nombre');

    res.status(201).json({
      success: true,
      message: 'Evento creado exitosamente',
      data: {
        event: {
          _id: newEvent._id,
          titulo: newEvent.titulo,
          descripcion: newEvent.descripcion,
          fecha: newEvent.fecha,
          hora: newEvent.hora,
          lugar: newEvent.lugar,
          estado: newEvent.estado,
          requiereAutorizacion: newEvent.requiereAutorizacion,
          creador: newEvent.creador,
          institucion: newEvent.institucion,
          division: newEvent.division,
          createdAt: newEvent.createdAt
        }
      }
    });

  } catch (error) {
    console.error('❌ [CREATE EVENT BACKOFFICE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al crear evento'
    });
  }
};

/**
 * Crear evento (solo coordinadores)
 */
exports.createEvent = async (req, res) => {
  try {
    const { titulo, descripcion, fecha, hora, lugar, institutionId, divisionId, requiereAutorizacion } = req.body;
    const currentUser = req.user;

    console.log('📅 [CREATE EVENT] Datos recibidos:', { titulo, descripcion, fecha, hora, lugar, institutionId, divisionId, requiereAutorizacion });
    console.log('👤 [CREATE EVENT] Usuario:', currentUser._id, currentUser.role?.nombre);

    // Verificar que el usuario tiene permisos para crear eventos
    // Para adminaccount y superadmin, usar el rol directo del usuario
    // Para coordinadores, verificar el rol efectivo desde ActiveAssociation
    const userRole = currentUser.role?.nombre;
    let effectiveRole = userRole;
    
    // Solo verificar ActiveAssociation para coordinadores
    if (userRole === 'coordinador') {
      const activeAssociation = await ActiveAssociation.findOne({ user: currentUser._id }).populate('role');
      effectiveRole = activeAssociation?.role?.nombre || userRole;
      console.log('🔍 [CREATE EVENT] Coordinador - Rol efectivo:', effectiveRole);
    } else {
      console.log('🔍 [CREATE EVENT] Rol del usuario:', effectiveRole);
    }

    if (!['coordinador', 'adminaccount', 'superadmin'].includes(effectiveRole)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear eventos'
      });
    }

    // Validar campos requeridos
    if (!titulo || !descripcion || !fecha || !hora) {
      return res.status(400).json({
        success: false,
        message: 'Título, descripción, fecha y hora son requeridos'
      });
    }

    // Para adminaccount, verificar que tenga acceso a la cuenta
    let userAssociation;
    let targetAccount;
    let targetDivision;

    console.log('🔍 [CREATE EVENT] Verificando permisos...');
    console.log('🔍 [CREATE EVENT] Rol del usuario:', currentUser.role?.nombre);
    console.log('🔍 [CREATE EVENT] InstitutionId recibido:', institutionId);
    console.log('🔍 [CREATE EVENT] DivisionId recibido:', divisionId);
    
    if (effectiveRole === 'adminaccount' || effectiveRole === 'superadmin') {
      // Para adminaccount y superadmin, usar los IDs directamente sin verificar ActiveAssociation
      targetAccount = institutionId;
      targetDivision = divisionId;
      
      if (effectiveRole === 'adminaccount') {
        // Verificar que la cuenta pertenece al usuario
        const user = await User.findById(currentUser._id).populate('role');
        if (user.account?.toString() !== institutionId) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para crear eventos en esta institución'
          });
        }
      }
    } else {
      // Para coordinadores, verificar ActiveAssociation
      userAssociation = await ActiveAssociation.findOne({ user: currentUser._id });
      
      if (!userAssociation || !userAssociation.activeShared) {
        return res.status(403).json({
          success: false,
          message: 'No tienes una asociación activa'
        });
      }
      
      targetAccount = userAssociation.activeShared.account;
      targetDivision = divisionId || userAssociation.activeShared.division;
    }

    if (!targetAccount || !targetDivision) {
      return res.status(400).json({
        success: false,
        message: 'Institución y división son requeridos'
      });
    }

    // Crear el evento
    const newEvent = new Event({
      titulo,
      descripcion,
      fecha: new Date(fecha),
      hora,
      lugar: lugar || '',
      creador: currentUser._id,
      institucion: targetAccount,
      division: targetDivision,
      estado: 'activo',
      requiereAutorizacion: requiereAutorizacion || false
    });

    await newEvent.save();
    console.log('📅 [CREATE EVENT] Evento creado:', newEvent._id);

    // Populate para la respuesta
    await newEvent.populate('creador', 'name email');
    await newEvent.populate('institucion', 'nombre');
    await newEvent.populate('division', 'nombre');

    res.status(201).json({
      success: true,
      message: 'Evento creado exitosamente',
      data: {
        event: {
          _id: newEvent._id,
          titulo: newEvent.titulo,
          descripcion: newEvent.descripcion,
          fecha: newEvent.fecha,
          hora: newEvent.hora,
          lugar: newEvent.lugar,
          estado: newEvent.estado,
          requiereAutorizacion: newEvent.requiereAutorizacion,
          creador: newEvent.creador,
          institucion: newEvent.institucion,
          division: newEvent.division,
          createdAt: newEvent.createdAt
        }
      }
    });

  } catch (error) {
    console.error('❌ [CREATE EVENT] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al crear evento'
    });
  }
};

/**
 * Obtener eventos por institución
 */
exports.getEventsByInstitution = async (req, res) => {
  try {
    const { institutionId } = req.params;
    const { divisionId, fechaInicio, fechaFin } = req.query;
    const currentUser = req.user;

    console.log('📅 [GET EVENTS BY INSTITUTION] Institución:', institutionId);
    console.log('📅 [GET EVENTS BY INSTITUTION] Usuario:', currentUser._id, currentUser.role?.nombre);

    // Verificar permisos
    const userRole = currentUser.role?.nombre;
    let hasAccess = false;

    if (userRole === 'superadmin') {
      hasAccess = true;
    } else if (userRole === 'adminaccount') {
      const user = await User.findById(currentUser._id);
      hasAccess = user.account?.toString() === institutionId;
    } else {
      // Para coordinadores y otros roles, verificar ActiveAssociation
      const activeAssociation = await ActiveAssociation.findOne({ user: currentUser._id });
      if (activeAssociation && activeAssociation.activeShared) {
        hasAccess = activeAssociation.activeShared.account?.toString() === institutionId;
      }
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver eventos de esta institución'
      });
    }

    // Construir query
    let query = { institucion: institutionId };

    if (divisionId) {
      query.division = divisionId;
    }

    if (fechaInicio && fechaFin) {
      query.fecha = {
        $gte: new Date(fechaInicio),
        $lte: new Date(fechaFin)
      };
    }

    // Obtener eventos
    const events = await Event.find(query)
      .populate('creador', 'name email')
      .populate('institucion', 'nombre')
      .populate('division', 'nombre')
      .sort({ fecha: 1 });

    res.json({
      success: true,
      data: events
    });

  } catch (error) {
    console.error('❌ [GET EVENTS BY INSTITUTION] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Autorizar evento para un estudiante
 */
exports.authorizeEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { studentId, autorizado, comentarios } = req.body;
    const currentUser = req.user;

    console.log('📅 [AUTHORIZE EVENT] Evento:', eventId, 'Estudiante:', studentId);
    console.log('📅 [AUTHORIZE EVENT] Usuario:', currentUser._id, currentUser.role?.nombre);

    // Verificar que el usuario es familyadmin
    const userRole = currentUser.role?.nombre;
    if (userRole !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los tutores pueden autorizar eventos'
      });
    }

    // Verificar que el estudiante está asociado al usuario
    const association = await Shared.findOne({
      user: currentUser._id,
      student: studentId,
      status: 'active',
      'role.nombre': 'familyadmin'
    });

    if (!association) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para autorizar eventos de este estudiante'
      });
    }

    // Verificar que el evento existe y requiere autorización
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }

    if (!event.requiereAutorizacion) {
      return res.status(400).json({
        success: false,
        message: 'Este evento no requiere autorización'
      });
    }

    // Crear o actualizar autorización
    let authorization = await EventAuthorization.findOne({
      event: eventId,
      student: studentId
    });

    if (authorization) {
      authorization.autorizado = autorizado;
      authorization.comentarios = comentarios;
      authorization.fechaAutorizacion = new Date();
      authorization.familyadmin = currentUser._id;
      await authorization.save();
    } else {
      authorization = new EventAuthorization({
        event: eventId,
        student: studentId,
        familyadmin: currentUser._id,
        autorizado: autorizado,
        comentarios: comentarios,
        fechaAutorizacion: new Date()
      });
      await authorization.save();
    }

    // Populate para la respuesta
    await authorization.populate('student', 'nombre apellido');
    await authorization.populate('familyadmin', 'name email');
    await authorization.populate('event', 'titulo fecha');

    res.json({
      success: true,
      message: autorizado ? 'Evento autorizado exitosamente' : 'Autorización rechazada',
      data: authorization
    });

  } catch (error) {
    console.error('❌ [AUTHORIZE EVENT] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Exportar eventos del mes
 */
exports.exportEventsMonth = async (req, res) => {
  try {
    const { divisionId, mes, año } = req.query;
    const currentUser = req.user;

    console.log('📅 [EXPORT EVENTS] Parámetros:', { divisionId, mes, año });

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para exportar eventos'
      });
    }

    // Determinar cuenta
    let accountId;
    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin puede exportar de cualquier cuenta
      if (req.query.accountId) {
        accountId = req.query.accountId;
      } else {
        return res.status(400).json({
          success: false,
          message: 'accountId es requerido para superadmin'
        });
      }
    } else {
      // Adminaccount y coordinador usan su cuenta
      accountId = req.userInstitution?._id || currentUser.account;
    }

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo determinar la cuenta'
      });
    }

    // Construir query
    const query = { institucion: accountId };
    if (divisionId) {
      query.division = divisionId;
    }

    // Calcular fechas del mes
    const year = parseInt(año) || new Date().getFullYear();
    const month = parseInt(mes) || new Date().getMonth() + 1;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    query.fecha = {
      $gte: startDate,
      $lte: endDate
    };

    // Obtener eventos
    const events = await Event.find(query)
      .populate('creador', 'name email')
      .populate('institucion', 'nombre')
      .populate('division', 'nombre')
      .sort({ fecha: 1 });

    // Obtener autorizaciones para cada evento
    const eventsWithAuthorizations = await Promise.all(events.map(async (event) => {
      const authorizations = await EventAuthorization.find({ event: event._id })
        .populate('student', 'nombre apellido')
        .populate('familyadmin', 'name email');

      return {
        ...event.toObject(),
        autorizaciones: authorizations.map(auth => ({
          estudiante: `${auth.student.nombre} ${auth.student.apellido}`,
          autorizado: auth.autorizado ? 'Aprobado' : 'Rechazado',
          autorizadoPor: auth.familyadmin?.name || 'N/A',
          fechaAutorizacion: auth.fechaAutorizacion,
          comentarios: auth.comentarios
        }))
      };
    }));

    // Generar Excel
    const XLSX = require('xlsx');
    const workbook = XLSX.utils.book_new();

    // Crear hoja de eventos
    // Calcular pendientes para cada evento antes del map
    const eventsDataPromises = eventsWithAuthorizations.map(async (event) => {
      let pendientes = 0;
      if (event.requiereAutorizacion && event.division?._id) {
        const totalEstudiantes = await Student.countDocuments({ division: event.division._id, activo: true });
        pendientes = totalEstudiantes - event.autorizaciones.length;
      }
      
      return {
        'Fecha': event.fecha.toLocaleDateString('es-AR'),
        'Hora': event.hora,
        'Título': event.titulo,
        'Descripción': event.descripcion,
        'Lugar': event.lugar,
        'División': event.division?.nombre || 'N/A',
        'Requiere Autorización': event.requiereAutorizacion ? 'Sí' : 'No',
        'Total Autorizaciones': event.autorizaciones.length,
        'Aprobadas': event.autorizaciones.filter(a => a.autorizado === 'Aprobado').length,
        'Rechazadas': event.autorizaciones.filter(a => a.autorizado === 'Rechazado').length,
        'Pendientes': pendientes
      };
    });
    
    const eventsData = await Promise.all(eventsDataPromises);

    const eventsSheet = XLSX.utils.json_to_sheet(eventsData);
    XLSX.utils.book_append_sheet(workbook, eventsSheet, 'Eventos');

    // Crear hoja de autorizaciones detalladas
    const authsData = [];
    eventsWithAuthorizations.forEach(event => {
      if (event.requiereAutorizacion && event.autorizaciones.length > 0) {
        event.autorizaciones.forEach(auth => {
          authsData.push({
            'Evento': event.titulo,
            'Fecha Evento': event.fecha.toLocaleDateString('es-AR'),
            'Estudiante': auth.estudiante,
            'Estado': auth.autorizado,
            'Autorizado Por': auth.autorizadoPor,
            'Fecha Autorización': auth.fechaAutorizacion ? new Date(auth.fechaAutorizacion).toLocaleDateString('es-AR') : 'N/A',
            'Comentarios': auth.comentarios || ''
          });
        });
      }
    });

    if (authsData.length > 0) {
      const authsSheet = XLSX.utils.json_to_sheet(authsData);
      XLSX.utils.book_append_sheet(workbook, authsSheet, 'Autorizaciones');
    }

    // Generar buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Enviar respuesta
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=eventos_${mes}_${año}.xlsx`);
    res.send(buffer);

  } catch (error) {
    console.error('❌ [EXPORT EVENTS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Obtener autorizaciones de un evento
 */
exports.getEventAuthorizations = async (req, res) => {
  try {
    const { eventId } = req.params;
    const currentUser = req.user;

    console.log('📅 [GET EVENT AUTHORIZATIONS] Evento:', eventId);

    // Verificar permisos
    const userRole = currentUser.role?.nombre;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver autorizaciones'
      });
    }

    // Obtener autorizaciones
    const authorizations = await EventAuthorization.find({ event: eventId })
      .populate('student', 'nombre apellido email')
      .populate('familyadmin', 'name email')
      .populate('event', 'titulo fecha');

    res.json({
      success: true,
      data: authorizations
    });

  } catch (error) {
    console.error('❌ [GET EVENT AUTHORIZATIONS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Obtener autorización específica de un estudiante para un evento
 */
exports.getEventAuthorization = async (req, res) => {
  try {
    const { eventId, studentId } = req.params;
    const currentUser = req.user;

    console.log('📅 [GET EVENT AUTHORIZATION] Evento:', eventId, 'Estudiante:', studentId);

    // Verificar permisos
    const userRole = currentUser.role?.nombre;
    let hasAccess = false;

    if (['adminaccount', 'superadmin', 'coordinador'].includes(userRole)) {
      hasAccess = true;
    } else if (userRole === 'familyadmin') {
      // Verificar que el estudiante está asociado al usuario
      const association = await Shared.findOne({
        user: currentUser._id,
        student: studentId,
        status: 'active'
      });
      hasAccess = !!association;
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver esta autorización'
      });
    }

    // Obtener autorización
    const authorization = await EventAuthorization.findOne({
      event: eventId,
      student: studentId
    })
      .populate('student', 'nombre apellido')
      .populate('familyadmin', 'name email')
      .populate('event', 'titulo fecha');

    if (!authorization) {
      return res.status(404).json({
        success: false,
        message: 'Autorización no encontrada'
      });
    }

    res.json({
      success: true,
      data: authorization
    });

  } catch (error) {
    console.error('❌ [GET EVENT AUTHORIZATION] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

