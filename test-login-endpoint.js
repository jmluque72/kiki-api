const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000/api';

async function testLoginEndpoint() {
  try {
    console.log('🔍 Probando endpoint de login...\n');

    // 1. Probar login con credenciales correctas
    console.log('1. Probando login con credenciales correctas...');
    const loginResponse = await axios.post(`${API_BASE_URL}/users/login`, {
      email: 'coordinador@test.com',
      password: 'password123'
    });

    console.log('✅ Login exitoso');
    console.log('   - Success:', loginResponse.data.success);
    console.log('   - Message:', loginResponse.data.message);
    console.log('   - Token:', loginResponse.data.data?.token ? 'Presente' : 'Ausente');
    console.log('   - User:', loginResponse.data.data?.user?.name);

    // 2. Probar login con credenciales incorrectas
    console.log('\n2. Probando login con credenciales incorrectas...');
    try {
      await axios.post(`${API_BASE_URL}/users/login`, {
        email: 'coordinador@test.com',
        password: 'wrongpassword'
      });
    } catch (error) {
      console.log('✅ Correcto: Login rechazado con contraseña incorrecta');
      console.log('   - Status:', error.response?.status);
      console.log('   - Message:', error.response?.data?.message);
    }

    // 3. Probar login con email inexistente
    console.log('\n3. Probando login con email inexistente...');
    try {
      await axios.post(`${API_BASE_URL}/users/login`, {
        email: 'nonexistent@test.com',
        password: 'password123'
      });
    } catch (error) {
      console.log('✅ Correcto: Login rechazado con email inexistente');
      console.log('   - Status:', error.response?.status);
      console.log('   - Message:', error.response?.data?.message);
    }

  } catch (error) {
    console.error('❌ Error en test de login:', error.response?.data || error.message);
  }
}

testLoginEndpoint();
