const express = require('express');
const router = express.Router();
const {
  getAllRoles,
  getRoleById,
  getRoleByName,
  createRole,
  updateRole,
  deleteRole,
  getRoleHierarchy,
  getRolesByLevel,
  checkRolePermissions,
  initializeRoles
} = require('../controllers/roleController');

const { authenticateToken, authorizeRoles } = require('../../../shared/middleware/auth');
const {
  validateRoleCreate,
  validateRoleUpdate
} = require('../../../shared/middleware/validation');

// Aplicar autenticación a todas las rutas
router.use(authenticateToken);

// Rutas públicas (para usuarios autenticados)
router.get('/', getAllRoles);
router.get('/hierarchy', getRoleHierarchy);
router.get('/level/:nivel', getRolesByLevel);
router.get('/name/:nombre', getRoleByName);
router.get('/:id', getRoleById);
router.get('/:id/permissions', checkRolePermissions);

// Rutas administrativas (solo para superadmin)
router.post('/', authorizeRoles(['superadmin']), validateRoleCreate, createRole);
router.put('/:id', authorizeRoles(['superadmin']), validateRoleUpdate, updateRole);
router.delete('/:id', authorizeRoles(['superadmin']), deleteRole);

// Ruta especial para inicializar roles (solo para superadmin)
router.post('/initialize', authorizeRoles(['superadmin']), initializeRoles);

module.exports = router; 