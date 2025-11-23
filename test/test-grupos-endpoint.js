const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function testGruposEndpoint() {
  try {
    console.log('🧪 Probando endpoint de grupos...\n');

    // 1. Login como test@kiki.ar
    console.log('1️⃣ Login como test@kiki.ar...');
    const loginResponse = await axios.post(`${API_BASE_URL}/api/users/login`, {
      email: 'test@kiki.ar',
      password: 'admin123'
    });

    if (!loginResponse.data.success) {
      console.log('❌ Error en login:', loginResponse.data.message);
      return;
    }

    const token = loginResponse.data.data.token;
    const user = loginResponse.data.data.user;
    console.log('✅ Login exitoso');
    console.log(`👤 Usuario: ${user.nombre} (${user.email})`);
    console.log(`🔑 Rol: ${user.role.nombre}`);
    console.log('');

    // Configurar headers
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 2. Probar endpoint de grupos
    console.log('2️⃣ Probando endpoint de grupos...');
    try {
      const gruposResponse = await axios.get(`${API_BASE_URL}/api/grupos`, { headers });
      console.log('✅ Grupos obtenidos exitosamente');
      console.log(`📊 Total grupos: ${gruposResponse.data.data.total}`);
      console.log(`📄 Página: ${gruposResponse.data.data.page}`);
      console.log(`📏 Límite: ${gruposResponse.data.data.limit}`);
      
      if (gruposResponse.data.data.grupos.length > 0) {
        console.log('📋 Grupos encontrados:');
        gruposResponse.data.data.grupos.forEach((grupo, index) => {
          console.log(`   ${index + 1}. ${grupo.nombre}`);
          console.log(`      Descripción: ${grupo.descripcion || 'Sin descripción'}`);
          console.log(`      Cuenta: ${grupo.cuenta?.nombre || 'Sin cuenta'}`);
          console.log(`      Activo: ${grupo.activo}`);
          console.log(`      Creado por: ${grupo.creadoPor?.name || 'N/A'}`);
          console.log('');
        });
      } else {
        console.log('📭 No se encontraron grupos');
      }
    } catch (error) {
      console.log('❌ Error obteniendo grupos:');
      console.log('   Status:', error.response?.status);
      console.log('   Message:', error.response?.data?.message || error.message);
      if (error.response?.data) {
        console.log('   Data:', JSON.stringify(error.response.data, null, 2));
      }
    }

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

// Ejecutar la prueba
testGruposEndpoint(); 