const mongoose = require('mongoose');
const User = require('./shared/models/User');
const Role = require('./shared/models/Role');
const config = require('./config/env.config');

async function createTestUser() {
  try {
    console.log('📦 Conectando a MongoDB...');
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Verificar si existe el rol superadmin
    let superadminRole = await Role.findOne({ nombre: 'superadmin' });
    
    if (!superadminRole) {
      console.log('🔧 Creando rol superadmin...');
      superadminRole = new Role({
        nombre: 'superadmin',
        descripcion: 'Super administrador con acceso total al sistema',
        permisos: ['todos'],
        nivel: 1,
        activo: true,
        esRolSistema: true
      });
      await superadminRole.save();
      console.log('✅ Rol superadmin creado');
    } else {
      console.log('✅ Rol superadmin ya existe');
    }

    // Verificar si ya existe el usuario admin
    const existingUser = await User.findOne({ email: 'admin@kiki.ar' });
    
    if (existingUser) {
      console.log('⚠️  Usuario admin@kiki.ar ya existe');
      console.log('📧 Email: admin@kiki.ar');
      console.log('🔑 Contraseña: admin123');
      console.log('👤 Nombre: Administrador Kiki');
      console.log('🎭 Rol: superadmin');
      return;
    }

    // Crear usuario admin
    console.log('👤 Creando usuario administrador...');
    const adminUser = new User({
      name: 'Administrador Kiki',
      email: 'admin@kiki.ar',
      password: 'admin123',
      role: superadminRole._id,
      status: 'approved'
    });

    await adminUser.save();
    console.log('✅ Usuario administrador creado exitosamente');
    console.log('📧 Email: admin@kiki.ar');
    console.log('🔑 Contraseña: admin123');
    console.log('👤 Nombre: Administrador Kiki');
    console.log('🎭 Rol: superadmin');

  } catch (error) {
    console.error('❌ Error creando usuario de prueba:', error);
  } finally {
    console.log('🔌 Desconectado de MongoDB');
    await mongoose.disconnect();
  }
}

createTestUser(); 