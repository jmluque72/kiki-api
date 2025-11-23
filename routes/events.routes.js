const express = require('express');
const router = express.Router();
const eventsController = require('../controllers/events.controller');
const { authenticateToken, setUserInstitution } = require('../middleware/mongoAuth');

// Rutas de eventos
router.get('/debug/eventos', authenticateToken, eventsController.debugEventos);
router.get('/backoffice/eventos/calendar', authenticateToken, eventsController.getCalendarEvents);
router.get('/events', authenticateToken, setUserInstitution, eventsController.listEvents);
router.post('/api/events', authenticateToken, eventsController.createEventFromBackoffice);
router.post('/events/create', authenticateToken, eventsController.createEvent);
router.get('/events/institution/:institutionId', authenticateToken, eventsController.getEventsByInstitution);
router.post('/events/:eventId/authorize', authenticateToken, eventsController.authorizeEvent);
router.get('/api/events/export/month', authenticateToken, setUserInstitution, eventsController.exportEventsMonth);
router.get('/events/:eventId/authorizations', authenticateToken, eventsController.getEventAuthorizations);
router.get('/events/:eventId/authorization/:studentId', authenticateToken, eventsController.getEventAuthorization);

module.exports = router;

