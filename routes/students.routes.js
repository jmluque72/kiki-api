const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const multerS3 = require('multer-s3');
const { s3 } = require('../config/s3.config');
const studentsController = require('../controllers/students.controller');
const { authenticateToken, setUserInstitution } = require('../middleware/mongoAuth');

// Configuración de multer para archivos Excel
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
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

const uploadExcel = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'));
    }
  }
});

// Configuración específica para avatares de estudiantes
const uploadStudentAvatarToS3 = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET_NAME || 'kiki-bucket-app',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      const studentId = req.params.studentId;
      const fileName = `students/${studentId}/${Date.now()}-${file.originalname}`;
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

// Rutas de estudiantes
router.get('/students', authenticateToken, setUserInstitution, studentsController.listStudents);
router.get('/students/by-account-division', authenticateToken, studentsController.getStudentsByAccountDivision);
router.get('/students/template', authenticateToken, studentsController.getStudentsTemplate);
router.post('/students/upload-excel', authenticateToken, uploadExcel.single('excel'), studentsController.uploadStudentsExcel);
router.get('/students/:studentId', authenticateToken, studentsController.getStudentById);
router.get('/students/division/:divisionId', studentsController.getStudentsByDivision);
router.put('/students/:studentId/avatar', authenticateToken, uploadStudentAvatarToS3.single('avatar'), studentsController.updateStudentAvatar);
router.delete('/students/:id', authenticateToken, studentsController.deleteStudent);
router.post('/students/generate-qr-codes', authenticateToken, studentsController.generateQRCodes);
router.get('/students/by-qr/:qrCode', authenticateToken, studentsController.getStudentByQR);

// Rutas de coordinadores
router.get('/coordinators', authenticateToken, setUserInstitution, studentsController.listCoordinators);
router.get('/coordinators/by-division/:divisionId', authenticateToken, setUserInstitution, studentsController.getCoordinatorsByDivision);
router.get('/coordinators/template', authenticateToken, studentsController.getCoordinatorsTemplate);
router.post('/coordinators/upload-excel', authenticateToken, uploadExcel.single('file'), studentsController.uploadCoordinatorsExcel);

// Rutas de tutores
router.get('/tutors', authenticateToken, setUserInstitution, studentsController.listTutors);
router.get('/tutors/by-division/:divisionId', authenticateToken, setUserInstitution, studentsController.getTutorsByDivision);

module.exports = router;
