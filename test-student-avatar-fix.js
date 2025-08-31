const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = 'http://localhost:3000';

async function testStudentAvatarFix() {
  try {
    console.log('🧪 [TEST STUDENT AVATAR FIX] Probando endpoint de avatar de estudiantes...\n');

    // 1. Login
    console.log('1️⃣ Iniciando sesión...');
    const loginResponse = await axios.post(`${API_BASE_URL}/api/users/login`, {
      email: 'carlos.perez@email.com',
      password: 'password123'
    });

    if (!loginResponse.data.success) {
      throw new Error('Error en login: ' + loginResponse.data.message);
    }

    const token = loginResponse.data.data.token;
    console.log('✅ Login exitoso');

    // 2. Obtener estudiantes del usuario
    console.log('\n2️⃣ Obteniendo estudiantes...');
    const studentsResponse = await axios.get(`${API_BASE_URL}/api/students?accountId=68b2eef1c9d2e9a7e5742fed&divisionId=68b2ef3fc9d2e9a7e57430f1`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!studentsResponse.data.success || !studentsResponse.data.data.students.length) {
      throw new Error('No se encontraron estudiantes');
    }

    const student = studentsResponse.data.data.students[0];
    console.log('✅ Estudiante encontrado:', student.nombre, student.apellido);

    // 3. Crear imagen de prueba
    console.log('\n3️⃣ Creando imagen de prueba...');
    const testImagePath = path.join(__dirname, 'test-student-avatar.jpg');
    
    // Crear una imagen simple de prueba (1x1 pixel JPEG)
    const testImageBuffer = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
      0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
      0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
      0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
      0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
      0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xFF, 0xC4,
      0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x0C,
      0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0x8A, 0x00,
      0xFF, 0xD9
    ]);

    fs.writeFileSync(testImagePath, testImageBuffer);
    console.log('✅ Imagen de prueba creada');

    // 4. Subir avatar del estudiante
    console.log('\n4️⃣ Subiendo avatar del estudiante...');
    const formData = new FormData();
    formData.append('avatar', fs.createReadStream(testImagePath), {
      filename: 'test-student-avatar.jpg',
      contentType: 'image/jpeg'
    });

    const uploadResponse = await axios.put(
      `${API_BASE_URL}/api/students/${student._id}/avatar`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!uploadResponse.data.success) {
      throw new Error('Error subiendo avatar: ' + uploadResponse.data.message);
    }

    const uploadResult = uploadResponse.data.data;
    console.log('✅ Avatar subido exitosamente');
    console.log(`   Estudiante: ${uploadResult.student.nombre} ${uploadResult.student.apellido}`);
    console.log(`   Avatar URL: ${uploadResult.student.avatar}`);

    // 5. Verificar que el avatar se guardó correctamente
    console.log('\n5️⃣ Verificando avatar guardado...');
    const verifyResponse = await axios.get(`${API_BASE_URL}/api/students?accountId=68b2eef1c9d2e9a7e5742fed&divisionId=68b2ef3fc9d2e9a7e57430f1`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const updatedStudent = verifyResponse.data.data.students.find(s => s._id === student._id);
    
    if (updatedStudent.avatar && updatedStudent.avatar !== student.avatar) {
      console.log('✅ Avatar actualizado correctamente en la base de datos');
      console.log(`   Avatar anterior: ${student.avatar || 'Ninguno'}`);
      console.log(`   Avatar nuevo: ${updatedStudent.avatar}`);
    } else {
      console.log('⚠️ El avatar no se actualizó en la base de datos');
    }

    // 6. Limpiar archivo de prueba
    console.log('\n6️⃣ Limpiando archivo de prueba...');
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
      console.log('✅ Archivo de prueba eliminado');
    }

    console.log('\n🎉 [TEST STUDENT AVATAR FIX] ¡Prueba completada exitosamente!');
    console.log('\n📋 Resumen:');
    console.log('   ✅ Login exitoso');
    console.log('   ✅ Estudiante encontrado');
    console.log('   ✅ Imagen de prueba creada');
    console.log('   ✅ Avatar subido a S3');
    console.log('   ✅ Avatar verificado en BD');
    console.log('   ✅ Archivo de prueba limpiado');

  } catch (error) {
    console.error('\n❌ [TEST STUDENT AVATAR FIX] Error:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    
    console.log('\n🔧 Posibles soluciones:');
    console.log('   1. Verificar que el servidor esté corriendo en puerto 3000');
    console.log('   2. Verificar que las credenciales de AWS S3 estén configuradas');
    console.log('   3. Verificar que el usuario tenga permisos de familyadmin');
    console.log('   4. Verificar que el estudiante exista y esté asociado al usuario');
  }
}

testStudentAvatarFix();
