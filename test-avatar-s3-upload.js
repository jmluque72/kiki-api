const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function testAvatarS3Upload() {
  try {
    console.log('🧪 [TEST AVATAR S3 UPLOAD] Probando subida de avatares a S3...\n');

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

    // 2. Obtener perfil actual
    console.log('\n2️⃣ Obteniendo perfil actual...');
    const profileResponse = await axios.get(`${API_BASE_URL}/api/users/profile`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!profileResponse.data.success) {
      throw new Error('Error obteniendo perfil: ' + profileResponse.data.message);
    }

    const currentProfile = profileResponse.data.data;
    console.log('✅ Perfil obtenido');
    console.log(`   Avatar actual: ${currentProfile.avatar || 'No tiene avatar'}`);

    // 3. Crear un archivo de prueba (imagen pequeña)
    console.log('\n3️⃣ Creando archivo de prueba...');
    const testImagePath = path.join(__dirname, 'test-avatar.png');
    
    // Crear una imagen PNG simple de 1x1 pixel (base64)
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const imageBuffer = Buffer.from(pngBase64, 'base64');
    
    fs.writeFileSync(testImagePath, imageBuffer);
    console.log('✅ Archivo de prueba creado:', testImagePath);

    // 4. Subir avatar a S3
    console.log('\n4️⃣ Subiendo avatar a S3...');
    const formData = new FormData();
    formData.append('avatar', fs.createReadStream(testImagePath), {
      filename: 'test-avatar.png',
      contentType: 'image/png'
    });

    const uploadResponse = await axios.put(`${API_BASE_URL}/api/users/avatar`, formData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        ...formData.getHeaders()
      }
    });

    if (!uploadResponse.data.success) {
      throw new Error('Error subiendo avatar: ' + uploadResponse.data.message);
    }

    const uploadResult = uploadResponse.data.data;
    console.log('✅ Avatar subido exitosamente');
    console.log(`   Avatar URL: ${uploadResult.user.avatar}`);
    console.log(`   Usuario: ${uploadResult.user.name}`);
    console.log(`   Email: ${uploadResult.user.email}`);

    // 5. Verificar que el avatar se guardó correctamente
    console.log('\n5️⃣ Verificando que el avatar se guardó correctamente...');
    const verifyResponse = await axios.get(`${API_BASE_URL}/api/users/profile`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!verifyResponse.data.success) {
      throw new Error('Error verificando perfil: ' + verifyResponse.data.message);
    }

    const updatedProfile = verifyResponse.data.data;
    console.log('✅ Perfil verificado');
    console.log(`   Avatar actualizado: ${updatedProfile.avatar || 'No tiene avatar'}`);

    // 6. Verificar que la URL es de S3
    console.log('\n6️⃣ Verificando que la URL es de S3...');
    if (updatedProfile.avatar) {
      if (updatedProfile.avatar.includes('amazonaws.com') || updatedProfile.avatar.includes('s3.')) {
        console.log('✅ La URL es de S3 (Amazon AWS)');
        console.log(`   URL: ${updatedProfile.avatar}`);
      } else if (updatedProfile.avatar.includes('localhost') || updatedProfile.avatar.includes('uploads/')) {
        console.log('❌ La URL es local (NO es S3)');
        console.log(`   URL: ${updatedProfile.avatar}`);
      } else {
        console.log('⚠️ La URL no es claramente S3 ni local');
        console.log(`   URL: ${updatedProfile.avatar}`);
      }
    } else {
      console.log('❌ No se encontró avatar en el perfil');
    }

    // 7. Limpiar archivo de prueba
    console.log('\n7️⃣ Limpiando archivo de prueba...');
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
      console.log('✅ Archivo de prueba eliminado');
    }

    // 8. Resumen final
    console.log('\n8️⃣ Resumen final:');
    console.log('=' .repeat(50));
    
    if (updatedProfile.avatar && (updatedProfile.avatar.includes('amazonaws.com') || updatedProfile.avatar.includes('s3.'))) {
      console.log('🎉 ¡ÉXITO! Los avatares se están subiendo correctamente a S3');
      console.log('✅ El sistema está configurado para Docker con múltiples instancias');
      console.log('✅ No se guardan archivos en local');
      console.log('✅ Los avatares son accesibles desde cualquier instancia');
    } else {
      console.log('❌ PROBLEMA: Los avatares NO se están subiendo a S3');
      console.log('❌ Se están guardando en local, lo cual no es compatible con Docker');
      console.log('💡 Revisar la configuración de S3 y el endpoint de avatar');
    }

    console.log('\n📋 Detalles técnicos:');
    console.log(`   Endpoint usado: PUT ${API_BASE_URL}/api/users/avatar`);
    console.log(`   Middleware: uploadToS3.single('avatar')`);
    console.log(`   Configuración S3: ${process.env.AWS_S3_BUCKET_NAME || 'No configurado'}`);

  } catch (error) {
    console.error('\n❌ [TEST AVATAR S3 UPLOAD] Error:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    
    console.log('\n💡 Posibles soluciones:');
    console.log('   1. Verificar que el servidor esté corriendo en', API_BASE_URL);
    console.log('   2. Verificar que las credenciales de AWS S3 estén configuradas');
    console.log('   3. Verificar que el bucket S3 existe y es accesible');
    console.log('   4. Verificar que el middleware uploadToS3 esté configurado correctamente');
  }
}

testAvatarS3Upload();
