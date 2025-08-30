const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function testAdminAccountAccess() {
  try {
    console.log('🧪 Probando acceso de adminaccount a diferentes endpoints...\n');

    // 1. Login como adminaccount
    console.log('1️⃣ Login como adminaccount...');
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

    // Configurar headers para las siguientes requests
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
      if (gruposResponse.data.data.grupos.length > 0) {
        console.log('📋 Ejemplos de grupos:');
        gruposResponse.data.data.grupos.slice(0, 3).forEach((grupo, index) => {
          console.log(`   ${index + 1}. ${grupo.nombre} (${grupo.cuenta.nombre})`);
        });
      }
    } catch (error) {
      console.log('❌ Error obteniendo grupos:', error.response?.data?.message || error.message);
    }
    console.log('');

    // 3. Probar endpoint de eventos
    console.log('3️⃣ Probando endpoint de eventos...');
    try {
      const eventosResponse = await axios.get(`${API_BASE_URL}/api/events`, { headers });
      console.log('✅ Eventos obtenidos exitosamente');
      console.log(`📊 Total eventos: ${eventosResponse.data.data.total}`);
      if (eventosResponse.data.data.events.length > 0) {
        console.log('📋 Ejemplos de eventos:');
        eventosResponse.data.data.events.slice(0, 3).forEach((evento, index) => {
          console.log(`   ${index + 1}. ${evento.titulo} (${evento.account?.nombre || 'Sin cuenta'})`);
        });
      }
    } catch (error) {
      console.log('❌ Error obteniendo eventos:', error.response?.data?.message || error.message);
    }
    console.log('');

    // 4. Probar endpoint de cuentas
    console.log('4️⃣ Probando endpoint de cuentas...');
    try {
      const cuentasResponse = await axios.get(`${API_BASE_URL}/api/accounts`, { headers });
      console.log('✅ Cuentas obtenidas exitosamente');
      console.log(`📊 Total cuentas: ${cuentasResponse.data.data.total}`);
      if (cuentasResponse.data.data.accounts.length > 0) {
        console.log('📋 Ejemplos de cuentas:');
        cuentasResponse.data.data.accounts.slice(0, 3).forEach((cuenta, index) => {
          console.log(`   ${index + 1}. ${cuenta.nombre} (${cuenta.razonSocial})`);
        });
      }
    } catch (error) {
      console.log('❌ Error obteniendo cuentas:', error.response?.data?.message || error.message);
    }
    console.log('');

    // 5. Probar endpoint de asociaciones pendientes
    console.log('5️⃣ Probando endpoint de asociaciones pendientes...');
    try {
      const asociacionesResponse = await axios.get(`${API_BASE_URL}/api/users/pending-associations`, { headers });
      console.log('✅ Asociaciones pendientes obtenidas exitosamente');
      console.log(`📊 Total asociaciones pendientes: ${asociacionesResponse.data.data.length}`);
      if (asociacionesResponse.data.data.length > 0) {
        console.log('📋 Ejemplos de asociaciones pendientes:');
        asociacionesResponse.data.data.slice(0, 3).forEach((asociacion, index) => {
          console.log(`   ${index + 1}. ${asociacion.user.name} (${asociacion.user.email})`);
          console.log(`      Institución: ${asociacion.account.nombre}`);
          console.log(`      Rol: ${asociacion.role.nombre}`);
        });
      }
    } catch (error) {
      console.log('❌ Error obteniendo asociaciones pendientes:', error.response?.data?.message || error.message);
    }
    console.log('');

    console.log('🎉 Pruebas completadas!');

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

// Ejecutar las pruebas
testAdminAccountAccess(); 