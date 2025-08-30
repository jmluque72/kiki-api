const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function testUsersFiltering() {
  try {
    console.log('🧪 Probando filtrado de usuarios por cuenta...\n');

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

    // 2. Probar listar usuarios
    console.log('2️⃣ Probando listar usuarios...');
    try {
      const usersResponse = await axios.get(`${API_BASE_URL}/api/users`, { headers });
      console.log('✅ Usuarios obtenidos exitosamente');
      console.log(`📊 Total usuarios: ${usersResponse.data.data.total}`);
      console.log(`📄 Página: ${usersResponse.data.data.page}`);
      console.log(`📏 Límite: ${usersResponse.data.data.limit}`);
      
      if (usersResponse.data.data.users.length > 0) {
        console.log('📋 Usuarios encontrados:');
        usersResponse.data.data.users.forEach((user, index) => {
          console.log(`   ${index + 1}. ${user.nombre} (${user.email})`);
          console.log(`      Rol: ${user.role?.nombre || 'Sin rol'}`);
          console.log(`      Activo: ${user.activo ? 'Sí' : 'No'}`);
          console.log(`      Creado: ${new Date(user.createdAt).toLocaleDateString()}`);
          console.log('');
        });
      } else {
        console.log('📭 No se encontraron usuarios');
      }
    } catch (error) {
      console.log('❌ Error obteniendo usuarios:');
      console.log('   Status:', error.response?.status);
      console.log('   Message:', error.response?.data?.message || error.message);
    }

    // 3. Probar búsqueda de usuarios
    console.log('3️⃣ Probando búsqueda de usuarios...');
    try {
      const searchResponse = await axios.get(`${API_BASE_URL}/api/users?search=test`, { headers });
      console.log('✅ Búsqueda de usuarios exitosa');
      console.log(`📊 Total usuarios encontrados: ${searchResponse.data.data.total}`);
      console.log(`📋 Usuarios con "test" en el nombre o email: ${searchResponse.data.data.users.length}`);
    } catch (error) {
      console.log('❌ Error en búsqueda de usuarios:');
      console.log('   Status:', error.response?.status);
      console.log('   Message:', error.response?.data?.message || error.message);
    }

    // 4. Verificar asociaciones en la base de datos
    console.log('4️⃣ Verificando asociaciones en la base de datos...');
    try {
      // Primero obtener las cuentas del usuario
      const userAssociationsResponse = await axios.get(`${API_BASE_URL}/api/users/me/associations`, { headers });
      console.log('✅ Asociaciones del usuario obtenidas');
      console.log(`📋 Total asociaciones: ${userAssociationsResponse.data.data.associations.length}`);
      
      if (userAssociationsResponse.data.data.associations.length > 0) {
        console.log('🏢 Cuentas asociadas:');
        userAssociationsResponse.data.data.associations.forEach((assoc, index) => {
          console.log(`   ${index + 1}. ${assoc.account.nombre} (${assoc.account.razonSocial})`);
          console.log(`      Estado: ${assoc.status}`);
          console.log(`      Rol: ${assoc.role.nombre}`);
          console.log('');
        });
      }
    } catch (error) {
      console.log('❌ Error obteniendo asociaciones:');
      console.log('   Status:', error.response?.status);
      console.log('   Message:', error.response?.data?.message || error.message);
    }

    console.log('🎉 Pruebas de filtrado de usuarios completadas');

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

// Ejecutar la prueba
testUsersFiltering(); 