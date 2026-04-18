const express = require('express');
const router = express.Router();
const backofficeController = require('../controllers/backoffice.controller');
const { authenticateToken, setUserInstitution } = require('../middleware/mongoAuth');

// Rutas de calendario y asistencias del backoffice
router.get('/backoffice/asistencias/calendar', authenticateToken, setUserInstitution, backofficeController.getCalendarAsistencias);
router.get('/backoffice/asistencias/day/:fecha', authenticateToken, backofficeController.getDayAsistencias);
router.get('/backoffice/asistencias', authenticateToken, setUserInstitution, backofficeController.getAsistencias);
router.post('/backoffice/asistencias', authenticateToken, backofficeController.createAsistencia);
router.put('/backoffice/asistencias/:asistenciaId', authenticateToken, backofficeController.updateAsistencia);
router.delete('/backoffice/asistencias/:asistenciaId', authenticateToken, backofficeController.deleteAsistencia);
router.get('/backoffice/asistencias/stats', authenticateToken, backofficeController.getAsistenciasStats);
router.get('/backoffice/asistencias/export', authenticateToken, backofficeController.exportAsistencias);

module.exports = router;

