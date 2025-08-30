const mongoose = require('mongoose');
require('dotenv').config();

// Importar modelos
const User = require('./shared/models/User');
const Shared = require("./shared/models/Shared");
const Role = require('./shared/models/Role');
const Account = require('./shared/models/Account');

async function approveTestUser() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ki-api');
    console.log('✅ Conectado a MongoDB');

    // Buscar el usuario de prueba más reciente
    const testUser = await User.findOne({ 
      email: { $regex: /test-approval/ } 
    }).sort({ createdAt: -1 });

    if (!testUser) {
      console.log('❌ No se encontró usuario de prueba');
      return;
    }

    console.log('👤 Usuario de prueba encontrado:', testUser.email);

    // Buscar la asociación pendiente del usuario
    const userAssociation = await Shared.findOne({ 
      user: testUser._id,
      status: 'pending'
    }).populate('account');

    if (!userAssociation) {
      console.log('❌ No se encontró asociación pendiente para el usuario');
      return;
    }

    console.log('📋 Asociación encontrada:');
    console.log(`   Cuenta: ${userAssociation.account.nombre}`);
    console.log(`   Estado actual: ${userAssociation.status}`);

    // Aprobar la asociación
    userAssociation.status = 'active';
    await userAssociation.save();

    console.log('✅ Asociación aprobada exitosamente');

    // Verificar el cambio
    const updatedAssociation = await Shared.findById(userAssociation._id);
    console.log(`📋 Estado actualizado: ${updatedAssociation.status}`);

    // Probar login del usuario
    console.log('\n🔐 Probando login del usuario aprobado...');
    const axios = require('axios');
    
    try {
      const loginResponse = await axios.post('http://localhost:3000/api/users/login', {
        email: testUser.email,
        password: 'test123'
      });
      
      console.log('✅ Login exitoso');
      console.log(`👤 Usuario: ${loginResponse.data.data.user.nombre}`);
      console.log(`🔑 Rol: ${loginResponse.data.data.user.role.nombre}`);
      console.log(`📋 Asociaciones: ${loginResponse.data.data.associations.length}`);
    } catch (error) {
      console.log('❌ Error en login:', error.response?.data || error.message);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

approveTestUser(); 