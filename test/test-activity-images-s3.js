const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = 'http://localhost:3000';

async function testActivityImagesS3() {
  try {
    console.log('🧪 [TEST ACTIVITY IMAGES S3] Probando upload de imágenes de actividades...\n');

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
    const testImagePath = path.join(__dirname, 'test-activity-image.jpg');
    
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

    // 3. Subir imagen a S3
    console.log('\n3️⃣ Subiendo imagen a S3...');
    const formData = new FormData();
    formData.append('image', fs.createReadStream(testImagePath), {
      filename: 'test-activity-image.jpg',
      contentType: 'image/jpeg'
    });

    const uploadResponse = await axios.post(
      `${API_BASE_URL}/api/upload/s3/image`,
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
    console.log('✅ Imagen subida exitosamente a S3');
    console.log('   Image Key:', uploadResult.imageKey);
    console.log('   Image URL:', uploadResult.data.imageUrl);

    // 4. Verificar que la imagen está en S3
    console.log('\n4️⃣ Verificando imagen en S3...');
    const verifyResponse = await axios.get(
      `${API_BASE_URL}/api/upload/s3/image/${uploadResult.imageKey}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (verifyResponse.data.success) {
      console.log('✅ Imagen verificada en S3');
      console.log('   URL de acceso:', verifyResponse.data.data.imageUrl);
    } else {
      console.log('⚠️ No se pudo verificar la imagen en S3');
    }

    // 5. Limpiar archivo de prueba
    console.log('\n5️⃣ Limpiando archivo de prueba...');
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
      console.log('✅ Archivo de prueba eliminado');
    }

    console.log('\n🎉 [TEST ACTIVITY IMAGES S3] ¡Prueba completada exitosamente!');
    console.log('\n📋 Resumen:');
    console.log('   ✅ Login exitoso');
    console.log('   ✅ Imagen de prueba creada');
    console.log('   ✅ Imagen subida a S3');
    console.log('   ✅ Imagen verificada en S3');
    console.log('   ✅ Archivo de prueba limpiado');

  } catch (error) {
    console.error('\n❌ [TEST ACTIVITY IMAGES S3] Error:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    
    console.log('\n🔧 Posibles soluciones:');
    console.log('   1. Verificar que el servidor esté corriendo en puerto 3000');
    console.log('   2. Verificar que las credenciales de AWS S3 estén configuradas');
    console.log('   3. Verificar que el endpoint /api/upload/s3/image esté funcionando');
    console.log('   4. Verificar que el bucket S3 tenga permisos de escritura');
  }
}

testActivityImagesS3();
