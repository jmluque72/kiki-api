const mongoose = require('mongoose');
const User = require('./shared/models/User');
const Role = require('./shared/models/Role');

// Conectar a la base de datos del servidor
mongoose.connect('mongodb://localhost:27017/ki-api', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function checkProfeUser() {
  try {
    console.log('🔍 [CHECK PROFE] Verificando usuario profe@kiki.com...');
    
    // Esperar a que se conecte
    await new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    
    console.log('✅ [CHECK PROFE] Conectado a MongoDB (ki-api)');
    
    // Buscar usuario profe
    console.log('👤 [CHECK PROFE] Buscando usuario profe@kiki.com...');
    const user = await User.findOne({ email: 'profe@kiki.com' }).populate('role');
    
    if (!user) {
      console.log('❌ [CHECK PROFE] Usuario profe@kiki.com no encontrado');
      
      // Listar todos los usuarios
      const allUsers = await User.find({}).populate('role');
      console.log('📋 [CHECK PROFE] Todos los usuarios en la base de datos:');
      allUsers.forEach(u => {
        console.log(`   - ${u.email} (${u.role?.nombre || 'sin rol'}) - Status: ${u.status}`);
      });
      
      return;
    }
    
    console.log('✅ [CHECK PROFE] Usuario encontrado:');
    console.log('   - ID:', user._id);
    console.log('   - Email:', user.email);
    console.log('   - Nombre:', user.name);
    console.log('   - Rol:', user.role?.nombre);
    console.log('   - Status:', user.status);
    
    // Verificar si la contraseña está hasheada
    console.log('🔐 [CHECK PROFE] Hash de la contraseña:', user.password.substring(0, 20) + '...');
    
    // Probar contraseñas comunes y basadas en el nombre
    const commonPasswords = [
      'password123', '123456', 'password', 'admin', 'profe', 'kiki',
      'juan', 'carlos', 'gonzalez', 'juancarlos', 'juan123', 'carlos123',
      'profe123', 'profe2024', 'kiki123', 'kiki2024', 'admin123',
      '123456789', 'qwerty', 'asdfgh', 'zxcvbn', 'welcome', 'hello',
      'test', 'demo', 'user', 'guest', 'default', 'changeme'
    ];
    
    console.log('🔑 [CHECK PROFE] Probando contraseñas comunes...');
    for (const password of commonPasswords) {
      const isValid = await user.comparePassword(password);
      if (isValid) {
        console.log(`✅ [CHECK PROFE] Contraseña encontrada: ${password}`);
        return;
      }
    }
    
    console.log('❌ [CHECK PROFE] No se pudo determinar la contraseña');
    console.log('   - Contraseñas probadas:', commonPasswords.length);
    console.log('   - El usuario tiene contraseña hasheada, no se puede recuperar');
    console.log('   - Sugerencia: Resetear la contraseña del usuario');
    
  } catch (error) {
    console.error('❌ [CHECK PROFE] Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

checkProfeUser(); 