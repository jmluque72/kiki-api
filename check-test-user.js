const mongoose = require('mongoose');
require('dotenv').config();

// Importar modelos
const User = require('./shared/models/User');
const Shared = require("./shared/models/Shared");
const Role = require('./shared/models/Role');
const Account = require('./shared/models/Account');

async function checkTestUser() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ki-api');
    console.log('✅ Conectado a MongoDB');

    // Buscar usuarios de prueba
    const testUsers = await User.find({ 
      email: { $regex: /test-approval/ } 
    }).populate('role');

    console.log(`📋 Usuarios de prueba encontrados: ${testUsers.length}`);
    
    for (let i = 0; i < testUsers.length; i++) {
      const user = testUsers[i];
      console.log(`\n👤 Usuario ${i + 1}:`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Nombre: ${user.name}`);
      console.log(`   Rol: ${user.role?.nombre}`);
      console.log(`   Status: ${user.status}`);
      
      // Buscar asociaciones del usuario
      const associations = await Shared.find({ user: user._id }).populate('account');
      console.log(`   📋 Asociaciones: ${associations.length}`);
      associations.forEach((assoc, assocIndex) => {
        console.log(`      ${assocIndex + 1}. Cuenta: ${assoc.account.nombre} - Estado: ${assoc.status}`);
      });
    }

    // Buscar todas las asociaciones pendientes
    const pendingAssociations = await Shared.find({ status: 'pending' }).populate('user account');
    console.log(`\n📋 Total asociaciones pendientes: ${pendingAssociations.length}`);
    
    pendingAssociations.forEach((assoc, index) => {
      console.log(`   ${index + 1}. Usuario: ${assoc.user.email} - Cuenta: ${assoc.account.nombre} - Estado: ${assoc.status}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkTestUser(); 