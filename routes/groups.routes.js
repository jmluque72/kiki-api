const express = require('express');
const router = express.Router();
const groupsController = require('../controllers/groups.controller');
const { authenticateToken, setUserInstitution } = require('../middleware/mongoAuth');

// Rutas de grupos
router.get('/grupos', authenticateToken, setUserInstitution, groupsController.listGroups);
router.post('/grupos', authenticateToken, setUserInstitution, groupsController.createGroup);
router.get('/grupos/mobile/:cuentaId', groupsController.getGroupsByAccount);
router.get('/grupos/:id', authenticateToken, setUserInstitution, groupsController.getGroupById);
router.put('/grupos/:id', authenticateToken, setUserInstitution, groupsController.updateGroup);
router.delete('/grupos/:id', authenticateToken, setUserInstitution, groupsController.deleteGroup);

// Rutas alternativas
router.get('/groups/account/:accountId', authenticateToken, groupsController.getGroupsByAccountId);

module.exports = router;

