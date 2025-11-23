const Shared = require('../shared/models/Shared');
const User = require('../shared/models/User');
const Account = require('../shared/models/Account');
const Grupo = require('../shared/models/Grupo');
const Student = require('../shared/models/Student');
const Role = require('../shared/models/Role');
const ActiveAssociation = require('../shared/models/ActiveAssociation');
const RequestedShared = require('../shared/models/RequestedShared');
const { generateSignedUrl } = require('../config/s3.config');
const { sendNotificationEmail, sendFamilyInvitationEmail } = require('../config/email.config');
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
        await sendNotificationEmail(
          user.email,
          'Asociación a Institución',
          `Has sido asociado a la institución <strong>${account.nombre}</strong> con el rol <strong>${role.nombre}</strong>. Ya puedes acceder a la aplicación con tus credenciales.`
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
    const { email, nombre, apellido, studentId } = req.body;
    
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
      status: 'active'
    }).populate('student');

    const studentBelongsToUser = allUserAssociations.some(assoc => 
      assoc.student && assoc.student._id.toString() === studentId
    );

    if (!studentBelongsToUser) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para agregar familiares a este estudiante'
      });
    }

    const student = await Student.findById(studentId)
      .populate('account', 'nombre')
      .populate('division', 'nombre');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado'
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    
    if (existingUser) {
      const existingAssociation = await Shared.findOne({
        user: existingUser._id,
        student: studentId,
        status: 'active'
      });

      if (existingAssociation) {
        return res.status(400).json({
          success: false,
          message: 'Este usuario ya está asociado a este estudiante'
        });
      }
    }

    const familyviewerRole = await Role.findOne({ nombre: 'familyviewer' });
    if (!familyviewerRole) {
      return res.status(500).json({
        success: false,
        message: 'Rol familyviewer no encontrado'
      });
    }

    const requestedShared = new RequestedShared({
      email: email.toLowerCase().trim(),
      nombre: nombre,
      apellido: apellido,
      student: studentId,
      account: userAssociation.account._id,
      division: userAssociation.division?._id,
      role: familyviewerRole._id,
      requestedBy: userId,
      status: 'pending'
    });

    await requestedShared.save();

    try {
      await sendFamilyInvitationEmail(
        email.toLowerCase().trim(),
        nombre || 'Familiar',
        student.nombre + ' ' + student.apellido,
        student.account.nombre,
        student.division?.nombre || 'Sin división',
        requestedShared._id
      );
    } catch (emailError) {
      console.error('❌ [SHARED REQUEST] Error enviando email:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'Invitación enviada exitosamente',
      data: {
        requestedShared
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

    let studentWithSignedUrl = null;
    if (activeAssociation.student) {
      studentWithSignedUrl = {
        _id: activeAssociation.student._id,
        nombre: activeAssociation.student.nombre,
        apellido: activeAssociation.student.apellido,
        avatar: activeAssociation.student.avatar
      };
      
      if (activeAssociation.student.avatar) {
        try {
          if (activeAssociation.student.avatar.startsWith('http')) {
            // URL completa
          } else if (activeAssociation.student.avatar.includes('students/')) {
            const signedUrl = await generateSignedUrl(activeAssociation.student.avatar, 172800);
            studentWithSignedUrl.avatar = signedUrl;
          } else {
            const localUrl = `${req.protocol}://${req.get('host')}/uploads/${activeAssociation.student.avatar.split('/').pop()}`;
            studentWithSignedUrl.avatar = localUrl;
          }
        } catch (error) {
          console.error('Error procesando avatar:', error);
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

