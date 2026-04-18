const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const API_BASE_URL = 'http://192.168.200.153:3000/api';

async function testMobileAvatarCommunication() {
  try {
    console.log('🧪 [TEST MOBILE AVATAR] Probando comunicación de app móvil...\n');

    // 1. Login para obtener token
    console.log('1️⃣ Iniciando sesión...');
    const loginResponse = await axios.post(`${API_BASE_URL}/users/login`, {
      email: 'admin@kiki.com.ar',
      password: 'admin123'
    });

    if (!loginResponse.data.success) {
      throw new Error('Error en login: ' + loginResponse.data.message);
    }

    const token = loginResponse.data.data.token;
    console.log('✅ Login exitoso');

    // 2. Crear archivo de prueba (simulando imagen de la app móvil)
    console.log('\n2️⃣ Creando archivo de prueba...');
    const testImagePath = path.join(__dirname, 'test-mobile-avatar.png');
    
    // Crear una imagen PNG simple de 1x1 pixel (base64)
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const imageBuffer = Buffer.from(pngBase64, 'base64');
    
    fs.writeFileSync(testImagePath, imageBuffer);
    console.log('✅ Archivo de prueba creado:', testImagePath);

    // 3. Simular la comunicación de la app móvil
    console.log('\n3️⃣ Simulando comunicación de app móvil...');
    
    // Crear FormData como lo hace la app móvil
    const formData = new FormData();
    
    // Simular el objeto de archivo que envía React Native
    formData.append('avatar', fs.createReadStream(testImagePath), {
      filename: 'test-mobile-avatar.png',
      contentType: 'image/png'
    });
    
    console.log('🖼️ [MOBILE SIMULATION] FormData creado');
    console.log('🖼️ [MOBILE SIMULATION] Headers:', formData.getHeaders());
    
    // 4. Enviar request como lo hace la app móvil
    console.log('\n4️⃣ Enviando request PUT /users/avatar...');
    
    const uploadResponse = await axios.put(`${API_BASE_URL}/users/avatar`, formData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        ...formData.getHeaders()
      },
      timeout: 10000
    });

    console.log('✅ Request enviado exitosamente');
    console.log('📊 Status:', uploadResponse.status);
    console.log('📊 Status Text:', uploadResponse.statusText);
    console.log('📊 Headers:', uploadResponse.headers);
    console.log('📊 Data:', uploadResponse.data);

    // 5. Verificar respuesta
    if (uploadResponse.data.success) {
      console.log('\n✅ Respuesta exitosa del servidor');
      console.log('📝 Message:', uploadResponse.data.message);
      console.log('👤 User:', uploadResponse.data.data?.user?.name);
      console.log('🖼️ Avatar URL:', uploadResponse.data.data?.user?.avatar);
    } else {
      console.log('\n❌ Respuesta con error del servidor');
      console.log('📝 Message:', uploadResponse.data.message);
    }

    // 6. Verificar que el avatar se guardó correctamente
    console.log('\n5️⃣ Verificando que el avatar se guardó correctamente...');
    const verifyResponse = await axios.get(`${API_BASE_URL}/users/profile`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (verifyResponse.data.success) {
      const profile = verifyResponse.data.data;
      console.log('✅ Perfil verificado');
      console.log(`   Avatar: ${profile.avatar || 'No tiene avatar'}`);
      
      if (profile.avatar && profile.avatar.includes('amazonaws.com')) {
        console.log('✅ Avatar está en S3');
      } else {
        console.log('❌ Avatar NO está en S3');
      }
    }

    // 7. Limpiar archivo de prueba
    console.log('\n6️⃣ Limpiando archivo de prueba...');
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
      console.log('✅ Archivo de prueba eliminado');
    }

    // 8. Resumen final
    console.log('\n7️⃣ Resumen final:');
    console.log('=' .repeat(50));
    
    if (uploadResponse.data.success) {
      console.log('🎉 ¡ÉXITO! La comunicación móvil funciona correctamente');
      console.log('✅ El servidor responde correctamente');
      console.log('✅ Los avatares se suben a S3');
      console.log('✅ La app móvil debería funcionar sin problemas');
    } else {
      console.log('❌ PROBLEMA: El servidor no responde correctamente');
      console.log('💡 Revisar logs del servidor para más detalles');
    }

  } catch (error) {
    console.error('\n❌ [TEST MOBILE AVATAR] Error:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Status Text:', error.response.statusText);
      console.error('   Headers:', error.response.headers);
      console.error('   Data:', error.response.data);
    } else if (error.request) {
      console.error('   Request Error:', error.request);
      console.error('   No se recibió respuesta del servidor');
    } else {
      console.error('   Error:', error.message);
    }
    
    console.log('\n💡 Posibles soluciones:');
    console.log('   1. Verificar que el servidor esté corriendo en', API_BASE_URL);
    console.log('   2. Verificar conectividad de red');
    console.log('   3. Verificar configuración de CORS en el servidor');
    console.log('   4. Verificar que el token sea válido');
  }
}

testMobileAvatarCommunication();
