const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

// Importar configuración
require('dotenv').config();
const config = require('./config/database');
const { generateSignedUrl } = require('./config/s3.config');

// Importar modelos
const User = require('./shared/models/User');
const Account = require('./shared/models/Account');
const Group = require('./shared/models/Group');
const Event = require('./shared/models/Event');
const EventAuthorization = require('./shared/models/EventAuthorization');
const Role = require('./shared/models/Role');
const Shared = require('./shared/models/Shared');
const Grupo = require('./shared/models/Grupo');
const Asistencia = require('./shared/models/Asistencia');
const Activity = require('./shared/models/Activity');
const ActivityFavorite = require('./shared/models/ActivityFavorite');
const AccountConfig = require('./shared/models/AccountConfig');
const Student = require('./shared/models/Student');
const Notification = require('./shared/models/Notification');
const Device = require('./shared/models/Device');
const Pickup = require('./shared/models/Pickup');
const RequestedShared = require('./shared/models/RequestedShared');
const PasswordReset = require('./shared/models/PasswordReset');
const ActiveAssociation = require('./shared/models/ActiveAssociation');
const StudentAction = require('./shared/models/StudentAction');
const StudentActionLog = require('./shared/models/StudentActionLog');
const FormRequest = require('./shared/models/FormRequest');
const FormResponse = require('./shared/models/FormResponse');
const FormDivisionAssociation = require('./shared/models/FormDivisionAssociation');

// Importar servicios
const RefreshTokenService = require('./services/refreshTokenService');
const TwoFactorAuthService = require('./services/twoFactorAuthService');
const LoginMonitorService = require('./services/loginMonitorService');
const PasswordExpirationService = require('./services/passwordExpirationService');
const { generateRandomPassword } = require('./config/email.config');
const { sendInstitutionWelcomeEmailToQueue, sendNewUserCreatedEmailToQueue, sendNotificationEmailToQueue, sendFamilyInvitationNotificationEmailToQueue, sendFamilyInvitationEmailToQueue } = require('./services/sqsEmailService');
const { sendPushToStudentFamilyToQueue } = require('./services/sqsPushService');
const emailService = require('./services/emailService');
const formRequestService = require('./services/formRequestService');

// Importar middleware de autenticación REAL con Cognito
const { authenticateToken, requireRole, requireAdmin, requireSuperAdmin, setUserInstitution } = require('./middleware/mongoAuth');

// Rate limiting deshabilitado

// Middleware de institución simplificado (sin Cognito)
// const { verifyAccountAccess, getAccountFilter, getAccountFilterMultiple, verifyDivisionAccess } = require('./middleware/cognitoInstitution');

// NOTA: setUserInstitution está importado desde './middleware/mongoAuth' en la línea 55

// Función helper para obtener la asociación activa del usuario
async function getActiveAssociationForUser(userId) {
  try {
    const activeAssociation = await ActiveAssociation.getActiveAssociation(userId);
    
    if (!activeAssociation) {
      console.log(`⚠️ [ACTIVE ASSOCIATION] No hay asociación activa para usuario ${userId}`);
      return null;
    }

    // Populate los campos necesarios
    const populatedAssociation = await ActiveAssociation.findById(activeAssociation._id)
      .populate('account')
      .populate('role')
      .populate('division')
      .populate('student');

    return populatedAssociation;
  } catch (error) {
    console.error('❌ [ACTIVE ASSOCIATION] Error obteniendo asociación activa:', error);
    return null;
  }
}

// Función helper para crear asociaciones según el rol
async function createAssociationByRole(userId, accountId, roleName, divisionId = null, studentId = null, createdBy) {
  try {
    // Obtener el rol
    const role = await Role.findOne({ nombre: roleName });
    if (!role) {
      throw new Error(`Rol '${roleName}' no encontrado`);
    }

    // Crear la asociación base
    const associationData = {
      user: userId,
      account: accountId,
      role: role._id,
      status: 'active',
      createdBy: createdBy
    };

    // Agregar campos según el rol
    switch (roleName) {
      case 'adminaccount':
        // Admin: solo institución
        break;
      
      case 'coordinador':
        // Coordinador: institución + grupo
        if (divisionId) {
          associationData.division = divisionId;
        }
        break;
      
      case 'familyadmin':
        // FamilyAdmin: institución + grupo + alumno
        if (divisionId) {
          associationData.division = divisionId;
        }
        if (studentId) {
          associationData.student = studentId;
        }
        break;
      
      default:
        // Para otros roles, incluir grupo si se proporciona
        if (divisionId) {
          associationData.division = divisionId;
        }
        if (studentId) {
          associationData.student = studentId;
        }
    }

    const association = new Shared(associationData);
    await association.save();
    
    console.log(`✅ Asociación creada para rol '${roleName}':`, {
      user: userId,
      account: accountId,
      division: divisionId || 'no aplica',
      student: studentId || 'no aplica'
    });

    // Verificar si el usuario ya tiene una asociación activa
    const existingActiveAssociation = await ActiveAssociation.getActiveAssociation(userId);
    
    if (!existingActiveAssociation) {
      // Si no tiene asociación activa, establecer esta como activa automáticamente
      try {
        await ActiveAssociation.setActiveAssociation(userId, association._id);
        console.log(`🎯 [AUTO-ACTIVE] Asociación automáticamente establecida como activa para usuario ${userId}`);
      } catch (error) {
        console.error('❌ [AUTO-ACTIVE] Error estableciendo asociación activa automáticamente:', error);
        // No lanzar error, solo loggear - la asociación se creó correctamente
      }
    } else {
      console.log(`ℹ️ [AUTO-ACTIVE] Usuario ${userId} ya tiene una asociación activa, no se cambia automáticamente`);
    }

    return association;
  } catch (error) {
    console.error(`❌ Error creando asociación para rol '${roleName}':`, error);
    throw error;
  }
}

// Importar rutas de upload
const uploadRoutes = require('./routes/upload');

// Importar rutas de documentos
const documentRoutes = require('./routes/documents');
// Importar rutas de notificaciones
const notificationsRoutes = require('./routes/notifications.routes');
// Importar rutas de eventos
const eventsRoutes = require('./routes/events.routes');
// Importar rutas de actividades
const activitiesRoutes = require('./routes/activities.routes');
// Importar rutas de autenticación
const authRoutes = require('./routes/auth.routes');
// Importar rutas de estudiantes
const studentsRoutes = require('./routes/students.routes');
// Importar rutas de asistencias
const attendanceRoutes = require('./routes/attendance.routes');
// Importar rutas de asociaciones
const sharedRoutes = require('./routes/shared.routes');
// Importar rutas de formularios
const formRequestsRoutes = require('./routes/formRequests.routes');
// Importar rutas de pickup
const pickupRoutes = require('./routes/pickup.routes');
// Importar rutas de backoffice
const backofficeRoutes = require('./routes/backoffice.routes');
// Importar rutas de usuarios
const usersRoutes = require('./routes/users.routes');
// Importar rutas de grupos
const groupsRoutes = require('./routes/groups.routes');
// Importar rutas de cuentas
const accountsRoutes = require('./routes/accounts.routes');
// Importar rutas de student actions
const studentActionsRoutes = require('./routes/studentActions.routes');
// Importar rutas de push notifications
const pushRoutes = require('./routes/push.routes');
// Importar rutas de push notifications administrativas
const adminPushRoutes = require('./routes/adminPush.routes');

// Configurar multer para subida de archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
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

// Configuración de multer para imágenes y videos
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen o video'));
    }
  }
});

// Configuración de multer-s3 para subida directa a S3
const multerS3 = require('multer-s3');
const { s3 } = require('./config/s3.config');

const uploadToS3 = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET_NAME || 'kiki-bucket-app',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      const userId = req.user._id;
      const fileName = `avatars/${userId}/${Date.now()}-${file.originalname}`;
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

// Configuración de multer para archivos Excel
const uploadExcel = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: function (req, file, cb) {
    // Permitir archivos Excel
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || // .xlsx
        file.mimetype === 'application/vnd.ms-excel' || // .xls
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'));
    }
  }
});

const app = express();

// Middleware de seguridad mejorado
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Necesario para algunas integraciones
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Rate limiting deshabilitado

// Sanitización de inputs para prevenir NoSQL Injection
const { sanitizeInputs, validateObjectId } = require('./middleware/security');
app.use(sanitizeInputs);

// CORS - Configurado de forma más restrictiva
app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin en ciertos casos legítimos
    if (!origin) {
      // En desarrollo, permitir sin origin
      if (process.env.NODE_ENV === 'development') {
        return callback(null, true);
      }
      // En producción, permitir sin origin solo para:
      // - Health checks (AWS ELB, etc.)
      // - Preflight OPTIONS requests
      // - Requests internos del servidor
      // Nota: Esto es necesario porque algunas requests legítimas no tienen origin
      // (por ejemplo, health checks desde AWS ELB o requests de servidor a servidor)
      return callback(null, true);
    }
    
    // Permitir localhost solo en desarrollo
    if (process.env.NODE_ENV === 'development') {
      if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        return callback(null, true);
      }
    }
    
    // Lista estricta de orígenes permitidos en producción
    const allowedOrigins = [
      'https://backoffice.kiki.com.ar',
      process.env.FRONTEND_URL,
      process.env.MOBILE_APP_URL
    ].filter(Boolean);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // En producción, rechazar orígenes no permitidos
      if (process.env.NODE_ENV === 'production') {
        console.warn(`⚠️ [CORS] Origen no permitido: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      } else {
        // En desarrollo, permitir cualquier origen
        callback(null, true);
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400 // 24 horas
}));

// Rate limiting general
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // límite de 200 requests por IP por ventana
  message: {
    success: false,
    message: 'Demasiadas solicitudes, intenta de nuevo más tarde'
  }
});
app.use(limiter);

// Logging
app.use(morgan('combined'));

// Middleware personalizado para logging detallado
app.use((req, res, next) => {
  console.log(`\n🔍 [${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log(`📦 Body:`, JSON.stringify(req.body, null, 2));
  console.log(`🔑 Headers:`, {
    'authorization': req.headers.authorization ? 'Bearer ***' : 'No auth',
    'content-type': req.headers['content-type'],
    'user-agent': req.headers['user-agent'],
    'origin': req.headers['origin'] || 'No origin'
  });
  console.log(`📋 Query:`, req.query);
  console.log(`🆔 Params:`, req.params);
  console.log(`---`);
  next();
});

// Body parsing
// IMPORTANTE: express.json() debe estar ANTES de las rutas de upload
// para que multer pueda procesar multipart/form-data correctamente
// express.json() solo parsea requests con Content-Type: application/json
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Endpoint de prueba para acciones (antes del middleware de redirección)
app.get('/api/test-actions', (req, res) => {
  console.log('🎯 [TEST] Endpoint de prueba llamado');
  res.json({
    success: true,
    message: 'Endpoint de prueba funcionando',
    data: []
  });
});

app.post('/api/test-actions', (req, res) => {
  console.log('🎯 [TEST POST] Endpoint de prueba POST llamado');
  res.json({
    success: true,
    message: 'Endpoint de prueba POST funcionando',
    data: []
  });
});

// Endpoint de prueba simple
app.get('/test-simple', (req, res) => {
  console.log('🎯 [SIMPLE TEST] Endpoint simple llamado');
  res.json({
    success: true,
    message: 'Endpoint simple funcionando'
  });
});

// Endpoint temporal para listar divisiones
app.get('/api/debug/divisions', async (req, res) => {
  try {
    const divisions = await Group.find({}).select('_id nombre account').lean();
    console.log('🔍 [DEBUG] Divisiones encontradas:', divisions.length);
    res.json({
      success: true,
      message: 'Divisiones encontradas',
      data: divisions
    });
  } catch (error) {
    console.error('❌ [DEBUG] Error al obtener divisiones:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener divisiones'
    });
  }
});

// Endpoint temporal para verificar una división específica
app.get('/api/debug/division/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔍 [DEBUG] Buscando división:', id);
    const division = await Group.findById(id).lean();
    console.log('🔍 [DEBUG] División encontrada:', division);
    res.json({
      success: true,
      message: 'División encontrada',
      data: division
    });
  } catch (error) {
    console.error('❌ [DEBUG] Error al obtener división:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener división'
    });
  }
});

// Endpoint temporal para probar student-actions sin autenticación
app.get('/api/debug/student-actions/division/:divisionId', async (req, res) => {
  try {
    const { divisionId } = req.params;
    console.log('🔍 [DEBUG] Obteniendo acciones para división:', divisionId);
    
    const actions = await StudentAction.find({ division: divisionId }).lean();
    console.log('🔍 [DEBUG] Acciones encontradas:', actions.length);
    
    res.json({
      success: true,
      message: 'Acciones encontradas',
      data: actions
    });
  } catch (error) {
    console.error('❌ [DEBUG] Error al obtener acciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener acciones'
    });
  }
});

// Endpoint temporal para probar student-actions sin autenticación (sin prefijo /api)
app.get('/debug/student-actions/division/:divisionId', async (req, res) => {
  try {
    const { divisionId } = req.params;
    console.log('🔍 [DEBUG] Obteniendo acciones para división:', divisionId);
    
    const actions = await StudentAction.find({ division: divisionId }).lean();
    console.log('🔍 [DEBUG] Acciones encontradas:', actions.length);
    
    res.json({
      success: true,
      message: 'Acciones encontradas',
      data: actions
    });
  } catch (error) {
    console.error('❌ [DEBUG] Error al obtener acciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener acciones'
    });
  }
});

// Endpoint temporal para actualizar acciones sin autenticación (sin prefijo /api)
app.put('/debug/student-actions/:actionId', async (req, res) => {
  console.log('🚀 [DEBUG] Route PUT /debug/student-actions/:actionId called');
  try {
    const { actionId } = req.params;
    const updateData = req.body;
    console.log('🔍 [DEBUG] Updating action:', actionId, updateData);

    // Simular actualización en modo debug
    const updatedAction = {
      _id: actionId,
      nombre: updateData.name || 'Updated Action',
      descripcion: updateData.description || 'Updated description',
      division: updateData.division || '68dc5fa9626391464e2bcbd6',
      color: updateData.color || '#0E5FCE',
      orden: updateData.order || 0,
      activo: updateData.active !== undefined ? updateData.active : true,
      categoria: updateData.categoria || 'otro',
      creadoPor: new mongoose.Types.ObjectId('68dc5f1a626391464e2bcb3a'),
      account: new mongoose.Types.ObjectId('68dc5f1a626391464e2bcb3a'),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log('✅ [DEBUG] Action updated (simulated):', updatedAction._id);

    res.json({
      success: true,
      message: 'Action updated successfully (debug mode)',
      data: updatedAction
    });
  } catch (error) {
    console.error('❌ [DEBUG] Error updating action:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Endpoint temporal para crear acciones sin autenticación (sin prefijo /api)
app.post('/debug/student-actions', async (req, res) => {
  console.log('🚀 [DEBUG] Route /debug/student-actions called');
  try {
    const { name, description, division, color, order, categoria } = req.body;
    console.log('🔍 [DEBUG] Creating action:', { name, description, division, color, order, categoria });

    // Crear un objeto simple para debug
    const debugAction = {
      _id: new mongoose.Types.ObjectId(),
      nombre: name || 'Default Action',
      descripcion: description || 'Default description',
      division: division,
      color: color || '#0E5FCE',
      orden: order || 0,
      activo: true,
      categoria: categoria || 'otro',
      creadoPor: new mongoose.Types.ObjectId('68dc5f1a626391464e2bcb3a'),
      account: new mongoose.Types.ObjectId('68dc5f1a626391464e2bcb3a'),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    console.log('🔍 [DEBUG] Debug action created:', debugAction._id);

    res.json({
      success: true,
      message: 'Action created successfully (debug mode)',
      data: debugAction
    });
  } catch (error) {
    console.error('❌ [DEBUG] Error creating action:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Endpoint temporal para crear acciones sin autenticación
app.post('/api/debug/student-actions', async (req, res) => {
  try {
    const { nombre, descripcion, division, color, orden } = req.body;
    console.log('🔍 [DEBUG] Creando acción:', { nombre, descripcion, division, color, orden });
    
    // Verificar que la división existe
    const divisionExists = await Group.findById(division);
    if (!divisionExists) {
      console.log('❌ [DEBUG] División no encontrada:', division);
      return res.status(404).json({
        success: false,
        message: 'La división especificada no existe'
      });
    }
    
    // Crear la acción
    const nuevaAccion = new StudentAction({
      nombre,
      descripcion,
      division,
      account: divisionExists.account,
      color: color || '#3B82F6',
      orden: orden || 0,
      creadoPor: new mongoose.Types.ObjectId() // ID temporal
    });
    
    await nuevaAccion.save();
    console.log('✅ [DEBUG] Acción creada:', nuevaAccion._id);
    
    res.status(201).json({
      success: true,
      message: 'Acción creada exitosamente',
      data: nuevaAccion
    });
  } catch (error) {
    console.error('❌ [DEBUG] Error al crear acción:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear la acción'
    });
  }
});

// Endpoint temporal para actualizar acciones sin autenticación
app.put('/api/debug/student-actions/:actionId', async (req, res) => {
  try {
    const { actionId } = req.params;
    const updateData = req.body;
    console.log('🔍 [DEBUG] Actualizando acción:', actionId, updateData);
    
    const action = await StudentAction.findByIdAndUpdate(
      actionId,
      updateData,
      { new: true }
    );
    
    if (!action) {
      return res.status(404).json({
        success: false,
        message: 'Acción no encontrada'
      });
    }
    
    console.log('✅ [DEBUG] Acción actualizada:', action._id);
    
    res.json({
      success: true,
      message: 'Acción actualizada exitosamente',
      data: action
    });
  } catch (error) {
    console.error('❌ [DEBUG] Error al actualizar acción:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar la acción'
    });
  }
});

// Endpoint temporal para eliminar acciones sin autenticación
app.delete('/api/debug/student-actions/:actionId', async (req, res) => {
  try {
    const { actionId } = req.params;
    console.log('🔍 [DEBUG] Eliminando acción:', actionId);
    
    const action = await StudentAction.findByIdAndDelete(actionId);
    
    if (!action) {
      return res.status(404).json({
        success: false,
        message: 'Acción no encontrada'
      });
    }
    
    console.log('✅ [DEBUG] Acción eliminada:', actionId);
    
    res.json({
      success: true,
      message: 'Acción eliminada exitosamente'
    });
  } catch (error) {
    console.error('❌ [DEBUG] Error al eliminar acción:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar la acción'
    });
  }
});

// Endpoint temporal para eliminar acciones sin autenticación (sin prefijo /api)
app.delete('/debug/student-actions/:actionId', async (req, res) => {
  try {
    const { actionId } = req.params;
    console.log('🔍 [DEBUG] Eliminando acción:', actionId);
    
    const action = await StudentAction.findByIdAndDelete(actionId);
    
    if (!action) {
      return res.status(404).json({
        success: false,
        message: 'Acción no encontrada'
      });
    }
    
    console.log('✅ [DEBUG] Acción eliminada:', actionId);
    
    res.json({
      success: true,
      message: 'Acción eliminada exitosamente'
    });
  } catch (error) {
    console.error('❌ [DEBUG] Error al eliminar acción:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar la acción'
    });
  }
});

// Middleware para redirigir rutas con /api duplicado
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') && 
      !req.path.startsWith('/api/student-actions') &&
      !req.path.startsWith('/api/test-actions') &&
      !req.path.startsWith('/api/debug') &&
      !req.path.startsWith('/api/documents') &&
      !req.path.startsWith('/api/events/export') &&
      !req.path.startsWith('/api/form-requests') &&
      !req.path.startsWith('/api/admin/push-notifications') &&
      !req.path.match(/^\/api\/accounts\/[^\/]+\/(config|admin-users)$/)) {
    // Remover el /api duplicado del inicio, excepto para student-actions, test-actions, debug, documents, events/export, form-requests, admin/push-notifications, accounts config y accounts admin-users
    // Las rutas de upload se redirigen de /api/upload a /upload
    const newPath = req.path.replace(/^\/api/, '');
    console.log(`🔄 [REDIRECT] Redirigiendo ${req.method} ${req.path} -> ${newPath}`);
    req.url = newPath;
    req.path = newPath;
  }
  next();
});

// Servir archivos estáticos
app.use('/uploads', express.static('uploads'));

// NOTA IMPORTANTE: Las rutas de pickup y form-requests están definidas más abajo en el archivo
// (líneas 9175+ para pickup, 11655+ para form-requests) y se registran cuando se ejecuta el código.
// En Express, las rutas se procesan en el orden en que se registran, así que estas rutas
// se registran DESPUÉS de las rutas modulares, lo cual está bien porque no hay conflictos de rutas.

// Registrar rutas modulares
console.log('🔍 Registrando rutas de notificaciones...');
app.use('/', notificationsRoutes);
console.log('✅ Rutas de notificaciones registradas');

console.log('🔍 Registrando rutas de eventos...');
app.use('/', eventsRoutes);
console.log('✅ Rutas de eventos registradas');

console.log('🔍 Registrando rutas de actividades...');
app.use('/', activitiesRoutes);
console.log('✅ Rutas de actividades registradas');

console.log('🔍 Registrando rutas de autenticación...');
app.use('/', authRoutes);
console.log('✅ Rutas de autenticación registradas');

console.log('🔍 Registrando rutas de estudiantes...');
app.use('/', studentsRoutes);
console.log('✅ Rutas de estudiantes registradas');

console.log('🔍 Registrando rutas de asistencias...');
app.use('/', attendanceRoutes);
console.log('✅ Rutas de asistencias registradas');

console.log('🔍 Registrando rutas de asociaciones...');
app.use('/', sharedRoutes);
console.log('✅ Rutas de asociaciones registradas');

console.log('🔍 Registrando rutas de pickup...');
app.use('/', pickupRoutes);
console.log('✅ Rutas de pickup registradas');

console.log('🔍 Registrando rutas de backoffice...');
app.use('/', backofficeRoutes);
console.log('✅ Rutas de backoffice registradas');

console.log('🔍 Registrando rutas de documentos...');
app.use('/api/documents', documentRoutes);
console.log('✅ Rutas de documentos registradas');

console.log('🔍 Registrando rutas de formularios...');
app.use('/', formRequestsRoutes);
console.log('✅ Rutas de formularios registradas');

console.log('🔍 Registrando rutas de usuarios...');
app.use('/', usersRoutes);
console.log('✅ Rutas de usuarios registradas');

console.log('🔍 Registrando rutas de grupos...');
app.use('/', groupsRoutes);
console.log('✅ Rutas de grupos registradas');

console.log('🔍 Registrando rutas de upload...');
app.use('/upload', uploadRoutes);
console.log('✅ Rutas de upload registradas');

console.log('🔍 Registrando rutas de cuentas...');
app.use('/', accountsRoutes);
console.log('✅ Rutas de cuentas registradas');

console.log('🔍 Registrando rutas de student actions...');
app.use('/', studentActionsRoutes);
console.log('✅ Rutas de student actions registradas');
console.log('🔍 Registrando rutas de push notifications...');
app.use('/push', pushRoutes);
console.log('✅ Rutas de push notifications registradas');
console.log('🔍 Registrando rutas de push notifications administrativas...');
try {
  console.log('📋 [DEBUG] adminPushRoutes stack antes de registrar:', adminPushRoutes.stack?.length || 'N/A');
  app.use('/api/admin/push-notifications', adminPushRoutes);
  console.log('✅ Rutas de push notifications administrativas registradas');
  console.log('📋 [DEBUG] Rutas disponibles en adminPushRoutes:', adminPushRoutes.stack?.length || 'N/A');
  // Log de las rutas registradas
  if (adminPushRoutes.stack) {
    adminPushRoutes.stack.forEach((layer, index) => {
      if (layer.route) {
        console.log(`   ${index + 1}. ${Object.keys(layer.route.methods).join(', ').toUpperCase()} ${layer.route.path}`);
      }
    });
  }
} catch (error) {
  console.error('❌ Error registrando rutas de push notifications administrativas:', error);
  console.error(error.stack);
}
console.log('✅ Rutas de cuentas registradas');

// Conectar a MongoDB
console.log('🔗 MongoDB URI:', config.MONGODB_URI)
mongoose.connect(config.MONGODB_URI)
  .then(() => {
    console.log('✅ Conectado a MongoDB');
    console.log('📊 Base de datos:', mongoose.connection.name);
    console.log('📊 Estado de conexión:', mongoose.connection.readyState);
  })
  .catch(err => console.error('❌ Error conectando a MongoDB:', err));

// Middleware de autenticación
// Middleware de autenticación híbrido importado desde cognitoAuth.js

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API de Kiki está funcionando correctamente',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: ['users', 'accounts', 'groups', 'events', 'roles']
  });
});

// Health check en la raíz
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'API de Kiki está funcionando correctamente',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: ['users', 'accounts', 'groups', 'events', 'roles']
  });
});


// Documentación de la API
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'API de Kiki',
    version: '1.0.0',
    endpoints: {
      auth: {
        login: 'POST /api/users/login',
        register: 'POST /api/users/register',
        profile: 'GET /api/users/profile'
      },
      users: {
        list: 'GET /api/users',
        getById: 'GET /api/users/:id',
        update: 'PUT /api/users/:id',
        updateStatus: 'PUT /api/users/:id/status'
      },
      accounts: {
        list: 'GET /api/accounts',
        create: 'POST /api/accounts',
        getById: 'GET /api/accounts/:id',
        update: 'PUT /api/accounts/:id',
        delete: 'DELETE /api/accounts/:id',
        stats: 'GET /api/accounts/stats'
      },
      groups: {
        list: 'GET /api/groups',
        create: 'POST /api/groups',
        getById: 'GET /api/groups/:id',
        update: 'PUT /api/groups/:id',
        delete: 'DELETE /api/groups/:id',
        addUser: 'POST /api/groups/:id/users',
        removeUser: 'DELETE /api/groups/:id/users/:userId'
      },
      events: {
        list: 'GET /api/events',
        create: 'POST /api/events',
        getById: 'GET /api/events/:id',
        update: 'PUT /api/events/:id',
        delete: 'DELETE /api/events/:id',
        addParticipant: 'POST /api/events/:id/participants',
        removeParticipant: 'DELETE /api/events/:id/participants/:userId'
      },
      roles: {
        list: 'GET /api/roles',
        getById: 'GET /api/roles/:id',
        hierarchy: 'GET /api/roles/hierarchy'
      }
    }
  });
});

// ===== RUTAS DE AUTENTICACIÓN =====

// Endpoint de prueba para debuggear
app.post('/debug/test', async (req, res) => {
  try {
    console.log('🔍 [DEBUG] Endpoint de prueba funcionando');
    res.json({ success: true, message: 'Debug endpoint funcionando' });
  } catch (error) {
    console.error('❌ [DEBUG] Error en endpoint de prueba:', error);
    res.status(500).json({ success: false, message: 'Error en debug', error: error.message });
  }
});

// Endpoint de prueba para enviar TODOS los tipos de emails
app.post('/debug/test-all-emails', async (req, res) => {
  try {
    const { email } = req.body;
    const testEmail = email || 'jmluque72@gmail.com';
    
    console.log('📧 [TEST ALL EMAILS] Enviando todos los tipos de emails a:', testEmail);
    
    // Verificar configuración de email
    const hasGmailUser = !!process.env.GMAIL_USER;
    const hasGmailPassword = !!process.env.GMAIL_APP_PASSWORD;
    console.log('📧 [TEST ALL EMAILS] Configuración Gmail:', {
      hasGmailUser,
      hasGmailPassword,
      gmailUser: hasGmailUser ? process.env.GMAIL_USER : 'NO CONFIGURADO'
    });
    
    const { 
      sendPasswordResetEmailToQueue,
      sendWelcomeEmailToQueue,
      sendInstitutionWelcomeEmailToQueue,
      sendFamilyInvitationEmailToQueue,
      sendFamilyInvitationNotificationEmailToQueue,
      sendNotificationEmailToQueue,
      sendFamilyViewerCreatedEmailToQueue,
      sendNewUserCreatedEmailToQueue,
      sendInstitutionAssociationEmailToQueue
    } = require('./services/sqsEmailService');
    
    const results = [];
    const testUserData = {
      name: 'Usuario de Prueba',
      email: testEmail
    };
    
    // 1. Email de recuperación de contraseña
    try {
      const result = await sendPasswordResetEmailToQueue(testEmail, '123456', 'Usuario de Prueba');
      results.push({ type: 'sendPasswordResetEmail', status: result.success ? 'success' : 'error', error: result.error });
      console.log(result.success ? '✅ [TEST] Mensaje de recuperación de contraseña enviado a SQS' : '❌ [TEST] Error enviando a SQS');
    } catch (error) {
      results.push({ type: 'sendPasswordResetEmail', status: 'error', error: error.message });
      console.error('❌ [TEST] Error en sendPasswordResetEmail:', error.message);
    }
    
    // 2. Email de bienvenida de institución
    try {
      const result = await sendInstitutionWelcomeEmailToQueue(testEmail, 'Usuario Admin', 'Institución de Prueba', 'TestPass123!');
      results.push({ type: 'sendInstitutionWelcomeEmail', status: result.success ? 'success' : 'error', error: result.error });
      console.log(result.success ? '✅ [TEST] Mensaje de bienvenida de institución enviado a SQS' : '❌ [TEST] Error enviando a SQS');
    } catch (error) {
      results.push({ type: 'sendInstitutionWelcomeEmail', status: 'error', error: error.message });
      console.error('❌ [TEST] Error en sendInstitutionWelcomeEmail:', error.message);
    }
    
    // 3. Email de bienvenida general
    try {
      const result = await sendWelcomeEmailToQueue(testEmail, 'Usuario de Prueba');
      results.push({ type: 'sendWelcomeEmail', status: result.success ? 'success' : 'error', error: result.error });
      console.log(result.success ? '✅ [TEST] Mensaje de bienvenida general enviado a SQS' : '❌ [TEST] Error enviando a SQS');
    } catch (error) {
      results.push({ type: 'sendWelcomeEmail', status: 'error', error: error.message });
      console.error('❌ [TEST] Error en sendWelcomeEmail:', error.message);
    }
    
    // 4. Email de invitación familiar
    try {
      const result = await sendFamilyInvitationEmailToQueue(testEmail, 'Usuario Familiar', 'TestPass123!');
      results.push({ type: 'sendFamilyInvitationEmail', status: result.success ? 'success' : 'error', error: result.error });
      console.log(result.success ? '✅ [TEST] Mensaje de invitación familiar enviado a SQS' : '❌ [TEST] Error enviando a SQS');
    } catch (error) {
      results.push({ type: 'sendFamilyInvitationEmail', status: 'error', error: error.message });
      console.error('❌ [TEST] Error en sendFamilyInvitationEmail:', error.message);
    }
    
    // 5. Email de notificación de invitación familiar
    try {
      const result = await sendFamilyInvitationNotificationEmailToQueue(testEmail, 'Usuario Familiar', 'Juan Pérez');
      results.push({ type: 'sendFamilyInvitationNotificationEmail', status: result.success ? 'success' : 'error', error: result.error });
      console.log(result.success ? '✅ [TEST] Mensaje de notificación de invitación familiar enviado a SQS' : '❌ [TEST] Error enviando a SQS');
    } catch (error) {
      results.push({ type: 'sendFamilyInvitationNotificationEmail', status: 'error', error: error.message });
      console.error('❌ [TEST] Error en sendFamilyInvitationNotificationEmail:', error.message);
    }
    
    // 6. Email de notificación general
    try {
      const result = await sendNotificationEmailToQueue(testEmail, 'Notificación de Prueba', 'Este es un mensaje de prueba', 'Usuario de Prueba');
      results.push({ type: 'sendNotificationEmail', status: result.success ? 'success' : 'error', error: result.error });
      console.log(result.success ? '✅ [TEST] Mensaje de notificación general enviado a SQS' : '❌ [TEST] Error enviando a SQS');
    } catch (error) {
      results.push({ type: 'sendNotificationEmail', status: 'error', error: error.message });
      console.error('❌ [TEST] Error en sendNotificationEmail:', error.message);
    }
    
    // 7. Email de usuario familyviewer creado
    try {
      const result = await sendFamilyViewerCreatedEmailToQueue(testUserData, 'TestPass123!', 'Institución de Prueba');
      results.push({ type: 'sendFamilyViewerCreatedEmail', status: result.success ? 'success' : 'error', error: result.error });
      console.log(result.success ? '✅ [TEST] Mensaje de familyviewer creado enviado a SQS' : '❌ [TEST] Error enviando a SQS');
    } catch (error) {
      results.push({ type: 'sendFamilyViewerCreatedEmail', status: 'error', error: error.message });
      console.error('❌ [TEST] Error en sendFamilyViewerCreatedEmail:', error.message);
    }
    
    // 8. Email de nuevo usuario creado (coordinador)
    try {
      const result = await sendNewUserCreatedEmailToQueue(testUserData, 'TestPass123!', 'Institución de Prueba', 'coordinador');
      results.push({ type: 'sendNewUserCreatedEmail (coordinador)', status: result.success ? 'success' : 'error', error: result.error });
      console.log(result.success ? '✅ [TEST] Mensaje de nuevo usuario coordinador enviado a SQS' : '❌ [TEST] Error enviando a SQS');
    } catch (error) {
      results.push({ type: 'sendNewUserCreatedEmail (coordinador)', status: 'error', error: error.message });
      console.error('❌ [TEST] Error en sendNewUserCreatedEmail (coordinador):', error.message);
    }
    
    // 9. Email de nuevo usuario creado (adminaccount)
    try {
      const result = await sendNewUserCreatedEmailToQueue(testUserData, 'TestPass123!', 'Institución de Prueba', 'adminaccount');
      results.push({ type: 'sendNewUserCreatedEmail (adminaccount)', status: result.success ? 'success' : 'error', error: result.error });
      console.log(result.success ? '✅ [TEST] Mensaje de nuevo usuario adminaccount enviado a SQS' : '❌ [TEST] Error enviando a SQS');
    } catch (error) {
      results.push({ type: 'sendNewUserCreatedEmail (adminaccount)', status: 'error', error: error.message });
      console.error('❌ [TEST] Error en sendNewUserCreatedEmail (adminaccount):', error.message);
    }
    
    // 10. Email de asociación a institución
    try {
      const result = await sendInstitutionAssociationEmailToQueue(
        testUserData,
        'Institución de Prueba',
        'División de Prueba',
        'familyadmin',
        {
          nombre: 'Estudiante',
          apellido: 'de Prueba',
          dni: '12345678'
        }
      );
      results.push({ type: 'sendInstitutionAssociationEmail', status: result.success ? 'success' : 'error', error: result.error });
      console.log(result.success ? '✅ [TEST] Mensaje de asociación a institución enviado a SQS' : '❌ [TEST] Error enviando a SQS');
    } catch (error) {
      results.push({ type: 'sendInstitutionAssociationEmail', status: 'error', error: error.message });
      console.error('❌ [TEST] Error en sendInstitutionAssociationEmail:', error.message);
    }
    
    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    
    res.json({ 
      success: true, 
      message: `Enviados ${successCount} mensajes a cola SQS exitosamente, ${errorCount} con errores a ${testEmail}. Los emails serán procesados por el worker.`,
      results: results,
      summary: {
        total: results.length,
        success: successCount,
        errors: errorCount
      }
    });
  } catch (error) {
    console.error('❌ [TEST ALL EMAILS] Error general:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error enviando emails de prueba', 
      error: error.message 
    });
  }
});

// ===== RUTAS DE USUARIOS/AUTH =====
// NOTA: Las rutas de usuarios y autenticación han sido movidas a routes/users.routes.js y controllers/users.controller.js
// Las rutas están registradas arriba con: app.use('/', usersRoutes);
// Rutas movidas:
// - POST /users/login -> usersController.login
// - POST /auth/refresh -> usersController.refreshToken
// - POST /auth/revoke -> usersController.revokeToken
// - POST /auth/cognito-login -> usersController.cognitoLogin
// - GET /auth/verify -> usersController.verifyAuth
// - GET /auth/config -> usersController.getAuthConfig
// - GET /users/profile -> usersController.getProfile
// - PUT /users/profile -> usersController.updateProfile
// - PUT /users/avatar -> usersController.updateAvatar
// - GET /users -> usersController.getUsers
// - GET /api/users -> usersController.getUsers
// - POST /users/register-mobile -> usersController.registerMobile
// - PUT /users/approve-association/:associationId -> usersController.approveAssociation
// - PUT /users/reject-association/:associationId -> usersController.rejectAssociation
// - GET /users/pending-associations -> usersController.getPendingAssociations
// - POST /auth/2fa/setup -> usersController.setup2FA
// - POST /auth/2fa/verify -> usersController.verify2FA
// - GET /auth/2fa/status -> usersController.get2FAStatus

// Código eliminado - movido a controllers/users.controller.js
/*
app.post('/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');

    console.log('🔍 Login attempt:', email);

    if (!email || !password) {
      // Registrar intento fallido
      await LoginMonitorService.logLoginAttempt({
        email: email || 'unknown',
        ipAddress: ipAddress,
        userAgent: userAgent,
        success: false,
        failureReason: 'missing_credentials',
        deviceInfo: LoginMonitorService.parseUserAgent(userAgent),
        location: await LoginMonitorService.getLocationInfo(ipAddress)
      });

      return res.status(400).json({
        success: false,
        message: 'Email y contraseña son requeridos'
      });
    }

    // Verificar si la IP está bloqueada
    const isIPBlocked = await LoginMonitorService.isIPBlocked(ipAddress);
    if (isIPBlocked) {
      console.log('🚫 IP bloqueada:', ipAddress);
      return res.status(403).json({
        success: false,
        message: 'Acceso bloqueado temporalmente. Intenta más tarde.'
      });
    }

    // Buscar usuario en la base de datos
    const user = await User.findOne({ email }).populate('role').select('+password');
    
    if (!user) {
      console.log('❌ Usuario no encontrado:', email);
      
      // Registrar intento fallido
      await LoginMonitorService.logLoginAttempt({
        email: email,
        ipAddress: ipAddress,
        userAgent: userAgent,
        success: false,
        failureReason: 'user_not_found',
        deviceInfo: LoginMonitorService.parseUserAgent(userAgent),
        location: await LoginMonitorService.getLocationInfo(ipAddress)
      });

      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    console.log('✅ Usuario encontrado:', user.email);
    console.log('📊 Status:', user.status);
    console.log('🎭 Rol:', user.role?.nombre);
    console.log('🔑 isFirstLogin:', user.isFirstLogin);

    // Verificar si el usuario está activo
    if (user.status !== 'approved') {
      // Registrar intento fallido
      await LoginMonitorService.logLoginAttempt({
        email: email,
        ipAddress: ipAddress,
        userAgent: userAgent,
        success: false,
        failureReason: 'user_not_approved',
        deviceInfo: LoginMonitorService.parseUserAgent(userAgent),
        location: await LoginMonitorService.getLocationInfo(ipAddress)
      });

      return res.status(401).json({
        success: false,
        message: 'Usuario no aprobado o inactivo'
      });
    }

    // Verificar contraseña
    // Usar comparePassword que soporta PEPPER y migración automática
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      console.log('❌ Contraseña inválida para:', email);
      
      // Registrar intento fallido
      await LoginMonitorService.logLoginAttempt({
        email: email,
        ipAddress: ipAddress,
        userAgent: userAgent,
        success: false,
        failureReason: 'password_incorrect',
        deviceInfo: LoginMonitorService.parseUserAgent(userAgent),
        location: await LoginMonitorService.getLocationInfo(ipAddress)
      });

      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    console.log('✅ Contraseña válida para:', email);
    
    // Migrar contraseña a PEPPER si es necesario
    const envConfig = require('./config/env.config');
    if (envConfig.PEPPER && !user.passwordUsesPepper) {
      await user.migratePasswordToPepper(password);
    }

    // Generar URL firmada para el avatar del usuario
    let avatarUrl = null;
    if (user.avatar) {
      try {
        const { generateSignedUrl } = require('./config/s3.config');
        avatarUrl = await generateSignedUrl(user.avatar);
        console.log('🖼️ [LOGIN] Avatar URL generada:', avatarUrl);
      } catch (avatarError) {
        console.error('❌ [LOGIN] Error generando avatar URL:', avatarError);
        console.log('🖼️ [LOGIN] Usando avatar original');
      }
    }
    
    // Crear objeto usuario con avatar procesado
    const userObject = user.toObject();
    console.log('🔑 [LOGIN] isFirstLogin del usuario (raw):', userObject.isFirstLogin);
    console.log('🔑 [LOGIN] Tipo de isFirstLogin:', typeof userObject.isFirstLogin);
    console.log('🔑 [LOGIN] isFirstLogin === true:', userObject.isFirstLogin === true);
    
    const userWithProcessedAvatar = {
      ...userObject,
      avatar: avatarUrl || user.avatar,
      isFirstLogin: userObject.isFirstLogin !== undefined ? userObject.isFirstLogin : true // Asegurar que siempre esté presente
    };
    
    console.log('🔑 [LOGIN] userWithProcessedAvatar.isFirstLogin:', userWithProcessedAvatar.isFirstLogin);
    
    // Obtener asociaciones del usuario
    const associations = await Shared.find({ user: user._id, status: 'active' })
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('student', 'nombre apellido avatar')
      .populate('role', 'nombre')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    
    // Si es adminaccount, agregar las divisiones/grupos de su cuenta
    // Si el rol no está poblado, intentar poblar manualmente
    let roleName = user.role?.nombre;
    if (!roleName && user.role) {
      const Role = require('./shared/models/Role');
      const roleDoc = await Role.findById(user.role);
      roleName = roleDoc?.nombre;
    }
    
    if (roleName === 'adminaccount' && user.account) {
      console.log('✅ [LOGIN] Usuario tiene cuenta, buscando grupos...');
      const Group = require('./shared/models/Group');
      const accountGroups = await Group.find({ account: user.account, activo: true })
        .populate('creadoPor', 'name')
        .sort({ nombre: 1 });
      
      
      // Agregar las divisiones como asociaciones virtuales
      const virtualAssociations = accountGroups.map(group => ({
        _id: `group_${group._id}`,
        user: user._id,
        account: {
          _id: user.account,
          nombre: associations[0]?.account?.nombre || 'Cuenta'
        },
        division: {
          _id: group._id,
          nombre: group.nombre
        },
        student: null,
        role: {
          _id: user.role._id,
          nombre: user.role.nombre
        },
        status: 'active',
        createdBy: {
          _id: group.creadoPor._id,
          name: group.creadoPor.name
        },
        permissions: [],
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        isVirtual: true // Marcar como asociación virtual
      }));
      
      // Combinar asociaciones reales con virtuales
      associations.push(...virtualAssociations);
    }
    
    // Procesar avatares de estudiantes en las asociaciones
    console.log('🔍 [LOGIN] ===== PROCESANDO AVATARES DE ESTUDIANTES =====');
    console.log('🔍 [LOGIN] Total de asociaciones:', associations.length);
    
    const associationsWithProcessedAvatars = await Promise.all(associations.map(async (association, index) => {
      // Si es una asociación virtual (sin estudiante), retornar tal cual
      if (association.isVirtual || !association.student) {
        return association;
      }
      
      // Convertir a objeto plano para poder modificar propiedades
      const associationObj = association.toObject ? association.toObject() : association;
      
      if (associationObj.student && associationObj.student.avatar) {
        try {
          console.log(`🔍 [LOGIN] Procesando avatar ${index + 1}/${associations.length} - Estudiante:`, associationObj.student._id);
          console.log('🔍 [LOGIN] Avatar original:', associationObj.student.avatar);
          
          const originalAvatar = associationObj.student.avatar;
          let processedAvatar = originalAvatar;
          
          // Verificar si es una key de S3 o una URL local
          if (originalAvatar.startsWith('http')) {
            console.log('🔍 [LOGIN] Es una URL completa, usando tal como está');
            // Es una URL completa (puede ser local o S3), no hacer nada
          } else if (originalAvatar.includes('students/')) {
            // Es una key de S3 para estudiantes, generar URL firmada
            console.log('🔍 [LOGIN] Es una key de S3 para estudiantes, generando URL firmada');
            console.log('🔍 [LOGIN] Key original:', originalAvatar);
            
            try {
              const { generateSignedUrl } = require('./config/s3.config');
              console.log('🔍 [LOGIN] Función generateSignedUrl importada correctamente');
              
              const signedUrl = await generateSignedUrl(originalAvatar, 172800); // 2 días
              console.log('🔍 [LOGIN] URL firmada generada exitosamente:', signedUrl);
              console.log('🔍 [LOGIN] Tipo de URL firmada:', typeof signedUrl);
              console.log('🔍 [LOGIN] Longitud de URL firmada:', signedUrl ? signedUrl.length : 'null');
              
              processedAvatar = signedUrl || originalAvatar; // Fallback si signedUrl es null
              console.log('🔍 [LOGIN] Avatar procesado:', processedAvatar);
            } catch (s3Error) {
              console.error('❌ [LOGIN] Error generando URL firmada:', s3Error);
              console.error('❌ [LOGIN] Error details:', {
                message: s3Error.message,
                stack: s3Error.stack,
                name: s3Error.name
              });
              // Mantener la key original si falla
              console.log('🔍 [LOGIN] Manteniendo key original:', originalAvatar);
              processedAvatar = originalAvatar;
            }
          } else {
            // Es una key local, generar URL local
            const localUrl = `${req.protocol}://${req.get('host')}/uploads/${originalAvatar.split('/').pop()}`;
            console.log('🔍 [LOGIN] URL local generada:', localUrl);
            processedAvatar = localUrl;
          }
          
          // Asignar el avatar procesado
          associationObj.student.avatar = processedAvatar;
          console.log('✅ [LOGIN] Avatar procesado asignado:', associationObj.student.avatar);
        } catch (error) {
          console.error('❌ [LOGIN] Error procesando avatar del estudiante:', associationObj.student?._id, error);
          // Si falla, usar URL directa
          if (associationObj.student && associationObj.student.avatar) {
            const fallbackUrl = `${req.protocol}://${req.get('host')}/uploads/${associationObj.student.avatar.split('/').pop()}`;
            console.log('🔍 [LOGIN] Usando URL de fallback:', fallbackUrl);
            associationObj.student.avatar = fallbackUrl;
          }
        }
      } else {
        console.log('🔍 [LOGIN] Estudiante sin avatar:', associationObj.student?._id);
      }
      
      return associationObj;
    }));
    
    const activeAssociation = associationsWithProcessedAvatars.length > 0 ? associationsWithProcessedAvatars[0] : null;
    
    // Generar access token (5 minutos)
    const accessToken = jwt.sign(
      { 
        userId: user._id,
        email: user.email,
        role: user.role._id
      },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '5m' } // 5 minutos
    );
    
    // Generar refresh token (7 días)
    const deviceInfo = RefreshTokenService.getDeviceInfo(req);
    const refreshToken = await RefreshTokenService.generateRefreshToken(user._id, deviceInfo);
    
    console.log('🔑 [LOGIN] Access token generado (5m)');
    console.log('🔄 [LOGIN] Refresh token generado (7d)');
    
    // Registrar login exitoso
    await LoginMonitorService.logLoginAttempt({
      email: email,
      ipAddress: ipAddress,
      userAgent: userAgent,
      success: true,
      deviceInfo: LoginMonitorService.parseUserAgent(userAgent),
      location: await LoginMonitorService.getLocationInfo(ipAddress),
      metadata: {
        userId: user._id,
        role: user.role?.nombre,
        associationsCount: associationsWithProcessedAvatars.length
      }
    });
    
    return res.json({
      success: true,
      data: {
        user: userWithProcessedAvatar,
        accessToken: accessToken,
        refreshToken: refreshToken.token,
        activeAssociation: activeAssociation,
        associations: associationsWithProcessedAvatars,
        tokenExpiresIn: 5 * 60 // 5 minutos en segundos
      }
    });

  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para renovar access token usando refresh token
app.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    console.log('🔄 [REFRESH] Intentando renovar access token...');
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token es requerido'
      });
    }
    
    // Verificar y usar el refresh token
    const validRefreshToken = await RefreshTokenService.verifyAndUseRefreshToken(refreshToken);
    
    if (!validRefreshToken) {
      console.log('❌ [REFRESH] Refresh token inválido o expirado');
      return res.status(401).json({
        success: false,
        message: 'Refresh token inválido o expirado'
      });
    }
    
    // Generar nuevo access token
    const newAccessToken = await RefreshTokenService.generateNewAccessToken(validRefreshToken);
    
    console.log('✅ [REFRESH] Nuevo access token generado');
    
    return res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        tokenExpiresIn: 5 * 60 // 5 minutos en segundos
      }
    });
    
  } catch (error) {
    console.error('❌ [REFRESH] Error renovando token:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});
*/

// Endpoint para revocar refresh token (logout) - DUPLICADO, ya está en users.routes.js
// Código eliminado - movido a controllers/users.controller.js

// ===== RUTAS DE AUTENTICACIÓN =====
// NOTA: Las rutas de autenticación han sido movidas a routes/auth.routes.js
// Las rutas están registradas arriba con: app.use('/', authRoutes);
// Código eliminado - movido a controllers/users.controller.js

// ===== FIN DE RUTAS DE USUARIOS/AUTH =====
// Todo el código de usuarios/auth ha sido movido a controllers/users.controller.js y routes/users.routes.js

// ===== RUTAS DE GRUPOS (DIVISIONES) =====
// NOTA: Las rutas de grupos han sido movidas a routes/groups.routes.js y controllers/groups.controller.js
// Las rutas están registradas arriba con: app.use('/', groupsRoutes);
// Rutas movidas:
// - GET /grupos -> groupsController.listGroups
// - POST /grupos -> groupsController.createGroup
// - GET /grupos/mobile/:cuentaId -> groupsController.getGroupsByAccount
// - GET /grupos/:id -> groupsController.getGroupById
// - PUT /grupos/:id -> groupsController.updateGroup
// - DELETE /grupos/:id -> groupsController.deleteGroup
// - GET /groups/account/:accountId -> groupsController.getGroupsByAccountId

// Código eliminado - movido a controllers/groups.controller.js
// Rutas movidas:
// - GET /grupos -> groupsController.listGroups
// - POST /grupos -> groupsController.createGroup
// - GET /grupos/mobile/:cuentaId -> groupsController.getGroupsByAccount
// - GET /grupos/:id -> groupsController.getGroupById
// - PUT /grupos/:id -> groupsController.updateGroup
// - DELETE /grupos/:id -> groupsController.deleteGroup
// - GET /groups/account/:accountId -> groupsController.getGroupsByAccountId

// Código eliminado - movido a controllers/groups.controller.js

// ===== RUTAS DE GRUPOS (DIVISIONES) =====
// NOTA: Las rutas de grupos han sido movidas a routes/groups.routes.js y controllers/groups.controller.js
// Las rutas están registradas arriba con: app.use('/', groupsRoutes);
// Rutas movidas:
// - GET /grupos -> groupsController.listGroups
// - POST /grupos -> groupsController.createGroup
// - GET /grupos/mobile/:cuentaId -> groupsController.getGroupsByAccount
// - GET /grupos/:id -> groupsController.getGroupById
// - PUT /grupos/:id -> groupsController.updateGroup
// - DELETE /grupos/:id -> groupsController.deleteGroup
// - GET /groups/account/:accountId -> groupsController.getGroupsByAccountId

// Código eliminado - movido a controllers/groups.controller.js
/*

// Listar grupos con filtros por cuenta
app.get('/grupos', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const cuentaId = req.query.cuentaId;

    // Construir query de búsqueda
    const query = {};
    
    // Filtro por cuenta según el rol del usuario
    if (req.user.role.nombre === 'superadmin') {
      // Superadmin puede ver todos los grupos
      if (cuentaId) {
        query.cuenta = cuentaId;
      }
    } else if (req.user.role.nombre === 'adminaccount') {
      // Adminaccount solo puede ver grupos de sus cuentas
      console.log('🔍 Adminaccount buscando grupos...');
      console.log('👤 Usuario ID:', req.user._id);
      
      // Usar el middleware global para obtener la institución
      if (req.userInstitution) {
        console.log('🏢 Institución del usuario:', req.userInstitution.nombre, req.userInstitution._id);
        
        // Filtrar grupos que pertenecen a esta cuenta
        query.cuenta = req.userInstitution._id;
        console.log('👥 Filtrando grupos de la cuenta:', req.userInstitution._id);
      } else {
        console.log('⚠️ Usuario sin institución asignada');
        query.cuenta = null; // No mostrar grupos
      }
      
      console.log('🔍 Query final:', JSON.stringify(query, null, 2));
      
      if (cuentaId) {
        // Verificar que la cuenta solicitada pertenece al usuario
        if (!verifyAccountAccess(req, cuentaId)) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para ver grupos de esta cuenta'
          });
        }
        query.cuenta = cuentaId;
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver grupos'
      });
    }

    // Búsqueda por nombre
    if (search) {
      query.nombre = { $regex: search, $options: 'i' };
    }

    // Obtener datos reales de la base de datos
    console.log('🔍 Ejecutando query en Grupo...');
    console.log('📊 Query:', JSON.stringify(query, null, 2));
    
    const total = await Grupo.countDocuments(query);
    console.log('📊 Total grupos encontrados:', total);
    
    const grupos = await Grupo.find(query)
      .populate('cuenta', 'nombre razonSocial')
      .populate('creadoPor', 'name email')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        grupos: grupos.map(grupo => ({
          _id: grupo._id,
          nombre: grupo.nombre,
          descripcion: grupo.descripcion,
          cuenta: grupo.cuenta,
          activo: grupo.activo,
          creadoPor: grupo.creadoPor,
          createdAt: grupo.createdAt,
          updatedAt: grupo.updatedAt
        })),
        total,
        page,
        limit
      }
    });
  } catch (error) {
    console.error('Error listando grupos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Crear nuevo grupo
app.post('/grupos', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { nombre, descripcion, cuentaId } = req.body;

    // Validaciones básicas
    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: 'Nombre es requerido'
      });
    }

    let targetCuentaId = cuentaId;

    // Verificar permisos según rol
    if (req.user.role.nombre === 'superadmin') {
      // Superadmin puede crear grupos en cualquier cuenta
      if (!cuentaId) {
        return res.status(400).json({
          success: false,
          message: 'Cuenta es requerida para superadmin'
        });
      }
    } else if (req.user.role.nombre === 'adminaccount') {
      // Adminaccount solo puede crear grupos en su cuenta asociada
      const userAccount = await Shared.findOne({
        user: req.user._id,
        status: { $in: ['active', 'pending'] }
      }).populate('account');

      if (!userAccount) {
        return res.status(403).json({
          success: false,
          message: 'No tienes una cuenta asociada'
        });
      }

      // Si se especifica una cuentaId, debe ser la misma que la del admin
      if (cuentaId && cuentaId !== userAccount.account._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Solo puedes crear grupos en tu cuenta asociada'
        });
      }

      // Usar automáticamente la cuenta del admin
      targetCuentaId = userAccount.account._id;
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear grupos'
      });
    }

    // Verificar que la cuenta existe
    const cuenta = await Account.findById(targetCuentaId);
    if (!cuenta) {
      return res.status(400).json({
        success: false,
        message: 'La cuenta especificada no existe'
      });
    }

    // Crear el grupo
    const grupo = new Grupo({
      nombre,
      descripcion: descripcion || '',
      cuenta: targetCuentaId,
      activo: true,
      creadoPor: req.user._id
    });

    await grupo.save();

    // Populate para la respuesta
    await grupo.populate('cuenta', 'nombre razonSocial');
    await grupo.populate('creadoPor', 'name email');

    res.status(201).json({
      success: true,
      message: 'Grupo creado exitosamente',
      data: {
        grupo: {
          _id: grupo._id,
          nombre: grupo.nombre,
          descripcion: grupo.descripcion,
          cuenta: grupo.cuenta,
          activo: grupo.activo,
          creadoPor: grupo.creadoPor,
          createdAt: grupo.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Error creando grupo:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// Obtener divisiones por cuenta para registro mobile
app.get('/grupos/mobile/:cuentaId', async (req, res) => {
  try {
    const { cuentaId } = req.params;

    // Verificar que la cuenta existe y está activa
    const cuenta = await Account.findById(cuentaId);
    if (!cuenta || cuenta.activo === false) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada o inactiva'
      });
    }

    // Obtener divisiones activas de la cuenta
    const grupos = await Grupo.find({ 
      cuenta: cuentaId, 
      activo: true 
    })
    .select('nombre descripcion _id')
    .sort({ nombre: 1 });

    res.json({
      success: true,
      data: {
        grupos: grupos,
        total: grupos.length,
        cuenta: {
          _id: cuenta._id,
          nombre: cuenta.nombre,
          razonSocial: cuenta.razonSocial
        }
      }
    });
  } catch (error) {
    console.error('Error obteniendo divisiones para mobile:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Obtener grupo por ID
app.get('/grupos/:id', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const grupo = await Grupo.findById(req.params.id)
      .populate('cuenta', 'nombre razonSocial')
      .populate('creadoPor', 'name email');

    if (!grupo) {
      return res.status(404).json({
        success: false,
        message: 'Grupo no encontrado'
      });
    }

    // Verificar permisos
    if (req.user.role.nombre === 'superadmin') {
      // Superadmin puede ver cualquier grupo
    } else if (req.user.role.nombre === 'adminaccount') {
      // Adminaccount solo puede ver grupos de sus cuentas
      const userAccount = await Shared.findOne({
        user: req.user._id,
        account: grupo.cuenta._id,
        status: 'active'
      });

      if (!userAccount) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para ver este grupo'
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver grupos'
      });
    }

    res.json({
      success: true,
      data: {
        grupo: {
          _id: grupo._id,
          nombre: grupo.nombre,
          descripcion: grupo.descripcion,
          cuenta: grupo.cuenta,
          activo: grupo.activo,
          creadoPor: grupo.creadoPor,
          createdAt: grupo.createdAt,
          updatedAt: grupo.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('Error obteniendo grupo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Actualizar grupo
app.put('/grupos/:id', authenticateToken, setUserInstitution, validateObjectId('id'), async (req, res) => {
  try {
    const { nombre, descripcion, activo } = req.body;

    const grupo = await Grupo.findById(req.params.id)
      .populate('cuenta', 'nombre razonSocial');

    if (!grupo) {
      return res.status(404).json({
        success: false,
        message: 'Grupo no encontrado'
      });
    }

    // Verificar permisos
    if (req.user.role.nombre === 'superadmin') {
      // Superadmin puede editar cualquier grupo
    } else if (req.user.role.nombre === 'adminaccount') {
      // Adminaccount solo puede editar grupos de sus cuentas
      const userAccount = await Shared.findOne({
        user: req.user._id,
        account: grupo.cuenta._id,
        status: 'active'
      });

      if (!userAccount) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para editar este grupo'
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para editar grupos'
      });
    }

    // Actualizar campos
    if (nombre !== undefined) grupo.nombre = nombre;
    if (descripcion !== undefined) grupo.descripcion = descripcion;
    if (activo !== undefined) grupo.activo = activo;

    await grupo.save();

    // Populate para la respuesta
    await grupo.populate('creadoPor', 'name email');

    res.json({
      success: true,
      message: 'Grupo actualizado exitosamente',
      data: {
        grupo: {
          _id: grupo._id,
          nombre: grupo.nombre,
          descripcion: grupo.descripcion,
          cuenta: grupo.cuenta,
          activo: grupo.activo,
          creadoPor: grupo.creadoPor,
          createdAt: grupo.createdAt,
          updatedAt: grupo.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('Error actualizando grupo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Eliminar grupo
app.delete('/grupos/:id', authenticateToken, setUserInstitution, validateObjectId('id'), async (req, res) => {
  try {
    const grupo = await Grupo.findById(req.params.id)
      .populate('cuenta', 'nombre razonSocial');

    if (!grupo) {
      return res.status(404).json({
        success: false,
        message: 'Grupo no encontrado'
      });
    }

    // Verificar permisos
    if (req.user.role.nombre === 'superadmin') {
      // Superadmin puede eliminar cualquier grupo
    } else if (req.user.role.nombre === 'adminaccount') {
      // Adminaccount solo puede eliminar grupos de sus cuentas
      
      // Para usuarios de Cognito, verificar contra la cuenta directa
      if (req.user.isCognitoUser) {
        console.log('🔍 Usuario de Cognito, verificando cuenta directa');
        
        // Buscar el usuario completo en MongoDB para obtener su cuenta
        const dbUser = await User.findOne({ email: req.user.email })
          .populate('account', 'nombre razonSocial');
        
        if (!dbUser || !dbUser.account || dbUser.account._id.toString() !== grupo.cuenta._id.toString()) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para eliminar este grupo'
          });
        }
      } else {
        // Para usuarios legacy, verificar contra las asociaciones
        const userAccount = await Shared.findOne({
          user: req.user._id,
          account: grupo.cuenta._id,
          status: 'active'
        });

        if (!userAccount) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para eliminar este grupo'
          });
        }
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar grupos'
      });
    }

    await Grupo.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Grupo eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando grupo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});
*/

// ===== RUTAS DE CUENTAS =====

// Obtener cuentas para registro mobile (solo cuentas activas)
app.get('/accounts/mobile', async (req, res) => {
  try {
    const accounts = await Account.find({ activo: { $ne: false } })
      .select('nombre razonSocial _id')
      .sort({ nombre: 1 });

    res.json({
      success: true,
      data: {
        accounts: accounts,
        total: accounts.length
      }
    });
  } catch (error) {
    console.error('Error obteniendo cuentas para mobile:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});



// Listar cuentas
app.get('/accounts', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';

    // Construir query de búsqueda
    const query = {};
    if (search) {
      query.$or = [
        { nombre: { $regex: search, $options: 'i' } },
        { razonSocial: { $regex: search, $options: 'i' } }
      ];
    }

    // Filtrar según el rol del usuario
    const currentUser = req.user;
    console.log('🔍 Usuario actual:', currentUser.email, 'Rol:', currentUser.role?.nombre);

    // Verificar permisos según el rol
    if (currentUser.role?.nombre === 'superadmin') {
      console.log('👑 Superadmin: mostrando todas las cuentas');
    } else if (currentUser.role?.nombre === 'adminaccount') {
      console.log('👤 Adminaccount: mostrando solo sus cuentas');
      
      // Usar el middleware global para obtener la institución
      if (req.userInstitution) {
        console.log('🏢 Institución del usuario:', req.userInstitution.nombre, req.userInstitution._id);
        
        // Filtrar por la cuenta del usuario
        query._id = req.userInstitution._id;
        console.log('👥 Filtrando cuenta del usuario:', req.userInstitution._id);
      } else {
        console.log('⚠️ Usuario sin institución asignada');
        return res.json({
          success: true,
          data: {
            accounts: [],
            total: 0,
            page,
            limit
          }
        });
      }
    } else {
      console.log('🚫 Usuario no autorizado para ver cuentas:', currentUser.role?.nombre);
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver cuentas'
      });
    }

    // Obtener datos reales de la base de datos
    const total = await Account.countDocuments(query);
    const accounts = await Account.find(query)
      .populate({
        path: 'usuarioAdministrador',
        select: 'name email status',
        populate: {
          path: 'role',
          select: 'nombre descripcion nivel'
        }
      })
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    // Generar URLs firmadas para los logos
    const accountsWithSignedUrls = accounts.map(account => {
      const accountObj = account.toObject();
      if (accountObj.logo) {
        accountObj.logoSignedUrl = generateSignedUrl(accountObj.logo, 172800); // 2 días
      }
      return accountObj;
    });

    res.json({
      success: true,
      data: {
        accounts: accountsWithSignedUrls,
        total,
        page,
        limit
      }
    });
  } catch (error) {
    console.error('Error listando cuentas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Crear cuenta
app.post('/accounts', authenticateToken, async (req, res) => {
  try {
    const { nombre, razonSocial, address, emailAdmin, nombreAdmin, logo } = req.body;

    if (!nombre || !razonSocial || !address || !emailAdmin || !nombreAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son requeridos'
      });
    }

    // Verificar si ya existe una cuenta con el mismo nombre
    const existingAccount = await Account.findOne({ nombre });
    if (existingAccount) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una cuenta con ese nombre'
      });
    }

    // Verificar si ya existe un usuario con el email del administrador
    const existingUser = await User.findOne({ email: emailAdmin });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un usuario con ese email de administrador'
      });
    }

    // Obtener el rol de administrador de cuenta
    const adminRole = await Role.findOne({ nombre: 'adminaccount' });
    if (!adminRole) {
      return res.status(500).json({
        success: false,
        message: 'Rol de administrador no encontrado'
      });
    }

    // Generar contraseña aleatoria segura
    const randomPassword = generateRandomPassword(12);
    console.log('🔑 [CREATE ACCOUNT] Contraseña generada para administrador:', randomPassword);

    // Crear usuario administrador primero
    const adminUser = new User({
      name: nombreAdmin,
      email: emailAdmin,
      password: randomPassword, // Contraseña aleatoria segura
      role: adminRole._id,
      status: 'approved'
    });

    await adminUser.save();

    // Crear nueva cuenta con el usuario administrador
    const account = new Account({
      nombre,
      razonSocial,
      address,
      emailAdmin,
      nombreAdmin,
      logo: logo || 'https://via.placeholder.com/150',
      activo: true,
      usuarioAdministrador: adminUser._id
    });

    await account.save();

    // Actualizar el usuario con la cuenta asignada
    adminUser.account = account._id;
    await adminUser.save();

    // Crear asociación del admin de la cuenta
    await createAssociationByRole(
      adminUser._id, 
      account._id, 
      'adminaccount', 
      null, 
      null, 
      req.user._id
    );

    // Enviar email de bienvenida con credenciales al administrador (asíncrono)
    await sendInstitutionWelcomeEmailToQueue(adminUser.email, adminUser.name, account.nombre, randomPassword);
    console.log('📧 [CREATE ACCOUNT] Email de bienvenida programado para envío asíncrono al administrador:', adminUser.email);

    // Populate el usuario administrador
    await account.populate('usuarioAdministrador');

    res.status(201).json({
      success: true,
      message: 'Cuenta creada exitosamente con usuario administrador',
      data: {
        account,
        adminUser: {
          _id: adminUser._id,
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role,
          status: adminUser.status
        }
      }
    });
  } catch (error) {
    console.error('Error creando cuenta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para crear usuario adminaccount adicional para una cuenta existente (solo superadmin)
// IMPORTANTE: Este endpoint debe estar antes de rutas más genéricas
app.post('/api/accounts/:accountId/admin-users', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 [CREATE ADMIN USER] Request recibida');
    console.log('🔍 [CREATE ADMIN USER] req.params:', req.params);
    console.log('🔍 [CREATE ADMIN USER] req.body:', req.body);
    console.log('🔍 [CREATE ADMIN USER] req.user:', req.user ? 'Presente' : 'No presente');
    
    const { accountId } = req.params;
    const { nombre, apellido, email } = req.body;
    
    if (!req.user) {
      console.log('❌ [CREATE ADMIN USER] req.user no está presente');
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }
    
    const userId = req.user.userId || req.user._id;
    
    if (!userId) {
      console.log('❌ [CREATE ADMIN USER] userId no encontrado en req.user');
      return res.status(401).json({
        success: false,
        message: 'ID de usuario no encontrado'
      });
    }

    console.log('👤 [CREATE ADMIN USER] Iniciando creación de usuario adminaccount...');
    console.log('👤 [CREATE ADMIN USER] Usuario solicitante ID:', userId);
    console.log('🏫 [CREATE ADMIN USER] Cuenta ID:', accountId);
    console.log('📋 [CREATE ADMIN USER] Datos recibidos:', { nombre, apellido, email });
    console.log('📋 [CREATE ADMIN USER] Tipo de datos:', { 
      nombre: typeof nombre, 
      apellido: typeof apellido, 
      email: typeof email 
    });

    // Verificar que el usuario sea superadmin
    const currentUser = await User.findById(userId).populate('role');
    console.log('👤 [CREATE ADMIN USER] Usuario encontrado:', currentUser ? 'Sí' : 'No');
    console.log('👤 [CREATE ADMIN USER] Rol del usuario:', currentUser?.role?.nombre);
    
    if (!currentUser || currentUser.role?.nombre !== 'superadmin') {
      console.log('❌ [CREATE ADMIN USER] Usuario no es superadmin o no existe');
      return res.status(403).json({
        success: false,
        message: 'Solo los superadministradores pueden crear usuarios adminaccount'
      });
    }

    // Validar campos requeridos
    console.log('✅ [CREATE ADMIN USER] Validando campos requeridos...');
    if (!nombre || !apellido || !email) {
      console.log('❌ [CREATE ADMIN USER] Campos faltantes:', {
        nombre: !nombre,
        apellido: !apellido,
        email: !email
      });
      return res.status(400).json({
        success: false,
        message: 'Nombre, apellido y email son requeridos'
      });
    }
    console.log('✅ [CREATE ADMIN USER] Campos validados correctamente');

    // Verificar que la cuenta existe
    console.log('✅ [CREATE ADMIN USER] Verificando que la cuenta existe...');
    const account = await Account.findById(accountId);
    if (!account) {
      console.log('❌ [CREATE ADMIN USER] Cuenta no encontrada:', accountId);
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada'
      });
    }
    console.log('✅ [CREATE ADMIN USER] Cuenta encontrada:', account.nombre);

    // Verificar si ya existe un usuario con ese email
    console.log('✅ [CREATE ADMIN USER] Verificando si el email ya existe...');
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.log('❌ [CREATE ADMIN USER] Email ya existe:', email);
      return res.status(400).json({
        success: false,
        message: 'Ya existe un usuario con ese email'
      });
    }
    console.log('✅ [CREATE ADMIN USER] Email disponible');

    // Obtener el rol de adminaccount
    const adminRole = await Role.findOne({ nombre: 'adminaccount' });
    if (!adminRole) {
      return res.status(500).json({
        success: false,
        message: 'Rol de adminaccount no encontrado'
      });
    }

    // Generar contraseña aleatoria segura
    const randomPassword = generateRandomPassword(12);
    console.log('🔑 [CREATE ADMIN USER] Contraseña generada:', randomPassword);

    // Crear el usuario adminaccount
    const adminUser = new User({
      name: `${nombre} ${apellido}`,
      email: email.toLowerCase(),
      password: randomPassword,
      role: adminRole._id,
      status: 'approved',
      account: accountId
    });

    await adminUser.save();
    console.log('✅ [CREATE ADMIN USER] Usuario adminaccount creado:', adminUser.email);

    // Crear asociación del admin con la cuenta
    await createAssociationByRole(
      adminUser._id,
      accountId,
      'adminaccount',
      null,
      null,
      userId
    );
    console.log('✅ [CREATE ADMIN USER] Asociación creada');

    // Enviar email de bienvenida (asíncrono)
    await sendNewUserCreatedEmailToQueue(
      {
        name: adminUser.name,
        email: adminUser.email
      },
      randomPassword,
      account.nombre,
      'adminaccount'
    );
    console.log('📧 [CREATE ADMIN USER] Email de bienvenida programado para envío asíncrono a:', adminUser.email);

    // Populate el rol del usuario
    await adminUser.populate('role', 'nombre descripcion');

    const responseData = {
      success: true,
      message: 'Usuario adminaccount creado exitosamente',
      data: {
        user: {
          _id: adminUser._id,
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role,
          status: adminUser.status,
          account: accountId
        },
        account: {
          _id: account._id,
          nombre: account.nombre
        }
      }
    };

    console.log('✅ [CREATE ADMIN USER] Respuesta exitosa:', JSON.stringify(responseData, null, 2));
    res.status(201).json(responseData);

  } catch (error) {
    console.error('❌ [CREATE ADMIN USER] Error completo:', error);
    console.error('❌ [CREATE ADMIN USER] Error stack:', error.stack);
    console.error('❌ [CREATE ADMIN USER] Error message:', error.message);
    
    // Si es un error de validación de Mongoose, devolver 400
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Error de validación: ' + Object.values(error.errors).map((e) => e.message).join(', ')
      });
    }
    
    // Si es un error de duplicado, devolver 400
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un registro con estos datos'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor: ' + error.message
    });
  }
});

// Endpoint para obtener estadísticas del dashboard (solo superadmin)
app.get('/dashboard/stats', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    console.log('🔍 [DASHBOARD STATS] Usuario autenticado:', req.user);
    
    // Para usuarios de Cognito, usar la información directamente del req.user
    if (req.user.isCognitoUser) {
      console.log('🔍 [DASHBOARD STATS] Usuario de Cognito detectado');
      console.log('🔍 [DASHBOARD STATS] Rol del usuario:', req.user.role?.nombre);
      
      if (req.user.role?.nombre !== 'superadmin' && req.user.role?.nombre !== 'adminaccount') {
        return res.status(403).json({
          success: false,
          message: 'Solo los superadministradores y administradores de cuenta pueden ver estadísticas del dashboard'
        });
      }
    } else {
      // Para usuarios de MongoDB (legacy)
      const userId = req.user.userId || req.user._id;
      const currentUser = await User.findById(userId).populate('role');
      if (!currentUser || (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount')) {
        return res.status(403).json({
          success: false,
          message: 'Solo los superadministradores y administradores de cuenta pueden ver estadísticas del dashboard'
        });
      }
    }

    console.log('📊 [DASHBOARD STATS] Obteniendo estadísticas para superadmin...');

    // Obtener estadísticas
    const [
      institucionesActivas,
      usuariosActivos,
      alumnosActivos,
      totalActividades
    ] = await Promise.all([
      // Instituciones activas
      Account.countDocuments({ activo: true }),
      
      // Usuarios activos (todos los usuarios aprobados)
      User.countDocuments({ status: 'approved' }),
      
      // Alumnos activos (usuarios con rol estudiante)
      User.countDocuments({ 
        status: 'approved',
        role: await Role.findOne({ nombre: 'estudiante' }).select('_id')
      }),
      
      // Total de actividades
      Activity.countDocuments({})
    ]);

    const stats = {
      institucionesActivas,
      usuariosActivos,
      alumnosActivos,
      totalActividades
    };

    console.log('📊 [DASHBOARD STATS] Estadísticas obtenidas:', stats);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ [DASHBOARD STATS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas del dashboard'
    });
  }
});

// Endpoint para obtener actividades recientes (solo superadmin)
app.get('/dashboard/recent-activities', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    console.log('🔍 [DASHBOARD ACTIVITIES] Usuario autenticado:', req.user);
    
    // Para usuarios de Cognito, usar la información directamente del req.user
    if (req.user.isCognitoUser) {
      console.log('🔍 [DASHBOARD ACTIVITIES] Usuario de Cognito detectado');
      console.log('🔍 [DASHBOARD ACTIVITIES] Rol del usuario:', req.user.role?.nombre);
      
      if (req.user.role?.nombre !== 'superadmin' && req.user.role?.nombre !== 'adminaccount') {
        return res.status(403).json({
          success: false,
          message: 'Solo los superadministradores y administradores de cuenta pueden ver actividades recientes'
        });
      }
    } else {
      // Para usuarios de MongoDB (legacy)
      const userId = req.user.userId || req.user._id;
      const currentUser = await User.findById(userId).populate('role');
      if (!currentUser || (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount')) {
        return res.status(403).json({
          success: false,
          message: 'Solo los superadministradores y administradores de cuenta pueden ver actividades recientes'
        });
      }
    }

    console.log('📋 [RECENT ACTIVITIES] Obteniendo últimas 20 actividades...');

    // Obtener las últimas 20 actividades con información de institución y división
    const activities = await Activity.find({})
      .populate({
        path: 'usuario',
        select: 'name email'
      })
      .populate({
        path: 'account',
        select: 'nombre'
      })
      .populate({
        path: 'division',
        select: 'nombre'
      })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('descripcion account division createdAt');

    const recentActivities = activities.map(activity => ({
      id: activity._id,
      descripcion: activity.descripcion,
      institucion: activity.account?.nombre || 'Sin institución',
      division: activity.division?.nombre || 'Sin división',
      fecha: activity.createdAt
    }));

    console.log('📋 [RECENT ACTIVITIES] Actividades obtenidas:', recentActivities.length);

    res.json({
      success: true,
      data: recentActivities
    });

  } catch (error) {
    console.error('❌ [RECENT ACTIVITIES] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener actividades recientes'
    });
  }
});

// ===== ENDPOINTS DE CONFIGURACIÓN DE CUENTA =====
// IMPORTANTE: Estos endpoints deben estar ANTES de /accounts/:id para evitar conflictos de rutas

// Obtener configuración de una cuenta
app.get('/api/accounts/:accountId/config', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    console.log('⚙️ [CONFIG] GET /api/accounts/:accountId/config llamado');
    const { accountId } = req.params;
    console.log('⚙️ [CONFIG] accountId recibido:', accountId);
    const currentUser = req.user;
    console.log('⚙️ [CONFIG] Usuario actual:', currentUser?.email, 'Rol:', currentUser?.role?.nombre);

    // Verificar permisos: solo superadmin o adminaccount de esa cuenta
    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin puede ver cualquier configuración
    } else if (currentUser.role?.nombre === 'adminaccount' && req.userInstitution) {
      // Adminaccount solo puede ver configuración de su cuenta
      if (accountId !== req.userInstitution._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para ver la configuración de esta cuenta'
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver la configuración'
      });
    }

    // Obtener o crear configuración por defecto
    console.log('⚙️ [CONFIG] Obteniendo configuración para accountId:', accountId);
    const config = await AccountConfig.getOrCreateConfig(accountId);
    console.log('⚙️ [CONFIG] Configuración obtenida:', {
      _id: config._id,
      account: config.account,
      requiereAprobarActividades: config.requiereAprobarActividades
    });

    res.json({
      success: true,
      data: {
        config: {
          _id: config._id,
          account: config.account,
          requiereAprobarActividades: config.requiereAprobarActividades,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Error obteniendo configuración de cuenta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Actualizar configuración de una cuenta
app.put('/api/accounts/:accountId/config', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { requiereAprobarActividades } = req.body;
    const currentUser = req.user;

    // Verificar permisos: solo superadmin o adminaccount de esa cuenta
    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin puede actualizar cualquier configuración
    } else if (currentUser.role?.nombre === 'adminaccount' && req.userInstitution) {
      // Adminaccount solo puede actualizar configuración de su cuenta
      if (accountId !== req.userInstitution._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para actualizar la configuración de esta cuenta'
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar la configuración'
      });
    }

    // Obtener o crear configuración
    let config = await AccountConfig.findOne({ account: accountId });
    
    if (!config) {
      config = new AccountConfig({
        account: accountId,
        requiereAprobarActividades: requiereAprobarActividades !== undefined ? requiereAprobarActividades : true
      });
    } else {
      if (requiereAprobarActividades !== undefined) {
        config.requiereAprobarActividades = requiereAprobarActividades;
      }
    }

    await config.save();

    console.log('⚙️ [CONFIG] Configuración actualizada:', {
      accountId,
      requiereAprobarActividades: config.requiereAprobarActividades
    });

    res.json({
      success: true,
      message: 'Configuración actualizada exitosamente',
      data: {
        config: {
          _id: config._id,
          account: config.account,
          requiereAprobarActividades: config.requiereAprobarActividades,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Error actualizando configuración de cuenta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Obtener cuenta por ID
app.get('/accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const account = await Account.findById(id).populate({
      path: 'usuarioAdministrador',
      select: 'name email status',
      populate: {
        path: 'role',
        select: 'nombre descripcion nivel'
      }
    });
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada'
      });
    }

    // Generar URL firmada para el logo
    const accountObj = account.toObject();
    if (accountObj.logo) {
      accountObj.logoSignedUrl = generateSignedUrl(accountObj.logo, 3600); // 1 hora
    }

    res.json({
      success: true,
      data: accountObj
    });
  } catch (error) {
    console.error('Error obteniendo cuenta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Actualizar cuenta
app.put('/accounts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, razonSocial, address, emailAdmin, nombreAdmin, logo, activo } = req.body;

    const account = await Account.findById(id);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada'
      });
    }

    // Verificar si el nombre ya existe en otra cuenta
    if (nombre && nombre !== account.nombre) {
      const existingAccount = await Account.findOne({ nombre, _id: { $ne: id } });
      if (existingAccount) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe una cuenta con ese nombre'
        });
      }
    }

    // Obtener el usuario administrador actual
    const adminUser = await User.findById(account.usuarioAdministrador);
    if (!adminUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario administrador no encontrado'
      });
    }

    // Actualizar campos de la cuenta
    if (nombre) account.nombre = nombre;
    if (razonSocial) account.razonSocial = razonSocial;
    if (address) account.address = address;
    if (logo) account.logo = logo;
    if (typeof activo === 'boolean') account.activo = activo;

    // Actualizar campos del usuario administrador
    if (emailAdmin && emailAdmin !== adminUser.email) {
      // Verificar que el nuevo email no esté en uso
      const existingUser = await User.findOne({ email: emailAdmin, _id: { $ne: adminUser._id } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe un usuario con ese email'
        });
      }
      adminUser.email = emailAdmin;
    }

    if (nombreAdmin && nombreAdmin !== adminUser.name) {
      adminUser.name = nombreAdmin;
    }

    // Guardar cambios
    account.updatedAt = new Date();
    await account.save();
    await adminUser.save();

    // Populate el usuario administrador
    await account.populate({
      path: 'usuarioAdministrador',
      select: 'name email status',
      populate: {
        path: 'role',
        select: 'nombre descripcion nivel'
      }
    });

    // Generar URL firmada para el logo
    const accountObj = account.toObject();
    if (accountObj.logo) {
      accountObj.logoSignedUrl = generateSignedUrl(accountObj.logo, 3600); // 1 hora
    }

    res.json({
      success: true,
      message: 'Cuenta actualizada exitosamente',
      data: accountObj
    });
  } catch (error) {
    console.error('Error actualizando cuenta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Eliminar cuenta
app.delete('/accounts/:id', authenticateToken, validateObjectId('id'), async (req, res) => {
  try {
    const { id } = req.params;

    const account = await Account.findById(id);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada'
      });
    }

    await Account.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Cuenta eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error eliminando cuenta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Estadísticas de cuentas
app.get('/accounts/stats', async (req, res) => {
  try {
    const total = await Account.countDocuments();
    const activas = await Account.countDocuments({ activo: true });
    const inactivas = await Account.countDocuments({ activo: false });

    res.json({
      success: true,
      data: {
        total,
        activas,
        inactivas,
        porcentajeActivas: total > 0 ? Math.round((activas / total) * 100) : 0
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ===== RUTAS DE IMÁGENES =====

// Renovar URL firmada de imagen
app.post('/images/refresh-signed-url', authenticateToken, async (req, res) => {
  try {
    const { imageKey } = req.body;
    
    if (!imageKey) {
      return res.status(400).json({
        success: false,
        message: 'imageKey es requerido'
      });
    }

    const signedUrl = generateSignedUrl(imageKey, 172800); // 2 días

    if (!signedUrl) {
      return res.status(500).json({
        success: false,
        message: 'Error generando URL firmada'
      });
    }

    res.json({
      success: true,
      data: {
        imageKey,
        signedUrl
      }
    });
  } catch (error) {
    console.error('Error renovando URL firmada:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ===== RUTAS DE GRUPOS =====

// Listar grupos
app.get('/groups', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const accountId = req.query.accountId;

    // Simular datos de grupos
    const groups = [
      {
        _id: '64f8a1b2c3d4e5f6a7b8c9d0',
        nombre: 'Grupo Ejemplo',
        descripcion: 'Descripción del grupo',
        account: accountId || '64f8a1b2c3d4e5f6a7b8c9d1',
        creadoPor: '64f8a1b2c3d4e5f6a7b8c9d2',
        usuarios: ['64f8a1b2c3d4e5f6a7b8c9d3'],
        permisos: ['leer', 'escribir'],
        activo: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    res.json({
      success: true,
      data: {
        groups,
        total: groups.length,
        page,
        limit
      }
    });
  } catch (error) {
    console.error('Error listando grupos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Obtener grupos por cuenta
app.get('/groups/account/:accountId', authenticateToken, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { userId } = req.user;
    const { activo } = req.query;

    // Verificar que el usuario tiene acceso a esta cuenta
    const user = await User.findById(userId).populate('role');
    const userAssociation = await Shared.findOne({
      user: userId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation && user.role?.nombre !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver grupos de esta cuenta'
      });
    }

    // Buscar grupos de la cuenta
    let query = { account: accountId };
    
    // Filtrar por estado activo si se especifica
    if (activo !== undefined) {
      query.activo = activo === 'true';
    }

    const grupos = await Group.find(query)
      .populate('creadoPor', 'name email')
      .sort({ createdAt: -1 });

    console.log(`📊 Encontrados ${grupos.length} grupos para la cuenta ${accountId}`);

    res.json({
      success: true,
      data: {
        grupos: grupos.map(grupo => ({
          _id: grupo._id,
          nombre: grupo.nombre,
          descripcion: grupo.descripcion,
          activo: grupo.activo,
          creadoPor: grupo.creadoPor ? {
            _id: grupo.creadoPor._id,
            name: grupo.creadoPor.name,
            email: grupo.creadoPor.email
          } : null,
          createdAt: grupo.createdAt,
          updatedAt: grupo.updatedAt
        }))
      }
    });

  } catch (error) {
    console.error('Error obteniendo grupos por cuenta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ===== RUTAS DE EVENTOS =====
// NOTA: Las rutas de eventos han sido movidas a routes/events.routes.js
// Las rutas están registradas arriba con: app.use('/', eventsRoutes);

// ===== RUTAS DE ROLES =====

// Listar roles
app.get('/roles', async (req, res) => {
  try {
    // Simular datos de roles
    const roles = [
      {
        _id: '64f8a1b2c3d4e5f6a7b8c9d1',
        nombre: 'superadmin',
        descripcion: 'Super administrador con acceso total al sistema',
        permisos: ['todos'],
        nivel: 1,
        activo: true,
        esRolSistema: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        _id: '64f8a1b2c3d4e5f6a7b8c9d2',
        nombre: 'adminaccount',
        descripcion: 'Administrador de cuenta con permisos completos dentro de su cuenta',
        permisos: ['usuarios', 'cuentas', 'grupos', 'eventos'],
        nivel: 2,
        activo: true,
        esRolSistema: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    
    res.json({
      success: true,
      data: roles
    });
  } catch (error) {
    console.error('Error listando roles:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Jerarquía de roles
app.get('/roles/hierarchy', async (req, res) => {
  try {
    const hierarchy = {
      1: 'superadmin',
      2: 'adminaccount',
      3: 'coordinador',
      4: 'familyadmin',
      5: 'familyviewer'
    };
    
    res.json({
      success: true,
      data: hierarchy
    });
  } catch (error) {
    console.error('Error obteniendo jerarquía:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ===== RUTAS DE ACCIONES DE ESTUDIANTES =====
// NOTA: Las rutas de student-actions han sido movidas a routes/studentActions.routes.js y controllers/studentActions.controller.js
// Las rutas están registradas arriba con: app.use('/', studentActionsRoutes);
// Rutas movidas:
// - GET /api/student-actions/test -> studentActionsController.test
// - GET /api/student-actions -> studentActionsController.listActions
// - GET /api/student-actions/division/:divisionId -> studentActionsController.getActionsByDivision
// - POST /api/student-actions -> studentActionsController.createAction
// - PUT /api/student-actions/:actionId -> studentActionsController.updateAction
// - DELETE /api/student-actions/:actionId -> studentActionsController.deleteAction
// - POST /api/student-actions/log -> studentActionsController.createLog
// - GET /api/student-actions/log/student/:studentId -> studentActionsController.getLogsByStudent
// - GET /api/student-actions/log/division/:divisionId -> studentActionsController.getLogsByDivision
// - GET /api/student-actions/log/account/:accountId -> studentActionsController.getLogsByAccount

// Código eliminado - movido a controllers/studentActions.controller.js
/*
app.get('/api/student-actions/test', async (req, res) => {
  console.log('🎯 [TEST] Endpoint de prueba llamado');
  try {
    res.json({
      success: true,
      message: 'Endpoint de acciones funcionando',
      data: []
    });
  } catch (error) {
    console.error('❌ [TEST] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Obtener todas las acciones configuradas (sin filtros)
app.get('/api/student-actions', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    // Verificar permisos del usuario
    let currentUser;
    if (req.user.isCognitoUser) {
      currentUser = await User.findOne({ email: req.user.email }).populate('role');
    } else {
      const { userId } = req.user;
      currentUser = await User.findById(userId).populate('role');
    }

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Construir query base
    const query = { activa: true };

    // Filtrar por rol
    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin puede ver todas las acciones
    } else if (currentUser.role?.nombre === 'adminaccount') {
      // Adminaccount solo puede ver acciones de sus divisiones
      if (req.userInstitution) {
        const userDivisions = await Grupo.find({ cuenta: req.userInstitution._id }).select('_id');
        const divisionIds = userDivisions.map(d => d._id);
        query.division = { $in: divisionIds };
      } else {
        return res.status(403).json({
          success: false,
          message: 'No tienes una institución asignada'
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver estas acciones'
      });
    }

    const acciones = await StudentAction.find(query)
      .populate('division', 'nombre descripcion')
      .populate('creadoPor', 'nombre email')
      .sort({ orden: 1, nombre: 1 });

    res.json({
      success: true,
      data: acciones
    });
  } catch (error) {
    console.error('Error obteniendo acciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// Obtener acciones configuradas por división
app.get('/api/student-actions/division/:divisionId', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { divisionId } = req.params;
    const currentUser = req.user;

    console.log('🎯 [STUDENT ACTIONS] Obteniendo acciones para división:', divisionId);

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver acciones de estudiantes'
      });
    }

    // Obtener acciones de la división
    const acciones = await StudentAction.find({ 
      division: divisionId, 
      activo: true 
    }).sort({ orden: 1, nombre: 1 });

    res.json({
      success: true,
      data: acciones
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTIONS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Crear nueva acción para una división
app.post('/api/student-actions', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { nombre, descripcion, division, color, orden } = req.body;
    const currentUser = req.user;

    console.log('🎯 [STUDENT ACTIONS CREATE] Datos recibidos:', { nombre, descripcion, division, color });
    console.log('🎯 [STUDENT ACTIONS CREATE] Usuario:', currentUser.email);
    console.log('🎯 [STUDENT ACTIONS CREATE] Rol completo:', JSON.stringify(currentUser.role, null, 2));
    console.log('🎯 [STUDENT ACTIONS CREATE] Rol nombre:', currentUser.role?.nombre);
    console.log('🎯 [STUDENT ACTIONS CREATE] Rol es objeto?:', typeof currentUser.role);
    console.log('🎯 [STUDENT ACTIONS CREATE] Rol es string?:', typeof currentUser.role?.nombre);

    // Obtener el nombre del rol de manera flexible
    let roleName = null;
    if (typeof currentUser.role === 'string') {
      roleName = currentUser.role;
    } else if (currentUser.role?.nombre) {
      roleName = currentUser.role.nombre;
    } else if (currentUser.role?._id) {
      // Si el rol no está poblado, intentar obtenerlo
      const Role = require('./shared/models/Role');
      const roleDoc = await Role.findById(currentUser.role._id);
      if (roleDoc) {
        roleName = roleDoc.nombre;
      }
    }

    // Normalizar nombre del rol (adminaccount y accountadmin son equivalentes)
    if (roleName === 'accountadmin') {
      roleName = 'adminaccount'; // Normalizar a adminaccount
      console.log('🔄 [STUDENT ACTIONS CREATE] Rol normalizado de accountadmin a adminaccount');
    }

    console.log('🎯 [STUDENT ACTIONS CREATE] Nombre de rol final:', roleName);
    console.log('🎯 [STUDENT ACTIONS CREATE] ¿Es adminaccount?:', roleName === 'adminaccount');
    console.log('🎯 [STUDENT ACTIONS CREATE] ¿Es superadmin?:', roleName === 'superadmin');

    // Verificar permisos
    if (!['adminaccount', 'superadmin'].includes(roleName)) {
      console.log('❌ [STUDENT ACTIONS CREATE] Sin permisos para crear acciones. Rol:', roleName);
      console.log('❌ [STUDENT ACTIONS CREATE] Roles permitidos: adminaccount, superadmin (accountadmin se normaliza a adminaccount)');
      console.log('❌ [STUDENT ACTIONS CREATE] Rol objeto completo:', JSON.stringify(currentUser.role, null, 2));
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear acciones de estudiantes',
        debug: {
          role: roleName,
          roleObject: currentUser.role,
          allowedRoles: ['adminaccount', 'superadmin', 'accountadmin']
        }
      });
    }

    // Validar campos requeridos
    if (!nombre || !division) {
      console.log('❌ [STUDENT ACTIONS CREATE] Campos requeridos faltantes:', { nombre, division });
      return res.status(400).json({
        success: false,
        message: 'Nombre y división son requeridos'
      });
    }

    console.log('🎯 [STUDENT ACTIONS CREATE] Verificando división:', division);
    // Verificar que la división existe
    let divisionExists = await Group.findById(division);
    
    // TEMPORAL: Si no existe la división, crear una de prueba
    if (!divisionExists) {
      console.log('❌ [STUDENT ACTIONS CREATE] División no encontrada:', division);
      console.log('🔧 [STUDENT ACTIONS CREATE] Creando división de prueba...');
      
      // Usar req.userInstitution si está disponible, sino currentUser.account
      const accountId = req.userInstitution?._id || currentUser.account || new mongoose.Types.ObjectId();
      
      // Crear división de prueba
      divisionExists = new Group({
        _id: division,
        nombre: 'División de Prueba',
        account: accountId,
        descripcion: 'División creada automáticamente para pruebas',
        creadoPor: currentUser._id
      });
      
      await divisionExists.save();
      console.log('✅ [STUDENT ACTIONS CREATE] División de prueba creada:', divisionExists.nombre);
    } else {
      console.log('✅ [STUDENT ACTIONS CREATE] División encontrada:', divisionExists.nombre);
    }
    
    // Verificar que la división pertenece a la institución del usuario
    // Usar req.userInstitution si está disponible (establecido por el middleware)
    // Si no, usar currentUser.account
    const userAccount = req.userInstitution?._id || currentUser.account;
    console.log('🔍 [STUDENT ACTIONS CREATE] Cuenta del usuario (userInstitution):', req.userInstitution?._id);
    console.log('🔍 [STUDENT ACTIONS CREATE] Cuenta del usuario (currentUser.account):', currentUser.account);
    console.log('🔍 [STUDENT ACTIONS CREATE] Cuenta del usuario (final):', userAccount);
    console.log('🔍 [STUDENT ACTIONS CREATE] Cuenta de la división:', divisionExists.account);
    
    // Si la cuenta de la división no coincide con la del usuario
    if (userAccount && divisionExists.account && userAccount.toString() !== divisionExists.account.toString()) {
      console.log('⚠️ [STUDENT ACTIONS CREATE] La división tiene una cuenta diferente');
      
      // Buscar si ya existe una división con el mismo nombre en la cuenta del usuario
      const existingDivisionInUserAccount = await Group.findOne({
        account: userAccount,
        nombre: divisionExists.nombre
      });
      
      if (existingDivisionInUserAccount) {
        // Si existe, usar esa división en lugar de la actual
        console.log('✅ [STUDENT ACTIONS CREATE] Se encontró división con el mismo nombre en la cuenta del usuario, usándola');
        divisionExists = existingDivisionInUserAccount;
      } else {
        // Si no existe, actualizar la cuenta de la división
        // Para evitar el error de índice único, primero cambiamos el nombre a uno temporal único
        console.log('⚠️ [STUDENT ACTIONS CREATE] No existe división con ese nombre en la cuenta del usuario');
        console.log('🔄 [STUDENT ACTIONS CREATE] Actualizando cuenta de la división...');
        
        const originalNombre = divisionExists.nombre;
        // Usar un nombre temporal único basado en el ID para evitar conflictos
        divisionExists.nombre = `TEMP_${divisionExists._id}_${Date.now()}`;
        await divisionExists.save();
        
        // Ahora actualizar la cuenta y restaurar el nombre original
        divisionExists.account = userAccount;
        divisionExists.nombre = originalNombre;
        await divisionExists.save();
        
        console.log('✅ [STUDENT ACTIONS CREATE] Cuenta de la división actualizada a:', userAccount);
      }
    }

    // Crear la acción
    console.log('🎯 [STUDENT ACTIONS CREATE] Creando nueva acción...');
    const nuevaAccion = new StudentAction({
      nombre,
      descripcion,
      division,
      account: divisionExists.account,
      color: color || '#3B82F6',
      orden: orden || 0,
      creadoPor: currentUser._id
    });

    console.log('🎯 [STUDENT ACTIONS CREATE] Guardando acción en BD...');
    await nuevaAccion.save();
    console.log('✅ [STUDENT ACTIONS CREATE] Acción guardada exitosamente:', nuevaAccion._id);

    res.status(201).json({
      success: true,
      message: 'Acción creada exitosamente',
      data: nuevaAccion
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTIONS CREATE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Actualizar acción existente
app.put('/api/student-actions/:actionId', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { actionId } = req.params;
    const { nombre, descripcion, categoria, icono, color, orden, activo } = req.body;
    const currentUser = req.user;

    console.log('🎯 [STUDENT ACTIONS UPDATE] Actualizando acción:', actionId);

    // Verificar permisos
    if (!['adminaccount', 'superadmin'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar acciones de estudiantes'
      });
    }

    // Buscar la acción
    const accion = await StudentAction.findById(actionId);
    if (!accion) {
      return res.status(404).json({
        success: false,
        message: 'La acción no existe'
      });
    }

    // Actualizar campos
    if (nombre) accion.nombre = nombre;
    if (descripcion !== undefined) accion.descripcion = descripcion;
    if (categoria) accion.categoria = categoria;
    if (icono) accion.icono = icono;
    if (color) accion.color = color;
    if (orden !== undefined) accion.orden = orden;
    if (activo !== undefined) accion.activo = activo;

    await accion.save();

    res.json({
      success: true,
      message: 'Acción actualizada exitosamente',
      data: accion
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTIONS UPDATE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Eliminar acción
app.delete('/api/student-actions/:actionId', authenticateToken, setUserInstitution, validateObjectId('actionId'), async (req, res) => {
  try {
    const { actionId } = req.params;
    const currentUser = req.user;

    console.log('🎯 [STUDENT ACTIONS DELETE] Eliminando acción:', actionId);

    // Verificar permisos
    if (!['adminaccount', 'superadmin'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar acciones de estudiantes'
      });
    }

    // Buscar y eliminar la acción
    const accion = await StudentAction.findByIdAndDelete(actionId);
    if (!accion) {
      return res.status(404).json({
        success: false,
        message: 'La acción no existe'
      });
    }

    res.json({
      success: true,
      message: 'Acción eliminada exitosamente'
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTIONS DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Registrar acción diaria de un estudiante
app.post('/api/student-actions/log', authenticateToken, async (req, res) => {
  try {
    const { estudiante, accion, comentarios, imagenes } = req.body;
    const currentUser = req.user;

    console.log('🎯 [STUDENT ACTION LOG] Registrando acción:', { estudiante, accion });

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para registrar acciones de estudiantes'
      });
    }

    // Validar campos requeridos
    if (!estudiante || !accion) {
      return res.status(400).json({
        success: false,
        message: 'Estudiante y acción son requeridos'
      });
    }

    // Verificar que el estudiante existe
    const estudianteExists = await Student.findById(estudiante);
    if (!estudianteExists) {
      return res.status(404).json({
        success: false,
        message: 'El estudiante no existe'
      });
    }

    // Verificar que la acción existe
    const accionExists = await StudentAction.findById(accion);
    if (!accionExists) {
      return res.status(404).json({
        success: false,
        message: 'La acción no existe'
      });
    }

    // Crear el registro de acción
    const actionLog = new StudentActionLog({
      estudiante,
      accion,
      registradoPor: currentUser._id,
      division: estudianteExists.division,
      account: estudianteExists.account,
      comentarios,
      imagenes: imagenes || []
    });

    await actionLog.save();

    res.status(201).json({
      success: true,
      message: 'Acción registrada exitosamente',
      data: actionLog
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTION LOG] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Obtener acciones registradas de un estudiante
app.get('/api/student-actions/log/student/:studentId', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { fecha } = req.query;
    const currentUser = req.user;

    console.log('🎯 [STUDENT ACTION LOG GET] Obteniendo acciones para estudiante:', studentId);

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador', 'familyadmin', 'familyviewer'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver acciones de estudiantes'
      });
    }

    // Construir filtro de fecha
    let fechaFilter = {};
    if (fecha) {
      const startDate = new Date(fecha);
      const endDate = new Date(fecha);
      endDate.setDate(endDate.getDate() + 1);
      
      fechaFilter = {
        fechaAccion: {
          $gte: startDate,
          $lt: endDate
        }
      };
    }

    // Obtener acciones del estudiante
    const acciones = await StudentActionLog.find({
      estudiante: studentId,
      ...fechaFilter
    })
    .populate('accion', 'nombre descripcion categoria icono color')
    .populate('registradoPor', 'name email')
    .sort({ fechaAccion: -1 });

    res.json({
      success: true,
      data: acciones
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTION LOG GET] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ===== RUTAS DE ASISTENCIAS =====
// Las rutas de asistencias están en routes/attendance.routes.js y ya están registradas
// Rutas movidas:
// - GET /asistencias -> attendanceController.listAsistencias
// - POST /asistencias -> attendanceController.createAsistencia
// - PUT /asistencia/:asistenciaId -> attendanceController.updateAsistencia
// - DELETE /asistencia/:asistenciaId -> attendanceController.deleteAsistencia

// ===== RUTAS DE ACTIVITY =====
// Las rutas de activities están registradas arriba con: app.use('/', activitiesRoutes);

// Registrar actividad (helper para otros endpoints)
const registrarActividad = async (data) => {
  try {
    await Activity.registrarActividad({
      usuario: data.usuario,
      account: data.account,
      tipo: data.tipo,
      entidad: data.entidad,
      entidadId: data.entidadId,
      descripcion: data.descripcion,
      datos: data.datos || {},
      ip: data.ip,
      userAgent: data.userAgent
    });
  } catch (error) {
    console.error('Error registrando actividad:', error);
  }
};

// ===== RUTAS DE ACTIVITY (ELIMINADAS - MOVIDAS A activities.controller.js) =====
// Las siguientes rutas fueron movidas a api/controllers/activities.controller.js:
// - GET /activities -> listActivities
// - POST /activities -> createActivity
// - PATCH /activities/:id/estado -> updateActivityStatus
// - DELETE /activities/:id (coordinador) -> deleteActivityCoordinator
// - DELETE /activities/:id (superadmin) -> deleteActivitySuperAdmin
// - GET /activities/mobile -> getMobileActivities
// - GET /backoffice/actividades/calendar -> getCalendarActivities
// - DELETE /backoffice/actividades/:id -> deleteActivityBackoffice
// - GET /backoffice/actividades/day -> getDayActivities

// ===== FIN DE RUTAS DE ACTIVITY =====
// Las rutas de activities fueron movidas a api/controllers/activities.controller.js y api/routes/activities.routes.js

// ==================== ENDPOINTS PARA ALUMNOS ====================
// NOTA: Las rutas de estudiantes fueron movidas a routes/students.routes.js
// Las siguientes rutas están duplicadas y deben eliminarse:
// - GET /students
// - GET /students/by-account-division
// - GET /students/template
// - POST /students/upload-excel
// - DELETE /students/:id
// - POST /students/generate-qr-codes
// - GET /students/by-qr/:qrCode
// - GET /students/:studentId
// - GET /students/division/:divisionId
// - GET /coordinators
// - GET /coordinators/by-division/:divisionId
// - GET /coordinators/template
// - POST /coordinators/upload-excel
// - GET /tutors
// - GET /tutors/by-division/:divisionId

// Ruta GET /students movida a routes/students.routes.js

// ==================== RUTAS DUPLICADAS ELIMINADAS ====================
// Las siguientes rutas fueron movidas a routes/students.routes.js y ya están registradas:
// - GET /students
// - GET /students/by-account-division
// - GET /students/template
// - POST /students/upload-excel
// - DELETE /students/:id
// - POST /students/generate-qr-codes
// - GET /students/by-qr/:qrCode
// - GET /students/:studentId
// - GET /students/division/:divisionId
// - GET /coordinators
// - GET /coordinators/by-division/:divisionId
// - GET /coordinators/template
// - POST /coordinators/upload-excel
// - GET /tutors
// - GET /tutors/by-division/:divisionId
// ======================================================================

// Rutas de estudiantes movidas a routes/students.routes.js
// (Bloques comentados eliminados)

// Rutas de coordinadores y tutores movidas a routes/students.routes.js
// (Bloque comentado eliminado)

// Rutas de estudiantes, coordinadores y tutores movidas a routes/students.routes.js

// ===== RUTAS DE ASISTENCIA =====
// NOTA: Las rutas de asistencia han sido movidas a routes/attendance.routes.js y controllers/attendance.controller.js
// Las rutas están registradas arriba con: app.use('/', attendanceRoutes);
// Rutas movidas:
// - POST /asistencia -> attendanceController.saveAsistencia
// - GET /asistencia/by-date -> attendanceController.getAsistenciaByDate
// - POST /asistencia/retirada -> attendanceController.saveRetirada
// - GET /asistencia/student-attendance -> attendanceController.getStudentAttendance

// Código eliminado - movido a controllers/attendance.controller.js
/*
app.post('/asistencia', authenticateToken, async (req, res) => {
  try {
    console.log('🚀 [ASISTENCIA] Iniciando endpoint de asistencia...');
    console.log('📥 Datos recibidos en /api/asistencia:', JSON.stringify(req.body, null, 2));
    console.log('👤 Usuario:', req.user);
    
    const { accountId, divisionId, estudiantes, retiradas } = req.body;
    const { userId } = req.user;

    console.log('🔍 [ASISTENCIA] Validando datos básicos...');
    console.log('🔍 [ASISTENCIA] accountId:', accountId);
    console.log('🔍 [ASISTENCIA] divisionId:', divisionId);
    console.log('🔍 [ASISTENCIA] estudiantes:', estudiantes);
    console.log('🔍 [ASISTENCIA] retiradas:', retiradas);

    // Validaciones básicas
    console.log('🔍 [ASISTENCIA] Validaciones básicas...');
    console.log('🔍 [ASISTENCIA] accountId existe:', !!accountId);
    console.log('🔍 [ASISTENCIA] divisionId existe:', !!divisionId);
    console.log('🔍 [ASISTENCIA] estudiantes existe:', !!estudiantes);
    console.log('🔍 [ASISTENCIA] estudiantes es array:', Array.isArray(estudiantes));
    
    if (!accountId || !divisionId || !estudiantes || !Array.isArray(estudiantes)) {
      console.log('❌ [ASISTENCIA] Validación básica falló');
      return res.status(400).json({
        success: false,
        message: 'accountId, divisionId y estudiantes (array) son requeridos'
      });
    }
    
    console.log('✅ [ASISTENCIA] Validaciones básicas pasaron, continuando...');
    console.log('🔍 [ASISTENCIA] Llegando a validación de cuenta...');

    // Verificar que la cuenta existe
    console.log('🔍 [ASISTENCIA] accountId recibido:', accountId, typeof accountId);
    console.log('🔍 [ASISTENCIA] Modelo Account disponible:', !!Account);
    console.log('🔍 [ASISTENCIA] Iniciando búsqueda de cuenta...');
    try {
      const account = await Account.findById(accountId);
      console.log('🔍 [ASISTENCIA] Resultado de Account.findById:', account);
      if (!account) {
        console.log('❌ [ASISTENCIA] Cuenta no encontrada para ID:', accountId);
        return res.status(400).json({
          success: false,
          message: 'La cuenta especificada no existe'
        });
      }
      console.log('✅ [ASISTENCIA] Cuenta encontrada:', account.nombre);
    } catch (e) {
      console.error('❌ [ASISTENCIA] Error en Account.findById:', e);
      return res.status(500).json({
        success: false,
        message: 'Error buscando la cuenta',
        error: e.message
      });
    }

    // Verificar que la división existe
    const division = await Grupo.findById(divisionId);
    if (!division) {
      return res.status(400).json({
        success: false,
        message: 'La división especificada no existe'
      });
    }

    // Verificar permisos del usuario
    const userAssociation = await Shared.findOne({
      user: userId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para registrar asistencia en esta cuenta'
      });
    }

    // Verificar que todos los estudiantes existen y pertenecen a la división
    const studentIds = estudiantes.map(e => e.studentId);
    const students = await Student.find({
      _id: { $in: studentIds },
      account: accountId,
      division: divisionId
    });

    if (students.length !== estudiantes.length) {
      return res.status(400).json({
        success: false,
        message: 'Algunos estudiantes no existen o no pertenecen a la división especificada'
      });
    }

    // Crear fecha para el día actual (solo fecha, sin hora)
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const fechaStr = `${yyyy}-${mm}-${dd}`;

    // Verificar si ya existe una asistencia para hoy
    const existingAsistencia = await Asistencia.findOne({
      account: accountId,
      division: divisionId,
      fecha: fechaStr
    });

    if (existingAsistencia) {
      // Actualizar la asistencia existente
      existingAsistencia.estudiantes = estudiantes.map(e => {
        const studentData = {
          student: e.studentId,
          presente: e.presente
        };
        
        // Agregar información de retirada si existe
        if (retiradas && retiradas[e.studentId]) {
          const retirada = retiradas[e.studentId];
          studentData.retirado = true;
          studentData.retiradoPor = retirada.withdrawnBy;
          studentData.retiradoPorNombre = retirada.withdrawnByName;
          studentData.retiradoEn = new Date();
        }
        
        return studentData;
      });
      
      await existingAsistencia.save();
      
      // Contar estudiantes presentes
      const presentes = estudiantes.filter(e => e.presente).length;
      const total = estudiantes.length;

      return res.json({
        success: true,
        message: `Asistencia actualizada exitosamente. ${presentes} de ${total} estudiantes presentes.`,
        data: {
          id: existingAsistencia._id,
          fecha: existingAsistencia.fecha,
          total: total,
          presentes: presentes
        }
      });
    }

    // Crear el registro de asistencia
    const asistenciaData = {
      account: accountId,
      division: divisionId,
      fecha: fechaStr,
      estudiantes: estudiantes.map(e => {
        const studentData = {
          student: e.studentId,
          presente: e.presente
        };
        
        // Agregar información de retirada si existe
        if (retiradas && retiradas[e.studentId]) {
          const retirada = retiradas[e.studentId];
          studentData.retirado = true;
          studentData.retiradoPor = retirada.withdrawnBy;
          studentData.retiradoPorNombre = retirada.withdrawnByName;
          studentData.retiradoEn = new Date();
        }
        
        return studentData;
      }),
      creadoPor: userId
    };

    const asistencia = new Asistencia(asistenciaData);
    await asistencia.save();

    // Contar estudiantes presentes
    const presentes = estudiantes.filter(e => e.presente).length;
    const total = estudiantes.length;

    res.status(201).json({
      success: true,
      message: `Asistencia guardada exitosamente. ${presentes} de ${total} estudiantes presentes.`,
      data: {
        id: asistencia._id,
        fecha: asistencia.fecha,
        total: total,
        presentes: presentes
      }
    });

  } catch (error) {
    console.error('❌ [ASISTENCIA] Error general en endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Middleware de manejo de errores
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor'
  });
});

// Obtener asistencia por cuenta, división y fecha
app.get('/asistencia/by-date', authenticateToken, async (req, res) => {
  try {
    const { accountId, divisionId, date } = req.query;
    if (!accountId || !divisionId) {
      return res.status(400).json({ success: false, message: 'accountId y divisionId son requeridos' });
    }
    
    console.log('🔍 [GET ASISTENCIA] Parámetros recibidos:', { accountId, divisionId, date });
    
    const fechaStr = date || new Date().toISOString().split('T')[0];
    
    console.log('🔍 [GET ASISTENCIA] fechaStr:', fechaStr);
    
    const asistencia = await Asistencia.findOne({
      account: accountId,
      division: divisionId,
      fecha: fechaStr
    });
    
    console.log('🔍 [GET ASISTENCIA] Resultado de búsqueda:', asistencia);
    
    if (!asistencia) {
      console.log('🔍 [GET ASISTENCIA] No se encontró asistencia');
      return res.json({ success: true, data: null });
    }
    
    console.log('🔍 [GET ASISTENCIA] Asistencia encontrada:', asistencia);
    res.json({ success: true, data: asistencia });
  } catch (error) {
    console.error('❌ [GET ASISTENCIA] Error:', error);
    res.status(500).json({ success: false, message: 'Error interno', error: error.message });
  }
});

// ==================== ENDPOINTS DE RETIRADAS ====================

// Guardar retirada individual
app.post('/asistencia/retirada', authenticateToken, async (req, res) => {
  try {
    console.log('🚀 [RETIRADA] Iniciando endpoint de retirada...');
    console.log('📥 Datos recibidos en /api/asistencia/retirada:', JSON.stringify(req.body, null, 2));
    
    const { accountId, divisionId, studentId, withdrawnBy, withdrawnByName } = req.body;
    const { userId } = req.user;

    console.log('🔍 [RETIRADA] Validando datos básicos...');
    console.log('🔍 [RETIRADA] accountId:', accountId);
    console.log('🔍 [RETIRADA] divisionId:', divisionId);
    console.log('🔍 [RETIRADA] studentId:', studentId);
    console.log('🔍 [RETIRADA] withdrawnBy:', withdrawnBy);
    console.log('🔍 [RETIRADA] withdrawnByName:', withdrawnByName);

    // Validaciones básicas
    if (!accountId || !divisionId || !studentId || !withdrawnBy || !withdrawnByName) {
      return res.status(400).json({
        success: false,
        message: 'accountId, divisionId, studentId, withdrawnBy y withdrawnByName son requeridos'
      });
    }

    // Verificar que la cuenta existe
    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(400).json({
        success: false,
        message: 'La cuenta especificada no existe'
      });
    }

    // Verificar que la división existe
    const division = await Grupo.findById(divisionId);
    if (!division) {
      return res.status(400).json({
        success: false,
        message: 'La división especificada no existe'
      });
    }

    // Verificar que el estudiante existe y pertenece a la división
    const student = await Student.findOne({
      _id: studentId,
      account: accountId,
      division: divisionId
    });

    if (!student) {
      return res.status(400).json({
        success: false,
        message: 'El estudiante no existe o no pertenece a la división especificada'
      });
    }

    // Verificar permisos del usuario
    const userAssociation = await Shared.findOne({
      user: userId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para registrar retiradas en esta cuenta'
      });
    }

    // Crear fecha para el día actual
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const fechaStr = `${yyyy}-${mm}-${dd}`;

    // Buscar o crear asistencia para hoy
    let asistencia = await Asistencia.findOne({
      account: accountId,
      division: divisionId,
      fecha: fechaStr
    });

    if (!asistencia) {
      // Crear nueva asistencia
      asistencia = new Asistencia({
        account: accountId,
        division: divisionId,
        fecha: fechaStr,
        estudiantes: [],
        creadoPor: userId
      });
    }

    // Buscar el estudiante en la asistencia
    let studentIndex = asistencia.estudiantes.findIndex(
      e => e.student.toString() === studentId
    );

    if (studentIndex === -1) {
      // Agregar el estudiante a la asistencia
      asistencia.estudiantes.push({
        student: studentId,
        presente: true, // Asumimos que está presente si se está retirando
        retirado: true,
        retiradoPor: withdrawnBy,
        retiradoPorNombre: withdrawnByName,
        retiradoEn: new Date()
      });
    } else {
      // Actualizar el estudiante existente
      asistencia.estudiantes[studentIndex].retirado = true;
      asistencia.estudiantes[studentIndex].retiradoPor = withdrawnBy;
      asistencia.estudiantes[studentIndex].retiradoPorNombre = withdrawnByName;
      asistencia.estudiantes[studentIndex].retiradoEn = new Date();
    }

    await asistencia.save();

    console.log('✅ [RETIRADA] Retirada guardada exitosamente');

    res.json({
      success: true,
      message: 'Retirada registrada exitosamente',
      data: {
        studentId,
        withdrawnBy,
        withdrawnByName,
        retiradoEn: new Date()
      }
    });

  } catch (error) {
    console.error('❌ [RETIRADA] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// ==================== ENDPOINTS DE ASISTENCIAS PARA FAMILIARES ====================

// Obtener asistencias de un alumno específico para familiares
app.get('/asistencia/student-attendance', authenticateToken, async (req, res) => {
  try {
    console.log('🚀 [STUDENT ATTENDANCE] Iniciando endpoint...');
    console.log('📥 Parámetros recibidos:', req.query);
    
    const { studentId, accountId, startDate, endDate } = req.query;
    const { userId } = req.user;

    // Validaciones básicas
    if (!studentId || !accountId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'studentId, accountId, startDate y endDate son requeridos'
      });
    }

    // Verificar que el usuario tiene permisos para ver este alumno
    const userAssociation = await Shared.findOne({
      user: userId,
      student: studentId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver las asistencias de este alumno'
      });
    }

    // Buscar asistencias en el rango de fechas
    const asistencias = await Asistencia.find({
      account: accountId,
      fecha: {
        $gte: startDate,
        $lte: endDate
      }
    }).populate('estudiantes.student', 'nombre apellido');

    // Filtrar solo las asistencias del alumno específico
    const studentAttendances = [];
    
    asistencias.forEach(asistencia => {
      const studentAttendance = asistencia.estudiantes.find(
        e => e.student._id.toString() === studentId
      );
      
      if (studentAttendance) {
        studentAttendances.push({
          _id: asistencia._id,
          fecha: asistencia.fecha,
          presente: studentAttendance.presente,
          retirado: studentAttendance.retirado || false,
          retiradoPor: studentAttendance.retiradoPor || null,
          retiradoPorNombre: studentAttendance.retiradoPorNombre || null,
          retiradoEn: studentAttendance.retiradoEn || null,
          ingresoEn: studentAttendance.ingresoEn || asistencia.createdAt || null
        });
      }
    });

    // Obtener información del alumno
    const student = await Student.findById(studentId)
      .populate('account', 'nombre')
      .populate('division', 'nombre');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Alumno no encontrado'
      });
    }

    console.log('✅ [STUDENT ATTENDANCE] Asistencias encontradas:', studentAttendances.length);

    res.json({
      success: true,
      data: {
        student: {
          _id: student._id,
          nombre: student.nombre,
          apellido: student.apellido
        },
        attendances: studentAttendances
      }
    });

  } catch (error) {
    console.error('❌ [STUDENT ATTENDANCE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});
*/

// ==================== ENDPOINTS DE CÓDIGOS QR ====================

// Rutas POST /students/generate-qr-codes y GET /students/by-qr/:qrCode movidas a routes/students.routes.js

// Obtener contactos autorizados para retirada de un estudiante
app.get('/pickups/by-student/:studentId', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    
    if (!studentId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID del estudiante es requerido' 
      });
    }

    // Buscar contactos autorizados para el estudiante
    const pickups = await Pickup.find({ 
      student: studentId,
      status: 'active' // Filtrar solo los activos
    })
      .select('nombre apellido dni status')
      .sort({ nombre: 1 });

    res.json({
      success: true,
      data: pickups.map(pickup => ({
        _id: pickup._id,
        nombre: pickup.nombre,
        apellido: pickup.apellido || '',
        dni: pickup.dni || ''
      }))
    });

  } catch (error) {
    console.error('❌ [PICKUPS BY STUDENT] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// Ruta GET /students/:studentId movida a routes/students.routes.js

// ==================== FUNCIONES AUXILIARES PARA PUSH NOTIFICATIONS ====================

/**
 * Obtener usuarios familyadmin y familyviewer asociados a un estudiante
 * @param {string} studentId - ID del estudiante
 * @returns {Array} Array de usuarios con sus dispositivos
 */
async function getFamilyUsersForStudent(studentId) {
  try {
    console.log('🔔 [FAMILY LOOKUP] Buscando familiares para estudiante:', studentId);
    
    // Buscar asociaciones activas del estudiante con roles familyadmin y familyviewer
    const associations = await Shared.find({
      student: studentId,
      status: 'active',
      'role.nombre': { $in: ['familyadmin', 'familyviewer'] }
    }).populate('user', 'name email').populate('role', 'nombre');
    
    console.log('🔔 [FAMILY LOOKUP] Asociaciones encontradas:', associations.length);
    
    const familyUsers = [];
    
    for (const association of associations) {
      if (association.user && association.role) {
        // Obtener dispositivos activos del usuario
        const devices = await Device.getActiveDevicesForUser(association.user._id);
        
        if (devices.length > 0) {
          familyUsers.push({
            user: association.user,
            role: association.role,
            devices: devices
          });
          console.log('🔔 [FAMILY LOOKUP] Usuario con dispositivos:', association.user.name, '- Dispositivos:', devices.length);
        } else {
          console.log('🔔 [FAMILY LOOKUP] Usuario sin dispositivos activos:', association.user.name);
        }
      }
    }
    
    console.log('🔔 [FAMILY LOOKUP] Total usuarios familiares con dispositivos:', familyUsers.length);
    return familyUsers;
    
  } catch (error) {
    console.error('❌ [FAMILY LOOKUP] Error:', error);
    return [];
  }
}

/**
 * Enviar push notifications a usuarios familiares de un estudiante
 * @param {string} studentId - ID del estudiante
 * @param {Object} notification - Datos de la notificación
 */
async function sendPushNotificationToStudentFamily(studentId, notification) {
  try {
    console.log('🔔 [PUSH SEND] Enviando push notification a cola SQS para estudiante:', studentId);
    
    const pushNotification = {
      title: notification.title,
      message: notification.message,
      data: {
        type: 'notification',
        notificationId: notification._id,
        studentId: studentId,
        priority: notification.priority || 'normal'
      },
      badge: 1,
      sound: 'default'
    };
    
    const result = await sendPushToStudentFamilyToQueue(studentId, pushNotification);
    
    if (result.success) {
      console.log('🔔 [PUSH SEND] ✅ Push notification enviado a cola SQS - MessageId:', result.messageId);
      return { sent: 1, failed: 0, queued: true };
    } else {
      console.error('🔔 [PUSH SEND] ❌ Error enviando a cola SQS:', result.error);
      return { sent: 0, failed: 1, queued: false };
    }
  } catch (error) {
    console.error('❌ [PUSH SEND] Error general:', error);
    return { sent: 0, failed: 1, queued: false };
  }
}

// ==================== ENDPOINTS DE PUSH NOTIFICATIONS ====================
// NOTA: Las rutas de push notifications han sido movidas a routes/push.routes.js
// Las rutas están registradas arriba con: app.use('/push', pushRoutes);

// ==================== ENDPOINTS DE NOTIFICACIONES ====================
// NOTA: Las rutas de notificaciones han sido movidas a routes/notifications.routes.js
// Las rutas están registradas arriba con: app.use('/', notificationsRoutes);

// ===== NUEVOS ENDPOINTS DE EVENTOS =====
// NOTA: Las rutas de eventos han sido movidas a routes/events.routes.js
// Las rutas están registradas arriba con: app.use('/', eventsRoutes);

// ===== SERVICIOS DE FAVORITOS =====
// NOTA: Las rutas de favoritos han sido movidas a routes/activities.routes.js
// Las rutas están registradas arriba con: app.use('/', activitiesRoutes);

// ===== ENDPOINTS DE 2FA =====

// Generar secreto 2FA
app.post('/auth/2fa/setup', authenticateToken, async (req, res) => {
  try {
    console.log('🔐 [2FA SETUP] Iniciando configuración 2FA para:', req.user.email);
    
    const { secret, qrCodeUrl, manualEntryKey } = await TwoFactorAuthService.generateSecret(
      req.user.userId, 
      req.user.email
    );
    
    const qrCodeDataURL = await TwoFactorAuthService.generateQRCode(qrCodeUrl);
    
    console.log('✅ [2FA SETUP] Configuración 2FA generada exitosamente');
    
    res.json({
      success: true,
      data: {
        secret: secret,
        qrCodeUrl: qrCodeUrl,
        qrCodeDataURL: qrCodeDataURL,
        manualEntryKey: manualEntryKey
      }
    });
  } catch (error) {
    console.error('❌ [2FA SETUP] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error configurando 2FA'
    });
  }
});

// ===== RUTAS DE ASISTENCIAS =====
// NOTA: La ruta GET /asistencias está duplicada. La versión activa está en la línea 5269.
// Esta versión duplicada ha sido eliminada.

// ===== ENDPOINTS PARA LOGOS DE CUENTAS =====

// Actualizar logo de una cuenta
app.put('/accounts/:accountId/logo', authenticateToken, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { imageKey } = req.body;
    const currentUser = req.user;

    console.log('🖼️ [UPDATE LOGO] Cuenta:', accountId);
    console.log('🖼️ [UPDATE LOGO] Image Key:', imageKey);
    console.log('👤 [UPDATE LOGO] Usuario:', currentUser._id, currentUser.role?.nombre);

    // Verificar que el usuario tiene permisos para actualizar la cuenta
    if (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar logos de cuentas'
      });
    }

    // Verificar que la cuenta existe
    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada'
      });
    }

    // Si el usuario es adminaccount, verificar que pertenece a esa cuenta
    if (currentUser.role?.nombre === 'adminaccount') {
      const userAssociation = await Shared.findOne({
        user: currentUser._id,
        account: accountId,
        status: 'active'
      });

      if (!userAssociation) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para actualizar esta cuenta'
        });
      }
    }

    // Actualizar el logo de la cuenta
    account.logo = imageKey;
    await account.save();

    console.log('🖼️ [UPDATE LOGO] Logo actualizado exitosamente');

    // Generar URL firmada para el logo
    const { generateSignedUrl } = require('./config/s3.config');
    const logoSignedUrl = await generateSignedUrl(imageKey, 172800); // 2 días

    res.json({
      success: true,
      message: 'Logo actualizado exitosamente',
      data: {
        accountId: account._id,
        logo: account.logo,
        logoUrl: logoSignedUrl // URL firmada en lugar de URL pública
      }
    });

  } catch (error) {
    console.error('❌ [UPDATE LOGO] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al actualizar el logo'
    });
  }
});

// Obtener logo de una cuenta
app.get('/accounts/:accountId/logo', authenticateToken, async (req, res) => {
  try {
    const { accountId } = req.params;
    const currentUser = req.user;

    console.log('🖼️ [GET LOGO] Cuenta:', accountId);
    console.log('👤 [GET LOGO] Usuario:', currentUser._id);

    // Verificar que la cuenta existe
    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada'
      });
    }

    // Verificar que el usuario tiene acceso a la cuenta
    const userAssociation = await Shared.findOne({
      user: currentUser._id,
      account: accountId,
      status: { $in: ['active', 'pending'] }
    });

    if (!userAssociation && currentUser.role?.nombre !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes acceso a esta cuenta'
      });
    }

    // Generar URL firmada para el logo si existe
    let logoUrl = null;
    if (account.logo) {
      const { generateSignedUrl } = require('./config/s3.config');
      logoUrl = await generateSignedUrl(account.logo, 172800); // 2 días
    }

    res.json({
      success: true,
      data: {
        accountId: account._id,
        logo: account.logo,
        logoUrl: logoUrl
      }
    });

  } catch (error) {
    console.error('❌ [GET LOGO] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al obtener el logo'
    });
  }
});

// ===== ENDPOINTS DE ASISTENCIAS PARA BACKOFFICE =====
// Movidos a routes/backoffice.routes.js y controllers/backoffice.controller.js

// ========================================
// ENDPOINTS CRUD PARA PICKUP (QUIÉN RETIRA)
// ========================================
// Movidos a routes/pickup.routes.js y controllers/pickup.controller.js

// ========================================
// ENDPOINTS DE SHARED (ASOCIACIONES)
// ========================================
// Nota: Los endpoints de shared están en routes/shared.routes.js
// Los endpoints de backoffice están en routes/backoffice.routes.js
// Los endpoints de pickup están en routes/pickup.routes.js

// ========================================
// ENDPOINTS CRUD PARA PICKUP (QUIÉN RETIRA)
// ========================================
// Movidos a routes/pickup.routes.js y controllers/pickup.controller.js

// ========================================
// ENDPOINTS DE SHARED (ASOCIACIONES) - CÓDIGO LEGACY
// ========================================
// Nota: La mayoría de los endpoints de shared están en routes/shared.routes.js
// pero algunos endpoints antiguos pueden estar aquí todavía

// ========================================
// ENDPOINTS DE SHARED (ASOCIACIONES) - CÓDIGO LEGACY
// ========================================
// Nota: La mayoría de los endpoints de shared están en routes/shared.routes.js
// pero algunos endpoints antiguos pueden estar aquí todavía

// ========================================
// ENDPOINTS DE SHARED (ASOCIACIONES) - CÓDIGO LEGACY
// ========================================
// Nota: La mayoría de los endpoints de shared están en routes/shared.routes.js
// pero algunos endpoints antiguos pueden estar aquí todavía

// Obtener asociaciones del usuario
app.get('/shared/user', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    console.log('🎯 [SHARED GET] Obteniendo asociaciones del usuario');
    const { userId } = req.user;
    
    console.log('👤 [SHARED GET] Usuario:', userId);
    
    // Obtener todas las asociaciones del usuario
    const userAssociations = await Shared.find({
      user: userId,
      status: 'active'
    }).populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('student', 'nombre apellido avatar')
      .populate('role', 'nombre')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    // Generar URLs firmadas para los avatares de estudiantes
    console.log('🔍 [SHARED GET] ===== PROCESANDO AVATARES DE ESTUDIANTES =====');
    console.log('🔍 [SHARED GET] Total de asociaciones:', userAssociations.length);
    
    const associationsWithSignedUrls = await Promise.all(userAssociations.map(async (association, index) => {
      console.log(`🔍 [SHARED GET] Procesando asociación ${index + 1}/${userAssociations.length}:`, {
        id: association._id,
        studentId: association.student?._id,
        studentName: association.student?.nombre,
        studentAvatar: association.student?.avatar,
        hasAvatar: !!association.student?.avatar
      });
      
      // Convertir a objeto plano para poder modificar propiedades
      const associationObj = association.toObject ? association.toObject() : association;
      
      if (associationObj.student && associationObj.student.avatar) {
        try {
          console.log('🔍 [SHARED GET] Procesando avatar del estudiante:', associationObj.student._id);
          console.log('🔍 [SHARED GET] Avatar original:', associationObj.student.avatar);
          
          const originalAvatar = associationObj.student.avatar;
          let processedAvatar = originalAvatar;
          
          // Verificar si es una key de S3 o una URL local
          if (originalAvatar.startsWith('http')) {
            console.log('🔍 [SHARED GET] Es una URL completa, usando tal como está');
            // Es una URL completa (puede ser local o S3), no hacer nada
          } else if (originalAvatar.includes('students/')) {
            // Es una key de S3 para estudiantes, generar URL firmada
            console.log('🔍 [SHARED GET] Es una key de S3 para estudiantes, generando URL firmada');
            console.log('🔍 [SHARED GET] Key original:', originalAvatar);
            
            try {
              const { generateSignedUrl } = require('./config/s3.config');
              console.log('🔍 [SHARED GET] Función generateSignedUrl importada correctamente');
              
              const signedUrl = await generateSignedUrl(originalAvatar, 172800); // 2 días
              console.log('🔍 [SHARED GET] URL firmada generada exitosamente:', signedUrl);
              console.log('🔍 [SHARED GET] Tipo de URL firmada:', typeof signedUrl);
              console.log('🔍 [SHARED GET] Longitud de URL firmada:', signedUrl ? signedUrl.length : 'null');
              
              processedAvatar = signedUrl || originalAvatar; // Fallback si signedUrl es null
              console.log('🔍 [SHARED GET] Avatar procesado:', processedAvatar);
            } catch (s3Error) {
              console.error('❌ [SHARED GET] Error generando URL firmada:', s3Error);
              console.error('❌ [SHARED GET] Error details:', {
                message: s3Error.message,
                stack: s3Error.stack,
                name: s3Error.name
              });
              // Mantener la key original si falla
              console.log('🔍 [SHARED GET] Manteniendo key original:', originalAvatar);
              processedAvatar = originalAvatar;
            }
          } else {
            // Es una key local, generar URL local
            const localUrl = `${req.protocol}://${req.get('host')}/uploads/${originalAvatar.split('/').pop()}`;
            console.log('🔍 [SHARED GET] URL local generada:', localUrl);
            processedAvatar = localUrl;
          }
          
          // Asignar el avatar procesado
          associationObj.student.avatar = processedAvatar;
          console.log('✅ [SHARED GET] Avatar procesado asignado:', associationObj.student.avatar);
        } catch (error) {
          console.error('❌ [SHARED GET] Error procesando avatar del estudiante:', associationObj.student?._id, error);
          // Si falla, usar URL directa
          if (associationObj.student && associationObj.student.avatar) {
            const fallbackUrl = `${req.protocol}://${req.get('host')}/uploads/${associationObj.student.avatar.split('/').pop()}`;
            console.log('🔍 [SHARED GET] Usando URL de fallback:', fallbackUrl);
            associationObj.student.avatar = fallbackUrl;
          }
        }
      } else {
        console.log('🔍 [SHARED GET] Estudiante sin avatar:', associationObj.student?._id);
      }
      return associationObj;
    }));
    
    console.log('📦 [SHARED GET] ===== RESULTADO FINAL =====');
    console.log('📦 [SHARED GET] Asociaciones encontradas:', associationsWithSignedUrls.length);
    
    // Log de las asociaciones procesadas
    associationsWithSignedUrls.forEach((assoc, index) => {
      console.log(`📦 [SHARED GET] Asociación ${index + 1} final:`, {
        id: assoc._id,
        studentId: assoc.student?._id,
        studentName: assoc.student?.nombre,
        studentAvatar: assoc.student?.avatar,
        hasAvatar: !!assoc.student?.avatar
      });
    });
    
    console.log('📤 [SHARED GET] ===== ENVIANDO RESPUESTA AL CLIENTE =====');
    console.log('📤 [SHARED GET] Total de asociaciones a enviar:', associationsWithSignedUrls.length);
    
    associationsWithSignedUrls.forEach((assoc, index) => {
      console.log(`📤 [SHARED GET] Asociación ${index + 1} en respuesta:`, {
        id: assoc._id,
        studentId: assoc.student?._id,
        studentName: assoc.student?.nombre,
        studentAvatar: assoc.student?.avatar,
        hasAvatar: !!assoc.student?.avatar,
        avatarType: assoc.student?.avatar ? (assoc.student.avatar.startsWith('http') ? 'URL completa' : 'Key de S3') : 'Sin avatar'
      });
    });
    
    res.json({
      success: true,
      data: {
        user: {
          _id: req.user._id,
          email: req.user.email,
          name: req.user.name,
          role: req.user.role,
          status: req.user.status,
          avatar: req.user.avatar
        },
        associations: associationsWithSignedUrls
      }
    });
  } catch (error) {
    console.error('Error al obtener asociaciones del usuario:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Endpoint para obtener asociaciones del usuario (con prefijo /api)
app.get('/api/shared/user', authenticateToken, async (req, res) => {
  try {
    console.log('🎯 [API SHARED GET] Obteniendo asociaciones del usuario');
    const { userId } = req.user;
    
    console.log('👤 [API SHARED GET] Usuario:', userId);
    
    // Obtener las asociaciones del usuario
    const userAssociations = await Shared.find({ user: userId })
      .populate('account')
      .populate('division')
      .populate({
        path: 'student',
        select: 'nombre apellido avatar'
      });
    
    console.log('🔍 [API SHARED GET] ===== PROCESANDO AVATARES DE ESTUDIANTES =====');
    console.log('🔍 [API SHARED GET] Total de asociaciones:', userAssociations.length);
    
    const associationsWithSignedUrls = await Promise.all(userAssociations.map(async (association, index) => {
      console.log(`🔍 [API SHARED GET] Procesando asociación ${index + 1}/${userAssociations.length}:`, {
        id: association._id,
        studentId: association.student?._id,
        studentName: association.student?.nombre,
        studentAvatar: association.student?.avatar,
        hasAvatar: !!association.student?.avatar
      });
      
      // Convertir a objeto plano para poder modificar propiedades
      const associationObj = association.toObject ? association.toObject() : association;
      
      if (associationObj.student && associationObj.student.avatar) {
        try {
          console.log('🔍 [API SHARED GET] Procesando avatar del estudiante:', associationObj.student._id);
          console.log('🔍 [API SHARED GET] Avatar original:', associationObj.student.avatar);
          
          const originalAvatar = associationObj.student.avatar;
          let processedAvatar = originalAvatar;
          
          // Verificar si es una key de S3 o una URL local
          if (originalAvatar.startsWith('http')) {
            console.log('🔍 [API SHARED GET] Es una URL completa, usando tal como está');
            // Es una URL completa (puede ser local o S3), no hacer nada
          } else if (originalAvatar.includes('students/')) {
            // Es una key de S3 para estudiantes, generar URL firmada
            console.log('🔍 [API SHARED GET] Es una key de S3 para estudiantes, generando URL firmada');
            console.log('🔍 [API SHARED GET] Key original:', originalAvatar);
            
            try {
              const { generateSignedUrl } = require('./config/s3.config');
              console.log('🔍 [API SHARED GET] Función generateSignedUrl importada correctamente');
              
              const signedUrl = await generateSignedUrl(originalAvatar, 172800); // 2 días
              console.log('🔍 [API SHARED GET] URL firmada generada exitosamente:', signedUrl);
              console.log('🔍 [API SHARED GET] Tipo de URL firmada:', typeof signedUrl);
              console.log('🔍 [API SHARED GET] Longitud de URL firmada:', signedUrl ? signedUrl.length : 'null');
              
              processedAvatar = signedUrl || originalAvatar; // Fallback si signedUrl es null
              console.log('🔍 [API SHARED GET] Avatar procesado:', processedAvatar);
            } catch (s3Error) {
              console.error('❌ [API SHARED GET] Error generando URL firmada:', s3Error);
              console.error('❌ [API SHARED GET] Error details:', {
                message: s3Error.message,
                stack: s3Error.stack,
                name: s3Error.name
              });
              // Mantener la key original si falla
              console.log('🔍 [API SHARED GET] Manteniendo key original:', originalAvatar);
              processedAvatar = originalAvatar;
            }
          } else {
            // Es una key local, generar URL local
            const localUrl = `${req.protocol}://${req.get('host')}/uploads/${originalAvatar.split('/').pop()}`;
            console.log('🔍 [API SHARED GET] URL local generada:', localUrl);
            processedAvatar = localUrl;
          }
          
          // Asignar el avatar procesado
          associationObj.student.avatar = processedAvatar;
          console.log('✅ [API SHARED GET] Avatar procesado asignado:', associationObj.student.avatar);
        } catch (error) {
          console.error('❌ [API SHARED GET] Error procesando avatar del estudiante:', associationObj.student?._id, error);
          // Si falla, usar URL directa
          if (associationObj.student && associationObj.student.avatar) {
            const fallbackUrl = `${req.protocol}://${req.get('host')}/uploads/${associationObj.student.avatar.split('/').pop()}`;
            console.log('🔍 [API SHARED GET] Usando URL de fallback:', fallbackUrl);
            associationObj.student.avatar = fallbackUrl;
          }
        }
      } else {
        console.log('🔍 [API SHARED GET] Estudiante sin avatar:', associationObj.student?._id);
      }
      return associationObj;
    }));
    
    console.log('📦 [API SHARED GET] ===== RESULTADO FINAL =====');
    console.log('📦 [API SHARED GET] Asociaciones encontradas:', associationsWithSignedUrls.length);
    
    associationsWithSignedUrls.forEach((assoc, index) => {
      console.log(`📦 [API SHARED GET] Asociación ${index + 1} final:`, {
        id: assoc._id,
        studentId: assoc.student?._id,
        studentName: assoc.student?.nombre,
        studentAvatar: assoc.student?.avatar,
        hasAvatar: !!assoc.student?.avatar
      });
    });
    
    res.json({
      success: true,
      data: {
        associations: associationsWithSignedUrls
      }
    });
  } catch (error) {
    console.error('Error al obtener asociaciones del usuario:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Endpoint para obtener asociaciones de un estudiante específico
app.get('/shared/student/:studentId', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { userId } = req.user;

    console.log('🔍 [SHARED STUDENT] Buscando asociaciones para estudiante:', studentId);
    console.log('👤 [SHARED STUDENT] Usuario solicitante:', userId);

    // Verificar que el usuario tiene permisos para ver este estudiante
    // (solo superadmin, adminaccount, coordinador pueden ver)
    const user = await User.findById(userId).populate('role');
    const userRole = user?.role?.nombre;

    console.log('🎭 [SHARED STUDENT] Rol del usuario:', userRole);

    if (!['superadmin', 'adminaccount', 'coordinador'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver las vinculaciones de estudiantes'
      });
    }

    // Buscar todas las asociaciones donde este estudiante esté vinculado
    const associations = await Shared.find({
      student: studentId,
      status: { $in: ['active', 'inactive'] } // Mostrar tanto activas como inactivas
    }).populate('user account division role createdBy');

    console.log('📊 [SHARED STUDENT] Asociaciones encontradas:', associations.length);

    res.json({
      success: true,
      data: {
        associations
      }
    });
  } catch (error) {
    console.error('Error obteniendo asociaciones del estudiante:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Crear nueva asociación (solo familyadmin)
app.post('/shared', authenticateToken, async (req, res) => {
  try {
    console.log('🎯 [SHARED POST] Creando nueva asociación');
    const { userId } = req.user;
    const { accountId, divisionId, studentId, roleName } = req.body;
    
    console.log('👤 [SHARED POST] Usuario:', userId);
    console.log('📝 [SHARED POST] Datos recibidos:', {
      accountId, divisionId, studentId, roleName
    });
    
    // Verificar que el usuario es familyadmin
    const user = await User.findById(userId).populate('role');
    if (user.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores familiares pueden crear asociaciones'
      });
    }
    
    // Verificar que la cuenta existe
    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Institución no encontrada'
      });
    }
    
    // Verificar que el rol existe
    const role = await Role.findOne({ nombre: roleName });
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }
    
    // Verificar que la división existe si se proporciona
    if (divisionId) {
      const division = await Grupo.findById(divisionId);
      if (!division) {
        return res.status(404).json({
          success: false,
          message: 'División no encontrada'
        });
      }
    }
    
    // Verificar que el estudiante existe si se proporciona
    if (studentId) {
      const student = await Student.findById(studentId);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Estudiante no encontrado'
        });
      }
    }
    
    // Crear la asociación
    const association = new Shared({
      user: userId,
      account: accountId,
      division: divisionId,
      student: studentId,
      role: role._id,
      status: 'active',
      createdBy: userId
    });
    
    await association.save();
    
    // Verificar si el usuario ya tiene una asociación activa
    const existingActiveAssociation = await ActiveAssociation.getActiveAssociation(userId);
    
    if (!existingActiveAssociation) {
      // Si no tiene asociación activa, establecer esta como activa automáticamente
      try {
        await ActiveAssociation.setActiveAssociation(userId, association._id);
        console.log(`🎯 [AUTO-ACTIVE] Asociación automáticamente establecida como activa para usuario ${userId}`);
      } catch (error) {
        console.error('❌ [AUTO-ACTIVE] Error estableciendo asociación activa automáticamente:', error);
      }
    } else {
      console.log(`ℹ️ [AUTO-ACTIVE] Usuario ${userId} ya tiene una asociación activa, no se cambia automáticamente`);
    }
    
    // Enviar email de notificación de asociación
    try {
      const user = await User.findById(userId);
      const account = await Account.findById(accountId);
      const role = await Role.findById(role._id);
      
      if (user && account) {
        await sendNotificationEmailToQueue(
          user.email,
          'Asociación a Institución',
          `Has sido asociado a la institución <strong>${account.nombre}</strong> con el rol <strong>${role.nombre}</strong>. Ya puedes acceder a la aplicación con tus credenciales.`,
          user.name
        );
        console.log('✅ [SHARED POST] Email de notificación enviado exitosamente a:', user.email);
      }
    } catch (emailError) {
      console.error('❌ [SHARED POST] Error enviando email de notificación:', emailError);
      // No fallar la operación si el email falla, solo loguear el error
    }
    
    // Populate para la respuesta
    const populatedAssociation = await Shared.findById(association._id)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('student', 'nombre apellido')
      .populate('role', 'nombre')
      .populate('createdBy', 'name');
    
    console.log('✅ [SHARED POST] Asociación creada correctamente');
    
    res.status(201).json({
      success: true,
      data: {
        association: populatedAssociation
      },
      message: 'Asociación creada correctamente'
    });
  } catch (error) {
    console.error('Error al crear asociación:', error);
    
    // Manejar errores de validación de Mongoose
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false, 
        message: 'Error de validación',
        errors: validationErrors
      });
    }
    
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Obtener familyviewers de un estudiante (solo para familyadmin del mismo estudiante)
app.get('/shared/student/:studentId/familyviewers', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { userId } = req.user;

    console.log('🔍 [FAMILYVIEWERS GET] Buscando familyviewers para estudiante:', studentId);
    console.log('👤 [FAMILYVIEWERS GET] Usuario solicitante:', userId);

    // Verificar que el usuario tiene una asociación activa con este estudiante como familyadmin
    const userAssociation = await Shared.findOne({
      user: userId,
      student: studentId,
      status: 'active'
    }).populate('role');

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver los familyviewers de este estudiante'
      });
    }

    // Verificar que el usuario es familyadmin para este estudiante
    if (userAssociation.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores familiares pueden ver los familyviewers'
      });
    }

    // Buscar todas las asociaciones familyviewer activas para este estudiante
    const familyviewerRole = await Role.findOne({ nombre: 'familyviewer' });
    if (!familyviewerRole) {
      return res.status(500).json({
        success: false,
        message: 'Rol familyviewer no encontrado'
      });
    }

    const familyviewers = await Shared.find({
      student: studentId,
      role: familyviewerRole._id,
      status: 'active'
    })
      .populate('user', 'name email')
      .populate('role', 'nombre')
      .sort({ createdAt: -1 });

    console.log('📊 [FAMILYVIEWERS GET] Familyviewers encontrados:', familyviewers.length);

    res.json({
      success: true,
      data: {
        familyviewers: familyviewers.map(assoc => ({
          _id: assoc._id,
          user: {
            _id: assoc.user._id,
            name: assoc.user.name,
            email: assoc.user.email
          },
          role: {
            _id: assoc.role._id,
            nombre: assoc.role.nombre
          },
          createdAt: assoc.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('Error obteniendo familyviewers:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Eliminar asociación (solo familyadmin)
app.delete('/shared/:id', authenticateToken, async (req, res) => {
  try {
    console.log('🗑️ [SHARED DELETE] Eliminando asociación:', req.params.id);
    const { userId } = req.user;
    const { id } = req.params;
    
    // Buscar la asociación a eliminar
    const associationToDelete = await Shared.findById(id).populate('role', 'nombre');
    if (!associationToDelete) {
      return res.status(404).json({
        success: false,
        message: 'Asociación no encontrada'
      });
    }

    // Verificar que la asociación a eliminar es de un familyviewer
    if (associationToDelete.role?.nombre !== 'familyviewer') {
      return res.status(403).json({
        success: false,
        message: 'Solo se pueden eliminar asociaciones de familyviewer'
      });
    }

    // Verificar que el usuario tiene una asociación familyadmin con el mismo estudiante
    const userAssociation = await Shared.findOne({
      user: userId,
      student: associationToDelete.student,
      status: 'active'
    }).populate('role', 'nombre');

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar esta asociación. Solo puedes eliminar familyviewers de tu estudiante.'
      });
    }

    // Verificar que el usuario es familyadmin para este estudiante
    if (userAssociation.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores familiares pueden eliminar asociaciones'
      });
    }
    
    // Eliminar la asociación (soft delete)
    associationToDelete.status = 'inactive';
    await associationToDelete.save();
    
    console.log('✅ [SHARED DELETE] Asociación eliminada correctamente');
    
    res.json({
      success: true,
      message: 'Familyviewer eliminado correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar asociación:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Solicitar asociación por email
app.post('/shared/request', authenticateToken, async (req, res) => {
  try {
    console.log('🎯 [SHARED REQUEST] Agregando familiar al estudiante');
    const { userId } = req.user;
    const { email, nombre, apellido, studentId } = req.body;
    
    console.log('👤 [SHARED REQUEST] Usuario solicitante:', userId);
    console.log('📧 [SHARED REQUEST] Email:', email);
    console.log('👤 [SHARED REQUEST] Nombre:', nombre);
    console.log('👤 [SHARED REQUEST] Apellido:', apellido);
    console.log('🎓 [SHARED REQUEST] Student ID:', studentId);
    console.log('🔍 [SHARED REQUEST] Body completo:', JSON.stringify(req.body, null, 2));
    
    // Verificar que el usuario tiene una asociación activa como familyadmin
    const activeAssociation = await ActiveAssociation.getActiveAssociation(userId);
    if (!activeAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes una asociación activa'
      });
    }
    
    const activeShared = await Shared.findById(activeAssociation.activeShared).populate('role');
    if (activeShared.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores familiares pueden agregar familiares'
      });
    }
    
    // Usar la asociación activa ya obtenida
    const userAssociation = await Shared.findById(activeAssociation.activeShared)
      .populate('account division student role');
    
    // Verificar que el estudiante pertenece al familyadmin
    // IMPORTANTE: Verificar todas las asociaciones del usuario, no solo la activa
    // porque un familyadmin puede tener múltiples estudiantes
    const allUserAssociations = await Shared.find({
      user: userId,
      role: userAssociation.role._id,
      status: 'active'
    }).populate('student');
    
    const hasPermission = allUserAssociations.some(assoc => 
      assoc.student?._id.toString() === studentId.toString()
    );
    
    if (!hasPermission) {
      console.log('❌ [SHARED REQUEST] Permiso denegado - El estudiante no pertenece al familyadmin');
      console.log('🔍 [SHARED REQUEST] StudentId solicitado:', studentId);
      console.log('🔍 [SHARED REQUEST] Estudiantes del usuario:', allUserAssociations.map(a => ({
        id: a.student?._id?.toString(),
        nombre: a.student?.nombre
      })));
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para agregar familiares a este estudiante'
      });
    }
    
    // Obtener la asociación específica del estudiante solicitado para usar sus datos (account, division)
    const studentAssociation = allUserAssociations.find(assoc => 
      assoc.student?._id.toString() === studentId.toString()
    );
    
    // Usar la asociación del estudiante específico si existe, sino usar la activa
    const associationToUse = studentAssociation || userAssociation;
    
    // Verificar si el email ya existe en users
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    
    if (existingUser) {
      console.log('✅ [SHARED REQUEST] Usuario encontrado, creando asociación directa');
      
      // Verificar si ya existe una asociación para este usuario con este estudiante específico
      // Permitimos múltiples asociaciones para familyviewers (pueden ser visualizadores de varios hijos)
      // pero no permitimos duplicados para el mismo estudiante
      const existingShared = await Shared.findOne({
        user: existingUser._id,
        student: studentId,
        status: 'active'
      });
      
      if (existingShared) {
        return res.status(400).json({
          success: false,
          message: 'El usuario ya tiene una asociación activa con este estudiante'
        });
      }
      
      // Obtener el rol familyviewer
      const familyviewerRole = await Role.findOne({ nombre: 'familyviewer' });
      if (!familyviewerRole) {
        return res.status(500).json({
          success: false,
          message: 'Rol familyviewer no encontrado'
        });
      }
      
      // Crear la asociación directamente
      const newShared = new Shared({
        user: existingUser._id,
        account: associationToUse.account._id,
        division: associationToUse.division?._id,
        student: studentId,
        role: familyviewerRole._id,
        status: 'active',
        createdBy: userId
      });
      
      await newShared.save();
      
      // Verificar si el usuario ya tiene una asociación activa
      const existingActiveAssociation = await ActiveAssociation.getActiveAssociation(existingUser._id);
      
      if (!existingActiveAssociation) {
        // Si no tiene asociación activa, establecer esta como activa automáticamente
        try {
          await ActiveAssociation.setActiveAssociation(existingUser._id, newShared._id);
          console.log(`🎯 [AUTO-ACTIVE] Asociación automáticamente establecida como activa para usuario ${existingUser._id}`);
        } catch (error) {
          console.error('❌ [AUTO-ACTIVE] Error estableciendo asociación activa automáticamente:', error);
        }
      } else {
        console.log(`ℹ️ [AUTO-ACTIVE] Usuario ${existingUser._id} ya tiene una asociación activa, no se cambia automáticamente`);
      }
      
      // Obtener información del estudiante para el email
      const student = await Student.findById(studentId).select('nombre apellido');
      const studentName = student ? `${student.nombre} ${student.apellido}` : 'el estudiante';
      
      // Enviar email de notificación de invitación (sin credenciales)
      sendEmailAsync(sendFamilyInvitationNotificationEmail, null, existingUser.email, existingUser.name, studentName);
      console.log('📧 [SHARED REQUEST] Email de notificación de invitación familiar programado para envío asíncrono a:', existingUser.email);
      
      console.log('✅ [SHARED REQUEST] Asociación creada exitosamente');
      
      res.status(201).json({
        success: true,
        message: 'Asociación creada exitosamente. Se envió un email de notificación.',
        data: {
          user: {
            _id: existingUser._id,
            name: existingUser.name,
            email: existingUser.email
          },
          association: newShared
        }
      });
      
    } else {
      console.log('⏳ [SHARED REQUEST] Usuario no encontrado');
      
      // Si el rol activo es familyadmin, crear el usuario automáticamente
      if (activeShared.role.nombre === 'familyadmin') {
        console.log('🔧 [SHARED REQUEST] Rol activo es familyadmin, creando usuario automáticamente');
        
        try {
          // Generar contraseña aleatoria de 8 caracteres
          const generateRandomPassword = () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let password = '';
            for (let i = 0; i < 8; i++) {
              password += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return password;
          };
          
          const randomPassword = generateRandomPassword();
          console.log('🔑 [SHARED REQUEST] Contraseña generada:', randomPassword);
          
          // Obtener el rol familyviewer
          const familyviewerRole = await Role.findOne({ nombre: 'familyviewer' });
          if (!familyviewerRole) {
            return res.status(500).json({
              success: false,
              message: 'Rol familyviewer no encontrado'
            });
          }
          
          // Crear el nuevo usuario
          const newUser = new User({
            name: `${nombre} ${apellido}`,
            email: email.toLowerCase(),
            password: randomPassword,
            role: familyviewerRole._id,
            status: 'approved', // Aprobar automáticamente usuarios familyviewer
            isFirstLogin: true // Marcar como primer login
          });
          
          await newUser.save();
          console.log('✅ [SHARED REQUEST] Usuario creado exitosamente:', newUser._id);
          
          // Crear la asociación inmediatamente
          const newShared = new Shared({
            user: newUser._id,
            account: associationToUse.account._id,
            division: associationToUse.division?._id,
            student: studentId,
            role: familyviewerRole._id,
            status: 'active',
            createdBy: userId
          });
          
          await newShared.save();
          
          // Verificar si el usuario ya tiene una asociación activa
          const existingActiveAssociation = await ActiveAssociation.getActiveAssociation(newUser._id);
          
          if (!existingActiveAssociation) {
            // Si no tiene asociación activa, establecer esta como activa automáticamente
            try {
              await ActiveAssociation.setActiveAssociation(newUser._id, newShared._id);
              console.log(`🎯 [AUTO-ACTIVE] Asociación automáticamente establecida como activa para usuario ${newUser._id}`);
            } catch (error) {
              console.error('❌ [AUTO-ACTIVE] Error estableciendo asociación activa automáticamente:', error);
            }
          } else {
            console.log(`ℹ️ [AUTO-ACTIVE] Usuario ${newUser._id} ya tiene una asociación activa, no se cambia automáticamente`);
          }
          
          console.log('✅ [SHARED REQUEST] Asociación creada exitosamente');
          
          // Enviar email de invitación con las credenciales (asíncrono)
          await sendFamilyInvitationEmailToQueue(newUser.email, newUser.name, randomPassword);
          console.log('📧 [SHARED REQUEST] Email de invitación familiar programado para envío asíncrono a:', email);
          
          res.status(201).json({
            success: true,
            message: 'Familiar agregado exitosamente. Se envió un email con las credenciales de acceso.',
            data: {
              user: {
                _id: newUser._id,
                name: newUser.name,
                email: newUser.email
              },
              association: newShared,
              password: randomPassword // Temporalmente incluir la contraseña en la respuesta para testing
            }
          });
          
        } catch (userCreationError) {
          console.error('❌ [SHARED REQUEST] Error creando usuario:', userCreationError);
          
          // Si falla la creación del usuario, guardar como solicitud pendiente
          const requestedShared = new RequestedShared({
            requestedBy: userId,
            requestedEmail: email.toLowerCase(),
            account: associationToUse.account._id,
            division: associationToUse.division?._id,
            student: studentId,
            role: associationToUse.role._id,
            status: 'pending'
          });
          
          await requestedShared.save();
          
          res.status(201).json({
            success: true,
            message: 'Error al crear usuario automáticamente. Se guardó como solicitud pendiente.',
            data: {
              request: requestedShared
            }
          });
        }
        
      } else {
        console.log('⏳ [SHARED REQUEST] Rol activo no es familyadmin, guardando solicitud pendiente');
        
        // Verificar si ya existe una solicitud pendiente para este email
        const existingRequest = await RequestedShared.findOne({
          requestedEmail: email.toLowerCase(),
          status: 'pending'
        });
        
        if (existingRequest) {
          return res.status(400).json({
            success: false,
            message: 'Ya existe una solicitud pendiente para este email'
          });
        }
        
        // Crear solicitud pendiente
        const requestedShared = new RequestedShared({
          requestedBy: userId,
          requestedEmail: email.toLowerCase(),
          account: associationToUse.account._id,
          division: associationToUse.division?._id,
          student: studentId,
          role: associationToUse.role._id,
          status: 'pending'
        });
        
        await requestedShared.save();
        
        console.log('✅ [SHARED REQUEST] Solicitud pendiente guardada exitosamente');
        
        res.status(201).json({
          success: true,
          message: 'Solicitud enviada. La asociación se creará cuando el usuario se registre',
          data: {
            request: requestedShared
          }
        });
      }
    }
    
  } catch (error) {
    console.error('Error al solicitar asociación:', error);
    
    // Manejar errores de validación de Mongoose
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false, 
        message: 'Error de validación',
        errors: validationErrors
      });
    }
    
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// ========================================
// ENDPOINTS DE ASOCIACIÓN ACTIVA
// ========================================

// Obtener la asociación activa del usuario
app.get('/active-association', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    console.log('🎯 [ACTIVE ASSOCIATION GET] Obteniendo asociación activa del usuario');
    const { userId } = req.user;

    const activeAssociation = await ActiveAssociation.getActiveAssociation(userId);

    if (!activeAssociation) {
      return res.json({
        success: true,
        data: null,
        message: 'No hay asociación activa'
      });
    }

    // Debug: Log del avatar del estudiante en asociación activa
    if (activeAssociation.student) {
      console.log('🎓 [ACTIVE ASSOCIATION GET] Estudiante activo:', {
        id: activeAssociation.student._id,
        nombre: activeAssociation.student.nombre,
        apellido: activeAssociation.student.apellido,
        avatar: activeAssociation.student.avatar,
        hasAvatar: !!activeAssociation.student.avatar
      });
    }

    // Procesar avatar del estudiante para generar URL firmada
    let studentWithSignedUrl = null;
    if (activeAssociation.student) {
      studentWithSignedUrl = {
        _id: activeAssociation.student._id,
        nombre: activeAssociation.student.nombre,
        apellido: activeAssociation.student.apellido,
        avatar: activeAssociation.student.avatar
      };
      
      // Procesar avatar del estudiante para generar URL firmada
      if (activeAssociation.student.avatar) {
        try {
          console.log('🎓 [ACTIVE ASSOCIATION GET] Procesando avatar del estudiante:', activeAssociation.student._id);
          console.log('🎓 [ACTIVE ASSOCIATION GET] Avatar original:', activeAssociation.student.avatar);
          
          // Verificar si es una key de S3 o una URL local
          if (activeAssociation.student.avatar.startsWith('http')) {
            console.log('🎓 [ACTIVE ASSOCIATION GET] Es una URL completa, usando tal como está');
            // Es una URL completa (puede ser local o S3), no hacer nada
          } else if (activeAssociation.student.avatar.includes('students/')) {
            // Es una key de S3 para estudiantes, generar URL firmada
            console.log('🎓 [ACTIVE ASSOCIATION GET] Es una key de S3 para estudiantes, generando URL firmada');
            const { generateSignedUrl } = require('./config/s3.config');
            const signedUrl = await generateSignedUrl(activeAssociation.student.avatar, 172800); // 2 días
            console.log('🎓 [ACTIVE ASSOCIATION GET] URL firmada generada:', signedUrl);
            studentWithSignedUrl.avatar = signedUrl;
          } else {
            // Es una key local, generar URL local
            const localUrl = `${req.protocol}://${req.get('host')}/uploads/${activeAssociation.student.avatar.split('/').pop()}`;
            console.log('🎓 [ACTIVE ASSOCIATION GET] URL local generada:', localUrl);
            studentWithSignedUrl.avatar = localUrl;
          }
        } catch (error) {
          console.error('🎓 [ACTIVE ASSOCIATION GET] Error procesando avatar del estudiante:', activeAssociation.student._id, error);
          // En caso de error, mantener el avatar original
        }
      }
    }

    res.json({
      success: true,
      data: {
        _id: activeAssociation._id,
        activeShared: activeAssociation.activeShared,
        account: activeAssociation.account,
        role: activeAssociation.role,
        division: activeAssociation.division,
        student: studentWithSignedUrl,
        activatedAt: activeAssociation.activatedAt
      }
    });

  } catch (error) {
    console.error('❌ [ACTIVE ASSOCIATION GET] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener asociación activa' 
    });
  }
});

// Obtener todas las asociaciones disponibles del usuario
app.get('/active-association/available', authenticateToken, async (req, res) => {
  try {
    console.log('🎯 [ACTIVE ASSOCIATION AVAILABLE] Obteniendo asociaciones disponibles');
    const { userId } = req.user;

    // Obtener la asociación activa actual para comparar
    const currentActive = await ActiveAssociation.findOne({ user: userId });
    console.log('🎯 [ACTIVE ASSOCIATION AVAILABLE] Asociación activa actual:', currentActive ? {
      id: currentActive._id,
      activeShared: currentActive.activeShared,
      account: currentActive.account?.nombre,
      role: currentActive.role?.nombre
    } : null);

    const associations = await ActiveAssociation.getUserAvailableAssociations(userId);
    console.log('🎯 [ACTIVE ASSOCIATION AVAILABLE] Asociaciones disponibles:', associations.length);

    // Procesar URLs de avatares para cada asociación
    const formattedAssociations = await Promise.all(associations.map(async (assoc) => {
      const isActive = currentActive ? assoc._id.toString() === currentActive.activeShared.toString() : false;
      
      // Debug: Log del avatar del estudiante
      if (assoc.student) {
        console.log('🎓 [ACTIVE ASSOCIATION AVAILABLE] Estudiante:', {
          id: assoc.student._id,
          nombre: assoc.student.nombre,
          apellido: assoc.student.apellido,
          avatar: assoc.student.avatar,
          hasAvatar: !!assoc.student.avatar
        });
      }
      
      let studentWithSignedUrl = null;
      if (assoc.student) {
        studentWithSignedUrl = {
          _id: assoc.student._id,
          nombre: assoc.student.nombre,
          apellido: assoc.student.apellido,
          avatar: assoc.student.avatar
        };
        
        // Procesar avatar del estudiante para generar URL firmada
        if (assoc.student.avatar) {
          try {
            console.log('🎓 [ACTIVE ASSOCIATION AVAILABLE] Procesando avatar del estudiante:', assoc.student._id);
            console.log('🎓 [ACTIVE ASSOCIATION AVAILABLE] Avatar original:', assoc.student.avatar);
            
            // Verificar si es una key de S3 o una URL local
            if (assoc.student.avatar.startsWith('http')) {
              console.log('🎓 [ACTIVE ASSOCIATION AVAILABLE] Es una URL completa, usando tal como está');
              // Es una URL completa (puede ser local o S3), no hacer nada
            } else if (assoc.student.avatar.includes('students/')) {
              // Es una key de S3 para estudiantes, generar URL firmada
              console.log('🎓 [ACTIVE ASSOCIATION AVAILABLE] Es una key de S3 para estudiantes, generando URL firmada');
              const { generateSignedUrl } = require('./config/s3.config');
              const signedUrl = await generateSignedUrl(assoc.student.avatar, 172800); // 2 días
              console.log('🎓 [ACTIVE ASSOCIATION AVAILABLE] URL firmada generada:', signedUrl);
              studentWithSignedUrl.avatar = signedUrl;
            } else {
              // Es una key local, generar URL local
              const localUrl = `${req.protocol}://${req.get('host')}/uploads/${assoc.student.avatar.split('/').pop()}`;
              console.log('🎓 [ACTIVE ASSOCIATION AVAILABLE] URL local generada:', localUrl);
              studentWithSignedUrl.avatar = localUrl;
            }
          } catch (error) {
            console.error('🎓 [ACTIVE ASSOCIATION AVAILABLE] Error procesando avatar del estudiante:', assoc.student._id, error);
            // En caso de error, mantener el avatar original
          }
        }
      }
      
      return {
        _id: assoc._id,
        account: {
          _id: assoc.account._id,
          nombre: assoc.account.nombre,
          razonSocial: assoc.account.razonSocial
        },
        role: {
          _id: assoc.role._id,
          nombre: assoc.role.nombre,
          descripcion: assoc.role.descripcion
        },
        division: assoc.division ? {
          _id: assoc.division._id,
          nombre: assoc.division.nombre,
          descripcion: assoc.division.descripcion
        } : null,
        student: studentWithSignedUrl,
        createdAt: assoc.createdAt,
        isActive: isActive
      };
    }));

    res.json({
      success: true,
      data: formattedAssociations
    });

  } catch (error) {
    console.error('❌ [ACTIVE ASSOCIATION AVAILABLE] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener asociaciones disponibles' 
    });
  }
});

// Establecer una asociación como activa
app.post('/active-association/set', authenticateToken, async (req, res) => {
  try {
    console.log('🎯 [ACTIVE ASSOCIATION SET] Estableciendo asociación activa');
    const { userId } = req.user;
    const { sharedId } = req.body;

    if (!sharedId) {
      return res.status(400).json({
        success: false,
        message: 'ID de asociación es requerido'
      });
    }

    const activeAssociation = await ActiveAssociation.setActiveAssociation(userId, sharedId);

    res.json({
      success: true,
      message: 'Asociación activa establecida exitosamente',
      data: {
        _id: activeAssociation._id,
        activeShared: activeAssociation.activeShared,
        account: activeAssociation.account,
        role: activeAssociation.role,
        division: activeAssociation.division,
        student: activeAssociation.student,
        activatedAt: activeAssociation.activatedAt
      }
    });

  } catch (error) {
    console.error('❌ [ACTIVE ASSOCIATION SET] Error:', error);
    
    if (error.message.includes('no encontrada') || 
        error.message.includes('no está activa') || 
        error.message.includes('no pertenece')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Error al establecer asociación activa' 
    });
  }
});

// Limpiar asociaciones activas inválidas (endpoint administrativo)
app.post('/active-association/cleanup', authenticateToken, async (req, res) => {
  try {
    console.log('🎯 [ACTIVE ASSOCIATION CLEANUP] Limpiando asociaciones activas inválidas');
    
    // Verificar que el usuario sea admin o superadmin
    const user = await User.findById(req.user.userId).populate('role');
    if (!user || !['admin', 'superadmin'].includes(user.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para realizar esta acción'
      });
    }

    await ActiveAssociation.cleanupInvalidAssociations();

    res.json({
      success: true,
      message: 'Limpieza de asociaciones activas completada'
    });

  } catch (error) {
    console.error('❌ [ACTIVE ASSOCIATION CLEANUP] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al limpiar asociaciones activas' 
    });
  }
});

// ========================================
// ===== ENDPOINTS DE RECUPERACIÓN DE CONTRASEÑA =====
// NOTA: Las rutas de recuperación de contraseña han sido movidas a routes/auth.routes.js
// Las rutas están registradas arriba con: app.use('/', authRoutes);

const PORT = config.GATEWAY_PORT || 3000;

// ===== SERVICIOS DE FAVORITOS =====
// NOTA: Las rutas de favoritos han sido movidas a routes/activities.routes.js
// Las rutas están registradas arriba con: app.use('/', activitiesRoutes);

// ===== ENDPOINTS DE 2FA =====

// NOTA: Las rutas duplicadas de 2FA han sido eliminadas.
// Las versiones activas están en las líneas 8083 (setup), 8083+ (enable), y 11012 (verify).
// Esta sección duplicada ha sido eliminada.

// Verificar código 2FA (versión correcta)
app.post('/auth/2fa/verify', async (req, res) => {
  try {
    const { email, token, backupCode } = req.body;
    
    console.log('🔍 [2FA VERIFY] Verificando código 2FA para:', email);
    
    const user = await User.findOne({ email }).select('+twoFactorSecret +twoFactorBackupCodes');
    
    if (!user || !user.twoFactorEnabled) {
      return res.status(400).json({
        success: false,
        message: '2FA no habilitado para este usuario'
      });
    }
    
    let isValid = false;
    
    if (backupCode) {
      // Verificar código de respaldo
      isValid = await TwoFactorAuthService.verifyBackupCode(user._id, backupCode);
    } else if (token) {
      // Verificar código TOTP
      isValid = TwoFactorAuthService.verifyToken(user.twoFactorSecret, token);
    }
    
    if (isValid) {
      console.log('✅ [2FA VERIFY] Código 2FA válido');
      res.json({
        success: true,
        message: 'Código 2FA válido'
      });
    } else {
      console.log('❌ [2FA VERIFY] Código 2FA inválido');
      res.status(400).json({
        success: false,
        message: 'Código 2FA inválido'
      });
    }
  } catch (error) {
    console.error('❌ [2FA VERIFY] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verificando código 2FA'
    });
  }
});

// Obtener estado 2FA
app.get('/auth/2fa/status', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 [2FA STATUS] Obteniendo estado 2FA para:', req.user.email);
    
    const status = await TwoFactorAuthService.get2FAStatus(req.user.userId);
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('❌ [2FA STATUS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo estado 2FA'
    });
  }
});

// ===== ENDPOINTS DE MONITOREO DE LOGIN =====

// Obtener estadísticas de login (solo administradores)
app.get('/admin/login-stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { timeWindow = 24 } = req.query;
    
    console.log('📊 [LOGIN STATS] Obteniendo estadísticas de login...');
    
    const stats = await LoginMonitorService.getLoginStats(parseInt(timeWindow));
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ [LOGIN STATS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo estadísticas de login'
    });
  }
});

// Obtener intentos recientes de un usuario
app.get('/admin/user-login-attempts/:email', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { email } = req.params;
    const { limit = 10 } = req.query;
    
    console.log('📊 [USER ATTEMPTS] Obteniendo intentos de login para:', email);
    
    const attempts = await LoginMonitorService.getUserRecentAttempts(email, parseInt(limit));
    
    res.json({
      success: true,
      data: attempts
    });
  } catch (error) {
    console.error('❌ [USER ATTEMPTS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo intentos del usuario'
    });
  }
});

// Obtener intentos sospechosos
app.get('/admin/suspicious-attempts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { timeWindow = 24, limit = 50 } = req.query;
    
    console.log('🚨 [SUSPICIOUS] Obteniendo intentos sospechosos...');
    
    const attempts = await LoginMonitorService.getSuspiciousAttempts(
      parseInt(timeWindow), 
      parseInt(limit)
    );
    
    res.json({
      success: true,
      data: attempts
    });
  } catch (error) {
    console.error('❌ [SUSPICIOUS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo intentos sospechosos'
    });
  }
});

// Limpiar registros antiguos (solo superadmin)
app.post('/admin/cleanup-login-attempts', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { daysToKeep = 30 } = req.body;
    
    console.log('🧹 [CLEANUP] Limpiando registros antiguos...');
    
    const deletedCount = await LoginMonitorService.cleanupOldAttempts(parseInt(daysToKeep));
    
    res.json({
      success: true,
      message: `${deletedCount} registros eliminados`,
      deletedCount: deletedCount
    });
  } catch (error) {
    console.error('❌ [CLEANUP] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error limpiando registros antiguos'
    });
  }
});

// ===== ENDPOINTS DE EXPIRACIÓN DE CONTRASEÑAS =====
// NOTA: Las rutas de expiración de contraseñas han sido movidas a routes/auth.routes.js
// Las rutas están registradas arriba con: app.use('/', authRoutes);

// ====================================================================================================
// RUTAS PARA ACCIONES DE ESTUDIANTES
// ====================================================================================================

// Registrar acción de estudiante (para coordinadores)
app.post('/api/student-actions/log', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { estudiante, accion, comentarios, imagenes, fechaAccion } = req.body;
    const currentUser = req.user;

    console.log('🎯 [STUDENT ACTION LOG] Registrando acción:', { estudiante, accion, comentarios });

    // Verificar que el estudiante existe y pertenece a la institución
    const student = await Student.findById(estudiante).populate('division');
    if (!student) {
      return res.status(404).json({ success: false, message: 'Estudiante no encontrado' });
    }

    // Verificar que la acción existe
    const action = await StudentAction.findById(accion);
    if (!action) {
      return res.status(404).json({ success: false, message: 'Acción no encontrada' });
    }

    // Verificar que la división del estudiante pertenece a la institución del usuario
    if (req.userInstitution && student.division.cuenta.toString() !== req.userInstitution._id.toString()) {
      return res.status(403).json({ success: false, message: 'El estudiante no pertenece a tu institución' });
    }

    // Crear el log de acción
    const actionLog = new StudentActionLog({
      estudiante,
      accion,
      registradoPor: currentUser._id,
      division: student.division._id,
      account: student.division.cuenta,
      fechaAccion: fechaAccion ? new Date(fechaAccion) : new Date(),
      comentarios,
      imagenes: imagenes || [],
      estado: 'registrado'
    });

    await actionLog.save();

    // Poblar los datos para la respuesta
    await actionLog.populate([
      { path: 'estudiante', select: 'nombre apellido avatar' },
      { path: 'accion', select: 'nombre descripcion color categoria' },
      { path: 'registradoPor', select: 'name email' },
      { path: 'division', select: 'nombre descripcion' }
    ]);

    console.log('✅ [STUDENT ACTION LOG] Acción registrada:', actionLog._id);

    res.json({
      success: true,
      message: 'Acción registrada exitosamente',
      data: actionLog
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTION LOG] Error registrando acción:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// Obtener acciones de un estudiante (para familias)
app.get('/api/student-actions/log/student/:studentId', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { fecha, fechaInicio, fechaFin } = req.query;
    const currentUser = req.user;

    console.log('🎯 [STUDENT ACTION LOG] Obteniendo acciones para estudiante:', studentId);

    // Verificar que el estudiante existe
    const student = await Student.findById(studentId).populate('division');
    if (!student) {
      return res.status(404).json({ success: false, message: 'Estudiante no encontrado' });
    }

    // Verificar que el usuario tiene acceso al estudiante
    // Para familias: verificar que el estudiante está en sus asociaciones
    // Para coordinadores: verificar que el estudiante está en su división
    let hasAccess = false;
    
    // Obtener el nombre del rol de manera flexible
    let roleName = null;
    if (typeof currentUser.role === 'string') {
      roleName = currentUser.role;
    } else if (currentUser.role?.nombre) {
      roleName = currentUser.role.nombre;
    }

    if (roleName === 'familyadmin' || roleName === 'familyview' || roleName === 'familyviewer') {
      // Para familias, verificar que el estudiante está en sus asociaciones
      const association = await Shared.findOne({ 
        user: currentUser._id, 
        student: studentId, 
        status: 'active' 
      });
      hasAccess = !!association;
    } else if (roleName === 'coordinador') {
      // Para coordinadores, verificar que el estudiante está en su división
      hasAccess = student.division._id.toString() === currentUser.division?.toString();
    } else if (roleName === 'adminaccount') {
      // Para adminaccount, verificar que pertenece a la misma institución
      hasAccess = student.division.cuenta.toString() === req.userInstitution._id.toString();
    }

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'No tienes acceso a este estudiante' });
    }

    // Construir filtros de fecha - Usar UTC para evitar problemas de timezone
    let dateFilter = {};
    if (fecha) {
      // Crear fechas en UTC para evitar problemas de zona horaria
      const startDate = new Date(fecha + 'T00:00:00.000Z');
      const endDate = new Date(fecha + 'T23:59:59.999Z');
      dateFilter = { fechaAccion: { $gte: startDate, $lte: endDate } };
      
      console.log('📅 [STUDENT ACTION LOG] Filtro por fecha específica (student):', {
        fecha,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });
    } else if (fechaInicio && fechaFin) {
      // Crear fechas en UTC para el rango, expandido para considerar timezone
      const startDate = new Date(fechaInicio + 'T00:00:00.000Z');
      startDate.setUTCDate(startDate.getUTCDate() - 1); // Un día antes para timezone negativo
      
      const endDate = new Date(fechaFin + 'T23:59:59.999Z');
      endDate.setUTCDate(endDate.getUTCDate() + 1); // Un día después para timezone positivo
      endDate.setUTCHours(23, 59, 59, 999);
      
      dateFilter = { 
        fechaAccion: { 
          $gte: startDate, 
          $lte: endDate 
        } 
      };
      
      console.log('📅 [STUDENT ACTION LOG] Filtro por rango de fechas (student, expandido para timezone):', {
        fechaInicio,
        fechaFin,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });
    }

    // Buscar las acciones
    const actions = await StudentActionLog.find({
      estudiante: studentId,
      ...dateFilter
    })
    .populate('accion', 'nombre descripcion color categoria icono')
    .populate('registradoPor', 'name email')
    .populate('division', 'nombre descripcion')
    .sort({ fechaAccion: -1 });

    console.log('✅ [STUDENT ACTION LOG] Acciones obtenidas:', actions.length);

    res.json({
      success: true,
      message: 'Acciones obtenidas exitosamente',
      data: actions
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTION LOG] Error obteniendo acciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// Obtener acciones por división (para coordinadores)
app.get('/api/student-actions/log/division/:divisionId', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { divisionId } = req.params;
    const { fecha, fechaInicio, fechaFin } = req.query;
    const currentUser = req.user;

    console.log('🎯 [STUDENT ACTION LOG] Obteniendo acciones para división:', divisionId);

    // Verificar que la división existe
    const division = await Grupo.findById(divisionId);
    if (!division) {
      return res.status(404).json({ success: false, message: 'División no encontrada' });
    }

    // Verificar que el usuario tiene acceso a la división
    if (req.userInstitution && division.cuenta.toString() !== req.userInstitution._id.toString()) {
      return res.status(403).json({ success: false, message: 'No tienes acceso a esta división' });
    }

    // Construir filtros de fecha - Usar UTC para evitar problemas de timezone
    let dateFilter = {};
    if (fecha) {
      // Crear fechas en UTC para evitar problemas de zona horaria
      // Si fecha viene como "2025-10-31", crear fecha en UTC
      const startDate = new Date(fecha + 'T00:00:00.000Z');
      const endDate = new Date(fecha + 'T23:59:59.999Z');
      dateFilter = { fechaAccion: { $gte: startDate, $lte: endDate } };
      
      console.log('📅 [STUDENT ACTION LOG] Filtro por fecha específica:', {
        fecha,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });
    } else if (fechaInicio && fechaFin) {
      // Crear fechas en UTC para el rango
      // Expandir el rango para incluir el día completo considerando timezone
      // Usar un día antes y después para asegurar que capturemos todas las acciones
      const startDate = new Date(fechaInicio + 'T00:00:00.000Z');
      startDate.setUTCDate(startDate.getUTCDate() - 1); // Un día antes para timezone negativo
      
      const endDate = new Date(fechaFin + 'T23:59:59.999Z');
      endDate.setUTCDate(endDate.getUTCDate() + 1); // Un día después para timezone positivo
      endDate.setUTCHours(23, 59, 59, 999);
      
      dateFilter = { 
        fechaAccion: { 
          $gte: startDate, 
          $lte: endDate 
        } 
      };
      
      console.log('📅 [STUDENT ACTION LOG] Filtro por rango de fechas (expandido para timezone):', {
        fechaInicio,
        fechaFin,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });
    }

    // Construir query de búsqueda
    const query = {
      division: divisionId,
      ...dateFilter
    };
    
    console.log('🔍 [STUDENT ACTION LOG] Query de búsqueda:', JSON.stringify(query, null, 2));
    
    // DEBUG: Buscar TODAS las acciones de esta división sin filtro de fecha para ver qué fechas tienen
    const allDivisionActions = await StudentActionLog.find({ division: divisionId })
      .select('_id fechaAccion')
      .sort({ fechaAccion: -1 })
      .limit(10)
      .lean();
    
    console.log('🔍 [STUDENT ACTION LOG] DEBUG - Todas las acciones de la división (primeras 10):');
    allDivisionActions.forEach((action, index) => {
      const fechaAccion = new Date(action.fechaAccion);
      console.log(`   ${index + 1}. ID: ${action._id} | FechaAccion: ${fechaAccion.toISOString()} | Local: ${fechaAccion.toLocaleString()}`);
    });
    
    // Buscar las acciones
    const actions = await StudentActionLog.find(query)
    .populate('estudiante', 'nombre apellido avatar')
    .populate('accion', 'nombre descripcion color categoria icono')
    .populate('registradoPor', 'name email')
    .sort({ fechaAccion: -1 });

    console.log('✅ [STUDENT ACTION LOG] Acciones obtenidas:', actions.length);
    if (actions.length > 0) {
      console.log('📋 [STUDENT ACTION LOG] Primeras acciones:', actions.slice(0, 3).map(a => ({
        id: a._id,
        fechaAccion: a.fechaAccion,
        estudiante: a.estudiante?.nombre,
        accion: a.accion?.nombre
      })));
    }

    res.json({
      success: true,
      message: 'Acciones obtenidas exitosamente',
      data: actions
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTION LOG] Error obteniendo acciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// Obtener acciones por cuenta (para backoffice)
app.get('/api/student-actions/log/account/:accountId', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { fecha, fechaInicio, fechaFin, divisionId } = req.query;
    const currentUser = req.user;

    console.log('🎯 [STUDENT ACTION LOG] Obteniendo acciones para cuenta:', accountId);

    // Verificar que el usuario tiene acceso a la cuenta
    if (req.userInstitution && accountId !== req.userInstitution._id.toString()) {
      return res.status(403).json({ success: false, message: 'No tienes acceso a esta cuenta' });
    }

    // Construir filtros
    let filters = { account: accountId };
    
    if (divisionId) {
      filters.division = divisionId;
    }

    // Filtros de fecha
    if (fecha) {
      const startDate = new Date(fecha);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(fecha);
      endDate.setHours(23, 59, 59, 999);
      filters.fechaAccion = { $gte: startDate, $lte: endDate };
    } else if (fechaInicio && fechaFin) {
      filters.fechaAccion = { 
        $gte: new Date(fechaInicio), 
        $lte: new Date(fechaFin) 
      };
    }

    // Buscar las acciones
    const actions = await StudentActionLog.find(filters)
    .populate('estudiante', 'nombre apellido avatar')
    .populate('accion', 'nombre descripcion color categoria icono')
    .populate('registradoPor', 'name email')
    .populate('division', 'nombre descripcion')
    .sort({ fechaAccion: -1 });

    console.log('✅ [STUDENT ACTION LOG] Acciones obtenidas:', actions.length);

    res.json({
      success: true,
      message: 'Acciones obtenidas exitosamente',
      data: actions
    });

  } catch (error) {
    console.error('❌ [STUDENT ACTION LOG] Error obteniendo acciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// Endpoint temporal para crear estudiante de prueba
app.post('/api/admin/create-test-student', authenticateToken, async (req, res) => {
  try {
    console.log('🔧 [ADMIN] Creando estudiante de prueba...');
    
    // Crear estudiante de prueba
    const testStudent = new Student({
      nombre: 'Juan',
      apellido: 'Pérez',
      email: 'juan.perez@test.com',
      division: '68dc5fa9626391464e2bcbd6', // SALA VERDE
      account: '68dc5f1a626391464e2bcb3c', // BAMBINO
      activo: true,
      creadoPor: req.user._id
    });
    
    await testStudent.save();
    
    console.log('✅ [ADMIN] Estudiante de prueba creado:', testStudent._id);
    
    res.json({
      success: true,
      message: 'Estudiante de prueba creado exitosamente',
      data: {
        studentId: testStudent._id,
        nombre: testStudent.nombre,
        apellido: testStudent.apellido
      }
    });
    
  } catch (error) {
    console.error('❌ [ADMIN] Error creando estudiante de prueba:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// Endpoint temporal para asignar cuenta al usuario adminaccount
app.post('/api/admin/assign-account', authenticateToken, async (req, res) => {
  try {
    console.log('🔧 [ADMIN] Asignando cuenta al usuario adminaccount...');
    
    const user = await User.findOne({ email: 'matilanzaco@gmail.com' });
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    
    console.log('👤 [ADMIN] Usuario encontrado:', user.email);
    console.log('👤 [ADMIN] Cuenta actual:', user.account);
    
    // Asignar la cuenta BAMBINO
    const accountId = '68dc5f1a626391464e2bcb3c';
    user.account = accountId;
    
    await user.save();
    
    console.log('✅ [ADMIN] Cuenta asignada exitosamente');
    console.log('✅ [ADMIN] Nueva cuenta:', user.account);
    
    res.json({
      success: true,
      message: 'Cuenta asignada exitosamente',
      data: {
        userId: user._id,
        email: user.email,
        account: user.account
      }
    });
    
  } catch (error) {
    console.error('❌ [ADMIN] Error asignando cuenta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// ============================================
// ENDPOINTS DE FORMULARIOS (FORM REQUESTS)
// ============================================
// NOTA: Las rutas de formularios fueron movidas a routes/formRequests.routes.js
// Las rutas están registradas arriba con: app.use('/', formRequestsRoutes);
// Todas las rutas antiguas han sido eliminadas completamente.

// Middleware para rutas no encontradas (debe ir al final)
app.use('/*', (req, res) => {
  console.log(`❌ [404] Ruta no encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: 'Endpoint no encontrado'
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API de Kiki corriendo en puerto ${PORT}`);
  console.log(`📡 Health check disponible en http://localhost:${PORT}/health`);
  console.log(`📖 Documentación disponible en http://localhost:${PORT}/api`);
  console.log(`🌐 API accesible desde la red local en http://0.0.0.0:${PORT}`);
  
  // Iniciar worker de emails si está configurado
  if (process.env.SQS_EMAIL_QUEUE_URL) {
    console.log(`📧 Iniciando worker de emails...`);
    const { startWorker } = require('./workers/emailWorker');
    startWorker().catch(error => {
      console.error('❌ Error iniciando worker de emails:', error);
    });
  } else {
    console.log(`⚠️  Worker de emails no iniciado: SQS_EMAIL_QUEUE_URL no está configurada`);
  }

  // Iniciar worker de push notifications si está configurado
  if (process.env.SQS_PUSH_QUEUE_URL) {
    console.log(`🔔 Iniciando worker de push notifications...`);
    const { startPushWorker } = require('./workers/pushWorker');
    startPushWorker().catch(error => {
      console.error('❌ Error iniciando worker de push notifications:', error);
    });
  } else {
    console.log(`⚠️  Worker de push notifications no iniciado: SQS_PUSH_QUEUE_URL no está configurada`);
  }
});

// Configurar timeouts extendidos para uploads de archivos grandes
// Timeout para mantener la conexión viva (10 minutos)
server.keepAliveTimeout = 600000; // 10 minutos
// Timeout para headers (debe ser mayor que keepAliveTimeout)
server.headersTimeout = 610000; // 10 minutos + 10 segundos

module.exports = app;

