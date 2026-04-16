const express = require('express');
const router = express.Router();
const accountsController = require('../controllers/accounts.controller');
const paymentsController = require('../controllers/payments.controller');
const { authenticateToken, setUserInstitution } = require('../middleware/mongoAuth');
const { validateObjectId } = require('../middleware/security');
// Rate limiting deshabilitado

// Rutas de cuentas
router.get('/accounts/mobile', accountsController.getAccountsMobile);
router.get('/accounts', authenticateToken, setUserInstitution, accountsController.listAccounts);
router.post('/accounts', authenticateToken, accountsController.createAccount);
router.get('/accounts/:id', validateObjectId('id'), accountsController.getAccountById);
router.put('/accounts/:id', authenticateToken, validateObjectId('id'), accountsController.updateAccount);
router.delete('/accounts/:id', authenticateToken, validateObjectId('id'), accountsController.deleteAccount);
router.get('/accounts/stats', accountsController.getAccountStats);

// Rutas de configuración de cuenta
router.get('/api/accounts/:accountId/config', authenticateToken, setUserInstitution, validateObjectId('accountId'), accountsController.getAccountConfig);
router.put('/api/accounts/:accountId/config', authenticateToken, setUserInstitution, validateObjectId('accountId'), accountsController.updateAccountConfig);

// Rutas de configuración de cobranzas (pagos)
router.get('/api/accounts/:accountId/payment-config', authenticateToken, setUserInstitution, validateObjectId('accountId'), accountsController.getPaymentConfig);
router.put('/api/accounts/:accountId/payment-config', authenticateToken, setUserInstitution, validateObjectId('accountId'), accountsController.updatePaymentConfig);

// Rutas de registro de pagos (por mes, estudiante, división)
router.get('/api/accounts/:accountId/payments', authenticateToken, setUserInstitution, validateObjectId('accountId'), paymentsController.listPayments);
router.post('/api/accounts/:accountId/payments', authenticateToken, setUserInstitution, validateObjectId('accountId'), paymentsController.upsertPayment);
router.put('/api/accounts/:accountId/students/:studentId/payment-product', authenticateToken, setUserInstitution, validateObjectId('accountId'), validateObjectId('studentId'), paymentsController.assignStudentPaymentProduct);
router.get('/api/accounts/:accountId/payment-stats', authenticateToken, setUserInstitution, validateObjectId('accountId'), paymentsController.getPaymentStats);

// Rutas de logo de cuenta
router.put('/accounts/:accountId/logo', authenticateToken, validateObjectId('accountId'), accountsController.updateAccountLogo);
router.get('/accounts/:accountId/logo', authenticateToken, validateObjectId('accountId'), accountsController.getAccountLogo);

// Rutas de usuarios admin de cuenta
router.post('/api/accounts/:accountId/admin-users', authenticateToken, validateObjectId('accountId'), accountsController.createAdminUser);

module.exports = router;

