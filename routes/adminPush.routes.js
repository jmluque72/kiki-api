const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin, setUserInstitution } = require('../middleware/mongoAuth');
// Rate limiting deshabilitado
const {
  createPushNotification,
  listPushNotifications,
  getPushNotification,
  getUsersByDivision
} = require('../controllers/adminPush.controller');

console.log('📋 [ADMIN PUSH ROUTES] Módulo de rutas cargado');

/**
 * @route   POST /api/admin/push-notifications
 * @desc    Crear una notificación push administrativa
 * @access  Private (Admin)
 */
router.post(
  '/',
  authenticateToken,
  setUserInstitution,
  requireAdmin,
  createPushNotification
);

/**
 * @route   GET /api/admin/push-notifications/users/division/:divisionId
 * @desc    Obtener usuarios (tutores y coordinadores) de una división
 * @access  Private (Admin)
 * IMPORTANTE: Esta ruta debe ir ANTES de /:id para evitar conflictos
 */
router.get(
  '/users/division/:divisionId',
  authenticateToken,
  setUserInstitution,
  requireAdmin,
  getUsersByDivision
);

/**
 * @route   GET /api/admin/push-notifications
 * @desc    Listar notificaciones push administrativas
 * @access  Private (Admin)
 */
router.get(
  '/',
  authenticateToken,
  setUserInstitution,
  requireAdmin,
  listPushNotifications
);

/**
 * @route   GET /api/admin/push-notifications/:id
 * @desc    Obtener detalles de una notificación push
 * @access  Private (Admin)
 * IMPORTANTE: Esta ruta debe ir AL FINAL para no interceptar rutas específicas
 */
router.get(
  '/:id',
  authenticateToken,
  setUserInstitution,
  requireAdmin,
  getPushNotification
);

module.exports = router;

