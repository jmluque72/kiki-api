require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config/database');
const User = require('../shared/models/User');
const Shared = require('../shared/models/Shared');
const ActiveAssociation = require('../shared/models/ActiveAssociation');
const Account = require('../shared/models/Account');
const Role = require('../shared/models/Role');
const Grupo = require('../shared/models/Grupo');
const Student = require('../shared/models/Student');

async function checkPatriciaStudent() {
  try {
    await mongoose.connect(config.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Conectado a MongoDB\n');

    const email = 'patricia.torres@yopmail.com';
    console.log(`🔍 Verificando asociación activa para: ${email}\n`);

    // Buscar el usuario
    const user = await User.findOne({ email });
    if (!user) {
      console.log('❌ Usuario no encontrado');
      process.exit(1);
    }
    console.log(`✅ Usuario: ${user.name} (${user._id})\n`);

    // Buscar asociación activa
    const activeAssociation = await ActiveAssociation.findOne({ user: user._id })
      .populate('activeShared')
      .populate('account', 'nombre razonSocial')
      .populate('role', 'nombre descripcion')
      .populate('division', 'nombre descripcion')
      .populate('student', 'nombre apellido avatar');
    
    // Verificar qué Shared tiene la asociación activa
    if (activeAssociation && activeAssociation.activeShared) {
      const activeShared = await Shared.findById(activeAssociation.activeShared)
        .populate('student', 'nombre apellido');
      console.log('\n🔍 [DEBUG] activeShared de la asociación activa:');
      console.log('   - Shared ID:', activeShared?._id);
      console.log('   - Estudiante en Shared:', activeShared?.student ? `${activeShared.student.nombre} ${activeShared.student.apellido} (${activeShared.student._id})` : 'Sin estudiante');
      console.log('   - Estudiante en ActiveAssociation:', activeAssociation.student ? `${activeAssociation.student.nombre} ${activeAssociation.student.apellido} (${activeAssociation.student._id})` : 'Sin estudiante');
    }

    if (!activeAssociation) {
      console.log('⚠️ No hay asociación activa para este usuario\n');
    } else {
      console.log('✅ Asociación activa encontrada:');
      console.log(`   - ID: ${activeAssociation._id}`);
      console.log(`   - Cuenta: ${activeAssociation.account?.nombre || 'N/A'} (${activeAssociation.account?._id || 'N/A'})`);
      console.log(`   - Rol: ${activeAssociation.role?.nombre || 'N/A'}`);
      console.log(`   - División: ${activeAssociation.division?.nombre || 'N/A'}`);
      console.log(`   - Estudiante: ${activeAssociation.student ? `${activeAssociation.student.nombre} ${activeAssociation.student.apellido} (${activeAssociation.student._id})` : 'N/A'}`);
      console.log(`   - Activada: ${activeAssociation.activatedAt}`);
      console.log('');
    }

    // Buscar todas las asociaciones Shared del usuario
    const associations = await Shared.find({ user: user._id })
      .populate('account', 'nombre razonSocial')
      .populate('role', 'nombre descripcion')
      .populate('division', 'nombre descripcion')
      .populate('student', 'nombre apellido');

    console.log(`📋 Todas las asociaciones Shared: ${associations.length}`);
    associations.forEach((assoc, index) => {
      console.log(`\n${index + 1}. Asociación ${assoc._id}:`);
      console.log(`   - Estado: ${assoc.status}`);
      console.log(`   - Cuenta: ${assoc.account?.nombre || 'N/A'} (${assoc.account?._id || 'N/A'})`);
      console.log(`   - Rol: ${assoc.role?.nombre || 'N/A'}`);
      console.log(`   - División: ${assoc.division?.nombre || 'N/A'}`);
      console.log(`   - Estudiante: ${assoc.student ? `${assoc.student.nombre} ${assoc.student.apellido} (${assoc.student._id})` : 'N/A'}`);
      console.log(`   - Creada: ${assoc.createdAt}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Desconectado de MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkPatriciaStudent();

