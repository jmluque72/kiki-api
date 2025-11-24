const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/mongoAuth');
const {
  registerToken,
  unregisterToken,
  sendTestNotification
} = require('../controllers/push.controller');

/**
 * @route   POST /push/register-token
 * @desc    Registrar token de dispositivo para push notifications
 * @access  Private
 */
router.post('/register-token', authenticateToken, registerToken);

/**
 * @route   POST /push/unregister-token
 * @desc    Desregistrar token de dispositivo
 * @access  Private
 */
router.post('/unregister-token', authenticateToken, unregisterToken);

/**
 * @route   POST /push/test
 * @desc    Enviar push notification de prueba al dispositivo del usuario autenticado
 * @access  Private
 */
router.post('/test', authenticateToken, sendTestNotification);

module.exports = router;

