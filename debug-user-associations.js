const mongoose = require('mongoose');
require('dotenv').config();

// Importar modelos
const User = require('./shared/models/User');
const Shared = require("./shared/models/Shared");
const Account = require('./shared/models/Account');
const Grupo = require('./shared/models/Grupo');
const Role = require('./shared/models/Role');

async function debugUserAssociations() {
  try {
    // Conectar a MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ki-api';
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB\n');

    // 1. Buscar el usuario test@kiki.ar
    console.log('1️⃣ Buscando usuario test@kiki.ar...');
    const user = await User.findOne({ email: 'test@kiki.ar' }).populate('role');
    
    if (!user) {
      console.log('❌ Usuario test@kiki.ar no encontrado');
      return;
    }
    
    console.log('✅ Usuario encontrado:');
    console.log(`   ID: ${user._id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Nombre: ${user.name}`);
    console.log(`   Rol: ${user.role?.nombre}`);
    console.log('');

    // 2. Buscar asociaciones del usuario
    console.log('2️⃣ Buscando asociaciones del usuario...');
    const associations = await Shared.find({ user: user._id })
      .populate('account', 'nombre razonSocial')
      .populate('role', 'nombre');
    
    console.log(`📊 Total asociaciones encontradas: ${associations.length}`);
    
    associations.forEach((assoc, index) => {
      console.log(`   ${index + 1}. Status: ${assoc.status}`);
      console.log(`      Cuenta: ${assoc.account?.nombre} (${assoc.account?._id})`);
      console.log(`      Rol: ${assoc.role?.nombre}`);
      console.log('');
    });

    // 3. Buscar grupos de las cuentas asociadas
    console.log('3️⃣ Buscando grupos de las cuentas asociadas...');
    const accountIds = associations.map(assoc => assoc.account._id);
    console.log(`🏢 IDs de cuentas: ${accountIds}`);
    
    const grupos = await Grupo.find({ cuenta: { $in: accountIds } })
      .populate('cuenta', 'nombre razonSocial');
    
    console.log(`📊 Total grupos encontrados: ${grupos.length}`);
    
    grupos.forEach((grupo, index) => {
      console.log(`   ${index + 1}. ${grupo.nombre}`);
      console.log(`      Cuenta: ${grupo.cuenta?.nombre}`);
      console.log(`      Activo: ${grupo.activo}`);
      console.log('');
    });

    // 4. Verificar si hay grupos en la base de datos
    console.log('4️⃣ Verificando todos los grupos en la base de datos...');
    const allGrupos = await Grupo.find({}).populate('cuenta', 'nombre razonSocial');
    console.log(`📊 Total grupos en BD: ${allGrupos.length}`);
    
    allGrupos.forEach((grupo, index) => {
      console.log(`   ${index + 1}. ${grupo.nombre} (${grupo.cuenta?.nombre || 'Sin cuenta'})`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Conexión cerrada');
  }
}

debugUserAssociations(); 