const mongoose = require('mongoose');
const Account = require('./shared/models/Account');
const config = require('./config/env.config');

async function createSampleAccount() {
  try {
    console.log('📦 Conectando a MongoDB...');
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Verificar si ya existe la cuenta
    const existingAccount = await Account.findOne({ nombre: 'Universidad Nacional de Argentina' });
    
    if (existingAccount) {
      console.log('⚠️  La cuenta ya existe');
      console.log('📧 Nombre:', existingAccount.nombre);
      console.log('🏢 Razón Social:', existingAccount.razonSocial);
      console.log('📍 Dirección:', existingAccount.address);
      console.log('📧 Email Admin:', existingAccount.emailAdmin);
      return;
    }

    // Obtener el usuario administrador existente
    const User = require('./shared/models/User');
    const adminUser = await User.findOne({ email: 'admin@kiki.ar' });
    
    if (!adminUser) {
      console.error('❌ No se encontró el usuario administrador');
      return;
    }

    // Crear cuenta de ejemplo
    console.log('🏢 Creando cuenta de ejemplo...');
    const account = new Account({
      nombre: 'Universidad Nacional de Argentina',
      razonSocial: 'UNA S.A.',
      address: 'Av. Libertador 1234, Buenos Aires',
      emailAdmin: 'admin@una.edu.ar',
      nombreAdmin: 'Administrador UNA',
      logo: 'https://via.placeholder.com/150',
      usuarioAdministrador: adminUser._id,
      activo: true
    });

    await account.save();
    console.log('✅ Cuenta creada exitosamente');
    console.log('📧 Nombre:', account.nombre);
    console.log('🏢 Razón Social:', account.razonSocial);
    console.log('📍 Dirección:', account.address);
    console.log('📧 Email Admin:', account.emailAdmin);
    console.log('✅ Estado: Activa');

  } catch (error) {
    console.error('❌ Error creando cuenta:', error);
  } finally {
    console.log('🔌 Desconectado de MongoDB');
    await mongoose.disconnect();
  }
}

createSampleAccount(); 