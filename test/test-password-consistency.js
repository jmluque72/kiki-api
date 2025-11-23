const mongoose = require('mongoose');
require('dotenv').config();

// Conectar a MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/kiki?authSource=admin', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Importar modelo de Usuario
const User = require('./shared/models/User');

async function testPasswordConsistency() {
  try {
    console.log('🧪 [TEST PASSWORDS] Probando consistencia de contraseñas...');
    
    // Esperar a que se conecte
    await new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    
    console.log('✅ [TEST PASSWORDS] Conectado a MongoDB');
    
    // Obtener todos los usuarios
    const users = await User.find({});
    console.log(`📋 [TEST PASSWORDS] Encontrados ${users.length} usuarios`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const user of users) {
      try {
        console.log(`\n👤 [TEST PASSWORDS] Probando: ${user.email}`);
        
        // Verificar hash
        const hash = user.password;
        console.log(`   - Hash: ${hash.substring(0, 20)}...`);
        
        // Probar contraseña por defecto
        const isPasswordValid = await user.comparePassword('password123');
        
        if (isPasswordValid) {
          console.log(`   - ✅ Contraseña válida`);
          successCount++;
        } else {
          console.log(`   - ❌ Contraseña inválida`);
          errorCount++;
        }
        
      } catch (error) {
        console.error(`   - ❌ Error probando ${user.email}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`\n📊 [TEST PASSWORDS] Resumen:`);
    console.log(`   - ✅ Contraseñas válidas: ${successCount}`);
    console.log(`   - ❌ Contraseñas inválidas: ${errorCount}`);
    console.log(`   - 📋 Total probados: ${users.length}`);
    
    if (errorCount === 0) {
      console.log(`\n🎉 [TEST PASSWORDS] ¡Todas las contraseñas funcionan correctamente!`);
    } else {
      console.log(`\n⚠️ [TEST PASSWORDS] Hay ${errorCount} contraseñas con problemas`);
    }
    
    // Mostrar credenciales de prueba
    console.log(`\n🔑 [TEST PASSWORDS] Credenciales para probar:`);
    users.forEach(user => {
      console.log(`   - Email: ${user.email}`);
      console.log(`   - Contraseña: password123`);
      console.log(`   - Status: ${user.status}`);
      console.log(`   - ---`);
    });
    
  } catch (error) {
    console.error('❌ [TEST PASSWORDS] Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

testPasswordConsistency();
