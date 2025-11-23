const express = require('express');
const router = express.Router();
const accountsController = require('../controllers/accounts.controller');
const { authenticateToken, setUserInstitution } = require('../middleware/mongoAuth');

// Rutas de cuentas
router.get('/accounts/mobile', accountsController.getAccountsMobile);
router.get('/accounts', authenticateToken, setUserInstitution, accountsController.listAccounts);
router.post('/accounts', authenticateToken, accountsController.createAccount);
router.get('/accounts/:id', accountsController.getAccountById);
router.put('/accounts/:id', authenticateToken, accountsController.updateAccount);
router.delete('/accounts/:id', authenticateToken, accountsController.deleteAccount);
router.get('/accounts/stats', accountsController.getAccountStats);

// Rutas de configuración de cuenta
router.get('/api/accounts/:accountId/config', authenticateToken, setUserInstitution, accountsController.getAccountConfig);
router.put('/api/accounts/:accountId/config', authenticateToken, setUserInstitution, accountsController.updateAccountConfig);

// Rutas de logo de cuenta
router.put('/accounts/:accountId/logo', authenticateToken, accountsController.updateAccountLogo);
router.get('/accounts/:accountId/logo', authenticateToken, accountsController.getAccountLogo);

// Rutas de usuarios admin de cuenta
router.post('/api/accounts/:accountId/admin-users', authenticateToken, accountsController.createAdminUser);

module.exports = router;

