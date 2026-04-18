const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000/api';

async function testMobileRegisterFlow() {
  try {
    console.log('🧪 Probando flujo de registro mobile sin auto-login...\n');

    // 1. Crear datos de prueba
    const timestamp = Date.now();
    const testUserData = {
      email: `test-mobile-register-${timestamp}@example.com`,
      password: 'password123',
      nombre: 'Test Mobile User',
      accountId: '688e2b6abd2f4269d06ce370', // ID de la cuenta de prueba
      userType: 'familiar',
      telefono: '1234567890'
    };

    console.log('1️⃣ Registrando usuario mobile...');
    console.log(`📧 Email: ${testUserData.email}`);
    console.log(`🏢 Account ID: ${testUserData.accountId}`);

    try {
      const registerResponse = await axios.post(`${API_BASE_URL}/users/register-mobile`, testUserData);
      
      if (registerResponse.data.success) {
        console.log('✅ Registro exitoso');
        console.log(`👤 Usuario: ${registerResponse.data.data.user.name}`);
        console.log(`🏢 Cuenta: ${registerResponse.data.data.account.nombre}`);
        console.log(`📋 Estado de asociación: ${registerResponse.data.data.association.status}`);
        
        // Verificar que NO hay token en la respuesta
        if (registerResponse.data.data.token) {
          console.log('❌ ERROR: La respuesta incluye un token (no debería)');
          console.log(`🔑 Token encontrado: ${registerResponse.data.data.token.substring(0, 20)}...`);
        } else {
          console.log('✅ Correcto: No hay token en la respuesta');
        }
      } else {
        console.log('❌ Error en registro:', registerResponse.data.message);
      }
    } catch (error) {
      console.log('❌ Error en registro:', error.response?.data || error.message);
    }

    console.log('');

    // 2. Intentar login con el usuario recién registrado (debería fallar por pendiente de aprobación)
    console.log('2️⃣ Intentando login con usuario recién registrado (debería fallar)...');
    
    try {
      const loginResponse = await axios.post(`${API_BASE_URL}/users/login`, {
        email: testUserData.email,
        password: testUserData.password
      });
      
      if (loginResponse.data.success) {
        console.log('❌ ERROR: Login exitoso (no debería ser posible)');
        console.log(`🔑 Token recibido: ${loginResponse.data.data.token.substring(0, 20)}...`);
      } else {
        console.log('✅ Correcto: Login rechazado');
        console.log(`📝 Mensaje: ${loginResponse.data.message}`);
        console.log(`🔢 Código: ${loginResponse.data.code}`);
      }
    } catch (error) {
      if (error.response?.status === 403) {
        console.log('✅ Correcto: Login rechazado con 403');
        console.log(`📝 Mensaje: ${error.response.data.message}`);
        console.log(`🔢 Código: ${error.response.data.code}`);
      } else {
        console.log('❌ Error inesperado en login:', error.response?.data || error.message);
      }
    }

    console.log('');

    // 3. Login como admin para aprobar el usuario
    console.log('3️⃣ Login como admin para aprobar el usuario...');
    
    try {
      const adminLogin = await axios.post(`${API_BASE_URL}/users/login`, {
        email: 'test@kiki.ar',
        password: 'admin123'
      });

      if (adminLogin.data.success) {
        console.log('✅ Admin logueado exitosamente');
        const adminToken = adminLogin.data.data.token;
        
        // 4. Obtener asociaciones pendientes
        console.log('4️⃣ Obteniendo asociaciones pendientes...');
        const pendingResponse = await axios.get(`${API_BASE_URL}/users/pending-associations`, {
          headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        if (pendingResponse.data.success) {
          const associations = pendingResponse.data.data; // Es directamente un array
          console.log(`📋 Asociaciones pendientes: ${associations?.length || 0}`);
          
          // Buscar la asociación del usuario de prueba
          const testAssociation = associations?.find(
            assoc => assoc.user.email === testUserData.email
          );

          if (testAssociation) {
            console.log('✅ Asociación de prueba encontrada');
            console.log(`🆔 ID: ${testAssociation._id}`);
            console.log(`📧 Usuario: ${testAssociation.user.email}`);
            console.log(`📋 Estado: ${testAssociation.status}`);

            // 5. Aprobar la asociación
            console.log('5️⃣ Aprobando asociación...');
            const approveResponse = await axios.put(
              `${API_BASE_URL}/users/approve-association/${testAssociation._id}`,
              {},
              { headers: { 'Authorization': `Bearer ${adminToken}` } }
            );

            if (approveResponse.data.success) {
              console.log('✅ Asociación aprobada exitosamente');
            } else {
              console.log('❌ Error aprobando asociación:', approveResponse.data.message);
            }
          } else {
            console.log('❌ Asociación de prueba no encontrada');
            console.log('📋 Asociaciones disponibles:');
            associations?.forEach((assoc, index) => {
              console.log(`   ${index + 1}. ${assoc.user.email} - ${assoc.status}`);
            });
          }
        } else {
          console.log('❌ Error obteniendo asociaciones pendientes:', pendingResponse.data.message);
        }
      } else {
        console.log('❌ Error login admin:', adminLogin.data.message);
      }
    } catch (error) {
      console.log('❌ Error en proceso de aprobación:', error.response?.data || error.message);
    }

    console.log('');

    // 6. Intentar login nuevamente (ahora debería funcionar)
    console.log('6️⃣ Intentando login después de aprobación (debería funcionar)...');
    
    try {
      const finalLoginResponse = await axios.post(`${API_BASE_URL}/users/login`, {
        email: testUserData.email,
        password: testUserData.password
      });
      
      if (finalLoginResponse.data.success) {
        console.log('✅ Login exitoso después de aprobación');
        console.log(`👤 Usuario: ${finalLoginResponse.data.data.user.name}`);
        console.log(`🔑 Token recibido: ${finalLoginResponse.data.data.token.substring(0, 20)}...`);
        console.log(`📋 Asociaciones: ${finalLoginResponse.data.data.associations.length}`);
      } else {
        console.log('❌ Login aún falla después de aprobación:', finalLoginResponse.data.message);
      }
    } catch (error) {
      console.log('❌ Error en login final:', error.response?.data || error.message);
    }

    console.log('\n🎉 Prueba de flujo de registro mobile completada');

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

testMobileRegisterFlow(); 