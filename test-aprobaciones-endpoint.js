const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function testAprobacionesEndpoint() {
  try {
    console.log('🧪 Probando endpoint de aprobaciones...\n');

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
    console.log(`🆔 User ID: ${user._id}`);
    console.log('');

    // Configurar headers
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 2. Probar endpoint de aprobaciones
    console.log('2️⃣ Probando endpoint de aprobaciones...');
    console.log('📡 Haciendo request a:', `${API_BASE_URL}/api/users/pending-associations`);
    console.log('🔑 Token:', token.substring(0, 20) + '...');
    console.log('');
    
    try {
      const aprobacionesResponse = await axios.get(`${API_BASE_URL}/api/users/pending-associations`, { headers });
      console.log('✅ Aprobaciones obtenidas exitosamente');
      
      if (aprobacionesResponse.data.data.length > 0) {
        console.log(`📊 Total asociaciones pendientes: ${aprobacionesResponse.data.data.length}`);
        console.log('📋 Asociaciones pendientes:');
        aprobacionesResponse.data.data.forEach((association, index) => {
          console.log(`   ${index + 1}. Usuario: ${association.user.name} (${association.user.email})`);
          console.log(`      Cuenta: ${association.account.nombre} (${association.account.razonSocial})`);
          console.log(`      Rol: ${association.role.nombre}`);
          console.log(`      Status: ${association.status}`);
          console.log(`      Fecha: ${new Date(association.createdAt).toLocaleString()}`);
          console.log('');
        });
      } else {
        console.log('📭 No se encontraron asociaciones pendientes');
      }
    } catch (error) {
      console.log('❌ Error obteniendo aprobaciones:');
      console.log('   Status:', error.response?.status);
      console.log('   Message:', error.response?.data?.message || error.message);
      if (error.response?.data) {
        console.log('   Data:', JSON.stringify(error.response.data, null, 2));
      }
    }

    console.log('\n💡 Si no ves logs del servidor, verifica que esté corriendo en puerto 3000');

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

// Ejecutar la prueba
testAprobacionesEndpoint(); 