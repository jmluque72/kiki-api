const express = require('express');
const router = express.Router();
const multer = require('multer');
const multerS3 = require('multer-s3');
const { s3 } = require('../config/s3.config');
const pickupController = require('../controllers/pickup.controller');
const { authenticateToken } = require('../middleware/mongoAuth');

// Configuración específica para fotos de personas autorizadas
const uploadPickupPhotoToS3 = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET_NAME || 'kiki-bucket-app',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      const pickupId = req.params.pickupId;
      const fileName = `pickups/${pickupId}/${Date.now()}-${file.originalname}`;
      cb(null, fileName);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'));
    }
  }
});

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
router.put('/pickups/:pickupId/foto', authenticateToken, uploadPickupPhotoToS3.single('foto'), pickupController.updatePickupPhoto);
router.delete('/pickup/:id', authenticateToken, pickupController.deletePickupWithAuth);

module.exports = router;

