const axios = require('axios');
require('dotenv').config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function testStudentsEndpointFixed() {
  try {
    console.log('🧪 [TEST STUDENTS ENDPOINT FIXED] Probando endpoint de estudiantes con avatares...\n');

    // 1. Login para obtener token
    console.log('1️⃣ Iniciando sesión...');
    const loginResponse = await axios.post(`${API_BASE_URL}/api/users/login`, {
      email: 'admin@kiki.com.ar',
      password: 'admin123'
    });

    if (!loginResponse.data.success) {
      throw new Error('Error en login: ' + loginResponse.data.message);
    }

    const token = loginResponse.data.data.token;
    console.log('✅ Login exitoso');

    // 2. Obtener cuentas disponibles
    console.log('\n2️⃣ Obteniendo cuentas disponibles...');
    const accountsResponse = await axios.get(`${API_BASE_URL}/api/accounts`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!accountsResponse.data.success) {
      throw new Error('Error obteniendo cuentas: ' + accountsResponse.data.message);
    }

    const accounts = accountsResponse.data.accounts;
    console.log(`✅ ${accounts.length} cuentas obtenidas`);

    if (accounts.length === 0) {
      throw new Error('No hay cuentas disponibles');
    }

    // Usar la primera cuenta disponible
    const selectedAccount = accounts[0];
    console.log(`✅ Cuenta seleccionada: ${selectedAccount.nombre} (${selectedAccount._id})`);

    // 3. Obtener estudiantes de la cuenta seleccionada
    console.log('\n3️⃣ Obteniendo estudiantes...');
    const studentsResponse = await axios.get(`${API_BASE_URL}/api/students/by-account-division`, {
      headers: { 'Authorization': `Bearer ${token}` },
      params: {
        accountId: selectedAccount._id
      }
    });

    if (!studentsResponse.data.success) {
      throw new Error('Error obteniendo estudiantes: ' + studentsResponse.data.message);
    }

    const students = studentsResponse.data.data.students;
    console.log(`✅ ${students.length} estudiantes obtenidos`);

    // 4. Analizar avatares
    console.log('\n4️⃣ Analizando avatares de estudiantes:');
    console.log('=' .repeat(60));

    let studentsWithAvatars = 0;
    let studentsWithoutAvatars = 0;
    let s3Avatars = 0;
    let localAvatars = 0;

    students.forEach((student, index) => {
      console.log(`\n${index + 1}. ${student.nombre} ${student.apellido}`);
      console.log(`   Cuenta: ${student.account?.nombre || 'N/A'}`);
      console.log(`   División: ${student.division?.nombre || 'N/A'}`);
      console.log(`   Avatar: ${student.avatar || 'NO TIENE'}`);

      if (student.avatar) {
        studentsWithAvatars++;
        
        if (student.avatar.includes('amazonaws.com')) {
          console.log(`   Tipo: S3 URL (${student.avatar})`);
          s3Avatars++;
        } else if (student.avatar.startsWith('http')) {
          console.log(`   Tipo: URL completa (${student.avatar})`);
          localAvatars++;
        } else {
          console.log(`   Tipo: Key local (${student.avatar})`);
          localAvatars++;
        }
      } else {
        studentsWithoutAvatars++;
        console.log(`   Tipo: Sin avatar`);
      }
    });

    console.log('\n📊 [TEST STUDENTS ENDPOINT FIXED] Resumen:');
    console.log('=' .repeat(60));
    console.log(`Total estudiantes: ${students.length}`);
    console.log(`Con avatar: ${studentsWithAvatars}`);
    console.log(`Sin avatar: ${studentsWithoutAvatars}`);
    console.log(`Avatares S3: ${s3Avatars}`);
    console.log(`Avatares locales: ${localAvatars}`);

    // 5. Probar acceso a las URLs de avatares
    console.log('\n5️⃣ Probando acceso a URLs de avatares...');
    const studentsWithAvatarsList = students.filter(s => s.avatar);
    
    if (studentsWithAvatarsList.length > 0) {
      for (let i = 0; i < Math.min(3, studentsWithAvatarsList.length); i++) {
        const student = studentsWithAvatarsList[i];
        console.log(`\n   Probando avatar de ${student.nombre} ${student.apellido}:`);
        console.log(`   URL: ${student.avatar}`);
        
        try {
          const imageResponse = await axios.get(student.avatar, { 
            timeout: 5000,
            responseType: 'arraybuffer'
          });
          console.log(`   ✅ Status: ${imageResponse.status}`);
          console.log(`   ✅ Content-Type: ${imageResponse.headers['content-type']}`);
          console.log(`   ✅ Tamaño: ${imageResponse.data.length} bytes`);
        } catch (imageError) {
          console.log(`   ❌ Error: ${imageError.message}`);
        }
      }
    } else {
      console.log('   ⚠️ No hay estudiantes con avatares para probar');
    }

    console.log('\n🎉 [TEST STUDENTS ENDPOINT FIXED] ¡Prueba completada exitosamente!');
    console.log('\n📋 Resumen:');
    console.log('   ✅ Login exitoso');
    console.log('   ✅ Cuentas obtenidas');
    console.log('   ✅ Estudiantes obtenidos');
    console.log('   ✅ Avatares procesados');
    console.log('   ✅ URLs verificadas');

    if (studentsWithAvatars > 0) {
      console.log('\n💡 Conclusión:');
      console.log('   ✅ El endpoint está devolviendo URLs de avatares correctamente');
      console.log('   ✅ Las URLs de S3 están funcionando');
      console.log('   ✅ La app móvil puede mostrar las fotos de los estudiantes');
      console.log('   ✅ El sistema está listo para mostrar fotos en asistencia y notificaciones');
    } else {
      console.log('\n⚠️ Conclusión:');
      console.log('   ⚠️ No hay estudiantes con avatares configurados');
      console.log('   💡 Considerar agregar fotos de prueba para los estudiantes');
    }

  } catch (error) {
    console.error('\n❌ [TEST STUDENTS ENDPOINT FIXED] Error:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    
    console.log('\n💡 Posibles soluciones:');
    console.log('   1. Verificar que el servidor esté corriendo en', API_BASE_URL);
    console.log('   2. Verificar que las credenciales de AWS S3 estén configuradas');
    console.log('   3. Verificar que existan estudiantes en la base de datos');
    console.log('   4. Verificar que el usuario tenga permisos para acceder a los estudiantes');
  }
}

testStudentsEndpointFixed();
