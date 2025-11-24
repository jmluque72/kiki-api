require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config/database');
const User = require('../shared/models/User');
const Shared = require('../shared/models/Shared');
const Device = require('../shared/models/Device');
const Account = require('../shared/models/Account');
const Role = require('../shared/models/Role');
const Grupo = require('../shared/models/Grupo');
const Student = require('../shared/models/Student');

async function checkUserAssociations() {
  try {
    await mongoose.connect(config.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Conectado a MongoDB\n');

    const email = 'matilanzaco@gmail.com';
    console.log(`🔍 Verificando asociaciones para: ${email}\n`);

    // Buscar el usuario
    const user = await User.findOne({ email });
    if (!user) {
      console.log('❌ Usuario no encontrado');
      process.exit(1);
    }
    console.log(`✅ Usuario: ${user.name} (${user._id})\n`);

    // Buscar asociaciones Shared
    const associations = await Shared.find({ user: user._id })
      .populate('account', 'nombre razonSocial')
      .populate('role', 'nombre descripcion')
      .populate('division', 'nombre descripcion')
      .populate('student', 'nombre apellido');

    console.log(`📋 Asociaciones Shared: ${associations.length}`);
    associations.forEach((assoc, index) => {
      console.log(`\n${index + 1}. Asociación ${assoc._id}:`);
      console.log(`   - Estado: ${assoc.status}`);
      console.log(`   - Cuenta: ${assoc.account?.nombre || 'N/A'} (${assoc.account?._id || 'N/A'})`);
      console.log(`   - Rol: ${assoc.role?.nombre || 'N/A'}`);
      console.log(`   - División: ${assoc.division?.nombre || 'N/A'}`);
      console.log(`   - Estudiante: ${assoc.student ? `${assoc.student.nombre} ${assoc.student.apellido}` : 'N/A'}`);
      console.log(`   - Creada: ${assoc.createdAt}`);
    });
    console.log('');

    // Buscar dispositivos
    const devices = await Device.find({ userId: user._id });
    console.log(`📱 Dispositivos: ${devices.length}`);
    devices.forEach((device, index) => {
      console.log(`   ${index + 1}. ${device.platform} - Activo: ${device.isActive}`);
      console.log(`      Token: ${device.pushToken?.substring(0, 30)}...`);
    });
    console.log('');

    // Buscar todas las cuentas para ver cuál debería usar
    const accounts = await Account.find({ activo: true }).limit(5);
    console.log(`🏢 Cuentas activas (primeras 5): ${accounts.length}`);
    accounts.forEach((acc, index) => {
      console.log(`   ${index + 1}. ${acc.nombre} (${acc._id})`);
    });

    await mongoose.connection.close();
    console.log('\n✅ Verificación completada');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkUserAssociations();

