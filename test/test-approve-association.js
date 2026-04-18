const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function testApproveAssociation() {
  try {
    console.log('🧪 Probando aprobación de asociaciones...\n');

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

    // 2. Obtener asociaciones pendientes
    console.log('2️⃣ Obteniendo asociaciones pendientes...');
    const pendingResponse = await axios.get(`${API_BASE_URL}/api/users/pending-associations`, { headers });
    
    if (pendingResponse.data.data.length === 0) {
      console.log('📭 No hay asociaciones pendientes para aprobar');
      return;
    }

    console.log(`📊 Total asociaciones pendientes: ${pendingResponse.data.data.length}`);
    
    // Mostrar las primeras 3 asociaciones
    const associationsToTest = pendingResponse.data.data.slice(0, 3);
    associationsToTest.forEach((association, index) => {
      console.log(`   ${index + 1}. ID: ${association._id}`);
      console.log(`      Usuario: ${association.user.name} (${association.user.email})`);
      console.log(`      Cuenta: ${association.account.nombre} (${association.account.razonSocial})`);
      console.log(`      Rol: ${association.role.nombre}`);
      console.log('');
    });

    // 3. Probar aprobar la primera asociación
    const firstAssociation = associationsToTest[0];
    console.log('3️⃣ Probando aprobar asociación...');
    console.log(`📡 Haciendo request a: ${API_BASE_URL}/api/users/approve-association/${firstAssociation._id}`);
    console.log('');

    try {
      const approveResponse = await axios.put(
        `${API_BASE_URL}/api/users/approve-association/${firstAssociation._id}`, 
        {}, 
        { headers }
      );
      
      console.log('✅ Asociación aprobada exitosamente');
      console.log('📋 Respuesta:', approveResponse.data.message);
      console.log('📊 Datos actualizados:', {
        status: approveResponse.data.data.status,
        updatedAt: approveResponse.data.data.updatedAt
      });
      
    } catch (error) {
      console.log('❌ Error aprobando asociación:');
      console.log('   Status:', error.response?.status);
      console.log('   Message:', error.response?.data?.message || error.message);
      if (error.response?.data) {
        console.log('   Data:', JSON.stringify(error.response.data, null, 2));
      }
    }

    // 4. Verificar que la asociación ya no aparece en pendientes
    console.log('\n4️⃣ Verificando que la asociación ya no aparece en pendientes...');
    const updatedPendingResponse = await axios.get(`${API_BASE_URL}/api/users/pending-associations`, { headers });
    
    const stillPending = updatedPendingResponse.data.data.filter(
      assoc => assoc._id === firstAssociation._id
    );
    
    if (stillPending.length === 0) {
      console.log('✅ La asociación ya no aparece en pendientes (correcto)');
    } else {
      console.log('❌ La asociación aún aparece en pendientes');
    }

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

// Ejecutar la prueba
testApproveAssociation(); 