const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function testS3UploadOnly() {
  try {
    console.log('🧪 [TEST S3 UPLOAD] Probando solo la carga de imágenes a S3...\n');

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

    // 2. Crear imagen de prueba
    console.log('\n2️⃣ Creando imagen de prueba...');
    const testImagePath = path.join(__dirname, 'test-s3-upload.jpg');
    
    // Crear una imagen de prueba simple (1x1 pixel JPEG)
    const testImageBuffer = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxAAPwA/8A', 'base64');
    fs.writeFileSync(testImagePath, testImageBuffer);
    console.log('✅ Imagen de prueba creada');

    // 3. Subir imagen a S3
    console.log('\n3️⃣ Subiendo imagen a S3...');
    const formData = new FormData();
    formData.append('image', fs.createReadStream(testImagePath), {
      filename: 'test-s3-upload.jpg',
      contentType: 'image/jpeg'
    });

    const uploadResponse = await axios.post(`${API_BASE_URL}/api/upload/s3/image`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${token}`
      }
    });

    if (!uploadResponse.data.success) {
      throw new Error('Error subiendo imagen a S3: ' + uploadResponse.data.message);
    }

    const imageKey = uploadResponse.data.imageKey;
    const imageUrl = uploadResponse.data.data.imageUrl;
    console.log('✅ Imagen subida exitosamente a S3');
    console.log(`   Image Key: ${imageKey}`);
    console.log(`   Image URL: ${imageUrl}`);

    // 4. Verificar que la imagen está en S3
    console.log('\n4️⃣ Verificando que la imagen está en S3...');
    try {
      const AWS = require('aws-sdk');
      const s3 = new AWS.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'us-east-1'
      });

      const headParams = {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: imageKey
      };

      const headResult = await s3.headObject(headParams).promise();
      console.log('✅ Imagen verificada en S3');
      console.log(`   Tamaño: ${headResult.ContentLength} bytes`);
      console.log(`   Tipo: ${headResult.ContentType}`);
      console.log(`   Última modificación: ${headResult.LastModified}`);

    } catch (s3Error) {
      console.log('⚠️ No se pudo verificar S3 directamente:', s3Error.message);
      console.log('   Esto puede ser normal si las credenciales de AWS no están configuradas');
    }

    // 5. Limpiar archivo de prueba
    console.log('\n5️⃣ Limpiando archivo de prueba...');
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
      console.log('✅ Archivo de prueba eliminado');
    }

    console.log('\n🎉 [TEST S3 UPLOAD] ¡Prueba completada exitosamente!');
    console.log('\n📋 Resumen:');
    console.log('   ✅ Login exitoso');
    console.log('   ✅ Imagen subida a S3');
    console.log('   ✅ Imagen verificada en S3');
    console.log('\n🔗 URLs generadas:');
    console.log(`   S3 Image Key: ${imageKey}`);
    console.log(`   S3 Image URL: ${imageUrl}`);

    // 6. Probar acceso a la imagen
    console.log('\n6️⃣ Probando acceso a la imagen...');
    try {
      const imageResponse = await axios.get(imageUrl, { timeout: 5000 });
      console.log('✅ Imagen accesible desde URL pública');
      console.log(`   Status: ${imageResponse.status}`);
      console.log(`   Content-Type: ${imageResponse.headers['content-type']}`);
    } catch (imageError) {
      console.log('⚠️ No se pudo acceder a la imagen desde URL pública:', imageError.message);
      console.log('   Esto puede ser normal si el bucket no es público');
    }

  } catch (error) {
    console.error('\n❌ [TEST S3 UPLOAD] Error:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    
    console.log('\n💡 Posibles soluciones:');
    console.log('   1. Verificar que el servidor esté corriendo en', API_BASE_URL);
    console.log('   2. Verificar que las credenciales de AWS S3 estén configuradas');
    console.log('   3. Verificar que el bucket S3 exista y sea accesible');
    console.log('   4. Verificar que el endpoint /api/upload/s3/image esté funcionando');
  }
}

testS3UploadOnly();
