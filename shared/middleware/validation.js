const Joi = require('joi');

// Función para validar datos
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Datos de entrada inválidos',
        errors: errorDetails
      });
    }
    
    next();
  };
};

// Esquemas de validación para usuarios
const userSchemas = {
  register: Joi.object({
    name: Joi.string().min(2).max(50).required().messages({
      'string.empty': 'El nombre es obligatorio',
      'string.min': 'El nombre debe tener al menos 2 caracteres',
      'string.max': 'El nombre no puede exceder 50 caracteres'
    }),
    email: Joi.string().email().required().messages({
      'string.empty': 'El email es obligatorio',
      'string.email': 'El email debe ser válido'
    }),
    password: Joi.string().min(6).required().messages({
      'string.empty': 'La contraseña es obligatoria',
      'string.min': 'La contraseña debe tener al menos 6 caracteres'
    }),
    role: Joi.string().optional(),
    status: Joi.string().valid('pending', 'approved', 'rejected').optional().default('pending').messages({
      'any.only': 'El status debe ser: pending, approved o rejected'
    })
  }),
  
  login: Joi.object({
    email: Joi.string().email().required().messages({
      'string.empty': 'El email es obligatorio',
      'string.email': 'El email debe ser válido'
    }),
    password: Joi.string().required().messages({
      'string.empty': 'La contraseña es obligatoria'
    })
  }),
  
  updateProfile: Joi.object({
    name: Joi.string().min(2).max(50).optional(),
    email: Joi.string().email().optional(),
    status: Joi.string().valid('pending', 'approved', 'rejected').optional().messages({
      'any.only': 'El status debe ser: pending, approved o rejected'
    })
  })
};

// Esquemas de validación para cuentas
const accountSchemas = {
  create: Joi.object({
    nombre: Joi.string().min(2).max(100).required().messages({
      'string.empty': 'El nombre es obligatorio',
      'string.min': 'El nombre debe tener al menos 2 caracteres',
      'string.max': 'El nombre no puede exceder 100 caracteres'
    }),
    razonSocial: Joi.string().min(2).max(150).required().messages({
      'string.empty': 'La razón social es obligatoria',
      'string.min': 'La razón social debe tener al menos 2 caracteres',
      'string.max': 'La razón social no puede exceder 150 caracteres'
    }),
    address: Joi.string().max(200).required().messages({
      'string.empty': 'La dirección es obligatoria',
      'string.max': 'La dirección no puede exceder 200 caracteres'
    }),
    logo: Joi.string().optional().allow(null, '').custom((value, helpers) => {
      if (!value) return value;
      
      // Si es una URL (empieza con http)
      if (value.startsWith('http')) {
        if (value.length > 500) {
          return helpers.error('string.max');
        }
        return value;
      }
      
      // Si es base64 (empieza con data:image)
      if (value.startsWith('data:image/')) {
        const base64Regex = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/;
        if (!base64Regex.test(value)) {
          return helpers.error('string.base64');
        }
        return value;
      }
      
      // Si no es ni URL ni base64
      return helpers.error('string.format');
    }).messages({
      'string.max': 'La URL del logo no puede exceder 500 caracteres',
      'string.base64': 'El formato de imagen base64 no es válido. Formatos soportados: jpeg, jpg, png, gif, webp',
      'string.format': 'El logo debe ser una URL válida o una imagen en formato base64'
    }),
    emailAdmin: Joi.string().email().required().messages({
      'string.empty': 'El email del administrador es obligatorio',
      'string.email': 'El email del administrador debe ser válido'
    }),
    passwordAdmin: Joi.string().min(6).required().messages({
      'string.empty': 'La contraseña del administrador es obligatoria',
      'string.min': 'La contraseña debe tener al menos 6 caracteres'
    }),
    nombreAdmin: Joi.string().min(2).max(50).optional().messages({
      'string.min': 'El nombre del administrador debe tener al menos 2 caracteres',
      'string.max': 'El nombre del administrador no puede exceder 50 caracteres'
    })
  }),
  
  update: Joi.object({
    nombre: Joi.string().min(2).max(100).optional(),
    razonSocial: Joi.string().min(2).max(150).optional(),
    address: Joi.string().max(200).optional(),
    logo: Joi.string().max(500).optional().allow(null, '')
  }).min(1) // Al menos un campo debe ser enviado para actualizar
};

// Esquemas de validación para grupos
const groupSchemas = {
  create: Joi.object({
    nombre: Joi.string().min(2).max(100).required().messages({
      'string.empty': 'El nombre del grupo es obligatorio',
      'string.min': 'El nombre debe tener al menos 2 caracteres',
      'string.max': 'El nombre no puede exceder 100 caracteres'
    }),
    descripcion: Joi.string().max(500).optional().allow('').messages({
      'string.max': 'La descripción no puede exceder 500 caracteres'
    }),
    account: Joi.string().required().messages({
      'string.empty': 'La cuenta es obligatoria'
    }),
    usuarios: Joi.array().items(Joi.string()).optional().default([]),
    permisos: Joi.array().items(
      Joi.object({
        modulo: Joi.string().valid('usuarios', 'cuentas', 'grupos', 'reportes', 'configuracion').required(),
        acciones: Joi.array().items(
          Joi.string().valid('crear', 'leer', 'actualizar', 'eliminar', 'administrar')
        ).required()
      })
    ).optional().default([]),
    activo: Joi.boolean().optional().default(true),
    creadoPor: Joi.string().required().messages({
      'string.empty': 'El usuario creador es obligatorio'
    })
  }),
  
  update: Joi.object({
    nombre: Joi.string().min(2).max(100).optional(),
    descripcion: Joi.string().max(500).optional().allow(''),
    usuarios: Joi.array().items(Joi.string()).optional(),
    permisos: Joi.array().items(
      Joi.object({
        modulo: Joi.string().valid('usuarios', 'cuentas', 'grupos', 'reportes', 'configuracion').required(),
        acciones: Joi.array().items(
          Joi.string().valid('crear', 'leer', 'actualizar', 'eliminar', 'administrar')
        ).required()
      })
    ).optional(),
    activo: Joi.boolean().optional()
  }).min(1), // Al menos un campo debe ser enviado para actualizar
  
  addUser: Joi.object({
    usuarioId: Joi.string().required().messages({
      'string.empty': 'El ID del usuario es obligatorio'
    })
  }),
  
  removeUser: Joi.object({
    usuarioId: Joi.string().required().messages({
      'string.empty': 'El ID del usuario es obligatorio'
    })
  })
};

// Esquemas de validación para roles
const roleSchemas = {
  create: Joi.object({
    nombre: Joi.string().valid('superadmin', 'adminaccount', 'coordinador', 'familyadmin', 'familyviewer').required().messages({
      'string.empty': 'El nombre del rol es obligatorio',
      'any.only': 'El rol debe ser uno de los valores permitidos'
    }),
    descripcion: Joi.string().max(500).required().messages({
      'string.empty': 'La descripción del rol es obligatoria',
      'string.max': 'La descripción no puede exceder 500 caracteres'
    }),
    permisos: Joi.array().items(
      Joi.object({
        modulo: Joi.string().valid('usuarios', 'cuentas', 'grupos', 'roles', 'reportes', 'configuracion', 'familias').required(),
        acciones: Joi.array().items(
          Joi.string().valid('crear', 'leer', 'actualizar', 'eliminar', 'administrar', 'ver')
        ).required()
      })
    ).required(),
    nivel: Joi.number().integer().min(1).max(5).required().messages({
      'number.base': 'El nivel debe ser un número',
      'number.min': 'El nivel mínimo es 1',
      'number.max': 'El nivel máximo es 5'
    }),
    activo: Joi.boolean().optional().default(true),
    esRolSistema: Joi.boolean().optional().default(true)
  }),
  
  update: Joi.object({
    descripcion: Joi.string().max(500).optional(),
    permisos: Joi.array().items(
      Joi.object({
        modulo: Joi.string().valid('usuarios', 'cuentas', 'grupos', 'roles', 'reportes', 'configuracion', 'familias').required(),
        acciones: Joi.array().items(
          Joi.string().valid('crear', 'leer', 'actualizar', 'eliminar', 'administrar', 'ver')
        ).required()
      })
    ).optional(),
    activo: Joi.boolean().optional()
  }).min(1) // Al menos un campo debe ser enviado para actualizar
};

// Middleware específicos para cada endpoint
const validateUserRegister = validate(userSchemas.register);
const validateUserLogin = validate(userSchemas.login);
const validateUserUpdate = validate(userSchemas.updateProfile);
const validateAccountCreate = validate(accountSchemas.create);
const validateAccountUpdate = validate(accountSchemas.update);
const validateGroupCreate = validate(groupSchemas.create);
const validateGroupUpdate = validate(groupSchemas.update);
const validateGroupAddUser = validate(groupSchemas.addUser);
const validateGroupRemoveUser = validate(groupSchemas.removeUser);
const validateRoleCreate = validate(roleSchemas.create);
const validateRoleUpdate = validate(roleSchemas.update);

module.exports = {
  validate,
  userSchemas,
  accountSchemas,
  groupSchemas,
  roleSchemas,
  validateUserRegister,
  validateUserLogin,
  validateUserUpdate,
  validateAccountCreate,
  validateAccountUpdate,
  validateGroupCreate,
  validateGroupUpdate,
  validateGroupAddUser,
  validateGroupRemoveUser,
  validateRoleCreate,
  validateRoleUpdate
}; 