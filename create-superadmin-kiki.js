const mongoose = require('mongoose');
const User = require('./shared/models/User');
const Role = require('./shared/models/Role');

// Cargar configuración del servidor
require('dotenv').config({ path: './env.config' });
const config = require('./config/database');

async function createSuperAdminKiki() {
  try {
    console.log('📦 Conectando a MongoDB...');
    console.log('🔗 URI:', config.MONGODB_URI);
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Verificar si existe el rol superadmin
    let superadminRole = await Role.findOne({ nombre: 'superadmin' });
    
    if (!superadminRole) {
      console.log('🔧 Creando rol superadmin...');
      superadminRole = new Role({
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
      });
      await superadminRole.save();
      console.log('✅ Rol superadmin creado');
    } else {
      console.log('✅ Rol superadmin ya existe');
    }

    // Verificar si ya existe el usuario superadmin
    const existingUser = await User.findOne({ email: 'superadmin@kiki.com.ar' });
    
    if (existingUser) {
      console.log('⚠️  Usuario superadmin@kiki.com.ar ya existe');
      console.log('📧 Email: superadmin@kiki.com.ar');
      console.log('🔑 Contraseña: admin123');
      console.log('👤 Nombre: Super Administrador');
      console.log('🎭 Rol: superadmin');
      console.log('🆔 ID:', existingUser._id);
      return;
    }

    // Crear usuario superadmin
    console.log('👤 Creando usuario super administrador...');
    const superAdminUser = new User({
      name: 'Super Administrador',
      email: 'superadmin@kiki.com.ar',
      password: 'admin123',
      role: superadminRole._id,
      status: 'approved'
    });

    await superAdminUser.save();
    console.log('✅ Usuario super administrador creado exitosamente');
    console.log('📧 Email: superadmin@kiki.com.ar');
    console.log('🔑 Contraseña: admin123');
    console.log('👤 Nombre: Super Administrador');
    console.log('🎭 Rol: superadmin');
    console.log('🆔 ID:', superAdminUser._id);
    console.log('🗄️  Base de datos: kiki (la misma que usa el servidor)');

  } catch (error) {
    console.error('❌ Error creando usuario super administrador:', error);
  } finally {
    console.log('🔌 Desconectado de MongoDB');
    await mongoose.disconnect();
  }
}

createSuperAdminKiki();
