const Shared = require('../shared/models/Shared');
const User = require('../shared/models/User');
const Account = require('../shared/models/Account');
const Grupo = require('../shared/models/Grupo');
const Student = require('../shared/models/Student');
const Role = require('../shared/models/Role');
const ActiveAssociation = require('../shared/models/ActiveAssociation');
const { generateSignedUrl } = require('../config/s3.config');
const {
  sendNotificationEmailToQueue,
  sendFamilyInvitationEmailToQueue,
  sendFamilyInvitationNotificationEmailToQueue
} = require('../services/sqsEmailService');
const emailService = require('../services/emailService');

/**
 * Obtener asociaciones del usuario
 */
exports.getUserAssociations = async (req, res) => {
  try {
    console.log('🎯 [SHARED GET] Obteniendo asociaciones del usuario');
    const { userId } = req.user;
    
    const userAssociations = await Shared.find({
      user: userId,
      status: 'active'
    }).populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('student', 'nombre apellido avatar')
      .populate('role', 'nombre')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    console.log('🔍 [SHARED GET] ===== PROCESANDO AVATARES DE ESTUDIANTES =====');
    console.log('🔍 [SHARED GET] Total de asociaciones:', userAssociations.length);
    
    const associationsWithSignedUrls = await Promise.all(userAssociations.map(async (association) => {
      const associationObj = association.toObject ? association.toObject() : association;
      
      if (associationObj.student && associationObj.student.avatar) {
        try {
          const originalAvatar = associationObj.student.avatar;
          let processedAvatar = originalAvatar;
          
          if (originalAvatar.startsWith('http')) {
            // URL completa, no hacer nada
          } else if (originalAvatar.includes('students/')) {
            // Key de S3, generar URL firmada
            const signedUrl = await generateSignedUrl(originalAvatar, 172800);
            processedAvatar = signedUrl || originalAvatar;
          } else {
            // Key local, generar URL local
            const localUrl = `${req.protocol}://${req.get('host')}/uploads/${originalAvatar.split('/').pop()}`;
            processedAvatar = localUrl;
          }
          
          associationObj.student.avatar = processedAvatar;
        } catch (error) {
          console.error('❌ [SHARED GET] Error procesando avatar:', error);
          if (associationObj.student && associationObj.student.avatar) {
            const fallbackUrl = `${req.protocol}://${req.get('host')}/uploads/${associationObj.student.avatar.split('/').pop()}`;
            associationObj.student.avatar = fallbackUrl;
          }
        }
      }
      return associationObj;
    }));
    
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
};

/**
 * Obtener asociaciones del usuario (con prefijo /api)
 */
exports.getApiUserAssociations = async (req, res) => {
  try {
    console.log('🎯 [API SHARED GET] Obteniendo asociaciones del usuario');
    const { userId } = req.user;
    
    const userAssociations = await Shared.find({ user: userId })
      .populate('account')
      .populate('division')
      .populate({
        path: 'student',
        select: 'nombre apellido avatar'
      });
    
    const associationsWithSignedUrls = await Promise.all(userAssociations.map(async (association) => {
      const associationObj = association.toObject ? association.toObject() : association;
      
      if (associationObj.student && associationObj.student.avatar) {
        try {
          const originalAvatar = associationObj.student.avatar;
          let processedAvatar = originalAvatar;
          
          if (originalAvatar.startsWith('http')) {
            // URL completa
          } else if (originalAvatar.includes('students/')) {
            const signedUrl = await generateSignedUrl(originalAvatar, 172800);
            processedAvatar = signedUrl || originalAvatar;
          } else {
            const localUrl = `${req.protocol}://${req.get('host')}/uploads/${originalAvatar.split('/').pop()}`;
            processedAvatar = localUrl;
          }
          
          associationObj.student.avatar = processedAvatar;
        } catch (error) {
          console.error('❌ [API SHARED GET] Error procesando avatar:', error);
          if (associationObj.student && associationObj.student.avatar) {
            const fallbackUrl = `${req.protocol}://${req.get('host')}/uploads/${associationObj.student.avatar.split('/').pop()}`;
            associationObj.student.avatar = fallbackUrl;
          }
        }
      }
      return associationObj;
    }));
    
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
};

/**
 * Obtener asociaciones de un estudiante específico
 */
exports.getStudentAssociations = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { userId } = req.user;

    const user = await User.findById(userId).populate('role');
    const userRole = user?.role?.nombre;

    if (!['superadmin', 'adminaccount', 'coordinador'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver las vinculaciones de estudiantes'
      });
    }

    const associations = await Shared.find({
      student: studentId,
      status: { $in: ['active', 'inactive'] }
    }).populate('user account division role createdBy');

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
};

/**
 * Crear nueva asociación (solo familyadmin)
 */
exports.createAssociation = async (req, res) => {
  try {
    console.log('🎯 [SHARED POST] Creando nueva asociación');
    const { userId } = req.user;
    const { accountId, divisionId, studentId, roleName } = req.body;
    
    const user = await User.findById(userId).populate('role');
    if (user.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores familiares pueden crear asociaciones'
      });
    }
    
    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Institución no encontrada'
      });
    }
    
    const role = await Role.findOne({ nombre: roleName });
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }
    
    if (divisionId) {
      const division = await Grupo.findById(divisionId);
      if (!division) {
        return res.status(404).json({
          success: false,
          message: 'División no encontrada'
        });
      }
    }
    
    if (studentId) {
      const student = await Student.findById(studentId);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Estudiante no encontrado'
        });
      }
    }
    
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
    
    const existingActiveAssociation = await ActiveAssociation.getActiveAssociation(userId);
    if (!existingActiveAssociation) {
      try {
        await ActiveAssociation.setActiveAssociation(userId, association._id);
      } catch (error) {
        console.error('Error estableciendo asociación activa:', error);
      }
    }
    
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
      }
    } catch (emailError) {
      console.error('❌ [SHARED POST] Error enviando email:', emailError);
    }
    
    const populatedAssociation = await Shared.findById(association._id)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('student', 'nombre apellido')
      .populate('role', 'nombre')
      .populate('createdBy', 'name');
    
    res.status(201).json({
      success: true,
      data: {
        association: populatedAssociation
      },
      message: 'Asociación creada correctamente'
    });
  } catch (error) {
    console.error('Error al crear asociación:', error);
    
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
};

/**
 * Obtener familyviewers de un estudiante
 */
exports.getStudentFamilyViewers = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { userId } = req.user;

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

    if (userAssociation.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores familiares pueden ver los familyviewers'
      });
    }

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
};

/**
 * Eliminar asociación
 */
exports.deleteAssociation = async (req, res) => {
  try {
    console.log('🗑️ [SHARED DELETE] Eliminando asociación:', req.params.id);
    const { userId } = req.user;
    const { id } = req.params;
    
    const associationToDelete = await Shared.findById(id).populate('role', 'nombre');
    if (!associationToDelete) {
      return res.status(404).json({
        success: false,
        message: 'Asociación no encontrada'
      });
    }

    if (associationToDelete.role?.nombre !== 'familyviewer') {
      return res.status(403).json({
        success: false,
        message: 'Solo se pueden eliminar asociaciones de familyviewer'
      });
    }

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

    if (userAssociation.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores familiares pueden eliminar asociaciones'
      });
    }
    
    associationToDelete.status = 'inactive';
    await associationToDelete.save();
    
    res.json({
      success: true,
      message: 'Familyviewer eliminado correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar asociación:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

/**
 * Solicitar asociación por email
 */
exports.requestAssociation = async (req, res) => {
  try {
    console.log('🎯 [SHARED REQUEST] Agregando familiar al estudiante');
    const { userId } = req.user;
    const { email, requestedEmail, nombre, apellido, studentId } = req.body;
    const resolvedEmail = String(email || requestedEmail || '').trim();

    if (!resolvedEmail) {
      return res.status(400).json({
        success: false,
        message: 'El email es obligatorio'
      });
    }

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

    const userAssociation = await Shared.findById(activeAssociation.activeShared)
      .populate('account division student role');

    const allUserAssociations = await Shared.find({
      user: userId,
      role: activeShared.role._id,
      status: 'active'
    }).populate('student');

    const studentBelongsToUser = allUserAssociations.some(
      (assoc) => assoc.student && assoc.student._id.toString() === String(studentId)
    );

    if (!studentBelongsToUser) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para agregar familiares a este estudiante'
      });
    }

    const studentAssociation = allUserAssociations.find(
      (assoc) => assoc.student?._id.toString() === String(studentId)
    );
    const associationToUse = studentAssociation || userAssociation;

    const student = await Student.findById(studentId).select('nombre apellido');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado'
      });
    }

    const familyviewerRole = await Role.findOne({ nombre: 'familyviewer' });
    if (!familyviewerRole) {
      return res.status(500).json({
        success: false,
        message: 'Rol familyviewer no encontrado'
      });
    }

    const existingUser = await User.findOne({ email: resolvedEmail.toLowerCase() });

    if (existingUser) {
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

      const existingActiveAssociation = await ActiveAssociation.getActiveAssociation(existingUser._id);
      if (!existingActiveAssociation) {
        try {
          await ActiveAssociation.setActiveAssociation(existingUser._id, newShared._id);
        } catch (err) {
          console.error('❌ [SHARED REQUEST] Error estableciendo asociación activa:', err);
        }
      }

      const studentName = student ? `${student.nombre} ${student.apellido}` : 'el estudiante';
      try {
        await sendFamilyInvitationNotificationEmailToQueue(
          existingUser.email,
          existingUser.name,
          studentName
        );
      } catch (emailError) {
        console.error('❌ [SHARED REQUEST] Error enviando email de notificación:', emailError);
      }

      return res.status(201).json({
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
    }

    const generateRandomPassword = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let password = '';
      for (let i = 0; i < 8; i += 1) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return password;
    };

    // Contraseña temporal en claro: se hashea en User.save(); el mismo valor va al mail.
    const randomPassword = generateRandomPassword();
    const displayName = [nombre, apellido].filter(Boolean).join(' ').trim() || 'Familiar';

    const newUser = new User({
      name: displayName,
      email: resolvedEmail.toLowerCase(),
      password: randomPassword,
      role: familyviewerRole._id,
      status: 'approved',
      isFirstLogin: true
    });

    await newUser.save();

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

    const existingActiveAssociation = await ActiveAssociation.getActiveAssociation(newUser._id);
    if (!existingActiveAssociation) {
      try {
        await ActiveAssociation.setActiveAssociation(newUser._id, newShared._id);
      } catch (err) {
        console.error('❌ [SHARED REQUEST] Error estableciendo asociación activa:', err);
      }
    }

    try {
      await sendFamilyInvitationEmailToQueue(newUser.email, newUser.name, randomPassword); // misma contraseña temporal que en BD (hasheada)
    } catch (emailError) {
      console.error('❌ [SHARED REQUEST] Error enviando email con credenciales:', emailError);
    }

    return res.status(201).json({
      success: true,
      message: 'Familiar agregado exitosamente. Se envió un email con las credenciales de acceso.',
      data: {
        user: {
          _id: newUser._id,
          name: newUser.name,
          email: newUser.email
        },
        association: newShared
      }
    });
  } catch (error) {
    console.error('Error al solicitar asociación:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Obtener asociación activa
 */
exports.getActiveAssociation = async (req, res) => {
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

    // CRÍTICO: Obtener el estudiante desde activeShared (Shared), no del campo desnormalizado
    const Shared = require('../shared/models/Shared');
    const activeShared = await Shared.findById(activeAssociation.activeShared)
      .populate('student', 'nombre apellido avatar');
    
    // Usar el estudiante de activeShared como fuente de verdad
    const studentFromShared = activeShared?.student || null;
    
    // LOG CRÍTICO: Verificar qué estudiante tiene la asociación activa
    console.log('🔍 [ACTIVE ASSOCIATION GET] DEBUG - Estudiante desde activeShared:', {
      activeSharedId: activeAssociation.activeShared?._id?.toString() || activeAssociation.activeShared?.toString(),
      studentId: studentFromShared?._id?.toString(),
      studentNombre: studentFromShared?.nombre,
      studentApellido: studentFromShared?.apellido,
      // Comparar con el campo desnormalizado (puede estar desactualizado)
      studentDesnormalizadoId: activeAssociation.student?._id?.toString(),
      studentDesnormalizadoNombre: activeAssociation.student?.nombre
    });

    let studentWithSignedUrl = null;
    // CRÍTICO: Usar el estudiante de activeShared, no el campo desnormalizado
    const studentToUse = studentFromShared || activeAssociation.student;
    
    if (studentToUse) {
      // VALIDACIÓN: Verificar que el estudiante tenga todos los campos necesarios
      if (!studentToUse._id) {
        console.error('❌ [ACTIVE ASSOCIATION GET] ERROR: studentToUse no tiene _id!', studentToUse);
      }
      
      studentWithSignedUrl = {
        _id: studentToUse._id,
        nombre: studentToUse.nombre,
        apellido: studentToUse.apellido,
        avatar: studentToUse.avatar
      };
      
      console.log('✅ [ACTIVE ASSOCIATION GET] Estudiante preparado para respuesta:', {
        id: studentWithSignedUrl._id?.toString(),
        nombre: studentWithSignedUrl.nombre,
        apellido: studentWithSignedUrl.apellido,
        fuente: studentFromShared ? 'activeShared' : 'campo desnormalizado'
      });
      
      // Procesar avatar del estudiante
      if (studentToUse.avatar) {
        try {
          if (studentToUse.avatar.startsWith('http')) {
            // URL completa
          } else if (studentToUse.avatar.includes('students/')) {
            const signedUrl = await generateSignedUrl(studentToUse.avatar, 172800);
            studentWithSignedUrl.avatar = signedUrl;
          } else {
            const localUrl = `${req.protocol}://${req.get('host')}/uploads/${studentToUse.avatar.split('/').pop()}`;
            studentWithSignedUrl.avatar = localUrl;
          }
        } catch (error) {
          console.error('Error procesando avatar:', error);
        }
      }
    } else {
      console.warn('⚠️ [ACTIVE ASSOCIATION GET] activeAssociation no tiene estudiante');
    }

    const responseData = {
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
    };

    // LOG CRÍTICO: Verificar qué estudiante se está enviando en la respuesta
    console.log('🔍 [ACTIVE ASSOCIATION GET] DEBUG - Estudiante en respuesta:', {
      studentId: responseData.data.student?._id?.toString(),
      studentNombre: responseData.data.student?.nombre,
      studentApellido: responseData.data.student?.apellido
    });

    res.json(responseData);

  } catch (error) {
    console.error('❌ [ACTIVE ASSOCIATION GET] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener asociación activa' 
    });
  }
};

/**
 * Obtener asociaciones disponibles
 */
exports.getAvailableAssociations = async (req, res) => {
  try {
    console.log('🎯 [ACTIVE ASSOCIATION AVAILABLE] Obteniendo asociaciones disponibles');
    const { userId } = req.user;

    const currentActive = await ActiveAssociation.findOne({ user: userId });
    const associations = await ActiveAssociation.getUserAvailableAssociations(userId);

    const formattedAssociations = await Promise.all(associations.map(async (assoc) => {
      const isActive = currentActive ? assoc._id.toString() === currentActive.activeShared.toString() : false;
      
      let studentWithSignedUrl = null;
      if (assoc.student) {
        studentWithSignedUrl = {
          _id: assoc.student._id,
          nombre: assoc.student.nombre,
          apellido: assoc.student.apellido,
          avatar: assoc.student.avatar
        };
        
        if (assoc.student.avatar) {
          try {
            if (assoc.student.avatar.startsWith('http')) {
              // URL completa
            } else if (assoc.student.avatar.includes('students/')) {
              const signedUrl = await generateSignedUrl(assoc.student.avatar, 172800);
              studentWithSignedUrl.avatar = signedUrl;
            } else {
              const localUrl = `${req.protocol}://${req.get('host')}/uploads/${assoc.student.avatar.split('/').pop()}`;
              studentWithSignedUrl.avatar = localUrl;
            }
          } catch (error) {
            console.error('Error procesando avatar:', error);
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
};

/**
 * Establecer asociación activa
 */
exports.setActiveAssociation = async (req, res) => {
  try {
    console.log('🎯 [ACTIVE ASSOCIATION SET] Estableciendo asociación activa');
    const { userId } = req.user;
    const { sharedId } = req.body;

    console.log('🔍 [ACTIVE ASSOCIATION SET] Parámetros recibidos:', {
      userId: userId.toString(),
      sharedId: sharedId
    });

    if (!sharedId) {
      return res.status(400).json({
        success: false,
        message: 'ID de asociación es requerido'
      });
    }

    // Verificar qué Shared se está intentando activar
    const sharedToActivate = await Shared.findById(sharedId)
      .populate('student', 'nombre apellido');
    
    if (sharedToActivate) {
      console.log('🔍 [ACTIVE ASSOCIATION SET] Shared a activar:', {
        sharedId: sharedToActivate._id.toString(),
        studentId: sharedToActivate.student?._id?.toString(),
        studentNombre: sharedToActivate.student?.nombre,
        studentApellido: sharedToActivate.student?.apellido
      });
    } else {
      console.error('❌ [ACTIVE ASSOCIATION SET] Shared no encontrada:', sharedId);
    }

    const activeAssociation = await ActiveAssociation.setActiveAssociation(userId, sharedId);
    
    // LOG CRÍTICO: Verificar qué se devuelve
    const activeAssociationWithPopulate = await ActiveAssociation.findById(activeAssociation._id)
      .populate('student', 'nombre apellido');
    
    console.log('🔍 [ACTIVE ASSOCIATION SET] Asociación activa devuelta:', {
      studentId: activeAssociationWithPopulate.student?._id?.toString(),
      studentNombre: activeAssociationWithPopulate.student?.nombre,
      studentApellido: activeAssociationWithPopulate.student?.apellido
    });

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
};

/**
 * Limpiar asociaciones activas inválidas
 */
exports.cleanupActiveAssociations = async (req, res) => {
  try {
    console.log('🎯 [ACTIVE ASSOCIATION CLEANUP] Limpiando asociaciones activas inválidas');
    
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
};

