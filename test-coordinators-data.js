const mongoose = require('mongoose');
const config = require('./config/env.config');
const User = require('./shared/models/User');
const Shared = require('./shared/models/Shared');
const Role = require('./shared/models/Role');

async function testCoordinatorsData() {
  try {
    console.log('🔍 Conectando a MongoDB...');
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Buscar el rol de coordinador
    const coordinadorRole = await Role.findOne({ nombre: 'coordinador' });
    if (!coordinadorRole) {
      console.log('❌ No se encontró el rol de coordinador');
      return;
    }
    console.log('✅ Rol de coordinador encontrado:', coordinadorRole.nombre);

    // Buscar usuarios con rol de coordinador
    const coordinadores = await User.find({ role: coordinadorRole._id }).select('name email status createdAt');
    console.log(`📊 Encontrados ${coordinadores.length} usuarios con rol coordinador:`);
    
    coordinadores.forEach((coord, index) => {
      console.log(`  ${index + 1}. Nombre: ${coord.name}, Email: ${coord.email}, Status: ${coord.status}, Activo: ${coord.status === 'approved'}`);
    });

    // Buscar asociaciones de coordinadores
    const coordinadorAssociations = await Shared.find({
      role: coordinadorRole._id,
      status: 'active'
    }).populate([
      {
        path: 'user',
        select: 'name email status createdAt'
      },
      {
        path: 'role',
        select: 'nombre descripcion'
      }
    ]);

    console.log(`\n📋 Encontradas ${coordinadorAssociations.length} asociaciones de coordinadores:`);
    
    coordinadorAssociations.forEach((assoc, index) => {
      console.log(`  ${index + 1}. Usuario: ${assoc.user?.name || 'N/A'}, Email: ${assoc.user?.email || 'N/A'}, Status: ${assoc.user?.status || 'N/A'}, Activo: ${assoc.user?.status === 'approved'}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
  }
}

testCoordinatorsData();
