const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function testSimpleActivityS3() {
  try {
    console.log('🧪 [TEST SIMPLE ACTIVITY S3] Probando carga de actividades con imágenes a S3...\n');

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
    const user = loginResponse.data.data.user;
    console.log('✅ Login exitoso:', user.email);

    // 2. Obtener perfil del usuario
    console.log('\n2️⃣ Obteniendo perfil del usuario...');
    const profileResponse = await axios.get(`${API_BASE_URL}/api/users/profile`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!profileResponse.data.success) {
      throw new Error('Error obteniendo perfil');
    }

    console.log('✅ Perfil obtenido');
    console.log(`   Usuario: ${profileResponse.data.user.email}`);
    console.log(`   Rol: ${profileResponse.data.user.role?.nombre || 'N/A'}`);

    // 3. Crear imagen de prueba
    console.log('\n3️⃣ Creando imagen de prueba...');
    const testImagePath = path.join(__dirname, 'test-simple-activity.jpg');
    
    // Crear una imagen de prueba simple (1x1 pixel JPEG)
    const testImageBuffer = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A', 'base64');
    fs.writeFileSync(testImagePath, testImageBuffer);
    console.log('✅ Imagen de prueba creada');

    // 4. Subir imagen a S3
    console.log('\n4️⃣ Subiendo imagen a S3...');
    const formData = new FormData();
    formData.append('image', fs.createReadStream(testImagePath), {
      filename: 'test-simple-activity.jpg',
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

    // 5. Crear actividad con la imagen de S3
    console.log('\n5️⃣ Creando actividad con imagen de S3...');
    const activityData = {
      titulo: 'Actividad de prueba simple con S3',
      participantes: [], // Array vacío para la prueba
      descripcion: 'Esta es una actividad de prueba simple para verificar la carga de imágenes a S3',
      imagenes: [imageKey], // Usar el imageKey de S3
      accountId: '507f1f77bcf86cd799439011', // ID de prueba
      userId: user._id
    };

    const activityResponse = await axios.post(`${API_BASE_URL}/api/activities`, activityData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!activityResponse.data.success) {
      throw new Error('Error creando actividad: ' + activityResponse.data.message);
    }

    const activity = activityResponse.data.activity;
    console.log('✅ Actividad creada exitosamente');
    console.log(`   ID: ${activity._id}`);
    console.log(`   Título: ${activity.titulo}`);
    console.log(`   Imágenes: ${activity.imagenes.length} imagen(es)`);
    if (activity.imagenes.length > 0) {
      console.log(`   Imagen 1: ${activity.imagenes[0]}`);
    }

    // 6. Verificar que la imagen está en S3
    console.log('\n6️⃣ Verificando que la imagen está en S3...');
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

    // 7. Limpiar archivo de prueba
    console.log('\n7️⃣ Limpiando archivo de prueba...');
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
      console.log('✅ Archivo de prueba eliminado');
    }

    console.log('\n🎉 [TEST SIMPLE ACTIVITY S3] ¡Prueba completada exitosamente!');
    console.log('\n📋 Resumen:');
    console.log('   ✅ Login exitoso');
    console.log('   ✅ Perfil obtenido');
    console.log('   ✅ Imagen subida a S3');
    console.log('   ✅ Actividad creada con imagen de S3');
    console.log('   ✅ Imagen verificada en S3');
    console.log('\n🔗 URLs generadas:');
    console.log(`   S3 Image Key: ${imageKey}`);
    console.log(`   S3 Image URL: ${imageUrl}`);
    console.log(`   Activity ID: ${activity._id}`);

  } catch (error) {
    console.error('\n❌ [TEST SIMPLE ACTIVITY S3] Error:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    
    console.log('\n💡 Posibles soluciones:');
    console.log('   1. Verificar que el servidor esté corriendo en', API_BASE_URL);
    console.log('   2. Verificar que las credenciales de AWS S3 estén configuradas');
    console.log('   3. Verificar que el bucket S3 exista y sea accesible');
    console.log('   4. Verificar que el usuario tenga permisos para crear actividades');
  }
}

testSimpleActivityS3();
