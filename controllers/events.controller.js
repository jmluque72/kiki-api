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
    console.log('📅 [CREATE EVENT] ===== INICIO =====');
    console.log('📅 [CREATE EVENT] Body completo:', JSON.stringify(req.body, null, 2));
    console.log('📅 [CREATE EVENT] Headers:', {
      'content-type': req.headers['content-type'],
      'authorization': req.headers['authorization'] ? 'presente' : 'ausente'
    });
    
    const { titulo, descripcion, fecha, hora, lugar, institutionId, divisionId, requiereAutorizacion } = req.body;
    const currentUser = req.user;

    console.log('📅 [CREATE EVENT] Datos extraídos:', { 
      titulo: titulo || 'FALTANTE', 
      descripcion: descripcion || 'FALTANTE', 
      fecha: fecha || 'FALTANTE', 
      hora: hora || 'FALTANTE', 
      lugar: lugar || 'vacío', 
      institutionId: institutionId || 'FALTANTE', 
      divisionId: divisionId || 'FALTANTE', 
      requiereAutorizacion: requiereAutorizacion 
    });
    console.log('👤 [CREATE EVENT] Usuario:', currentUser?._id || 'NO ENCONTRADO', currentUser?.role?.nombre || 'SIN ROL');

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
    const missingFields = [];
    if (!titulo) missingFields.push('titulo');
    if (!descripcion) missingFields.push('descripcion');
    if (!fecha) missingFields.push('fecha');
    if (!hora) missingFields.push('hora');
    
    if (missingFields.length > 0) {
      console.error('❌ [CREATE EVENT] Campos faltantes:', missingFields);
      return res.status(400).json({
        success: false,
        message: `Campos requeridos faltantes: ${missingFields.join(', ')}`,
        missingFields: missingFields
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
      userAssociation = await ActiveAssociation.findOne({ user: currentUser._id })
        .populate('account')
        .populate('division');
      
      if (!userAssociation) {
        console.error('❌ [CREATE EVENT] No se encontró ActiveAssociation para el usuario');
        return res.status(403).json({
          success: false,
          message: 'No tienes una asociación activa'
        });
      }
      
      console.log('🔍 [CREATE EVENT] ActiveAssociation encontrada:', {
        account: userAssociation.account?._id || userAssociation.account,
        division: userAssociation.division?._id || userAssociation.division,
        activeShared: userAssociation.activeShared
      });
      
      // Usar los campos desnormalizados de ActiveAssociation (account, division)
      // Estos campos ya están disponibles directamente sin necesidad de populate activeShared
      targetAccount = userAssociation.account?._id ? userAssociation.account._id.toString() : 
                     (userAssociation.account?.toString ? userAssociation.account.toString() : String(userAssociation.account));
      targetDivision = divisionId || (userAssociation.division?._id ? userAssociation.division._id.toString() : 
                                  (userAssociation.division?.toString ? userAssociation.division.toString() : String(userAssociation.division)));
      
      console.log('🔍 [CREATE EVENT] Valores asignados:', {
        targetAccount: targetAccount,
        targetDivision: targetDivision,
        accountType: typeof userAssociation.account,
        divisionType: typeof userAssociation.division
      });
    }

    if (!targetAccount || !targetDivision) {
      console.error('❌ [CREATE EVENT] Institución o división faltante:', {
        targetAccount: targetAccount || 'FALTANTE',
        targetDivision: targetDivision || 'FALTANTE',
        effectiveRole,
        institutionId,
        divisionId,
        userAssociation: userAssociation ? 'encontrada' : 'no encontrada'
      });
      return res.status(400).json({
        success: false,
        message: 'Institución y división son requeridos',
        details: {
          targetAccount: targetAccount || null,
          targetDivision: targetDivision || null,
          receivedInstitutionId: institutionId || null,
          receivedDivisionId: divisionId || null
        }
      });
    }

    // Crear el evento
    // Normalizar fecha para evitar problemas de zona horaria
    // IMPORTANTE: Guardar la fecha como medianoche LOCAL, no UTC, para que el día sea correcto
    let fechaNormalizada;
    if (typeof fecha === 'string' && fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Fecha sin hora, crear como medianoche en zona horaria local
      // Extraer año, mes y día
      const [year, month, day] = fecha.split('-').map(Number);
      // Crear Date en zona horaria local (no UTC)
      fechaNormalizada = new Date(year, month - 1, day, 0, 0, 0, 0);
    } else {
      // Si viene como Date o string con hora, extraer solo la fecha
      const dateObj = new Date(fecha);
      const year = dateObj.getFullYear();
      const month = dateObj.getMonth();
      const day = dateObj.getDate();
      // Crear nueva fecha en zona horaria local a medianoche
      fechaNormalizada = new Date(year, month, day, 0, 0, 0, 0);
    }
    
    console.log('📅 [CREATE EVENT] Fecha original:', fecha);
    console.log('📅 [CREATE EVENT] Fecha normalizada (local):', fechaNormalizada);
    console.log('📅 [CREATE EVENT] Fecha ISO:', fechaNormalizada.toISOString());
    console.log('📅 [CREATE EVENT] Fecha local string:', fechaNormalizada.toLocaleDateString('es-AR'));
    console.log('📅 [CREATE EVENT] Año/Mes/Día:', fechaNormalizada.getFullYear(), fechaNormalizada.getMonth() + 1, fechaNormalizada.getDate());
    
    const newEvent = new Event({
      titulo,
      descripcion,
      fecha: fechaNormalizada,
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
    console.error('❌ [CREATE EVENT] Stack:', error.stack);
    console.error('❌ [CREATE EVENT] Body recibido:', req.body);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al crear evento',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
    const allowedRoles = ['adminaccount', 'superadmin', 'coordinador', 'familyadmin', 'familyviewer'];
    
    console.log('📅 [GET EVENTS BY INSTITUTION] Rol del usuario:', userRole);
    
    if (!allowedRoles.includes(userRole)) {
      console.log('❌ [GET EVENTS BY INSTITUTION] Rol no permitido:', userRole);
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver eventos'
      });
    }

    let hasAccess = false;

    if (userRole === 'superadmin') {
      hasAccess = true;
      console.log('✅ [GET EVENTS BY INSTITUTION] Superadmin - acceso permitido');
    } else if (userRole === 'adminaccount') {
      const user = await User.findById(currentUser._id);
      hasAccess = user.account?.toString() === institutionId;
      console.log('📋 [GET EVENTS BY INSTITUTION] AdminAccount - acceso:', hasAccess);
    } else {
      // Para coordinadores, familyadmin y familyviewer, verificar ActiveAssociation o Shared
      const activeAssociation = await ActiveAssociation.findOne({ 
        user: currentUser._id,
        account: institutionId
      });

      if (activeAssociation) {
        hasAccess = true;
        console.log('✅ [GET EVENTS BY INSTITUTION] ActiveAssociation encontrada');
      } else {
        // Si no hay ActiveAssociation, verificar Shared directamente
        const sharedAssociation = await Shared.findOne({
          user: currentUser._id,
          account: institutionId,
          status: { $in: ['active', 'pending'] }
        });
        
        if (sharedAssociation) {
          hasAccess = true;
          console.log('✅ [GET EVENTS BY INSTITUTION] Shared association encontrada');
        } else {
          console.log('❌ [GET EVENTS BY INSTITUTION] No se encontró asociación para usuario:', currentUser._id, 'institución:', institutionId);
        }
      }
    }

    if (!hasAccess) {
      console.log('❌ [GET EVENTS BY INSTITUTION] Acceso denegado');
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver eventos de esta institución'
      });
    }

    console.log('✅ [GET EVENTS BY INSTITUTION] Acceso permitido, consultando eventos...');

    // Construir query
    let query = { institucion: institutionId };

    if (divisionId) {
      query.division = divisionId;
    }

    // NO filtrar por fecha si no se proporcionan - traer todos los eventos
    // Solo filtrar si explícitamente se envían fechaInicio y fechaFin
    if (fechaInicio && fechaFin) {
      // IMPORTANTE: Filtrar por fecha ignorando la hora y zona horaria
      // Extraer solo la fecha (YYYY-MM-DD) y crear rangos que incluyan todo el día
      // Usar zona horaria local para evitar problemas de conversión UTC
      const [startYear, startMonth, startDay] = fechaInicio.split('-').map(Number);
      const [endYear, endMonth, endDay] = fechaFin.split('-').map(Number);
      
      // Crear fechas en zona horaria local (no UTC) para que el día sea correcto
      const startDate = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
      const endDate = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
      
      query.fecha = {
        $gte: startDate,
        $lte: endDate
      };
      
      console.log('📅 [GET EVENTS BY INSTITUTION] Filtro de fechas aplicado:', {
        fechaInicio: fechaInicio,
        fechaFin: fechaFin,
        startDate: startDate.toISOString(),
        startDateLocal: startDate.toLocaleString('es-AR'),
        endDate: endDate.toISOString(),
        endDateLocal: endDate.toLocaleString('es-AR')
      });
    } else {
      console.log('📅 [GET EVENTS BY INSTITUTION] Sin filtro de fechas - obteniendo todos los eventos');
    }

    // Obtener eventos con paginación
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10000; // Aumentar límite para obtener todos los eventos
    const skip = (page - 1) * limit;

    console.log('📅 [GET EVENTS BY INSTITUTION] Query:', JSON.stringify(query, null, 2));
    console.log('📅 [GET EVENTS BY INSTITUTION] Paginación:', { page, limit, skip });
    
    // DEBUG: Buscar TODOS los eventos sin filtros de fecha para verificar
    const allEventsDebug = await Event.find({
      institucion: institutionId,
      ...(divisionId && { division: divisionId })
    }).select('_id titulo fecha division').lean();
    
    console.log('📅 [GET EVENTS BY INSTITUTION] DEBUG - TODOS los eventos (sin filtros de fecha):', allEventsDebug.length);
    console.log('📅 [GET EVENTS BY INSTITUTION] DEBUG - Eventos encontrados:', allEventsDebug.map(e => ({
      id: e._id,
      titulo: e.titulo,
      fecha: e.fecha ? new Date(e.fecha).toISOString() : 'SIN FECHA',
      fechaLocal: e.fecha ? new Date(e.fecha).toLocaleDateString('es-AR') : 'SIN FECHA',
      division: e.division?.toString() || 'SIN DIVISIÓN'
    })));
    
    const total = await Event.countDocuments(query);
    console.log('📅 [GET EVENTS BY INSTITUTION] Total eventos encontrados (con filtros):', total);
    
    const events = await Event.find(query)
      .populate('creador', 'name email')
      .populate('institucion', 'nombre')
      .populate('division', 'nombre')
      .sort({ fecha: 1 })
      .skip(skip)
      .limit(limit);

    console.log('📅 [GET EVENTS BY INSTITUTION] Eventos devueltos:', events.length);
    console.log('📅 [GET EVENTS BY INSTITUTION] Fechas de eventos devueltos:', events.map(e => ({
      id: e._id,
      titulo: e.titulo,
      fecha: e.fecha ? e.fecha.toISOString() : 'SIN FECHA',
      fechaLocal: e.fecha ? e.fecha.toLocaleDateString('es-AR') : 'SIN FECHA'
    })));

    res.json({
      success: true,
      data: {
        events: events,
        total: total,
        page: page,
        limit: limit
      }
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
      status: 'active'
    }).populate('role');

    if (!association) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para autorizar eventos de este estudiante'
      });
    }

    // Verificar que el rol es familyadmin
    if (association.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los tutores principales pueden autorizar eventos'
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

    console.log('📋 [GET EVENT AUTHORIZATIONS] Evento:', eventId);
    console.log('👤 [GET EVENT AUTHORIZATIONS] Usuario:', currentUser._id, currentUser.role?.nombre);

    // Verificar permisos
    const userRole = currentUser.role?.nombre;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver autorizaciones'
      });
    }

    // Verificar que el evento existe
    const event = await Event.findById(eventId)
      .populate('institucion', 'nombre')
      .populate('division', 'nombre');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }

    console.log('📋 [GET EVENT AUTHORIZATIONS] Evento encontrado:', event.titulo);
    console.log('📋 [GET EVENT AUTHORIZATIONS] Institución:', event.institucion?._id);
    console.log('📋 [GET EVENT AUTHORIZATIONS] División:', event.division?._id);

    // Verificar acceso al evento según el rol
    let userAssociation = null;
    let divisionId = null;

    if (userRole === 'coordinador') {
      // Para coordinadores, usar ActiveAssociation
      userAssociation = await ActiveAssociation.findOne({ user: currentUser._id })
        .populate('account')
        .populate('division');

      if (!userAssociation) {
        console.log('📋 [GET EVENT AUTHORIZATIONS] No se encontró ActiveAssociation');
        return res.status(403).json({
          success: false,
          message: 'No tienes una asociación activa'
        });
      }

      // Verificar que el evento pertenece a la institución del coordinador
      if (userAssociation.account?._id?.toString() !== event.institucion?._id?.toString()) {
        console.log('📋 [GET EVENT AUTHORIZATIONS] El evento no pertenece a la institución del coordinador');
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a este evento'
        });
      }

      divisionId = userAssociation.division?._id || event.division?._id;
      console.log('📋 [GET EVENT AUTHORIZATIONS] División del coordinador:', divisionId);
    } else if (userRole === 'adminaccount') {
      // Para adminaccount, verificar que el evento pertenece a su cuenta
      const user = await User.findById(currentUser._id);
      if (user.account?.toString() !== event.institucion?._id?.toString()) {
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a este evento'
        });
      }
      divisionId = event.division?._id;
    } else {
      // Para superadmin, usar la división del evento
      divisionId = event.division?._id;
    }

    // Obtener todas las autorizaciones del evento
    const authorizations = await EventAuthorization.find({ event: eventId })
      .populate('student', 'nombre apellido')
      .populate('familyadmin', 'name email')
      .sort({ createdAt: 1 });

    console.log('📋 [GET EVENT AUTHORIZATIONS] Autorizaciones encontradas:', authorizations.length);

    // Obtener todos los estudiantes de la división
    let allStudents = [];
    if (divisionId) {
      allStudents = await Student.find({ 
        division: divisionId,
        activo: true 
      }).select('nombre apellido');
      console.log('📋 [GET EVENT AUTHORIZATIONS] Estudiantes en división:', allStudents.length);
    } else {
      console.log('📋 [GET EVENT AUTHORIZATIONS] No hay división específica');
    }

    // Separar estudiantes con y sin autorización
    const studentsWithAuth = authorizations.map(auth => auth.student?._id?.toString()).filter(Boolean);
    const studentsWithoutAuth = allStudents.filter(student => 
      !studentsWithAuth.includes(student._id.toString())
    );

    // Crear lista completa de estudiantes pendientes (todos los de la división)
    const allStudentsForPending = allStudents.map(student => {
      const existingAuth = authorizations.find(auth => 
        auth.student?._id?.toString() === student._id.toString()
      );
      
      return {
        _id: student._id,
        nombre: student.nombre,
        apellido: student.apellido,
        hasResponse: !!existingAuth,
        autorizado: existingAuth?.autorizado || false
      };
    });

    // Calcular resumen
    const autorizados = authorizations.filter(auth => auth.autorizado).length;
    const rechazados = authorizations.filter(auth => !auth.autorizado).length;
    const sinRespuesta = allStudents.length - authorizations.length;
    const pendientes = allStudents.length - autorizados;

    console.log('📋 [GET EVENT AUTHORIZATIONS] Resumen:', {
      total: allStudents.length,
      autorizados,
      rechazados,
      sinRespuesta,
      pendientes
    });

    res.json({
      success: true,
      data: {
        event: {
          _id: event._id,
          titulo: event.titulo,
          fecha: event.fecha,
          hora: event.hora,
          institucion: event.institucion ? {
            _id: event.institucion._id,
            nombre: event.institucion.nombre
          } : null,
          division: event.division ? {
            _id: event.division._id,
            nombre: event.division.nombre
          } : null
        },
        authorizations: authorizations.map(auth => ({
          _id: auth._id,
          student: auth.student ? {
            _id: auth.student._id,
            nombre: auth.student.nombre,
            apellido: auth.student.apellido
          } : null,
          familyadmin: auth.familyadmin ? {
            _id: auth.familyadmin._id,
            name: auth.familyadmin.name,
            email: auth.familyadmin.email
          } : null,
          autorizado: auth.autorizado,
          fechaAutorizacion: auth.fechaAutorizacion,
          comentarios: auth.comentarios
        })),
        studentsWithoutAuth: studentsWithoutAuth.map(student => ({
          _id: student._id,
          nombre: student.nombre,
          apellido: student.apellido
        })),
        allStudentsPending: allStudentsForPending,
        summary: {
          total: allStudents.length,
          autorizados: autorizados,
          rechazados: rechazados,
          sinRespuesta: sinRespuesta,
          pendientes: pendientes
        }
      }
    });

  } catch (error) {
    console.error('❌ [GET EVENT AUTHORIZATIONS] Error:', error);
    console.error('❌ [GET EVENT AUTHORIZATIONS] Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al obtener autorizaciones'
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

    console.log('🔍 [GET EVENT AUTHORIZATION] Evento:', eventId, 'Estudiante:', studentId);
    console.log('👤 [GET EVENT AUTHORIZATION] Usuario:', currentUser._id, currentUser.role?.nombre);

    // Verificar que el evento existe
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }

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
      }).populate('role');
      
      if (association && association.role?.nombre === 'familyadmin') {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      console.log('❌ [GET EVENT AUTHORIZATION] Sin acceso');
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver esta autorización'
      });
    }

    // Obtener autorización (puede ser null si no existe)
    const authorization = await EventAuthorization.findOne({
      event: eventId,
      student: studentId
    });

    console.log('🔍 [GET EVENT AUTHORIZATION] Autorización encontrada:', !!authorization);
    if (authorization) {
      console.log('🔍 [GET EVENT AUTHORIZATION] Estado:', authorization.autorizado);
    }

    // Siempre devolver 200 con la estructura esperada, incluso si no hay autorización
    res.json({
      success: true,
      data: {
        event: {
          _id: event._id,
          titulo: event.titulo,
          requiereAutorizacion: event.requiereAutorizacion
        },
        authorization: authorization ? {
          _id: authorization._id,
          autorizado: authorization.autorizado,
          fechaAutorizacion: authorization.fechaAutorizacion,
          comentarios: authorization.comentarios
        } : null
      }
    });

  } catch (error) {
    console.error('❌ [GET EVENT AUTHORIZATION] Error:', error);
    console.error('❌ [GET EVENT AUTHORIZATION] Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

