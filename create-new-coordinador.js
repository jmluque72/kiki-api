const mongoose = require('mongoose');
const User = require('./shared/models/User');
const Account = require('./shared/models/Account');
const Grupo = require('./shared/models/Grupo');
const Role = require('./shared/models/Role');
const Shared = require("./shared/models/Shared");

// Conectar a MongoDB
mongoose.connect('mongodb://localhost:27017/kiki', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function createNewCoordinador() {
  try {
    console.log('🚀 Creando nuevo usuario coordinador...\n');

    // Eliminar usuario existente si existe
    await User.deleteOne({ email: 'coordinador@test.com' });
    console.log('🗑️ Usuario anterior eliminado');

    // Crear rol coordinador
    console.log('📝 Creando rol coordinador...');
    const coordinadorRole = await Role.findOneAndUpdate(
      { nombre: 'coordinador' },
      { nombre: 'coordinador', descripcion: 'Coordinador' },
      { upsert: true, new: true }
    );
    console.log('✅ Rol coordinador creado');

    // Buscar cuenta existente
    console.log('🏢 Buscando cuenta...');
    let account = await Account.findOne({ nombre: 'Colegio Alemán' });
    console.log('✅ Cuenta encontrada:', account.nombre);

    // Buscar división existente
    console.log('📚 Buscando división...');
    let division = await Grupo.findOne({ nombre: 'Primer Año' });
    console.log('✅ División encontrada:', division.nombre);

    // Crear usuario coordinador usando create() para que se ejecute el middleware
    console.log('👤 Creando usuario coordinador...');
    const coordinadorUser = new User({
      email: 'coordinador@test.com',
      password: 'password123',
      name: 'Coordinador Test',
      role: coordinadorRole._id,
      status: 'approved'
    });

    await coordinadorUser.save();
    console.log('✅ Usuario coordinador creado:', coordinadorUser.email);

    // Verificar que la contraseña se hasheó
    const isPasswordValid = await coordinadorUser.comparePassword('password123');
    console.log('✅ Contraseña válida:', isPasswordValid);

    // Crear asociación
    console.log('🔗 Creando asociación...');
    await Shared.findOneAndUpdate(
      { user: coordinadorUser._id, account: account._id },
      {
        user: coordinadorUser._id,
        account: account._id,
        division: division._id,
        status: 'active'
      },
      { upsert: true }
    );
    console.log('✅ Asociación creada');

    console.log('\n🎉 Nuevo usuario coordinador creado exitosamente!');
    console.log('\n📋 Credenciales:');
    console.log(`   - Email: coordinador@test.com`);
    console.log(`   - Password: password123`);
    console.log(`   - Rol: coordinador`);
    console.log(`   - Status: approved`);
    console.log(`   - Cuenta: ${account.nombre}`);
    console.log(`   - División: ${division.nombre}`);

  } catch (error) {
    console.error('❌ Error creando nuevo usuario coordinador:', error);
  } finally {
    mongoose.connection.close();
  }
}

createNewCoordinador();
