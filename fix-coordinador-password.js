const mongoose = require('mongoose');
const User = require('./shared/models/User');
const Role = require('./shared/models/Role');

// Conectar a MongoDB
mongoose.connect('mongodb://localhost:27017/kiki', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function fixCoordinadorPassword() {
  try {
    console.log('🔧 [FIX PASSWORD] Corrigiendo contraseña del usuario coordinador...');
    
    // Esperar a que se conecte
    await new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    
    console.log('✅ [FIX PASSWORD] Conectado a MongoDB');
    
    // Buscar usuario coordinador
    console.log('👤 [FIX PASSWORD] Buscando usuario coordinador@test.com...');
    let user = await User.findOne({ email: 'coordinador@test.com' });
    
    if (!user) {
      console.log('❌ [FIX PASSWORD] Usuario coordinador@test.com no encontrado');
      return;
    }
    
    console.log('✅ [FIX PASSWORD] Usuario encontrado');
    console.log('   - Email:', user.email);
    console.log('   - Hash actual:', user.password);
    
    // Verificar si la contraseña ya está hasheada
    if (user.password === 'password123') {
      console.log('🔧 [FIX PASSWORD] Contraseña no hasheada, aplicando hash...');
      
      // Marcar la contraseña como modificada para que se ejecute el middleware
      user.markModified('password');
      user.password = 'password123';
      await user.save(); // Esto activará el middleware de hash
      
      console.log('✅ [FIX PASSWORD] Contraseña hasheada correctamente');
      console.log('   - Nuevo hash:', user.password.substring(0, 20) + '...');
      
      // Verificar que funciona
      const isPasswordValid = await user.comparePassword('password123');
      console.log('✅ [FIX PASSWORD] Verificación de contraseña:', isPasswordValid);
      
    } else {
      console.log('✅ [FIX PASSWORD] Contraseña ya está hasheada correctamente');
    }
    
  } catch (error) {
    console.error('❌ [FIX PASSWORD] Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

fixCoordinadorPassword();
