const express = require('express');
const router = express.Router();
const pickupController = require('../controllers/pickup.controller');
const { authenticateToken } = require('../middleware/mongoAuth');

// Rutas públicas de pickup
router.get('/pickup/account/:accountId', pickupController.getPickupsByAccount);
router.get('/pickup/student/:studentId', pickupController.getPickupsByStudent);
router.post('/pickup', pickupController.createPickup);
router.put('/pickup/:pickupId', pickupController.updatePickup);
router.delete('/pickup/:pickupId', pickupController.deletePickup);

// Rutas de divisiones
router.get('/divisions/account/:accountId', pickupController.getDivisionsByAccount);

// Rutas autenticadas para familyadmin
router.get('/pickups/familyadmin', authenticateToken, pickupController.getFamilyAdminPickups);
router.post('/pickups/familyadmin', authenticateToken, pickupController.createFamilyAdminPickup);
router.delete('/pickup/:id', authenticateToken, pickupController.deletePickupWithAuth);

module.exports = router;

