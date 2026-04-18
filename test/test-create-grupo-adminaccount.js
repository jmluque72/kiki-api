const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function testCreateGrupoAdminAccount() {
  try {
    console.log('🧪 Probando creación de grupo como adminaccount...\n');

    // 1. Login como adminaccount
    console.log('1️⃣ Login como adminaccount...');
    const adminLogin = await axios.post(`${API_BASE_URL}/api/users/login`, {
      email: 'test@kiki.ar',
      password: 'admin123'
    });

    if (!adminLogin.data.success) {
      console.log('❌ Error en login adminaccount:', adminLogin.data.message);
      return;
    }

    console.log('✅ Adminaccount logueado exitosamente');
    const adminToken = adminLogin.data.data.token;
    const adminHeaders = {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    };

    // 2. Crear grupo sin especificar cuenta (debería usar automáticamente la cuenta del admin)
    console.log('2️⃣ Creando grupo sin especificar cuenta...');
    const timestamp = Date.now();
    const grupoData = {
      nombre: `Test Grupo Admin ${timestamp}`,
      descripcion: 'Grupo creado por adminaccount sin especificar cuenta'
      // No incluimos cuentaId
    };

    try {
      const createGrupoResponse = await axios.post(`${API_BASE_URL}/api/grupos`, grupoData, { headers: adminHeaders });
      
      if (createGrupoResponse.data.success) {
        console.log('✅ Grupo creado exitosamente');
        console.log(`🏢 Nombre: ${createGrupoResponse.data.data.grupo.nombre}`);
        console.log(`📝 Descripción: ${createGrupoResponse.data.data.grupo.descripcion}`);
        console.log(`🏢 Cuenta: ${createGrupoResponse.data.data.grupo.cuenta.nombre}`);
        console.log(`👤 Creado por: ${createGrupoResponse.data.data.grupo.creadoPor.name}`);
      } else {
        console.log('❌ Error creando grupo:', createGrupoResponse.data.message);
      }
    } catch (error) {
      console.log('❌ Error creando grupo:', error.response?.data || error.message);
    }

    console.log('');

    // 3. Intentar crear grupo especificando una cuenta diferente (debería fallar)
    console.log('3️⃣ Intentando crear grupo con cuenta diferente (debería fallar)...');
    const grupoDataWithAccount = {
      nombre: `Test Grupo Admin Con Cuenta ${timestamp}`,
      descripcion: 'Grupo con cuenta específica',
      cuentaId: '507f1f77bcf86cd799439011' // ID de cuenta que no existe
    };

    try {
      const createGrupoWithAccountResponse = await axios.post(`${API_BASE_URL}/api/grupos`, grupoDataWithAccount, { headers: adminHeaders });
      
      if (createGrupoWithAccountResponse.data.success) {
        console.log('⚠️ Grupo creado con cuenta específica (no esperado)');
      } else {
        console.log('✅ Correctamente rechazado:', createGrupoWithAccountResponse.data.message);
      }
    } catch (error) {
      console.log('✅ Correctamente rechazado:', error.response?.data?.message || error.message);
    }

    console.log('');

    // 4. Listar grupos para verificar que se creó correctamente
    console.log('4️⃣ Listando grupos para verificar...');
    try {
      const listGruposResponse = await axios.get(`${API_BASE_URL}/api/grupos`, { headers: adminHeaders });
      
      if (listGruposResponse.data.success) {
        console.log('✅ Grupos listados exitosamente');
        console.log(`📋 Total de grupos: ${listGruposResponse.data.data.grupos.length}`);
        
        listGruposResponse.data.data.grupos.forEach((grupo, index) => {
          console.log(`   ${index + 1}. ${grupo.nombre} - Cuenta: ${grupo.cuenta.nombre} - Activo: ${grupo.activo}`);
        });
      } else {
        console.log('❌ Error listando grupos:', listGruposResponse.data.message);
      }
    } catch (error) {
      console.log('❌ Error listando grupos:', error.response?.data || error.message);
    }

    console.log('\n🎉 Pruebas de creación de grupo como adminaccount completadas');

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

testCreateGrupoAdminAccount(); 