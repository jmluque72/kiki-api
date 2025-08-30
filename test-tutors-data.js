const mongoose = require('mongoose');
const config = require('./config/env.config');
const User = require('./shared/models/User');
const Shared = require('./shared/models/Shared');
const Role = require('./shared/models/Role');
const Student = require('./shared/models/Student');

async function testTutorsData() {
  try {
    console.log('🔍 Conectando a MongoDB...');
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Buscar el rol de familyadmin (tutor)
    const familyadminRole = await Role.findOne({ nombre: 'familyadmin' });
    if (!familyadminRole) {
      console.log('❌ No se encontró el rol de familyadmin');
      return;
    }
    console.log('✅ Rol de familyadmin encontrado:', familyadminRole.nombre);

    // Buscar usuarios con rol de familyadmin
    const tutores = await User.find({ role: familyadminRole._id }).select('name email status createdAt');
    console.log(`📊 Encontrados ${tutores.length} usuarios con rol familyadmin:`);
    
    tutores.forEach((tutor, index) => {
      console.log(`  ${index + 1}. Nombre: ${tutor.name}, Email: ${tutor.email}, Status: ${tutor.status}, Activo: ${tutor.status === 'approved'}`);
    });

    // Buscar asociaciones de tutores
    const tutorAssociations = await Shared.find({
      role: familyadminRole._id,
      status: 'active'
    }).populate([
      {
        path: 'user',
        select: 'name email status createdAt'
      },
      {
        path: 'role',
        select: 'nombre descripcion'
      },
      {
        path: 'student',
        select: 'nombre apellido'
      }
    ]);

    console.log(`\n📋 Encontradas ${tutorAssociations.length} asociaciones de tutores:`);
    
    tutorAssociations.forEach((assoc, index) => {
      console.log(`  ${index + 1}. Usuario: ${assoc.user?.name || 'N/A'}, Email: ${assoc.user?.email || 'N/A'}, Status: ${assoc.user?.status || 'N/A'}, Activo: ${assoc.user?.status === 'approved'}`);
      if (assoc.student) {
        console.log(`     Alumno asignado: ${assoc.student.nombre} ${assoc.student.apellido}`);
      } else {
        console.log(`     Alumno asignado: Ninguno`);
      }
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
  }
}

testTutorsData();
