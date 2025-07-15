const express = require('express');
const router = express.Router();
const {
  createGroup,
  getGroupsByAccount,
  getGroupById,
  updateGroup,
  deleteGroup,
  addUserToGroup,
  removeUserFromGroup,
  getGroupStats
} = require('../controllers/groupController');

const { authenticateToken, authorizeRoles } = require('../../../shared/middleware/auth');
const {
  validateGroupCreate,
  validateGroupUpdate,
  validateGroupAddUser,
  validateGroupRemoveUser
} = require('../../../shared/middleware/validation');

// Aplicar autenticación a todas las rutas
router.use(authenticateToken);

// Rutas para grupos
router.post('/', validateGroupCreate, createGroup);
router.get('/account/:accountId', getGroupsByAccount);
router.get('/account/:accountId/stats', getGroupStats);
router.get('/:id', getGroupById);
router.put('/:id', validateGroupUpdate, updateGroup);
router.delete('/:id', deleteGroup);

// Rutas para gestión de usuarios en grupos
router.post('/:id/users', validateGroupAddUser, addUserToGroup);
router.delete('/:id/users', validateGroupRemoveUser, removeUserFromGroup);

module.exports = router; 