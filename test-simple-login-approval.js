const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function testSimpleLoginApproval() {
  try {
    console.log('🧪 Probando lógica de login con verificación de aprobación...\n');

    // 1. Crear usuario mobile
    const timestamp = Date.now();
    const testEmail = `test-approval-${timestamp}@example.com`;
    
    console.log('1️⃣ Registrando usuario mobile...');
    const registerResponse = await axios.post(`${API_BASE_URL}/api/users/register-mobile`, {
      email: testEmail,
      password: 'test123',
      nombre: 'Test Approval User',
      accountId: '688e2b6abd2f4269d06ce370',
      userType: 'colaborador',
      telefono: '123456789',
      direccion: 'Calle Test 123',
      fechaNacimiento: '1990-01-01',
      genero: 'masculino'
    });

    if (registerResponse.data.success) {
      console.log('✅ Usuario registrado exitosamente');
      console.log(`📧 Email: ${testEmail}`);
      console.log(`📋 Estado asociación: ${registerResponse.data.data.association.status}`);
      console.log(`🔑 Token generado: ${registerResponse.data.data.token ? 'SÍ' : 'NO'}`);
    } else {
      console.log('❌ Error en registro:', registerResponse.data.message);
      return;
    }

    console.log('');

    // 2. Intentar login (debería fallar)
    console.log('2️⃣ Intentando login con usuario pendiente...');
    try {
      const loginResponse = await axios.post(`${API_BASE_URL}/api/users/login`, {
        email: testEmail,
        password: 'test123'
      });
      console.log('❌ ERROR: Usuario pendiente NO debería poder loguearse');
    } catch (error) {
      if (error.response?.status === 403) {
        console.log('✅ CORRECTO: Usuario pendiente bloqueado');
        console.log(`📝 Mensaje: ${error.response.data.message}`);
        console.log(`🔑 Código: ${error.response.data.code}`);
      } else {
        console.log('❌ Error inesperado:', error.response?.data || error.message);
      }
    }

    console.log('');

    // 3. Login como admin para aprobar
    console.log('3️⃣ Login como admin...');
    const adminLogin = await axios.post(`${API_BASE_URL}/api/users/login`, {
      email: 'test@kiki.ar',
      password: 'admin123'
    });

    if (!adminLogin.data.success) {
      console.log('❌ Error login admin:', adminLogin.data.message);
      return;
    }

    console.log('✅ Admin logueado exitosamente');
    const adminToken = adminLogin.data.data.token;
    const adminHeaders = {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    };

    // 4. Obtener asociaciones pendientes
    console.log('4️⃣ Obteniendo asociaciones pendientes...');
    const pendingResponse = await axios.get(`${API_BASE_URL}/api/users/pending-associations`, { headers: adminHeaders });
    
    if (pendingResponse.data.success) {
      console.log(`📋 Asociaciones pendientes: ${pendingResponse.data.data.associations?.length || 0}`);
      
      // Buscar la asociación del usuario de prueba
      const testUserAssociation = pendingResponse.data.data.associations?.find(
        assoc => assoc.user.email === testEmail
      );

      if (testUserAssociation) {
        console.log('📋 Asociación encontrada, aprobando...');
        
        // Aprobar la asociación
        const approveResponse = await axios.put(
          `${API_BASE_URL}/api/users/approve-association/${testUserAssociation._id}`,
          {},
          { headers: adminHeaders }
        );

        if (approveResponse.data.success) {
          console.log('✅ Asociación aprobada exitosamente');
        } else {
          console.log('❌ Error aprobando:', approveResponse.data.message);
        }
      } else {
        console.log('⚠️ No se encontró la asociación del usuario de prueba');
      }
    }

    console.log('');

    // 5. Intentar login nuevamente (debería funcionar)
    console.log('5️⃣ Intentando login después de aprobación...');
    try {
      const loginApprovedResponse = await axios.post(`${API_BASE_URL}/api/users/login`, {
        email: testEmail,
        password: 'test123'
      });
      
      if (loginApprovedResponse.data.success) {
        console.log('✅ CORRECTO: Usuario aprobado puede loguearse');
        console.log(`👤 Usuario: ${loginApprovedResponse.data.data.user.nombre}`);
        console.log(`🔑 Rol: ${loginApprovedResponse.data.data.user.role.nombre}`);
        console.log(`📋 Asociaciones: ${loginApprovedResponse.data.data.associations.length}`);
      } else {
        console.log('❌ Error en login después de aprobación:', loginApprovedResponse.data.message);
      }
    } catch (error) {
      console.log('❌ Error en login después de aprobación:', error.response?.data || error.message);
    }

    console.log('\n🎉 Pruebas completadas');

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

testSimpleLoginApproval(); 