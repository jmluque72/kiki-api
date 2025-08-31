const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = 'http://localhost:3000';

async function testActivityImagesS3Final() {
  try {
    console.log('🧪 [TEST ACTIVITY IMAGES S3 FINAL] Probando corrección de URL...\n');

    // 1. Login
    console.log('1️⃣ Login...');
    const loginResponse = await axios.post(`${API_BASE_URL}/api/users/login`, {
      email: 'carlos.perez@email.com',
      password: 'password123'
    });

    const token = loginResponse.data.data.token;
    console.log('✅ Login exitoso');

    // 2. Crear imagen de prueba
    console.log('\n2️⃣ Creando imagen de prueba...');
    const testImagePath = path.join(__dirname, 'test-activity-image-final.jpg');
    
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

    // 3. Simular la URL que usa la app móvil (API_BASE_URL ya incluye /api)
    console.log('\n3️⃣ Probando URL corregida (simulando app móvil)...');
    const mobileApiBaseUrl = 'http://192.168.68.103:3000/api'; // Como en la app móvil
    const uploadUrl = `${mobileApiBaseUrl}/upload/s3/image`;
    
    console.log('   API_BASE_URL (app móvil):', mobileApiBaseUrl);
    console.log('   URL final:', uploadUrl);
    console.log('   URL esperada: http://192.168.68.103:3000/api/upload/s3/image');

    const formData = new FormData();
    formData.append('image', fs.createReadStream(testImagePath), {
      filename: 'test-activity-image-final.jpg',
      contentType: 'image/jpeg'
    });

    const uploadResponse = await axios.post(
      uploadUrl,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!uploadResponse.data.success) {
      throw new Error('Error subiendo imagen: ' + uploadResponse.data.message);
    }

    const uploadResult = uploadResponse.data;
    console.log('✅ Imagen subida exitosamente a S3 con URL corregida');
    console.log('   Image Key:', uploadResult.imageKey);
    console.log('   Image URL:', uploadResult.data.imageUrl);

    // 4. Limpiar archivo de prueba
    console.log('\n4️⃣ Limpiando archivo de prueba...');
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
      console.log('✅ Archivo de prueba eliminado');
    }

    console.log('\n🎉 [TEST ACTIVITY IMAGES S3 FINAL] ¡Corrección exitosa!');
    console.log('\n📋 Resumen:');
    console.log('   ✅ Login exitoso');
    console.log('   ✅ URL corregida (sin duplicación de /api)');
    console.log('   ✅ Imagen subida a S3 exitosamente');
    console.log('   ✅ Archivo de prueba limpiado');
    console.log('\n🔧 Corrección aplicada:');
    console.log('   ❌ Antes: ${API_BASE_URL}/api/upload/s3/image');
    console.log('   ✅ Después: ${API_BASE_URL}/upload/s3/image');
    console.log('   📍 Resultado: http://192.168.68.103:3000/api/upload/s3/image');

  } catch (error) {
    console.error('\n❌ [TEST ACTIVITY IMAGES S3 FINAL] Error:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    
    console.log('\n🔧 Posibles soluciones:');
    console.log('   1. Verificar que el servidor esté corriendo en puerto 3000');
    console.log('   2. Verificar que la IP 192.168.68.103 sea accesible');
    console.log('   3. Verificar que el endpoint /api/upload/s3/image esté funcionando');
  }
}

testActivityImagesS3Final();
