const express = require('express');
const router = express.Router();
const { uploadSingle, uploadMultiple, uploadFields, deleteFile, getFileUrl } = require('../middleware/upload');
const { authenticateToken } = require('../middleware/auth');
const { uploadImage, deleteImage, getImageUrl } = require('../services/uploadService');
const multer = require('multer');

// Configurar multer para archivos en memoria (para S3)
const memoryStorage = multer.memoryStorage();
const uploadToMemory = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  }
});

// Configurar multer para videos en memoria (para S3)
const uploadVideoToMemory = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB máximo para videos (coincide con el límite del cliente)
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de video'), false);
    }
  }
});

// Configurar multer para archivos genéricos en memoria (para S3) - para formularios
const uploadFileToMemory = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB máximo para archivos
  },
  fileFilter: (req, file, cb) => {
    // Permitir imágenes, PDFs, documentos de Office, etc.
    const allowedMimes = [
      'image/', // Todas las imágenes
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/'
    ];
    if (allowedMimes.some(mime => file.mimetype.startsWith(mime))) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'), false);
    }
  }
});

// Upload de un solo archivo
router.post('/single', authenticateToken, (req, res) => {
  uploadSingle(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó ningún archivo'
      });
    }

    try {
      const fileUrl = getFileUrl(req, req.file.filename);
      
      res.status(200).json({
        success: true,
        message: 'Archivo subido exitosamente',
        data: {
          filename: req.file.filename,
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          url: fileUrl,
          path: req.file.path
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al procesar el archivo'
      });
    }
  });
});

// Upload de múltiples archivos
router.post('/multiple', authenticateToken, (req, res) => {
  uploadMultiple(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionaron archivos'
      });
    }

    try {
      const files = req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        url: getFileUrl(req, file.filename),
        path: file.path
      }));

      res.status(200).json({
        success: true,
        message: 'Archivos subidos exitosamente',
        data: {
          files: files,
          totalFiles: files.length
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al procesar los archivos'
      });
    }
  });
});

// Upload de campos específicos (imagen, video, galería)
router.post('/fields', authenticateToken, (req, res) => {
  uploadFields(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }

    try {
      const result = {};

      if (req.files.image) {
        result.image = {
          filename: req.files.image[0].filename,
          originalName: req.files.image[0].originalname,
          mimetype: req.files.image[0].mimetype,
          size: req.files.image[0].size,
          url: getFileUrl(req, req.files.image[0].filename),
          path: req.files.image[0].path
        };
      }

      if (req.files.video) {
        result.video = {
          filename: req.files.video[0].filename,
          originalName: req.files.video[0].originalname,
          mimetype: req.files.video[0].mimetype,
          size: req.files.video[0].size,
          url: getFileUrl(req, req.files.video[0].filename),
          path: req.files.video[0].path
        };
      }

      if (req.files.gallery) {
        result.gallery = req.files.gallery.map(file => ({
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          url: getFileUrl(req, file.filename),
          path: file.path
        }));
      }

      res.status(200).json({
        success: true,
        message: 'Archivos subidos exitosamente',
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al procesar los archivos'
      });
    }
  });
});

// Eliminar archivo
router.delete('/:filename', authenticateToken, (req, res) => {
  try {
    const { filename } = req.params;
    
    // Buscar el archivo en todas las subcarpetas
    const fs = require('fs');
    const path = require('path');
    
    const searchPaths = [
      'uploads/images',
      'uploads/videos',
      'uploads/temp',
      'uploads'
    ];
    
    let filePath = null;
    for (const searchPath of searchPaths) {
      const fullPath = path.join(searchPath, filename);
      if (fs.existsSync(fullPath)) {
        filePath = fullPath;
        break;
      }
    }
    
    if (filePath && deleteFile(filePath)) {
      res.status(200).json({
        success: true,
        message: 'Archivo eliminado exitosamente'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Archivo no encontrado'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al eliminar el archivo'
    });
  }
});

// Obtener información de archivo
router.get('/info/:filename', authenticateToken, (req, res) => {
  try {
    const { filename } = req.params;
    
    // Buscar el archivo en todas las subcarpetas
    const fs = require('fs');
    const path = require('path');
    
    const searchPaths = [
      'uploads/images',
      'uploads/videos',
      'uploads/temp',
      'uploads'
    ];
    
    let filePath = null;
    for (const searchPath of searchPaths) {
      const fullPath = path.join(searchPath, filename);
      if (fs.existsSync(fullPath)) {
        filePath = fullPath;
        break;
      }
    }
    
    if (filePath) {
      const stats = fs.statSync(filePath);
      const fileUrl = getFileUrl(req, filename);
      
      res.status(200).json({
        success: true,
        data: {
          filename: filename,
          url: fileUrl,
          size: stats.size,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime
        }
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Archivo no encontrado'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener información del archivo'
    });
  }
});

// ===== ENDPOINTS PARA S3 =====

// Upload de imagen a S3
router.post('/s3/image', authenticateToken, uploadToMemory.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó ninguna imagen'
      });
    }

    // Upload directo a S3 sin multer-s3
    const { v4: uuidv4 } = require('uuid');
    const { s3 } = require('../config/s3.config');

    const fileExtension = req.file.mimetype.split('/')[1];
    const fileName = `${uuidv4()}.${fileExtension}`;
    const key = `uploads/${fileName}`;

    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    };

    const result = await s3.upload(uploadParams).promise();
    
    res.status(200).json({
      success: true,
      message: 'Imagen subida exitosamente',
      imageKey: key,
      data: {
        imageKey: key,
        imageUrl: result.Location
      }
    });
  } catch (error) {
    console.error('Error en upload S3:', error);
    res.status(500).json({
      success: false,
      message: 'Error al subir la imagen a S3',
      error: error.message
    });
  }
});

// Upload de video a S3
router.post('/s3/video', authenticateToken, uploadVideoToMemory.single('video'), async (req, res) => {
  const startTime = Date.now();
  try {
    console.log('📹 [UPLOAD] Iniciando upload de video a S3');
    console.log('📹 [UPLOAD] Request recibido, tamaño del body:', req.headers['content-length'] || 'desconocido');
    
    if (!req.file) {
      console.error('❌ [UPLOAD] No se proporcionó ningún video');
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó ningún video'
      });
    }

    const fileSizeMB = (req.file.buffer.length / (1024 * 1024)).toFixed(2);
    console.log(`📹 [UPLOAD] Video recibido: ${fileSizeMB}MB`);

    // Upload directo a S3 sin multer-s3
    const { v4: uuidv4 } = require('uuid');
    const { s3 } = require('../config/s3.config');

    // Forzar extensión MP4 para todos los videos
    const fileName = `${uuidv4()}.mp4`;
    const key = `uploads/${fileName}`;

    console.log(`📹 [UPLOAD] Iniciando upload a S3: ${key}`);

    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      Body: req.file.buffer,
      ContentType: 'video/mp4' // Forzar content type MP4
    };

    const s3StartTime = Date.now();
    const result = await s3.upload(uploadParams).promise();
    const s3UploadTime = ((Date.now() - s3StartTime) / 1000).toFixed(1);
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ [UPLOAD] Video subido exitosamente a S3 en ${s3UploadTime}s (total: ${totalTime}s)`);
    
    res.status(200).json({
      success: true,
      message: 'Video subido exitosamente',
      videoKey: key,
      data: {
        videoKey: key,
        videoUrl: result.Location
      }
    });
  } catch (error) {
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`❌ [UPLOAD] Error en upload S3 video después de ${totalTime}s:`, error);
    console.error(`❌ [UPLOAD] Error message:`, error.message);
    console.error(`❌ [UPLOAD] Error stack:`, error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Error al subir el video a S3',
      error: error.message
    });
  }
});

// Upload de archivo genérico a S3 (para formularios)
router.post('/s3/file', authenticateToken, uploadFileToMemory.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó ningún archivo'
      });
    }

    // Upload directo a S3 sin multer-s3
    const { v4: uuidv4 } = require('uuid');
    const { s3 } = require('../config/s3.config');

    // Obtener extensión del archivo original o del mimetype
    let fileExtension = '';
    if (req.file.originalname && req.file.originalname.includes('.')) {
      fileExtension = req.file.originalname.split('.').pop();
    } else {
      // Intentar obtener extensión del mimetype
      const mimeToExt = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'application/pdf': 'pdf',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'text/plain': 'txt'
      };
      fileExtension = mimeToExt[req.file.mimetype] || 'bin';
    }

    const fileName = `${uuidv4()}.${fileExtension}`;
    const key = `form-requests/${fileName}`;

    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    };

    const result = await s3.upload(uploadParams).promise();
    
    res.status(200).json({
      success: true,
      message: 'Archivo subido exitosamente',
      fileKey: key,
      data: {
        fileKey: key,
        fileUrl: result.Location
      }
    });
  } catch (error) {
    console.error('Error en upload S3 file:', error);
    res.status(500).json({
      success: false,
      message: 'Error al subir el archivo a S3',
      error: error.message
    });
  }
});

// Eliminar imagen de S3
router.delete('/s3/image/:imageKey', authenticateToken, async (req, res) => {
  try {
    const { imageKey } = req.params;
    
    const result = await deleteImage(imageKey);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error al eliminar imagen de S3:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar la imagen de S3'
    });
  }
});

// Obtener URL de imagen de S3
router.get('/s3/image/:imageKey', authenticateToken, (req, res) => {
  try {
    const { imageKey } = req.params;
    const imageUrl = getImageUrl(imageKey);
    
    if (imageUrl) {
      res.status(200).json({
        success: true,
        data: {
          imageKey: imageKey,
          imageUrl: imageUrl
        }
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Imagen no encontrada'
      });
    }
  } catch (error) {
    console.error('Error al obtener URL de imagen:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la URL de la imagen'
    });
  }
});

module.exports = router; 