const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');
const { authenticateToken, setUserInstitution } = require('../middleware/mongoAuth');

// Rutas legacy de asistencias
router.get('/asistencias', authenticateToken, attendanceController.listAsistencias);
router.post('/asistencias', authenticateToken, attendanceController.createAsistencia);
router.put('/asistencia/:asistenciaId', authenticateToken, attendanceController.updateAsistencia);
router.delete('/asistencia/:asistenciaId', authenticateToken, attendanceController.deleteAsistencia);

// Rutas nuevas de asistencias
router.post('/asistencias/save', authenticateToken, attendanceController.saveAsistencia);
router.get('/asistencias/by-date', authenticateToken, attendanceController.getAsistenciaByDate);
router.post('/asistencias/retirada', authenticateToken, attendanceController.saveRetirada);
router.get('/asistencias/student/:studentId', authenticateToken, attendanceController.getStudentAttendance);

// Rutas duplicadas (legacy - sin la 's')
router.post('/asistencia', authenticateToken, attendanceController.saveAsistencia);
router.get('/asistencia/by-date', authenticateToken, attendanceController.getAsistenciaByDate);
router.post('/asistencia/retirada', authenticateToken, attendanceController.saveRetirada);
router.get('/asistencia/student-attendance', authenticateToken, attendanceController.getStudentAttendance);

// Rutas del backoffice
router.get('/backoffice/asistencias', authenticateToken, setUserInstitution, attendanceController.getBackofficeAsistencias);
router.get('/backoffice/asistencias/calendar', authenticateToken, setUserInstitution, attendanceController.getCalendarAsistencias);
router.get('/backoffice/asistencias/day/:fecha', authenticateToken, setUserInstitution, attendanceController.getDayAsistencias);
router.post('/backoffice/asistencias', authenticateToken, setUserInstitution, attendanceController.createBackofficeAsistencia);
router.put('/backoffice/asistencias/:asistenciaId', authenticateToken, setUserInstitution, attendanceController.updateBackofficeAsistencia);
router.delete('/backoffice/asistencias/:asistenciaId', authenticateToken, setUserInstitution, attendanceController.deleteBackofficeAsistencia);
router.get('/backoffice/asistencias/stats', authenticateToken, setUserInstitution, attendanceController.getAttendanceStats);
router.get('/backoffice/asistencias/export', authenticateToken, setUserInstitution, attendanceController.exportAsistencias);

module.exports = router;

