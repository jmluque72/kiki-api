const mongoose = require('mongoose');
const User = require('./shared/models/User');
const Role = require('./shared/models/Role');
const Shared = require("./shared/models/Shared");
const Account = require('./shared/models/Account');
const Grupo = require('./shared/models/Grupo');

// Conectar a MongoDB
mongoose.connect('mongodb://localhost:27017/kiki', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testUserLogin() {
  try {
    console.log('🔍 Probando login del usuario coordinador...\n');

    // Buscar el usuario
    const user = await User.findOne({ email: 'coordinador@test.com' }).populate('role');

    if (!user) {
      console.log('❌ Usuario no encontrado');
      return;
    }

    console.log('✅ Usuario encontrado:');
    console.log('   - Email:', user.email);
    console.log('   - Name:', user.name);
    console.log('   - Status:', user.status);
    console.log('   - Role:', user.role?.nombre);
    console.log('   - Password (hasheada):', user.password.substring(0, 20) + '...');

    // Probar comparación de contraseña
    console.log('\n🔑 Probando contraseña...');
    const isPasswordValid = await user.comparePassword('password123');
    console.log('   - Contraseña válida:', isPasswordValid);

    // Probar con contraseña incorrecta
    const isPasswordInvalid = await user.comparePassword('wrongpassword');
    console.log('   - Contraseña incorrecta válida:', isPasswordInvalid);

    // Verificar que el usuario tiene asociaciones
    const associations = await Shared.find({ user: user._id }).populate('account division');
    console.log('\n🔗 Asociaciones del usuario:');
    console.log('   - Total asociaciones:', associations.length);
    associations.forEach((assoc, index) => {
      console.log(`   ${index + 1}. Cuenta: ${assoc.account?.nombre}`);
      console.log(`      División: ${assoc.division?.nombre || 'Sin división'}`);
      console.log(`      Status: ${assoc.status}`);
    });

    console.log('\n✅ Test completado exitosamente');

  } catch (error) {
    console.error('❌ Error en test:', error);
  } finally {
    mongoose.connection.close();
  }
}

testUserLogin();
