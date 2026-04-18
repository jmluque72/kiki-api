const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/mongoAuth');

// setUserInstitution se pasará como parámetro desde simple-server.js
// Por ahora lo definimos aquí para evitar dependencia circular
const User = require('../shared/models/User');
const Account = require('../shared/models/Account');

const setUserInstitution = async (req, res, next) => {
  try {
    // Obtener el usuario completo de la base de datos para asegurar que tenemos el rol
    let dbUser = null;
    
    if (req.user.isCognitoUser) {
      dbUser = await User.findOne({ email: req.user.email }).populate('role').populate('account');
    } else {
      const userId = req.user._id || req.user.userId;
      if (userId) {
        dbUser = await User.findById(userId).populate('role').populate('account');
      }
    }
    
    if (dbUser) {
      const roleName = dbUser.role?.nombre;
      
      if (roleName === 'adminaccount' || roleName === 'accountadmin') {
        let accountId = dbUser.account;
        
        if (!accountId) {
          // Buscar en Shared si no tiene cuenta directa
          const Shared = require('../shared/models/Shared');
          const sharedAssociation = await Shared.findOne({
            user: dbUser._id,
            status: 'active'
          }).populate('account', '_id nombre');
          
          if (sharedAssociation && sharedAssociation.account) {
            accountId = sharedAssociation.account;
          } else {
            // Usar cuenta por defecto
            accountId = '68dc5f1a626391464e2bcb3c'; // BAMBINO por defecto
            await User.findByIdAndUpdate(dbUser._id, { account: accountId });
          }
        }
        
        const account = await Account.findById(typeof accountId === 'object' ? accountId._id : accountId);
        if (account) {
          req.userInstitution = {
            _id: account._id,
            nombre: account.nombre
          };
        }
      }
    }
    
    next();
  } catch (error) {
    console.error('Error en setUserInstitution:', error);
    next();
  }
};

const {
  getCalendarNotifications,
  getNotifications,
  getFamilyNotifications,
  getNotificationDetails,
  markNotificationAsRead,
  deleteNotification,
  getUnreadCount,
  getFamilyUnreadCount,
  getBackofficeNotifications,
  getAllInstitutionNotifications,
  sendNotification,
  getRecipients,
  getPendingNotifications,
  approveNotification,
  rejectNotification,
  createTemplate,
  getTemplates,
  updateTemplate,
  deleteTemplate
} = require('../controllers/notifications.controller');

// Rutas de notificaciones
router.get('/backoffice/notifications/calendar', authenticateToken, setUserInstitution, getCalendarNotifications);
router.get('/notifications', authenticateToken, setUserInstitution, getNotifications);
router.get('/notifications/family', authenticateToken, getFamilyNotifications);
router.get('/notifications/:id/details', authenticateToken, setUserInstitution, getNotificationDetails);
router.put('/notifications/:id/read', authenticateToken, markNotificationAsRead);
router.delete('/notifications/:id', authenticateToken, deleteNotification);
router.get('/notifications/unread-count', authenticateToken, getUnreadCount);
router.get('/notifications/family/unread-count', authenticateToken, getFamilyUnreadCount);
// IMPORTANTE: La ruta más específica debe ir ANTES de la más general
router.get('/backoffice/notifications/all', authenticateToken, setUserInstitution, getAllInstitutionNotifications);
router.get('/backoffice/notifications', authenticateToken, setUserInstitution, getBackofficeNotifications);
router.post('/notifications', authenticateToken, setUserInstitution, sendNotification);
router.get('/notifications/recipients', authenticateToken, getRecipients);
router.get('/backoffice/notifications/pending', authenticateToken, setUserInstitution, getPendingNotifications);
router.put('/backoffice/notifications/:notificationId/approve', authenticateToken, setUserInstitution, approveNotification);
router.put('/backoffice/notifications/:notificationId/reject', authenticateToken, setUserInstitution, rejectNotification);

// Rutas de templates de notificaciones
router.post('/notifications/templates', authenticateToken, setUserInstitution, createTemplate);
router.get('/notifications/templates', authenticateToken, setUserInstitution, getTemplates);
router.put('/notifications/templates/:id', authenticateToken, setUserInstitution, updateTemplate);
router.delete('/notifications/templates/:id', authenticateToken, setUserInstitution, deleteTemplate);

module.exports = router;

