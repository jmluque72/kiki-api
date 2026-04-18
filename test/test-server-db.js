const mongoose = require('mongoose');
const User = require('./shared/models/User');
const Role = require('./shared/models/Role');

// Conectar a la base de datos que usa el servidor
mongoose.connect('mongodb://localhost:27017/microservices_db', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testServerDatabase() {
  try {
    console.log('🔍 [TEST SERVER DB] Verificando base de datos del servidor...');
    
    // Esperar a que se conecte
    await new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    
    console.log('✅ [TEST SERVER DB] Conectado a MongoDB (microservices_db)');
    
    // Buscar usuario coordinador
    console.log('👤 [TEST SERVER DB] Buscando usuario coordinador@test.com...');
    const user = await User.findOne({ email: 'coordinador@test.com' }).populate('role');
    
    if (!user) {
      console.log('❌ [TEST SERVER DB] Usuario coordinador@test.com no encontrado en microservices_db');
      
      // Listar todos los usuarios
      const allUsers = await User.find({}).populate('role');
      console.log('📋 [TEST SERVER DB] Todos los usuarios en microservices_db:');
      allUsers.forEach(u => {
        console.log(`   - ${u.email} (${u.role?.nombre || 'sin rol'}) - Status: ${u.status}`);
      });
      
      return;
    }
    
    console.log('✅ [TEST SERVER DB] Usuario encontrado:');
    console.log('   - ID:', user._id);
    console.log('   - Email:', user.email);
    console.log('   - Nombre:', user.name);
    console.log('   - Rol:', user.role?.nombre);
    console.log('   - Status:', user.status);
    
    // Verificar contraseña
    console.log('🔑 [TEST SERVER DB] Verificando contraseña...');
    const isPasswordValid = await user.comparePassword('password123');
    console.log('✅ [TEST SERVER DB] Contraseña válida:', isPasswordValid);
    
    // Verificar hash de la contraseña
    console.log('🔐 [TEST SERVER DB] Hash de la contraseña:', user.password.substring(0, 20) + '...');
    
  } catch (error) {
    console.error('❌ [TEST SERVER DB] Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

testServerDatabase();
