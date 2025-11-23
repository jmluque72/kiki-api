const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticateToken, requireAdmin, requireSuperAdmin } = require('../middleware/mongoAuth');

// Rutas de cambio de contraseña
router.post('/users/change-password', authenticateToken, authController.changePassword);

// Rutas de recuperación de contraseña
router.post('/users/forgot-password', authController.forgotPassword);
router.post('/users/verify-reset-code', authController.verifyResetCode);
router.post('/users/reset-password', authController.resetPassword);

// Rutas de expiración de contraseñas
router.get('/auth/password-expiration-status', authenticateToken, authController.getPasswordExpirationStatus);
router.get('/admin/password-expiration-stats', authenticateToken, requireAdmin, authController.getPasswordExpirationStats);
router.post('/admin/extend-password-expiration', authenticateToken, requireAdmin, authController.extendPasswordExpiration);
router.post('/admin/check-password-expirations', authenticateToken, requireSuperAdmin, authController.checkPasswordExpirations);

module.exports = router;

