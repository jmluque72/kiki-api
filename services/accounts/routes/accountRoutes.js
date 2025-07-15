const express = require('express');
const { 
  createAccount, 
  getAllAccounts, 
  getAccountById, 
  updateAccount, 
  deleteAccount, 
  getAccountStats 
} = require('../controllers/accountController');
const { authenticateToken } = require('../../../shared/middleware/auth');
const { 
  validateAccountCreate, 
  validateAccountUpdate 
} = require('../../../shared/middleware/validation');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Rutas para estadísticas (debe ir antes de /:id)
router.get('/stats', getAccountStats);

// Rutas CRUD principales
router.post('/', validateAccountCreate, createAccount);
router.get('/', getAllAccounts);
router.get('/:id', getAccountById);
router.put('/:id', validateAccountUpdate, updateAccount);
router.delete('/:id', deleteAccount);

module.exports = router; 