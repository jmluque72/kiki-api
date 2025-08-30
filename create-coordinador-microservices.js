const mongoose = require('mongoose');
const User = require('./shared/models/User');
const Role = require('./shared/models/Role');
const Account = require('./shared/models/Account');
const Grupo = require('./shared/models/Grupo');
const Shared = require("./shared/models/Shared");

// Conectar a la base de datos del servidor
mongoose.connect('mongodb://localhost:27017/microservices_db', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function createCoordinadorMicroservices() {
  try {
    console.log('🚀 [CREATE MICROSERVICES] Creando usuario coordinador en microservices_db...');
    
    // Esperar a que se conecte
    await new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    
    console.log('✅ [CREATE MICROSERVICES] Conectado a MongoDB (microservices_db)');
    
    // 1. Crear rol coordinador si no existe
    console.log('📝 [CREATE MICROSERVICES] Creando rol coordinador...');
    let coordinadorRole = await Role.findOne({ nombre: 'coordinador' });
    
    if (!coordinadorRole) {
      coordinadorRole = new Role({
        nombre: 'coordinador',
        descripcion: 'Coordinador de institución',
        nivel: 3,
        permisos: [
          { modulo: 'usuarios', acciones: ['leer'] },
          { modulo: 'grupos', acciones: ['leer'] }
        ]
      });
      await coordinadorRole.save();
      console.log('✅ [CREATE MICROSERVICES] Rol coordinador creado');
    } else {
      console.log('✅ [CREATE MICROSERVICES] Rol coordinador ya existe');
    }
    
    // 2. Crear usuario coordinador primero (para poder usarlo como administrador)
    console.log('👤 [CREATE MICROSERVICES] Creando usuario coordinador...');
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
      console.log('✅ [CREATE MICROSERVICES] Usuario coordinador creado');
    } else {
      console.log('✅ [CREATE MICROSERVICES] Usuario coordinador ya existe');
    }
    
    // 3. Buscar o crear cuenta
    console.log('🏢 [CREATE MICROSERVICES] Buscando cuenta...');
    let account = await Account.findOne({ nombre: 'Colegio Alemán' });
    
    if (!account) {
      account = new Account({
        nombre: 'Colegio Alemán',
        razonSocial: 'Colegio Alemán S.A.',
        address: 'Av. Principal 123, Ciudad',
        usuarioAdministrador: coordinadorUser._id,
        activo: true
      });
      await account.save();
      console.log('✅ [CREATE MICROSERVICES] Cuenta creada');
    } else {
      console.log('✅ [CREATE MICROSERVICES] Cuenta encontrada');
    }
    
    // 4. Buscar o crear división
    console.log('📚 [CREATE MICROSERVICES] Buscando división...');
    let division = await Grupo.findOne({ nombre: 'Primer Año' });
    
    if (!division) {
      division = new Grupo({
        nombre: 'Primer Año',
        descripcion: 'Primer año de la institución',
        cuenta: account._id,
        creadoPor: coordinadorUser._id
      });
      await division.save();
      console.log('✅ [CREATE MICROSERVICES] División creada');
    } else {
      console.log('✅ [CREATE MICROSERVICES] División encontrada');
    }
    
    // 5. Crear asociación
    console.log('🔗 [CREATE MICROSERVICES] Creando asociación...');
    let association = await Shared.findOne({ 
      user: coordinadorUser._id,
      account: account._id
    });
    
    if (!association) {
      association = new Shared({
        user: coordinadorUser._id,
        account: account._id,
        division: division._id,
        role: coordinadorRole._id,
        createdBy: coordinadorUser._id,
        status: 'active'
      });
      await association.save();
      console.log('✅ [CREATE MICROSERVICES] Asociación creada');
    } else {
      console.log('✅ [CREATE MICROSERVICES] Asociación ya existe');
    }
    
    console.log('\n🎉 [CREATE MICROSERVICES] Usuario coordinador creado exitosamente!');
    console.log('\n📋 Credenciales:');
    console.log('   - Email: coordinador@test.com');
    console.log('   - Password: password123');
    console.log('   - Rol: coordinador');
    console.log('   - Cuenta: Colegio Alemán');
    console.log('   - División: Primer Año');
    
  } catch (error) {
    console.error('❌ [CREATE MICROSERVICES] Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

createCoordinadorMicroservices();
