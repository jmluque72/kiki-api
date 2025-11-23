const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/mongoAuth');

// setUserInstitution se pasará como parámetro desde simple-server.js
// Por ahora lo definimos aquí para evitar dependencia circular
const User = require('../shared/models/User');
const Account = require('../shared/models/Account');

const setUserInstitution = async (req, res, next) => {
  try {
    let roleName = null;
    if (typeof req.user.role === 'string') {
      roleName = req.user.role;
    } else if (req.user.role?.nombre) {
      roleName = req.user.role.nombre;
    }
    
    if (req.user && (roleName === 'adminaccount' || roleName === 'accountadmin')) {
      let accountId = req.user.account;
      if (!accountId) {
        accountId = '68dc5f1a626391464e2bcb3c'; // BAMBINO por defecto
        await User.findByIdAndUpdate(req.user._id, { account: accountId });
      }
      
      const account = await Account.findById(accountId);
      if (account) {
        req.userInstitution = {
          _id: account._id,
          nombre: account.nombre
        };
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
  sendNotification,
  getRecipients
} = require('../controllers/notifications.controller');

// Rutas de notificaciones
router.get('/backoffice/notifications/calendar', authenticateToken, setUserInstitution, getCalendarNotifications);
router.get('/notifications', authenticateToken, setUserInstitution, getNotifications);
router.get('/notifications/family', authenticateToken, getFamilyNotifications);
router.get('/notifications/:id/details', authenticateToken, getNotificationDetails);
router.put('/notifications/:id/read', authenticateToken, markNotificationAsRead);
router.delete('/notifications/:id', authenticateToken, deleteNotification);
router.get('/notifications/unread-count', authenticateToken, getUnreadCount);
router.get('/notifications/family/unread-count', authenticateToken, getFamilyUnreadCount);
router.get('/backoffice/notifications', authenticateToken, setUserInstitution, getBackofficeNotifications);
router.post('/notifications', authenticateToken, setUserInstitution, sendNotification);
router.get('/notifications/recipients', authenticateToken, getRecipients);

module.exports = router;

