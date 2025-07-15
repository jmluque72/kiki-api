const Role = require('../../shared/models/Role');

const defaultRoles = [
  {
    nombre: 'superadmin',
    descripcion: 'Super administrador con acceso total al sistema',
    nivel: 1,
    permisos: [
      {
        modulo: 'usuarios',
        acciones: ['crear', 'leer', 'actualizar', 'eliminar', 'administrar']
      },
      {
        modulo: 'cuentas',
        acciones: ['crear', 'leer', 'actualizar', 'eliminar', 'administrar']
      },
      {
        modulo: 'grupos',
        acciones: ['crear', 'leer', 'actualizar', 'eliminar', 'administrar']
      },
      {
        modulo: 'roles',
        acciones: ['crear', 'leer', 'actualizar', 'eliminar', 'administrar']
      },
      {
        modulo: 'reportes',
        acciones: ['crear', 'leer', 'actualizar', 'eliminar', 'administrar']
      },
      {
        modulo: 'configuracion',
        acciones: ['crear', 'leer', 'actualizar', 'eliminar', 'administrar']
      },
      {
        modulo: 'familias',
        acciones: ['crear', 'leer', 'actualizar', 'eliminar', 'administrar']
      }
    ],
    activo: true,
    esRolSistema: true
  },
  {
    nombre: 'adminaccount',
    descripcion: 'Administrador de cuenta con permisos completos dentro de su cuenta',
    nivel: 2,
    permisos: [
      {
        modulo: 'usuarios',
        acciones: ['crear', 'leer', 'actualizar', 'eliminar']
      },
      {
        modulo: 'cuentas',
        acciones: ['leer', 'actualizar']
      },
      {
        modulo: 'grupos',
        acciones: ['crear', 'leer', 'actualizar', 'eliminar']
      },
      {
        modulo: 'reportes',
        acciones: ['crear', 'leer', 'actualizar', 'eliminar']
      },
      {
        modulo: 'configuracion',
        acciones: ['leer', 'actualizar']
      },
      {
        modulo: 'familias',
        acciones: ['crear', 'leer', 'actualizar', 'eliminar']
      }
    ],
    activo: true,
    esRolSistema: true
  },
  {
    nombre: 'coordinador',
    descripcion: 'Coordinador de grupos con permisos de gestión de usuarios y familias',
    nivel: 3,
    permisos: [
      {
        modulo: 'usuarios',
        acciones: ['crear', 'leer', 'actualizar']
      },
      {
        modulo: 'cuentas',
        acciones: ['leer']
      },
      {
        modulo: 'grupos',
        acciones: ['crear', 'leer', 'actualizar']
      },
      {
        modulo: 'reportes',
        acciones: ['leer', 'crear']
      },
      {
        modulo: 'familias',
        acciones: ['crear', 'leer', 'actualizar']
      }
    ],
    activo: true,
    esRolSistema: true
  },
  {
    nombre: 'familyadmin',
    descripcion: 'Administrador de familia con permisos de gestión de su grupo familiar',
    nivel: 4,
    permisos: [
      {
        modulo: 'usuarios',
        acciones: ['leer', 'actualizar']
      },
      {
        modulo: 'cuentas',
        acciones: ['leer']
      },
      {
        modulo: 'grupos',
        acciones: ['leer']
      },
      {
        modulo: 'reportes',
        acciones: ['leer']
      },
      {
        modulo: 'familias',
        acciones: ['leer', 'actualizar']
      }
    ],
    activo: true,
    esRolSistema: true
  },
  {
    nombre: 'familyviewer',
    descripcion: 'Visualizador de familia con permisos de solo lectura',
    nivel: 5,
    permisos: [
      {
        modulo: 'usuarios',
        acciones: ['ver']
      },
      {
        modulo: 'cuentas',
        acciones: ['ver']
      },
      {
        modulo: 'grupos',
        acciones: ['ver']
      },
      {
        modulo: 'reportes',
        acciones: ['ver']
      },
      {
        modulo: 'familias',
        acciones: ['ver']
      }
    ],
    activo: true,
    esRolSistema: true
  }
];

const seedRoles = async () => {
  try {
    console.log('🌱 Iniciando seeder de roles...');
    
    // Verificar si ya existen roles
    const existingRoles = await Role.find({});
    if (existingRoles.length > 0) {
      console.log('ℹ️  Los roles ya existen en la base de datos');
      return;
    }

    // Crear roles por defecto
    const createdRoles = await Role.insertMany(defaultRoles);
    console.log(`✅ Se crearon ${createdRoles.length} roles exitosamente:`);
    
    createdRoles.forEach(role => {
      console.log(`   - ${role.nombre} (Nivel ${role.nivel}): ${role.descripcion}`);
    });

    return createdRoles;
  } catch (error) {
    console.error('❌ Error al crear roles por defecto:', error);
    throw error;
  }
};

const updateRoles = async () => {
  try {
    console.log('🔄 Actualizando roles existentes...');
    
    for (const roleData of defaultRoles) {
      const updatedRole = await Role.findOneAndUpdate(
        { nombre: roleData.nombre },
        roleData,
        { new: true, upsert: true }
      );
      console.log(`✅ Rol actualizado: ${updatedRole.nombre}`);
    }
    
    console.log('✅ Todos los roles han sido actualizados');
  } catch (error) {
    console.error('❌ Error al actualizar roles:', error);
    throw error;
  }
};

const deleteAllRoles = async () => {
  try {
    console.log('🗑️  Eliminando todos los roles...');
    const result = await Role.deleteMany({});
    console.log(`✅ Se eliminaron ${result.deletedCount} roles`);
    return result;
  } catch (error) {
    console.error('❌ Error al eliminar roles:', error);
    throw error;
  }
};

const listRoles = async () => {
  try {
    const roles = await Role.find({}).sort({ nivel: 1 });
    console.log('📋 Roles en la base de datos:');
    roles.forEach(role => {
      console.log(`   - ${role.nombre} (Nivel ${role.nivel}): ${role.descripcion}`);
      console.log(`     Permisos: ${role.permisos.length} módulos`);
    });
    return roles;
  } catch (error) {
    console.error('❌ Error al listar roles:', error);
    throw error;
  }
};

module.exports = {
  seedRoles,
  updateRoles,
  deleteAllRoles,
  listRoles,
  defaultRoles
}; 