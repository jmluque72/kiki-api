const express = require('express');
const { 
  registerUser, 
  loginUser, 
  getProfile, 
  updateProfile, 
  getAllUsers, 
  getUserById, 
  changeUserStatus 
} = require('../controllers/userController');
const { authenticateToken, authorizeRoles } = require('../../../shared/middleware/auth');
const { 
  validateUserRegister, 
  validateUserLogin, 
  validateUserUpdate 
} = require('../../../shared/middleware/validation');

const router = express.Router();

// Rutas públicas
router.post('/register', validateUserRegister, registerUser);
router.post('/login', validateUserLogin, loginUser);

// Rutas protegidas - requieren autenticación
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, validateUserUpdate, updateProfile);

// Rutas solo para administradores
router.get('/', authenticateToken, authorizeRoles('admin'), getAllUsers);
router.get('/:id', authenticateToken, authorizeRoles('admin'), getUserById);
router.put('/:id/status', authenticateToken, authorizeRoles('admin'), changeUserStatus);

module.exports = router; 