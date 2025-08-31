const axios = require('axios');
require('dotenv').config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function testBackofficeAsistenciasFechas() {
  try {
    console.log('🧪 [TEST BACKOFFICE ASISTENCIAS FECHAS] Probando filtrado de fechas...\n');

    // 1. Login para obtener token
    console.log('1️⃣ Iniciando sesión...');
    const loginResponse = await axios.post(`${API_BASE_URL}/api/users/login`, {
      email: 'admin@kiki.com.ar',
      password: 'admin123'
    });

    if (!loginResponse.data.success) {
      throw new Error('Error en login: ' + loginResponse.data.message);
    }

    const token = loginResponse.data.data.token;
    console.log('✅ Login exitoso');

    // 2. Obtener todas las asistencias sin filtros
    console.log('\n2️⃣ Obteniendo todas las asistencias...');
    const allAsistenciasResponse = await axios.get(`${API_BASE_URL}/api/backoffice/asistencias`, {
      headers: { 'Authorization': `Bearer ${token}` },
      params: {
        page: 1,
        limit: 50
      }
    });

    if (!allAsistenciasResponse.data.success) {
      throw new Error('Error obteniendo asistencias: ' + allAsistenciasResponse.data.message);
    }

    const allAsistencias = allAsistenciasResponse.data.data;
    console.log(`✅ ${allAsistencias.length} asistencias obtenidas`);

    // 3. Analizar fechas de las asistencias
    console.log('\n3️⃣ Analizando fechas de asistencias:');
    console.log('=' .repeat(80));

    const fechasUnicas = new Set();
    const fechasConFormato = [];

    allAsistencias.forEach((asistencia, index) => {
      const fechaOriginal = asistencia.fecha;
      const fechaDate = new Date(fechaOriginal);
      const fechaISO = fechaDate.toISOString();
      const fechaLocal = fechaDate.toLocaleDateString('es-ES');
      const fechaYYYYMMDD = fechaDate.toISOString().split('T')[0];

      fechasUnicas.add(fechaYYYYMMDD);
      fechasConFormato.push({
        index: index + 1,
        fechaOriginal,
        fechaDate: fechaDate.toString(),
        fechaISO,
        fechaLocal,
        fechaYYYYMMDD
      });

      console.log(`\n${index + 1}. Asistencia ID: ${asistencia._id}`);
      console.log(`   Fecha original: ${fechaOriginal}`);
      console.log(`   Fecha Date: ${fechaDate.toString()}`);
      console.log(`   Fecha ISO: ${fechaISO}`);
      console.log(`   Fecha Local: ${fechaLocal}`);
      console.log(`   Fecha YYYY-MM-DD: ${fechaYYYYMMDD}`);
    });

    // 4. Mostrar fechas únicas
    console.log('\n4️⃣ Fechas únicas encontradas:');
    console.log('=' .repeat(80));
    const fechasArray = Array.from(fechasUnicas).sort();
    fechasArray.forEach((fecha, index) => {
      console.log(`${index + 1}. ${fecha}`);
    });

    // 5. Probar filtrado por fecha específica
    if (fechasArray.length > 0) {
      const fechaPrueba = fechasArray[0]; // Primera fecha disponible
      console.log(`\n5️⃣ Probando filtrado por fecha: ${fechaPrueba}`);
      console.log('=' .repeat(80));

      const filtroResponse = await axios.get(`${API_BASE_URL}/api/backoffice/asistencias`, {
        headers: { 'Authorization': `Bearer ${token}` },
        params: {
          page: 1,
          limit: 50,
          fechaInicio: fechaPrueba,
          fechaFin: fechaPrueba
        }
      });

      if (!filtroResponse.data.success) {
        throw new Error('Error en filtrado: ' + filtroResponse.data.message);
      }

      const asistenciasFiltradas = filtroResponse.data.data;
      console.log(`✅ ${asistenciasFiltradas.length} asistencias encontradas para ${fechaPrueba}`);

      // Verificar que todas las fechas coinciden
      const fechasFiltradas = asistenciasFiltradas.map(a => new Date(a.fecha).toISOString().split('T')[0]);
      const todasCoinciden = fechasFiltradas.every(f => f === fechaPrueba);
      console.log(`✅ Todas las fechas coinciden: ${todasCoinciden}`);
    }

    // 6. Probar con fecha de hoy
    console.log('\n6️⃣ Probando con fecha de hoy...');
    console.log('=' .repeat(80));
    
    const hoy = new Date().toISOString().split('T')[0];
    console.log(`Fecha de hoy (YYYY-MM-DD): ${hoy}`);

    const hoyResponse = await axios.get(`${API_BASE_URL}/api/backoffice/asistencias`, {
      headers: { 'Authorization': `Bearer ${token}` },
      params: {
        page: 1,
        limit: 50,
        fechaInicio: hoy,
        fechaFin: hoy
      }
    });

    if (!hoyResponse.data.success) {
      throw new Error('Error en filtrado de hoy: ' + hoyResponse.data.message);
    }

    const asistenciasHoy = hoyResponse.data.data;
    console.log(`✅ ${asistenciasHoy.length} asistencias encontradas para hoy (${hoy})`);

    // 7. Probar con fecha específica mencionada por el usuario (31)
    console.log('\n7️⃣ Probando con fecha específica (31 de agosto)...');
    console.log('=' .repeat(80));
    
    const fechaEspecifica = '2025-08-31'; // 31 de agosto
    console.log(`Fecha específica: ${fechaEspecifica}`);

    const especificaResponse = await axios.get(`${API_BASE_URL}/api/backoffice/asistencias`, {
      headers: { 'Authorization': `Bearer ${token}` },
      params: {
        page: 1,
        limit: 50,
        fechaInicio: fechaEspecifica,
        fechaFin: fechaEspecifica
      }
    });

    if (!especificaResponse.data.success) {
      throw new Error('Error en filtrado específico: ' + especificaResponse.data.message);
    }

    const asistenciasEspecifica = especificaResponse.data.data;
    console.log(`✅ ${asistenciasEspecifica.length} asistencias encontradas para ${fechaEspecifica}`);

    // 8. Análisis de problemas potenciales
    console.log('\n8️⃣ Análisis de problemas potenciales:');
    console.log('=' .repeat(80));

    console.log('\n🔍 Problemas identificados:');
    
    // Verificar si hay fechas en formato incorrecto
    const fechasConProblemas = fechasConFormato.filter(f => {
      const fecha = new Date(f.fechaOriginal);
      return isNaN(fecha.getTime());
    });

    if (fechasConProblemas.length > 0) {
      console.log('❌ Fechas con formato incorrecto:');
      fechasConProblemas.forEach(f => {
        console.log(`   - ${f.fechaOriginal}`);
      });
    } else {
      console.log('✅ Todas las fechas tienen formato válido');
    }

    // Verificar zona horaria
    console.log('\n🌍 Información de zona horaria:');
    console.log(`   Zona horaria del servidor: ${new Date().getTimezoneOffset() / -60} horas`);
    console.log(`   Fecha actual del servidor: ${new Date().toISOString()}`);
    console.log(`   Fecha local del servidor: ${new Date().toLocaleDateString('es-ES')}`);

    // 9. Recomendaciones
    console.log('\n9️⃣ Recomendaciones:');
    console.log('=' .repeat(80));

    console.log('\n💡 Para solucionar problemas de fechas:');
    console.log('   1. Verificar que las fechas se almacenan en formato ISO en MongoDB');
    console.log('   2. Asegurar que el filtrado use el mismo formato de fecha');
    console.log('   3. Considerar zona horaria en el procesamiento de fechas');
    console.log('   4. Validar que las fechas se envían en formato YYYY-MM-DD desde el frontend');

    console.log('\n🎉 [TEST BACKOFFICE ASISTENCIAS FECHAS] ¡Prueba completada exitosamente!');
    console.log('\n📋 Resumen:');
    console.log(`   ✅ Total asistencias: ${allAsistencias.length}`);
    console.log(`   ✅ Fechas únicas: ${fechasArray.length}`);
    console.log(`   ✅ Asistencias hoy: ${asistenciasHoy.length}`);
    console.log(`   ✅ Asistencias 31/08: ${asistenciasEspecifica.length}`);

  } catch (error) {
    console.error('\n❌ [TEST BACKOFFICE ASISTENCIAS FECHAS] Error:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    
    console.log('\n💡 Posibles soluciones:');
    console.log('   1. Verificar que el servidor esté corriendo en', API_BASE_URL);
    console.log('   2. Verificar que existan asistencias en la base de datos');
    console.log('   3. Verificar que el usuario tenga permisos para acceder a las asistencias');
    console.log('   4. Revisar el formato de fechas en la base de datos');
  }
}

testBackofficeAsistenciasFechas();
