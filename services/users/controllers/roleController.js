const Role = require('../../../shared/models/Role');
const { seedRoles } = require('../../../database/seeders/roleSeeder');

// Obtener todos los roles
const getAllRoles = async (req, res) => {
  try {
    const { activo, nivel, search } = req.query;
    
    // Construir filtros
    const filters = {};
    
    if (activo !== undefined) {
      filters.activo = activo === 'true';
    }
    
    if (nivel) {
      filters.nivel = parseInt(nivel);
    }
    
    if (search) {
      filters.$or = [
        { nombre: { $regex: search, $options: 'i' } },
        { descripcion: { $regex: search, $options: 'i' } }
      ];
    }

    const roles = await Role.find(filters).sort({ nivel: 1 });

    res.json({
      success: true,
      data: roles,
      total: roles.length
    });
  } catch (error) {
    console.error('Error al obtener roles:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Obtener un rol por ID
const getRoleById = async (req, res) => {
  try {
    const { id } = req.params;

    const role = await Role.findById(id);

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }

    res.json({
      success: true,
      data: role
    });
  } catch (error) {
    console.error('Error al obtener rol:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Obtener un rol por nombre
const getRoleByName = async (req, res) => {
  try {
    const { nombre } = req.params;

    const role = await Role.findOne({ nombre });

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }

    res.json({
      success: true,
      data: role
    });
  } catch (error) {
    console.error('Error al obtener rol por nombre:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Crear un nuevo rol (solo para casos especiales)
const createRole = async (req, res) => {
  try {
    const { nombre, descripcion, permisos, nivel, activo, esRolSistema } = req.body;

    // Verificar que no existe un rol con el mismo nombre
    const existingRole = await Role.findOne({ nombre });
    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un rol con este nombre'
      });
    }

    const role = new Role({
      nombre,
      descripcion,
      permisos,
      nivel,
      activo: activo !== undefined ? activo : true,
      esRolSistema: esRolSistema !== undefined ? esRolSistema : false
    });

    await role.save();

    res.status(201).json({
      success: true,
      message: 'Rol creado exitosamente',
      data: role
    });
  } catch (error) {
    console.error('Error al crear rol:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Actualizar un rol
const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }

    // Verificar si es un rol del sistema y si se puede modificar
    if (role.esRolSistema && !req.user.role === 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para modificar roles del sistema'
      });
    }

    const updatedRole = await Role.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Rol actualizado exitosamente',
      data: updatedRole
    });
  } catch (error) {
    console.error('Error al actualizar rol:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Eliminar un rol
const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;

    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }

    // Verificar si es un rol del sistema
    if (role.esRolSistema) {
      return res.status(403).json({
        success: false,
        message: 'No se pueden eliminar roles del sistema'
      });
    }

    await Role.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Rol eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar rol:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Obtener jerarquía de roles
const getRoleHierarchy = async (req, res) => {
  try {
    const hierarchy = Role.getJerarquia();
    const roles = await Role.find({ activo: true }).sort({ nivel: 1 });

    const hierarchyWithDetails = {};
    roles.forEach(role => {
      hierarchyWithDetails[role.nivel] = {
        nombre: role.nombre,
        descripcion: role.descripcion,
        permisos: role.permisos.length,
        activo: role.activo
      };
    });

    res.json({
      success: true,
      data: {
        hierarchy: hierarchyWithDetails,
        roles: roles
      }
    });
  } catch (error) {
    console.error('Error al obtener jerarquía de roles:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Obtener roles por nivel (para usuarios con cierto nivel)
const getRolesByLevel = async (req, res) => {
  try {
    const { nivel } = req.params;
    
    const roles = await Role.getRolesPorNivel(parseInt(nivel));

    res.json({
      success: true,
      data: roles
    });
  } catch (error) {
    console.error('Error al obtener roles por nivel:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Verificar permisos de un rol
const checkRolePermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { modulo, accion } = req.query;

    if (!modulo || !accion) {
      return res.status(400).json({
        success: false,
        message: 'Se requieren los parámetros modulo y accion'
      });
    }

    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }

    const hasPermission = role.tienePermiso(modulo, accion);

    res.json({
      success: true,
      data: {
        roleId: id,
        roleName: role.nombre,
        modulo,
        accion,
        hasPermission
      }
    });
  } catch (error) {
    console.error('Error al verificar permisos del rol:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Inicializar roles por defecto
const initializeRoles = async (req, res) => {
  try {
    const createdRoles = await seedRoles();
    
    res.json({
      success: true,
      message: 'Roles inicializados exitosamente',
      data: createdRoles
    });
  } catch (error) {
    console.error('Error al inicializar roles:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

module.exports = {
  getAllRoles,
  getRoleById,
  getRoleByName,
  createRole,
  updateRole,
  deleteRole,
  getRoleHierarchy,
  getRolesByLevel,
  checkRolePermissions,
  initializeRoles
}; 