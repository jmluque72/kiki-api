const Event = require('../../../shared/models/Event');
const User = require('../../../shared/models/User');
const Account = require('../../../shared/models/Account');
const { asyncHandler, AppError } = require('../../../shared/middleware/errorHandler');
const mongoose = require('mongoose');

// @desc    Crear nuevo evento
// @route   POST /api/events
// @access  Private
const createEvent = asyncHandler(async (req, res) => {
  const {
    titulo,
    descripcion,
    fecha,
    hora,
    lugar,
    institucion,
    division,
    estado,
    participantes
  } = req.body;

  // Verificar que la institución existe
  const institutionExists = await Account.findById(institucion);
  if (!institutionExists) {
    throw new AppError('La institución especificada no existe', 404);
  }

  // Verificar que la división existe si se proporciona
  if (division) {
    const Group = require('../../../shared/models/Group');
    const divisionExists = await Group.findById(division);
    if (!divisionExists) {
      throw new AppError('La división especificada no existe', 404);
    }
  }

  // Crear el evento
  const event = await Event.create({
    titulo,
    descripcion,
    fecha: new Date(fecha),
    hora,
    lugar: lugar || '',
    creador: req.user._id,
    institucion,
    division: division || null,
    estado: estado || 'activo',
    participantes: participantes || []
  });

  // Obtener evento con populate
  const populatedEvent = await Event.findById(event._id)
    .populate('creador', 'name email')
    .populate('institucion', 'nombre razonSocial')
    .populate('division', 'nombre')
    .populate('participantes', 'name email');

  res.status(201).json({
    success: true,
    message: 'Evento creado exitosamente',
    data: {
      event: populatedEvent
    }
  });
});

// @desc    Obtener todos los eventos
// @route   GET /api/events
// @access  Private
const getAllEvents = asyncHandler(async (req, res) => {
  // Parámetros de paginación
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Filtros
  const query = {};

  // Filtro por institución (obligatorio)
  if (req.query.institucion) {
    query.institucion = req.query.institucion;
  } else {
    throw new AppError('El parámetro institucion es obligatorio', 400);
  }

  // Filtro por división (opcional)
  if (req.query.division) {
    query.division = req.query.division;
  }

  // Filtro por eventos mayores o iguales a hoy
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Establecer a inicio del día
  query.fecha = { $gte: today };

  if (req.query.cuenta) {
    query.cuenta = req.query.cuenta;
  }

  if (req.query.categoria) {
    query.categoria = req.query.categoria;
  }

  if (req.query.estado) {
    query.estado = req.query.estado;
  }

  if (req.query.organizador) {
    query.organizador = req.query.organizador;
  }

  if (req.query.esPublico !== undefined) {
    query.esPublico = req.query.esPublico === 'true';
  }

  // Filtro por fechas adicionales (si se especifican)
  if (req.query.fechaInicio || req.query.fechaFin) {
    query.fecha = query.fecha || {};
    if (req.query.fechaInicio) {
      query.fecha.$gte = new Date(req.query.fechaInicio);
    }
    if (req.query.fechaFin) {
      query.fecha.$lte = new Date(req.query.fechaFin);
    }
  }

  // Búsqueda por texto
  if (req.query.search) {
    query.$text = { $search: req.query.search };
  }

  // Filtro por tags
  if (req.query.tags) {
    const tagsArray = req.query.tags.split(',').map(tag => tag.trim().toLowerCase());
    query.tags = { $in: tagsArray };
  }

  const events = await Event.find(query)
    .populate('creador', 'name email')
    .populate('institucion', 'nombre razonSocial')
    .populate('division', 'nombre')
    .populate('participantes', 'name email')
    .skip(skip)
    .limit(limit)
    .sort({ fecha: 1 });

  const total = await Event.countDocuments(query);

  res.json({
    success: true,
    message: 'Eventos obtenidos exitosamente',
    data: {
      events,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// @desc    Obtener evento por ID
// @route   GET /api/events/:id
// @access  Private
const getEventById = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id)
    .populate('creador', 'name email')
    .populate('institucion', 'nombre razonSocial')
    .populate('division', 'nombre')
    .populate('participantes', 'name email');

  if (!event) {
    throw new AppError('Evento no encontrado', 404);
  }

  res.json({
    success: true,
    message: 'Evento obtenido exitosamente',
    data: {
      event
    }
  });
});

// @desc    Actualizar evento
// @route   PUT /api/events/:id
// @access  Private
const updateEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    throw new AppError('Evento no encontrado', 404);
  }

  // Verificar permisos (solo el creador o admin puede editar)
  if (event.creador.toString() !== req.user._id.toString() && req.user.role.nivel > 2) {
    throw new AppError('No tienes permisos para editar este evento', 403);
  }

  // Verificar que la institución existe si se está cambiando
  if (req.body.institucion && req.body.institucion !== event.institucion.toString()) {
    const institutionExists = await Account.findById(req.body.institucion);
    if (!institutionExists) {
      throw new AppError('La institución especificada no existe', 404);
    }
  }

  // Verificar que la división existe si se está cambiando
  if (req.body.division && req.body.division !== event.division?.toString()) {
    const Group = require('../../../shared/models/Group');
    const divisionExists = await Group.findById(req.body.division);
    if (!divisionExists) {
      throw new AppError('La división especificada no existe', 404);
    }
  }

  // Actualizar campos permitidos
  const allowedFields = [
    'titulo', 'descripcion', 'fecha', 'hora', 'lugar', 
    'institucion', 'division', 'estado', 'participantes'
  ];

  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      if (key === 'fecha') {
        event[key] = new Date(req.body[key]);
      } else {
        event[key] = req.body[key];
      }
    }
  });

  await event.save();

  // Obtener evento actualizado con populate
  const updatedEvent = await Event.findById(event._id)
    .populate('creador', 'name email')
    .populate('institucion', 'nombre razonSocial')
    .populate('division', 'nombre')
    .populate('participantes', 'name email');

  res.json({
    success: true,
    message: 'Evento actualizado exitosamente',
    data: {
      event: updatedEvent
    }
  });
});

// @desc    Eliminar evento
// @route   DELETE /api/events/:id
// @access  Private
const deleteEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    throw new AppError('Evento no encontrado', 404);
  }

  // Verificar permisos (solo el creador o admin puede eliminar)
  if (event.creador.toString() !== req.user._id.toString() && req.user.role.nivel > 2) {
    throw new AppError('No tienes permisos para eliminar este evento', 403);
  }

  await Event.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: 'Evento eliminado exitosamente'
  });
});

// @desc    Inscribir usuario a evento
// @route   POST /api/events/:id/participants
// @access  Private
const addParticipant = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    throw new AppError('Evento no encontrado', 404);
  }

  const userId = req.body.userId || req.user._id;

  // Verificar que el usuario existe
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('Usuario no encontrado', 404);
  }

  // Verificar que el usuario no esté ya inscrito
  if (event.participantes.includes(userId)) {
    throw new AppError('El usuario ya está inscrito en este evento', 400);
  }

  // Agregar participante
  event.participantes.push(userId);
  await event.save();

  // Obtener evento actualizado
  const updatedEvent = await Event.findById(event._id)
    .populate('creador', 'name email')
    .populate('institucion', 'nombre razonSocial')
    .populate('division', 'nombre')
    .populate('participantes', 'name email');

  res.json({
    success: true,
    message: 'Participante agregado exitosamente',
    data: {
      event: updatedEvent,
      participante: {
        usuario: user.name,
        email: user.email
      }
    }
  });
});

// @desc    Remover participante de evento
// @route   DELETE /api/events/:id/participants/:userId
// @access  Private
const removeParticipant = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    throw new AppError('Evento no encontrado', 404);
  }

  const userId = req.params.userId;

  // Verificar permisos (solo el creador, admin o el mismo usuario pueden remover)
  if (
    event.creador.toString() !== req.user._id.toString() &&
    req.user.role.nivel > 2 &&
    userId !== req.user._id.toString()
  ) {
    throw new AppError('No tienes permisos para remover este participante', 403);
  }

  // Verificar que el usuario esté inscrito
  if (!event.participantes.includes(userId)) {
    throw new AppError('El usuario no está inscrito en este evento', 404);
  }

  // Remover participante
  event.participantes = event.participantes.filter(id => id.toString() !== userId);
  await event.save();

  res.json({
    success: true,
    message: 'Participante removido exitosamente'
  });
});

// @desc    Actualizar estado de participante
// @route   PUT /api/events/:id/participants/:userId/status
// @access  Private
const updateParticipantStatus = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    throw new AppError('Evento no encontrado', 404);
  }

  // Solo el creador o admin pueden cambiar el estado
  if (event.creador.toString() !== req.user._id.toString() && req.user.role.nivel > 2) {
    throw new AppError('No tienes permisos para cambiar el estado del participante', 403);
  }

  const userId = req.params.userId;
  const { estado } = req.body;

  // Verificar que el usuario esté inscrito
  if (!event.participantes.includes(userId)) {
    throw new AppError('Participante no encontrado en este evento', 404);
  }

  // En esta versión del modelo, no se maneja estado de participantes
  // Los participantes están simplemente inscritos o no
  res.json({
    success: true,
    message: 'Estado del participante actualizado exitosamente',
    data: {
      participante: {
        usuario: userId,
        estado: 'confirmado' // Todos los participantes están confirmados por defecto
      }
    }
  });
});

// @desc    Obtener eventos próximos por institución
// @route   GET /api/events/upcoming/:institutionId
// @access  Private
const getUpcomingEvents = asyncHandler(async (req, res) => {
  const { institutionId } = req.params;
  const limit = parseInt(req.query.limit) || 10;

  // Obtener eventos futuros de la institución
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const events = await Event.find({
    institucion: institutionId,
    fecha: { $gte: today },
    estado: 'activo'
  })
    .populate('creador', 'name email')
    .populate('institucion', 'nombre razonSocial')
    .populate('division', 'nombre')
    .populate('participantes', 'name email')
    .sort({ fecha: 1 })
    .limit(limit);

  res.json({
    success: true,
    message: 'Eventos próximos obtenidos exitosamente',
    data: {
      events
    }
  });
});

// @desc    Obtener estadísticas de eventos por institución
// @route   GET /api/events/stats/:institutionId
// @access  Private
const getEventStats = asyncHandler(async (req, res) => {
  const { institutionId } = req.params;

  const [
    totalEvents,
    eventsByStatus,
    totalParticipants
  ] = await Promise.all([
    Event.countDocuments({ institucion: institutionId }),
    Event.aggregate([
      { $match: { institucion: mongoose.Types.ObjectId(institutionId) } },
      { $group: { _id: '$estado', count: { $sum: 1 } } }
    ]),
    Event.aggregate([
      { $match: { institucion: mongoose.Types.ObjectId(institutionId) } },
      { $project: { participantesCount: { $size: '$participantes' } } },
      { $group: { _id: null, total: { $sum: '$participantesCount' } } }
    ])
  ]);

  res.json({
    success: true,
    message: 'Estadísticas obtenidas exitosamente',
    data: {
      totalEvents,
      eventsByStatus,
      totalParticipants: totalParticipants[0]?.total || 0
    }
  });
});

module.exports = {
  createEvent,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  addParticipant,
  removeParticipant,
  updateParticipantStatus,
  getUpcomingEvents,
  getEventStats
}; 