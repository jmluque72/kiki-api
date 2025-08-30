const mongoose = require('mongoose');
const User = require('./shared/models/User');

// Conectar a MongoDB
mongoose.connect('mongodb://localhost:27017/kiki', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function updateCoordinadorStatus() {
  try {
    console.log('🚀 Actualizando status del usuario coordinador...\n');

    // Buscar y actualizar el usuario coordinador
    const user = await User.findOneAndUpdate(
      { email: 'coordinador@test.com' },
      { status: 'approved' },
      { new: true }
    );

    if (user) {
      console.log('✅ Usuario coordinador actualizado exitosamente');
      console.log('   - Email:', user.email);
      console.log('   - Status:', user.status);
      console.log('   - Name:', user.name);
    } else {
      console.log('❌ Usuario coordinador no encontrado');
    }

  } catch (error) {
    console.error('❌ Error actualizando usuario coordinador:', error);
  } finally {
    mongoose.connection.close();
  }
}

updateCoordinadorStatus();
