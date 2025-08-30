const mongoose = require('mongoose');
require('dotenv').config();

// Importar modelos
const User = require('./shared/models/User');
const Shared = require("./shared/models/Shared");
const Account = require('./shared/models/Account');
const Role = require('./shared/models/Role');

async function checkAdminStatus() {
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

    console.log('👤 Admin encontrado:');
    console.log(`   Email: ${admin.email}`);
    console.log(`   Nombre: ${admin.name}`);
    console.log(`   Rol: ${admin.role?.nombre}`);
    console.log(`   Status: ${admin.status}`);
    console.log('');

    // Buscar asociaciones del admin
    const adminAssociations = await Shared.find({ user: admin._id }).populate('account');
    console.log(`📋 Asociaciones del admin: ${adminAssociations.length}`);
    
    adminAssociations.forEach((assoc, index) => {
      console.log(`   ${index + 1}. Cuenta: ${assoc.account.nombre} - Estado: ${assoc.status}`);
    });

    // Verificar si tiene asociación activa
    const hasActiveAssociation = adminAssociations.some(assoc => assoc.status === 'active');
    console.log(`✅ Tiene asociación activa: ${hasActiveAssociation}`);

    // Probar login del admin
    console.log('\n🔐 Probando login del admin...');
    const axios = require('axios');
    
    try {
      const loginResponse = await axios.post('http://localhost:3000/api/users/login', {
        email: 'test@kiki.ar',
        password: 'admin123'
      });
      
      console.log('✅ Login exitoso');
      console.log(`👤 Usuario: ${loginResponse.data.data.user.nombre}`);
      console.log(`🔑 Rol: ${loginResponse.data.data.user.role.nombre}`);
    } catch (error) {
      console.log('❌ Error en login:', error.response?.data || error.message);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkAdminStatus(); 