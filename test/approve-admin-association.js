const mongoose = require('mongoose');
require('dotenv').config();

// Importar modelos
const User = require('./shared/models/User');
const Shared = require("./shared/models/Shared");
const Account = require('./shared/models/Account');
const Role = require('./shared/models/Role');

async function approveAdminAssociation() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ki-api');
    console.log('✅ Conectado a MongoDB');

    // Buscar el admin
    const admin = await User.findOne({ email: 'test@kiki.ar' }).populate('role');
    if (!admin) {
      console.log('❌ Admin no encontrado');
      return;
    }

    console.log('👤 Admin encontrado:', admin.email);

    // Buscar la asociación pendiente del admin
    const adminAssociation = await Shared.findOne({ 
      user: admin._id,
      status: 'pending'
    }).populate('account');

    if (!adminAssociation) {
      console.log('❌ No se encontró asociación pendiente para el admin');
      return;
    }

    console.log('📋 Asociación encontrada:');
    console.log(`   Cuenta: ${adminAssociation.account.nombre}`);
    console.log(`   Estado actual: ${adminAssociation.status}`);

    // Aprobar la asociación
    adminAssociation.status = 'active';
    await adminAssociation.save();

    console.log('✅ Asociación aprobada exitosamente');

    // Verificar el cambio
    const updatedAssociation = await Shared.findById(adminAssociation._id);
    console.log(`📋 Estado actualizado: ${updatedAssociation.status}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

approveAdminAssociation(); 