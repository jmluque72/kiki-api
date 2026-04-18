const mongoose = require('mongoose');
const User = require('./shared/models/User');

// Conectar a MongoDB
mongoose.connect('mongodb://localhost:27017/kiki', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function listUsers() {
  try {
    console.log('🔍 [LIST USERS] ===== LISTANDO USUARIOS DISPONIBLES =====');
    
    const users = await User.find({}).populate('role').select('email name status role');
    
    console.log(`📊 [LIST USERS] Total de usuarios encontrados: ${users.length}`);
    
    users.forEach((user, index) => {
      console.log(`\n👤 [LIST USERS] Usuario ${index + 1}:`);
      console.log(`   - Email: ${user.email}`);
      console.log(`   - Name: ${user.name}`);
      console.log(`   - Status: ${user.status}`);
      console.log(`   - Role: ${user.role?.nombre || 'Sin rol'}`);
    });
    
    console.log('\n✅ [LIST USERS] Lista completada');
    
  } catch (error) {
    console.error('❌ [LIST USERS] Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

listUsers();
