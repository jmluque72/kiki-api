const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const usersController = require('../controllers/users.controller');
const { authenticateToken, setUserInstitution } = require('../middleware/mongoAuth');
// Rate limiting DESACTIVADO
// const { loginRateLimit, registerRateLimit } = require('../middleware/rateLimiter');

// Configuración de multer para avatares
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/avatars');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  }
});

// Rutas de autenticación
router.post('/users/login', /* loginRateLimit, */ usersController.login);
router.post('/auth/refresh', usersController.refreshToken);
router.post('/auth/revoke', usersController.revokeToken);
router.post('/auth/cognito-login', /* loginRateLimit, */ usersController.cognitoLogin);
router.get('/auth/verify', authenticateToken, usersController.verifyAuth);
router.get('/auth/config', usersController.getAuthConfig);

// Rutas de perfil de usuario
router.get('/users/profile', authenticateToken, setUserInstitution, usersController.getProfile);
router.put('/users/profile', authenticateToken, setUserInstitution, usersController.updateProfile);
router.put('/users/avatar', authenticateToken, upload.single('avatar'), usersController.updateAvatar);

// Rutas de usuarios
router.get('/users', authenticateToken, setUserInstitution, usersController.getUsers);
router.get('/api/users', authenticateToken, setUserInstitution, usersController.getUsers);
router.post('/users/register-mobile', /* registerRateLimit, */ usersController.registerMobile);

// Rutas de asociaciones
router.put('/users/approve-association/:associationId', authenticateToken, usersController.approveAssociation);
router.put('/users/reject-association/:associationId', authenticateToken, usersController.rejectAssociation);
router.get('/users/pending-associations', authenticateToken, setUserInstitution, usersController.getPendingAssociations);

// Rutas de 2FA
router.post('/auth/2fa/setup', authenticateToken, usersController.setup2FA);
router.post('/auth/2fa/verify', usersController.verify2FA);
router.get('/auth/2fa/status', authenticateToken, usersController.get2FAStatus);

module.exports = router;

