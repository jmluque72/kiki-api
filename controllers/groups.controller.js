const Grupo = require('../shared/models/Grupo');
const Account = require('../shared/models/Account');
const Shared = require('../shared/models/Shared');
const User = require('../shared/models/User');

// Listar grupos
exports.listGroups = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const cuentaId = req.query.cuentaId;

    const query = {};
    
    if (req.user.role.nombre === 'superadmin') {
      if (cuentaId) {
        query.cuenta = cuentaId;
      }
    } else if (req.user.role.nombre === 'adminaccount') {
      if (req.userInstitution) {
        query.cuenta = req.userInstitution._id;
      } else {
        query.cuenta = null;
      }
      
      if (cuentaId) {
        const userAssociations = await Shared.find({
          user: req.user._id,
          status: { $in: ['active', 'pending'] }
        });
        const userAccountIds = userAssociations.map(a => a.account.toString());
        if (!userAccountIds.includes(cuentaId)) {
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

    if (search) {
      query.nombre = { $regex: search, $options: 'i' };
    }

    const total = await Grupo.countDocuments(query);
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
          requiereAprobacionNotificaciones: grupo.requiereAprobacionNotificaciones || false,
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
};

// Crear grupo
exports.createGroup = async (req, res) => {
  try {
    const { nombre, descripcion, cuentaId } = req.body;

    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: 'Nombre es requerido'
      });
    }

    let targetCuentaId = cuentaId;

    if (req.user.role.nombre === 'superadmin') {
      if (!cuentaId) {
        return res.status(400).json({
          success: false,
          message: 'Cuenta es requerida para superadmin'
        });
      }
    } else if (req.user.role.nombre === 'adminaccount') {
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

      if (cuentaId && cuentaId !== userAccount.account._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Solo puedes crear grupos en tu cuenta asociada'
        });
      }

      targetCuentaId = userAccount.account._id;
    } else {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear grupos'
      });
    }

    const cuenta = await Account.findById(targetCuentaId);
    if (!cuenta) {
      return res.status(400).json({
        success: false,
        message: 'La cuenta especificada no existe'
      });
    }

    const grupo = new Grupo({
      nombre,
      descripcion: descripcion || '',
      cuenta: targetCuentaId,
      activo: true,
      creadoPor: req.user._id
    });

    await grupo.save();

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
          requiereAprobacionNotificaciones: grupo.requiereAprobacionNotificaciones || false,
          creadoPor: grupo.creadoPor,
          createdAt: grupo.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Error creando grupo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Obtener grupos por cuenta (mobile)
exports.getGroupsByAccount = async (req, res) => {
  try {
    const { cuentaId } = req.params;

    const cuenta = await Account.findById(cuentaId);
    if (!cuenta || cuenta.activo === false) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada o inactiva'
      });
    }

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
};

// Obtener grupo por ID
exports.getGroupById = async (req, res) => {
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

    if (req.user.role.nombre === 'superadmin') {
      // Superadmin puede ver cualquier grupo
    } else if (req.user.role.nombre === 'adminaccount') {
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
          requiereAprobacionNotificaciones: grupo.requiereAprobacionNotificaciones || false,
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
};

// Actualizar grupo
exports.updateGroup = async (req, res) => {
  try {
    const { nombre, descripcion, activo, requiereAprobacionNotificaciones } = req.body;

    const grupo = await Grupo.findById(req.params.id)
      .populate('cuenta', 'nombre razonSocial');

    if (!grupo) {
      return res.status(404).json({
        success: false,
        message: 'Grupo no encontrado'
      });
    }

    if (req.user.role.nombre === 'superadmin') {
      // Superadmin puede editar cualquier grupo
    } else if (req.user.role.nombre === 'adminaccount') {
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

    if (nombre !== undefined) grupo.nombre = nombre;
    if (descripcion !== undefined) grupo.descripcion = descripcion;
    if (activo !== undefined) grupo.activo = activo;
    if (requiereAprobacionNotificaciones !== undefined) grupo.requiereAprobacionNotificaciones = requiereAprobacionNotificaciones;

    await grupo.save();

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
          requiereAprobacionNotificaciones: grupo.requiereAprobacionNotificaciones || false,
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
};

// Eliminar grupo
exports.deleteGroup = async (req, res) => {
  try {
    const grupo = await Grupo.findById(req.params.id)
      .populate('cuenta', 'nombre razonSocial');

    if (!grupo) {
      return res.status(404).json({
        success: false,
        message: 'Grupo no encontrado'
      });
    }

    if (req.user.role.nombre === 'superadmin') {
      // Superadmin puede eliminar cualquier grupo
    } else if (req.user.role.nombre === 'adminaccount') {
      if (req.user.isCognitoUser) {
        const dbUser = await User.findOne({ email: req.user.email })
          .populate('account', 'nombre razonSocial');
        
        if (!dbUser || !dbUser.account || dbUser.account._id.toString() !== grupo.cuenta._id.toString()) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para eliminar este grupo'
          });
        }
      } else {
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
};

// Obtener grupos por cuenta (endpoint alternativo)
exports.getGroupsByAccountId = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { userId } = req.user;
    const { activo } = req.query;

    const user = await User.findById(userId).populate('role');
    const userAssociation = await Shared.findOne({
      user: userId,
      account: accountId,
      status: 'active'
    });

    if (!userAssociation && user.role?.nombre !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes acceso a esta cuenta'
      });
    }

    const query = { cuenta: accountId };
    if (activo !== undefined) {
      query.activo = activo === 'true';
    }

    const grupos = await Grupo.find(query)
      .populate('cuenta', 'nombre razonSocial')
      .populate('creadoPor', 'name email')
      .sort({ nombre: 1 });

    res.json({
      success: true,
      data: {
        grupos: grupos,
        total: grupos.length
      }
    });
  } catch (error) {
    console.error('Error obteniendo grupos por cuenta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

