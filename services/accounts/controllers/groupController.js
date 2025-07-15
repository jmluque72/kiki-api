const mongoose = require('mongoose');
const Group = require('../../../shared/models/Group');
const Account = require('../../../shared/models/Account');
const User = require('../../../shared/models/User');

// Crear un nuevo grupo
const createGroup = async (req, res) => {
  try {
    const { nombre, descripcion, account, usuarios, permisos, activo, creadoPor } = req.body;

    // Verificar que la cuenta existe
    const accountExists = await Account.findById(account);
    if (!accountExists) {
      return res.status(404).json({
        success: false,
        message: 'La cuenta especificada no existe'
      });
    }

    // Verificar que el usuario creador existe
    const creatorExists = await User.findById(creadoPor);
    if (!creatorExists) {
      return res.status(404).json({
        success: false,
        message: 'El usuario creador no existe'
      });
    }

    // Verificar que los usuarios existen (si se proporcionan)
    if (usuarios && usuarios.length > 0) {
      const existingUsers = await User.find({ _id: { $in: usuarios } });
      if (existingUsers.length !== usuarios.length) {
        return res.status(400).json({
          success: false,
          message: 'Algunos usuarios especificados no existen'
        });
      }
    }

    // Verificar que no existe un grupo con el mismo nombre en la cuenta
    const existingGroup = await Group.findOne({ account, nombre });
    if (existingGroup) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un grupo con este nombre en la cuenta'
      });
    }

    const group = new Group({
      nombre,
      descripcion,
      account,
      usuarios: usuarios || [],
      permisos: permisos || [],
      activo: activo !== undefined ? activo : true,
      creadoPor
    });

    await group.save();
    await group.populate(['account', 'usuarios', 'creadoPor']);

    res.status(201).json({
      success: true,
      message: 'Grupo creado exitosamente',
      data: group
    });
  } catch (error) {
    console.error('Error al crear grupo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Obtener todos los grupos de una cuenta
const getGroupsByAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { page = 1, limit = 10, activo, search } = req.query;

    // Verificar que la cuenta existe
    const accountExists = await Account.findById(accountId);
    if (!accountExists) {
      return res.status(404).json({
        success: false,
        message: 'La cuenta especificada no existe'
      });
    }

    // Construir filtros
    const filters = { account: accountId };
    
    if (activo !== undefined) {
      filters.activo = activo === 'true';
    }

    if (search) {
      filters.$or = [
        { nombre: { $regex: search, $options: 'i' } },
        { descripcion: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const groups = await Group.find(filters)
      .populate('account', 'nombre razonSocial')
      .populate('usuarios', 'name email')
      .populate('creadoPor', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Group.countDocuments(filters);

    res.json({
      success: true,
      data: groups,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error al obtener grupos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Obtener un grupo por ID
const getGroupById = async (req, res) => {
  try {
    const { id } = req.params;

    const group = await Group.findById(id)
      .populate('account', 'nombre razonSocial')
      .populate('usuarios', 'name email')
      .populate('creadoPor', 'name email');

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Grupo no encontrado'
      });
    }

    res.json({
      success: true,
      data: group
    });
  } catch (error) {
    console.error('Error al obtener grupo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Actualizar un grupo
const updateGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Grupo no encontrado'
      });
    }

    // Si se actualiza el nombre, verificar que no exista otro grupo con el mismo nombre en la cuenta
    if (updates.nombre && updates.nombre !== group.nombre) {
      const existingGroup = await Group.findOne({ 
        account: group.account, 
        nombre: updates.nombre,
        _id: { $ne: id }
      });
      if (existingGroup) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe un grupo con este nombre en la cuenta'
        });
      }
    }

    // Verificar que los usuarios existen (si se proporcionan)
    if (updates.usuarios && updates.usuarios.length > 0) {
      const existingUsers = await User.find({ _id: { $in: updates.usuarios } });
      if (existingUsers.length !== updates.usuarios.length) {
        return res.status(400).json({
          success: false,
          message: 'Algunos usuarios especificados no existen'
        });
      }
    }

    const updatedGroup = await Group.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    ).populate(['account', 'usuarios', 'creadoPor']);

    res.json({
      success: true,
      message: 'Grupo actualizado exitosamente',
      data: updatedGroup
    });
  } catch (error) {
    console.error('Error al actualizar grupo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Eliminar un grupo
const deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;

    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Grupo no encontrado'
      });
    }

    await Group.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Grupo eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar grupo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Añadir usuario a un grupo
const addUserToGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { usuarioId } = req.body;

    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Grupo no encontrado'
      });
    }

    // Verificar que el usuario existe
    const userExists = await User.findById(usuarioId);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: 'El usuario especificado no existe'
      });
    }

    // Verificar que el usuario no esté ya en el grupo
    if (group.tieneUsuario(usuarioId)) {
      return res.status(400).json({
        success: false,
        message: 'El usuario ya pertenece al grupo'
      });
    }

    group.agregarUsuario(usuarioId);
    await group.save();
    await group.populate(['account', 'usuarios', 'creadoPor']);

    res.json({
      success: true,
      message: 'Usuario añadido al grupo exitosamente',
      data: group
    });
  } catch (error) {
    console.error('Error al añadir usuario al grupo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Remover usuario de un grupo
const removeUserFromGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { usuarioId } = req.body;

    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Grupo no encontrado'
      });
    }

    // Verificar que el usuario está en el grupo
    if (!group.tieneUsuario(usuarioId)) {
      return res.status(400).json({
        success: false,
        message: 'El usuario no pertenece al grupo'
      });
    }

    group.removerUsuario(usuarioId);
    await group.save();
    await group.populate(['account', 'usuarios', 'creadoPor']);

    res.json({
      success: true,
      message: 'Usuario removido del grupo exitosamente',
      data: group
    });
  } catch (error) {
    console.error('Error al remover usuario del grupo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Obtener estadísticas de grupos
const getGroupStats = async (req, res) => {
  try {
    const { accountId } = req.params;

    // Verificar que la cuenta existe
    const accountExists = await Account.findById(accountId);
    if (!accountExists) {
      return res.status(404).json({
        success: false,
        message: 'La cuenta especificada no existe'
      });
    }

    const stats = await Group.aggregate([
      { $match: { account: mongoose.Types.ObjectId(accountId) } },
      {
        $group: {
          _id: null,
          totalGroups: { $sum: 1 },
          activeGroups: { $sum: { $cond: ['$activo', 1, 0] } },
          inactiveGroups: { $sum: { $cond: ['$activo', 0, 1] } },
          totalUsers: { $sum: { $size: '$usuarios' } },
          avgUsersPerGroup: { $avg: { $size: '$usuarios' } }
        }
      }
    ]);

    const result = stats[0] || {
      totalGroups: 0,
      activeGroups: 0,
      inactiveGroups: 0,
      totalUsers: 0,
      avgUsersPerGroup: 0
    };

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error al obtener estadísticas de grupos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

module.exports = {
  createGroup,
  getGroupsByAccount,
  getGroupById,
  updateGroup,
  deleteGroup,
  addUserToGroup,
  removeUserFromGroup,
  getGroupStats
}; 