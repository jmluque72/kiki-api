const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Document = require('../models/Document');
const Account = require('../shared/models/Account');
const User = require('../shared/models/User');
const { authenticateToken, requireRole } = require('../middleware/mongoAuth');
const { uploadToS3, deleteFromS3 } = require('../services/s3Service');

const router = express.Router();

// Configuración de multer para archivos temporales
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/documents';
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
    fileSize: 10 * 1024 * 1024 // 10MB límite
  },
  fileFilter: function (req, file, cb) {
    // Permitir solo PDFs
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF'), false);
    }
  }
});

// GET /api/documents - Obtener documentos de una institución
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { institucionId, tipo } = req.query;
    
    if (!institucionId) {
      return res.status(400).json({
        success: false,
        message: 'ID de institución requerido'
      });
    }

    let query = {
      institucion: institucionId,
      activo: true
    };

    if (tipo) {
      query.tipo = tipo;
    }

    const documentos = await Document.find(query)
      .populate('subidoPor', 'nombre email')
      .populate('institucion', 'nombre')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: documentos
    });
  } catch (error) {
    console.error('Error obteniendo documentos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/documents/terminos-condiciones - Obtener términos y condiciones de la institución activa
router.get('/terminos-condiciones', authenticateToken, async (req, res) => {
  try {
    // Verificar permisos del usuario
    let currentUser;
    if (req.user.isCognitoUser) {
      currentUser = await User.findOne({ email: req.user.email }).populate('role account');
    } else {
      const { userId } = req.user;
      currentUser = await User.findById(userId).populate('role account');
    }
    
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Obtener la institución del usuario
    let institucion;
    if (currentUser.account) {
      // Usuario tiene institución directa (Cognito adminaccount)
      institucion = currentUser.account;
    } else {
      // Usuario legacy - buscar institución activa
      const ActiveAssociation = require('../models/ActiveAssociation');
      const activeAssociation = await ActiveAssociation.findOne({ user: currentUser._id })
        .populate('account');
      
      if (!activeAssociation || !activeAssociation.account) {
        return res.status(404).json({
          success: false,
          message: 'No se encontró institución activa'
        });
      }
      institucion = activeAssociation.account;
    }

    // Buscar documento de términos y condiciones
    const document = await Document.findOne({
      institucion: institucion._id,
      tipo: 'terminos_condiciones',
      activo: true
    }).sort({ createdAt: -1 });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron términos y condiciones para esta institución'
      });
    }

    res.json({
      success: true,
      data: {
        url: document.archivo?.url || document.fileUrl,
        titulo: document.titulo,
        institucion: institucion.nombre
      }
    });
  } catch (error) {
    console.error('Error al obtener términos y condiciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/documents/:id - Obtener documento específico
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const documento = await Document.findById(req.params.id)
      .populate('subidoPor', 'nombre email')
      .populate('institucion', 'nombre');

    if (!documento) {
      return res.status(404).json({
        success: false,
        message: 'Documento no encontrado'
      });
    }

    res.json({
      success: true,
      data: documento
    });
  } catch (error) {
    console.error('Error obteniendo documento:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// POST /api/documents - Subir nuevo documento
router.post('/', authenticateToken, requireRole(['adminaccount']), upload.single('archivo'), async (req, res) => {
  try {
    const { titulo, descripcion, tipo, institucionId, version, fechaVigencia, categoria, prioridad } = req.body;
    const archivo = req.file;

    if (!archivo) {
      return res.status(400).json({
        success: false,
        message: 'Archivo requerido'
      });
    }

    // Verificar que la institución existe
    const institucion = await Account.findById(institucionId);
    if (!institucion) {
      return res.status(404).json({
        success: false,
        message: 'Institución no encontrada'
      });
    }

    // Subir archivo a S3
    const s3Result = await uploadToS3(archivo, 'documents');
    
    // Crear documento en la base de datos
    const documento = new Document({
      titulo,
      descripcion,
      tipo,
      archivo: {
        nombre: archivo.originalname,
        url: s3Result.Location,
        key: s3Result.Key,
        tamaño: archivo.size,
        tipoMime: archivo.mimetype
      },
      institucion: institucionId,
      subidoPor: req.user._id,
      version,
      fechaVigencia: fechaVigencia ? new Date(fechaVigencia) : undefined,
      metadatos: {
        categoria,
        prioridad: prioridad || 'media'
      }
    });

    await documento.save();

    // Eliminar archivo temporal
    fs.unlinkSync(archivo.path);

    res.status(201).json({
      success: true,
      message: 'Documento subido exitosamente',
      data: documento
    });
  } catch (error) {
    console.error('Error subiendo documento:', error);
    
    // Limpiar archivo temporal si existe
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// PUT /api/documents/:id - Actualizar documento
router.put('/:id', authenticateToken, requireRole(['adminaccount']), async (req, res) => {
  try {
    const { titulo, descripcion, tipo, version, fechaVigencia, categoria, prioridad, activo } = req.body;
    
    const documento = await Document.findById(req.params.id);
    if (!documento) {
      return res.status(404).json({
        success: false,
        message: 'Documento no encontrado'
      });
    }

    // Actualizar campos
    if (titulo) documento.titulo = titulo;
    if (descripcion) documento.descripcion = descripcion;
    if (tipo) documento.tipo = tipo;
    if (version) documento.version = version;
    if (fechaVigencia) documento.fechaVigencia = new Date(fechaVigencia);
    if (categoria) documento.metadatos.categoria = categoria;
    if (prioridad) documento.metadatos.prioridad = prioridad;
    if (activo !== undefined) documento.activo = activo;

    await documento.save();

    res.json({
      success: true,
      message: 'Documento actualizado exitosamente',
      data: documento
    });
  } catch (error) {
    console.error('Error actualizando documento:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// DELETE /api/documents/:id - Eliminar documento
router.delete('/:id', authenticateToken, requireRole(['adminaccount']), async (req, res) => {
  try {
    const documento = await Document.findById(req.params.id);
    if (!documento) {
      return res.status(404).json({
        success: false,
        message: 'Documento no encontrado'
      });
    }

    // Eliminar archivo de S3
    await deleteFromS3(documento.archivo.key);

    // Eliminar documento de la base de datos
    await Document.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Documento eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error eliminando documento:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

router.get('/types', (req, res) => {
  const tipos = [
    { value: 'terminos_condiciones', label: 'Términos y Condiciones' },
    { value: 'reglamento', label: 'Reglamento' },
    { value: 'manual', label: 'Manual' },
    { value: 'politica', label: 'Política' },
    { value: 'otro', label: 'Otro' }
  ];

  res.json({
    success: true,
    data: tipos
  });
});

module.exports = router;
