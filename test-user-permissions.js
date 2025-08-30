const mongoose = require('mongoose');
const User = require('./shared/models/User');
const Shared = require("./shared/models/Shared");
const Account = require('./shared/models/Account');
const Grupo = require('./shared/models/Grupo');
const Role = require('./shared/models/Role');

// Conectar a MongoDB
mongoose.connect('mongodb://localhost:27017/kiki', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testUserPermissions() {
  try {
    console.log('🔍 Verificando permisos de usuarios...\n');

    // Buscar todos los usuarios
    const users = await User.find().populate('role');
    console.log(`📊 Total de usuarios: ${users.length}\n`);

    for (const user of users) {
      console.log(`👤 Usuario: ${user.email} (${user.nombre})`);
      console.log(`   Role: ${user.role?.nombre || 'Sin rol'}`);
      
      // Buscar asociaciones del usuario
      const associations = await Shared.find({ user: user._id })
        .populate('account')
        .populate('division');
      
      console.log(`   Asociaciones: ${associations.length}`);
      
      for (const assoc of associations) {
        console.log(`     - Account: ${assoc.account?.nombre || 'N/A'} (${assoc.account?._id})`);
        console.log(`     - Division: ${assoc.division?.nombre || 'N/A'} (${assoc.division?._id})`);
        console.log(`     - Status: ${assoc.status}`);
      }
      
      console.log('');
    }

    // Verificar cuentas y divisiones
    console.log('🏢 Verificando cuentas y divisiones...\n');
    
    const accounts = await Account.find();
    console.log(`📊 Total de cuentas: ${accounts.length}`);
    for (const account of accounts) {
      console.log(`   - ${account.nombre} (${account._id})`);
    }
    
    console.log('');
    
    const divisions = await Grupo.find();
    console.log(`📊 Total de divisiones: ${divisions.length}`);
    for (const division of divisions) {
      console.log(`   - ${division.nombre} (${division._id}) - Account: ${division.account}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

testUserPermissions(); 