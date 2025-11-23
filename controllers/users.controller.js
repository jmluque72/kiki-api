const User = require('../shared/models/User');
const Shared = require('../shared/models/Shared');
const Account = require('../shared/models/Account');
const Grupo = require('../shared/models/Grupo');
const Role = require('../shared/models/Role');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const AWS = require('aws-sdk');
const RefreshTokenService = require('../services/refreshTokenService');
const LoginMonitorService = require('../services/loginMonitorService');
const TwoFactorAuthService = require('../services/twoFactorAuthService');
const { generateSignedUrl } = require('../config/s3.config');
const { sendWelcomeEmail, sendEmailAsync, generateRandomPassword } = require('../config/email.config');

// Login de usuario
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');

    console.log('🔍 Login attempt:', email);

    if (!email || !password) {
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

    const isIPBlocked = await LoginMonitorService.isIPBlocked(ipAddress);
    if (isIPBlocked) {
      console.log('🚫 IP bloqueada:', ipAddress);
      return res.status(403).json({
        success: false,
        message: 'Acceso bloqueado temporalmente. Intenta más tarde.'
      });
    }

    const user = await User.findOne({ email }).populate('role').select('+password');
    
    if (!user) {
      console.log('❌ Usuario no encontrado:', email);
      
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

    if (user.status !== 'approved') {
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

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log('❌ Contraseña inválida para:', email);
      
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

    let avatarUrl = null;
    if (user.avatar) {
      try {
        avatarUrl = await generateSignedUrl(user.avatar);
        console.log('🖼️ [LOGIN] Avatar URL generada:', avatarUrl);
      } catch (avatarError) {
        console.error('❌ [LOGIN] Error generando avatar URL:', avatarError);
      }
    }
    
    const userObject = user.toObject();
    const userWithProcessedAvatar = {
      ...userObject,
      avatar: avatarUrl || user.avatar,
      isFirstLogin: userObject.isFirstLogin !== undefined ? userObject.isFirstLogin : true
    };
    
    const associations = await Shared.find({ user: user._id, status: 'active' })
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('student', 'nombre apellido avatar')
      .populate('role', 'nombre')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    
    let roleName = user.role?.nombre;
    if (!roleName && user.role) {
      const roleDoc = await Role.findById(user.role);
      roleName = roleDoc?.nombre;
    }
    
    if (roleName === 'adminaccount' && user.account) {
      console.log('✅ [LOGIN] Usuario tiene cuenta, buscando grupos...');
      const Group = require('../shared/models/Group');
      const accountGroups = await Group.find({ account: user.account, activo: true })
        .populate('creadoPor', 'name')
        .sort({ nombre: 1 });
      
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
        isVirtual: true
      }));
      
      associations.push(...virtualAssociations);
    }
    
    console.log('🔍 [LOGIN] ===== PROCESANDO AVATARES DE ESTUDIANTES =====');
    console.log('🔍 [LOGIN] Total de asociaciones:', associations.length);
    
    const associationsWithProcessedAvatars = await Promise.all(associations.map(async (association, index) => {
      if (association.isVirtual || !association.student) {
        return association;
      }
      
      const associationObj = association.toObject ? association.toObject() : association;
      
      if (associationObj.student && associationObj.student.avatar) {
        try {
          const originalAvatar = associationObj.student.avatar;
          let processedAvatar = originalAvatar;
          
          if (originalAvatar.startsWith('http')) {
            // URL completa
          } else if (originalAvatar.includes('students/')) {
            try {
              const signedUrl = await generateSignedUrl(originalAvatar, 172800);
              processedAvatar = signedUrl || originalAvatar;
            } catch (s3Error) {
              console.error('❌ [LOGIN] Error generando URL firmada:', s3Error);
              processedAvatar = originalAvatar;
            }
          } else {
            const localUrl = `${req.protocol}://${req.get('host')}/uploads/${originalAvatar.split('/').pop()}`;
            processedAvatar = localUrl;
          }
          
          associationObj.student.avatar = processedAvatar;
        } catch (error) {
          console.error('❌ [LOGIN] Error procesando avatar del estudiante:', error);
          if (associationObj.student && associationObj.student.avatar) {
            const fallbackUrl = `${req.protocol}://${req.get('host')}/uploads/${associationObj.student.avatar.split('/').pop()}`;
            associationObj.student.avatar = fallbackUrl;
          }
        }
      }
      
      return associationObj;
    }));
    
    const activeAssociation = associationsWithProcessedAvatars.length > 0 ? associationsWithProcessedAvatars[0] : null;
    
    const accessToken = jwt.sign(
      { 
        userId: user._id,
        email: user.email,
        role: user.role._id
      },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '5m' }
    );
    
    const deviceInfo = RefreshTokenService.getDeviceInfo(req);
    const refreshToken = await RefreshTokenService.generateRefreshToken(user._id, deviceInfo);
    
    console.log('🔑 [LOGIN] Access token generado (5m)');
    console.log('🔄 [LOGIN] Refresh token generado (7d)');
    
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
        tokenExpiresIn: 5 * 60
      }
    });

  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Refresh token
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    console.log('🔄 [REFRESH] Intentando renovar access token...');
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token es requerido'
      });
    }
    
    const validRefreshToken = await RefreshTokenService.verifyAndUseRefreshToken(refreshToken);
    
    if (!validRefreshToken) {
      console.log('❌ [REFRESH] Refresh token inválido o expirado');
      return res.status(401).json({
        success: false,
        message: 'Refresh token inválido o expirado'
      });
    }
    
    const newAccessToken = await RefreshTokenService.generateNewAccessToken(validRefreshToken);
    
    console.log('✅ [REFRESH] Nuevo access token generado');
    
    return res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        tokenExpiresIn: 5 * 60
      }
    });
    
  } catch (error) {
    console.error('❌ [REFRESH] Error renovando token:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Revoke token (logout)
exports.revokeToken = async (req, res) => {
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
};

// Obtener perfil de usuario
exports.getProfile = async (req, res) => {
  try {
    const user = req.user;
    
    if (user.isCognitoUser) {
      console.log('✅ [PROFILE] Usuario de Cognito:', user.email);
      
      let userAccount = null;
      
      if (user.role?.nombre === 'adminaccount') {
        console.log('🔍 [PROFILE] Adminaccount de Cognito, buscando en tabla users...');
        
        try {
          const dbUser = await User.findOne({ email: user.email })
            .populate('account', 'nombre razonSocial')
            .populate('role', 'nombre descripcion');
          
          if (dbUser && dbUser.account) {
            userAccount = dbUser.account;
            console.log('✅ [PROFILE] Usuario encontrado en MongoDB con institución:', dbUser.account.nombre);
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
          account: userAccount,
          avatar: null
        }
      });
    }

    const dbUser = await User.findById(req.user._id).populate('role', 'nombre descripcion nivel').populate('account', 'nombre razonSocial');
    if (!dbUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    let userAccount = dbUser.account;
    if (dbUser.role?.nombre === 'adminaccount' && !userAccount) {
      console.log('🔍 [PROFILE] Adminaccount sin cuenta directa, obteniendo desde asociaciones...');
      const userAssociation = await Shared.findOne({
        user: dbUser._id,
        status: 'active'
      }).populate('account', 'nombre razonSocial');
      
      if (userAssociation && userAssociation.account) {
        userAccount = userAssociation.account;
      }
    }

    let avatarUrl = null;
    if (dbUser.avatar) {
      try {
        avatarUrl = await generateSignedUrl(dbUser.avatar, 172800);
      } catch (error) {
        console.error('Error generando URL firmada para avatar:', error);
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
};

// Actualizar perfil de usuario
exports.updateProfile = async (req, res) => {
  try {
    const { name, email, phone, telefono } = req.body;
    const userId = req.user._id;

    console.log('🔍 [Server] Actualizando perfil para usuario:', userId);
    console.log('📝 Datos recibidos:', { name, email, phone, telefono });

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'El email ya está en uso'
        });
      }
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.telefono = phone;
    if (telefono) user.telefono = telefono;

    await user.save();

    console.log('✅ Perfil actualizado exitosamente');

    let avatarUrl = null;
    if (user.avatar) {
      try {
        avatarUrl = await generateSignedUrl(user.avatar, 172800);
      } catch (error) {
        console.error('Error generando URL firmada para avatar:', error);
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
};

// Actualizar avatar de usuario
exports.updateAvatar = async (req, res) => {
  console.log('🖼️ [AVATAR ENDPOINT] Petición recibida');
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

    console.log('🖼️ [UPDATE AVATAR] Archivo guardado localmente:', req.file.filename);
    console.log('🖼️ [UPDATE AVATAR] Subiendo a S3...');
    
    const fileBuffer = fs.readFileSync(req.file.path);
    
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
    
    try {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
        console.log('🗑️ [UPDATE AVATAR] Archivo local eliminado');
      }
    } catch (unlinkError) {
      console.error('⚠️ [UPDATE AVATAR] Error eliminando archivo local:', unlinkError);
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    user.avatar = avatarKey;
    await user.save();
    
    const avatarUrl = await generateSignedUrl(avatarKey, 172800);
    
    console.log('✅ [UPDATE AVATAR] Avatar actualizado exitosamente');
    
    res.json({
      success: true,
      message: 'Avatar actualizado exitosamente',
      data: {
        avatar: avatarUrl,
        avatarKey: avatarKey
      }
    });
  } catch (error) {
    console.error('❌ [UPDATE AVATAR] Error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('⚠️ [UPDATE AVATAR] Error eliminando archivo local:', unlinkError);
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Obtener lista de usuarios
exports.getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';

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
};

// Aprobar asociación
exports.approveAssociation = async (req, res) => {
  try {
    const { associationId } = req.params;
    const currentUser = req.user;

    if (!['adminaccount', 'superadmin'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para aprobar asociaciones'
      });
    }

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

    if (association.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'La asociación ya no está pendiente de aprobación'
      });
    }

    if (currentUser.role?.nombre === 'adminaccount') {
      const userAssociations = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      });
      
      const userAccountIds = userAssociations.map(a => a.account.toString());
      
      if (!userAccountIds.includes(association.account._id.toString())) {
        return res.status(403).json({
          success: false,
          message: 'Solo puedes aprobar asociaciones de tu cuenta'
        });
      }
    }

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
};

// Rechazar asociación
exports.rejectAssociation = async (req, res) => {
  try {
    const { associationId } = req.params;
    const currentUser = req.user;

    if (!['adminaccount', 'superadmin'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para rechazar asociaciones'
      });
    }

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

    if (association.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'La asociación ya no está pendiente de aprobación'
      });
    }

    if (currentUser.role?.nombre === 'adminaccount') {
      const userAssociations = await Shared.find({ 
        user: currentUser._id, 
        status: { $in: ['active', 'pending'] }
      });
      
      const userAccountIds = userAssociations.map(a => a.account.toString());
      
      if (!userAccountIds.includes(association.account._id.toString())) {
        return res.status(403).json({
          success: false,
          message: 'Solo puedes rechazar asociaciones de tu cuenta'
        });
      }
    }

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
};

// Obtener asociaciones pendientes
exports.getPendingAssociations = async (req, res) => {
  try {
    const currentUser = req.user;

    if (!['adminaccount', 'superadmin'].includes(currentUser.role?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver asociaciones pendientes'
      });
    }

    let query = { status: 'pending' };

    if (currentUser.role?.nombre === 'adminaccount') {
      if (req.userInstitution) {
        query.account = req.userInstitution._id;
      } else {
        return res.json({
          success: true,
          data: {
            associations: [],
            total: 0
          }
        });
      }
    }

    const associations = await Shared.find(query)
      .populate('user', 'name email')
      .populate('account', 'nombre razonSocial')
      .populate('role', 'nombre')
      .populate('division', 'nombre')
      .populate('student', 'nombre apellido')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        associations: associations.map(assoc => ({
          _id: assoc._id,
          user: {
            _id: assoc.user._id,
            name: assoc.user.name,
            email: assoc.user.email
          },
          account: {
            _id: assoc.account._id,
            nombre: assoc.account.nombre,
            razonSocial: assoc.account.razonSocial
          },
          role: {
            _id: assoc.role._id,
            nombre: assoc.role.nombre
          },
          division: assoc.division,
          student: assoc.student,
          status: assoc.status,
          createdAt: assoc.createdAt
        })),
        total: associations.length
      }
    });
  } catch (error) {
    console.error('Error obteniendo asociaciones pendientes:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Registro móvil
exports.registerMobile = async (req, res) => {
  try {
    const { name, email, password, accountId, divisionId, studentId, roleName } = req.body;

    if (!name || !email || !password || !accountId) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, email, contraseña y cuenta son requeridos'
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un usuario con este email'
      });
    }

    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada'
      });
    }

    const role = await Role.findOne({ nombre: roleName || 'familyadmin' });
    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Rol no válido'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: role._id,
      status: 'approved',
      isFirstLogin: false
    });

    await newUser.save();

    const association = new Shared({
      user: newUser._id,
      account: accountId,
      division: divisionId || null,
      student: studentId || null,
      role: role._id,
      status: 'active',
      createdBy: newUser._id
    });

    await association.save();

    const accessToken = jwt.sign(
      { 
        userId: newUser._id,
        email: newUser.email,
        role: newUser.role
      },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '5m' }
    );

    const deviceInfo = RefreshTokenService.getDeviceInfo(req);
    const refreshToken = await RefreshTokenService.generateRefreshToken(newUser._id, deviceInfo);

    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      data: {
        user: {
          _id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          role: role
        },
        accessToken: accessToken,
        refreshToken: refreshToken.token,
        tokenExpiresIn: 5 * 60
      }
    });
  } catch (error) {
    console.error('Error registrando usuario móvil:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Verificar token de autenticación
exports.verifyAuth = async (req, res) => {
  try {
    const user = req.user;
    
    res.json({
      success: true,
      data: {
        user: {
          _id: user._id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('Error verificando autenticación:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Obtener configuración de autenticación
exports.getAuthConfig = (req, res) => {
  res.json({
    success: true,
    data: {
      cognito: {
        region: process.env.AWS_COGNITO_REGION || '',
        userPoolId: process.env.AWS_COGNITO_USER_POOL_ID || '',
        clientId: process.env.AWS_COGNITO_CLIENT_ID || ''
      },
      jwt: {
        expiresIn: '5m'
      }
    }
  });
};

// Login con Cognito
exports.cognitoLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');

    console.log('🔍 [COGNITO LOGIN] Intento de login con Cognito:', email);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email y contraseña son requeridos'
      });
    }

    const AWS = require('aws-sdk');
    const cognito = new AWS.CognitoIdentityServiceProvider({
      region: process.env.AWS_COGNITO_REGION || 'us-east-1'
    });

    const params = {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: process.env.AWS_COGNITO_CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    };

    try {
      const cognitoResponse = await cognito.initiateAuth(params).promise();
      
      const accessToken = cognitoResponse.AuthenticationResult.AccessToken;
      const idToken = cognitoResponse.AuthenticationResult.IdToken;
      const refreshToken = cognitoResponse.AuthenticationResult.RefreshToken;

      const dbUser = await User.findOne({ email }).populate('role');
      
      let userData = {
        email: email,
        name: email.split('@')[0],
        role: dbUser?.role || null,
        status: 'approved',
        isCognitoUser: true
      };

      if (dbUser) {
        userData = {
          ...userData,
          _id: dbUser._id,
          name: dbUser.name,
          role: dbUser.role
        };
      }

      await LoginMonitorService.logLoginAttempt({
        email: email,
        ipAddress: ipAddress,
        userAgent: userAgent,
        success: true,
        deviceInfo: LoginMonitorService.parseUserAgent(userAgent),
        location: await LoginMonitorService.getLocationInfo(ipAddress),
        metadata: {
          source: 'cognito',
          userId: dbUser?._id
        }
      });

      res.json({
        success: true,
        data: {
          user: userData,
          accessToken: accessToken,
          idToken: idToken,
          refreshToken: refreshToken,
          tokenExpiresIn: 3600
        }
      });
    } catch (cognitoError) {
      console.error('❌ [COGNITO LOGIN] Error de Cognito:', cognitoError);
      
      await LoginMonitorService.logLoginAttempt({
        email: email,
        ipAddress: ipAddress,
        userAgent: userAgent,
        success: false,
        failureReason: 'cognito_error',
        deviceInfo: LoginMonitorService.parseUserAgent(userAgent),
        location: await LoginMonitorService.getLocationInfo(ipAddress)
      });

      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }
  } catch (error) {
    console.error('❌ [COGNITO LOGIN] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Setup 2FA
exports.setup2FA = async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const { secret, qrCode } = await TwoFactorAuthService.generateSecret(user.email);
    
    user.twoFactorSecret = secret;
    user.twoFactorEnabled = false;
    await user.save();

    res.json({
      success: true,
      data: {
        secret,
        qrCode
      }
    });
  } catch (error) {
    console.error('Error configurando 2FA:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Verificar 2FA
exports.verify2FA = async (req, res) => {
  try {
    const { email, token } = req.body;
    
    if (!email || !token) {
      return res.status(400).json({
        success: false,
        message: 'Email y token son requeridos'
      });
    }

    const user = await User.findOne({ email });
    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({
        success: false,
        message: '2FA no configurado para este usuario'
      });
    }

    const isValid = TwoFactorAuthService.verifyToken(user.twoFactorSecret, token);
    
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Token 2FA inválido'
      });
    }

    user.twoFactorEnabled = true;
    await user.save();

    res.json({
      success: true,
      message: '2FA verificado y habilitado exitosamente'
    });
  } catch (error) {
    console.error('Error verificando 2FA:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Obtener estado de 2FA
exports.get2FAStatus = async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id;
    const user = await User.findById(userId).select('twoFactorEnabled');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    res.json({
      success: true,
      data: {
        twoFactorEnabled: user.twoFactorEnabled || false
      }
    });
  } catch (error) {
    console.error('Error obteniendo estado de 2FA:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

