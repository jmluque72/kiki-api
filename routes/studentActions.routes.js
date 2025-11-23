const express = require('express');
const router = express.Router();
const studentActionsController = require('../controllers/studentActions.controller');
const { authenticateToken, setUserInstitution } = require('../middleware/mongoAuth');

// Test endpoint
router.get('/api/student-actions/test', studentActionsController.test);

// Rutas de acciones
router.get('/api/student-actions', authenticateToken, setUserInstitution, studentActionsController.listActions);
router.get('/api/student-actions/division/:divisionId', authenticateToken, setUserInstitution, studentActionsController.getActionsByDivision);
router.post('/api/student-actions', authenticateToken, setUserInstitution, studentActionsController.createAction);
router.put('/api/student-actions/:actionId', authenticateToken, setUserInstitution, studentActionsController.updateAction);
router.delete('/api/student-actions/:actionId', authenticateToken, setUserInstitution, studentActionsController.deleteAction);

// Rutas de logs
router.post('/api/student-actions/log', authenticateToken, setUserInstitution, studentActionsController.createLog);
router.get('/api/student-actions/log/student/:studentId', authenticateToken, setUserInstitution, studentActionsController.getLogsByStudent);
router.get('/api/student-actions/log/division/:divisionId', authenticateToken, setUserInstitution, studentActionsController.getLogsByDivision);
router.get('/api/student-actions/log/account/:accountId', authenticateToken, setUserInstitution, studentActionsController.getLogsByAccount);

module.exports = router;

