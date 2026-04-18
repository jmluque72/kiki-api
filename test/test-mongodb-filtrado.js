const mongoose = require('mongoose');
require('dotenv').config();

// Conectar a MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kiki-project');

// Importar el modelo de Asistencia
const Asistencia = require('./shared/models/Asistencia');

async function testMongoDBFiltrado() {
  try {
    console.log('🔍 [TEST MONGODB FILTRADO] Probando filtrado directamente en MongoDB...\n');

    // 1. Obtener todas las asistencias
    console.log('1️⃣ Obteniendo todas las asistencias...');
    const todasLasAsistencias = await Asistencia.find({}).lean();
    console.log(`✅ ${todasLasAsistencias.length} asistencias encontradas`);

    if (todasLasAsistencias.length === 0) {
      console.log('❌ No hay asistencias para probar');
      return;
    }

    // 2. Mostrar la primera asistencia
    const primera = todasLasAsistencias[0];
    console.log('\n2️⃣ Primera asistencia:');
    console.log(`   ID: ${primera._id}`);
    console.log(`   Fecha: ${primera.fecha}`);
    console.log(`   Tipo: ${typeof primera.fecha}`);
    console.log(`   Account: ${primera.account}`);
    console.log(`   Division: ${primera.division}`);

    // 3. Probar filtrado exacto
    console.log('\n3️⃣ Probando filtrado exacto...');
    const fechaExacta = primera.fecha;
    console.log(`   Fecha a buscar: ${fechaExacta}`);

    const filtroExacto = await Asistencia.find({ fecha: fechaExacta }).lean();
    console.log(`   Resultados: ${filtroExacto.length}`);

    // 4. Probar filtrado con $gte y $lte
    console.log('\n4️⃣ Probando filtrado con $gte y $lte...');
    const filtroRango = await Asistencia.find({
      fecha: {
        $gte: fechaExacta,
        $lte: fechaExacta
      }
    }).lean();
    console.log(`   Resultados: ${filtroRango.length}`);

    // 5. Probar filtrado con regex
    console.log('\n5️⃣ Probando filtrado con regex...');
    const filtroRegex = await Asistencia.find({
      fecha: { $regex: fechaExacta }
    }).lean();
    console.log(`   Resultados: ${filtroRegex.length}`);

    // 6. Probar filtrado con $in
    console.log('\n6️⃣ Probando filtrado con $in...');
    const filtroIn = await Asistencia.find({
      fecha: { $in: [fechaExacta] }
    }).lean();
    console.log(`   Resultados: ${filtroIn.length}`);

    // 7. Verificar que todos los métodos devuelven el mismo resultado
    console.log('\n7️⃣ Verificando consistencia...');
    const resultados = [
      { nombre: 'Exacto', count: filtroExacto.length },
      { nombre: 'Rango', count: filtroRango.length },
      { nombre: 'Regex', count: filtroRegex.length },
      { nombre: 'In', count: filtroIn.length }
    ];

    const todosIguales = resultados.every(r => r.count === resultados[0].count);
    console.log(`   Todos los métodos devuelven el mismo resultado: ${todosIguales ? 'SÍ' : 'NO'}`);

    resultados.forEach(r => {
      console.log(`   ${r.nombre}: ${r.count}`);
    });

    // 8. Probar con una fecha que sabemos que existe
    console.log('\n8️⃣ Probando con fecha específica (2025-08-31)...');
    const fechaEspecifica = '2025-08-31';
    
    const filtroEspecifico = await Asistencia.find({ fecha: fechaEspecifica }).lean();
    console.log(`   Fecha: ${fechaEspecifica}`);
    console.log(`   Resultados: ${filtroEspecifico.length}`);

    if (filtroEspecifico.length > 0) {
      console.log(`   ✅ Encontrada asistencia con fecha ${fechaEspecifica}`);
      console.log(`   ID: ${filtroEspecifico[0]._id}`);
    } else {
      console.log(`   ❌ No se encontró asistencia con fecha ${fechaEspecifica}`);
    }

    // 9. Resumen
    console.log('\n9️⃣ Resumen:');
    console.log('=' .repeat(50));
    
    if (todosIguales && filtroExacto.length > 0) {
      console.log('✅ El filtrado en MongoDB funciona correctamente');
      console.log('✅ El problema debe estar en el endpoint del backend');
      console.log('💡 Posibles causas:');
      console.log('   - Parámetros no se están pasando correctamente');
      console.log('   - Query se está construyendo mal');
      console.log('   - Hay algún middleware que está interfiriendo');
    } else {
      console.log('❌ Hay inconsistencias en el filtrado de MongoDB');
      console.log('❌ Esto indica un problema más profundo');
    }

  } catch (error) {
    console.error('\n❌ [TEST MONGODB FILTRADO] Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

testMongoDBFiltrado();
