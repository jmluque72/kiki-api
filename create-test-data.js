const mongoose = require('mongoose');
const User = require('./shared/models/User');
const Account = require('./shared/models/Account');
const Grupo = require('./shared/models/Grupo');
const Role = require('./shared/models/Role');
const Shared = require("./shared/models/Shared");
const Student = require('./shared/models/Student');

// Conectar a MongoDB
mongoose.connect('mongodb://localhost:27017/kiki', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function createTestData() {
  try {
    console.log('🚀 Creando datos de prueba...\n');

    // Crear roles
    console.log('📝 Creando roles...');
    const adminRole = await Role.findOneAndUpdate(
      { nombre: 'admin' },
      { nombre: 'admin', descripcion: 'Administrador' },
      { upsert: true, new: true }
    );
    
    const tutorRole = await Role.findOneAndUpdate(
      { nombre: 'tutor' },
      { nombre: 'tutor', descripcion: 'Tutor' },
      { upsert: true, new: true }
    );

    console.log('✅ Roles creados');

    // Crear cuenta
    console.log('🏢 Creando cuenta...');
    const account = await Account.findOneAndUpdate(
      { nombre: 'Colegio Alemán' },
      { 
        nombre: 'Colegio Alemán',
        descripcion: 'Instituto educativo alemán',
        activo: true
      },
      { upsert: true, new: true }
    );
    console.log('✅ Cuenta creada:', account.nombre);

    // Crear divisiones
    console.log('📚 Creando divisiones...');
    const division1 = await Grupo.findOneAndUpdate(
      { nombre: 'Primer Año' },
      {
        nombre: 'Primer Año',
        descripcion: 'Primer año de secundaria',
        account: account._id,
        activo: true
      },
      { upsert: true, new: true }
    );

    const division2 = await Grupo.findOneAndUpdate(
      { nombre: 'Segundo Año' },
      {
        nombre: 'Segundo Año',
        descripcion: 'Segundo año de secundaria',
        account: account._id,
        activo: true
      },
      { upsert: true, new: true }
    );
    console.log('✅ Divisiones creadas');

    // Crear usuarios
    console.log('👤 Creando usuarios...');
    const user1 = await User.findOneAndUpdate(
      { email: 'tutor1@aleman.com' },
      {
        email: 'tutor1@aleman.com',
        password: 'tutor123',
        nombre: 'Tutor 1',
        role: tutorRole._id,
        activo: true
      },
      { upsert: true, new: true }
    );

    const user2 = await User.findOneAndUpdate(
      { email: 'admin@aleman.com' },
      {
        email: 'admin@aleman.com',
        password: 'admin123',
        nombre: 'Admin',
        role: adminRole._id,
        activo: true
      },
      { upsert: true, new: true }
    );
    console.log('✅ Usuarios creados');

    // Crear asociaciones
    console.log('🔗 Creando asociaciones...');
    await Shared.findOneAndUpdate(
      { user: user1._id, account: account._id },
      {
        user: user1._id,
        account: account._id,
        division: division1._id,
        status: 'active'
      },
      { upsert: true }
    );

    await Shared.findOneAndUpdate(
      { user: user2._id, account: account._id },
      {
        user: user2._id,
        account: account._id,
        status: 'active'
      },
      { upsert: true }
    );
    console.log('✅ Asociaciones creadas');

    // Crear estudiantes
    console.log('🎓 Creando estudiantes...');
    const students = [
      {
        nombre: 'Juan Pérez',
        email: 'juan.perez@aleman.com',
        account: account._id,
        division: division1._id,
        activo: true
      },
      {
        nombre: 'María García',
        email: 'maria.garcia@aleman.com',
        account: account._id,
        division: division1._id,
        activo: true
      },
      {
        nombre: 'Carlos López',
        email: 'carlos.lopez@aleman.com',
        account: account._id,
        division: division1._id,
        activo: true
      }
    ];

    for (const studentData of students) {
      await Student.findOneAndUpdate(
        { email: studentData.email },
        studentData,
        { upsert: true }
      );
    }
    console.log('✅ Estudiantes creados');

    console.log('\n🎉 Datos de prueba creados exitosamente!');
    console.log('\n📋 Resumen:');
    console.log(`   - Usuarios: 2 (tutor1@aleman.com, admin@aleman.com)`);
    console.log(`   - Cuenta: 1 (Colegio Alemán)`);
    console.log(`   - Divisiones: 2 (Primer Año, Segundo Año)`);
    console.log(`   - Estudiantes: 3 (en Primer Año)`);
    console.log(`   - Asociaciones: 2`);

  } catch (error) {
    console.error('❌ Error creando datos de prueba:', error);
  } finally {
    mongoose.connection.close();
  }
}

createTestData(); 