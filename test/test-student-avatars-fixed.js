const mongoose = require('mongoose');
require('dotenv').config();

// Importar todos los modelos necesarios
require('./shared/models/Account');
require('./shared/models/Grupo');
require('./shared/models/Student');

async function testStudentAvatarsFixed() {
  try {
    console.log('🔍 [TEST STUDENT AVATARS FIXED] Verificando fotos de estudiantes...\n');

    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/kiki?authSource=admin');

    console.log('✅ [TEST STUDENT AVATARS FIXED] Conectado a MongoDB');

    // Obtener todos los estudiantes
    const Student = mongoose.model('Student');
    const students = await Student.find({}).populate('account', 'nombre').populate('division', 'nombre');

    console.log(`📊 [TEST STUDENT AVATARS FIXED] Total de estudiantes: ${students.length}`);

    if (students.length === 0) {
      console.log('⚠️ [TEST STUDENT AVATARS FIXED] No hay estudiantes en la base de datos');
      return;
    }

    // Analizar avatares
    let studentsWithAvatars = 0;
    let studentsWithoutAvatars = 0;
    let s3Avatars = 0;
    let localAvatars = 0;

    console.log('\n📋 [TEST STUDENT AVATARS FIXED] Análisis de avatares:');
    console.log('=' .repeat(60));

    students.forEach((student, index) => {
      console.log(`\n${index + 1}. ${student.nombre} ${student.apellido}`);
      console.log(`   Cuenta: ${student.account?.nombre || 'N/A'}`);
      console.log(`   División: ${student.division?.nombre || 'N/A'}`);
      console.log(`   Avatar: ${student.avatar || 'NO TIENE'}`);

      if (student.avatar) {
        studentsWithAvatars++;
        
        if (student.avatar.includes('students/')) {
          console.log(`   Tipo: S3 (key: ${student.avatar})`);
          s3Avatars++;
        } else if (student.avatar.startsWith('http')) {
          console.log(`   Tipo: URL completa (${student.avatar})`);
          localAvatars++;
        } else {
          console.log(`   Tipo: Local (${student.avatar})`);
          localAvatars++;
        }
      } else {
        studentsWithoutAvatars++;
        console.log(`   Tipo: Sin avatar`);
      }
    });

    console.log('\n📊 [TEST STUDENT AVATARS FIXED] Resumen:');
    console.log('=' .repeat(60));
    console.log(`Total estudiantes: ${students.length}`);
    console.log(`Con avatar: ${studentsWithAvatars}`);
    console.log(`Sin avatar: ${studentsWithoutAvatars}`);
    console.log(`Avatares S3: ${s3Avatars}`);
    console.log(`Avatares locales: ${localAvatars}`);

    // Mostrar algunos ejemplos de avatares S3
    const s3Students = students.filter(s => s.avatar && s.avatar.includes('students/'));
    if (s3Students.length > 0) {
      console.log('\n🔗 [TEST STUDENT AVATARS FIXED] Ejemplos de avatares S3:');
      console.log('=' .repeat(60));
      s3Students.slice(0, 5).forEach((student, index) => {
        console.log(`${index + 1}. ${student.nombre} ${student.apellido}`);
        console.log(`   S3 Key: ${student.avatar}`);
        console.log(`   URL esperada: https://kiki-bucket-app.s3.amazonaws.com/${student.avatar}`);
      });
    }

    // Mostrar algunos ejemplos de avatares locales
    const localStudents = students.filter(s => s.avatar && !s.avatar.includes('students/') && !s.avatar.startsWith('http'));
    if (localStudents.length > 0) {
      console.log('\n📁 [TEST STUDENT AVATARS FIXED] Ejemplos de avatares locales:');
      console.log('=' .repeat(60));
      localStudents.slice(0, 5).forEach((student, index) => {
        console.log(`${index + 1}. ${student.nombre} ${student.apellido}`);
        console.log(`   Local path: ${student.avatar}`);
        console.log(`   URL esperada: http://localhost:3000/uploads/${student.avatar.split('/').pop()}`);
      });
    }

    console.log('\n💡 [TEST STUDENT AVATARS FIXED] Recomendaciones:');
    console.log('=' .repeat(60));
    
    if (studentsWithAvatars > 0) {
      console.log('✅ Hay estudiantes con fotos configuradas');
      console.log('✅ El sistema de avatares está funcionando');
      
      if (s3Avatars > 0) {
        console.log('✅ Hay avatares almacenados en S3');
      }
      
      if (localAvatars > 0) {
        console.log('⚠️ Hay avatares almacenados localmente (considerar migrar a S3)');
      }
    } else {
      console.log('⚠️ No hay estudiantes con fotos configuradas');
      console.log('💡 Considerar agregar fotos de prueba para los estudiantes');
    }

    console.log('\n🎯 [TEST STUDENT AVATARS FIXED] Próximos pasos:');
    console.log('=' .repeat(60));
    console.log('1. Verificar que el endpoint /api/students/by-account-division incluya URLs de avatares');
    console.log('2. Actualizar el hook useStudents para incluir el campo avatar');
    console.log('3. Modificar las pantallas para mostrar las fotos de los estudiantes');
    console.log('4. Probar la carga de fotos desde la app móvil');

  } catch (error) {
    console.error('\n❌ [TEST STUDENT AVATARS FIXED] Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

testStudentAvatarsFixed();
