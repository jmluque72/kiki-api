require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config/database');
const User = require('../shared/models/User');
const Shared = require('../shared/models/Shared');
const ActiveAssociation = require('../shared/models/ActiveAssociation');
const Student = require('../shared/models/Student');
const Account = require('../shared/models/Account');
const Role = require('../shared/models/Role');
const Grupo = require('../shared/models/Grupo');

async function fixPatriciaActiveAssociation() {
  try {
    await mongoose.connect(config.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Conectado a MongoDB\n');

    const email = 'patricia.torres@yopmail.com';
    const correctStudentName = 'Lucas Muñoz';
    
    console.log(`🔍 Corrigiendo asociación activa para: ${email}`);
    console.log(`🎯 Estudiante correcto: ${correctStudentName}\n`);

    // Buscar el usuario
    const user = await User.findOne({ email });
    if (!user) {
      console.log('❌ Usuario no encontrado');
      process.exit(1);
    }
    console.log(`✅ Usuario encontrado: ${user.name} (${user._id})\n`);

    // Buscar todas las Shared del usuario
    const allShared = await Shared.find({ 
      user: user._id,
      status: 'active'
    })
    .populate('student', 'nombre apellido');
    
    // Buscar la Shared de Lucas Muñoz
    const lucasStudent = allShared.find(s => 
      s.student && 
      `${s.student.nombre} ${s.student.apellido}` === correctStudentName
    );
    
    if (!lucasStudent) {
      console.log('❌ No se encontró la asociación Shared para Lucas Muñoz');
      console.log('📋 Asociaciones disponibles:');
      allShared.forEach((s, i) => {
        console.log(`   ${i + 1}. ${s.student ? `${s.student.nombre} ${s.student.apellido}` : 'Sin estudiante'} (${s._id})`);
      });
      process.exit(1);
    }
    
    console.log('✅ Asociación Shared correcta encontrada:');
    console.log(`   - Shared ID: ${lucasStudent._id}`);
    console.log(`   - Estudiante: ${lucasStudent.student.nombre} ${lucasStudent.student.apellido} (${lucasStudent.student._id})\n`);

    // Actualizar la asociación activa directamente
    console.log('🔄 Actualizando asociación activa...');
    
    // Obtener la Shared con todos los datos necesarios
    const sharedWithData = await Shared.findById(lucasStudent._id)
      .populate('account')
      .populate('role')
      .populate('division')
      .populate('student');
    
    if (!sharedWithData) {
      console.log('❌ No se pudo obtener la Shared con datos completos');
      process.exit(1);
    }
    
    // Actualizar o crear la ActiveAssociation
    const updated = await ActiveAssociation.findOneAndUpdate(
      { user: user._id },
      {
        user: user._id,
        activeShared: sharedWithData._id,
        account: sharedWithData.account._id,
        role: sharedWithData.role._id,
        division: sharedWithData.division?._id,
        student: sharedWithData.student?._id,
        activatedAt: new Date()
      },
      { upsert: true, new: true }
    );
    
    if (updated) {
      const updatedWithPopulate = await ActiveAssociation.findById(updated._id)
        .populate('student', 'nombre apellido');
      
      console.log('✅ Asociación activa actualizada correctamente:');
      console.log(`   - ID: ${updatedWithPopulate._id}`);
      console.log(`   - Estudiante: ${updatedWithPopulate.student.nombre} ${updatedWithPopulate.student.apellido} (${updatedWithPopulate.student._id})`);
      console.log(`   - Shared ID: ${updatedWithPopulate.activeShared}`);
    } else {
      console.log('❌ Error al actualizar la asociación activa');
    }

    await mongoose.disconnect();
    console.log('\n✅ Desconectado de MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixPatriciaActiveAssociation();

