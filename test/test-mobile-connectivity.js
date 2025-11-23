const axios = require('axios');
require('dotenv').config();

const API_BASE_URL = 'http://192.168.68.103:3000/api';

async function testMobileConnectivity() {
  console.log('🌐 [TEST MOBILE CONNECTIVITY] Verificando conectividad...\n');

  // 1. Test básico de conectividad
  console.log('1️⃣ Test básico de conectividad...');
  try {
    const pingResponse = await axios.get(`${API_BASE_URL}/users/profile`, {
      timeout: 5000
    });
    console.log('✅ Servidor responde:', pingResponse.status);
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Servidor responde (401 - esperado sin token)');
    } else {
      console.log('❌ Servidor no responde:', error.message);
      return;
    }
  }

  // 2. Test de login
  console.log('\n2️⃣ Test de login...');
  try {
    const loginResponse = await axios.post(`${API_BASE_URL}/users/login`, {
      email: 'admin@kiki.com.ar',
      password: 'admin123'
    }, {
      timeout: 10000
    });

    if (loginResponse.data.success) {
      console.log('✅ Login exitoso');
      const token = loginResponse.data.data.token;
      console.log('🔑 Token obtenido:', token.substring(0, 20) + '...');
      
      // 3. Test de perfil con token
      console.log('\n3️⃣ Test de perfil con token...');
      try {
        const profileResponse = await axios.get(`${API_BASE_URL}/users/profile`, {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          timeout: 10000
        });

        if (profileResponse.data.success) {
          console.log('✅ Perfil obtenido correctamente');
          console.log('👤 Usuario:', profileResponse.data.data.name);
          console.log('📧 Email:', profileResponse.data.data.email);
        } else {
          console.log('❌ Error obteniendo perfil:', profileResponse.data.message);
        }
      } catch (profileError) {
        console.log('❌ Error en request de perfil:', profileError.message);
        if (profileError.response) {
          console.log('   Status:', profileError.response.status);
          console.log('   Data:', profileError.response.data);
        }
      }

      // 4. Test de CORS
      console.log('\n4️⃣ Test de CORS...');
      try {
        const corsResponse = await axios.options(`${API_BASE_URL}/users/avatar`, {
          headers: {
            'Origin': 'http://localhost:3000',
            'Access-Control-Request-Method': 'PUT',
            'Access-Control-Request-Headers': 'Content-Type, Authorization'
          },
          timeout: 5000
        });
        console.log('✅ CORS configurado correctamente');
        console.log('   Headers:', corsResponse.headers);
      } catch (corsError) {
        console.log('❌ Error en CORS:', corsError.message);
      }

      // 5. Test de timeout
      console.log('\n5️⃣ Test de timeout...');
      try {
        const timeoutResponse = await axios.get(`${API_BASE_URL}/users/profile`, {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          timeout: 30000 // 30 segundos
        });
        console.log('✅ Request completado en tiempo normal');
      } catch (timeoutError) {
        if (timeoutError.code === 'ECONNABORTED') {
          console.log('❌ Request timeout');
        } else {
          console.log('❌ Error en request:', timeoutError.message);
        }
      }

    } else {
      console.log('❌ Login falló:', loginResponse.data.message);
    }
  } catch (loginError) {
    console.log('❌ Error en login:', loginError.message);
    if (loginError.response) {
      console.log('   Status:', loginError.response.status);
      console.log('   Data:', loginError.response.data);
    } else if (loginError.request) {
      console.log('   No se recibió respuesta del servidor');
    }
  }

  // 6. Test de red
  console.log('\n6️⃣ Test de red...');
  try {
    const networkResponse = await axios.get('https://httpbin.org/ip', {
      timeout: 5000
    });
    console.log('✅ Conectividad a internet OK');
    console.log('   IP:', networkResponse.data.origin);
  } catch (networkError) {
    console.log('❌ Problema de conectividad a internet:', networkError.message);
  }

  // 7. Resumen final
  console.log('\n7️⃣ Resumen final:');
  console.log('=' .repeat(50));
  console.log('📋 Configuración actual:');
  console.log(`   API Base URL: ${API_BASE_URL}`);
  console.log(`   Timeout: 10 segundos`);
  console.log(`   Headers: multipart/form-data`);
  
  console.log('\n💡 Recomendaciones para la app móvil:');
  console.log('   1. Verificar que la IP del servidor sea correcta');
  console.log('   2. Verificar que el dispositivo móvil esté en la misma red');
  console.log('   3. Verificar que el firewall no bloquee las conexiones');
  console.log('   4. Verificar que el token se esté enviando correctamente');
  console.log('   5. Considerar aumentar el timeout en la app móvil');
}

testMobileConnectivity();
