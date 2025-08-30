const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function testCreateAccount() {
  try {
    console.log('🧪 Probando creación de cuenta...\n');

    // 1. Login como superadmin
    console.log('1️⃣ Login como superadmin...');
    const superadminLogin = await axios.post(`${API_BASE_URL}/api/users/login`, {
      email: 'admin@kiki.ar',
      password: 'admin123'
    });

    if (!superadminLogin.data.success) {
      console.log('❌ Error en login superadmin:', superadminLogin.data.message);
      return;
    }

    console.log('✅ Superadmin logueado exitosamente');
    const superadminToken = superadminLogin.data.data.token;
    const superadminHeaders = {
      'Authorization': `Bearer ${superadminToken}`,
      'Content-Type': 'application/json'
    };

    // 2. Crear nueva cuenta
    console.log('2️⃣ Creando nueva cuenta...');
    const timestamp = Date.now();
    const accountData = {
      nombre: `Test Account ${timestamp}`,
      razonSocial: `Test Razon Social ${timestamp}`,
      address: 'Calle Test 123, Ciudad Test',
      emailAdmin: `admin-test-${timestamp}@example.com`,
      nombreAdmin: 'Admin Test Account',
      logo: 'https://via.placeholder.com/150'
    };

    try {
      const createAccountResponse = await axios.post(`${API_BASE_URL}/api/accounts`, accountData, { headers: superadminHeaders });
      
      if (createAccountResponse.data.success) {
        console.log('✅ Cuenta creada exitosamente');
        console.log(`🏢 Nombre: ${createAccountResponse.data.data.account.nombre}`);
        console.log(`👤 Admin: ${createAccountResponse.data.data.adminUser.name}`);
        console.log(`📧 Email Admin: ${createAccountResponse.data.data.adminUser.email}`);
        console.log(`🔑 Estado Admin: ${createAccountResponse.data.data.adminUser.status}`);
      } else {
        console.log('❌ Error creando cuenta:', createAccountResponse.data.message);
      }
    } catch (error) {
      console.log('❌ Error creando cuenta:', error.response?.data || error.message);
    }

    console.log('');

    // 3. Probar login del nuevo admin
    console.log('3️⃣ Probando login del nuevo admin...');
    try {
      const adminLoginResponse = await axios.post(`${API_BASE_URL}/api/users/login`, {
        email: accountData.emailAdmin,
        password: 'admin123'
      });
      
      if (adminLoginResponse.data.success) {
        console.log('✅ Login del nuevo admin exitoso');
        console.log(`👤 Usuario: ${adminLoginResponse.data.data.user.nombre}`);
        console.log(`🔑 Rol: ${adminLoginResponse.data.data.user.role.nombre}`);
        console.log(`📋 Asociaciones: ${adminLoginResponse.data.data.associations.length}`);
        
        // Mostrar detalles de las asociaciones
        adminLoginResponse.data.data.associations.forEach((assoc, index) => {
          console.log(`   ${index + 1}. ${assoc.account.nombre} - Estado: ${assoc.status}`);
        });
      } else {
        console.log('❌ Error login del nuevo admin:', adminLoginResponse.data.message);
      }
    } catch (error) {
      console.log('❌ Error login del nuevo admin:', error.response?.data || error.message);
    }

    console.log('\n🎉 Pruebas de creación de cuenta completadas');

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

testCreateAccount(); 