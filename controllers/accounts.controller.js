const Account = require('../shared/models/Account');
const User = require('../shared/models/User');
const Role = require('../shared/models/Role');
const Shared = require('../shared/models/Shared');
const AccountConfig = require('../shared/models/AccountConfig');
const PaymentConfig = require('../shared/models/PaymentConfig');
const Grupo = require('../shared/models/Grupo');
const ActiveAssociation = require('../shared/models/ActiveAssociation');
const Activity = require('../shared/models/Activity');
const { generateSignedUrl } = require('../config/s3.config');
const { generateRandomPassword } = require('../config/email.config');
const { sendInstitutionWelcomeEmailToQueue, sendNewUserCreatedEmailToQueue } = require('../services/sqsEmailService');
const emailService = require('../services/emailService');
const bcrypt = require('bcryptjs');

// Helper function para crear asociaciones
async function createAssociationByRole(userId, accountId, roleName, divisionId = null, studentId = null, createdBy) {
  try {
    const role = await Role.findOne({ nombre: roleName });
    if (!role) {
      throw new Error(`Rol '${roleName}' no encontrado`);
    }

    const associationData = {
      user: userId,
      account: accountId,
      role: role._id,
      status: 'active',
      createdBy: createdBy
    };

    switch (roleName) {
      case 'adminaccount':
        break;
      case 'coordinador':
        if (divisionId) {
          associationData.division = divisionId;
        }
        break;
      case 'familyadmin':
        if (divisionId) {
          associationData.division = divisionId;
        }
        if (studentId) {
          associationData.student = studentId;
        }
        break;
      default:
        if (divisionId) {
          associationData.division = divisionId;
        }
        if (studentId) {
          associationData.student = studentId;
        }
    }

    const association = new Shared(associationData);
    await association.save();
    
    const existingActiveAssociation = await ActiveAssociation.getActiveAssociation(userId);
    
    if (!existingActiveAssociation) {
      try {
        await ActiveAssociation.setActiveAssociation(userId, association._id);
      } catch (error) {
        console.error('❌ [AUTO-ACTIVE] Error estableciendo asociación activa automáticamente:', error);
      }
    }

    return association;
  } catch (error) {
    console.error(`❌ Error creando asociación para rol '${roleName}':`, error);
    throw error;
  }
}

// Listar cuentas
exports.listAccounts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';

    const query = {};
    if (search) {
      query.$or = [
        { nombre: { $regex: search, $options: 'i' } },
        { razonSocial: { $regex: search, $options: 'i' } }
      ];
    }

    const currentUser = req.user;

    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin ve todas las cuentas
    } else if (currentUser.role?.nombre === 'adminaccount') {
      if (req.userInstitution) {
        query._id = req.userInstitution._id;
      } else {
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
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver cuentas'
      });
    }

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

    const accountsWithSignedUrls = await Promise.all(accounts.map(async (account) => {
      const accountObj = account.toObject();
      if (accountObj.logo) {
        try {
          accountObj.logoSignedUrl = await generateSignedUrl(accountObj.logo, 172800);
        } catch (error) {
          console.error('Error generando URL firmada para logo:', error);
        }
      }
      return accountObj;
    }));

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
};

// Obtener cuentas para mobile
exports.getAccountsMobile = async (req, res) => {
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
};

// Crear cuenta
exports.createAccount = async (req, res) => {
  try {
    const { nombre, razonSocial, address, emailAdmin, nombreAdmin, logo } = req.body;

    if (!nombre || !razonSocial || !address || !emailAdmin || !nombreAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son requeridos'
      });
    }

    const existingAccount = await Account.findOne({ nombre });
    if (existingAccount) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una cuenta con ese nombre'
      });
    }

    const existingUser = await User.findOne({ email: emailAdmin });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un usuario con ese email de administrador'
      });
    }

    const adminRole = await Role.findOne({ nombre: 'adminaccount' });
    if (!adminRole) {
      return res.status(500).json({
        success: false,
        message: 'Rol de administrador no encontrado'
      });
    }

    const randomPassword = generateRandomPassword(12);
    console.log('🔑 [CREATE ACCOUNT] Contraseña generada para administrador:', randomPassword);

    const adminUser = new User({
      name: nombreAdmin,
      email: emailAdmin,
      password: randomPassword,
      role: adminRole._id,
      status: 'approved'
    });

    await adminUser.save();

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

    adminUser.account = account._id;
    await adminUser.save();

    await createAssociationByRole(
      adminUser._id, 
      account._id, 
      'adminaccount', 
      null, 
      null, 
      req.user._id
    );

    await sendInstitutionWelcomeEmailToQueue(adminUser.email, adminUser.name, account.nombre, randomPassword);
    console.log('📧 [CREATE ACCOUNT] Email de bienvenida programado para envío asíncrono al administrador:', adminUser.email);

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
};

// Crear usuario adminaccount adicional
exports.createAdminUser = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { nombre, apellido, email } = req.body;
    const userId = req.user.userId || req.user._id;
    
    const currentUser = await User.findById(userId).populate('role');
    
    if (!currentUser || currentUser.role?.nombre !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los superadministradores pueden crear usuarios adminaccount'
      });
    }

    if (!nombre || !apellido || !email) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, apellido y email son requeridos'
      });
    }

    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada'
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un usuario con ese email'
      });
    }

    const adminRole = await Role.findOne({ nombre: 'adminaccount' });
    if (!adminRole) {
      return res.status(500).json({
        success: false,
        message: 'Rol de adminaccount no encontrado'
      });
    }

    const randomPassword = generateRandomPassword(12);
    console.log('🔑 [CREATE ADMIN USER] Contraseña generada:', randomPassword);

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

    await createAssociationByRole(
      adminUser._id,
      accountId,
      'adminaccount',
      null,
      null,
      userId
    );
    console.log('✅ [CREATE ADMIN USER] Asociación creada');

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

    await adminUser.populate('role', 'nombre descripcion');

    res.status(201).json({
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
    });

  } catch (error) {
    console.error('❌ [CREATE ADMIN USER] Error completo:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Error de validación: ' + Object.values(error.errors).map((e) => e.message).join(', ')
      });
    }
    
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
};

// Obtener cuenta por ID
exports.getAccountById = async (req, res) => {
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

    const accountObj = account.toObject();
    if (accountObj.logo) {
      try {
        accountObj.logoSignedUrl = await generateSignedUrl(accountObj.logo, 3600);
      } catch (error) {
        console.error('Error generando URL firmada para logo:', error);
      }
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
};

// Actualizar cuenta
exports.updateAccount = async (req, res) => {
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

    if (nombre && nombre !== account.nombre) {
      const existingAccount = await Account.findOne({ nombre, _id: { $ne: id } });
      if (existingAccount) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe una cuenta con ese nombre'
        });
      }
    }

    const adminUser = await User.findById(account.usuarioAdministrador);
    if (!adminUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario administrador no encontrado'
      });
    }

    if (nombre) account.nombre = nombre;
    if (razonSocial) account.razonSocial = razonSocial;
    if (address) account.address = address;
    if (logo) account.logo = logo;
    if (typeof activo === 'boolean') account.activo = activo;

    if (emailAdmin && emailAdmin !== adminUser.email) {
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

    account.updatedAt = new Date();
    await account.save();
    await adminUser.save();

    await account.populate({
      path: 'usuarioAdministrador',
      select: 'name email status',
      populate: {
        path: 'role',
        select: 'nombre descripcion nivel'
      }
    });

    const accountObj = account.toObject();
    if (accountObj.logo) {
      try {
        accountObj.logoSignedUrl = await generateSignedUrl(accountObj.logo, 3600);
      } catch (error) {
        console.error('Error generando URL firmada para logo:', error);
      }
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
};

// Eliminar cuenta
exports.deleteAccount = async (req, res) => {
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
};

// Estadísticas de cuentas
exports.getAccountStats = async (req, res) => {
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
};

// Obtener configuración de cuenta
exports.getAccountConfig = async (req, res) => {
  try {
    const { accountId } = req.params;
    const currentUser = req.user;

    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin puede ver cualquier configuración
    } else if (currentUser.role?.nombre === 'adminaccount' && req.userInstitution) {
      if (accountId !== req.userInstitution._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para ver la configuración de esta cuenta'
        });
      }
    } else {
      // Usuarios familia (familyadmin, familyviewer, etc.) pueden leer la config de la cuenta a la que pertenecen
      const hasAssociation = await Shared.findOne({
        user: currentUser._id,
        account: accountId,
        status: 'active'
      }).lean();
      if (!hasAssociation) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para ver la configuración de esta cuenta'
        });
      }
    }

    const config = await AccountConfig.getOrCreateConfig(accountId);

    // Normalizar estructura para evitar undefined en el front
    const quickNotificationSettings = Array.isArray(config.quickNotificationSettings)
      ? config.quickNotificationSettings
      : [];
    
    res.json({
      success: true,
      data: {
        config: {
          _id: config._id,
          account: config.account,
          requiereAprobarActividades: config.requiereAprobarActividades,
          quickNotificationSettings,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Actualizar configuración de cuenta
exports.updateAccountConfig = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { requiereAprobarActividades, quickNotificationSettings } = req.body;
    const currentUser = req.user;

    if (currentUser.role?.nombre === 'superadmin') {
      // Superadmin puede actualizar cualquier configuración
    } else if (currentUser.role?.nombre === 'adminaccount' && req.userInstitution) {
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

    const config = await AccountConfig.getOrCreateConfig(accountId);
    
    if (typeof requiereAprobarActividades === 'boolean') {
      config.requiereAprobarActividades = requiereAprobarActividades;
    }

    // Actualizar configuración de notificaciones rápidas si viene en el body
    if (Array.isArray(quickNotificationSettings)) {
      // Filtrar entradas mínimamente válidas (con code string)
      config.quickNotificationSettings = quickNotificationSettings
        .filter(item => item && typeof item.code === 'string')
        .map(item => ({
          code: item.code,
          enabled: typeof item.enabled === 'boolean' ? item.enabled : true
        }));
    }
    
    await config.save();
    
    res.json({
      success: true,
      message: 'Configuración actualizada exitosamente',
      data: {
        config: {
          _id: config._id,
          account: config.account,
          requiereAprobarActividades: config.requiereAprobarActividades,
          quickNotificationSettings: config.quickNotificationSettings || [],
          updatedAt: config.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Error actualizando configuración:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Actualizar logo de cuenta
exports.updateAccountLogo = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { imageKey } = req.body;
    const currentUser = req.user;

    if (currentUser.role?.nombre !== 'superadmin' && currentUser.role?.nombre !== 'adminaccount') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar logos de cuentas'
      });
    }

    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada'
      });
    }

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

    account.logo = imageKey;
    await account.save();

    const logoSignedUrl = await generateSignedUrl(imageKey, 172800);

    res.json({
      success: true,
      message: 'Logo actualizado exitosamente',
      data: {
        accountId: account._id,
        logo: account.logo,
        logoUrl: logoSignedUrl
      }
    });

  } catch (error) {
    console.error('❌ [UPDATE LOGO] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al actualizar el logo'
    });
  }
};

// Obtener logo de cuenta
exports.getAccountLogo = async (req, res) => {
  try {
    const { accountId } = req.params;
    const currentUser = req.user;

    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada'
      });
    }

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

    if (!account.logo) {
      return res.status(404).json({
        success: false,
        message: 'La cuenta no tiene logo'
      });
    }

    const logoSignedUrl = await generateSignedUrl(account.logo, 172800);

    res.json({
      success: true,
      data: {
        accountId: account._id,
        logo: account.logo,
        logoUrl: logoSignedUrl
      }
    });

  } catch (error) {
    console.error('❌ [GET LOGO] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al obtener el logo'
    });
  }
};

// --- Configuración de cobranzas (pagos) por cuenta ---

exports.getPaymentConfig = async (req, res) => {
  try {
    const { accountId } = req.params;
    const currentUser = req.user;

    if (currentUser.role?.nombre === 'superadmin') {
      // ok
    } else if (currentUser.role?.nombre === 'adminaccount' && req.userInstitution) {
      if (accountId !== req.userInstitution._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para ver la configuración de cobranzas de esta cuenta'
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver la configuración de cobranzas'
      });
    }

    const config = await PaymentConfig.getOrCreateConfig(accountId);
    const matriculaAnual = config.matriculaAnual || { cobran: false, monto: 0 };
    const cuotaPorDivision = Array.isArray(config.cuotaPorDivision) ? config.cuotaPorDivision : [];
    const matriculaPorDivision = Array.isArray(config.matriculaPorDivision) ? config.matriculaPorDivision : [];
    const productos = Array.isArray(config.productos) ? config.productos : [];

    res.json({
      success: true,
      data: {
        config: {
          _id: config._id,
          account: config.account,
          matriculaAnual: {
            cobran: !!matriculaAnual.cobran,
            monto: Number(matriculaAnual.monto) || 0
          },
          matriculaPorDivision: matriculaPorDivision.map((item) => ({
            division: item.division,
            monto: Number(item.monto) || 0
          })),
          cuotaPorDivision: cuotaPorDivision.map((item) => ({
            division: item.division,
            monto: Number(item.monto) || 0
          })),
          productos: productos.map((item) => ({
            _id: item._id,
            nombre: item.nombre || '',
            precio: Number(item.precio) || 0,
            activo: item.activo !== false
          })),
          moneda: config.moneda || 'ARS',
          createdAt: config.createdAt,
          updatedAt: config.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Error obteniendo configuración de cobranzas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

exports.updatePaymentConfig = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { matriculaAnual, matriculaPorDivision, cuotaPorDivision, productos, moneda } = req.body;
    const currentUser = req.user;

    if (currentUser.role?.nombre === 'superadmin') {
      // ok
    } else if (currentUser.role?.nombre === 'adminaccount' && req.userInstitution) {
      if (accountId !== req.userInstitution._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para actualizar la configuración de cobranzas de esta cuenta'
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para actualizar la configuración de cobranzas'
      });
    }

    const divisionesDeLaCuenta = await Grupo.find({ cuenta: accountId }).select('_id').lean();
    const divisionIdsValidos = new Set(divisionesDeLaCuenta.map((d) => d._id.toString()));

    const config = await PaymentConfig.getOrCreateConfig(accountId);

    if (matriculaAnual && typeof matriculaAnual === 'object') {
      if (typeof matriculaAnual.cobran === 'boolean') config.matriculaAnual.cobran = matriculaAnual.cobran;
      if (typeof matriculaAnual.monto === 'number' && matriculaAnual.monto >= 0) {
        config.matriculaAnual.monto = matriculaAnual.monto;
      }
    }

    if (Array.isArray(matriculaPorDivision)) {
      config.matriculaPorDivision = matriculaPorDivision
        .filter((item) => item && item.division && divisionIdsValidos.has(String(item.division)))
        .map((item) => ({
          division: item.division,
          monto: Math.max(0, Number(item.monto) || 0)
        }));
    }

    if (Array.isArray(cuotaPorDivision)) {
      config.cuotaPorDivision = cuotaPorDivision
        .filter((item) => item && item.division && divisionIdsValidos.has(String(item.division)))
        .map((item) => ({
          division: item.division,
          monto: Math.max(0, Number(item.monto) || 0)
        }));
    }

    if (Array.isArray(productos)) {
      config.productos = productos
        .filter((item) => item && typeof item.nombre === 'string' && item.nombre.trim())
        .map((item) => ({
          _id: item._id,
          nombre: item.nombre.trim().substring(0, 120),
          precio: Math.max(0, Number(item.precio) || 0),
          activo: item.activo !== false
        }));
    }

    if (moneda && typeof moneda === 'string' && moneda.trim()) {
      config.moneda = moneda.trim().substring(0, 10);
    }

    await config.save();

    res.json({
      success: true,
      message: 'Configuración de cobranzas actualizada correctamente',
      data: {
        config: {
          _id: config._id,
          account: config.account,
          matriculaAnual: config.matriculaAnual,
          matriculaPorDivision: config.matriculaPorDivision,
          cuotaPorDivision: config.cuotaPorDivision,
          productos: config.productos,
          moneda: config.moneda,
          updatedAt: config.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Error actualizando configuración de cobranzas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

