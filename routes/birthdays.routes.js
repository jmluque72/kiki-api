const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const birthdaysController = require('../controllers/birthdays.controller');
const { authenticateToken, setUserInstitution } = require('../middleware/mongoAuth');

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `birthdays-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const uploadExcel = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.endsWith('.xlsx') ||
      file.originalname.endsWith('.xls')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'));
    }
  }
});

router.get('/birthdays/mobile', authenticateToken, birthdaysController.mobileCalendar);

router.get('/birthdays/template', authenticateToken, birthdaysController.downloadTemplate);

router.get('/birthdays', authenticateToken, setUserInstitution, birthdaysController.list);

router.post('/birthdays', authenticateToken, setUserInstitution, birthdaysController.create);

router.put('/birthdays/:id', authenticateToken, setUserInstitution, birthdaysController.update);

router.delete('/birthdays/:id', authenticateToken, setUserInstitution, birthdaysController.remove);

router.post(
  '/birthdays/upload-excel',
  authenticateToken,
  setUserInstitution,
  uploadExcel.single('excel'),
  birthdaysController.uploadExcel
);

module.exports = router;
