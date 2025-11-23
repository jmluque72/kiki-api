const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function testActivityEventsEndpoints() {
  try {
    console.log('🧪 Probando endpoints de Activity y Eventos...\n');

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

    // 2. Probar listar actividades
    console.log('2️⃣ Probando listar actividades...');
    try {
      const activitiesResponse = await axios.get(`${API_BASE_URL}/api/activities`, { headers });
      console.log('✅ Actividades obtenidas exitosamente');
      console.log(`📊 Total actividades: ${activitiesResponse.data.data.total}`);
      console.log(`📄 Página: ${activitiesResponse.data.data.page}`);
      console.log(`📏 Límite: ${activitiesResponse.data.data.limit}`);
      
      if (activitiesResponse.data.data.activities.length > 0) {
        console.log('📋 Actividades encontradas:');
        activitiesResponse.data.data.activities.slice(0, 3).forEach((activity, index) => {
          console.log(`   ${index + 1}. ${activity.usuario.name} - ${activity.tipo}`);
          console.log(`      Descripción: ${activity.descripcion}`);
          console.log(`      Cuenta: ${activity.account.nombre}`);
          console.log(`      Fecha: ${new Date(activity.createdAt).toLocaleString()}`);
          console.log('');
        });
      } else {
        console.log('📭 No se encontraron actividades');
      }
    } catch (error) {
      console.log('❌ Error obteniendo actividades:');
      console.log('   Status:', error.response?.status);
      console.log('   Message:', error.response?.data?.message || error.message);
    }

    // 3. Probar listar eventos
    console.log('3️⃣ Probando listar eventos...');
    try {
      const eventsResponse = await axios.get(`${API_BASE_URL}/api/events`, { headers });
      console.log('✅ Eventos obtenidos exitosamente');
      console.log(`📊 Total eventos: ${eventsResponse.data.data.total}`);
      console.log(`📄 Página: ${eventsResponse.data.data.page}`);
      console.log(`📏 Límite: ${eventsResponse.data.data.limit}`);
      
      if (eventsResponse.data.data.events.length > 0) {
        console.log('📋 Eventos encontrados:');
        eventsResponse.data.data.events.slice(0, 3).forEach((event, index) => {
          console.log(`   ${index + 1}. ${event.nombre}`);
          console.log(`      Descripción: ${event.descripcion}`);
          console.log(`      Estado: ${event.estado}`);
          console.log(`      Organizador: ${event.organizador.name}`);
          console.log(`      Fecha: ${new Date(event.fechaInicio).toLocaleDateString()}`);
          console.log('');
        });
      } else {
        console.log('📭 No se encontraron eventos');
      }
    } catch (error) {
      console.log('❌ Error obteniendo eventos:');
      console.log('   Status:', error.response?.status);
      console.log('   Message:', error.response?.data?.message || error.message);
    }

    // 4. Probar filtros de actividades
    console.log('4️⃣ Probando filtros de actividades...');
    try {
      const activitiesFilteredResponse = await axios.get(`${API_BASE_URL}/api/activities?tipo=login&limit=5`, { headers });
      console.log('✅ Actividades filtradas obtenidas exitosamente');
      console.log(`📊 Total actividades filtradas: ${activitiesFilteredResponse.data.data.total}`);
      console.log(`📋 Actividades de tipo 'login': ${activitiesFilteredResponse.data.data.activities.length}`);
    } catch (error) {
      console.log('❌ Error obteniendo actividades filtradas:');
      console.log('   Status:', error.response?.status);
      console.log('   Message:', error.response?.data?.message || error.message);
    }

    // 5. Probar filtros de eventos
    console.log('5️⃣ Probando filtros de eventos...');
    try {
      const eventsFilteredResponse = await axios.get(`${API_BASE_URL}/api/events?estado=publicado&limit=5`, { headers });
      console.log('✅ Eventos filtrados obtenidos exitosamente');
      console.log(`📊 Total eventos filtrados: ${eventsFilteredResponse.data.data.total}`);
      console.log(`📋 Eventos con estado 'publicado': ${eventsFilteredResponse.data.data.events.length}`);
    } catch (error) {
      console.log('❌ Error obteniendo eventos filtrados:');
      console.log('   Status:', error.response?.status);
      console.log('   Message:', error.response?.data?.message || error.message);
    }

    console.log('🎉 Pruebas de Activity y Eventos completadas');

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

// Ejecutar la prueba
testActivityEventsEndpoints(); 