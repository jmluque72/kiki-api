const express = require('express');
const router = express.Router();
const groupsController = require('../controllers/groups.controller');
const { authenticateToken, setUserInstitution } = require('../middleware/mongoAuth');
const { validateObjectId } = require('../middleware/security');
// Rate limiting deshabilitado

// Rutas de grupos
router.get('/grupos', authenticateToken, setUserInstitution, groupsController.listGroups);
router.post('/grupos', authenticateToken, setUserInstitution, groupsController.createGroup);
router.get('/grupos/mobile/:cuentaId', validateObjectId('cuentaId'), groupsController.getGroupsByAccount);
router.get('/grupos/:id', authenticateToken, setUserInstitution, validateObjectId('id'), groupsController.getGroupById);
router.put('/grupos/:id', authenticateToken, setUserInstitution, validateObjectId('id'), groupsController.updateGroup);
router.delete('/grupos/:id', authenticateToken, setUserInstitution, validateObjectId('id'), groupsController.deleteGroup);

// Rutas alternativas
router.get('/groups/account/:accountId', authenticateToken, validateObjectId('accountId'), groupsController.getGroupsByAccountId);

module.exports = router;

