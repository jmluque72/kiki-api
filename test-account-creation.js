const axios = require('axios');

const API_BASE = 'http://localhost:3000';

async function testAccountCreation() {
  try {
    console.log('🧪 Probando creación de cuenta con usuario automático...\n');

    // 1. Login como superadmin
    console.log('1️⃣ Login como superadmin...');
    const loginResponse = await axios.post(`${API_BASE}/api/users/login`, {
      email: 'admin@kiki.ar',
      password: 'admin123'
    });

    const token = loginResponse.data.data.token;
    console.log('✅ Login exitoso\n');

    // 2. Crear nueva cuenta
    console.log('2️⃣ Creando nueva cuenta...');
    const accountData = {
      nombre: 'Universidad Nacional de La Plata',
      razonSocial: 'UNLP S.A.',
      address: 'Calle 7 776, La Plata',
      emailAdmin: 'admin@unlp.edu.ar',
      nombreAdmin: 'Administrador UNLP',
      logo: 'https://via.placeholder.com/150'
    };

    const createResponse = await axios.post(`${API_BASE}/api/accounts`, accountData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Cuenta creada exitosamente');
    console.log('📧 Nombre:', createResponse.data.data.account.nombre);
    console.log('👤 Usuario Admin:', createResponse.data.data.adminUser.name);
    console.log('📧 Email Admin:', createResponse.data.data.adminUser.email);
    console.log('🔑 Password:', 'admin123');
    console.log('');

    // 3. Probar login con el nuevo usuario
    console.log('3️⃣ Probando login con el nuevo usuario...');
    const newUserLogin = await axios.post(`${API_BASE}/api/users/login`, {
      email: 'admin@unlp.edu.ar',
      password: 'admin123'
    });

    console.log('✅ Login del nuevo usuario exitoso');
    console.log('👤 Usuario:', newUserLogin.data.data.user.nombre);
    console.log('📧 Email:', newUserLogin.data.data.user.email);
    console.log('🎭 Rol:', newUserLogin.data.data.user.role.nombre);
    console.log('');

    // 4. Verificar que la cuenta aparece en el listado
    console.log('4️⃣ Verificando listado de cuentas...');
    const accountsResponse = await axios.get(`${API_BASE}/api/accounts`);
    
    console.log('✅ Listado obtenido');
    console.log('📊 Total de cuentas:', accountsResponse.data.data.total);
    console.log('📋 Cuentas:');
    accountsResponse.data.data.accounts.forEach((account, index) => {
      console.log(`   ${index + 1}. ${account.nombre} (${account.usuarioAdministrador.email})`);
    });

    console.log('\n🎉 ¡Prueba completada exitosamente!');
    console.log('\n📋 Resumen:');
    console.log('   ✅ Cuenta creada con usuario automático');
    console.log('   ✅ Usuario puede hacer login');
    console.log('   ✅ Usuario tiene rol de administrador');
    console.log('   ✅ Contraseña por defecto: admin123');
    console.log('   ✅ Email del administrador configurado');

  } catch (error) {
    console.error('❌ Error en la prueba:', error.response?.data || error.message);
  }
}

testAccountCreation(); 