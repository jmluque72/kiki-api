const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function testLoginApproval() {
  try {
    console.log('🧪 Probando nueva lógica de login con verificación de aprobación...\n');

    // 1. Crear un usuario de prueba para mobile
    console.log('1️⃣ Registrando usuario mobile de prueba...');
    const timestamp = Date.now();
    const testEmail = `test-mobile-approval-${timestamp}@example.com`;
    
    const registerResponse = await axios.post(`${API_BASE_URL}/api/users/register-mobile`, {
      email: testEmail,
      password: 'test123',
      nombre: 'Test Mobile Approval',
      accountId: '688e2b6abd2f4269d06ce370', // ID de la cuenta de test
      userType: 'colaborador',
      telefono: '123456789',
      direccion: 'Calle Test 123',
      fechaNacimiento: '1990-01-01',
      genero: 'masculino'
    });

    if (registerResponse.data.success) {
      console.log('✅ Usuario mobile registrado exitosamente');
      console.log(`👤 Usuario: ${registerResponse.data.data.user.name}`);
      console.log(`📧 Email: ${registerResponse.data.data.user.email}`);
      console.log(`🏢 Cuenta: ${registerResponse.data.data.account.nombre}`);
      console.log(`📋 Estado asociación: ${registerResponse.data.data.association.status}`);
      console.log(`🔑 Token generado: ${registerResponse.data.data.token ? 'SÍ' : 'NO'}`);
      console.log('');
    } else {
      console.log('❌ Error en registro:', registerResponse.data.message);
      return;
    }

    // 2. Intentar login con usuario pendiente de aprobación
    console.log('2️⃣ Intentando login con usuario pendiente de aprobación...');
    try {
      const loginPendingResponse = await axios.post(`${API_BASE_URL}/api/users/login`, {
        email: testEmail,
        password: 'test123'
      });
      
      console.log('❌ ERROR: El usuario pendiente NO debería poder loguearse');
      console.log('Respuesta inesperada:', loginPendingResponse.data);
    } catch (error) {
      if (error.response?.status === 403) {
        console.log('✅ CORRECTO: Usuario pendiente bloqueado de login');
        console.log(`📝 Mensaje: ${error.response.data.message}`);
        console.log(`🔑 Código: ${error.response.data.code}`);
      } else {
        console.log('❌ Error inesperado:', error.response?.data || error.message);
      }
    }

    console.log('');

    // 3. Aprobar la asociación del usuario
    console.log('3️⃣ Aprobando asociación del usuario...');
    
    // Primero login como adminaccount para poder aprobar
    const adminLogin = await axios.post(`${API_BASE_URL}/api/users/login`, {
      email: 'test@kiki.ar',
      password: 'admin123'
    });

    if (adminLogin.data.success) {
      const adminToken = adminLogin.data.data.token;
      const adminHeaders = {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      };

      // Obtener asociaciones pendientes
      const pendingAssociationsResponse = await axios.get(`${API_BASE_URL}/api/users/pending-associations`, { headers: adminHeaders });
      
      if (pendingAssociationsResponse.data.success && pendingAssociationsResponse.data.data.associations && pendingAssociationsResponse.data.data.associations.length > 0) {
        // Buscar la asociación del usuario de prueba
        const testUserAssociation = pendingAssociationsResponse.data.data.associations.find(
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
            console.log('❌ Error aprobando asociación:', approveResponse.data.message);
          }
        } else {
          console.log('⚠️ No se encontró la asociación del usuario de prueba');
        }
      } else {
        console.log('⚠️ No hay asociaciones pendientes');
      }
    } else {
      console.log('❌ Error login admin:', adminLogin.data.message);
    }

    console.log('');

    // 4. Intentar login nuevamente después de la aprobación
    console.log('4️⃣ Intentando login después de la aprobación...');
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
        
        // Mostrar detalles de las asociaciones
        loginApprovedResponse.data.data.associations.forEach((assoc, index) => {
          console.log(`   ${index + 1}. ${assoc.account.nombre} - Estado: ${assoc.status}`);
        });
      } else {
        console.log('❌ Error en login después de aprobación:', loginApprovedResponse.data.message);
      }
    } catch (error) {
      console.log('❌ Error en login después de aprobación:', error.response?.data || error.message);
    }

    console.log('');

    // 5. Probar con usuario que no tiene asociaciones
    console.log('5️⃣ Probando login con usuario sin asociaciones...');
    try {
      const loginNoAssociationsResponse = await axios.post(`${API_BASE_URL}/api/users/login`, {
        email: 'admin@kiki.ar',
        password: 'admin123'
      });
      
      if (loginNoAssociationsResponse.data.success) {
        console.log('✅ Superadmin puede loguearse (no necesita asociaciones)');
        console.log(`👤 Usuario: ${loginNoAssociationsResponse.data.data.user.nombre}`);
        console.log(`🔑 Rol: ${loginNoAssociationsResponse.data.data.user.role.nombre}`);
      } else {
        console.log('❌ Error login superadmin:', loginNoAssociationsResponse.data.message);
      }
    } catch (error) {
      console.log('❌ Error login superadmin:', error.response?.data || error.message);
    }

    console.log('\n🎉 Pruebas de login con verificación de aprobación completadas');

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

// Ejecutar la prueba
testLoginApproval(); 