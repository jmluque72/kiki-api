const axios = require('axios');
require('dotenv').config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function testSimpleFiltrado() {
  try {
    console.log('🧪 [TEST SIMPLE FILTRADO] Probando filtrado simple...\n');

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

    if (!sinFiltrosResponse.data.success) {
      throw new Error('Error sin filtros: ' + sinFiltrosResponse.data.message);
    }

    const asistenciasSinFiltros = sinFiltrosResponse.data.data;
    console.log(`✅ ${asistenciasSinFiltros.length} asistencias sin filtros`);

    if (asistenciasSinFiltros.length > 0) {
      console.log(`   Primera asistencia fecha: ${asistenciasSinFiltros[0].fecha}`);
    }

    // 3. Probar con filtro exacto
    console.log('\n3️⃣ Probando filtro exacto...');
    const fechaExacta = '2025-08-31';
    console.log(`   Fecha a buscar: ${fechaExacta}`);

    const filtroExactoResponse = await axios.get(`${API_BASE_URL}/api/backoffice/asistencias`, {
      headers: { 'Authorization': `Bearer ${token}` },
      params: { 
        page: 1, 
        limit: 10,
        fechaInicio: fechaExacta,
        fechaFin: fechaExacta
      }
    });

    if (!filtroExactoResponse.data.success) {
      throw new Error('Error con filtro: ' + filtroExactoResponse.data.message);
    }

    const asistenciasConFiltro = filtroExactoResponse.data.data;
    console.log(`✅ ${asistenciasConFiltro.length} asistencias con filtro`);

    // 4. Comparar resultados
    console.log('\n4️⃣ Comparando resultados...');
    console.log(`   Sin filtros: ${asistenciasSinFiltros.length}`);
    console.log(`   Con filtro: ${asistenciasConFiltro.length}`);
    
    if (asistenciasSinFiltros.length > 0 && asistenciasConFiltro.length === 0) {
      console.log('❌ PROBLEMA: Hay asistencias pero el filtro no las encuentra');
      console.log('   Esto indica un problema en el filtrado del backend');
    } else if (asistenciasSinFiltros.length === asistenciasConFiltro.length) {
      console.log('✅ CORRECTO: El filtro funciona correctamente');
    } else {
      console.log('⚠️ RESULTADO INESPERADO: Revisar lógica');
    }

    // 5. Mostrar detalles de la primera asistencia
    if (asistenciasSinFiltros.length > 0) {
      console.log('\n5️⃣ Detalles de la primera asistencia:');
      const primera = asistenciasSinFiltros[0];
      console.log(`   ID: ${primera._id}`);
      console.log(`   Fecha: ${primera.fecha}`);
      console.log(`   Tipo de fecha: ${typeof primera.fecha}`);
      console.log(`   Account: ${primera.account?.nombre}`);
      console.log(`   Division: ${primera.division?.nombre}`);
    }

  } catch (error) {
    console.error('\n❌ [TEST SIMPLE FILTRADO] Error:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('   El servidor no está corriendo en', API_BASE_URL);
    }
  }
}

testSimpleFiltrado();
