const axios = require('axios');
require('dotenv').config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function testBackofficeFechasFixed() {
  try {
    console.log('🧪 [TEST BACKOFFICE FECHAS FIXED] Probando filtrado de fechas corregido...\n');

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

    // 2. Probar filtrado por fecha específica (31 de agosto)
    console.log('\n2️⃣ Probando filtrado por fecha específica (31 de agosto)...');
    console.log('=' .repeat(80));
    
    const fechaEspecifica = '2025-08-31';
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

    // 3. Mostrar detalles de las asistencias encontradas
    if (asistenciasEspecifica.length > 0) {
      console.log('\n3️⃣ Detalles de las asistencias encontradas:');
      console.log('=' .repeat(80));
      
      asistenciasEspecifica.forEach((asistencia, index) => {
        console.log(`\n${index + 1}. Asistencia ID: ${asistencia._id}`);
        console.log(`   Fecha: ${asistencia.fecha}`);
        console.log(`   Fecha formateada: ${new Date(asistencia.fecha).toLocaleDateString('es-ES')}`);
        console.log(`   Cuenta: ${asistencia.account?.nombre || 'N/A'}`);
        console.log(`   División: ${asistencia.division?.nombre || 'N/A'}`);
        console.log(`   Estudiantes: ${asistencia.estudiantes?.length || 0}`);
        
        if (asistencia.estudiantes && asistencia.estudiantes.length > 0) {
          asistencia.estudiantes.forEach((estudiante, idx) => {
            const nombre = estudiante.student ? `${estudiante.student.nombre} ${estudiante.student.apellido}` : 'N/A';
            const estado = estudiante.presente ? 'presente' : 'ausente';
            console.log(`     ${idx + 1}. ${nombre} - ${estado}`);
          });
        }
      });
    }

    // 4. Probar con fecha de hoy
    console.log('\n4️⃣ Probando con fecha de hoy...');
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

    // 5. Probar sin filtros para comparar
    console.log('\n5️⃣ Probando sin filtros de fecha...');
    console.log('=' .repeat(80));

    const sinFiltrosResponse = await axios.get(`${API_BASE_URL}/api/backoffice/asistencias`, {
      headers: { 'Authorization': `Bearer ${token}` },
      params: {
        page: 1,
        limit: 50
      }
    });

    if (!sinFiltrosResponse.data.success) {
      throw new Error('Error obteniendo asistencias sin filtros: ' + sinFiltrosResponse.data.message);
    }

    const asistenciasSinFiltros = sinFiltrosResponse.data.data;
    console.log(`✅ ${asistenciasSinFiltros.length} asistencias totales sin filtros`);

    // 6. Análisis de fechas
    console.log('\n6️⃣ Análisis de fechas en todas las asistencias:');
    console.log('=' .repeat(80));

    const fechasUnicas = new Set();
    asistenciasSinFiltros.forEach(asistencia => {
      // La fecha ya es un string en formato YYYY-MM-DD, no necesitamos convertirla
      fechasUnicas.add(asistencia.fecha);
    });

    const fechasArray = Array.from(fechasUnicas).sort();
    console.log('Fechas únicas encontradas:');
    fechasArray.forEach((fecha, index) => {
      // Parsear la fecha string para mostrarla correctamente
      const [year, month, day] = fecha.split('-');
      const fechaLocal = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      console.log(`${index + 1}. ${fecha} (${fechaLocal.toLocaleDateString('es-ES')})`);
    });

    // 7. Verificar que el filtrado funciona correctamente
    console.log('\n7️⃣ Verificación del filtrado:');
    console.log('=' .repeat(80));

    let filtradoCorrecto = true;
    for (const fecha of fechasArray) {
      const filtroResponse = await axios.get(`${API_BASE_URL}/api/backoffice/asistencias`, {
        headers: { 'Authorization': `Bearer ${token}` },
        params: {
          page: 1,
          limit: 50,
          fechaInicio: fecha,
          fechaFin: fecha
        }
      });

      if (filtroResponse.data.success) {
        const asistenciasFiltradas = filtroResponse.data.data;
        const asistenciasEsperadas = asistenciasSinFiltros.filter(a => 
          a.fecha === fecha
        );

        if (asistenciasFiltradas.length !== asistenciasEsperadas.length) {
          console.log(`❌ Fecha ${fecha}: Esperadas ${asistenciasEsperadas.length}, Encontradas ${asistenciasFiltradas.length}`);
          filtradoCorrecto = false;
        } else {
          console.log(`✅ Fecha ${fecha}: ${asistenciasFiltradas.length} asistencias (correcto)`);
        }
      }
    }

    // 8. Resumen final
    console.log('\n8️⃣ Resumen final:');
    console.log('=' .repeat(80));

    console.log('\n🎉 [TEST BACKOFFICE FECHAS FIXED] ¡Prueba completada exitosamente!');
    console.log('\n📋 Resumen:');
    console.log(`   ✅ Total asistencias: ${asistenciasSinFiltros.length}`);
    console.log(`   ✅ Fechas únicas: ${fechasArray.length}`);
    console.log(`   ✅ Asistencias 31/08: ${asistenciasEspecifica.length}`);
    console.log(`   ✅ Asistencias hoy: ${asistenciasHoy.length}`);
    console.log(`   ✅ Filtrado correcto: ${filtradoCorrecto ? 'SÍ' : 'NO'}`);

    if (filtradoCorrecto) {
      console.log('\n✅ El problema de filtrado de fechas ha sido SOLUCIONADO');
      console.log('✅ Las fechas ahora se muestran y filtran correctamente');
      console.log('✅ El backoffice debería funcionar correctamente');
    } else {
      console.log('\n⚠️ Aún hay problemas con el filtrado de fechas');
      console.log('⚠️ Se requiere más investigación');
    }

  } catch (error) {
    console.error('\n❌ [TEST BACKOFFICE FECHAS FIXED] Error:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    
    console.log('\n💡 Posibles soluciones:');
    console.log('   1. Verificar que el servidor esté corriendo en', API_BASE_URL);
    console.log('   2. Verificar que existan asistencias en la base de datos');
    console.log('   3. Verificar que el usuario tenga permisos para acceder a las asistencias');
    console.log('   4. Revisar los logs del servidor para más detalles');
  }
}

testBackofficeFechasFixed();
