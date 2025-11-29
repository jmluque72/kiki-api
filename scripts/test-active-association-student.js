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

async function testActiveAssociationStudent() {
  try {
    await mongoose.connect(config.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Conectado a MongoDB\n');

    const email = 'patricia.torres@yopmail.com';
    console.log(`🔍 Probando obtención de estudiante desde activeShared para: ${email}\n`);

    // Buscar el usuario
    const user = await User.findOne({ email });
    if (!user) {
      console.log('❌ Usuario no encontrado');
      process.exit(1);
    }
    console.log(`✅ Usuario: ${user.name} (${user._id})\n`);

    // Obtener asociación activa usando el método estático (como lo hace el backend)
    console.log('🔄 Obteniendo asociación activa usando getActiveAssociation...');
    const activeAssociation = await ActiveAssociation.getActiveAssociation(user._id);

    if (!activeAssociation) {
      console.log('⚠️ No hay asociación activa');
      process.exit(1);
    }

    console.log('✅ Asociación activa obtenida:');
    console.log(`   - ID: ${activeAssociation._id}`);
    console.log(`   - activeShared ID: ${activeAssociation.activeShared?._id || activeAssociation.activeShared}`);
    console.log(`   - Estudiante (campo desnormalizado): ${activeAssociation.student ? `${activeAssociation.student.nombre} ${activeAssociation.student.apellido} (${activeAssociation.student._id})` : 'null'}\n`);

    // Obtener el Shared (activeShared) y su estudiante
    const activeShared = await Shared.findById(activeAssociation.activeShared)
      .populate('student', 'nombre apellido');
    
    console.log('🔍 Verificando activeShared (fuente de verdad):');
    console.log(`   - Shared ID: ${activeShared._id}`);
    console.log(`   - Estudiante en Shared: ${activeShared.student ? `${activeShared.student.nombre} ${activeShared.student.apellido} (${activeShared.student._id})` : 'null'}\n`);

    // Comparar
    const studentFromField = activeAssociation.student?._id?.toString();
    const studentFromShared = activeShared.student?._id?.toString();
    
    console.log('📊 Comparación:');
    console.log(`   - Estudiante desde campo 'student': ${studentFromField || 'null'}`);
    console.log(`   - Estudiante desde 'activeShared': ${studentFromShared || 'null'}`);
    
    if (studentFromField === studentFromShared) {
      console.log('   ✅ Los estudiantes coinciden');
    } else {
      console.log('   ⚠️ INCONSISTENCIA: Los estudiantes NO coinciden');
      console.log('   💡 Debe usarse el estudiante de activeShared como fuente de verdad');
    }

    await mongoose.disconnect();
    console.log('\n✅ Desconectado de MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testActiveAssociationStudent();

