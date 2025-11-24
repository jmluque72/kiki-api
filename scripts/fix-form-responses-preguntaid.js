require('dotenv').config();
const mongoose = require('mongoose');
const FormRequest = require('../shared/models/FormRequest');
const FormResponse = require('../shared/models/FormResponse');

/**
 * Script para corregir respuestas de formularios que tienen preguntaId: undefined
 * Intenta inferir el preguntaId correcto basándose en el orden y tipo de pregunta
 */
async function fixFormResponsesPreguntaId() {
  try {
    console.log('🔍 Conectando a MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/microservices_db');
    console.log('✅ Conectado a MongoDB\n');

    // Buscar todas las respuestas de formularios
    console.log('📋 Buscando respuestas de formularios...');
    const allResponses = await FormResponse.find({})
      .populate('formRequest', 'preguntas')
      .lean();

    console.log(`📊 Total de respuestas encontradas: ${allResponses.length}\n`);

    let fixed = 0;
    let skipped = 0;
    let errors = 0;

    for (const response of allResponses) {
      try {
        if (!response.formRequest || !response.formRequest.preguntas) {
          console.log(`⚠️  Respuesta ${response._id}: FormRequest no encontrado o sin preguntas`);
          skipped++;
          continue;
        }

        const formRequest = response.formRequest;
        const preguntas = formRequest.preguntas;
        const respuestas = response.respuestas || [];

        // Debug: mostrar estructura de respuestas
        console.log(`\n🔍 Analizando respuesta ${response._id}...`);
        console.log(`   Respuestas encontradas: ${respuestas.length}`);
        respuestas.forEach((r, idx) => {
          console.log(`   Respuesta ${idx}: preguntaId=${r.preguntaId} (tipo: ${typeof r.preguntaId}), valor=${typeof r.valor === 'string' ? r.valor.substring(0, 50) + '...' : Array.isArray(r.valor) ? `[${r.valor.length} items]` : r.valor}`);
        });

        // Verificar si hay respuestas con preguntaId undefined o inválido
        const needsFix = respuestas.some(r => {
          if (!r.preguntaId) return true;
          if (r.preguntaId === 'undefined' || r.preguntaId === undefined || r.preguntaId === null) return true;
          if (typeof r.preguntaId === 'string' && r.preguntaId.toLowerCase() === 'undefined') return true;
          if (!mongoose.Types.ObjectId.isValid(r.preguntaId)) return true;
          return false;
        });

        if (!needsFix) {
          console.log(`   ✅ Todas las respuestas tienen preguntaId válido`);
          skipped++;
          continue;
        }
        
        console.log(`   ⚠️  Se encontraron respuestas que necesitan corrección`);

        console.log(`\n🔧 Procesando respuesta ${response._id}...`);
        console.log(`   Formulario: ${formRequest.nombre || formRequest._id}`);
        console.log(`   Preguntas en formulario: ${preguntas.length}`);
        console.log(`   Respuestas: ${respuestas.length}`);

        // Crear array de respuestas corregidas
        const fixedRespuestas = [];
        let respuestaIndex = 0;

        // Intentar mapear cada respuesta a una pregunta
        for (let i = 0; i < respuestas.length; i++) {
          const respuesta = respuestas[i];
          
          // Si ya tiene preguntaId válido, mantenerlo
          const hasValidPreguntaId = respuesta.preguntaId && 
              respuesta.preguntaId !== 'undefined' && 
              respuesta.preguntaId !== undefined &&
              respuesta.preguntaId !== null &&
              (typeof respuesta.preguntaId !== 'string' || respuesta.preguntaId.toLowerCase() !== 'undefined') &&
              mongoose.Types.ObjectId.isValid(respuesta.preguntaId);
              
          if (hasValidPreguntaId) {
            fixedRespuestas.push({
              preguntaId: new mongoose.Types.ObjectId(respuesta.preguntaId),
              valor: respuesta.valor
            });
            continue;
          }

          // Intentar encontrar la pregunta correcta
          let matchedPregunta = null;

          // Estrategia 1: Por orden (si la respuesta está en la misma posición que la pregunta)
          if (respuestaIndex < preguntas.length) {
            matchedPregunta = preguntas[respuestaIndex];
          }

          // Estrategia 2: Por tipo de valor
          // Si el valor es una URL de imagen, buscar pregunta tipo imagen
          if (!matchedPregunta && typeof respuesta.valor === 'string') {
            const isImageUrl = respuesta.valor.includes('http://') || 
                             respuesta.valor.includes('https://') ||
                             respuesta.valor.includes('form-requests/') ||
                             respuesta.valor.includes('uploads/');
            
            if (isImageUrl) {
              // Buscar pregunta tipo imagen que aún no tenga respuesta asignada
              const imagePreguntas = preguntas.filter(p => p.tipo === 'imagen');
              const usedPreguntaIds = fixedRespuestas.map(r => r.preguntaId.toString());
              matchedPregunta = imagePreguntas.find(p => !usedPreguntaIds.includes(p._id.toString()));
            }
          }

          // Estrategia 3: Si es un array, buscar pregunta tipo checkbox u opción múltiple
          if (!matchedPregunta && Array.isArray(respuesta.valor)) {
            const optionPreguntas = preguntas.filter(p => 
              p.tipo === 'checkbox' || p.tipo === 'opcion_multiple'
            );
            const usedPreguntaIds = fixedRespuestas.map(r => r.preguntaId.toString());
            matchedPregunta = optionPreguntas.find(p => !usedPreguntaIds.includes(p._id.toString()));
          }

          // Estrategia 4: Si es texto simple, buscar pregunta tipo texto
          if (!matchedPregunta && typeof respuesta.valor === 'string' && 
              !respuesta.valor.includes('http') && 
              !respuesta.valor.includes('form-requests/') &&
              !respuesta.valor.includes('uploads/')) {
            const textPreguntas = preguntas.filter(p => p.tipo === 'texto');
            const usedPreguntaIds = fixedRespuestas.map(r => r.preguntaId.toString());
            matchedPregunta = textPreguntas.find(p => !usedPreguntaIds.includes(p._id.toString()));
          }

          if (matchedPregunta) {
            fixedRespuestas.push({
              preguntaId: new mongoose.Types.ObjectId(matchedPregunta._id),
              valor: respuesta.valor
            });
            console.log(`   ✅ Respuesta ${i + 1} asignada a pregunta: "${matchedPregunta.texto.substring(0, 50)}..." (${matchedPregunta.tipo})`);
            respuestaIndex++;
          } else {
            console.log(`   ⚠️  Respuesta ${i + 1}: No se pudo encontrar pregunta correspondiente`);
            // Mantener la respuesta pero sin preguntaId (se marcará como error)
            fixedRespuestas.push({
              preguntaId: null,
              valor: respuesta.valor
            });
          }
        }

        // Verificar que todas las respuestas tengan preguntaId válido
        const hasInvalidIds = fixedRespuestas.some(r => !r.preguntaId);
        if (hasInvalidIds) {
          console.log(`   ❌ Algunas respuestas no pudieron ser asignadas a preguntas`);
          errors++;
          continue;
        }

        // Actualizar la respuesta en la base de datos
        await FormResponse.updateOne(
          { _id: response._id },
          { $set: { respuestas: fixedRespuestas } }
        );

        console.log(`   ✅ Respuesta ${response._id} corregida exitosamente`);
        fixed++;

      } catch (error) {
        console.error(`   ❌ Error procesando respuesta ${response._id}:`, error.message);
        errors++;
      }
    }

    console.log('\n📊 Resumen:');
    console.log(`   ✅ Corregidas: ${fixed}`);
    console.log(`   ⏭️  Omitidas (ya correctas): ${skipped}`);
    console.log(`   ❌ Errores: ${errors}`);

    if (fixed > 0) {
      console.log('\n✅ Migración completada. Las respuestas han sido corregidas.');
    } else {
      console.log('\nℹ️  No se encontraron respuestas que necesiten corrección.');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error en la migración:', error);
    process.exit(1);
  }
}

// Ejecutar migración
fixFormResponsesPreguntaId();

