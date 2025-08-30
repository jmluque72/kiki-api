const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function testDashboardAccess() {
  try {
    console.log('🧪 Probando acceso al dashboard con diferentes roles...\n');

    // 1. Login como superadmin
    console.log('1️⃣ Login como superadmin...');
    const superadminLogin = await axios.post(`${API_BASE_URL}/api/users/login`, {
      email: 'admin@kiki.ar',
      password: 'admin123'
    });

    if (superadminLogin.data.success) {
      const superadminToken = superadminLogin.data.data.token;
      const superadminUser = superadminLogin.data.data.user;
      console.log('✅ Login superadmin exitoso');
      console.log(`👤 Usuario: ${superadminUser.nombre} (${superadminUser.email})`);
      console.log(`🔑 Rol: ${superadminUser.role.nombre}`);
      console.log('');

      // Verificar que superadmin puede acceder a todas las secciones
      const superadminHeaders = {
        'Authorization': `Bearer ${superadminToken}`,
        'Content-Type': 'application/json'
      };

      console.log('📊 Probando acceso a secciones como superadmin...');
      
      // Probar acceso a usuarios (debería ver todos)
      try {
        const usersResponse = await axios.get(`${API_BASE_URL}/api/users`, { headers: superadminHeaders });
        console.log('✅ Superadmin puede ver usuarios:', usersResponse.data.data.total, 'usuarios');
      } catch (error) {
        console.log('❌ Error obteniendo usuarios como superadmin:', error.response?.data?.message);
      }

      // Probar acceso a cuentas
      try {
        const accountsResponse = await axios.get(`${API_BASE_URL}/api/accounts`, { headers: superadminHeaders });
        console.log('✅ Superadmin puede ver cuentas:', accountsResponse.data.data.total, 'cuentas');
      } catch (error) {
        console.log('❌ Error obteniendo cuentas como superadmin:', error.response?.data?.message);
      }
    } else {
      console.log('❌ Error en login superadmin:', superadminLogin.data.message);
    }

    console.log('');

    // 2. Login como adminaccount
    console.log('2️⃣ Login como adminaccount...');
    const adminLogin = await axios.post(`${API_BASE_URL}/api/users/login`, {
      email: 'test@kiki.ar',
      password: 'admin123'
    });

    if (adminLogin.data.success) {
      const adminToken = adminLogin.data.data.token;
      const adminUser = adminLogin.data.data.user;
      console.log('✅ Login adminaccount exitoso');
      console.log(`👤 Usuario: ${adminUser.nombre} (${adminUser.email})`);
      console.log(`🔑 Rol: ${adminUser.role.nombre}`);
      console.log('');

      const adminHeaders = {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      };

      console.log('📊 Probando acceso a secciones como adminaccount...');
      
      // Probar acceso a usuarios (debería ver solo los de su cuenta)
      try {
        const usersResponse = await axios.get(`${API_BASE_URL}/api/users`, { headers: adminHeaders });
        console.log('✅ Adminaccount puede ver usuarios:', usersResponse.data.data.total, 'usuarios');
        console.log('📋 Usuarios filtrados por cuenta:');
        usersResponse.data.data.users.forEach((user, index) => {
          console.log(`   ${index + 1}. ${user.nombre} (${user.email}) - ${user.role?.nombre}`);
        });
      } catch (error) {
        console.log('❌ Error obteniendo usuarios como adminaccount:', error.response?.data?.message);
      }

      // Probar acceso a cuentas (debería fallar)
      try {
        const accountsResponse = await axios.get(`${API_BASE_URL}/api/accounts`, { headers: adminHeaders });
        console.log('❌ Adminaccount NO debería poder ver cuentas, pero obtuvo:', accountsResponse.data.data.total);
      } catch (error) {
        console.log('✅ Adminaccount correctamente bloqueado de ver cuentas:', error.response?.data?.message);
      }

      // Probar acceso a grupos (debería ver solo los de su cuenta)
      try {
        const groupsResponse = await axios.get(`${API_BASE_URL}/api/grupos`, { headers: adminHeaders });
        console.log('✅ Adminaccount puede ver grupos:', groupsResponse.data.data.total, 'grupos');
      } catch (error) {
        console.log('❌ Error obteniendo grupos como adminaccount:', error.response?.data?.message);
      }

      // Probar acceso a eventos (debería ver solo los de su cuenta)
      try {
        const eventsResponse = await axios.get(`${API_BASE_URL}/api/events`, { headers: adminHeaders });
        console.log('✅ Adminaccount puede ver eventos:', eventsResponse.data.data.total, 'eventos');
      } catch (error) {
        console.log('❌ Error obteniendo eventos como adminaccount:', error.response?.data?.message);
      }

      // Probar acceso a actividades (debería ver solo las de su cuenta)
      try {
        const activitiesResponse = await axios.get(`${API_BASE_URL}/api/activities`, { headers: adminHeaders });
        console.log('✅ Adminaccount puede ver actividades:', activitiesResponse.data.data.total, 'actividades');
      } catch (error) {
        console.log('❌ Error obteniendo actividades como adminaccount:', error.response?.data?.message);
      }

      // Probar acceso a asistencias (debería ver solo las de su cuenta)
      try {
        const asistenciasResponse = await axios.get(`${API_BASE_URL}/api/asistencias`, { headers: adminHeaders });
        console.log('✅ Adminaccount puede ver asistencias:', asistenciasResponse.data.data.total, 'asistencias');
      } catch (error) {
        console.log('❌ Error obteniendo asistencias como adminaccount:', error.response?.data?.message);
      }

      // Probar acceso a aprobaciones (debería ver solo las de su cuenta)
      try {
        const aprobacionesResponse = await axios.get(`${API_BASE_URL}/api/users/pending-associations`, { headers: adminHeaders });
        console.log('✅ Adminaccount puede ver aprobaciones:', aprobacionesResponse.data.data.total, 'asociaciones pendientes');
      } catch (error) {
        console.log('❌ Error obteniendo aprobaciones como adminaccount:', error.response?.data?.message);
      }

    } else {
      console.log('❌ Error en login adminaccount:', adminLogin.data.message);
    }

    console.log('\n🎉 Pruebas de acceso al dashboard completadas');

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

// Ejecutar la prueba
testDashboardAccess(); 