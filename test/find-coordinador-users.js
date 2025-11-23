const mongoose = require('mongoose');
require('dotenv').config();

// Conectar a MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Importar modelos
const User = require('./models/User');
const Role = require('./models/Role');

async function findCoordinadorUsers() {
  try {
    console.log('🔍 [FIND COORDINADOR USERS] Buscando usuarios con rol coordinador...\n');

    // 1. Buscar el rol coordinador
    console.log('1️⃣ Buscando rol coordinador...');
    const coordinadorRole = await Role.findOne({ nombre: 'coordinador' });
    
    if (!coordinadorRole) {
      console.log('❌ No se encontró el rol coordinador');
      console.log('📋 Roles disponibles:');
      const allRoles = await Role.find({}, 'nombre descripcion');
      allRoles.forEach(role => {
        console.log(`   - ${role.nombre}: ${role.descripcion}`);
      });
      return;
    }
    
    console.log('✅ Rol coordinador encontrado');
    console.log('   ID:', coordinadorRole._id);
    console.log('   Nombre:', coordinadorRole.nombre);
    console.log('   Descripción:', coordinadorRole.descripcion);

    // 2. Buscar usuarios con rol coordinador
    console.log('\n2️⃣ Buscando usuarios con rol coordinador...');
    const coordinadorUsers = await User.find({ role: coordinadorRole._id })
      .populate('role')
      .select('name email role status');

    if (coordinadorUsers.length === 0) {
      console.log('❌ No se encontraron usuarios con rol coordinador');
      
      // Mostrar todos los usuarios disponibles
      console.log('\n📋 Usuarios disponibles:');
      const allUsers = await User.find({})
        .populate('role')
        .select('name email role.nombre status')
        .limit(10);
      
      allUsers.forEach(user => {
        console.log(`   - ${user.name} (${user.email}): ${user.role?.nombre || 'Sin rol'} - ${user.status}`);
      });
      return;
    }

    console.log(`✅ Se encontraron ${coordinadorUsers.length} usuarios con rol coordinador:`);
    coordinadorUsers.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.name} (${user.email}) - ${user.status}`);
    });

    // 3. Mostrar el primer usuario coordinador para usar en pruebas
    const firstCoordinador = coordinadorUsers[0];
    console.log('\n3️⃣ Usuario recomendado para pruebas:');
    console.log(`   Email: ${firstCoordinador.email}`);
    console.log(`   Nombre: ${firstCoordinador.name}`);
    console.log(`   Rol: ${firstCoordinador.role.nombre}`);
    console.log(`   Status: ${firstCoordinador.status}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

findCoordinadorUsers();
