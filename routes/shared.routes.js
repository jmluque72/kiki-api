const express = require('express');
const router = express.Router();
const sharedController = require('../controllers/shared.controller');
const { authenticateToken, setUserInstitution } = require('../middleware/mongoAuth');

// Rutas de asociaciones compartidas
router.get('/shared/user', authenticateToken, setUserInstitution, sharedController.getUserAssociations);
router.get('/api/shared/user', authenticateToken, sharedController.getApiUserAssociations);
router.get('/shared/student/:studentId', authenticateToken, sharedController.getStudentAssociations);
router.post('/shared', authenticateToken, sharedController.createAssociation);
router.get('/shared/student/:studentId/familyviewers', authenticateToken, sharedController.getStudentFamilyViewers);
router.delete('/shared/:id', authenticateToken, sharedController.deleteAssociation);
router.post('/shared/request', authenticateToken, sharedController.requestAssociation);

// Rutas de asociación activa
router.get('/active-association', authenticateToken, setUserInstitution, sharedController.getActiveAssociation);
router.get('/active-association/available', authenticateToken, sharedController.getAvailableAssociations);
router.post('/active-association/set', authenticateToken, sharedController.setActiveAssociation);
router.post('/active-association/cleanup', authenticateToken, sharedController.cleanupActiveAssociations);

module.exports = router;

