const express = require('express');
const router = express.Router();
const formRequestsController = require('../controllers/formRequests.controller');
const { authenticateToken, setUserInstitution } = require('../middleware/mongoAuth');

// Rutas de formularios (Backoffice)
router.post('/api/form-requests', authenticateToken, setUserInstitution, formRequestsController.createFormRequest);
router.get('/api/form-requests/account/:accountId', authenticateToken, setUserInstitution, formRequestsController.getFormRequestsByAccount);
router.get('/api/form-requests/:formId', authenticateToken, setUserInstitution, formRequestsController.getFormRequestById);
router.put('/api/form-requests/:formId', authenticateToken, setUserInstitution, formRequestsController.updateFormRequest);
router.delete('/api/form-requests/:formId', authenticateToken, setUserInstitution, formRequestsController.deleteFormRequest);
router.post('/api/form-requests/:formId/associate-division', authenticateToken, setUserInstitution, formRequestsController.associateFormToDivision);

// Rutas de respuestas (Backoffice)
router.get('/api/form-requests/:formId/responses', authenticateToken, setUserInstitution, formRequestsController.getFormResponses);
router.get('/api/form-requests/responses/division/:divisionId', authenticateToken, setUserInstitution, formRequestsController.getFormResponsesByDivision);
router.put('/api/form-requests/responses/:responseId/approve', authenticateToken, setUserInstitution, formRequestsController.approveFormResponse);
router.put('/api/form-requests/responses/:responseId/reject', authenticateToken, setUserInstitution, formRequestsController.rejectFormResponse);

// Rutas de formularios (App Móvil)
router.get('/api/form-requests/pending/tutor/:tutorId/student/:studentId', authenticateToken, formRequestsController.getPendingFormsForTutor);
router.get('/api/form-requests/all/tutor/:tutorId/student/:studentId', authenticateToken, formRequestsController.getAllFormsForTutor);
router.post('/api/form-requests/:formId/responses', authenticateToken, formRequestsController.saveFormResponse);
router.get('/api/form-requests/:formId/responses/student/:studentId', authenticateToken, formRequestsController.getFormResponse);
router.get('/api/form-requests/check-required/:tutorId/:studentId', authenticateToken, formRequestsController.checkRequiredFormsPending);

module.exports = router;

