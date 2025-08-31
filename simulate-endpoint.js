const mongoose = require('mongoose');
require('dotenv').config();

// Conectar a MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kiki-project');

// Importar modelos
const Asistencia = require('./shared/models/Asistencia');
const User = require('./shared/models/User');
const Role = require('./shared/models/Role');
const Account = require('./shared/models/Account');
const Grupo = require('./shared/models/Grupo');
const Student = require('./shared/models/Student');

async function simulateEndpoint() {
  try {
    console.log('🔍 [SIMULATE ENDPOINT] Simulando endpoint de backoffice asistencias...\n');

    // 1. Simular parámetros del request
    console.log('1️⃣ Simulando parámetros del request...');
    const params = {
      page: 1,
      limit: 10,
      fechaInicio: '2025-08-31',
      fechaFin: '2025-08-31'
    };
    console.log('   Parámetros:', params);

    // 2. Simular usuario (admin)
    console.log('\n2️⃣ Simulando usuario admin...');
    const user = await User.findOne({ email: 'admin@kiki.com.ar' }).populate('role');
    if (!user) {
      throw new Error('Usuario admin no encontrado');
    }
    console.log(`   Usuario: ${user.nombre}`);
    console.log(`   Rol: ${user.role?.nombre}`);

    // 3. Construir query base
    console.log('\n3️⃣ Construyendo query base...');
    let query = {};
    
    // Lógica según el rol
    if (user.role?.nombre === 'superadmin') {
      console.log('   Usuario es superadmin - puede ver todas las asistencias');
      // No agregar filtro de cuenta para superadmin
    } else if (user.role?.nombre === 'adminaccount') {
      console.log('   Usuario es adminaccount - filtrar por su cuenta');
      query.account = user.account?._id;
    } else {
      console.log('   Usuario no tiene permisos para backoffice');
      throw new Error('No tienes permisos para acceder a esta sección');
    }

    console.log('   Query base:', JSON.stringify(query, null, 2));

    // 4. Aplicar filtros de fecha
    console.log('\n4️⃣ Aplicando filtros de fecha...');
    if (params.fechaInicio && params.fechaFin) {
      console.log(`   Aplicando filtro de fechas: ${params.fechaInicio} a ${params.fechaFin}`);
      query.fecha = {
        $gte: params.fechaInicio,
        $lte: params.fechaFin
      };
    } else if (params.fechaInicio) {
      console.log(`   Aplicando filtro fecha inicio: ${params.fechaInicio}`);
      query.fecha = { $gte: params.fechaInicio };
    } else if (params.fechaFin) {
      console.log(`   Aplicando filtro fecha fin: ${params.fechaFin}`);
      query.fecha = { $lte: params.fechaFin };
    }

    console.log('   Query con fechas:', JSON.stringify(query, null, 2));
    console.log('   Query fecha específico:', JSON.stringify(query.fecha, null, 2));

    // 5. Ejecutar consulta
    console.log('\n5️⃣ Ejecutando consulta...');
    const total = await Asistencia.countDocuments(query);
    console.log(`   Total documentos: ${total}`);

    const skip = (parseInt(params.page) - 1) * parseInt(params.limit);
    console.log(`   Skip: ${skip}, Limit: ${params.limit}`);

    const asistencias = await Asistencia.find(query)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('creadoPor', 'nombre email')
      .populate('estudiantes.student', 'nombre apellido email')
      .sort({ fecha: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(params.limit))
      .lean();

    console.log(`   Asistencias encontradas: ${asistencias.length}`);

    // 6. Mostrar resultados
    console.log('\n6️⃣ Resultados:');
    console.log('=' .repeat(50));
    
    if (asistencias.length > 0) {
      asistencias.forEach((asistencia, index) => {
        console.log(`\n${index + 1}. Asistencia ID: ${asistencia._id}`);
        console.log(`   Fecha: ${asistencia.fecha}`);
        console.log(`   Account: ${asistencia.account?.nombre}`);
        console.log(`   Division: ${asistencia.division?.nombre}`);
        console.log(`   Estudiantes: ${asistencia.estudiantes?.length || 0}`);
      });
    } else {
      console.log('   No se encontraron asistencias');
    }

    // 7. Probar consulta sin filtros para comparar
    console.log('\n7️⃣ Comparando con consulta sin filtros...');
    const querySinFiltros = { ...query };
    delete querySinFiltros.fecha;
    
    console.log('   Query sin filtros de fecha:', JSON.stringify(querySinFiltros, null, 2));
    
    const totalSinFiltros = await Asistencia.countDocuments(querySinFiltros);
    const asistenciasSinFiltros = await Asistencia.find(querySinFiltros)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .lean();

    console.log(`   Total sin filtros: ${totalSinFiltros}`);
    console.log(`   Asistencias sin filtros: ${asistenciasSinFiltros.length}`);

    if (asistenciasSinFiltros.length > 0) {
      console.log('   Primera asistencia sin filtros:');
      console.log(`     Fecha: ${asistenciasSinFiltros[0].fecha}`);
      console.log(`     Account: ${asistenciasSinFiltros[0].account?.nombre}`);
    }

    // 8. Análisis del problema
    console.log('\n8️⃣ Análisis del problema:');
    console.log('=' .repeat(50));
    
    if (asistenciasSinFiltros.length > 0 && asistencias.length === 0) {
      console.log('❌ PROBLEMA IDENTIFICADO:');
      console.log('   - Hay asistencias sin filtros de fecha');
      console.log('   - No hay asistencias con filtros de fecha');
      console.log('   - El filtro de fecha está excluyendo todas las asistencias');
      
      console.log('\n🔍 Posibles causas:');
      console.log('   1. El formato de fecha en la BD no coincide con el filtro');
      console.log('   2. Hay espacios o caracteres ocultos en las fechas');
      console.log('   3. El filtro se está aplicando incorrectamente');
      
      // Probar filtro exacto
      const fechaExacta = asistenciasSinFiltros[0].fecha;
      console.log(`\n   Probando filtro exacto con fecha: "${fechaExacta}"`);
      const filtroExacto = await Asistencia.find({ fecha: fechaExacta }).lean();
      console.log(`   Resultados con filtro exacto: ${filtroExacto.length}`);
      
    } else if (asistenciasSinFiltros.length === asistencias.length) {
      console.log('✅ El filtro funciona correctamente');
    } else {
      console.log('⚠️ Resultado inesperado');
    }

  } catch (error) {
    console.error('\n❌ [SIMULATE ENDPOINT] Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

simulateEndpoint();
