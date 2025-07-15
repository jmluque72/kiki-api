const Account = require('../../../shared/models/Account');
const User = require('../../../shared/models/User');
const Role = require('../../../shared/models/Role');
const { asyncHandler, AppError } = require('../../../shared/middleware/errorHandler');
const { saveBase64Image, deleteFile } = require('../../../shared/utils/fileHandler');

// @desc    Crear nueva cuenta
// @route   POST /api/accounts
// @access  Private
const createAccount = asyncHandler(async (req, res) => {
  const { nombre, razonSocial, address, logo, emailAdmin, passwordAdmin, nombreAdmin } = req.body;

  // Verificar que no existe un usuario con ese email
  const existingUser = await User.findOne({ email: emailAdmin });
  if (existingUser) {
    throw new AppError('Ya existe un usuario con ese email', 400);
  }

  // Obtener el rol de adminaccount
  const adminRole = await Role.findOne({ nombre: 'adminaccount' });
  if (!adminRole) {
    throw new AppError('El rol adminaccount no existe. Ejecute el seeder de roles primero.', 500);
  }

  // Crear el usuario administrador
  const adminUser = await User.create({
    name: nombreAdmin || `Admin ${nombre}`,
    email: emailAdmin,
    password: passwordAdmin,
    role: adminRole._id,
    isActive: true
  });

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

  // Crear la cuenta
  const account = await Account.create({
    nombre,
    razonSocial,
    address,
    logo: logoUrl,
    emailAdmin,
    passwordAdmin, // Se guardará hasheada automáticamente por el middleware del modelo User
    usuarioAdministrador: adminUser._id
  });

  // Devolver la cuenta con el usuario administrador populado
  const populatedAccount = await Account.findById(account._id)
    .populate({
      path: 'usuarioAdministrador',
      select: 'name email isActive',
      populate: {
        path: 'role',
        select: 'nombre descripcion nivel'
      }
    });

  res.status(201).json({
    success: true,
    message: 'Cuenta y usuario administrador creados exitosamente',
    data: {
      account: populatedAccount,
      adminUser: {
        id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminRole.nombre
      }
    }
  });
});

// @desc    Obtener todas las cuentas
// @route   GET /api/accounts
// @access  Private
const getAllAccounts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const query = {};
  
  // Filtros opcionales
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
    .populate('usuarioAdministrador', 'name email role')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const total = await Account.countDocuments(query);

  res.json({
    success: true,
    message: 'Cuentas obtenidas exitosamente',
    data: {
      accounts,
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
    .populate('usuarioAdministrador', 'name email role');
  
  if (!account) {
    throw new AppError('Cuenta no encontrada', 404);
  }

  res.json({
    success: true,
    message: 'Cuenta obtenida exitosamente',
    data: {
      account
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

  // Verificar que el usuario administrador existe (si se está cambiando)
  if (req.body.usuarioAdministrador && req.body.usuarioAdministrador !== account.usuarioAdministrador.toString()) {
    const adminUser = await User.findById(req.body.usuarioAdministrador);
    if (!adminUser) {
      throw new AppError('El usuario administrador especificado no existe', 404);
    }
  }

  // Actualizar campos permitidos
  const allowedFields = ['nombre', 'razonSocial', 'address', 'logo', 'usuarioAdministrador'];
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      account[key] = req.body[key];
    }
  });

  await account.save();

  // Obtener cuenta actualizada con populate
  const updatedAccount = await Account.findById(account._id)
    .populate('usuarioAdministrador', 'name email role');

  res.json({
    success: true,
    message: 'Cuenta actualizada exitosamente',
    data: {
      account: updatedAccount
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