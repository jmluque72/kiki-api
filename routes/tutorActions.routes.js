const express = require('express');
const router = express.Router();
const tutorActionsController = require('../controllers/tutorActions.controller');
const { authenticateToken, setUserInstitution } = require('../middleware/mongoAuth');

// Crear acción del tutor
router.post('/api/tutor-actions', authenticateToken, setUserInstitution, tutorActionsController.createTutorAction);

// Obtener acciones del tutor (opcional, para historial)
router.get('/api/tutor-actions', authenticateToken, setUserInstitution, tutorActionsController.getTutorActions);

module.exports = router;

