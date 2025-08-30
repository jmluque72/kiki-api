const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/eventController');

const { authenticateToken, authorizeRoles } = require('../../../shared/middleware/auth');
const {
  validateEventCreate,
  validateEventUpdate,
  validateEventAddParticipant,
  validateEventUpdateParticipantStatus
} = require('../../../shared/middleware/validation');

// Aplicar autenticación a todas las rutas
router.use(authenticateToken);

// Rutas para estadísticas y eventos especiales (deben ir antes de /:id)
router.get('/upcoming/:institutionId', getUpcomingEvents);
router.get('/stats/:institutionId', getEventStats);

// Rutas CRUD principales
router.post('/', validateEventCreate, createEvent);
router.get('/', getAllEvents);
router.get('/:id', getEventById);
router.put('/:id', validateEventUpdate, updateEvent);
router.delete('/:id', deleteEvent);

// Rutas para manejo de participantes
router.post('/:id/participants', validateEventAddParticipant, addParticipant);
router.delete('/:id/participants/:userId', removeParticipant);
router.put('/:id/participants/:userId/status', validateEventUpdateParticipantStatus, updateParticipantStatus);

module.exports = router; 