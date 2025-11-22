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
const { sendPasswordResetEmail, sendWelcomeEmail, sendInstitutionWelcomeEmail, sendFamilyInvitationEmail, sendFamilyInvitationNotificationEmail, sendNotificationEmail, generateRandomPassword, sendEmailAsync } = require('./config/email.config');
const emailService = require('./services/emailService');
const formRequestService = require('./services/formRequestService');

// Importar middleware de autenticación REAL con Cognito
const { authenticateToken, requireRole, requireAdmin, requireSuperAdmin, setUserInstitution } = require('./middleware/mongoAuth');

// Importar rate limiting
const { 
  loginRateLimit, 
  registerRateLimit, 
  passwordChangeRateLimit, 
  generalRateLimit, 
  sensitiveRateLimit 
} = require('./middleware/rateLimiter');

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

// Middleware de seguridad
app.use(helmet());

// Rate limiting general
app.use(generalRateLimit);

// CORS - Configurado para permitir conexiones desde apps móviles
app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin (como apps móviles)
    if (!origin) return callback(null, true);
    
    // Permitir localhost, IPs locales y dominios de producción
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:8080',
      'http://localhost:8081',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:8081',
      'https://backoffice.kiki.com.ar',
      'http://backoffice.kiki.com.ar',
      process.env.FRONTEND_URL
    ].filter(Boolean);
    
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
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
      !req.path.match(/^\/api\/accounts\/[^\/]+\/(config|admin-users)$/)) {
    // Remover el /api duplicado del inicio, excepto para student-actions, test-actions, debug, documents, events/export, form-requests, accounts config y accounts admin-users
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

// Login con rate limiting y monitoreo
app.post('/users/login', loginRateLimit, async (req, res) => {
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
    const isPasswordValid = await bcrypt.compare(password, user.password);
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

// Endpoint para revocar refresh token (logout)
app.post('/auth/revoke', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    console.log('🔒 [REVOKE] Revocando refresh token...');
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token es requerido'
      });
    }
    
    const revoked = await RefreshTokenService.revokeRefreshToken(refreshToken);
    
    if (revoked) {
      console.log('✅ [REVOKE] Refresh token revocado exitosamente');
      return res.json({
        success: true,
        message: 'Sesión cerrada exitosamente'
      });
    } else {
      console.log('⚠️ [REVOKE] Refresh token no encontrado');
      return res.status(404).json({
        success: false,
        message: 'Refresh token no encontrado'
      });
    }
    
  } catch (error) {
    console.error('❌ [REVOKE] Error revocando token:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ===== RUTAS DE AUTENTICACIÓN =====
// NOTA: Las rutas de autenticación han sido movidas a routes/auth.routes.js
// Las rutas están registradas arriba con: app.use('/', authRoutes);

// Crear usuario desde backoffice - DESACTIVADO
app.post('/users', /* authenticateToken, */ async (req, res) => {
  try {
    console.log('👤 [CREATE USER] Intento de creación de usuario desde backoffice - DESACTIVADO');
    
    return res.status(403).json({
      success: false,
      message: 'La creación de usuarios desde el backoffice está desactivada. Los usuarios se crean mediante carga de Excel o desde la app móvil.'
    });
    
    // Código desactivado - Los usuarios se crean por Excel o app móvil
    /*
    const { name, email, role, status, avatar } = req.body;
    const { userId } = req.user;

    if (!name || !email || !role) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, email y rol son requeridos'
      });
    }

    // Verificar que el usuario que crea es admin
    const currentUser = await User.findById(userId).populate('role');
    if (!currentUser || !['superadmin', 'adminaccount'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'Solo administradores pueden crear usuarios'
      });
    }

    // Verificar que el email no exista
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un usuario con este email'
      });
    }

    // Buscar el rol
    const roleDoc = await Role.findOne({ nombre: role });
    if (!roleDoc) {
      return res.status(400).json({
        success: false,
        message: 'Rol no válido'
      });
    }

    // Generar contraseña aleatoria
    const generateRandomPassword = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let password = '';
      for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return password;
    };

    const randomPassword = generateRandomPassword();
    console.log('🔑 [CREATE USER] Contraseña generada para:', email);

    // Crear el usuario
    const newUser = new User({
      name: name,
      email: email.toLowerCase(),
      password: randomPassword,
      role: roleDoc._id,
      status: status === 'active' ? 'approved' : 'pending',
      activo: status === 'active',
      isFirstLogin: true // Marcar como primer login
    });

    await newUser.save();
    console.log('✅ [CREATE USER] Usuario creado exitosamente:', newUser._id);

    // Enviar email de bienvenida con la contraseña (asíncrono)
    sendEmailAsync(sendWelcomeEmail, null, newUser.email, newUser.name);
    console.log('📧 [CREATE USER] Email de bienvenida programado para envío asíncrono a:', email);

    // Populate para la respuesta
    const populatedUser = await User.findById(newUser._id)
      .populate('role', 'nombre descripcion nivel');

    res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente. Se enviará un email con la contraseña.',
      data: {
        user: {
          _id: populatedUser._id,
          name: populatedUser.name,
          email: populatedUser.email,
          role: populatedUser.role,
          status: populatedUser.status,
          activo: populatedUser.activo,
          createdAt: populatedUser.createdAt,
          updatedAt: populatedUser.updatedAt
        },
        password: randomPassword // Temporalmente incluir la contraseña en la respuesta para testing
      }
    });
    */
    
  } catch (error) {
    console.error('❌ [CREATE USER] Error interno:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Registro - DESACTIVADO con rate limiting
app.post('/users/register', registerRateLimit, async (req, res) => {
  try {
    console.log('👤 [REGISTER] Intento de registro general - DESACTIVADO');
    
    return res.status(403).json({
      success: false,
      message: 'El registro general está desactivado. Los usuarios se crean mediante carga de Excel o desde la app móvil.'
    });
    
    // Código desactivado - Los usuarios se crean por Excel o app móvil
    /*
    const { email, password, nombre } = req.body;

    if (!email || !password || !nombre) {
      return res.status(400).json({
        success: false,
        message: 'Email, contraseña y nombre son requeridos'
      });
    }

    // Simular registro exitoso para pruebas
    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      data: {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
        user: {
          _id: '64f8a1b2c3d4e5f6a7b8c9d0',
          email: email,
          nombre: nombre,
          role: {
            _id: '64f8a1b2c3d4e5f6a7b8c9d1',
            nombre: 'familyviewer',
            descripcion: 'Visualizador de familia',
            nivel: 5
          },
          activo: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
    });
    */
    
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Verificar token
app.get('/auth/verify', /* authenticateToken, */ async (req, res) => {
  try {
    // Buscar el usuario completo para obtener el avatar
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Generar URL firmada para el avatar si existe
    let avatarUrl = null;
    if (user.avatar) {
      try {
        avatarUrl = await generateSignedUrl(user.avatar, 172800); // 2 días
      } catch (error) {
        console.error('Error generando URL firmada para avatar:', error);
        // Si falla la URL firmada, usar la URL directa
        avatarUrl = user.avatar;
      }
    }

    res.json({
      success: true,
      message: 'Token válido',
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: avatarUrl,
        status: user.status,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Error verificando token:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ===== ENDPOINT DE LOGIN CON COGNITO =====

// Endpoint de login para backoffice - Usa MongoDB (mismo que /users/login)
app.post('/auth/cognito-login', loginRateLimit, async (req, res) => {
  try {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');

    console.log('🔍 [BACKOFFICE LOGIN] Intentando login para backoffice:', email);

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
    const isPasswordValid = await bcrypt.compare(password, user.password);
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

    // Generar URL firmada para el avatar del usuario
    let avatarUrl = null;
    if (user.avatar) {
      try {
        const { generateSignedUrl } = require('./config/s3.config');
        avatarUrl = await generateSignedUrl(user.avatar);
        console.log('🖼️ [BACKOFFICE LOGIN] Avatar URL generada:', avatarUrl);
      } catch (avatarError) {
        console.error('❌ [BACKOFFICE LOGIN] Error generando avatar URL:', avatarError);
        console.log('🖼️ [BACKOFFICE LOGIN] Usando avatar original');
      }
    }
    
    // Crear objeto usuario con avatar procesado
    const userWithProcessedAvatar = {
      ...user.toObject(),
      avatar: avatarUrl || user.avatar
    };
    
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
    console.log('🔍 [BACKOFFICE LOGIN] ===== PROCESANDO AVATARES DE ESTUDIANTES =====');
    console.log('🔍 [BACKOFFICE LOGIN] Total de asociaciones:', associations.length);
    
    const associationsWithProcessedAvatars = await Promise.all(associations.map(async (association, index) => {
      // Si es una asociación virtual (sin estudiante), retornar tal cual
      if (association.isVirtual || !association.student) {
        return association;
      }
      
      // Convertir a objeto plano para poder modificar propiedades
      const associationObj = association.toObject ? association.toObject() : association;
      
      if (associationObj.student && associationObj.student.avatar) {
        try {
          console.log(`🔍 [BACKOFFICE LOGIN] Procesando avatar ${index + 1}/${associations.length} - Estudiante:`, associationObj.student._id);
          console.log('🔍 [BACKOFFICE LOGIN] Avatar original:', associationObj.student.avatar);
          
          const originalAvatar = associationObj.student.avatar;
          let processedAvatar = originalAvatar;
          
          // Verificar si es una key de S3 o una URL local
          if (originalAvatar.startsWith('http')) {
            console.log('🔍 [BACKOFFICE LOGIN] Es una URL completa, usando tal como está');
            // Es una URL completa (puede ser local o S3), no hacer nada
          } else if (originalAvatar.includes('students/')) {
            // Es una key de S3 para estudiantes, generar URL firmada
            console.log('🔍 [BACKOFFICE LOGIN] Es una key de S3 para estudiantes, generando URL firmada');
            console.log('🔍 [BACKOFFICE LOGIN] Key original:', originalAvatar);
            
            try {
              const { generateSignedUrl } = require('./config/s3.config');
              console.log('🔍 [BACKOFFICE LOGIN] Función generateSignedUrl importada correctamente');
              
              const signedUrl = await generateSignedUrl(originalAvatar, 172800); // 2 días
              console.log('🔍 [BACKOFFICE LOGIN] URL firmada generada exitosamente:', signedUrl);
              console.log('🔍 [BACKOFFICE LOGIN] Tipo de URL firmada:', typeof signedUrl);
              console.log('🔍 [BACKOFFICE LOGIN] Longitud de URL firmada:', signedUrl ? signedUrl.length : 'null');
              
              processedAvatar = signedUrl || originalAvatar; // Fallback si signedUrl es null
              console.log('🔍 [BACKOFFICE LOGIN] Avatar procesado:', processedAvatar);
            } catch (s3Error) {
              console.error('❌ [BACKOFFICE LOGIN] Error generando URL firmada:', s3Error);
              console.error('❌ [BACKOFFICE LOGIN] Error details:', {
                message: s3Error.message,
                stack: s3Error.stack,
                name: s3Error.name
              });
              // Mantener la key original si falla
              console.log('🔍 [BACKOFFICE LOGIN] Manteniendo key original:', originalAvatar);
              processedAvatar = originalAvatar;
            }
          } else {
            // Es una key local, generar URL local
            const localUrl = `${req.protocol}://${req.get('host')}/uploads/${originalAvatar.split('/').pop()}`;
            console.log('🔍 [BACKOFFICE LOGIN] URL local generada:', localUrl);
            processedAvatar = localUrl;
          }
          
          // Asignar el avatar procesado
          associationObj.student.avatar = processedAvatar;
          console.log('✅ [BACKOFFICE LOGIN] Avatar procesado asignado:', associationObj.student.avatar);
        } catch (error) {
          console.error('❌ [BACKOFFICE LOGIN] Error procesando avatar del estudiante:', associationObj.student?._id, error);
          // Si falla, usar URL directa
          if (associationObj.student && associationObj.student.avatar) {
            const fallbackUrl = `${req.protocol}://${req.get('host')}/uploads/${associationObj.student.avatar.split('/').pop()}`;
            console.log('🔍 [BACKOFFICE LOGIN] Usando URL de fallback:', fallbackUrl);
            associationObj.student.avatar = fallbackUrl;
          }
        }
      } else {
        console.log('🔍 [BACKOFFICE LOGIN] Estudiante sin avatar:', associationObj.student?._id);
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
    
    console.log('🔑 [BACKOFFICE LOGIN] Access token generado (5m)');
    console.log('🔄 [BACKOFFICE LOGIN] Refresh token generado (7d)');
    
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
        associationsCount: associationsWithProcessedAvatars.length,
        source: 'backoffice'
      }
    });
    
    return res.json({
      success: true,
      message: 'Login exitoso para backoffice',
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
    console.error('❌ Error en login de backoffice:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para verificar configuración JWT (solo para debugging)
app.get('/auth/config', (req, res) => {
  res.json({
    success: true,
    jwt_secret_length: config.JWT_SECRET.length,
    jwt_expire: config.JWT_EXPIRE,
    message: 'Configuración JWT actual'
  });
});

// Obtener perfil - Versión simplificada para Cognito
app.get('/users/profile', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const user = req.user;
    
    // Si es usuario de Cognito, buscar información en MongoDB si es adminaccount
    if (user.isCognitoUser) {
      console.log('✅ [PROFILE] Usuario de Cognito:', user.email);
      
      let userAccount = null;
      
      // Para adminaccount, buscar en la tabla users de MongoDB usando el email
      if (user.role?.nombre === 'adminaccount') {
        console.log('🔍 [PROFILE] Adminaccount de Cognito, buscando en tabla users...');
        
        try {
          // Buscar el usuario en MongoDB usando el email
          const dbUser = await User.findOne({ email: user.email })
            .populate('account', 'nombre razonSocial')
            .populate('role', 'nombre descripcion');
          
          if (dbUser && dbUser.account) {
            userAccount = dbUser.account;
            console.log('✅ [PROFILE] Usuario encontrado en MongoDB con institución:', dbUser.account.nombre);
          } else {
            console.log('⚠️ [PROFILE] Usuario no encontrado en MongoDB o sin institución asignada');
          }
        } catch (error) {
          console.error('❌ [PROFILE] Error buscando usuario en MongoDB:', error);
        }
      }
      
      return res.json({
        success: true,
        data: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          source: 'cognito',
          account: userAccount, // Incluir información de la institución desde MongoDB
          avatar: null // Los usuarios de Cognito no tienen avatar por ahora
        }
      });
    }

    // Código original para usuarios de MongoDB (legacy)
    // Buscar el usuario completo con el rol y cuenta populados
    const dbUser = await User.findById(req.user._id).populate('role', 'nombre descripcion nivel').populate('account', 'nombre razonSocial');
    if (!dbUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Para adminaccount, obtener la cuenta desde las asociaciones si no tiene cuenta asignada directamente
    let userAccount = dbUser.account;
    if (dbUser.role?.nombre === 'adminaccount' && !userAccount) {
      console.log('🔍 [PROFILE] Adminaccount sin cuenta directa, obteniendo desde asociaciones...');
      const userAssociation = await Shared.findOne({
        user: dbUser._id,
        status: 'active'
      }).populate('account', 'nombre razonSocial');
      
      if (userAssociation && userAssociation.account) {
        userAccount = userAssociation.account;
        console.log('🔍 [PROFILE] Cuenta obtenida desde asociación:', userAccount);
      }
    }

    // Generar URL firmada para el avatar si existe
    let avatarUrl = null;
    if (dbUser.avatar) {
      try {
        avatarUrl = await generateSignedUrl(dbUser.avatar, 172800); // 2 días
      } catch (error) {
        console.error('Error generando URL firmada para avatar:', error);
        // Si falla la URL firmada, usar la URL directa
        avatarUrl = dbUser.avatar;
      }
    }

    res.json({
      success: true,
      data: {
        _id: dbUser._id,
        email: dbUser.email,
        nombre: dbUser.name,
        role: dbUser.role,
        account: userAccount,
        telefono: dbUser.telefono,
        avatar: avatarUrl,
        activo: dbUser.status === 'approved',
        createdAt: dbUser.createdAt,
        updatedAt: dbUser.updatedAt
      }
    });

  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Actualizar perfil
app.put('/users/profile', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { name, email, phone, telefono } = req.body;
    const userId = req.user._id;

    console.log('🔍 [Server] Actualizando perfil para usuario:', userId);
    console.log('📝 Datos recibidos:', { name, email, phone, telefono });

    // Buscar el usuario
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    console.log('🔍 Usuario encontrado antes de actualizar:', {
      _id: user._id,
      email: user.email,
      name: user.name,
      telefono: user.telefono,
      status: user.status
    });

    // Verificar si el email ya existe (si se está cambiando)
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'El email ya está en uso'
        });
      }
    }

    // Actualizar campos
    if (name) user.name = name;
    if (email) user.email = email;
    
    // Manejar tanto 'phone' como 'telefono' para compatibilidad
    if (phone) user.telefono = phone;
    if (telefono) user.telefono = telefono;

    await user.save();

    console.log('✅ Perfil actualizado exitosamente');
    console.log('📝 Usuario después de guardar:', {
      _id: user._id,
      email: user.email,
      name: user.name,
      telefono: user.telefono,
      status: user.status
    });

    // Generar URL firmada para el avatar si existe
    let avatarUrl = null;
    if (user.avatar) {
      try {
        avatarUrl = await generateSignedUrl(user.avatar, 172800); // 2 días
      } catch (error) {
        console.error('Error generando URL firmada para avatar:', error);
        // Si falla la URL firmada, usar la URL directa
        avatarUrl = user.avatar;
      }
    }

    res.json({
      success: true,
      message: 'Perfil actualizado exitosamente',
      data: {
        _id: user._id,
        email: user.email,
        nombre: user.name,
        role: user.role,
        telefono: user.telefono,
        avatar: avatarUrl,
        activo: user.status === 'approved',
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Actualizar avatar del usuario
app.put('/users/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  console.log('🖼️ [AVATAR ENDPOINT] Petición recibida');
  console.log('🖼️ [AVATAR ENDPOINT] Headers:', req.headers);
  console.log('🖼️ [AVATAR ENDPOINT] Body:', req.body);
  console.log('🖼️ [AVATAR ENDPOINT] File:', req.file);
  try {
    const userId = req.user._id;

    console.log('🖼️ [UPDATE AVATAR] Iniciando actualización de avatar');
    console.log('👤 [UPDATE AVATAR] Usuario:', userId);
    console.log('📁 [UPDATE AVATAR] Archivo recibido:', req.file);

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó ninguna imagen'
      });
    }

    // El archivo se guardó localmente, ahora lo subimos a S3
    console.log('🖼️ [UPDATE AVATAR] Archivo guardado localmente:', req.file.filename);
    console.log('🖼️ [UPDATE AVATAR] Subiendo a S3...');
    
    // Leer el archivo local
    const fileBuffer = fs.readFileSync(req.file.path);
    
    // Subir a S3
    const AWS = require('aws-sdk');
    const s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1'
    });
    
    const avatarKey = `avatars/${userId}/${Date.now()}-${req.file.originalname}`;
    
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: avatarKey,
      Body: fileBuffer,
      ContentType: req.file.mimetype
    };
    
    const s3Result = await s3.upload(uploadParams).promise();
    console.log('🖼️ [UPDATE AVATAR] Archivo subido a S3:', s3Result.Location);
    
    // Eliminar archivo local
    try {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
        console.log('🖼️ [UPDATE AVATAR] Archivo local eliminado:', req.file.path);
      } else {
        console.log('🖼️ [UPDATE AVATAR] Archivo local no existe:', req.file.path);
      }
    } catch (error) {
      console.error('🖼️ [UPDATE AVATAR] Error eliminando archivo local:', error.message);
    }

    // Actualizar el usuario con la nueva imagen
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        avatar: avatarKey, // Guardar la key de S3 (no la URL completa)
        updatedAt: new Date()
      },
      { new: true }
    ).populate('role');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    console.log('✅ [UPDATE AVATAR] Avatar actualizado exitosamente');

    // Generar URL firmada para la respuesta
    const { generateSignedUrl } = require('./config/s3.config');
    const signedUrl = await generateSignedUrl(avatarKey, 172800); // 2 días
    
    console.log('🖼️ [UPDATE AVATAR] URL firmada generada:', signedUrl);

    res.json({
      success: true,
      message: 'Avatar actualizado exitosamente',
      data: {
        user: {
          _id: updatedUser._id,
          name: updatedUser.name,
          email: updatedUser.email,
          avatar: signedUrl, // Devolver la URL firmada
          role: updatedUser.role
        }
      }
    });

  } catch (error) {
    console.error('Error actualizando avatar:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Actualizar avatar del estudiante (solo familyadmin)
app.put('/students/:studentId/avatar', authenticateToken, uploadStudentAvatarToS3.single('avatar'), async (req, res) => {
  console.log('🖼️ [STUDENT AVATAR ENDPOINT] Petición recibida');
  console.log('🖼️ [STUDENT AVATAR ENDPOINT] Student ID:', req.params.studentId);
  console.log('🖼️ [STUDENT AVATAR ENDPOINT] File:', req.file);
  
  try {
    const { studentId } = req.params;
    const userId = req.user._id;

    console.log('🖼️ [UPDATE STUDENT AVATAR] Iniciando actualización de avatar del estudiante');
    console.log('👤 [UPDATE STUDENT AVATAR] Usuario:', userId);
    console.log('🎓 [UPDATE STUDENT AVATAR] Estudiante:', studentId);
    console.log('📁 [UPDATE STUDENT AVATAR] Archivo recibido:', req.file);

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó ninguna imagen'
      });
    }

    // Verificar que el usuario es familyadmin y tiene acceso al estudiante
    const userAssociation = await Shared.findOne({
      user: userId,
      student: studentId,
      status: 'active'
    }).populate('role');

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar este estudiante'
      });
    }

    if (userAssociation.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los familyadmin pueden actualizar avatares de estudiantes'
      });
    }

    // Buscar el estudiante
    const Student = require('./shared/models/Student');
    const student = await Student.findById(studentId);
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado'
      });
    }

    // El archivo se subió directamente a S3 usando multer-s3
    console.log('🖼️ [UPDATE STUDENT AVATAR] Archivo subido a S3 usando multer-s3');
    console.log('🖼️ [UPDATE STUDENT AVATAR] Archivo info:', {
      location: req.file.location,
      key: req.file.key,
      bucket: req.file.bucket
    });
    
    // Nota: Para estudiantes usamos multer-s3 directamente, pero podríamos procesar antes de subir
    // Por ahora mantenemos la funcionalidad actual
    const avatarKey = req.file.key;
    console.log('🖼️ [UPDATE STUDENT AVATAR] Key de S3 guardada:', avatarKey);

    // Actualizar el estudiante con la nueva imagen
    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      { 
        avatar: avatarKey, // Guardar la key de S3 (no la URL completa)
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!updatedStudent) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado'
      });
    }

    console.log('✅ [UPDATE STUDENT AVATAR] Avatar del estudiante actualizado exitosamente');

    // Generar URL firmada para la respuesta
    const { generateSignedUrl } = require('./config/s3.config');
    const signedUrl = await generateSignedUrl(avatarKey, 172800); // 2 días
    
    console.log('🖼️ [UPDATE STUDENT AVATAR] URL firmada generada:', signedUrl);

    res.json({
      success: true,
      message: 'Avatar del estudiante actualizado exitosamente',
      data: {
        student: {
          _id: updatedStudent._id,
          nombre: updatedStudent.nombre,
          apellido: updatedStudent.apellido,
          avatar: signedUrl // Devolver la URL firmada
        }
      }
    });

  } catch (error) {
    console.error('Error actualizando avatar del estudiante:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint de prueba para verificar configuración de S3 para avatares de estudiantes
app.get('/test-student-avatar-s3', async (req, res) => {
  try {
    console.log('🧪 [TEST STUDENT AVATAR S3] Probando configuración...');
    
    // Verificar configuración
    const config = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ? 'Configurado' : 'No configurado',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ? 'Configurado' : 'No configurado',
      region: process.env.AWS_REGION || 'us-east-1',
      bucketName: process.env.AWS_S3_BUCKET_NAME || 'No configurado'
    };
    
    console.log('🧪 [TEST STUDENT AVATAR S3] Configuración:', config);
    
    // Intentar generar una URL firmada de prueba para estudiantes
    const testKey = 'students/test/avatar-test.jpg';
    const { s3 } = require('./config/s3.config');
    
    // Verificar que el bucket existe
    try {
      await s3.headBucket({ Bucket: process.env.AWS_S3_BUCKET_NAME }).promise();
      console.log('✅ [TEST STUDENT AVATAR S3] Bucket existe y es accesible');
    } catch (bucketError) {
      console.error('❌ [TEST STUDENT AVATAR S3] Error accediendo al bucket:', bucketError);
    }
    
    res.json({
      success: true,
      message: 'Configuración de S3 para avatares de estudiantes verificada',
      data: {
        config,
        testKey
      }
    });
  } catch (error) {
    console.error('❌ [TEST STUDENT AVATAR S3] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error en configuración de S3 para avatares de estudiantes',
      error: error.message
    });
  }
});

// ===== RUTAS DE USUARIOS =====

// Endpoint de prueba para S3
app.get('/test-s3', async (req, res) => {
  try {
    console.log('🧪 [TEST S3] Probando configuración de S3...');
    console.log('🧪 [TEST S3] Configuración:', {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ? 'Configurado' : 'No configurado',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ? 'Configurado' : 'No configurado',
      region: process.env.AWS_REGION || 'us-east-1',
      bucketName: process.env.AWS_S3_BUCKET_NAME || 'No configurado'
    });
    
    // Intentar generar una URL firmada de prueba
    const testKey = 'test/avatar-test.jpg';
    const testUrl = generateSignedUrl(testKey, 3600);
    
    res.json({
      success: true,
      message: 'Configuración de S3 verificada',
      data: {
        config: {
          accessKeyId: !!process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: !!process.env.AWS_SECRET_ACCESS_KEY,
          region: process.env.AWS_REGION || 'us-east-1',
          bucketName: process.env.AWS_S3_BUCKET_NAME || null
        },
        testUrl: testUrl,
        testKey: testKey
      }
    });
  } catch (error) {
    console.error('❌ [TEST S3] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error en configuración de S3',
      error: error.message
    });
  }
});

// Aprobar asociación pendiente
app.put('/users/approve-association/:associationId', authenticateToken, async (req, res) => {
  try {
    const { associationId } = req.params;
    const currentUser = req.user;

    // Verificar que el usuario actual es adminaccount o superadmin
    if (!['adminaccount', 'superadmin'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para aprobar asociaciones'
      });
    }

    // Buscar la asociación
    const association = await Shared.findById(associationId)
      .populate('user', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('role', 'nombre');

    if (!association) {
      return res.status(404).json({
        success: false,
        message: 'Asociación no encontrada'
      });
    }

    // Verificar que la asociación esté pendiente
    if (association.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'La asociación ya no está pendiente de aprobación'
      });
    }

    // Verificar permisos: adminaccount solo puede aprobar asociaciones de su cuenta
    if (currentUser.role?.nombre === 'adminaccount') {
      console.log('🔍 Verificando permisos para aprobar asociación...');
      console.log('👤 Usuario ID:', currentUser._id);
      console.log('🏢 Cuenta de la asociación:', association.account._id);
      
      const userAssociations = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      });
      
      console.log('📋 Asociaciones del usuario encontradas:', userAssociations.length);
      
      const userAccountIds = userAssociations.map(a => a.account.toString());
      console.log('🏢 IDs de cuentas del usuario:', userAccountIds);
      
      if (!userAccountIds.includes(association.account._id.toString())) {
        console.log('❌ Permiso denegado: La cuenta no pertenece al usuario');
        return res.status(403).json({
          success: false,
          message: 'Solo puedes aprobar asociaciones de tu cuenta'
        });
      }
      
      console.log('✅ Permiso concedido: La cuenta pertenece al usuario');
    }

    // Aprobar la asociación
    association.status = 'active';
    await association.save();

    console.log(`✅ Asociación aprobada: ${association.user.name} en ${association.account.nombre}`);

    res.json({
      success: true,
      message: 'Asociación aprobada exitosamente',
      data: {
        _id: association._id,
        user: {
          _id: association.user._id,
          name: association.user.name,
          email: association.user.email
        },
        account: {
          _id: association.account._id,
          nombre: association.account.nombre,
          razonSocial: association.account.razonSocial
        },
        role: {
          _id: association.role._id,
          nombre: association.role.nombre
        },
        status: association.status,
        updatedAt: association.updatedAt
      }
    });

  } catch (error) {
    console.error('Error aprobando asociación:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Rechazar asociación pendiente
app.put('/users/reject-association/:associationId', authenticateToken, async (req, res) => {
  try {
    const { associationId } = req.params;
    const currentUser = req.user;

    // Verificar que el usuario actual es adminaccount o superadmin
    if (!['adminaccount', 'superadmin'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para rechazar asociaciones'
      });
    }

    // Buscar la asociación
    const association = await Shared.findById(associationId)
      .populate('user', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('role', 'nombre');

    if (!association) {
      return res.status(404).json({
        success: false,
        message: 'Asociación no encontrada'
      });
    }

    // Verificar que la asociación esté pendiente
    if (association.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'La asociación ya no está pendiente de aprobación'
      });
    }

    // Verificar permisos: adminaccount solo puede rechazar asociaciones de su cuenta
    if (currentUser.role?.nombre === 'adminaccount') {
      console.log('🔍 Verificando permisos para rechazar asociación...');
      console.log('👤 Usuario ID:', currentUser._id);
      console.log('🏢 Cuenta de la asociación:', association.account._id);
      
      const userAssociations = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      });
      
      console.log('📋 Asociaciones del usuario encontradas:', userAssociations.length);
      
      const userAccountIds = userAssociations.map(a => a.account.toString());
      console.log('🏢 IDs de cuentas del usuario:', userAccountIds);
      
      if (!userAccountIds.includes(association.account._id.toString())) {
        console.log('❌ Permiso denegado: La cuenta no pertenece al usuario');
        return res.status(403).json({
          success: false,
          message: 'Solo puedes rechazar asociaciones de tu cuenta'
        });
      }
      
      console.log('✅ Permiso concedido: La cuenta pertenece al usuario');
    }

    // Rechazar la asociación (cambiar a inactive)
    association.status = 'inactive';
    await association.save();

    console.log(`❌ Asociación rechazada: ${association.user.name} en ${association.account.nombre}`);

    res.json({
      success: true,
      message: 'Asociación rechazada exitosamente',
      data: {
        _id: association._id,
        user: {
          _id: association.user._id,
          name: association.user.name,
          email: association.user.email
        },
        account: {
          _id: association.account._id,
          nombre: association.account.nombre,
          razonSocial: association.account.razonSocial
        },
        role: {
          _id: association.role._id,
          nombre: association.role.nombre
        },
        status: association.status,
        updatedAt: association.updatedAt
      }
    });

  } catch (error) {
    console.error('Error rechazando asociación:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Obtener asociaciones pendientes
app.get('/users/pending-associations', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const currentUser = req.user;

    // Verificar que el usuario actual es adminaccount o superadmin
    if (!['adminaccount', 'superadmin'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver asociaciones pendientes'
      });
    }

    let query = { status: 'pending' };

    // Si es adminaccount, solo mostrar asociaciones de su cuenta
    if (currentUser.role?.nombre === 'adminaccount') {
      console.log('🔍 Adminaccount buscando asociaciones pendientes...');
      console.log('👤 Usuario ID:', currentUser._id);
      
      // Usar el middleware global para obtener la institución
      if (req.userInstitution) {
        console.log('🏢 Institución del usuario:', req.userInstitution.nombre, req.userInstitution._id);
        
        // Filtrar asociaciones pendientes de esta cuenta
        query.account = req.userInstitution._id;
        console.log('👥 Filtrando asociaciones pendientes de la cuenta:', req.userInstitution._id);
      } else {
        console.log('⚠️ Usuario sin institución asignada');
        query.account = null; // No mostrar asociaciones
      }
      
      console.log('🔍 Query final para asociaciones pendientes:', JSON.stringify(query, null, 2));
    }

    const pendingAssociations = await Shared.find(query)
      .populate('user', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('role', 'nombre')
      .populate('division', 'nombre descripcion')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: pendingAssociations.map(association => ({
        _id: association._id,
        user: {
          _id: association.user._id,
          name: association.user.name,
          email: association.user.email
        },
        account: {
          _id: association.account._id,
          nombre: association.account.nombre,
          razonSocial: association.account.razonSocial
        },
        role: {
          _id: association.role._id,
          nombre: association.role.nombre
        },
        division: association.division ? {
          _id: association.division._id,
          nombre: association.division.nombre,
          descripcion: association.division.descripcion
        } : null,
        status: association.status,
        createdAt: association.createdAt,
        updatedAt: association.updatedAt
      }))
    });

  } catch (error) {
    console.error('Error obteniendo asociaciones pendientes:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Registro desde app mobile (solo familyview)
app.post('/users/register-mobile', async (req, res) => {
  try {
    console.log('🎯 [REGISTER MOBILE] Iniciando registro desde app móvil');
    console.log('📦 [REGISTER MOBILE] Body recibido:', JSON.stringify(req.body, null, 2));
    console.log('🔍 [REGISTER MOBILE] Campos disponibles:', Object.keys(req.body));
    
    const { 
      email, 
      password, 
      nombre, 
      apellido,
      telefono
    } = req.body;

    // Validaciones básicas
    console.log('🔍 [REGISTER MOBILE] Validando campos requeridos...');
    console.log('📋 [REGISTER MOBILE] Campos:', {
      email: !!email,
      password: !!password,
      nombre: !!nombre,
      apellido: !!apellido,
      telefono: !!telefono
    });
    console.log('📋 [REGISTER MOBILE] Campos requeridos:', {
      email: !!email,
      password: !!password,
      nombre: !!nombre
    });
    
    if (!email || !password || !nombre) {
      const missingFields = [];
      if (!email) missingFields.push('email');
      if (!password) missingFields.push('password');
      if (!nombre) missingFields.push('nombre');
      
      console.log('❌ [REGISTER MOBILE] Campos faltantes:', missingFields);
      
      return res.status(400).json({
        success: false,
        message: `Campos requeridos faltantes: ${missingFields.join(', ')}`
      });
    }

    // Buscar solicitudes pendientes para este email
    console.log('🔍 [REGISTER MOBILE] Buscando solicitudes pendientes para:', email);
    const pendingRequests = await RequestedShared.findPendingByEmail(email);
    console.log('📋 [REGISTER MOBILE] Solicitudes pendientes encontradas:', pendingRequests.length);

    // Buscar usuario existente por email
    let user = await User.findOne({ email });
    
    if (user) {
      console.log('👤 Usuario existente encontrado:', user.email);
      return res.status(400).json({
        success: false,
        message: 'El usuario ya existe en el sistema'
      });
    }

    console.log('🆕 Creando nuevo usuario familyviewer:', email);
    
    // Obtener el rol familyviewer
    const role = await Role.findOne({ nombre: 'familyviewer' });
    
    if (!role) {
      console.log('❌ [REGISTER MOBILE] Rol familyviewer no encontrado');
      return res.status(500).json({
        success: false,
        message: 'Rol familyviewer no encontrado en el sistema'
      });
    }

    // Crear nuevo usuario
    const fullName = apellido ? `${nombre} ${apellido}` : nombre;
    user = new User({
      name: fullName,
      email: email,
      password: password,
      role: role._id,
      status: 'approved',
      telefono: telefono || null
    });

    await user.save();
    console.log('✅ Usuario familyviewer creado exitosamente');



    // Procesar solicitudes pendientes si existen
    if (pendingRequests.length > 0) {
      console.log('🔍 [REGISTER] Procesando solicitudes pendientes:', pendingRequests.length);
      
      for (const request of pendingRequests) {
        try {
          // Crear la asociación solicitada
          const requestedShared = new Shared({
            user: user._id,
            account: request.account._id,
            division: request.division?._id,
            student: request.student?._id,
            role: request.role._id,
            status: 'active',
            createdBy: request.requestedBy
          });
          
          await requestedShared.save();
          
          // Verificar si el usuario ya tiene una asociación activa
          const existingActiveAssociation = await ActiveAssociation.getActiveAssociation(user._id);
          
          if (!existingActiveAssociation) {
            // Si no tiene asociación activa, establecer esta como activa automáticamente
            try {
              await ActiveAssociation.setActiveAssociation(user._id, requestedShared._id);
              console.log(`🎯 [AUTO-ACTIVE] Asociación automáticamente establecida como activa para usuario ${user._id}`);
            } catch (error) {
              console.error('❌ [AUTO-ACTIVE] Error estableciendo asociación activa automáticamente:', error);
            }
          } else {
            console.log(`ℹ️ [AUTO-ACTIVE] Usuario ${user._id} ya tiene una asociación activa, no se cambia automáticamente`);
          }
          
          // Marcar la solicitud como completada
          await RequestedShared.markAsCompleted(request._id, user._id);
          
          console.log('✅ [REGISTER] Asociación solicitada creada para:', request.account.nombre);
        } catch (error) {
          console.error('❌ [REGISTER] Error al procesar solicitud pendiente:', error);
        }
      }
    }

    // Generar URL firmada para el avatar si existe
    let avatarUrl = null;
    if (user.avatar) {
      try {
        avatarUrl = await generateSignedUrl(user.avatar, 172800); // 2 días
      } catch (error) {
        console.error('Error generando URL firmada para avatar:', error);
        // Si falla la URL firmada, usar la URL directa
        avatarUrl = user.avatar;
      }
    }

    res.status(201).json({
      success: true,
      message: pendingRequests.length > 0 
        ? 'Usuario registrado exitosamente y asociaciones creadas'
        : 'Usuario registrado exitosamente. No hay asociaciones pendientes.',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: avatarUrl,
          status: user.status
        },
        associationsCreated: pendingRequests.length
      }
    });

  } catch (error) {
    console.error('Error en registro mobile:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Listar usuarios
app.get('/users', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';

    // Filtrar según el rol del usuario
    const currentUser = req.user;
    console.log('🔍 [USERS] Usuario actual:', currentUser.email, 'Rol:', currentUser.role?.nombre);

    let users = [];
    let total = 0;

    // Si el usuario es superadmin, puede ver todos los usuarios
    if (currentUser.role?.nombre === 'superadmin') {
      console.log('👑 [USERS] Superadmin: mostrando todos los usuarios');
      
      // Construir query de búsqueda
      const query = {};
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      total = await User.countDocuments(query);
      const userDocs = await User.find(query)
        .populate('role')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 });

      users = userDocs.map(user => ({
        _id: user._id,
        email: user.email,
        nombre: user.name,
        role: user.role,
        activo: user.status === 'approved',
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }));
    } 
    // Si el usuario es adminaccount, buscar usuarios a través de Shared
    else if (currentUser.role?.nombre === 'adminaccount') {
      console.log('🏢 [USERS] Adminaccount: filtrando usuarios por cuenta usando Shared');
      console.log('👤 [USERS] Usuario actual ID:', currentUser._id);
      
      // Usar el middleware global para obtener la institución
      if (req.userInstitution) {
        console.log('🏢 [USERS] Institución del usuario:', req.userInstitution.nombre, req.userInstitution._id);
        
        // Buscar todas las asociaciones (Shared) de esta cuenta
        // Esto incluye todos los usuarios: adminaccount, familyadmin, familyviewer y coordinadores
        const sharedAssociations = await Shared.find({
          account: req.userInstitution._id,
          status: { $in: ['active', 'pending'] }
        })
        .populate('user')
        .populate('role')
        .sort({ createdAt: -1 });

        console.log('👥 [USERS] Asociaciones encontradas:', sharedAssociations.length);

        // Obtener usuarios únicos (un usuario puede tener múltiples asociaciones)
        const uniqueUsersMap = new Map();
        sharedAssociations.forEach(shared => {
          if (shared.user && !uniqueUsersMap.has(shared.user._id.toString())) {
            // Aplicar filtro de búsqueda si existe
            if (!search || 
                shared.user.name?.toLowerCase().includes(search.toLowerCase()) ||
                shared.user.email?.toLowerCase().includes(search.toLowerCase())) {
              uniqueUsersMap.set(shared.user._id.toString(), {
                _id: shared.user._id,
                email: shared.user.email,
                nombre: shared.user.name,
                role: shared.role, // Usar el rol de la asociación Shared
                activo: shared.user.status === 'approved',
                createdAt: shared.user.createdAt,
                updatedAt: shared.user.updatedAt
              });
            }
          }
        });

        // Convertir a array y aplicar paginación
        const allUsers = Array.from(uniqueUsersMap.values());
        total = allUsers.length;
        const startIndex = (page - 1) * limit;
        users = allUsers.slice(startIndex, startIndex + limit);

        console.log('👥 [USERS] Usuarios únicos encontrados:', total);
      } else {
        console.log('⚠️ [USERS] Usuario sin institución asignada');
        users = [];
        total = 0;
      }
    }
    // Para otros roles, no mostrar usuarios
    else {
      console.log('🚫 [USERS] Rol no autorizado:', currentUser.role?.nombre);
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver usuarios'
      });
    }

    res.json({
      success: true,
      data: {
        users,
        total,
        page,
        limit
      }
    });
  } catch (error) {
    console.error('Error listando usuarios:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint /api/users para compatibilidad con el backoffice
app.get('/api/users', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';

    // Filtrar según el rol del usuario
    const currentUser = req.user;
    console.log('🔍 [API/USERS] Usuario actual:', currentUser.email, 'Rol:', currentUser.role?.nombre);

    let users = [];
    let total = 0;

    // Si el usuario es superadmin, puede ver todos los usuarios
    if (currentUser.role?.nombre === 'superadmin') {
      console.log('👑 [API/USERS] Superadmin: mostrando todos los usuarios');
      
      // Construir query de búsqueda
      const query = {};
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      total = await User.countDocuments(query);
      const userDocs = await User.find(query)
        .populate('role')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 });

      users = userDocs.map(user => ({
        _id: user._id,
        email: user.email,
        nombre: user.name,
        role: user.role,
        activo: user.status === 'approved',
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }));
    } 
    // Si el usuario es adminaccount, buscar usuarios a través de Shared
    else if (currentUser.role?.nombre === 'adminaccount') {
      console.log('🏢 [API/USERS] Adminaccount: filtrando usuarios por cuenta usando Shared');
      console.log('👤 [API/USERS] Usuario actual ID:', currentUser._id);
      
      // Usar el middleware global para obtener la institución
      if (req.userInstitution) {
        console.log('🏢 [API/USERS] Institución del usuario:', req.userInstitution.nombre, req.userInstitution._id);
        
        // Buscar todas las asociaciones (Shared) de esta cuenta
        // Esto incluye todos los usuarios: adminaccount, familyadmin, familyviewer y coordinadores
        const sharedAssociations = await Shared.find({
          account: req.userInstitution._id,
          status: { $in: ['active', 'pending'] }
        })
        .populate('user')
        .populate('role')
        .sort({ createdAt: -1 });

        console.log('👥 [API/USERS] Asociaciones encontradas:', sharedAssociations.length);

        // Obtener usuarios únicos (un usuario puede tener múltiples asociaciones)
        const uniqueUsersMap = new Map();
        sharedAssociations.forEach(shared => {
          if (shared.user && !uniqueUsersMap.has(shared.user._id.toString())) {
            // Aplicar filtro de búsqueda si existe
            if (!search || 
                shared.user.name?.toLowerCase().includes(search.toLowerCase()) ||
                shared.user.email?.toLowerCase().includes(search.toLowerCase())) {
              uniqueUsersMap.set(shared.user._id.toString(), {
                _id: shared.user._id,
                email: shared.user.email,
                nombre: shared.user.name,
                role: shared.role, // Usar el rol de la asociación Shared
                activo: shared.user.status === 'approved',
                createdAt: shared.user.createdAt,
                updatedAt: shared.user.updatedAt
              });
            }
          }
        });

        // Convertir a array y aplicar paginación
        const allUsers = Array.from(uniqueUsersMap.values());
        total = allUsers.length;
        const startIndex = (page - 1) * limit;
        users = allUsers.slice(startIndex, startIndex + limit);

        console.log('👥 [API/USERS] Usuarios únicos encontrados:', total);
      } else {
        console.log('⚠️ [API/USERS] Usuario sin institución asignada');
        users = [];
        total = 0;
      }
    }
    // Para otros roles, no mostrar usuarios
    else {
      console.log('🚫 [API/USERS] Rol no autorizado:', currentUser.role?.nombre);
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver usuarios'
      });
    }

    // Calcular estadísticas totales (no solo de la página actual)
    let stats = {
      total: 0,
      active: 0,
      inactive: 0,
      coordinadores: 0,
      familiares: 0,
      tutores: 0,
      familyadmin: 0
    };

    console.log('📊 [API/USERS] Calculando estadísticas...');
    console.log('📊 [API/USERS] Rol del usuario:', currentUser.role?.nombre);
    console.log('📊 [API/USERS] Total usuarios encontrados:', total);

    if (currentUser.role?.nombre === 'superadmin') {
      console.log('📊 [API/USERS] Calculando stats para superadmin');
      // Para superadmin, calcular desde User - SIN filtro de búsqueda para stats
      // Las estadísticas siempre deben ser del total, no filtradas por búsqueda
      
      stats.total = await User.countDocuments({});
      stats.active = await User.countDocuments({ status: 'approved' });
      stats.inactive = await User.countDocuments({ status: { $ne: 'approved' } });
      
      // Contar por roles - SIN filtro de búsqueda
      const Role = require('./shared/models/Role');
      const coordinadorRole = await Role.findOne({ nombre: 'coordinador' });
      const familyadminRole = await Role.findOne({ nombre: 'familyadmin' });
      const familyviewerRole = await Role.findOne({ nombre: 'familyviewer' });
      
      console.log('📊 [API/USERS] Roles encontrados:', {
        coordinador: coordinadorRole?._id,
        familyadmin: familyadminRole?._id,
        familyviewer: familyviewerRole?._id
      });
      
      if (coordinadorRole) {
        stats.coordinadores = await User.countDocuments({ role: coordinadorRole._id });
        console.log('📊 [API/USERS] Coordinadores encontrados:', stats.coordinadores);
      }
      
      if (familyadminRole) {
        stats.tutores = await User.countDocuments({ role: familyadminRole._id });
        stats.familyadmin = stats.tutores; // Los tutores son familyadmin
        console.log('📊 [API/USERS] Tutores (familyadmin) encontrados:', stats.tutores);
      }
      if (familyviewerRole) {
        stats.familiares = await User.countDocuments({ role: familyviewerRole._id });
        console.log('📊 [API/USERS] Familiares (familyviewer) encontrados:', stats.familiares);
      }
      console.log('📊 [API/USERS] Stats calculadas (superadmin):', stats);
    } else if (currentUser.role?.nombre === 'adminaccount' && req.userInstitution) {
      console.log('📊 [API/USERS] Calculando stats para adminaccount');
      // Para adminaccount, calcular desde Shared - SIN filtro de búsqueda para stats
      // Las estadísticas siempre deben ser del total, no filtradas por búsqueda
      const sharedForStats = await Shared.find({
        account: req.userInstitution._id,
        status: { $in: ['active', 'pending'] }
      }).populate('user').populate('role');
      
      console.log('📊 [API/USERS] Shared associations encontradas:', sharedForStats.length);
      
      const uniqueUsersForStats = new Map();
      sharedForStats.forEach(shared => {
        // Validar que user y role existan antes de procesar
        if (shared.user && shared.role && !uniqueUsersForStats.has(shared.user._id.toString())) {
          // NO aplicar filtro de búsqueda para estadísticas - siempre contar todos
          uniqueUsersForStats.set(shared.user._id.toString(), {
            user: shared.user,
            role: shared.role
          });
        }
      });
      
      const allUsersForStats = Array.from(uniqueUsersForStats.values());
      console.log('📊 [API/USERS] Usuarios únicos para stats:', allUsersForStats.length);
      
      stats.total = allUsersForStats.length;
      stats.active = allUsersForStats.filter(u => u.user && u.user.status === 'approved').length;
      stats.inactive = allUsersForStats.filter(u => u.user && u.user.status !== 'approved').length;
      stats.coordinadores = allUsersForStats.filter(u => u.role && u.role.nombre === 'coordinador').length;
      stats.tutores = allUsersForStats.filter(u => u.role && u.role.nombre === 'familyadmin').length;
      stats.familyadmin = stats.tutores; // Los tutores son familyadmin
      stats.familiares = allUsersForStats.filter(u => u.role && u.role.nombre === 'familyviewer').length;
      
      console.log('📊 [API/USERS] Desglose por rol:', {
        coordinadores: stats.coordinadores,
        tutores: stats.tutores,
        familiares: stats.familiares,
        total: stats.total
      });
      
      console.log('📊 [API/USERS] Stats calculadas (adminaccount):', stats);
    } else {
      console.log('⚠️ [API/USERS] No se calcularon stats - rol no reconocido o sin institución');
      // Inicializar stats con valores por defecto si no se calcularon
      stats.total = total;
    }

    console.log('📊 [API/USERS] Stats finales a enviar:', JSON.stringify(stats, null, 2));

    res.json({
      success: true,
      data: {
        users,
        total,
        page,
        limit,
        stats
      }
    });
  } catch (error) {
    console.error('Error listando usuarios:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// ===== RUTAS DE GRUPOS (DIVISIONES) =====

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
app.put('/grupos/:id', authenticateToken, setUserInstitution, async (req, res) => {
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
app.delete('/grupos/:id', authenticateToken, setUserInstitution, async (req, res) => {
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
    sendEmailAsync(sendInstitutionWelcomeEmail, null, adminUser.email, adminUser.name, account.nombre, randomPassword);
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
    sendEmailAsync(
      emailService.sendNewUserCreatedEmail,
      emailService,
      {
        name: adminUser.name,
        email: adminUser.email
      },
      randomPassword,
      account.nombre,
      'Administrador de Institución'
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
app.delete('/accounts/:id', authenticateToken, async (req, res) => {
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

// Endpoint de prueba sin autenticación
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
app.delete('/api/student-actions/:actionId', authenticateToken, setUserInstitution, async (req, res) => {
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

// Listar asistencias por cuenta
app.get('/asistencias', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { accountId, grupoId, alumnoId, fechaInicio, fechaFin, page = 1, limit = 20 } = req.query;
    const currentUser = req.user;

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver asistencias'
      });
    }

    let query = { activo: true };

    // Filtro por cuenta según el rol del usuario
    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin puede ver todas las asistencias
      if (accountId) {
        query.account = accountId;
      }
    } else if (currentUser.role?.nombre === 'adminaccount') {
      // Adminaccount solo puede ver asistencias de sus cuentas
      const userAccounts = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      
      const accountIds = userAccounts.map(ah => ah.account);
      query.account = { $in: accountIds };
      
      if (accountId) {
        // Verificar que la cuenta solicitada pertenece al usuario
        if (!accountIds.includes(accountId)) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para ver asistencias de esta cuenta'
          });
        }
        query.account = accountId;
      }
    } else if (currentUser.role?.nombre === 'coordinador') {
      // Coordinador puede ver asistencias de sus grupos
      if (accountId) {
        query.account = accountId;
      }
    }

    // Filtros adicionales
    if (grupoId) {
      query.division = grupoId;
    }
    
    if (alumnoId) {
      query.alumno = alumnoId;
    }
    
    if (fechaInicio && fechaFin) {
      query.fecha = {
        $gte: fechaInicio,
        $lte: fechaFin
      };
    }

    // Obtener datos reales de la base de datos
    const total = await Asistencia.countDocuments(query);
    const asistencias = await Asistencia.find(query)
      .populate('alumno', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('grupo', 'nombre descripcion')
      .populate('registradoPor', 'name email')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ fecha: -1, horaLlegada: -1 });

    res.json({
      success: true,
      data: {
        asistencias: asistencias.map(asistencia => ({
          _id: asistencia._id,
          alumno: asistencia.alumno,
          account: asistencia.account,
          grupo: asistencia.grupo,
          fecha: asistencia.fecha,
          estado: asistencia.estado,
          horaLlegada: asistencia.horaLlegada,
          horaSalida: asistencia.horaSalida,
          observaciones: asistencia.observaciones,
          registradoPor: asistencia.registradoPor,
          activo: asistencia.activo,
          createdAt: asistencia.createdAt,
          updatedAt: asistencia.updatedAt
        })),
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error listando asistencias:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Registrar nueva asistencia
app.post('/asistencias', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { alumnoId, accountId, grupoId, fecha, estado, horaLlegada, horaSalida, observaciones } = req.body;
    const currentUser = req.user;

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para registrar asistencias'
      });
    }

    // Validaciones
    if (!alumnoId || !accountId || !grupoId || !fecha) {
      return res.status(400).json({
        success: false,
        message: 'alumnoId, accountId, grupoId y fecha son requeridos'
      });
    }

    // Verificar que el alumno existe
    const alumno = await User.findById(alumnoId);
    if (!alumno) {
      return res.status(404).json({
        success: false,
        message: 'Alumno no encontrado'
      });
    }

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

    // Verificar que el grupo existe
    const grupo = await Grupo.findById(grupoId);
    if (!grupo) {
      return res.status(404).json({
        success: false,
        message: 'Grupo no encontrado'
      });
    }

    // Verificar permisos según rol
    if (currentUser.role?.nombre === 'adminaccount') {
      const userAccounts = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      
      const accountIds = userAccounts.map(ah => ah.account.toString());
      if (!accountIds.includes(accountId)) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para registrar asistencias en esta cuenta'
        });
      }
    }

    // Verificar si ya existe una asistencia para este alumno en esta fecha y grupo
    const fechaAsistencia = new Date(fecha);
    const asistenciaExistente = await Asistencia.existeAsistencia(alumnoId, fechaAsistencia, grupoId);
    
    if (asistenciaExistente) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una asistencia registrada para este alumno en esta fecha y grupo'
      });
    }

    // Crear nueva asistencia
    const nuevaAsistencia = new Asistencia({
      alumno: alumnoId,
      account: accountId,
      grupo: grupoId,
      fecha: fechaAsistencia,
      estado: estado || 'presente',
      horaLlegada: horaLlegada ? new Date(horaLlegada) : null,
      horaSalida: horaSalida ? new Date(horaSalida) : null,
      observaciones,
      registradoPor: currentUser._id
    });

    await nuevaAsistencia.save();

    // Obtener la asistencia con datos poblados
    const asistenciaGuardada = await Asistencia.findById(nuevaAsistencia._id)
      .populate('alumno', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('grupo', 'nombre descripcion')
      .populate('registradoPor', 'name email');

    console.log(`✅ Asistencia registrada: ${asistenciaGuardada.alumno.name} en ${asistenciaGuardada.grupo.nombre}`);

    res.status(201).json({
      success: true,
      message: 'Asistencia registrada exitosamente',
      data: asistenciaGuardada
    });

  } catch (error) {
    console.error('Error registrando asistencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Actualizar asistencia
app.put('/asistencias/:asistenciaId', authenticateToken, async (req, res) => {
  try {
    const { asistenciaId } = req.params;
    const { estado, horaLlegada, horaSalida, observaciones } = req.body;
    const currentUser = req.user;

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar asistencias'
      });
    }

    // Buscar la asistencia
    const asistencia = await Asistencia.findById(asistenciaId)
      .populate('alumno', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('grupo', 'nombre descripcion')
      .populate('registradoPor', 'name email');

    if (!asistencia) {
      return res.status(404).json({
        success: false,
        message: 'Asistencia no encontrada'
      });
    }

    // Verificar permisos según rol
    if (currentUser.role?.nombre === 'adminaccount') {
      const userAccounts = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      
      const accountIds = userAccounts.map(ah => ah.account.toString());
      if (!accountIds.includes(asistencia.account._id.toString())) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para actualizar asistencias de esta cuenta'
        });
      }
    }

    // Actualizar campos
    if (estado) asistencia.estado = estado;
    if (horaLlegada !== undefined) asistencia.horaLlegada = horaLlegada ? new Date(horaLlegada) : null;
    if (horaSalida !== undefined) asistencia.horaSalida = horaSalida ? new Date(horaSalida) : null;
    if (observaciones !== undefined) asistencia.observaciones = observaciones;

    await asistencia.save();

    console.log(`✅ Asistencia actualizada: ${asistencia.alumno.name} en ${asistencia.grupo.nombre}`);

    res.json({
      success: true,
      message: 'Asistencia actualizada exitosamente',
      data: asistencia
    });

  } catch (error) {
    console.error('Error actualizando asistencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Eliminar asistencia (marcar como inactiva)
app.delete('/asistencias/:asistenciaId', authenticateToken, async (req, res) => {
  try {
    const { asistenciaId } = req.params;
    const currentUser = req.user;

    // Verificar permisos
    if (!['adminaccount', 'superadmin'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar asistencias'
      });
    }

    // Buscar la asistencia
    const asistencia = await Asistencia.findById(asistenciaId)
      .populate('alumno', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('grupo', 'nombre descripcion');

    if (!asistencia) {
      return res.status(404).json({
        success: false,
        message: 'Asistencia no encontrada'
      });
    }

    // Verificar permisos según rol
    if (currentUser.role?.nombre === 'adminaccount') {
      const userAccounts = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      
      const accountIds = userAccounts.map(ah => ah.account.toString());
      if (!accountIds.includes(asistencia.account._id.toString())) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para eliminar asistencias de esta cuenta'
        });
      }
    }

    // Marcar como inactiva
    asistencia.activo = false;
    await asistencia.save();

    console.log(`❌ Asistencia eliminada: ${asistencia.alumno.name} en ${asistencia.grupo.nombre}`);

    res.json({
      success: true,
      message: 'Asistencia eliminada exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando asistencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

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

// ==================== ENDPOINTS PARA ALUMNOS ====================

// Endpoint para obtener alumnos por institución y división
app.get('/students', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { accountId, divisionId, year } = req.query;

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
    const query = {};

    // Filtrar por rol
    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin puede ver todos los estudiantes
      if (accountId) query.account = accountId;
      if (divisionId) query.division = divisionId;
    } else if (currentUser.role?.nombre === 'adminaccount') {
      // Adminaccount solo puede ver estudiantes de su institución
      if (req.userInstitution) {
        query.account = req.userInstitution._id;
        if (divisionId) query.division = divisionId;
      } else {
        return res.status(403).json({
          success: false,
          message: 'No tienes una institución asignada'
        });
      }
    } else {
      // Otros roles requieren accountId y divisionId
      if (!accountId || !divisionId) {
        return res.status(400).json({
          success: false,
          message: 'accountId y divisionId son requeridos'
        });
      }

      // Verificar permisos
      if (!req.user.isCognitoUser) {
        const userAssociation = await Shared.findOne({
          user: currentUser._id,
          account: accountId,
          status: 'active'
        });

        if (!userAssociation) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para acceder a esta institución'
          });
        }
      }

      query.account = accountId;
      query.division = divisionId;
    }

    if (year) {
      query.year = parseInt(year);
    }

    const students = await Student.find(query)
      .populate('account', 'nombre razonSocial')
      .populate('division', 'nombre descripcion')
      .sort({ apellido: 1, nombre: 1 });

    res.json({
      success: true,
      data: {
        students,
        total: students.length
      }
    });
  } catch (error) {
    console.error('Error obteniendo alumnos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para obtener alumnos por cuenta y división seleccionada
app.get('/students/by-account-division', authenticateToken, async (req, res) => {
  try {
    const { accountId, divisionId, year } = req.query;
    const { userId } = req.user;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'accountId es requerido'
      });
    }

    // Verificar permisos del usuario para esta cuenta
    const userAssociation = await Shared.findOne({
      user: userId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para acceder a esta institución'
      });
    }

    // Construir query
    const query = {
      account: accountId
    };

    // Si se especifica división, filtrar por ella
    if (divisionId) {
      query.division = divisionId;
    }

    if (year) {
      query.year = parseInt(year);
    }

    const students = await Student.find(query)
      .populate('account', 'nombre razonSocial')
      .populate('division', 'nombre descripcion')
      .sort({ apellido: 1, nombre: 1 });

    // Procesar URLs de avatares para cada estudiante
    const studentsWithAvatarUrls = await Promise.all(students.map(async (student) => {
      const studentObj = student.toObject();
      
      if (student.avatar) {
        try {
          // Verificar si es una key de S3 para estudiantes
          if (student.avatar.includes('students/')) {
            // Es una key de S3 para estudiantes, generar URL firmada
            const { generateSignedUrl } = require('./config/s3.config');
            const signedUrl = await generateSignedUrl(student.avatar, 172800); // 2 días
            studentObj.avatar = signedUrl;
          } else if (!student.avatar.startsWith('http')) {
            // Es una key local, generar URL local
            const localUrl = `${req.protocol}://${req.get('host')}/uploads/${student.avatar.split('/').pop()}`;
            studentObj.avatar = localUrl;
          }
          // Si ya es una URL completa, no hacer nada
        } catch (error) {
          console.error('Error procesando avatar del estudiante:', student._id, error);
          // En caso de error, mantener el avatar original
        }
      }
      
      return studentObj;
    }));

    res.json({
      success: true,
      data: {
        students: studentsWithAvatarUrls,
        total: students.length
      }
    });
  } catch (error) {
    console.error('Error obteniendo alumnos por cuenta y división:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para descargar plantilla de estudiantes
app.get('/students/template', authenticateToken, async (req, res) => {
  try {
    // Crear datos de ejemplo para la plantilla
    const templateData = [
      ['Nombre', 'Apellido', 'DNI', 'Nombre Tutor', 'Email Tutor', 'DNI Tutor'],
      ['Juan', 'Pérez', '12345678', 'Carlos Pérez', 'carlos.perez@email.com', '87654321'],
      ['María', 'García', '23456789', 'Ana García', 'ana.garcia@email.com', '76543210'],
      ['Pedro', 'López', '34567890', 'Luis López', 'luis.lopez@email.com', '65432109']
    ];

    // Crear el workbook y worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(templateData);

    // Ajustar el ancho de las columnas
    worksheet['!cols'] = [
      { width: 15 }, // Nombre
      { width: 15 }, // Apellido
      { width: 12 }, // DNI
      { width: 15 }, // Nombre Tutor
      { width: 25 }, // Email Tutor
      { width: 12 }  // DNI Tutor
    ];

    // Agregar el worksheet al workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Estudiantes');

    // Generar el buffer del archivo
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Configurar headers para la descarga
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_estudiantes.xlsx"');
    res.setHeader('Content-Length', buffer.length);

    // Enviar el archivo
    res.send(buffer);

  } catch (error) {
    console.error('Error generando plantilla de estudiantes:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando plantilla de estudiantes'
    });
  }
});

// Endpoint para cargar alumnos desde Excel
app.post('/students/upload-excel', authenticateToken, uploadExcel.single('excel'), async (req, res) => {
  try {
    console.log('📁 Archivo recibido:', req.file);
    console.log('📋 Body recibido:', req.body);
    
    const { accountId, divisionId, year } = req.body;
    const { userId } = req.user;

    if (!accountId || !divisionId || !year || !req.file) {
      console.log('❌ Datos faltantes:', { accountId, divisionId, year, hasFile: !!req.file });
      return res.status(400).json({
        success: false,
        message: 'accountId, divisionId, year y archivo Excel son requeridos'
      });
    }

    // Verificar permisos del usuario
    const user = await User.findById(userId).populate('role');
    const userAssociation = await Shared.findOne({
      user: userId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation && user.role?.nombre !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para cargar alumnos en esta institución'
      });
    }

    // Verificar que la institución y división existen
    const account = await Account.findById(accountId);
    const division = await Grupo.findById(divisionId);

    if (!account || !division) {
      return res.status(404).json({
        success: false,
        message: 'Institución o división no encontrada'
      });
    }

    // Procesar el archivo Excel
    console.log('📖 Leyendo archivo Excel:', req.file.path);
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    console.log('📊 Datos extraídos:', data.length, 'filas');

    const results = {
      success: 0,
      errors: [],
      total: data.length
    };

    // Procesar cada fila
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2; // +2 porque Excel empieza en 1 y tenemos headers

      try {
        // Verificar si la fila está vacía (todos los campos requeridos están vacíos)
        const isRowEmpty = !row.nombre && !row.apellido && !row.dni && !row.dniTutor && !row.nombreTutor && !row.emailTutor;
        if (isRowEmpty) {
          continue; // Saltar filas completamente vacías
        }

        // Validar campos requeridos del alumno
        if (!row.nombre || !row.apellido || !row.dni) {
          const missingFields = [];
          if (!row.nombre) missingFields.push('nombre');
          if (!row.apellido) missingFields.push('apellido');
          if (!row.dni) missingFields.push('dni');
          
          results.errors.push({
            row: rowNumber,
            error: `Faltan campos requeridos del alumno: ${missingFields.join(', ')}`
          });
          continue;
        }

        // Validar campos requeridos del tutor
        if (!row.dniTutor || !row.nombreTutor || !row.emailTutor) {
          const missingFields = [];
          if (!row.dniTutor) missingFields.push('dniTutor');
          if (!row.nombreTutor) missingFields.push('nombreTutor');
          if (!row.emailTutor) missingFields.push('emailTutor');
          
          results.errors.push({
            row: rowNumber,
            error: `Faltan campos requeridos del tutor: ${missingFields.join(', ')}`
          });
          continue;
        }

        // Email del estudiante ya no es requerido, se omite

        // Verificar si el alumno ya existe - SOLO por DNI
        const existingStudent = await Student.findOne({
          dni: String(row.dni).trim()
        });

        if (existingStudent) {
          results.errors.push({
            row: rowNumber,
            error: `Alumno ya existe con DNI ${String(row.dni).trim()}`
          });
          continue;
        }

        // Manejar el tutor
        let tutorUser = null;
        
        // Buscar si el tutor ya existe
        const existingTutor = await User.findOne({
          $or: [
            { email: String(row.emailTutor).toLowerCase().trim() },
            { dni: String(row.dniTutor).trim() }
          ]
        });

        if (existingTutor) {
          tutorUser = existingTutor;
          console.log(`✅ Tutor encontrado: ${existingTutor.email}`);
          
          // Verificar si ya tiene una asociación con esta cuenta y grupo
          const existingAssociation = await Shared.findOne({
            user: existingTutor._id,
            account: accountId,
            division: divisionId,
            status: 'active'
          });
          
          if (existingAssociation) {
            console.log(`ℹ️ Tutor ya tiene asociación con esta cuenta y grupo`);
          } else {
            console.log(`⚠️ Tutor existe pero no tiene asociación con esta cuenta/grupo`);
          }
        } else {
          // Crear nuevo tutor
          console.log(`🆕 Creando nuevo tutor: ${row.emailTutor}`);
          
          // Obtener el rol de tutor (usamos familyadmin que es el más apropiado para padres/tutores)
          const tutorRole = await Role.findOne({ nombre: 'familyadmin' });
          if (!tutorRole) {
            results.errors.push({
              row: rowNumber,
              error: 'Rol de tutor no encontrado en el sistema'
            });
            continue;
          }

          // Generar contraseña aleatoria segura para el tutor
          const tutorPassword = generateRandomPassword(12);
          console.log('🔑 [STUDENTS UPLOAD] Contraseña generada para tutor:', tutorPassword);

          // Crear el usuario tutor
          const tutorData = {
            name: String(row.nombreTutor).trim(),
            email: String(row.emailTutor).toLowerCase().trim(),
            password: tutorPassword, // Contraseña aleatoria segura
            role: tutorRole._id,
            status: 'approved', // Aprobado automáticamente
            dni: String(row.dniTutor).trim()
          };

          tutorUser = new User(tutorData);
          await tutorUser.save();
          console.log(`✅ Tutor creado: ${tutorUser.email}`);

          // Enviar email de bienvenida al nuevo tutor (asíncrono)
          sendEmailAsync(
            emailService.sendNewUserCreatedEmail,
            emailService,
            {
              name: tutorUser.name,
              email: tutorUser.email
            },
            tutorData.password,
            account.nombre,
            'Tutor/Padre'
          );
          console.log(`📧 [STUDENTS UPLOAD] Email de bienvenida programado para envío asíncrono a: ${tutorUser.email}`);

          // La asociación se creará después de crear el alumno
          console.log(`⏳ Asociación del tutor se creará después de crear el alumno...`);
        }

        // Crear el alumno
        console.log(`👤 Creando alumno...`);
        const studentData = {
          nombre: String(row.nombre).trim(),
          apellido: String(row.apellido).trim(),
          dni: String(row.dni).trim(),
          account: accountId,
          division: divisionId,
          year: parseInt(year),
          tutor: tutorUser._id, // Vincular al tutor
          createdBy: userId
        };
        
        // Solo agregar email si está presente
        if (row.email) {
          studentData.email = String(row.email).toLowerCase().trim();
        }
        
        console.log(`📝 Datos del alumno:`, studentData);
        const student = new Student(studentData);

        await student.save();
        console.log(`✅ Alumno creado exitosamente: ${student.nombre} ${student.apellido}`);
        
        // Crear asociación del tutor con institución + grupo + alumno específico
        console.log(`🔗 Creando asociación completa del tutor...`);
        
        // Verificar si ya existe una asociación para este tutor con este alumno
        const existingStudentAssociation = await Shared.findOne({
          user: tutorUser._id,
          account: accountId,
          division: divisionId,
          student: student._id,
          status: 'active'
        });
        
        if (existingStudentAssociation) {
          console.log(`ℹ️ Asociación tutor-alumno ya existe`);
        } else {
          await createAssociationByRole(
            tutorUser._id, 
            accountId, 
            'familyadmin', 
            divisionId, 
            student._id, 
            userId
          );

          // Enviar email de asociación a institución (solo si el tutor ya existía)
          if (existingTutor) {
            try {
              await emailService.sendInstitutionAssociationEmail(
                {
                  name: tutorUser.name,
                  email: tutorUser.email
                },
                account.nombre,
                division.nombre,
                'Tutor/Padre',
                {
                  nombre: student.nombre,
                  apellido: student.apellido,
                  dni: student.dni
                }
              );
              console.log(`📧 Email de asociación enviado a: ${tutorUser.email}`);
            } catch (emailError) {
              console.error(`❌ Error enviando email de asociación a ${tutorUser.email}:`, emailError.message);
              // No fallar la operación por error de email
            }
          }
        }
        
        results.success++;

      } catch (error) {
        console.log(`❌ Error en fila ${rowNumber}:`, error.message);
        console.log(`❌ Stack trace:`, error.stack);
        results.errors.push({
          row: rowNumber,
          error: error.message
        });
      }
    }

    // Eliminar el archivo temporal
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: `Carga completada. ${results.success} alumnos cargados exitosamente.`,
      data: results
    });

  } catch (error) {
    console.error('Error cargando alumnos desde Excel:', error);
    
    // Eliminar archivo temporal si existe
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint de prueba para descargar plantilla de coordinadores (sin auth)
app.get('/coordinators/template-test', async (req, res) => {
  try {
    console.log('📄 Generando plantilla de coordinadores (test)...');
    
    // Crear datos de ejemplo para la plantilla
    const templateData = [
      ['Nombre', 'Email', 'DNI'],
      ['Juan Pérez', 'juan.perez@institucion.com', '12345678'],
      ['María García', 'maria.garcia@institucion.com', '87654321'],
      ['Carlos López', 'carlos.lopez@institucion.com', '11223344']
    ];

    // Crear el workbook y worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(templateData);

    // Ajustar el ancho de las columnas
    worksheet['!cols'] = [
      { width: 20 }, // Nombre
      { width: 30 }, // Email
      { width: 15 }  // DNI
    ];

    // Agregar el worksheet al workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Coordinadores');

    // Generar el archivo temporal
    const tempFilePath = path.join(__dirname, 'temp_template.xlsx');
    XLSX.writeFile(workbook, tempFilePath);

    console.log(`📊 Archivo generado: ${tempFilePath}`);

    // Leer el archivo y enviarlo
    const fileBuffer = fs.readFileSync(tempFilePath);
    
    // Configurar headers para la descarga
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_coordinadores_test.xlsx"');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    // Enviar el archivo
    res.send(fileBuffer);
    
    // Limpiar archivo temporal
    fs.unlinkSync(tempFilePath);
    
    console.log('✅ Plantilla enviada exitosamente');

  } catch (error) {
    console.error('❌ Error generando plantilla:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando plantilla'
    });
  }
});

// Endpoint para descargar plantilla de coordinadores
app.get('/coordinators/template', authenticateToken, async (req, res) => {
  try {
    console.log('📄 Generando plantilla de coordinadores...');
    
    // Crear datos de ejemplo para la plantilla
    const templateData = [
      ['Nombre', 'Email', 'DNI'],
      ['Juan Pérez', 'juan.perez@institucion.com', '12345678'],
      ['María García', 'maria.garcia@institucion.com', '87654321'],
      ['Carlos López', 'carlos.lopez@institucion.com', '11223344']
    ];

    // Crear el workbook y worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(templateData);

    // Ajustar el ancho de las columnas
    worksheet['!cols'] = [
      { width: 20 }, // Nombre
      { width: 30 }, // Email
      { width: 15 }  // DNI
    ];

    // Agregar el worksheet al workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Coordinadores');

    // Generar el buffer directamente
    const buffer = XLSX.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx'
    });

    console.log(`📊 Archivo generado: ${buffer.length} bytes`);
    
    // Configurar headers para la descarga
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_coordinadores.xlsx"');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    // Enviar el archivo
    res.send(buffer);
    
    console.log('✅ Plantilla enviada exitosamente');

  } catch (error) {
    console.error('❌ Error generando plantilla:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando plantilla'
    });
  }
});

// Endpoint para cargar coordinadores desde Excel
app.post('/coordinators/upload-excel', authenticateToken, uploadExcel.single('file'), async (req, res) => {
  try {
    console.log('📁 [COORDINATORS UPLOAD] Iniciando carga de coordinadores...');
    console.log('📁 [COORDINATORS UPLOAD] Archivo recibido:', req.file ? 'Sí' : 'No');
    console.log('📁 [COORDINATORS UPLOAD] Body recibido:', req.body);
    
    if (!req.file) {
      console.log('❌ [COORDINATORS UPLOAD] No se proporcionó archivo');
      return res.status(400).json({
        success: false,
        message: 'No se ha proporcionado ningún archivo'
      });
    }

    const { userId } = req.user;
    const { divisionId } = req.body; // ID de la división donde se cargarán los coordinadores

    console.log('👤 [COORDINATORS UPLOAD] Usuario ID:', userId);
    console.log('🏫 [COORDINATORS UPLOAD] División ID:', divisionId);

    if (!divisionId) {
      console.log('❌ [COORDINATORS UPLOAD] No se proporcionó divisionId');
      return res.status(400).json({
        success: false,
        message: 'ID de división es requerido'
      });
    }

    // Verificar que la división existe
    const division = await Grupo.findById(divisionId);
    if (!division) {
      return res.status(404).json({
        success: false,
        message: 'División no encontrada'
      });
    }

    // Verificar permisos del usuario
    const currentUser = await User.findById(userId).populate('role');
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Solo superadmin y adminaccount pueden cargar coordinadores
    if (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para cargar coordinadores'
      });
    }

    // Si es adminaccount, verificar que pertenece a la cuenta de la división
    if (currentUser.role?.nombre === 'adminaccount') {
      const userAssociation = await Shared.findOne({
        user: currentUser._id,
        account: division.cuenta,
        status: 'active'
      });

      if (!userAssociation) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para cargar coordinadores en esta división'
        });
      }
    }

    // Leer el archivo Excel
    console.log('📖 [COORDINATORS UPLOAD] Leyendo archivo Excel:', req.file.path);
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    console.log('📊 [COORDINATORS UPLOAD] Datos extraídos:', data.length, 'filas');
    console.log('📋 [COORDINATORS UPLOAD] Primera fila (encabezados):', data[0]);
    if (data.length > 1) {
      console.log('📋 [COORDINATORS UPLOAD] Segunda fila (primer dato):', data[1]);
    }

    // Validar que hay datos
    if (data.length < 2) {
      console.log('❌ [COORDINATORS UPLOAD] Archivo no tiene suficientes datos');
      return res.status(400).json({
        success: false,
        message: 'El archivo debe contener al menos una fila de datos (excluyendo encabezados)'
      });
    }

    const results = {
      success: 0,
      errors: []
    };

    // Obtener el rol de coordinador
    const coordinadorRole = await Role.findOne({ nombre: 'coordinador' });
    if (!coordinadorRole) {
      return res.status(500).json({
        success: false,
        message: 'Rol de coordinador no encontrado en el sistema'
      });
    }

    // Procesar cada fila (empezar desde la fila 2, saltando encabezados)
    console.log('🔄 [COORDINATORS UPLOAD] Procesando filas...');
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 1;

      console.log(`📝 [COORDINATORS UPLOAD] Procesando fila ${rowNumber}:`, row);

      try {
        // Verificar si la fila está vacía
        const isRowEmpty = !row[0] && !row[1] && !row[2];
        if (isRowEmpty) {
          console.log(`⏭️ [COORDINATORS UPLOAD] Fila ${rowNumber} está vacía, saltando...`);
          continue;
        }

        // Extraer datos de la fila
        const nombre = String(row[0] || '').trim();
        const email = String(row[1] || '').toLowerCase().trim();
        const dni = String(row[2] || '').trim();

        console.log(`📋 [COORDINATORS UPLOAD] Fila ${rowNumber} - Datos extraídos:`, {
          nombre,
          email,
          dni
        });

        // Validar campos requeridos
        if (!nombre || !email || !dni) {
          const missingFields = [];
          if (!nombre) missingFields.push('nombre');
          if (!email) missingFields.push('email');
          if (!dni) missingFields.push('dni');
          
          results.errors.push({
            row: rowNumber,
            error: `Faltan campos requeridos: ${missingFields.join(', ')}`
          });
          continue;
        }

        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          results.errors.push({
            row: rowNumber,
            error: 'Formato de email inválido'
          });
          continue;
        }

        // Verificar si el coordinador ya existe
        console.log(`🔍 [COORDINATORS UPLOAD] Fila ${rowNumber} - Buscando coordinador existente...`);
        const existingCoordinator = await User.findOne({
          $or: [
            { email: email },
            { dni: dni }
          ]
        });

        let coordinatorUser = null;

        if (existingCoordinator) {
          coordinatorUser = existingCoordinator;
          console.log(`✅ [COORDINATORS UPLOAD] Fila ${rowNumber} - Coordinador encontrado: ${existingCoordinator.email} (ID: ${existingCoordinator._id})`);
        } else {
          // Crear nuevo coordinador
          console.log(`🆕 Creando nuevo coordinador: ${email}`);
          
          // Generar contraseña aleatoria segura para el coordinador
          const coordinatorPassword = generateRandomPassword(12);
          console.log('🔑 [COORDINATORS UPLOAD] Contraseña generada para coordinador:', coordinatorPassword);

          // Crear el usuario coordinador
          const coordinatorData = {
            name: nombre,
            email: email,
            password: coordinatorPassword, // Contraseña aleatoria segura
            role: coordinadorRole._id,
            status: 'approved', // Aprobado automáticamente
            dni: dni
          };

          coordinatorUser = new User(coordinatorData);
          await coordinatorUser.save();
          console.log(`✅ Coordinador creado: ${coordinatorUser.email}`);

          // Enviar email de bienvenida al nuevo coordinador (asíncrono)
          const institutionName = division.cuenta ? (await Account.findById(division.cuenta)).nombre : 'Institución';
          sendEmailAsync(
            emailService.sendNewUserCreatedEmail,
            emailService,
            {
              name: coordinatorUser.name,
              email: coordinatorUser.email
            },
            coordinatorData.password,
            institutionName,
            'Coordinador'
          );
          console.log(`📧 [COORDINATORS UPLOAD] Email de bienvenida programado para envío asíncrono a: ${coordinatorUser.email}`);
        }

        // Verificar qué asociaciones tiene el usuario en esta división
        console.log(`🔍 [COORDINATORS UPLOAD] Fila ${rowNumber} - Verificando asociaciones existentes en esta división...`);
        const allUserAssociations = await Shared.find({
          user: coordinatorUser._id,
          account: division.cuenta,
          division: divisionId,
          status: 'active'
        }).populate('role', 'nombre');

        console.log(`📋 [COORDINATORS UPLOAD] Fila ${rowNumber} - Asociaciones existentes:`, allUserAssociations.map(assoc => ({
          id: assoc._id,
          role: assoc.role?.nombre,
          status: assoc.status
        })));

        // Verificar si ya existe una asociación específicamente como coordinador
        const existingCoordinatorAssociation = await Shared.findOne({
          user: coordinatorUser._id,
          account: division.cuenta,
          division: divisionId,
          role: coordinadorRole._id,
          status: 'active'
        });

        if (existingCoordinatorAssociation) {
          console.log(`ℹ️ [COORDINATORS UPLOAD] Fila ${rowNumber} - Coordinador ya tiene asociación como coordinador con esta división (ID: ${existingCoordinatorAssociation._id})`);
        } else {
          // Crear asociación del coordinador con institución + división
          console.log(`🔗 [COORDINATORS UPLOAD] Fila ${rowNumber} - Creando asociación del coordinador...`);
          try {
            await createAssociationByRole(
              coordinatorUser._id,
              division.cuenta,
              'coordinador',
              divisionId,
              null,
              userId
            );
            console.log(`✅ [COORDINATORS UPLOAD] Fila ${rowNumber} - Asociación creada exitosamente`);
          } catch (associationError) {
            console.error(`❌ [COORDINATORS UPLOAD] Fila ${rowNumber} - Error creando asociación:`, associationError);
            throw associationError;
          }

          // Enviar email de asociación a institución (solo si el coordinador ya existía)
          if (existingCoordinator) {
            try {
              const account = await Account.findById(division.cuenta);
              await emailService.sendInstitutionAssociationEmail(
                {
                  name: coordinatorUser.name,
                  email: coordinatorUser.email
                },
                account.nombre,
                division.nombre,
                'Coordinador'
              );
              console.log(`📧 Email de asociación enviado a: ${coordinatorUser.email}`);
            } catch (emailError) {
              console.error(`❌ Error enviando email de asociación a ${coordinatorUser.email}:`, emailError.message);
              // No fallar la operación por error de email
            }
          }
        }

        results.success++;
        console.log(`✅ [COORDINATORS UPLOAD] Fila ${rowNumber} - Procesada exitosamente`);

      } catch (error) {
        console.log(`❌ [COORDINATORS UPLOAD] Error en fila ${rowNumber}:`, error.message);
        console.log(`❌ [COORDINATORS UPLOAD] Stack trace:`, error.stack);
        results.errors.push({
          row: rowNumber,
          error: error.message
        });
      }
    }

    console.log(`📊 [COORDINATORS UPLOAD] Procesamiento completado:`, {
      success: results.success,
      errors: results.errors.length,
      total: data.length - 1
    });

    // Eliminar el archivo temporal
    console.log('🗑️ [COORDINATORS UPLOAD] Eliminando archivo temporal...');
    fs.unlinkSync(req.file.path);

    console.log('✅ [COORDINATORS UPLOAD] Respuesta enviada:', {
      success: true,
      message: `Carga completada. ${results.success} coordinadores cargados exitosamente.`,
      data: results
    });

    res.json({
      success: true,
      message: `Carga completada. ${results.success} coordinadores cargados exitosamente.`,
      data: results
    });

  } catch (error) {
    console.error('Error cargando coordinadores desde Excel:', error);
    
    // Eliminar archivo temporal si existe
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para obtener coordinadores por división
app.get('/coordinators/by-division/:divisionId', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { divisionId } = req.params;
    const { userId } = req.user;

    console.log('🔍 Obteniendo coordinadores para división:', divisionId);

    // Verificar que la división existe
    const division = await Grupo.findById(divisionId);
    if (!division) {
      return res.status(404).json({
        success: false,
        message: 'División no encontrada'
      });
    }

    // Verificar permisos del usuario
    let currentUser;
    if (req.user.isCognitoUser) {
      // Para usuarios de Cognito, buscar por email
      currentUser = await User.findOne({ email: req.user.email }).populate('role');
    } else {
      // Para usuarios legacy, buscar por ID
      currentUser = await User.findById(userId).populate('role');
    }
    
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Solo superadmin y adminaccount pueden ver coordinadores
    if (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver coordinadores'
      });
    }

    // Si es adminaccount, verificar que pertenece a la cuenta de la división
    if (currentUser.role?.nombre === 'adminaccount') {
      // Verificar acceso a la división comparando la cuenta
      if (req.userInstitution && division.cuenta.toString() !== req.userInstitution._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para ver coordinadores de esta división'
        });
      }
    }

    // Buscar todas las asociaciones de coordinadores para esta división
    const coordinadorAssociations = await Shared.find({
      division: divisionId,
      status: 'active'
    }).populate([
      {
        path: 'user',
        select: 'name email status createdAt'
      },
      {
        path: 'role',
        select: 'nombre descripcion'
      }
    ]);

    // Filtrar solo los coordinadores
    const coordinadores = coordinadorAssociations.filter(association => 
      association.role?.nombre === 'coordinador'
    );

    console.log(`📊 Encontrados ${coordinadores.length} coordinadores para la división ${division.nombre}`);

    res.json({
      success: true,
      data: {
        division: {
          _id: division._id,
          nombre: division.nombre,
          descripcion: division.descripcion
        },
        coordinadores: coordinadores
          .filter(association => association.user)
          .map(association => ({
            _id: association.user._id,
            nombre: association.user.name,
            email: association.user.email,
            activo: association.user.status === 'approved',
            asociacionId: association._id,
            fechaAsociacion: association.createdAt
          }))
      }
    });

  } catch (error) {
    console.error('Error obteniendo coordinadores por división:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para obtener todos los coordinadores
app.get('/coordinators', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { userId } = req.user;

    console.log('🔍 Obteniendo todos los coordinadores...');
    console.log('👤 Usuario del token:', req.user);
    console.log('🔍 isCognitoUser:', req.user.isCognitoUser);
    console.log('📧 Email del usuario:', req.user.email);

    // Verificar permisos del usuario
    let currentUser;
    if (req.user.isCognitoUser) {
      // Para usuarios de Cognito, buscar por email
      console.log('🔍 Buscando usuario de Cognito por email:', req.user.email);
      currentUser = await User.findOne({ email: req.user.email }).populate('role');
      console.log('👤 Usuario encontrado en MongoDB:', currentUser ? 'Sí' : 'No');
    } else {
      // Para usuarios legacy, buscar por ID
      console.log('🔍 Buscando usuario legacy por ID:', userId);
      currentUser = await User.findById(userId).populate('role');
      console.log('👤 Usuario legacy encontrado:', currentUser ? 'Sí' : 'No');
    }
    
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Solo superadmin y adminaccount pueden ver coordinadores
    if (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver coordinadores'
      });
    }

    // Buscar todas las asociaciones de coordinadores
    let query = {
      status: 'active'
    };

    // Si es adminaccount, filtrar solo por sus cuentas
    if (currentUser.role?.nombre === 'adminaccount') {
      // Usar el middleware global para obtener la institución
      if (req.userInstitution) {
        console.log('🏢 Institución del usuario:', req.userInstitution.nombre, req.userInstitution._id);
        
        // Filtrar coordinadores de esta cuenta
        query.account = req.userInstitution._id;
        console.log('👥 Filtrando coordinadores de la cuenta:', req.userInstitution._id);
      } else {
        console.log('⚠️ Usuario sin institución asignada');
        query.account = null; // No mostrar coordinadores
      }
    }

    const coordinadorAssociations = await Shared.find(query).populate([
      {
        path: 'user',
        select: 'name email status createdAt'
      },
      {
        path: 'role',
        select: 'nombre descripcion'
      },
      {
        path: 'account',
        select: 'nombre razonSocial'
      },
      {
        path: 'division',
        select: 'nombre descripcion'
      }
    ]);

    // Filtrar solo los coordinadores
    const coordinadores = coordinadorAssociations.filter(association => 
      association.role?.nombre === 'coordinador'
    );

    console.log(`📊 Encontrados ${coordinadores.length} coordinadores totales`);

    res.json({
      success: true,
      data: {
        coordinadores: coordinadores.map(association => ({
          _id: association.user._id,
          nombre: association.user.name,
          email: association.user.email,
          activo: association.user.status === 'approved',
          asociacionId: association._id,
          fechaAsociacion: association.createdAt,
          division: association.division ? {
            _id: association.division._id,
            nombre: association.division.nombre,
            descripcion: association.division.descripcion
          } : null,
          account: association.account ? {
            _id: association.account._id,
            nombre: association.account.nombre,
            razonSocial: association.account.razonSocial
          } : null
        }))
      }
    });

  } catch (error) {
    console.error('Error obteniendo coordinadores:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para obtener todos los tutores
app.get('/tutors', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    console.log('🔍 Obteniendo todos los tutores...');
    console.log('🔍 [TUTORS] req.user:', req.user);
    console.log('🔍 [TUTORS] req.userInstitution:', req.userInstitution);

    // Verificar permisos del usuario
    let currentUser;
    if (req.user.isCognitoUser) {
      // Para usuarios de Cognito, buscar por email
      console.log('🔍 [TUTORS] Buscando usuario de Cognito por email:', req.user.email);
      currentUser = await User.findOne({ email: req.user.email }).populate('role');
      console.log('🔍 [TUTORS] Usuario encontrado:', currentUser ? 'Sí' : 'No');
    } else {
      // Para usuarios legacy, buscar por ID
      const { userId } = req.user;
      console.log('🔍 [TUTORS] Buscando usuario legacy por ID:', userId);
      currentUser = await User.findById(userId).populate('role');
      console.log('🔍 [TUTORS] Usuario encontrado:', currentUser ? 'Sí' : 'No');
    }
    
    if (!currentUser) {
      console.log('❌ [TUTORS] Usuario no encontrado');
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Solo superadmin y adminaccount pueden ver tutores
    if (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver tutores'
      });
    }

    // Buscar todas las asociaciones de tutores
    let query = {
      status: 'active'
    };

    // Si es adminaccount, filtrar solo por sus cuentas
    if (currentUser.role?.nombre === 'adminaccount') {
      // Usar el middleware global para obtener la institución
      if (req.userInstitution) {
        console.log('🏢 Institución del usuario:', req.userInstitution.nombre, req.userInstitution._id);
        
        // Filtrar tutores de esta cuenta
        query.account = req.userInstitution._id;
        console.log('👥 Filtrando tutores de la cuenta:', req.userInstitution._id);
      } else {
        console.log('⚠️ Usuario sin institución asignada');
        query.account = null; // No mostrar tutores
      }
    }

    const tutorAssociations = await Shared.find(query).populate([
      {
        path: 'user',
        select: 'name email status createdAt'
      },
      {
        path: 'role',
        select: 'nombre descripcion'
      },
      {
        path: 'account',
        select: 'nombre razonSocial'
      },
      {
        path: 'division',
        select: 'nombre descripcion'
      },
      {
        path: 'student',
        select: 'nombre apellido'
      }
    ]);

    // Filtrar solo los tutores (familyadmin) y que tengan usuario válido
    const tutores = tutorAssociations.filter(association => 
      association.role?.nombre === 'familyadmin' && association.user
    );

    console.log(`📊 Encontrados ${tutores.length} tutores totales`);

    res.json({
      success: true,
      data: {
        tutores: tutores.map(association => ({
          _id: association.user?._id || null,
          nombre: association.user?.name || 'N/A',
          email: association.user?.email || 'N/A',
          activo: association.user?.status === 'approved',
          asociacionId: association._id,
          fechaAsociacion: association.createdAt,
          division: association.division ? {
            _id: association.division._id,
            nombre: association.division.nombre,
            descripcion: association.division.descripcion
          } : null,
          account: association.account ? {
            _id: association.account._id,
            nombre: association.account.nombre,
            razonSocial: association.account.razonSocial
          } : null,
          student: association.student ? {
            _id: association.student._id,
            nombre: association.student.nombre,
            apellido: association.student.apellido
          } : null
        }))
      }
    });

  } catch (error) {
    console.error('Error obteniendo tutores:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para obtener tutores por división
app.get('/tutors/by-division/:divisionId', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { divisionId } = req.params;
    const { userId } = req.user;

    console.log('🔍 Obteniendo tutores para división:', divisionId);

    // Verificar que la división existe
    const division = await Grupo.findById(divisionId);
    if (!division) {
      return res.status(404).json({
        success: false,
        message: 'División no encontrada'
      });
    }

    // Verificar permisos del usuario
    let currentUser;
    if (req.user.isCognitoUser) {
      // Para usuarios de Cognito, buscar por email
      currentUser = await User.findOne({ email: req.user.email }).populate('role');
    } else {
      // Para usuarios legacy, buscar por ID
      currentUser = await User.findById(userId).populate('role');
    }
    
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Solo superadmin y adminaccount pueden ver tutores
    if (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver tutores'
      });
    }

    // Si es adminaccount, verificar que pertenece a la cuenta de la división
    if (currentUser.role?.nombre === 'adminaccount') {
      // Verificar acceso a la división comparando la cuenta
      if (req.userInstitution && division.cuenta.toString() !== req.userInstitution._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para ver tutores de esta división'
        });
      }
    }

    // Buscar todas las asociaciones de tutores para esta división
    const tutorAssociations = await Shared.find({
      division: divisionId,
      status: 'active'
    }).populate([
      {
        path: 'user',
        select: 'name email status createdAt'
      },
      {
        path: 'role',
        select: 'nombre descripcion'
      },
      {
        path: 'student',
        select: 'nombre apellido'
      }
    ]);

    // Filtrar solo los tutores (familyadmin) y que tengan usuario válido
    const tutores = tutorAssociations.filter(association => 
      association.role?.nombre === 'familyadmin' && association.user
    );

    console.log(`📊 Encontrados ${tutores.length} tutores para la división ${division.nombre}`);

    res.json({
      success: true,
      data: {
        division: {
          _id: division._id,
          nombre: division.nombre,
          descripcion: division.descripcion
        },
        tutores: tutores.map(association => ({
          _id: association.user?._id || null,
          nombre: association.user?.name || 'N/A',
          email: association.user?.email || 'N/A',
          activo: association.user?.status === 'approved',
          asociacionId: association._id,
          fechaAsociacion: association.createdAt,
          student: association.student ? {
            _id: association.student._id,
            nombre: association.student.nombre,
            apellido: association.student.apellido
          } : null
        }))
      }
    });

  } catch (error) {
    console.error('Error obteniendo tutores por división:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para eliminar alumno
app.delete('/students/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;

    // Verificar que el alumno existe
    const student = await Student.findById(id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Alumno no encontrado'
      });
    }

    // Verificar permisos
    const user = await User.findById(userId).populate('role');
    const userAssociation = await Shared.findOne({
      user: userId,
      account: student.account,
      status: 'active'
    });

    if (!userAssociation && user.role?.nombre !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar este alumno'
      });
    }

    // Eliminar el alumno completamente de la base de datos
    await Student.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Alumno eliminado correctamente'
    });
  } catch (error) {
    console.error('Error eliminando alumno:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para guardar asistencia
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

// ==================== ENDPOINTS DE CÓDIGOS QR ====================

// Generar códigos QR para estudiantes que no los tengan
app.post('/students/generate-qr-codes', authenticateToken, async (req, res) => {
  try {
    const { accountId, divisionId } = req.body;
    
    if (!accountId || !divisionId) {
      return res.status(400).json({ 
        success: false, 
        message: 'accountId y divisionId son requeridos' 
      });
    }

    // Buscar estudiantes sin código QR
    const studentsWithoutQR = await Student.find({
      account: accountId,
      division: divisionId,
      $or: [
        { qrCode: { $exists: false } },
        { qrCode: null },
        { qrCode: '' }
      ]
    });

    console.log(`🔍 [QR GENERATION] Estudiantes sin QR encontrados: ${studentsWithoutQR.length}`);

    let generatedCount = 0;
    const results = [];

    for (const student of studentsWithoutQR) {
      try {
        // Generar código QR único
        let qrCode;
        let attempts = 0;
        const maxAttempts = 10;

        do {
          qrCode = student.generateQRCode();
          attempts++;
          
          // Verificar que no exista otro estudiante con el mismo código
          const existingStudent = await Student.findOne({ qrCode });
          if (!existingStudent) {
            break;
          }
        } while (attempts < maxAttempts);

        if (attempts >= maxAttempts) {
          console.error(`❌ [QR GENERATION] No se pudo generar código único para estudiante ${student._id}`);
          results.push({
            studentId: student._id,
            studentName: student.getFullName(),
            success: false,
            error: 'No se pudo generar código único'
          });
          continue;
        }

        // Actualizar el estudiante con el código QR
        student.qrCode = qrCode;
        await student.save();

        generatedCount++;
        results.push({
          studentId: student._id,
          studentName: student.getFullName(),
          qrCode: qrCode,
          success: true
        });

        console.log(`✅ [QR GENERATION] Código generado para ${student.getFullName()}: ${qrCode}`);

      } catch (error) {
        console.error(`❌ [QR GENERATION] Error generando QR para estudiante ${student._id}:`, error);
        results.push({
          studentId: student._id,
          studentName: student.getFullName(),
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      data: {
        totalProcessed: studentsWithoutQR.length,
        generatedCount: generatedCount,
        results: results
      }
    });

  } catch (error) {
    console.error('❌ [QR GENERATION] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// Buscar estudiante por código QR
app.get('/students/by-qr/:qrCode', authenticateToken, async (req, res) => {
  try {
    const { qrCode } = req.params;
    
    if (!qrCode) {
      return res.status(400).json({ 
        success: false, 
        message: 'Código QR es requerido' 
      });
    }

    const student = await Student.findOne({ qrCode })
      .populate('account', 'nombre razonSocial')
      .populate('division', 'nombre descripcion');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado'
      });
    }

    res.json({
      success: true,
      data: {
        _id: student._id,
        nombre: student.nombre,
        apellido: student.apellido,
        dni: student.dni,
        email: student.email,
        account: student.account,
        division: student.division,
        qrCode: student.qrCode
      }
    });

  } catch (error) {
    console.error('❌ [QR SEARCH] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

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

// Obtener un estudiante específico con información de tutores
app.get('/students/:studentId', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    
    if (!studentId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID del estudiante es requerido' 
      });
    }

    const student = await Student.findById(studentId)
      .populate('account', 'nombre razonSocial')
      .populate('division', 'nombre descripcion');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado'
      });
    }

    // Buscar tutores asociados al estudiante
    const tutors = await Shared.find({
      student: studentId,
      status: 'active'
    })
    .populate('user', 'name email dni')
    .populate('role', 'nombre descripcion');

    // Organizar tutores por rol
    const tutorInfo = {
      familyadmin: null,
      familyviewer: null
    };

    tutors.forEach(tutor => {
      if (tutor.role && tutor.user) {
        if (tutor.role.nombre === 'familyadmin') {
          tutorInfo.familyadmin = {
            _id: tutor.user._id,
            name: tutor.user.name,
            email: tutor.user.email,
            dni: tutor.user.dni || null
          };
        } else if (tutor.role.nombre === 'familyviewer') {
          tutorInfo.familyviewer = {
            _id: tutor.user._id,
            name: tutor.user.name,
            email: tutor.user.email,
            dni: tutor.user.dni || null
          };
        }
      }
    });

    res.json({
      success: true,
      data: {
        _id: student._id,
        nombre: student.nombre,
        apellido: student.apellido,
        dni: student.dni,
        email: student.email,
        account: student.account,
        division: student.division,
        tutor: tutorInfo,
        qrCode: student.qrCode
      }
    });

  } catch (error) {
    console.error('❌ [STUDENT BY ID] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

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
    console.log('🔔 [PUSH SEND] Enviando push notification para estudiante:', studentId);
    
    // Obtener usuarios familiares
    const familyUsers = await getFamilyUsersForStudent(studentId);
    
    if (familyUsers.length === 0) {
      console.log('🔔 [PUSH SEND] No se encontraron usuarios familiares con dispositivos');
      return { sent: 0, failed: 0 };
    }
    
    const pushNotificationService = require('./pushNotificationService');
    let sent = 0;
    let failed = 0;
    
    // Enviar a cada usuario familiar
    for (const familyUser of familyUsers) {
      for (const device of familyUser.devices) {
        try {
          const pushNotification = {
            title: notification.title,
            message: notification.message,
            data: {
              type: 'notification',
              notificationId: notification._id,
              studentId: studentId,
              priority: notification.priority || 'normal'
            }
          };
          
          await pushNotificationService.sendNotification(
            device.pushToken,
            device.platform,
            pushNotification
          );
          
          // Actualizar último uso del dispositivo
          await device.updateLastUsed();
          
          sent++;
          console.log('🔔 [PUSH SEND] ✅ Enviado a:', familyUser.user.name, '-', device.platform);
          
        } catch (error) {
          failed++;
          console.error('🔔 [PUSH SEND] ❌ Error enviando a:', familyUser.user.name, '-', error.message);
          
          // Si el token es inválido, desactivar el dispositivo
          if (error.message.includes('InvalidRegistration') || error.message.includes('NotRegistered')) {
            await device.deactivate();
            console.log('🔔 [PUSH SEND] Dispositivo desactivado por token inválido');
          }
        }
      }
    }
    
    console.log('🔔 [PUSH SEND] Resumen - Enviados:', sent, 'Fallidos:', failed);
    return { sent, failed };
    
  } catch (error) {
    console.error('❌ [PUSH SEND] Error general:', error);
    return { sent: 0, failed: 1 };
  }
}

// ==================== ENDPOINTS DE PUSH NOTIFICATIONS ====================

// Registrar token de dispositivo para push notifications
app.post('/push/register-token', authenticateToken, async (req, res) => {
  try {
    const { token, platform, deviceId, appVersion, osVersion } = req.body;
    const userId = req.user.userId;

    console.log('🔔 [PUSH REGISTER] Registrando token para usuario:', userId);

    // Validar campos requeridos
    if (!token || !platform) {
      return res.status(400).json({
        success: false,
        message: 'Token y platform son requeridos'
      });
    }

    // Validar plataforma
    if (!['ios', 'android'].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: 'Platform debe ser "ios" o "android"'
      });
    }

    // Buscar o crear dispositivo
    const device = await Device.findOneAndUpdate(
      { 
        userId: userId,
        pushToken: token 
      },
      {
        userId: userId,
        pushToken: token,
        platform: platform,
        deviceId: deviceId || null,
        appVersion: appVersion || null,
        osVersion: osVersion || null,
        isActive: true,
        lastUsed: new Date()
      },
      { 
        upsert: true, 
        new: true 
      }
    );

    console.log('🔔 [PUSH REGISTER] Token registrado exitosamente:', device._id);

    res.json({
      success: true,
      message: 'Token registrado exitosamente',
      data: {
        deviceId: device._id,
        platform: device.platform,
        isActive: device.isActive
      }
    });

  } catch (error) {
    console.error('❌ [PUSH REGISTER] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registrando token de dispositivo'
    });
  }
});

// Desregistrar token de dispositivo
app.post('/push/unregister-token', authenticateToken, async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.userId;

    console.log('🔔 [PUSH UNREGISTER] Desregistrando token para usuario:', userId);

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token es requerido'
      });
    }

    // Desactivar dispositivo
    const device = await Device.findOneAndUpdate(
      { 
        userId: userId,
        pushToken: token 
      },
      { 
        isActive: false,
        lastUsed: new Date()
      },
      { new: true }
    );

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Token no encontrado'
      });
    }

    console.log('🔔 [PUSH UNREGISTER] Token desregistrado exitosamente');

    res.json({
      success: true,
      message: 'Token desregistrado exitosamente'
    });

  } catch (error) {
    console.error('❌ [PUSH UNREGISTER] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error desregistrando token de dispositivo'
    });
  }
});

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

// Listar asistencias por cuenta
app.get('/asistencias', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { accountId, grupoId, alumnoId, fechaInicio, fechaFin, page = 1, limit = 20 } = req.query;
    const currentUser = req.user;

    // Verificar permisos
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver asistencias'
      });
    }

    let query = { activo: true };

    // Filtro por cuenta según el rol del usuario
    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin puede ver todas las asistencias
      if (accountId) {
        query.account = accountId;
      }
    } else if (currentUser.role?.nombre === 'adminaccount') {
      // Adminaccount solo puede ver asistencias de sus cuentas
      const userAccounts = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      }).select('account');
      
      const accountIds = userAccounts.map(ah => ah.account);
      query.account = { $in: accountIds };
      
      if (accountId) {
        // Verificar que la cuenta solicitada pertenece al usuario
        if (!accountIds.includes(accountId)) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para ver asistencias de esta cuenta'
          });
        }
        query.account = accountId;
      }
    } else if (currentUser.role?.nombre === 'coordinador') {
      // Coordinador puede ver asistencias de sus grupos
      if (accountId) {
        query.account = accountId;
      }
    }

    // Filtros adicionales
    if (grupoId) {
      query.division = grupoId;
    }
    
    if (alumnoId) {
      query.alumno = alumnoId;
    }
    
    if (fechaInicio && fechaFin) {
      query.fecha = {
        $gte: fechaInicio,
        $lte: fechaFin
      };
    }

    // Obtener datos reales de la base de datos
    const total = await Asistencia.countDocuments(query);
    const asistencias = await Asistencia.find(query)
      .populate('alumno', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('grupo', 'nombre descripcion')
      .populate('registradoPor', 'name email')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ fecha: -1, horaLlegada: -1 });

    res.json({
      success: true,
      data: {
        asistencias: asistencias.map(asistencia => ({
          _id: asistencia._id,
          alumno: asistencia.alumno,
          account: asistencia.account,
          grupo: asistencia.grupo,
          fecha: asistencia.fecha,
          estado: asistencia.estado,
          horaLlegada: asistencia.horaLlegada,
          horaSalida: asistencia.horaSalida,
          observaciones: asistencia.observaciones,
          registradoPor: asistencia.registradoPor,
          activo: asistencia.activo,
          createdAt: asistencia.createdAt,
          updatedAt: asistencia.updatedAt
        })),
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error listando asistencias:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

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

    res.json({
      success: true,
      message: 'Logo actualizado exitosamente',
      data: {
        accountId: account._id,
        logo: account.logo,
        logoUrl: `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${imageKey}`
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

    const logoUrl = account.logo 
      ? `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${account.logo}`
      : null;

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

// Obtener resumen de asistencias para calendario (solo fechas con asistencias)
app.get('/backoffice/asistencias/calendar', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { 
      grupoId,
      fechaInicio,
      fechaFin
    } = req.query;
    
    console.log('📅 [CALENDAR ASISTENCIAS] Parámetros:', { grupoId, fechaInicio, fechaFin });
    
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
    let query = {};
    
    // Lógica según el rol
    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin ve todas las asistencias
    } else if (currentUser.role?.nombre === 'adminaccount') {
      // Adminaccount ve todas las asistencias de su cuenta
      if (req.userInstitution) {
        query.account = req.userInstitution._id;
      } else {
        return res.status(403).json({
          success: false,
          message: 'No tienes una institución asignada'
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para acceder a esta sección'
      });
    }
    
    // Filtros adicionales
    if (grupoId) {
      query.division = grupoId;
    }
    
    if (fechaInicio && fechaFin) {
      query.fecha = {
        $gte: fechaInicio,
        $lte: fechaFin
      };
    }
    
    console.log('📅 [CALENDAR ASISTENCIAS] Query:', JSON.stringify(query, null, 2));
    
    // Obtener solo fechas y conteos (sin populate para mejor rendimiento)
    const asistencias = await Asistencia.find(query)
      .select('fecha estudiantes')
      .sort({ fecha: -1 });
    
    // Crear mapa de fechas con conteos
    const calendarData = {};
    asistencias.forEach(asistencia => {
      calendarData[asistencia.fecha] = {
        fecha: asistencia.fecha,
        totalEstudiantes: asistencia.estudiantes.length,
        presentes: asistencia.estudiantes.filter(e => e.presente).length,
        ausentes: asistencia.estudiantes.filter(e => !e.presente).length
      };
    });
    
    console.log('📅 [CALENDAR ASISTENCIAS] Datos del calendario:', Object.keys(calendarData).length, 'días');
    
    res.json({
      success: true,
      data: calendarData
    });

  } catch (error) {
    console.error('❌ [CALENDAR ASISTENCIAS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener datos del calendario'
    });
  }
});

// Obtener asistencias detalladas para un día específico
app.get('/backoffice/asistencias/day/:fecha', authenticateToken, async (req, res) => {
  try {
    const { fecha } = req.params;
    const { grupoId } = req.query;
    
    console.log('📋 [DAY ASISTENCIAS] Fecha:', fecha);
    console.log('📋 [DAY ASISTENCIAS] GrupoId:', grupoId);
    
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
    
    const userId = currentUser._id;
    console.log('📋 [DAY ASISTENCIAS] Usuario:', userId);
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Construir query base
    let query = { fecha };
    
    // Lógica según el rol
    if (user.role?.nombre === 'superadmin') {
      // Superadmin ve todas las asistencias
    } else if (user.role?.nombre === 'adminaccount') {
      // Adminaccount ve todas las asistencias de su cuenta
      query.account = user.account?._id;
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para acceder a esta sección'
      });
    }
    
    // Filtros adicionales
    if (grupoId) {
      query.division = grupoId;
    }
    
    console.log('📋 [DAY ASISTENCIAS] Query:', JSON.stringify(query, null, 2));
    
    // Obtener asistencias con todos los datos poblados
    const asistencias = await Asistencia.find(query)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('creadoPor', 'nombre email')
      .populate({
        path: 'estudiantes.student',
        select: 'nombre apellido email avatar'
      })
      .sort({ createdAt: -1 })
      .lean(); // Usar lean() para obtener objetos planos
    
    // Hacer populate manual de los estudiantes ya que hay inconsistencia entre modelo y datos
    for (let asistencia of asistencias) {
      for (let estudiante of asistencia.estudiantes) {
        // El campo en los datos reales se llama 'estudiante', no 'student'
        const studentId = estudiante.estudiante || estudiante.student;
        
        if (studentId && mongoose.Types.ObjectId.isValid(studentId)) {
          const studentData = await Student.findById(studentId).select('nombre apellido email avatar');
          if (studentData) {
            // Reemplazar el ID con los datos del estudiante
            estudiante.student = studentData;
          }
        }
      }
    }
    
    console.log('📋 [DAY ASISTENCIAS] Asistencias encontradas:', asistencias.length);
    
    res.json({
      success: true,
      data: asistencias
    });

  } catch (error) {
    console.error('❌ [DAY ASISTENCIAS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener asistencias del día'
    });
  }
});

// Obtener asistencias del backoffice con paginación
app.get('/backoffice/asistencias', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { 
      page = 1, 
      limit = 10, 
      accountId,
      grupoId,
      alumnoId,
      fechaInicio,
      fechaFin,
      estado,
      search
    } = req.query;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS] Usuario:', userId);
    console.log('📊 [BACKOFFICE ASISTENCIAS] Parámetros:', { accountId, grupoId, alumnoId, fechaInicio, fechaFin, estado, search });
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    console.log('📊 [BACKOFFICE ASISTENCIAS] Rol del usuario:', user.role?.nombre);
    
    // Construir query base
    let query = {};
    
    // Lógica según el rol
    if (user.role?.nombre === 'superadmin') {
      // Superadmin ve todas las asistencias de todas las cuentas
      if (accountId) {
        query.account = accountId;
      }
    } else if (user.role?.nombre === 'adminaccount') {
      // Adminaccount ve todas las asistencias de su cuenta
      query.account = user.account?._id;
    } else {
      // Otros roles no tienen acceso al backoffice
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para acceder a esta sección'
      });
    }
    
    // Filtros adicionales
    if (grupoId) {
      query.division = grupoId;
    }
    
    if (alumnoId) {
      query.alumno = alumnoId;
    }
    
    if (fechaInicio && fechaFin) {
      // El campo fecha es String en formato YYYY-MM-DD, no Date
      console.log('📊 [BACKOFFICE ASISTENCIAS] Aplicando filtro de fechas:', { fechaInicio, fechaFin });
      query.fecha = {
        $gte: fechaInicio,
        $lte: fechaFin
      };
    } else if (fechaInicio) {
      console.log('📊 [BACKOFFICE ASISTENCIAS] Aplicando filtro fecha inicio:', fechaInicio);
      query.fecha = { $gte: fechaInicio };
    } else if (fechaFin) {
      console.log('📊 [BACKOFFICE ASISTENCIAS] Aplicando filtro fecha fin:', fechaFin);
      query.fecha = { $lte: fechaFin };
    }
    
    if (estado && estado !== 'all') {
      query.estado = estado;
    }
    
    if (search) {
      query.$or = [
        { 'alumno.nombre': { $regex: search, $options: 'i' } },
        { 'alumno.email': { $regex: search, $options: 'i' } },
        { observaciones: { $regex: search, $options: 'i' } }
      ];
    }
    
    console.log('📊 [BACKOFFICE ASISTENCIAS] Query final:', JSON.stringify(query, null, 2));
    console.log('📊 [BACKOFFICE ASISTENCIAS] Query fecha específico:', JSON.stringify(query.fecha, null, 2));
    
    // Obtener total de asistencias para la paginación
    const total = await Asistencia.countDocuments(query);
    
    // Calcular skip para paginación
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Obtener asistencias con paginación
    const asistencias = await Asistencia.find(query)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('creadoPor', 'nombre email')
      .populate({
        path: 'estudiantes.student',
        select: 'nombre apellido email avatar',
        populate: {
          path: 'avatar',
          select: 'url'
        }
      })
      .sort({ fecha: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    console.log('📊 [BACKOFFICE ASISTENCIAS] Asistencias encontradas:', asistencias.length);
    if (asistencias.length > 0) {
      console.log('📊 [BACKOFFICE ASISTENCIAS] Primera asistencia:', JSON.stringify(asistencias[0], null, 2));
      if (asistencias[0].estudiantes && asistencias[0].estudiantes.length > 0) {
        console.log('📊 [BACKOFFICE ASISTENCIAS] Primer estudiante:', JSON.stringify(asistencias[0].estudiantes[0], null, 2));
      }
    }
    
    // Calcular información de paginación
    const currentPage = parseInt(page);
    const totalPages = Math.ceil(total / parseInt(limit));
    const hasNextPage = currentPage < totalPages;
    const hasPrevPage = currentPage > 1;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS] Asistencias encontradas:', asistencias.length);
    console.log('📊 [BACKOFFICE ASISTENCIAS] Paginación:', { currentPage, totalPages, total });
    
    res.json({
      success: true,
      data: asistencias,
      pagination: {
        currentPage,
        totalPages,
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNextPage,
        hasPrevPage
      }
    });
    
  } catch (error) {
    console.error('❌ [BACKOFFICE ASISTENCIAS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener asistencias'
    });
  }
});

// Crear asistencia desde el backoffice
app.post('/backoffice/asistencias', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { alumnoId, accountId, grupoId, fecha, estado, horaLlegada, horaSalida, observaciones } = req.body;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS CREATE] Usuario:', userId);
    console.log('📊 [BACKOFFICE ASISTENCIAS CREATE] Datos:', { alumnoId, accountId, grupoId, fecha, estado });
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Verificar permisos
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear asistencias'
      });
    }
    
    // Para adminaccount, verificar que la cuenta pertenece al usuario
    if (user.role?.nombre === 'adminaccount' && accountId !== user.account?._id?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear asistencias en esta cuenta'
      });
    }
    
    // Verificar que el alumno existe y pertenece a la cuenta
    const alumno = await User.findById(alumnoId);
    if (!alumno) {
      return res.status(404).json({
        success: false,
        message: 'Alumno no encontrado'
      });
    }
    
    // Verificar que el grupo existe y pertenece a la cuenta (si se proporciona)
    if (grupoId) {
      const grupo = await Group.findById(grupoId);
      if (!grupo || grupo.account.toString() !== accountId) {
        return res.status(404).json({
          success: false,
          message: 'Grupo no encontrado o no pertenece a la cuenta'
        });
      }
    }
    
    // Crear la asistencia
    const nuevaAsistencia = new Asistencia({
      account: accountId,
      division: grupoId,
      fecha: fecha,
      estudiantes: [{
        student: alumnoId,
        presente: estado === 'presente'
      }],
      creadoPor: userId
    });
    
    await nuevaAsistencia.save();
    
    // Poblar los datos para la respuesta
    await nuevaAsistencia.populate('account', 'nombre');
    await nuevaAsistencia.populate('division', 'nombre');
    await nuevaAsistencia.populate('creadoPor', 'nombre email');
    await nuevaAsistencia.populate('estudiantes.student', 'nombre apellido email');
    
    console.log('📊 [BACKOFFICE ASISTENCIAS CREATE] Asistencia creada exitosamente');
    
    res.status(201).json({
      success: true,
      message: 'Asistencia registrada exitosamente',
      data: nuevaAsistencia
    });
    
  } catch (error) {
    console.error('❌ [BACKOFFICE ASISTENCIAS CREATE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear asistencia'
    });
  }
});

// Actualizar asistencia desde el backoffice
app.put('/backoffice/asistencias/:asistenciaId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { asistenciaId } = req.params;
    const { estado, horaLlegada, horaSalida, observaciones } = req.body;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS UPDATE] Usuario:', userId);
    console.log('📊 [BACKOFFICE ASISTENCIAS UPDATE] Asistencia:', asistenciaId);
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Verificar permisos
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar asistencias'
      });
    }
    
    // Buscar la asistencia
    const asistencia = await Asistencia.findById(asistenciaId);
    if (!asistencia) {
      return res.status(404).json({
        success: false,
        message: 'Asistencia no encontrada'
      });
    }
    
    // Para adminaccount, verificar que la asistencia pertenece a su cuenta
    if (user.role?.nombre === 'adminaccount' && asistencia.account.toString() !== user.account?._id?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar esta asistencia'
      });
    }
    
    // Actualizar la asistencia
    const updateData = {};
    if (estado) {
      // Actualizar el estado del estudiante en el array
      updateData.$set = {
        'estudiantes.$.presente': estado === 'presente'
      };
    }
    
    const asistenciaActualizada = await Asistencia.findByIdAndUpdate(
      asistenciaId,
      updateData,
      { new: true }
    ).populate('account', 'nombre')
     .populate('division', 'nombre')
     .populate('creadoPor', 'nombre email')
     .populate('estudiantes.student', 'nombre apellido email');
    
    console.log('📊 [BACKOFFICE ASISTENCIAS UPDATE] Asistencia actualizada exitosamente');
    
    res.json({
      success: true,
      message: 'Asistencia actualizada exitosamente',
      data: asistenciaActualizada
    });
    
  } catch (error) {
    console.error('❌ [BACKOFFICE ASISTENCIAS UPDATE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar asistencia'
    });
  }
});

// Eliminar asistencia desde el backoffice
app.delete('/backoffice/asistencias/:asistenciaId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { asistenciaId } = req.params;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS DELETE] Usuario:', userId);
    console.log('📊 [BACKOFFICE ASISTENCIAS DELETE] Asistencia:', asistenciaId);
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Verificar permisos
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar asistencias'
      });
    }
    
    // Buscar la asistencia
    const asistencia = await Asistencia.findById(asistenciaId);
    if (!asistencia) {
      return res.status(404).json({
        success: false,
        message: 'Asistencia no encontrada'
      });
    }
    
    // Para adminaccount, verificar que la asistencia pertenece a su cuenta
    if (user.role?.nombre === 'adminaccount' && asistencia.account.toString() !== user.account?._id?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar esta asistencia'
      });
    }
    
    // Eliminar la asistencia
    await Asistencia.findByIdAndDelete(asistenciaId);
    
    console.log('📊 [BACKOFFICE ASISTENCIAS DELETE] Asistencia eliminada exitosamente');
    
    res.json({
      success: true,
      message: 'Asistencia eliminada exitosamente'
    });
    
  } catch (error) {
    console.error('❌ [BACKOFFICE ASISTENCIAS DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar asistencia'
    });
  }
});

// Obtener estadísticas de asistencias
app.get('/backoffice/asistencias/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { accountId, fechaInicio, fechaFin } = req.query;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS STATS] Usuario:', userId);
    console.log('📊 [BACKOFFICE ASISTENCIAS STATS] Parámetros:', { accountId, fechaInicio, fechaFin });
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Verificar permisos
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver estadísticas'
      });
    }
    
    // Construir query base
    let query = {};
    
    // Lógica según el rol
    if (user.role?.nombre === 'superadmin') {
      if (accountId) {
        query.account = accountId;
      }
    } else if (user.role?.nombre === 'adminaccount') {
      query.account = user.account?._id;
    }
    
    // Filtros de fecha
    if (fechaInicio && fechaFin) {
      query.fecha = {
        $gte: fechaInicio,
        $lte: fechaFin
      };
    } else if (fechaInicio) {
      query.fecha = { $gte: new Date(fechaInicio) };
    } else if (fechaFin) {
      query.fecha = { $lte: fechaFin };
    }
    
    // Obtener estadísticas
    const totalAsistencias = await Asistencia.countDocuments(query);
    
    const statsPorEstado = await Asistencia.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$estado',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const statsPorDia = await Asistencia.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$fecha' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 30 }
    ]);
    
    console.log('📊 [BACKOFFICE ASISTENCIAS STATS] Estadísticas calculadas exitosamente');
    
    res.json({
      success: true,
      data: {
        totalAsistencias,
        statsPorEstado,
        statsPorDia
      }
    });
    
  } catch (error) {
    console.error('❌ [BACKOFFICE ASISTENCIAS STATS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas'
    });
  }
});

// Exportar asistencias a CSV
app.get('/backoffice/asistencias/export', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { accountId, grupoId, fechaInicio, fechaFin, estado } = req.query;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS EXPORT] Usuario:', userId);
    console.log('📊 [BACKOFFICE ASISTENCIAS EXPORT] Parámetros:', { accountId, grupoId, fechaInicio, fechaFin, estado });
    
    // Obtener información del usuario para verificar su rol
    const user = await User.findById(userId).populate('role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Verificar permisos
    if (user.role?.nombre !== 'superadmin' && user.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para exportar asistencias'
      });
    }
    
    // Construir query base
    let query = {};
    
    // Lógica según el rol
    if (user.role?.nombre === 'superadmin') {
      if (accountId) {
        query.account = accountId;
      }
    } else if (user.role?.nombre === 'adminaccount') {
      query.account = user.account?._id;
    }
    
    // Filtros adicionales
    if (grupoId) {
      query.division = grupoId;
    }
    
    if (fechaInicio && fechaFin) {
      query.fecha = {
        $gte: fechaInicio,
        $lte: fechaFin
      };
    } else if (fechaInicio) {
      query.fecha = { $gte: new Date(fechaInicio) };
    } else if (fechaFin) {
      query.fecha = { $lte: fechaFin };
    }
    
    if (estado && estado !== 'all') {
      query.estado = estado;
    }
    
    // Obtener asistencias
    const asistencias = await Asistencia.find(query)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('creadoPor', 'nombre email')
      .populate('estudiantes.student', 'nombre apellido email')
      .sort({ fecha: -1, createdAt: -1 });
    
    // Generar CSV
    const csvHeader = 'Fecha,Alumno,Email,Cuenta,Grupo,Estado,Hora Llegada,Hora Salida,Observaciones,Registrado Por\n';
    
    const csvRows = asistencias.flatMap(asistencia => {
      const fecha = new Date(asistencia.fecha).toLocaleDateString('es-ES');
      const cuenta = asistencia.account?.nombre || 'N/A';
      const grupo = asistencia.division?.nombre || 'N/A';
      const registradoPor = asistencia.creadoPor?.nombre || 'N/A';
      
      return asistencia.estudiantes.map(estudiante => {
        const alumno = estudiante.student ? `${estudiante.student.nombre} ${estudiante.student.apellido}` : 'N/A';
        const email = estudiante.student?.email || 'N/A';
        const estado = estudiante.presente ? 'presente' : 'ausente';
        
        return `"${fecha}","${alumno}","${email}","${cuenta}","${grupo}","${estado}","N/A","N/A","N/A","${registradoPor}"`;
      });
    }).join('\n');
    
    const csvContent = csvHeader + csvRows;
    
    console.log('📊 [BACKOFFICE ASISTENCIAS EXPORT] CSV generado exitosamente');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="asistencias_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
    
  } catch (error) {
    console.error('❌ [BACKOFFICE ASISTENCIAS EXPORT] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al exportar asistencias'
    });
  }
});

// ========================================
// ENDPOINTS CRUD PARA PICKUP (QUIÉN RETIRA)
// ========================================

// Obtener todas las personas autorizadas por cuenta (para backoffice)
app.get('/pickup/account/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { page = 1, limit = 20, division, student } = req.query;
    
    let query = { account: accountId, status: 'active' };
    
    if (division) {
      query.division = division;
    }
    
    if (student) {
      query.student = student;
    }
    
    const skip = (page - 1) * limit;
    
    const pickups = await Pickup.find(query)
      .populate('division', 'nombre')
      .populate({
        path: 'student',
        select: 'nombre apellido tutor',
        populate: {
          path: 'tutor',
          select: 'name apellido nombre email'
        }
      })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Pickup.countDocuments(query);
    
    res.json({
      success: true,
      data: pickups,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error al obtener personas autorizadas:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Obtener personas autorizadas por estudiante (para mobile)
app.get('/pickup/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const pickups = await Pickup.find({ student: studentId, status: 'active' })
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('student', 'nombre apellido')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: pickups
    });
  } catch (error) {
    console.error('Error al obtener personas autorizadas por estudiante:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Crear nueva persona autorizada
app.post('/pickup', async (req, res) => {
  try {
    const { account, division, student, nombre, apellido, dni, createdBy } = req.body;
    
    // Validar que no exista una persona con el mismo DNI para el mismo estudiante
    const existingPickup = await Pickup.findOne({ 
      student, 
      dni, 
      status: 'active' 
    });
    
    if (existingPickup) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una persona autorizada con este DNI para este estudiante'
      });
    }
    
    const pickup = new Pickup({
      account,
      division,
      student,
      nombre,
      apellido,
      dni,
      createdBy
    });
    
    await pickup.save();
    
    const populatedPickup = await Pickup.findById(pickup._id)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('student', 'nombre apellido')
      .populate('createdBy', 'name');
    
    res.status(201).json({
      success: true,
      data: populatedPickup,
      message: 'Persona autorizada creada correctamente'
    });
  } catch (error) {
    console.error('Error al crear persona autorizada:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Actualizar persona autorizada
app.put('/pickup/:pickupId', async (req, res) => {
  try {
    const { pickupId } = req.params;
    const { nombre, apellido, dni } = req.body;
    
    const pickup = await Pickup.findById(pickupId);
    if (!pickup) {
      return res.status(404).json({ success: false, message: 'Persona autorizada no encontrada' });
    }
    
    // Validar que no exista otra persona con el mismo DNI para el mismo estudiante
    if (dni && dni !== pickup.dni) {
      const existingPickup = await Pickup.findOne({ 
        student: pickup.student, 
        dni, 
        status: 'active',
        _id: { $ne: pickupId }
      });
      
      if (existingPickup) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe una persona autorizada con este DNI para este estudiante'
        });
      }
    }
    
    if (nombre) pickup.nombre = nombre;
    if (apellido) pickup.apellido = apellido;
    if (dni) pickup.dni = dni;
    
    await pickup.save();
    
    const updatedPickup = await Pickup.findById(pickupId)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('student', 'nombre apellido')
      .populate('createdBy', 'name');
    
    res.json({
      success: true,
      data: updatedPickup,
      message: 'Persona autorizada actualizada correctamente'
    });
  } catch (error) {
    console.error('Error al actualizar persona autorizada:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Eliminar persona autorizada (soft delete)
app.delete('/pickup/:pickupId', async (req, res) => {
  try {
    const { pickupId } = req.params;
    
    const pickup = await Pickup.findById(pickupId);
    if (!pickup) {
      return res.status(404).json({ success: false, message: 'Persona autorizada no encontrada' });
    }
    
    pickup.status = 'inactive';
    await pickup.save();
    
    res.json({
      success: true,
      message: 'Persona autorizada eliminada correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar persona autorizada:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// ========================================
// ENDPOINTS ADICIONALES PARA PICKUP SECTION
// ========================================

// Obtener divisiones por cuenta (para el frontend de pickup)
app.get('/divisions/account/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    
    // Buscar grupos que pertenecen a esta cuenta
    const grupos = await Grupo.find({ cuenta: accountId, activo: true })
      .populate('cuenta', 'nombre')
      .sort({ nombre: 1 });
    
    // Transformar grupos a formato de divisiones
    const divisions = grupos.map(grupo => ({
      _id: grupo._id,
      nombre: grupo.nombre
    }));
    
    res.json({
      success: true,
      data: divisions
    });
  } catch (error) {
    console.error('Error al obtener divisiones por cuenta:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Obtener estudiantes por división (para el frontend de pickup)
app.get('/students/division/:divisionId', async (req, res) => {
  try {
    const { divisionId } = req.params;
    
    // Buscar estudiantes que pertenecen a esta división (grupo)
    const students = await Student.find({ division: divisionId })
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .sort({ apellido: 1, nombre: 1 });
    
    res.json({
      success: true,
      data: students
    });
  } catch (error) {
    console.error('Error al obtener estudiantes por división:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// ========================================
// ENDPOINTS ESPECÍFICOS PARA MOBILE APP
// ========================================

// Obtener pickups para familyadmin por institución + división
app.get('/pickups/familyadmin', authenticateToken, async (req, res) => {
  try {
    console.log('🎯 [PICKUP FAMILYADMIN GET] Obteniendo pickups');
    const { userId } = req.user;
    const { division, student, page = 1, limit = 20 } = req.query;
    
    console.log('👤 [PICKUP FAMILYADMIN GET] Usuario:', userId);
    console.log('📋 [PICKUP FAMILYADMIN GET] Query params:', { division, student, page, limit });
    
    // Verificar que el usuario tiene una asociación activa con rol familyadmin
    const activeAssociation = await ActiveAssociation.getActiveAssociation(userId);
    if (!activeAssociation || activeAssociation.role.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores familiares pueden acceder a esta información'
      });
    }
    
    // Obtener todas las asociaciones del usuario
    const userAssociations = await Shared.find({
      user: userId,
      status: 'active'
    }).populate('account division student');
    
    console.log('🔍 [PICKUP FAMILYADMIN GET] Asociaciones encontradas:', userAssociations.length);
    console.log('👥 [PICKUP FAMILYADMIN GET] Asociaciones:', userAssociations.map(assoc => ({
      account: assoc.account?.nombre,
      division: assoc.division?.nombre,
      student: assoc.student ? `${assoc.student.nombre} ${assoc.student.apellido}` : 'Sin estudiante'
    })));
    
    if (userAssociations.length === 0) {
      console.log('❌ [PICKUP FAMILYADMIN GET] No hay asociaciones activas');
      return res.json({
        success: true,
        data: {
          pickups: [],
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit)
        }
      });
    }
    
    // Construir query para buscar pickups de los estudiantes asociados al usuario
    const studentIds = userAssociations
      .filter(assoc => assoc.student)
      .map(assoc => assoc.student._id);
    
    console.log('🎓 [PICKUP FAMILYADMIN GET] Student IDs:', studentIds);
    
    let query = {
      status: 'active'
    };
    
    // Filtrar por división si se especifica
    if (division && division !== 'all') {
      query.division = division;
      console.log('🔍 [PICKUP FAMILYADMIN GET] Filtrando por división:', division);
    }
    
    // Filtrar por estudiante si se especifica
    if (student && student !== 'all') {
      query.student = student;
      console.log('🔍 [PICKUP FAMILYADMIN GET] Filtrando por estudiante:', student);
    } else if (studentIds.length > 0) {
      // Solo buscar por student si no se especifica un estudiante específico
      query.student = { $in: studentIds };
      console.log('🔍 [PICKUP FAMILYADMIN GET] Filtrando por studentIds:', studentIds);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    console.log('🔍 [PICKUP FAMILYADMIN GET] Query final:', JSON.stringify(query, null, 2));
    
    const pickups = await Pickup.find(query)
      .populate('account', 'nombre')
      .populate('student', 'nombre apellido')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Pickup.countDocuments(query);
    
    console.log('📦 [PICKUP FAMILYADMIN GET] Pickups encontrados:', pickups.length);
    console.log('📊 [PICKUP FAMILYADMIN GET] Total en BD:', total);
    
    res.json({
      success: true,
      data: {
        pickups,
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error al obtener pickups para familyadmin:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Crear pickup para familyadmin
app.post('/pickups/familyadmin', authenticateToken, async (req, res) => {
  try {
    console.log('🎯 [PICKUP FAMILYADMIN] Iniciando creación de pickup');
    const { userId } = req.user;
    const { nombre, apellido, dni, divisionId } = req.body;
    
    console.log('👤 [PICKUP FAMILYADMIN] Usuario:', userId);
    console.log('📝 [PICKUP FAMILYADMIN] Datos recibidos:', {
      nombre, apellido, dni, divisionId
    });
    
    // Verificar que el usuario es familyadmin
    const user = await User.findById(userId).populate('role');
    if (user.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores familiares pueden crear personas autorizadas'
      });
    }
    
    // Buscar la asociación del usuario para obtener la institución y estudiante
    const userAssociation = await Shared.findOne({
      user: userId,
      status: 'active'
    }).populate('account student');
    
    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes asociaciones activas'
      });
    }
    
    // Verificar que el usuario tiene un estudiante asociado
    if (!userAssociation.student) {
      return res.status(404).json({
        success: false,
        message: 'No tienes estudiantes asociados'
      });
    }
    
    // Validar que no exista una persona con el mismo DNI para el mismo estudiante
    const existingPickup = await Pickup.findOne({ 
      student: userAssociation.student._id, 
      dni, 
      status: 'active' 
    });
    
    if (existingPickup) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una persona autorizada con este DNI para este estudiante'
      });
    }
    
    const pickup = new Pickup({
      account: userAssociation.account._id,
      division: divisionId,
      student: userAssociation.student._id,
      nombre,
      apellido,
      dni,
      createdBy: userId
    });
    
    await pickup.save();
    
    const populatedPickup = await Pickup.findById(pickup._id)
      .populate('account', 'nombre')
      .populate('student', 'nombre apellido')
      .populate('createdBy', 'name');
    
    res.status(201).json({
      success: true,
      data: {
        pickup: populatedPickup
      },
      message: 'Persona autorizada creada correctamente'
    });
  } catch (error) {
    console.error('Error al crear pickup para familyadmin:', error);
    
    // Manejar errores de validación de Mongoose
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false, 
        message: 'Error de validación',
        errors: validationErrors
      });
    }
    
    // Manejar otros errores
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Eliminar pickup
app.delete('/pickup/:id', authenticateToken, async (req, res) => {
  try {
    console.log('🗑️ [PICKUP DELETE] Eliminando pickup:', req.params.id);
    const { userId } = req.user;
    const { id } = req.params;
    
    // Verificar que el usuario es familyadmin
    const user = await User.findById(userId).populate('role');
    if (user.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores familiares pueden eliminar personas autorizadas'
      });
    }
    
    // Buscar el pickup
    const pickup = await Pickup.findById(id);
    if (!pickup) {
      return res.status(404).json({
        success: false,
        message: 'Persona autorizada no encontrada'
      });
    }
    
    // Verificar que el usuario tiene permisos para eliminar este pickup
    const userAssociation = await Shared.findOne({
      user: userId,
      student: pickup.student,
      status: 'active'
    });
    
    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar esta persona autorizada'
      });
    }
    
    // Eliminar el pickup (soft delete)
    pickup.status = 'inactive';
    await pickup.save();
    
    console.log('✅ [PICKUP DELETE] Pickup eliminado correctamente');
    
    res.json({
      success: true,
      message: 'Persona autorizada eliminada correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar pickup:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

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
        await sendNotificationEmail(
          user.email,
          'Asociación a Institución',
          `Has sido asociado a la institución <strong>${account.nombre}</strong> con el rol <strong>${role.nombre}</strong>. Ya puedes acceder a la aplicación con tus credenciales.`
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
          sendEmailAsync(sendFamilyInvitationEmail, null, newUser.email, newUser.name, randomPassword);
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

// Habilitar 2FA
app.post('/auth/2fa/enable', authenticateToken, async (req, res) => {
  try {
    const { secret, verificationToken } = req.body;
    
    console.log('🔐 [2FA ENABLE] Habilitando 2FA para:', req.user.email);
    
    const result = await TwoFactorAuthService.enable2FA(
      req.user.userId, 
      secret, 
      verificationToken
    );
    
    console.log('✅ [2FA ENABLE] 2FA habilitado exitosamente');
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ [2FA ENABLE] Error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Error habilitando 2FA'
    });
  }
});

// Verificar código 2FA
app.post('/auth/2fa/verify', async (req, res) => {
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

// Habilitar 2FA
app.post('/auth/2fa/enable', authenticateToken, async (req, res) => {
  try {
    const { secret, verificationToken } = req.body;
    
    console.log('🔐 [2FA ENABLE] Habilitando 2FA para:', req.user.email);
    
    const result = await TwoFactorAuthService.enable2FA(
      req.user.userId, 
      secret, 
      verificationToken
    );
    
    console.log('✅ [2FA ENABLE] 2FA habilitado exitosamente');
    
    res.json({
      success: true,
      data: {
        backupCodes: result.backupCodes
      }
    });
  } catch (error) {
    console.error('❌ [2FA ENABLE] Error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Error habilitando 2FA'
    });
  }
});

// Deshabilitar 2FA
app.post('/auth/2fa/disable', authenticateToken, async (req, res) => {
  try {
    const { password } = req.body;
    
    console.log('🔐 [2FA DISABLE] Deshabilitando 2FA para:', req.user.email);
    
    await TwoFactorAuthService.disable2FA(req.user.userId, password);
    
    console.log('✅ [2FA DISABLE] 2FA deshabilitado exitosamente');
    
    res.json({
      success: true,
      message: '2FA deshabilitado exitosamente'
    });
  } catch (error) {
    console.error('❌ [2FA DISABLE] Error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Error deshabilitando 2FA'
    });
  }
});

// Verificar código 2FA
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

// POST /api/form-requests - Crear formulario (Backoffice)
app.post('/api/form-requests', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { nombre, descripcion, status, preguntas } = req.body;
    const user = req.user;
    
    // Verificar permisos: adminaccount, superadmin o coordinador
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear formularios'
      });
    }

    // Obtener accountId según el rol
    let accountId = req.userInstitution?._id;
    if (roleName === 'superadmin' && req.body.account) {
      accountId = req.body.account;
    }
    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo determinar la institución'
      });
    }

    const formRequest = await formRequestService.createFormRequest({
      nombre,
      descripcion,
      account: accountId,
      createdBy: user._id,
      status: status || 'borrador',
      preguntas
    });

    res.json({
      success: true,
      message: 'Formulario creado exitosamente',
      data: formRequest
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error creando formulario:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al crear formulario'
    });
  }
});

// GET /api/form-requests/account/:accountId - Listar formularios de institución (Backoffice)
app.get('/api/form-requests/account/:accountId', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { status } = req.query;
    const user = req.user;
    
    // Verificar permisos
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver formularios'
      });
    }

    // Verificar acceso a la cuenta (si no es superadmin)
    if (roleName !== 'superadmin') {
      const userAccountId = req.userInstitution?._id?.toString();
      if (userAccountId !== accountId) {
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a esta institución'
        });
      }
    }

    const formRequests = await formRequestService.getFormRequestsByAccount(accountId, status);

    // Obtener divisiones asociadas para cada formulario
    const formRequestsWithDivisions = await Promise.all(
      formRequests.map(async (form) => {
        const divisions = await formRequestService.getDivisionsByFormRequest(form._id);
        return {
          ...form.toObject(),
          divisions: divisions.map(d => ({
            _id: d.division._id,
            nombre: d.division.nombre,
            requerido: d.requerido
          }))
        };
      })
    );

    res.json({
      success: true,
      data: formRequestsWithDivisions
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error obteniendo formularios:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener formularios'
    });
  }
});

// GET /api/form-requests/:formId - Obtener formulario por ID (Backoffice)
app.get('/api/form-requests/:formId', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { formId } = req.params;
    const user = req.user;
    
    // Verificar permisos
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver formularios'
      });
    }

    const formRequest = await formRequestService.getFormRequestById(formId);
    
    // Verificar acceso a la cuenta (si no es superadmin)
    if (roleName !== 'superadmin') {
      const userAccountId = req.userInstitution?._id?.toString();
      const formAccountId = formRequest.account._id?.toString();
      if (userAccountId !== formAccountId) {
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a este formulario'
        });
      }
    }

    // Obtener divisiones asociadas
    const divisions = await formRequestService.getDivisionsByFormRequest(formId);

    res.json({
      success: true,
      data: {
        ...formRequest.toObject(),
        divisions: divisions.map(d => ({
          _id: d.division._id,
          nombre: d.division.nombre,
          requerido: d.requerido
        }))
      }
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error obteniendo formulario:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener formulario'
    });
  }
});

// PUT /api/form-requests/:formId - Actualizar formulario (Backoffice)
app.put('/api/form-requests/:formId', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { formId } = req.params;
    const { nombre, descripcion, status, preguntas } = req.body;
    const user = req.user;
    
    // Verificar permisos
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar formularios'
      });
    }

    // Verificar acceso al formulario
    const existingForm = await formRequestService.getFormRequestById(formId);
    if (roleName !== 'superadmin') {
      const userAccountId = req.userInstitution?._id?.toString();
      const formAccountId = existingForm.account._id?.toString();
      if (userAccountId !== formAccountId) {
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a este formulario'
        });
      }
    }

    const updateData = {};
    if (nombre !== undefined) updateData.nombre = nombre;
    if (descripcion !== undefined) updateData.descripcion = descripcion;
    if (status !== undefined) updateData.status = status;
    if (preguntas !== undefined) updateData.preguntas = preguntas;

    const formRequest = await formRequestService.updateFormRequest(formId, updateData);

    res.json({
      success: true,
      message: 'Formulario actualizado exitosamente',
      data: formRequest
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error actualizando formulario:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al actualizar formulario'
    });
  }
});

// DELETE /api/form-requests/:formId - Eliminar formulario (Backoffice)
app.delete('/api/form-requests/:formId', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { formId } = req.params;
    const user = req.user;
    
    // Verificar permisos
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar formularios'
      });
    }

    // Verificar acceso al formulario
    const existingForm = await formRequestService.getFormRequestById(formId);
    if (roleName !== 'superadmin') {
      const userAccountId = req.userInstitution?._id?.toString();
      const formAccountId = existingForm.account._id?.toString();
      if (userAccountId !== formAccountId) {
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a este formulario'
        });
      }
    }

    await formRequestService.deleteFormRequest(formId);

    res.json({
      success: true,
      message: 'Formulario eliminado exitosamente'
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error eliminando formulario:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al eliminar formulario'
    });
  }
});

// POST /api/form-requests/:formId/associate-division - Asociar formulario a división (Backoffice)
app.post('/api/form-requests/:formId/associate-division', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { formId } = req.params;
    const { divisionId, requerido } = req.body;
    const user = req.user;
    
    console.log('📋 [FORM-ASSOCIATE] Iniciando asociación:', { formId, divisionId, requerido, userId: user._id });
    
    // Validar que divisionId esté presente
    if (!divisionId) {
      return res.status(400).json({
        success: false,
        message: 'El ID de la división es requerido'
      });
    }
    
    // Verificar permisos
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para asociar formularios'
      });
    }

    // Verificar acceso al formulario
    const existingForm = await formRequestService.getFormRequestById(formId);
    if (!existingForm) {
      return res.status(404).json({
        success: false,
        message: 'Formulario no encontrado'
      });
    }

    console.log('📋 [FORM-ASSOCIATE] Formulario encontrado:', { 
      formId: existingForm._id, 
      status: existingForm.status,
      account: existingForm.account 
    });

    if (roleName !== 'superadmin') {
      const userAccountId = req.userInstitution?._id?.toString();
      const formAccountId = existingForm.account?._id?.toString() || existingForm.account?.toString();
      console.log('📋 [FORM-ASSOCIATE] Verificando acceso:', { userAccountId, formAccountId });
      if (userAccountId !== formAccountId) {
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a este formulario'
        });
      }
    }

    // Verificar que el formulario esté publicado
    if (existingForm.status !== 'publicado') {
      console.log('📋 [FORM-ASSOCIATE] Formulario no publicado:', existingForm.status);
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden asociar formularios publicados'
      });
    }

    // Obtener accountId
    let accountId = req.userInstitution?._id;
    if (roleName === 'superadmin') {
      accountId = existingForm.account?._id || existingForm.account;
    }

    console.log('📋 [FORM-ASSOCIATE] accountId determinado:', { 
      accountId, 
      accountIdType: typeof accountId,
      roleName,
      userInstitutionId: req.userInstitution?._id,
      formAccountId: existingForm.account?._id || existingForm.account
    });

    if (!accountId) {
      console.error('❌ [FORM-ASSOCIATE] accountId no encontrado:', { 
        roleName, 
        userInstitution: req.userInstitution, 
        formAccount: existingForm.account 
      });
      return res.status(400).json({
        success: false,
        message: 'No se pudo determinar la institución'
      });
    }

    console.log('📋 [FORM-ASSOCIATE] Datos validados:', { formId, divisionId, accountId, requerido, createdBy: user._id });

    let association;
    try {
      association = await formRequestService.associateFormToDivision(
        formId,
        divisionId,
        accountId,
        requerido || false,
        user._id
      );
      console.log('📋 [FORM-ASSOCIATE] Asociación creada exitosamente:', association._id);
    } catch (serviceError) {
      console.error('❌ [FORM-ASSOCIATE] Error en servicio:', serviceError);
      return res.status(400).json({
        success: false,
        message: serviceError.message || 'Error al asociar formulario a división'
      });
    }

    // Enviar notificaciones a tutores de la división
    try {
      console.log('📋 [FORM-ASSOCIATE] Enviando notificaciones a tutores de la división:', divisionId);
      
      // Obtener todos los estudiantes de la división
      const students = await Student.find({
        division: divisionId,
        activo: true
      });

      console.log('📋 [FORM-ASSOCIATE] Estudiantes encontrados:', students.length);

      if (students.length > 0) {
        // Crear notificación para todos los estudiantes
        const studentIds = students.map(student => student._id);
        const formRequest = await formRequestService.getFormRequestById(formId);
        
        const notification = new Notification({
          title: `Nuevo formulario: ${formRequest.nombre}`,
          message: `${formRequest.descripcion || 'Hay un nuevo formulario disponible para completar.'}\n\n${requerido ? '⚠️ Este formulario es requerido y debe ser completado.' : ''}`,
          type: 'informacion',
          sender: user._id,
          account: accountId,
          division: divisionId,
          recipients: studentIds,
          status: 'sent',
          priority: requerido ? 'high' : 'normal'
        });

        await notification.save();
        console.log('📋 [FORM-ASSOCIATE] Notificación creada para', studentIds.length, 'estudiantes');

        // Enviar push notifications a tutores
        let totalSent = 0;
        let totalFailed = 0;

        for (const studentId of studentIds) {
          try {
            const pushResult = await sendPushNotificationToStudentFamily(studentId, notification);
            totalSent += pushResult.sent;
            totalFailed += pushResult.failed;
            console.log('📋 [FORM-ASSOCIATE] Push para estudiante', studentId, '- Enviados:', pushResult.sent, 'Fallidos:', pushResult.failed);
          } catch (pushError) {
            console.error('📋 [FORM-ASSOCIATE] Error enviando push para estudiante', studentId, ':', pushError.message);
            totalFailed++;
          }
        }

        console.log('📋 [FORM-ASSOCIATE] Resumen push notifications - Total enviados:', totalSent, 'Total fallidos:', totalFailed);
      }
    } catch (notificationError) {
      console.error('❌ [FORM-ASSOCIATE] Error enviando notificaciones:', notificationError);
      // No fallar la asociación si fallan las notificaciones
    }

    res.json({
      success: true,
      message: 'Formulario asociado a división exitosamente',
      data: association
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error asociando formulario:', error);
    const statusCode = error.message?.includes('no encontrado') || error.message?.includes('requerido') || error.message?.includes('No se pudo') ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error al asociar formulario'
    });
  }
});

// GET /api/form-requests/:formId/responses - Ver respuestas de un formulario (Backoffice)
app.get('/api/form-requests/:formId/responses', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { formId } = req.params;
    const { divisionId } = req.query;
    const user = req.user;
    
    // Verificar permisos
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver respuestas'
      });
    }

    const responses = await formRequestService.getFormResponses(formId, divisionId);

    res.json({
      success: true,
      data: responses
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error obteniendo respuestas:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener respuestas'
    });
  }
});

// GET /api/form-requests/responses/division/:divisionId - Ver todas las respuestas de una división (Backoffice)
app.get('/api/form-requests/responses/division/:divisionId', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { divisionId } = req.params;
    const user = req.user;
    
    // Verificar permisos
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver respuestas'
      });
    }

    const responses = await formRequestService.getFormResponsesByDivision(divisionId);

    res.json({
      success: true,
      data: responses
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error obteniendo respuestas por división:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener respuestas'
    });
  }
});

// GET /api/form-requests/pending/tutor/:tutorId/student/:studentId - Obtener formularios pendientes (App Móvil)
app.get('/api/form-requests/pending/tutor/:tutorId/student/:studentId', authenticateToken, async (req, res) => {
  try {
    const { tutorId, studentId } = req.params;
    const user = req.user;
    
    console.log('📋 [FORM-REQUESTS] Obteniendo formularios pendientes:', {
      tutorId,
      studentId,
      userId: user._id,
      userRole: user.role?.nombre || user.role
    });
    
    // Verificar que el usuario es el tutor
    if (user._id.toString() !== tutorId) {
      console.log('❌ [FORM-REQUESTS] Usuario no coincide con tutorId');
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver estos formularios'
      });
    }

    // Verificar que el usuario es familyadmin
    const roleName = user.role?.nombre || user.role;
    if (roleName !== 'familyadmin') {
      console.log('❌ [FORM-REQUESTS] Usuario no es familyadmin:', roleName);
      return res.status(403).json({
        success: false,
        message: 'Solo los tutores pueden ver formularios pendientes'
      });
    }

    console.log('📋 [FORM-REQUESTS] Llamando a getPendingFormsForTutor...');
    const pendingForms = await formRequestService.getPendingFormsForTutor(tutorId, studentId);
    console.log('📋 [FORM-REQUESTS] Formularios pendientes encontrados:', pendingForms.length);

    res.json({
      success: true,
      data: pendingForms
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error obteniendo formularios pendientes:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener formularios pendientes'
    });
  }
});

// GET /api/form-requests/all/tutor/:tutorId/student/:studentId - Obtener todos los formularios (pendientes y completados) (App Móvil)
app.get('/api/form-requests/all/tutor/:tutorId/student/:studentId', authenticateToken, async (req, res) => {
  try {
    const { tutorId, studentId } = req.params;
    const user = req.user;
    
    console.log('📋 [FORM-REQUESTS] Obteniendo todos los formularios:', {
      tutorId,
      studentId,
      userId: user._id,
      userRole: user.role?.nombre || user.role
    });
    
    // Verificar que el usuario es el tutor
    if (user._id.toString() !== tutorId) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver estos formularios'
      });
    }

    // Verificar que el usuario es familyadmin
    const roleName = user.role?.nombre || user.role;
    if (roleName !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los tutores pueden ver formularios'
      });
    }

    console.log('📋 [FORM-REQUESTS] Llamando a getAllFormsForTutor...');
    const allForms = await formRequestService.getAllFormsForTutor(tutorId, studentId);
    console.log('📋 [FORM-REQUESTS] Formularios encontrados:', allForms.length);

    res.json({
      success: true,
      data: allForms
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error obteniendo formularios:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener formularios'
    });
  }
});

// POST /api/form-requests/:formId/responses - Guardar/actualizar respuesta (App Móvil)
app.post('/api/form-requests/:formId/responses', authenticateToken, async (req, res) => {
  try {
    const { formId } = req.params;
    const { studentId, respuestas, completado } = req.body;
    const user = req.user;
    
    // Verificar que el usuario es familyadmin
    const roleName = user.role?.nombre || user.role;
    if (roleName !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los tutores pueden completar formularios'
      });
    }

    // Verificar que el estudiante pertenece al tutor
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado'
      });
    }

    if (student.tutor?.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para completar formularios de este estudiante'
      });
    }

    const formResponse = await formRequestService.saveFormResponse(
      formId,
      studentId,
      user._id,
      respuestas,
      completado || false
    );

    res.json({
      success: true,
      message: completado ? 'Formulario completado exitosamente' : 'Borrador guardado exitosamente',
      data: formResponse
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error guardando respuesta:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al guardar respuesta'
    });
  }
});

// PUT /api/form-requests/responses/:responseId/approve - Aprobar respuesta (Backoffice)
app.put('/api/form-requests/responses/:responseId/approve', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { responseId } = req.params;
    const user = req.user;
    
    // Verificar permisos
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para aprobar respuestas'
      });
    }

    const formResponse = await formRequestService.approveFormResponse(responseId, user._id);

    res.json({
      success: true,
      message: 'Respuesta aprobada exitosamente',
      data: formResponse
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error aprobando respuesta:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al aprobar respuesta'
    });
  }
});

// PUT /api/form-requests/responses/:responseId/reject - Rechazar respuesta (Backoffice)
app.put('/api/form-requests/responses/:responseId/reject', authenticateToken, setUserInstitution, async (req, res) => {
  try {
    const { responseId } = req.params;
    const { motivoRechazo } = req.body;
    const user = req.user;
    
    // Verificar permisos
    const roleName = user.role?.nombre || user.role;
    if (!['adminaccount', 'superadmin', 'coordinador'].includes(roleName)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para rechazar respuestas'
      });
    }

    const formResponse = await formRequestService.rejectFormResponse(responseId, user._id, motivoRechazo || '');

    res.json({
      success: true,
      message: 'Respuesta rechazada. El tutor deberá completarla nuevamente.',
      data: formResponse
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error rechazando respuesta:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al rechazar respuesta'
    });
  }
});

// GET /api/form-requests/:formId/responses/student/:studentId - Obtener respuesta guardada (App Móvil)
app.get('/api/form-requests/:formId/responses/student/:studentId', authenticateToken, async (req, res) => {
  try {
    const { formId, studentId } = req.params;
    const user = req.user;
    
    // Verificar que el usuario es familyadmin
    const roleName = user.role?.nombre || user.role;
    if (roleName !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los tutores pueden ver respuestas'
      });
    }

    // Verificar que el estudiante pertenece al tutor
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado'
      });
    }

    if (student.tutor?.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver respuestas de este estudiante'
      });
    }

    const formResponse = await formRequestService.getFormResponse(formId, studentId, user._id);

    res.json({
      success: true,
      data: formResponse
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error obteniendo respuesta:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener respuesta'
    });
  }
});

// GET /api/form-requests/check-required/:tutorId/:studentId - Verificar formularios requeridos pendientes (App Móvil)
app.get('/api/form-requests/check-required/:tutorId/:studentId', authenticateToken, async (req, res) => {
  try {
    const { tutorId, studentId } = req.params;
    const user = req.user;
    
    // Verificar que el usuario es el tutor
    if (user._id.toString() !== tutorId) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para verificar formularios'
      });
    }

    const hasRequiredPending = await formRequestService.checkRequiredFormsPending(tutorId, studentId);

    res.json({
      success: true,
      data: {
        hasRequiredPending
      }
    });
  } catch (error) {
    console.error('❌ [FORM-REQUESTS] Error verificando formularios requeridos:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al verificar formularios requeridos'
    });
  }
});

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
});

// Configurar timeouts extendidos para uploads de archivos grandes
// Timeout para mantener la conexión viva (10 minutos)
server.keepAliveTimeout = 600000; // 10 minutos
// Timeout para headers (debe ser mayor que keepAliveTimeout)
server.headersTimeout = 610000; // 10 minutos + 10 segundos

module.exports = app;

