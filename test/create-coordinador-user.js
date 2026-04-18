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

async function createCoordinadorUser() {
  try {
    console.log('🚀 Creando usuario coordinador...\n');

    // Crear rol coordinador
    console.log('📝 Creando rol coordinador...');
    const coordinadorRole = await Role.findOneAndUpdate(
      { nombre: 'coordinador' },
      { nombre: 'coordinador', descripcion: 'Coordinador' },
      { upsert: true, new: true }
    );
    console.log('✅ Rol coordinador creado');

    // Buscar cuenta existente o crear una
    console.log('🏢 Buscando cuenta...');
    let account = await Account.findOne({ nombre: 'Colegio Alemán' });
    
    if (!account) {
      account = await Account.create({
        nombre: 'Colegio Alemán',
        descripcion: 'Instituto educativo alemán',
        activo: true
      });
      console.log('✅ Cuenta creada:', account.nombre);
    } else {
      console.log('✅ Cuenta encontrada:', account.nombre);
    }

    // Buscar división existente o crear una
    console.log('📚 Buscando división...');
    let division = await Grupo.findOne({ nombre: 'Primer Año' });
    
    if (!division) {
      division = await Grupo.create({
        nombre: 'Primer Año',
        descripcion: 'Primer año de secundaria',
        account: account._id,
        activo: true
      });
      console.log('✅ División creada:', division.nombre);
    } else {
      console.log('✅ División encontrada:', division.nombre);
    }

    // Crear usuario coordinador
    console.log('👤 Creando usuario coordinador...');
    let coordinadorUser = await User.findOne({ email: 'coordinador@test.com' });
    
    if (!coordinadorUser) {
      coordinadorUser = new User({
        email: 'coordinador@test.com',
        password: 'password123',
        name: 'Coordinador Test',
        role: coordinadorRole._id,
        status: 'approved'
      });
      await coordinadorUser.save();
    } else {
      coordinadorUser.password = 'password123';
      coordinadorUser.name = 'Coordinador Test';
      coordinadorUser.role = coordinadorRole._id;
      coordinadorUser.status = 'approved';
      await coordinadorUser.save();
    }
    console.log('✅ Usuario coordinador creado:', coordinadorUser.email);

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

    console.log('\n🎉 Usuario coordinador creado exitosamente!');
    console.log('\n📋 Credenciales:');
    console.log(`   - Email: coordinador@test.com`);
    console.log(`   - Password: password123`);
    console.log(`   - Rol: coordinador`);
    console.log(`   - Cuenta: ${account.nombre}`);
    console.log(`   - División: ${division.nombre}`);

  } catch (error) {
    console.error('❌ Error creando usuario coordinador:', error);
  } finally {
    mongoose.connection.close();
  }
}

createCoordinadorUser();
