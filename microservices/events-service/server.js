const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Importar modelos compartidos
const User = require('../../shared/models/User');
const Account = require('../../shared/models/Account');
const Group = require('../../shared/models/Group');
const Event = require('../../shared/models/Event');
const Student = require('../../shared/models/Student');
const ActiveAssociation = require('../../shared/models/ActiveAssociation');
const Shared = require('../../shared/models/Shared');

// Importar configuración
const config = require('../../config/env.config');

const app = express();

// Middleware de seguridad
app.use(helmet());
app.use(cors({
  origin: config.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // máximo 100 requests por IP
});
app.use(limiter);

// Middleware de logging
app.use(morgan('combined'));

// Middleware para parsear JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token de acceso requerido'
    });
  }

  jwt.verify(token, config.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Token inválido'
      });
    }
    req.user = user;
    next();
  });
};

// Conectar a MongoDB
mongoose.connect(config.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('📅 Events Service conectado a MongoDB');
})
.catch((error) => {
  console.error('❌ Error conectando Events Service a MongoDB:', error);
});

// ===== RUTAS DE EVENTOS =====

// Listar eventos
app.get('/api/events', authenticateToken, async (req, res) => {
  try {
    const { accountId, search, page = 1, limit = 20 } = req.query;
    const currentUser = req.user;

    console.log('📅 [EVENTS] Usuario:', currentUser._id, currentUser.role?.nombre);
    console.log('📅 [EVENTS] Query params:', { accountId, search, page, limit });

    // Verificar permisos por rol
    const roleName = currentUser.role?.nombre;
    const allowedRoles = ['adminaccount', 'superadmin', 'coordinador', 'familyadmin', 'familyviewer'];
    
    if (!allowedRoles.includes(roleName)) {
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
        const userAssociations = await ActiveAssociation.find({
          user: currentUser._id,
          status: { $in: ['active', 'pending'] }
        }).populate('account');

        const userAccountIds = userAssociations.map(assoc => assoc.account._id);
        
        if (accountId && !userAccountIds.includes(accountId)) {
          return res.status(403).json({
            success: false,
            message: 'No tienes acceso a esta institución'
          });
        }
        
        query.institucion = { $in: userAccountIds };
        if (accountId) {
          query.institucion = accountId;
        }
      } catch (error) {
        console.error('Error verificando asociaciones:', error);
        return res.status(500).json({
          success: false,
          message: 'Error verificando permisos'
        });
      }
    } else if (currentUser.role?.nombre === 'coordinador') {
      // Coordinador solo puede ver eventos de sus divisiones
      try {
        const userAssociations = await ActiveAssociation.find({
          user: currentUser._id,
          status: { $in: ['active', 'pending'] }
        }).populate('account division');

        const userAccountIds = userAssociations.map(assoc => assoc.account._id);
        const userDivisionIds = userAssociations.map(assoc => assoc.division?._id).filter(Boolean);
        
        if (accountId && !userAccountIds.includes(accountId)) {
          return res.status(403).json({
            success: false,
            message: 'No tienes acceso a esta institución'
          });
        }
        
        query.institucion = { $in: userAccountIds };
        if (accountId) {
          query.institucion = accountId;
        }
        if (userDivisionIds.length > 0) {
          query.division = { $in: userDivisionIds };
        }
      } catch (error) {
        console.error('Error verificando asociaciones de coordinador:', error);
        return res.status(500).json({
          success: false,
          message: 'Error verificando permisos'
        });
      }
    }

    // Filtro de búsqueda
    if (search) {
      query.$or = [
        { titulo: { $regex: search, $options: 'i' } },
        { descripcion: { $regex: search, $options: 'i' } },
        { lugar: { $regex: search, $options: 'i' } }
      ];
    }

    // Contar total de eventos
    const total = await Event.countDocuments(query);

    // Obtener eventos con paginación
    const events = await Event.find(query)
      .populate('creador', 'nombre email')
      .populate('institucion', 'nombre')
      .populate('division', 'nombre')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
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
});

// Crear evento desde backoffice (adminaccount y superadmin)
app.post('/api/events/create-backoffice', authenticateToken, async (req, res) => {
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
      institucion,
      division,
      estado: estado || 'activo',
      requiereAutorizacion: requiereAutorizacion || false
    });

    await newEvent.save();
    console.log('📅 [CREATE EVENT BACKOFFICE] Evento creado:', newEvent._id);

    res.json({
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
          division: newEvent.division
        }
      }
    });
  } catch (error) {
    console.error('Error creando evento desde backoffice:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al crear evento'
    });
  }
});

// Crear evento (solo coordinadores)
app.post('/api/events/create', authenticateToken, async (req, res) => {
  try {
    const { titulo, descripcion, fecha, hora, lugar, institutionId, divisionId, requiereAutorizacion } = req.body;
    const currentUser = req.user;

    console.log('📅 [CREATE EVENT] Datos recibidos:', { titulo, descripcion, fecha, hora, lugar, institutionId, divisionId, requiereAutorizacion });
    console.log('👤 [CREATE EVENT] Usuario:', currentUser._id, currentUser.role?.nombre);

    // Verificar que el usuario tiene permisos para crear eventos (usar rol efectivo)
    const activeAssociation = await ActiveAssociation.findOne({ user: currentUser._id }).populate('role');
    const effectiveRole = activeAssociation?.role?.nombre || currentUser.role?.nombre;
    console.log('🔍 [CREATE EVENT] Rol efectivo:', effectiveRole);

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

    if (currentUser.role?.nombre === 'adminaccount') {
      // Para adminaccount, verificar que tenga acceso a la cuenta
      if (institutionId) {
        userAssociation = await ActiveAssociation.findOne({
          user: currentUser._id,
          account: institutionId,
          status: { $in: ['active', 'pending'] }
        }).populate('account');

        if (!userAssociation) {
          return res.status(403).json({
            success: false,
            message: 'No tienes acceso a esta institución'
          });
        }
        targetAccount = userAssociation.account._id;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Se requiere especificar una institución'
        });
      }

      if (divisionId) {
        targetDivision = divisionId;
      }
    } else {
      // Para coordinadores, verificar asociación específica
      const assocFilter = {
        user: currentUser._id,
        status: { $in: ['active', 'pending'] }
      };
      if (institutionId) {
        assocFilter.account = institutionId;
      }
      if (divisionId) {
        assocFilter.division = divisionId;
      }

      userAssociation = await Shared.findOne(assocFilter).populate('account division');

      if (!userAssociation) {
        return res.status(403).json({
          success: false,
          message: institutionId || divisionId
            ? 'No tienes acceso a la institución/división indicada'
            : 'Usuario no tiene asociaciones activas'
        });
      }

      targetAccount = userAssociation.account._id;
      targetDivision = userAssociation.division?._id || null;
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

    // Si el evento requiere autorización, generar notificaciones para todos los estudiantes de la división
    if (newEvent.requiereAutorizacion && targetDivision) {
      try {
        const students = await Student.find({ division: targetDivision });
        console.log('📅 [CREATE EVENT] Generando notificaciones para', students.length, 'estudiantes');
        
        // Aquí se podría agregar lógica para crear notificaciones
        // Por ahora solo logueamos la información
        console.log('📅 [CREATE EVENT] Notificaciones pendientes de implementar');
      } catch (error) {
        console.error('Error generando notificaciones:', error);
        // No fallar la creación del evento por este error
      }
    }

    res.json({
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
          division: newEvent.division
        }
      }
    });
  } catch (error) {
    console.error('Error creando evento:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al crear evento'
    });
  }
});

// Obtener eventos por institución
app.get('/api/events/institution/:institutionId', authenticateToken, async (req, res) => {
  try {
    const { institutionId } = req.params;
    const currentUser = req.user;

    console.log('📅 [EVENTS BY INSTITUTION] Usuario:', currentUser._id, currentUser.role?.nombre);
    console.log('📅 [EVENTS BY INSTITUTION] InstitutionId:', institutionId);

    // Verificar permisos
    const roleName = currentUser.role?.nombre;
    const allowedRoles = ['adminaccount', 'superadmin', 'coordinador', 'familyadmin', 'familyviewer'];

    if (!allowedRoles.includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver eventos'
      });
    }

    // Verificar que la institución existe
    const institution = await Account.findById(institutionId);
    if (!institution) {
      return res.status(404).json({
        success: false,
        message: 'Institución no encontrada'
      });
    }

    // Verificar permisos de acceso a la institución para todos los roles (excepto superadmin)
    if (roleName !== 'superadmin') {
      const activeAssociation = await ActiveAssociation.findOne({
        user: currentUser._id,
        account: institutionId
      });

      if (!activeAssociation) {
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a esta institución'
        });
      }
    }

    // Obtener eventos de la institución
    const events = await Event.find({ institucion: institutionId })
      .populate('creador', 'nombre email')
      .populate('division', 'nombre')
      .sort({ fecha: 1 });

    console.log('📅 [EVENTS BY INSTITUTION] Eventos encontrados:', events.length);

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
          division: event.division,
          participantes: event.participantes,
          createdAt: event.createdAt,
          updatedAt: event.updatedAt
        }))
      }
    });
  } catch (error) {
    console.error('Error obteniendo eventos por institución:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Autorizar evento
app.post('/api/events/:eventId/authorize', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { studentId, autorizado } = req.body;
    const currentUser = req.user;

    console.log('📅 [AUTHORIZE EVENT] EventId:', eventId, 'StudentId:', studentId, 'Autorizado:', autorizado);
    console.log('👤 [AUTHORIZE EVENT] Usuario:', currentUser._id, currentUser.role?.nombre);

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para autorizar eventos'
      });
    }

    // Verificar que el evento existe
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }

    // Verificar que el evento requiere autorización
    if (!event.requiereAutorizacion) {
      return res.status(400).json({
        success: false,
        message: 'Este evento no requiere autorización'
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

    // Verificar permisos de acceso al evento
    if (currentUser.role?.nombre === 'adminaccount') {
      const hasAccess = await ActiveAssociation.findOne({
        user: currentUser._id,
        account: event.institucion,
        status: { $in: ['active', 'pending'] }
      });

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a este evento'
        });
      }
    } else if (currentUser.role?.nombre === 'coordinador') {
      const hasAccess = await ActiveAssociation.findOne({
        user: currentUser._id,
        account: event.institucion,
        division: event.division,
        status: { $in: ['active', 'pending'] }
      });

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a este evento'
        });
      }
    }

    // Actualizar autorización del estudiante
    const participantIndex = event.participantes.findIndex(p => p.estudiante.toString() === studentId);
    
    if (participantIndex === -1) {
      // Agregar nuevo participante
      event.participantes.push({
        estudiante: studentId,
        autorizado: autorizado,
        fechaAutorizacion: new Date(),
        autorizadoPor: currentUser._id
      });
    } else {
      // Actualizar participante existente
      event.participantes[participantIndex].autorizado = autorizado;
      event.participantes[participantIndex].fechaAutorizacion = new Date();
      event.participantes[participantIndex].autorizadoPor = currentUser._id;
    }

    await event.save();
    console.log('📅 [AUTHORIZE EVENT] Autorización actualizada');

    res.json({
      success: true,
      message: autorizado ? 'Evento autorizado para el estudiante' : 'Autorización del evento revocada para el estudiante',
      data: {
        eventId: event._id,
        studentId: studentId,
        autorizado: autorizado
      }
    });
  } catch (error) {
    console.error('Error autorizando evento:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Obtener autorizaciones de un evento
app.get('/api/events/:eventId/authorizations', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const currentUser = req.user;

    console.log('📅 [EVENT AUTHORIZATIONS] EventId:', eventId);
    console.log('👤 [EVENT AUTHORIZATIONS] Usuario:', currentUser._id, currentUser.role?.nombre);

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver autorizaciones'
      });
    }

    // Verificar que el evento existe
    const event = await Event.findById(eventId)
      .populate('participantes.estudiante', 'nombre email')
      .populate('participantes.autorizadoPor', 'nombre email');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }

    // Verificar permisos de acceso al evento
    if (currentUser.role?.nombre === 'adminaccount') {
      const hasAccess = await ActiveAssociation.findOne({
        user: currentUser._id,
        account: event.institucion,
        status: { $in: ['active', 'pending'] }
      });

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a este evento'
        });
      }
    } else if (currentUser.role?.nombre === 'coordinador') {
      const hasAccess = await ActiveAssociation.findOne({
        user: currentUser._id,
        account: event.institucion,
        division: event.division,
        status: { $in: ['active', 'pending'] }
      });

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a este evento'
        });
      }
    }

    console.log('📅 [EVENT AUTHORIZATIONS] Autorizaciones encontradas:', event.participantes.length);

    res.json({
      success: true,
      data: {
        event: {
          _id: event._id,
          titulo: event.titulo,
          descripcion: event.descripcion,
          fecha: event.fecha,
          hora: event.hora,
          lugar: event.lugar,
          estado: event.estado,
          requiereAutorizacion: event.requiereAutorizacion
        },
        participantes: event.participantes.map(p => ({
          estudiante: p.estudiante,
          autorizado: p.autorizado,
          fechaAutorizacion: p.fechaAutorizacion,
          autorizadoPor: p.autorizadoPor
        }))
      }
    });
  } catch (error) {
    console.error('Error obteniendo autorizaciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Obtener autorización específica de un estudiante para un evento
app.get('/api/events/:eventId/authorization/:studentId', authenticateToken, async (req, res) => {
  try {
    const { eventId, studentId } = req.params;
    const currentUser = req.user;

    console.log('📅 [STUDENT AUTHORIZATION] EventId:', eventId, 'StudentId:', studentId);
    console.log('👤 [STUDENT AUTHORIZATION] Usuario:', currentUser._id, currentUser.role?.nombre);

    // Verificar que el evento existe
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
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

    // Buscar autorización del estudiante
    const participant = event.participantes.find(p => p.estudiante.toString() === studentId);

    if (!participant) {
      return res.json({
        success: true,
        data: {
          eventId: event._id,
          studentId: studentId,
          autorizado: false,
          fechaAutorizacion: null,
          autorizadoPor: null
        }
      });
    }

    res.json({
      success: true,
      data: {
        eventId: event._id,
        studentId: studentId,
        autorizado: participant.autorizado,
        fechaAutorizacion: participant.fechaAutorizacion,
        autorizadoPor: participant.autorizadoPor
      }
    });
  } catch (error) {
    console.error('Error obteniendo autorización del estudiante:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Events Service está funcionando correctamente',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error('Error en Events Service:', err);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor'
  });
});

// Manejo de rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada en Events Service'
  });
});

const PORT = config.EVENTS_SERVICE_PORT || 3005;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`📅 Events Service corriendo en puerto ${PORT}`);
  console.log(`📅 Health check: http://localhost:${PORT}/health`);
});
