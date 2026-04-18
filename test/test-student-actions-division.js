const mongoose = require('mongoose');
require('dotenv').config();
const config = require('./config/database');

// Modelos
const StudentActionLog = require('./shared/models/StudentActionLog');
const Grupo = require('./shared/models/Group');
const Student = require('./shared/models/Student');
const StudentAction = require('./shared/models/StudentAction');
const User = require('./shared/models/User');

async function testStudentActions() {
  try {
    // Conectar a MongoDB
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Conectado a MongoDB\n');

    // Buscar todas las divisiones para encontrar "SALA ROJA"
    console.log('🔍 Buscando divisiones...');
    const divisions = await Grupo.find({}).select('_id nombre cuenta');
    
    console.log(`📋 Encontradas ${divisions.length} divisiones:`);
    divisions.forEach(div => {
      console.log(`   - ${div.nombre} (ID: ${div._id}, Cuenta: ${div.cuenta})`);
    });

    // Buscar "División de Prueba" que tiene las acciones del 31
    let salaRoja = divisions.find(d => 
      d._id.toString() === '68dc5f9e626391464e2bcbba'
    );

    // Si no se encuentra, buscar "SALA ROJA" o "Sala Roja"
    if (!salaRoja) {
      salaRoja = divisions.find(d => 
        d.nombre.toLowerCase().includes('roja') || 
        d.nombre.toLowerCase().includes('rojo')
      );
    }

    // Si no se encuentra, usar la primera división que no sea "División de Prueba"
    if (!salaRoja) {
      salaRoja = divisions.find(d => !d.nombre.toLowerCase().includes('prueba'));
    }

    // Si aún no hay, usar la primera división
    if (!salaRoja && divisions.length > 0) {
      salaRoja = divisions[0];
    }

    if (!salaRoja) {
      console.log('\n❌ No se encontró ninguna división');
      return;
    }

    console.log(`\n✅ Usando división: ${salaRoja.nombre} (ID: ${salaRoja._id})`);

    // Fecha: 31 de octubre de 2025 (asumiendo año actual)
    const year = 2025;
    const month = 10; // Octubre (0-indexed sería 9, pero aquí usamos formato YYYY-MM-DD)
    const day = 31;
    const fecha = `${year}-${month}-${day}`;

    console.log(`\n📅 Buscando acciones para la fecha: ${fecha}`);

    // Crear fechas en UTC para el filtro
    const startDate = new Date(fecha + 'T00:00:00.000Z');
    const endDate = new Date(fecha + 'T23:59:59.999Z');

    console.log(`   Desde: ${startDate.toISOString()}`);
    console.log(`   Hasta: ${endDate.toISOString()}\n`);

    // PRIMERO: Buscar TODAS las acciones registradas (sin filtro, sin populate primero)
    console.log('\n🔍 Buscando TODAS las acciones registradas en el sistema...');
    const allSystemActionsRaw = await StudentActionLog.find({})
    .sort({ fechaAccion: -1 })
    .limit(50)
    .lean();
    
    console.log(`📊 Total de acciones en el sistema (primeras 50): ${allSystemActionsRaw.length}`);

    if (allSystemActionsRaw.length > 0) {
      console.log('\n📋 Todas las acciones encontradas (IDs de división):');
      const divisionIds = new Set();
      allSystemActionsRaw.forEach((action) => {
        divisionIds.add(action.division?.toString());
        const actionDate = new Date(action.fechaAccion);
        const dateStr = actionDate.toISOString().split('T')[0];
        const timeStr = actionDate.toTimeString().split(' ')[0];
        console.log(`   - División ID: ${action.division} | Estudiante: ${action.estudiante} | Acción: ${action.accion} | ${dateStr} ${timeStr} | ID: ${action._id}`);
      });

      // Obtener nombres de divisiones
      const divisionIdsArray = Array.from(divisionIds).filter(id => id);
      const divisionsMap = {};
      if (divisionIdsArray.length > 0) {
        const divisionDocs = await Grupo.find({ _id: { $in: divisionIdsArray } }).lean();
        divisionDocs.forEach(div => {
          divisionsMap[div._id.toString()] = div.nombre;
        });
      }

      // Buscar acciones del 31 de octubre en cualquier división
      const oct31Actions = allSystemActionsRaw.filter(action => {
        const actionDate = new Date(action.fechaAccion);
        const dateStr = actionDate.toISOString().split('T')[0];
        return dateStr === '2025-10-31' || dateStr === '2025-10-30' || dateStr === '2025-11-01';
      });

      console.log(`\n📅 Acciones alrededor del 31 de octubre (2025-10-30, 2025-10-31, 2025-11-01): ${oct31Actions.length}`);
      if (oct31Actions.length > 0) {
        oct31Actions.forEach((action, index) => {
          const actionDate = new Date(action.fechaAccion);
          const dateStr = actionDate.toISOString().split('T')[0];
          const divName = divisionsMap[action.division?.toString()] || action.division?.toString() || 'Sin división';
          console.log(`   ${index + 1}. División: ${divName} (${action.division}) | Fecha: ${dateStr} | ID: ${action._id}`);
        });
      }
    }

    // Buscar todas las acciones de esta división (sin filtro de fecha primero)
    const allActions = await StudentActionLog.find({
      division: salaRoja._id
    })
    .populate('estudiante', 'nombre apellido')
    .populate('accion', 'nombre')
    .populate('division', 'nombre')
    .sort({ fechaAccion: -1 });

    console.log(`\n📊 Total de acciones en ${salaRoja.nombre}: ${allActions.length}`);

    if (allActions.length > 0) {
      console.log('\n📋 Primeras 10 acciones (sin filtro de fecha):');
      allActions.slice(0, 10).forEach((action, index) => {
        const actionDate = new Date(action.fechaAccion);
        const dateStr = actionDate.toISOString().split('T')[0];
        const timeStr = actionDate.toTimeString().split(' ')[0];
        console.log(`   ${index + 1}. ${action.accion?.nombre || 'N/A'} - ${action.estudiante?.nombre || 'N/A'} - ${dateStr} ${timeStr}`);
      });
    }

    // Buscar acciones con filtro de fecha
    const filteredActions = await StudentActionLog.find({
      division: salaRoja._id,
      fechaAccion: {
        $gte: startDate,
        $lte: endDate
      }
    })
    .populate('estudiante', 'nombre apellido')
    .populate('accion', 'nombre color')
    .populate('division', 'nombre')
    .populate('registradoPor', 'name email')
    .sort({ fechaAccion: -1 });

    console.log(`\n✅ Acciones encontradas para ${fecha}: ${filteredActions.length}`);

    if (filteredActions.length > 0) {
      console.log('\n📋 Detalles de las acciones:');
      filteredActions.forEach((action, index) => {
        const actionDate = new Date(action.fechaAccion);
        const dateStr = actionDate.toISOString().split('T')[0];
        const timeStr = actionDate.toTimeString().split(' ')[0];
        console.log(`\n   ${index + 1}. ${action.accion?.nombre || 'N/A'}`);
        console.log(`      Estudiante: ${action.estudiante?.nombre || 'N/A'} ${action.estudiante?.apellido || ''}`);
        console.log(`      Fecha: ${dateStr} ${timeStr}`);
        console.log(`      Registrado por: ${action.registradoPor?.name || 'N/A'} (${action.registradoPor?.email || 'N/A'})`);
        console.log(`      Comentarios: ${action.comentarios || 'Sin comentarios'}`);
        console.log(`      Estado: ${action.estado}`);
        console.log(`      ID: ${action._id}`);
      });
    } else {
      console.log('\n⚠️ No se encontraron acciones para esta fecha con el filtro UTC');
      
      // Intentar con filtro de fecha local para comparar
      const startDateLocal = new Date(fecha);
      startDateLocal.setHours(0, 0, 0, 0);
      const endDateLocal = new Date(fecha);
      endDateLocal.setHours(23, 59, 59, 999);

      console.log(`\n🔄 Intentando con filtro local:`);
      console.log(`   Desde: ${startDateLocal.toISOString()}`);
      console.log(`   Hasta: ${endDateLocal.toISOString()}`);

      const localFilteredActions = await StudentActionLog.find({
        division: salaRoja._id,
        fechaAccion: {
          $gte: startDateLocal,
          $lte: endDateLocal
        }
      })
      .populate('estudiante', 'nombre apellido')
      .populate('accion', 'nombre')
      .sort({ fechaAccion: -1 });

      console.log(`   Resultado: ${localFilteredActions.length} acciones encontradas`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

// Ejecutar el test
testStudentActions();

