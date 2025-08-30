const Account = require('../../../shared/models/Account');
const User = require('../../../shared/models/User');
const Role = require('../../../shared/models/Role');
const { asyncHandler, AppError } = require('../../../shared/middleware/errorHandler');
const { saveBase64Image, deleteFile } = require('../../../shared/utils/fileHandler');
const { generateSignedUrl } = require('../../../config/s3.config');
const mongoose = require('mongoose');

// @desc    Crear nueva cuenta
// @route   POST /api/accounts
// @access  Private
const createAccount = asyncHandler(async (req, res) => {
  const { nombre, razonSocial, address, logo, emailAdmin, passwordAdmin, nombreAdmin } = req.body;

  // Verificar campos requeridos
  if (!emailAdmin || !passwordAdmin) {
    throw new AppError('Email y contraseña del administrador son obligatorios', 400);
  }

  // Iniciar sesión para transacción
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      // Verificar que no existe un usuario con ese email
      const existingUser = await User.findOne({ email: emailAdmin }).session(session);
      if (existingUser) {
        throw new AppError('Ya existe un usuario con ese email', 400);
      }

      // Obtener el rol de adminaccount
      const adminRole = await Role.findOne({ nombre: 'adminaccount' }).session(session);
      if (!adminRole) {
        throw new AppError('El rol adminaccount no existe. Ejecute el seeder de roles primero.', 500);
      }

      // Procesar logo si es base64
      let logoUrl = logo;
      if (logo && logo.startsWith('data:image/')) {
        try {
          const savedImage = await saveBase64Image(logo, 'logos');
          logoUrl = savedImage.url;
        } catch (error) {
          throw new AppError(`Error procesando imagen: ${error.message}`, 400);
        }
      }

      // Crear el usuario administrador
      const adminUser = await User.create([{
        name: nombreAdmin || `Admin ${nombre}`,
        email: emailAdmin,
        password: passwordAdmin,
        role: adminRole._id,
        status: 'approved' // Usuario administrador se aprueba automáticamente
      }], { session });

      if (!adminUser || adminUser.length === 0) {
        throw new AppError('Error al crear el usuario administrador', 500);
      }

      // Crear la cuenta
      const account = await Account.create([{
        nombre,
        razonSocial,
        address,
        logo: logoUrl,
        usuarioAdministrador: adminUser[0]._id
      }], { session });

      if (!account || account.length === 0) {
        throw new AppError('Error al crear la cuenta', 500);
      }

      // Devolver la cuenta con el usuario administrador populado
      const populatedAccount = await Account.findById(account[0]._id)
        .populate({
          path: 'usuarioAdministrador',
          select: 'name email status',
          populate: {
            path: 'role',
            select: 'nombre descripcion nivel'
          }
        })
        .session(session);

      // Generar URL firmada para el logo
      const accountObj = populatedAccount.toObject();
      if (accountObj.logo) {
        accountObj.logoSignedUrl = generateSignedUrl(accountObj.logo, 3600); // 1 hora
      }

      res.status(201).json({
        success: true,
        message: 'Cuenta y usuario administrador creados exitosamente',
        data: {
          account: accountObj,
          adminUser: {
            id: adminUser[0]._id,
            name: adminUser[0].name,
            email: adminUser[0].email,
            status: adminUser[0].status
          }
        }
      });
    });
  } catch (error) {
    // Si hay error y se guardó una imagen, limpiarla
    if (logo && logo.startsWith('data:image/') && error.logoUrl) {
      try {
        await deleteFile(error.logoUrl);
      } catch (deleteError) {
        console.error('Error eliminando imagen después de fallo:', deleteError);
      }
    }
    throw error;
  } finally {
    await session.endSession();
  }
});

// @desc    Obtener todas las cuentas
// @route   GET /api/accounts
// @access  Private
const getAllAccounts = asyncHandler(async (req, res) => {
  // Parámetros de paginación
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Filtros opcionales
  const query = {};
  
  if (req.query.nombre) {
    query.nombre = new RegExp(req.query.nombre, 'i');
  }
  
  if (req.query.razonSocial) {
    query.razonSocial = new RegExp(req.query.razonSocial, 'i');
  }
  
  if (req.query.address) {
    query.address = new RegExp(req.query.address, 'i');
  }

  const accounts = await Account.find(query)
    .populate({
      path: 'usuarioAdministrador',
      select: 'name email status',
      populate: {
        path: 'role',
        select: 'nombre descripcion nivel'
      }
    })
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  // Generar URLs firmadas para los logos
  const accountsWithSignedUrls = accounts.map(account => {
    const accountObj = account.toObject();
    if (accountObj.logo) {
      accountObj.logoSignedUrl = generateSignedUrl(accountObj.logo, 3600); // 1 hora
    }
    return accountObj;
  });

  const total = await Account.countDocuments(query);

  res.json({
    success: true,
    message: 'Cuentas obtenidas exitosamente',
    data: {
      accounts: accountsWithSignedUrls,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// @desc    Obtener cuenta por ID
// @route   GET /api/accounts/:id
// @access  Private
const getAccountById = asyncHandler(async (req, res) => {
  const account = await Account.findById(req.params.id)
    .populate({
      path: 'usuarioAdministrador',
      select: 'name email status',
      populate: {
        path: 'role',
        select: 'nombre descripcion nivel'
      }
    });
  
  if (!account) {
    throw new AppError('Cuenta no encontrada', 404);
  }

  // Generar URL firmada para el logo
  const accountObj = account.toObject();
  if (accountObj.logo) {
    accountObj.logoSignedUrl = generateSignedUrl(accountObj.logo, 3600); // 1 hora
  }

  res.json({
    success: true,
    message: 'Cuenta obtenida exitosamente',
    data: {
      account: accountObj
    }
  });
});

// @desc    Actualizar cuenta
// @route   PUT /api/accounts/:id
// @access  Private
const updateAccount = asyncHandler(async (req, res) => {
  const account = await Account.findById(req.params.id);
  
  if (!account) {
    throw new AppError('Cuenta no encontrada', 404);
  }

  // Iniciar sesión para transacción
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      // Obtener el usuario administrador actual
      const adminUser = await User.findById(account.usuarioAdministrador).session(session);
      if (!adminUser) {
        throw new AppError('Usuario administrador no encontrado', 404);
      }

      // Actualizar campos de la cuenta
      const allowedAccountFields = ['nombre', 'razonSocial', 'address', 'logo'];
      Object.keys(req.body).forEach(key => {
        if (allowedAccountFields.includes(key)) {
          account[key] = req.body[key];
        }
      });

      // Actualizar campos del usuario administrador si se proporcionan
      if (req.body.emailAdmin && req.body.emailAdmin !== adminUser.email) {
        // Verificar que el nuevo email no esté en uso
        const existingUser = await User.findOne({ email: req.body.emailAdmin, _id: { $ne: adminUser._id } }).session(session);
        if (existingUser) {
          throw new AppError('Ya existe un usuario con ese email', 400);
        }
        adminUser.email = req.body.emailAdmin;
      }

      if (req.body.nombreAdmin && req.body.nombreAdmin !== adminUser.name) {
        adminUser.name = req.body.nombreAdmin;
      }

      // Guardar cambios
      await account.save({ session });
      await adminUser.save({ session });
    });
  } finally {
    await session.endSession();
  }

  // Obtener cuenta actualizada con populate
  const updatedAccount = await Account.findById(account._id)
    .populate({
      path: 'usuarioAdministrador',
      select: 'name email status',
      populate: {
        path: 'role',
        select: 'nombre descripcion nivel'
      }
    });

  // Generar URL firmada para el logo
  const accountObj = updatedAccount.toObject();
  if (accountObj.logo) {
    accountObj.logoSignedUrl = generateSignedUrl(accountObj.logo, 3600); // 1 hora
  }

  res.json({
    success: true,
    message: 'Cuenta actualizada exitosamente',
    data: {
      account: accountObj
    }
  });
});

// @desc    Eliminar cuenta
// @route   DELETE /api/accounts/:id
// @access  Private
const deleteAccount = asyncHandler(async (req, res) => {
  const account = await Account.findById(req.params.id);
  
  if (!account) {
    throw new AppError('Cuenta no encontrada', 404);
  }

  await Account.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: 'Cuenta eliminada exitosamente'
  });
});

// @desc    Obtener estadísticas de cuentas
// @route   GET /api/accounts/stats
// @access  Private
const getAccountStats = asyncHandler(async (req, res) => {
  const totalAccounts = await Account.countDocuments();
  
  const accountsByAdmin = await Account.aggregate([
    {
      $group: {
        _id: '$usuarioAdministrador',
        count: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'admin'
      }
    },
    {
      $unwind: '$admin'
    },
    {
      $project: {
        adminName: '$admin.name',
        adminEmail: '$admin.email',
        count: 1
      }
    }
  ]);

  res.json({
    success: true,
    message: 'Estadísticas obtenidas exitosamente',
    data: {
      totalAccounts,
      accountsByAdmin
    }
  });
});

module.exports = {
  createAccount,
  getAllAccounts,
  getAccountById,
  updateAccount,
  deleteAccount,
  getAccountStats
}; 