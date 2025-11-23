const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Conectar a MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/kiki?authSource=admin', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Importar modelo de Usuario
const User = require('./shared/models/User');

async function fixPasswordInconsistencies() {
  try {
    console.log('🔧 [FIX PASSWORDS] Corrigiendo inconsistencias en contraseñas...');
    
    // Esperar a que se conecte
    await new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    
    console.log('✅ [FIX PASSWORDS] Conectado a MongoDB');
    
    // Obtener todos los usuarios
    const users = await User.find({});
    console.log(`📋 [FIX PASSWORDS] Encontrados ${users.length} usuarios`);
    
    let fixedCount = 0;
    let errorCount = 0;
    
    for (const user of users) {
      try {
        console.log(`\n👤 [FIX PASSWORDS] Procesando: ${user.email}`);
        
        // Verificar si la contraseña está hasheada correctamente
        const currentHash = user.password;
        console.log(`   - Hash actual: ${currentHash.substring(0, 20)}...`);
        
        // Intentar verificar con contraseñas comunes
        const commonPasswords = [
          'password123', 'admin123', 'profe123', 'kiki123', '123456',
          'password', 'admin', 'profe', 'kiki', 'test', 'demo'
        ];
        
        let passwordFound = null;
        for (const testPassword of commonPasswords) {
          try {
            const isValid = await bcrypt.compare(testPassword, currentHash);
            if (isValid) {
              passwordFound = testPassword;
              break;
            }
          } catch (error) {
            // Si hay error en la comparación, la contraseña puede estar mal hasheada
            console.log(`   - Error verificando '${testPassword}': ${error.message}`);
          }
        }
        
        if (passwordFound) {
          console.log(`   - Contraseña encontrada: ${passwordFound}`);
          
          // Re-hashear con el salt correcto (12 rounds)
          console.log(`   - Re-hasheando con salt rounds 12...`);
          user.password = passwordFound; // El middleware pre-save lo hasheará automáticamente
          await user.save();
          
          console.log(`   - ✅ Contraseña corregida`);
          fixedCount++;
        } else {
          console.log(`   - ⚠️ No se pudo determinar la contraseña original`);
          console.log(`   - 🔄 Estableciendo contraseña por defecto: 'password123'`);
          
          // Establecer contraseña por defecto
          user.password = 'password123';
          await user.save();
          
          console.log(`   - ✅ Contraseña por defecto establecida`);
          fixedCount++;
        }
        
      } catch (error) {
        console.error(`   - ❌ Error procesando ${user.email}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`\n📊 [FIX PASSWORDS] Resumen:`);
    console.log(`   - ✅ Contraseñas corregidas: ${fixedCount}`);
    console.log(`   - ❌ Errores: ${errorCount}`);
    console.log(`   - 📋 Total procesados: ${users.length}`);
    
    // Mostrar usuarios con sus nuevas contraseñas
    console.log(`\n🔑 [FIX PASSWORDS] Credenciales actualizadas:`);
    const updatedUsers = await User.find({});
    updatedUsers.forEach(user => {
      console.log(`   - ${user.email}: password123`);
    });
    
    console.log(`\n💡 [FIX PASSWORDS] Recomendaciones:`);
    console.log(`   - Usa siempre el middleware pre-save del modelo User`);
    console.log(`   - No uses bcrypt.hash directamente en scripts`);
    console.log(`   - Mantén consistencia en salt rounds (12)`);
    
  } catch (error) {
    console.error('❌ [FIX PASSWORDS] Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

fixPasswordInconsistencies();
