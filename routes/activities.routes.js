const express = require('express');
const router = express.Router();
const activitiesController = require('../controllers/activities.controller');
const { authenticateToken, setUserInstitution } = require('../middleware/mongoAuth');

// Rutas de actividades
router.get('/activities', authenticateToken, setUserInstitution, activitiesController.listActivities);
router.post('/activities', authenticateToken, setUserInstitution, activitiesController.createActivity);
router.patch('/activities/:id/estado', authenticateToken, activitiesController.updateActivityStatus);
router.delete('/activities/:id', authenticateToken, activitiesController.deleteActivityCoordinator);
router.get('/activities/mobile', authenticateToken, activitiesController.getMobileActivities);

// Rutas de actividades para backoffice
router.get('/backoffice/actividades/calendar', authenticateToken, setUserInstitution, activitiesController.getCalendarActivities);
router.delete('/backoffice/actividades/:id', authenticateToken, activitiesController.deleteActivityBackoffice);
router.get('/backoffice/actividades/day', authenticateToken, setUserInstitution, activitiesController.getDayActivities);

// Rutas de favoritos de actividades
router.post('/activities/:activityId/favorite', authenticateToken, activitiesController.toggleActivityFavorite);
router.get('/activities/:activityId/favorite/:studentId', authenticateToken, activitiesController.checkActivityFavorite);
router.get('/students/:studentId/favorites', authenticateToken, activitiesController.getStudentFavorites);

module.exports = router;

