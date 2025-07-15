const User = require('../../../shared/models/User');
const { asyncHandler, AppError } = require('../../../shared/middleware/errorHandler');

// @desc    Registrar nuevo usuario
// @route   POST /api/users/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, status } = req.body;

  // Verificar si el usuario ya existe
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new AppError('El usuario ya existe con este email', 400);
  }

  // Crear usuario
  const user = await User.create({
    name,
    email,
    password,
    role,
    status: status || 'pending'
  });

  // Generar token
  const token = user.generateToken();

  res.status(201).json({
    success: true,
    message: 'Usuario registrado exitosamente',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt
      },
      token
    }
  });
});

// @desc    Autenticar usuario
// @route   POST /api/users/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Buscar usuario por email
  const user = await User.findOne({ email }).select('+password');
  
  if (!user) {
    throw new AppError('Credenciales inválidas', 401);
  }

  // Verificar si el usuario está aprobado
  if (user.status !== 'approved') {
    throw new AppError(`Usuario ${user.status === 'pending' ? 'pendiente de aprobación' : 'rechazado'}`, 401);
  }

  // Verificar contraseña
  const isPasswordValid = await user.comparePassword(password);
  
  if (!isPasswordValid) {
    throw new AppError('Credenciales inválidas', 401);
  }

  // Actualizar último login
  await user.updateLastLogin();

  // Generar token
  const token = user.generateToken();

  res.json({
    success: true,
    message: 'Inicio de sesión exitoso',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        lastLogin: user.lastLogin
      },
      token
    }
  });
});

// @desc    Obtener perfil del usuario
// @route   GET /api/users/profile
// @access  Private
const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  
  if (!user) {
    throw new AppError('Usuario no encontrado', 404);
  }

  res.json({
    success: true,
    message: 'Perfil obtenido exitosamente',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    }
  });
});

// @desc    Actualizar perfil del usuario
// @route   PUT /api/users/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const { name, email, status } = req.body;

  const user = await User.findById(req.user.id);
  
  if (!user) {
    throw new AppError('Usuario no encontrado', 404);
  }

  // Verificar si el email ya existe (si se está cambiando)
  if (email && email !== user.email) {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new AppError('El email ya está en uso', 400);
    }
  }

  // Actualizar campos
  if (name) user.name = name;
  if (email) user.email = email;
  if (status) user.status = status;

  await user.save();

  res.json({
    success: true,
    message: 'Perfil actualizado exitosamente',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        updatedAt: user.updatedAt
      }
    }
  });
});

// @desc    Obtener todos los usuarios (Solo admin)
// @route   GET /api/users
// @access  Private/Admin
const getAllUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const query = {};
  
  // Filtros opcionales
  if (req.query.role) {
    query.role = req.query.role;
  }
  
  if (req.query.status) {
    query.status = req.query.status;
  }

  const users = await User.find(query)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const total = await User.countDocuments(query);

  res.json({
    success: true,
    message: 'Usuarios obtenidos exitosamente',
    data: {
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// @desc    Obtener usuario por ID (Solo admin)
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    throw new AppError('Usuario no encontrado', 404);
  }

  res.json({
    success: true,
    message: 'Usuario obtenido exitosamente',
    data: {
      user
    }
  });
});

// @desc    Cambiar status del usuario (Solo admin)
// @route   PUT /api/users/:id/status
// @access  Private/Admin
const changeUserStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    throw new AppError('Status inválido. Debe ser: pending, approved o rejected', 400);
  }

  const user = await User.findById(req.params.id);
  
  if (!user) {
    throw new AppError('Usuario no encontrado', 404);
  }

  user.status = status;
  await user.save();

  const statusMessages = {
    pending: 'Usuario marcado como pendiente',
    approved: 'Usuario aprobado exitosamente',
    rejected: 'Usuario rechazado exitosamente'
  };

  res.json({
    success: true,
    message: statusMessages[status],
    data: {
      user
    }
  });
});

module.exports = {
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  getAllUsers,
  getUserById,
  changeUserStatus
}; 