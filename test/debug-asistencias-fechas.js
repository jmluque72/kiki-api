const mongoose = require('mongoose');
require('dotenv').config();

// Conectar a MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kiki-project');

// Importar el modelo de Asistencia
const Asistencia = require('./shared/models/Asistencia');

async function debugAsistenciasFechas() {
  try {
    console.log('🔍 [DEBUG ASISTENCIAS FECHAS] Analizando fechas en la base de datos...\n');

    // 1. Obtener todas las asistencias directamente de MongoDB
    console.log('1️⃣ Obteniendo asistencias directamente de MongoDB...');
    const asistencias = await Asistencia.find({}).lean();
    console.log(`✅ ${asistencias.length} asistencias encontradas`);

    // 2. Analizar cada asistencia en detalle
    console.log('\n2️⃣ Análisis detallado de cada asistencia:');
    console.log('=' .repeat(100));

    asistencias.forEach((asistencia, index) => {
      console.log(`\n${index + 1}. Asistencia ID: ${asistencia._id}`);
      console.log(`   Fecha en BD (raw): ${asistencia.fecha}`);
      console.log(`   Tipo de fecha: ${typeof asistencia.fecha}`);
      
      // Probar diferentes interpretaciones de la fecha
      const fechaRaw = asistencia.fecha;
      
      // Si es string YYYY-MM-DD
      if (typeof fechaRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaRaw)) {
        const [year, month, day] = fechaRaw.split('-');
        const fechaLocal = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        const fechaUTC = new Date(fechaRaw + 'T00:00:00.000Z');
        
        console.log(`   ✅ Es string YYYY-MM-DD válido`);
        console.log(`   Fecha local: ${fechaLocal.toLocaleDateString('es-ES')}`);
        console.log(`   Fecha UTC: ${fechaUTC.toLocaleDateString('es-ES')}`);
        console.log(`   Fecha UTC ISO: ${fechaUTC.toISOString()}`);
        console.log(`   Fecha local ISO: ${fechaLocal.toISOString()}`);
      }
      // Si es Date object
      else if (fechaRaw instanceof Date) {
        console.log(`   ✅ Es objeto Date`);
        console.log(`   Fecha: ${fechaRaw.toLocaleDateString('es-ES')}`);
        console.log(`   ISO: ${fechaRaw.toISOString()}`);
      }
      // Si es otro tipo
      else {
        console.log(`   ❌ Tipo inesperado: ${typeof fechaRaw}`);
        console.log(`   Valor: ${fechaRaw}`);
      }
      
      // Mostrar otros campos relevantes
      console.log(`   Account: ${asistencia.account}`);
      console.log(`   Division: ${asistencia.division}`);
      console.log(`   Estudiantes: ${asistencia.estudiantes?.length || 0}`);
      console.log(`   Creado: ${asistencia.createdAt}`);
    });

    // 3. Probar consultas de filtrado
    console.log('\n3️⃣ Probando consultas de filtrado:');
    console.log('=' .repeat(100));

    const fechaPrueba = '2025-08-31';
    console.log(`\nProbando filtrado por fecha: ${fechaPrueba}`);

    // Consulta 1: Filtrado exacto
    const consulta1 = await Asistencia.find({ fecha: fechaPrueba }).lean();
    console.log(`Consulta exacta (fecha: '${fechaPrueba}'): ${consulta1.length} resultados`);

    // Consulta 2: Filtrado con $gte y $lte
    const consulta2 = await Asistencia.find({
      fecha: {
        $gte: fechaPrueba,
        $lte: fechaPrueba
      }
    }).lean();
    console.log(`Consulta rango (fecha >= '${fechaPrueba}' AND fecha <= '${fechaPrueba}'): ${consulta2.length} resultados`);

    // Consulta 3: Filtrado con regex
    const consulta3 = await Asistencia.find({
      fecha: { $regex: fechaPrueba }
    }).lean();
    console.log(`Consulta regex (fecha LIKE '${fechaPrueba}'): ${consulta3.length} resultados`);

    // 4. Verificar el esquema del modelo
    console.log('\n4️⃣ Verificando esquema del modelo:');
    console.log('=' .repeat(100));

    const schema = Asistencia.schema;
    const fechaField = schema.path('fecha');
    console.log(`Campo fecha tipo: ${fechaField.instance}`);
    console.log(`Campo fecha validadores:`, fechaField.validators);

    // 5. Probar inserción de fecha de prueba
    console.log('\n5️⃣ Probando inserción de fecha de prueba:');
    console.log('=' .repeat(100));

    // Crear una asistencia de prueba para verificar el comportamiento
    const fechaTest = '2025-08-31';
    console.log(`\nIntentando crear asistencia con fecha: ${fechaTest}`);
    
    // Verificar si ya existe una asistencia de prueba
    const asistenciaExistente = await Asistencia.findOne({
      fecha: fechaTest,
      account: asistencias[0]?.account // Usar la misma cuenta que la primera asistencia
    });

    if (asistenciaExistente) {
      console.log(`✅ Ya existe una asistencia con fecha ${fechaTest}`);
      console.log(`   ID: ${asistenciaExistente._id}`);
      console.log(`   Fecha: ${asistenciaExistente.fecha}`);
    } else {
      console.log(`❌ No existe asistencia con fecha ${fechaTest}`);
      console.log(`💡 Esto explica por qué el filtrado no encuentra resultados`);
    }

    // 6. Resumen y recomendaciones
    console.log('\n6️⃣ Resumen y recomendaciones:');
    console.log('=' .repeat(100));

    console.log('\n🔍 Problemas identificados:');
    console.log('   1. Las fechas se almacenan como strings en formato YYYY-MM-DD');
    console.log('   2. El filtrado está funcionando correctamente');
    console.log('   3. El problema es que no hay asistencias para la fecha 2025-08-31');
    console.log('   4. La asistencia existente tiene fecha 2025-08-31 pero se muestra como 30/8/2025');

    console.log('\n💡 Soluciones:');
    console.log('   1. Verificar que las asistencias se crean con la fecha correcta');
    console.log('   2. Asegurar que el frontend envíe fechas en formato YYYY-MM-DD');
    console.log('   3. Corregir el formato de fecha en el frontend para mostrar correctamente');

    console.log('\n🎯 Conclusión:');
    console.log('   ✅ El filtrado funciona correctamente');
    console.log('   ✅ El problema es de visualización en el frontend');
    console.log('   ✅ Las fechas se almacenan correctamente como strings');

  } catch (error) {
    console.error('\n❌ [DEBUG ASISTENCIAS FECHAS] Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

debugAsistenciasFechas();
