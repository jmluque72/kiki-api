const mongoose = require('mongoose');
const User = require('./shared/models/User');
const Role = require('./shared/models/Role');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Conectar a MongoDB
mongoose.connect('mongodb://localhost:27017/kiki', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testLoginServer() {
  try {
    console.log('🔍 [TEST LOGIN SERVER] Probando login directamente en el servidor...');
    
    // Esperar a que se conecte
    await new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    
    console.log('✅ [TEST LOGIN SERVER] Conectado a MongoDB');
    
    // Buscar usuario coordinador
    console.log('👤 [TEST LOGIN SERVER] Buscando usuario coordinador@test.com...');
    const user = await User.findOne({ email: 'coordinador@test.com' }).populate('role');
    
    if (!user) {
      console.log('❌ [TEST LOGIN SERVER] Usuario coordinador@test.com no encontrado');
      return;
    }
    
    console.log('✅ [TEST LOGIN SERVER] Usuario encontrado:');
    console.log('   - ID:', user._id);
    console.log('   - Email:', user.email);
    console.log('   - Nombre:', user.name);
    console.log('   - Rol:', user.role?.nombre);
    console.log('   - Status:', user.status);
    
    // Verificar contraseña
    console.log('🔑 [TEST LOGIN SERVER] Verificando contraseña...');
    const isPasswordValid = await user.comparePassword('password123');
    console.log('✅ [TEST LOGIN SERVER] Contraseña válida:', isPasswordValid);
    
    if (!isPasswordValid) {
      console.log('❌ [TEST LOGIN SERVER] Contraseña inválida');
      return;
    }
    
    // Verificar status
    if (user.status !== 'approved') {
      console.log('❌ [TEST LOGIN SERVER] Usuario no aprobado, status:', user.status);
      return;
    }
    
    // Generar token
    console.log('🔐 [TEST LOGIN SERVER] Generando token...');
    const token = user.generateToken();
    console.log('✅ [TEST LOGIN SERVER] Token generado:', token.substring(0, 50) + '...');
    
    // Verificar token
    const config = require('./config/env.config');
    const decoded = jwt.verify(token, config.JWT_SECRET);
    console.log('✅ [TEST LOGIN SERVER] Token válido');
    console.log('   - User ID:', decoded.userId);
    console.log('   - Email:', decoded.email);
    
  } catch (error) {
    console.error('❌ [TEST LOGIN SERVER] Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

testLoginServer();
