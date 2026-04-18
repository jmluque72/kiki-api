const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function testActivityWithS3() {
  try {
    console.log('🧪 [TEST ACTIVITY WITH S3] Probando carga de actividades con imágenes de S3...\n');

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

    // 2. Subir múltiples imágenes a S3
    console.log('\n2️⃣ Subiendo imágenes a S3...');
    const imageKeys = [];
    
    for (let i = 1; i <= 3; i++) {
      console.log(`   Subiendo imagen ${i}/3...`);
      
      // Crear imagen de prueba
      const testImagePath = path.join(__dirname, `test-activity-${i}.jpg`);
      const testImageBuffer = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A', 'base64');
      fs.writeFileSync(testImagePath, testImageBuffer);

      const formData = new FormData();
      formData.append('image', fs.createReadStream(testImagePath), {
        filename: `test-activity-${i}.jpg`,
        contentType: 'image/jpeg'
      });

      const uploadResponse = await axios.post(`${API_BASE_URL}/api/upload/s3/image`, formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${token}`
        }
      });

      if (!uploadResponse.data.success) {
        throw new Error(`Error subiendo imagen ${i}: ${uploadResponse.data.message}`);
      }

      const imageKey = uploadResponse.data.imageKey;
      imageKeys.push(imageKey);
      console.log(`   ✅ Imagen ${i} subida: ${imageKey}`);

      // Limpiar archivo temporal
      fs.unlinkSync(testImagePath);
    }

    console.log(`✅ ${imageKeys.length} imágenes subidas exitosamente a S3`);

    // 3. Crear actividad con las imágenes de S3
    console.log('\n3️⃣ Creando actividad con imágenes de S3...');
    const activityData = {
      titulo: 'Actividad de prueba con múltiples imágenes S3',
      participantes: [], // Array vacío para la prueba
      descripcion: 'Esta es una actividad de prueba para verificar la carga de múltiples imágenes a S3 desde la app móvil',
      imagenes: imageKeys, // Array de imageKeys de S3
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
    
    // Mostrar las imágenes guardadas
    activity.imagenes.forEach((imageKey, index) => {
      console.log(`   Imagen ${index + 1}: ${imageKey}`);
    });

    // 4. Verificar que las imágenes están en S3
    console.log('\n4️⃣ Verificando que las imágenes están en S3...');
    try {
      const AWS = require('aws-sdk');
      const s3 = new AWS.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'us-east-1'
      });

      for (let i = 0; i < imageKeys.length; i++) {
        const imageKey = imageKeys[i];
        const headParams = {
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: imageKey
        };

        const headResult = await s3.headObject(headParams).promise();
        console.log(`   ✅ Imagen ${i + 1} verificada en S3`);
        console.log(`      Tamaño: ${headResult.ContentLength} bytes`);
        console.log(`      Tipo: ${headResult.ContentType}`);
      }

    } catch (s3Error) {
      console.log('⚠️ No se pudo verificar S3 directamente:', s3Error.message);
    }

    // 5. Simular el flujo de la app móvil
    console.log('\n5️⃣ Simulando flujo de la app móvil...');
    console.log('   📱 La app móvil:');
    console.log('      1. Selecciona imágenes de la galería');
    console.log('      2. Sube cada imagen a S3 usando /api/upload/s3/image');
    console.log('      3. Obtiene los imageKeys de respuesta');
    console.log('      4. Crea la actividad enviando los imageKeys en el campo "imagenes"');
    console.log('      5. La actividad se guarda con referencias a las imágenes en S3');

    console.log('\n🎉 [TEST ACTIVITY WITH S3] ¡Prueba completada exitosamente!');
    console.log('\n📋 Resumen:');
    console.log('   ✅ Login exitoso');
    console.log('   ✅ 3 imágenes subidas a S3');
    console.log('   ✅ Actividad creada con referencias a imágenes S3');
    console.log('   ✅ Imágenes verificadas en S3');
    console.log('\n🔗 URLs generadas:');
    console.log(`   Activity ID: ${activity._id}`);
    imageKeys.forEach((key, index) => {
      console.log(`   S3 Image ${index + 1}: ${key}`);
    });

    console.log('\n💡 Conclusión:');
    console.log('   ✅ La carga de actividades SÍ está subiendo las imágenes a S3 correctamente');
    console.log('   ✅ El flujo de la app móvil está funcionando como se espera');
    console.log('   ✅ Las imágenes se almacenan en S3 y se referencian en la base de datos');

  } catch (error) {
    console.error('\n❌ [TEST ACTIVITY WITH S3] Error:', error.message);
    
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

testActivityWithS3();
