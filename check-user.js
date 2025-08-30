require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./shared/models/User');
const Role = require('./shared/models/Role');

async function checkUser() {
  try {
    // Conectar a la base de datos
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Conectado a MongoDB');

    // Buscar el usuario
    const user = await User.findOne({ email: 'coordinador@test.com' });
    
    if (user) {
      console.log('✅ Usuario encontrado:');
      console.log('   - Email:', user.email);
      console.log('   - Nombre:', user.name);
      console.log('   - Rol:', user.role?.nombre);
      console.log('   - ID:', user._id);
    } else {
      console.log('❌ Usuario no encontrado');
    }

    // Listar todos los usuarios
    const allUsers = await User.find().populate('role');
    console.log('\n📋 Todos los usuarios:');
    allUsers.forEach(u => {
      console.log(`   - ${u.email} (${u.role?.nombre || 'sin rol'})`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkUser();
