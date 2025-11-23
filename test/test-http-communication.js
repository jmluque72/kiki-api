const axios = require('axios');
require('dotenv').config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function testHttpCommunication() {
  try {
    console.log('🌐 [TEST HTTP COMMUNICATION] Verificando comunicación HTTP...\n');

    // 1. Login
    console.log('1️⃣ Login...');
    const loginResponse = await axios.post(`${API_BASE_URL}/api/users/login`, {
      email: 'admin@kiki.com.ar',
      password: 'admin123'
    });

    if (!loginResponse.data.success) {
      throw new Error('Error en login: ' + loginResponse.data.message);
    }

    const token = loginResponse.data.data.token;
    console.log('✅ Login exitoso');

    // 2. Probar sin filtros
    console.log('\n2️⃣ Probando sin filtros...');
    const sinFiltrosResponse = await axios.get(`${API_BASE_URL}/api/backoffice/asistencias`, {
      headers: { 'Authorization': `Bearer ${token}` },
      params: { page: 1, limit: 10 }
    });

    console.log('   URL sin filtros:', sinFiltrosResponse.config.url);
    console.log('   Parámetros sin filtros:', sinFiltrosResponse.config.params);
    console.log('   Status:', sinFiltrosResponse.status);
    console.log('   Asistencias:', sinFiltrosResponse.data.data?.length || 0);

    // 3. Probar con filtros
    console.log('\n3️⃣ Probando con filtros...');
    const params = {
      page: 1,
      limit: 10,
      fechaInicio: '2025-08-31',
      fechaFin: '2025-08-31'
    };

    console.log('   Parámetros a enviar:', params);

    const conFiltrosResponse = await axios.get(`${API_BASE_URL}/api/backoffice/asistencias`, {
      headers: { 'Authorization': `Bearer ${token}` },
      params: params
    });

    console.log('   URL con filtros:', conFiltrosResponse.config.url);
    console.log('   Parámetros recibidos:', conFiltrosResponse.config.params);
    console.log('   Status:', conFiltrosResponse.status);
    console.log('   Asistencias:', conFiltrosResponse.data.data?.length || 0);

    // 4. Comparar URLs
    console.log('\n4️⃣ Comparando URLs...');
    console.log('   URL sin filtros:', sinFiltrosResponse.config.url);
    console.log('   URL con filtros:', conFiltrosResponse.config.url);

    // 5. Verificar que los parámetros se envían correctamente
    console.log('\n5️⃣ Verificando parámetros...');
    const urlSinFiltros = new URL(sinFiltrosResponse.config.url);
    const urlConFiltros = new URL(conFiltrosResponse.config.url);

    console.log('   Parámetros en URL sin filtros:');
    urlSinFiltros.searchParams.forEach((value, key) => {
      console.log(`     ${key}: ${value}`);
    });

    console.log('   Parámetros en URL con filtros:');
    urlConFiltros.searchParams.forEach((value, key) => {
      console.log(`     ${key}: ${value}`);
    });

    // 6. Probar con diferentes formatos de parámetros
    console.log('\n6️⃣ Probando diferentes formatos...');
    
    // Formato 1: Query string manual
    const url1 = `${API_BASE_URL}/api/backoffice/asistencias?page=1&limit=10&fechaInicio=2025-08-31&fechaFin=2025-08-31`;
    console.log('   Probando URL manual:', url1);
    
    try {
      const response1 = await axios.get(url1, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('   Resultado URL manual:', response1.data.data?.length || 0);
    } catch (error) {
      console.log('   Error URL manual:', error.response?.status, error.response?.data?.message);
    }

    // Formato 2: Parámetros separados
    console.log('\n   Probando parámetros separados...');
    const response2 = await axios.get(`${API_BASE_URL}/api/backoffice/asistencias`, {
      headers: { 'Authorization': `Bearer ${token}` },
      params: {
        page: '1',
        limit: '10',
        fechaInicio: '2025-08-31',
        fechaFin: '2025-08-31'
      }
    });
    console.log('   Resultado parámetros separados:', response2.data.data?.length || 0);

    // 7. Resumen
    console.log('\n7️⃣ Resumen:');
    console.log('=' .repeat(50));
    
    const sinFiltros = sinFiltrosResponse.data.data?.length || 0;
    const conFiltros = conFiltrosResponse.data.data?.length || 0;
    
    console.log(`   Sin filtros: ${sinFiltros} asistencias`);
    console.log(`   Con filtros: ${conFiltros} asistencias`);
    
    if (sinFiltros > 0 && conFiltros === 0) {
      console.log('❌ PROBLEMA: Los parámetros no se están procesando correctamente');
      console.log('💡 Posibles causas:');
      console.log('   1. El servidor no está corriendo');
      console.log('   2. Los parámetros no llegan al endpoint');
      console.log('   3. Hay un problema en el procesamiento de parámetros');
    } else if (sinFiltros === conFiltros) {
      console.log('✅ CORRECTO: El filtrado funciona correctamente');
    } else {
      console.log('⚠️ RESULTADO INESPERADO');
    }

  } catch (error) {
    console.error('\n❌ [TEST HTTP COMMUNICATION] Error:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
      console.error('   URL:', error.response.config?.url);
      console.error('   Parámetros:', error.response.config?.params);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('   El servidor no está corriendo en', API_BASE_URL);
    }
  }
}

testHttpCommunication();
