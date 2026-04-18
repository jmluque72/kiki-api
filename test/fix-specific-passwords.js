const mongoose = require('mongoose');
require('dotenv').config();

// Conectar a MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/kiki?authSource=admin', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Importar modelo de Usuario
const User = require('./shared/models/User');

async function fixSpecificPasswords() {
  try {
    console.log('🔧 [FIX SPECIFIC] Corrigiendo contraseñas específicas...');
    
    // Esperar a que se conecte
    await new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    
    console.log('✅ [FIX SPECIFIC] Conectado a MongoDB');
    
    // Usuarios que necesitan corrección
    const usersToFix = [
      'admin@kiki.com.ar',
      'sanmartinadmin@kiki.com.ar', 
      'sender@kiki.com.ar'
    ];
    
    for (const email of usersToFix) {
      try {
        console.log(`\n👤 [FIX SPECIFIC] Corrigiendo: ${email}`);
        
        const user = await User.findOne({ email });
        if (!user) {
          console.log(`   - ❌ Usuario no encontrado`);
          continue;
        }
        
        console.log(`   - Hash actual: ${user.password.substring(0, 20)}...`);
        
        // Forzar la actualización de la contraseña
        user.password = 'password123';
        await user.save();
        
        console.log(`   - ✅ Contraseña actualizada`);
        
        // Verificar que funciona
        const isPasswordValid = await user.comparePassword('password123');
        console.log(`   - 🔍 Verificación: ${isPasswordValid ? '✅ Válida' : '❌ Inválida'}`);
        
      } catch (error) {
        console.error(`   - ❌ Error: ${error.message}`);
      }
    }
    
    console.log(`\n🎉 [FIX SPECIFIC] Proceso completado`);
    
  } catch (error) {
    console.error('❌ [FIX SPECIFIC] Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

fixSpecificPasswords();
