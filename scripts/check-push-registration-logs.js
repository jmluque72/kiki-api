require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config/database');
const Device = require('../shared/models/Device');
const User = require('../shared/models/User');

async function checkPushRegistrationLogs() {
  try {
    await mongoose.connect(config.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Conectado a MongoDB\n');

    // Buscar todos los dispositivos registrados
    const allDevices = await Device.find({}).populate('userId', 'name email');
    console.log(`📱 Total de dispositivos registrados: ${allDevices.length}\n`);

    if (allDevices.length > 0) {
      console.log('Dispositivos registrados:');
      allDevices.forEach((device, index) => {
        console.log(`\n${index + 1}. Usuario: ${device.userId?.name || 'N/A'} (${device.userId?.email || 'N/A'})`);
        console.log(`   - Plataforma: ${device.platform}`);
        console.log(`   - Token: ${device.pushToken?.substring(0, 30)}...`);
        console.log(`   - Activo: ${device.isActive}`);
        console.log(`   - Último uso: ${device.lastUsed || 'Nunca'}`);
        console.log(`   - Creado: ${device.createdAt}`);
      });
    } else {
      console.log('⚠️  No hay dispositivos registrados en la base de datos');
      console.log('\nPosibles causas:');
      console.log('1. La app no está llamando al endpoint /push/register-token');
      console.log('2. El token no se está obteniendo correctamente en la app');
      console.log('3. Hay un error al registrar el token que no se está mostrando');
      console.log('4. El usuario no está completamente autenticado cuando se intenta registrar');
    }

    // Buscar usuarios que deberían tener dispositivos
    const user = await User.findOne({ email: 'matilanzaco@gmail.com' });
    if (user) {
      console.log(`\n🔍 Usuario matilanzaco@gmail.com:`);
      console.log(`   - ID: ${user._id}`);
      console.log(`   - Nombre: ${user.name}`);
      console.log(`   - Estado: ${user.status}`);
      console.log(`   - Último login: ${user.lastLogin || 'Nunca'}`);
    }

    await mongoose.connection.close();
    console.log('\n✅ Verificación completada');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkPushRegistrationLogs();

