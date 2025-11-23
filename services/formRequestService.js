const FormRequest = require('../shared/models/FormRequest');
const FormResponse = require('../shared/models/FormResponse');
const FormDivisionAssociation = require('../shared/models/FormDivisionAssociation');
const Student = require('../shared/models/Student');
const Shared = require('../shared/models/Shared');
const mongoose = require('mongoose');

/**
 * Crear un nuevo formulario
 * @param {Object} data - Datos del formulario
 * @param {String} data.nombre - Nombre del formulario
 * @param {String} data.descripcion - Descripción del formulario
 * @param {String} data.account - ID de la cuenta
 * @param {String} data.createdBy - ID del usuario que crea
 * @param {String} data.status - Estado (borrador/publicado)
 * @param {Array} data.preguntas - Array de preguntas
 * @returns {Promise<Object>} Formulario creado
 */
async function createFormRequest(data) {
  try {
    const { nombre, descripcion, account, createdBy, status = 'borrador', preguntas } = data;

    if (!preguntas || preguntas.length === 0) {
      throw new Error('El formulario debe tener al menos una pregunta');
    }

    // Validar que todas las preguntas tengan orden
    preguntas.forEach((pregunta, index) => {
      if (pregunta.orden === undefined || pregunta.orden === null) {
        pregunta.orden = index;
      }
    });

    const formRequest = new FormRequest({
      nombre,
      descripcion,
      account,
      createdBy,
      status,
      preguntas
    });

    await formRequest.save();
    await formRequest.populate('account', 'nombre razonSocial');
    await formRequest.populate('createdBy', 'name email');
    return formRequest;
  } catch (error) {
    throw new Error(`Error al crear formulario: ${error.message}`);
  }
}

/**
 * Actualizar un formulario existente
 * @param {String} formId - ID del formulario
 * @param {Object} data - Datos a actualizar
 * @returns {Promise<Object>} Formulario actualizado
 */
async function updateFormRequest(formId, data) {
  try {
    const formRequest = await FormRequest.findById(formId);
    if (!formRequest) {
      throw new Error('Formulario no encontrado');
    }

    // Verificar si se están modificando las preguntas o el nombre/descripción
    const isModifyingForm = data.preguntas !== undefined || 
                            data.nombre !== undefined || 
                            data.descripcion !== undefined;

    if (data.preguntas) {
      // Validar que todas las preguntas tengan orden
      data.preguntas.forEach((pregunta, index) => {
        if (pregunta.orden === undefined || pregunta.orden === null) {
          pregunta.orden = index;
        }
      });
    }

    Object.assign(formRequest, data);
    await formRequest.save();

    // Si se modificó el formulario (preguntas, nombre o descripción), 
    // resetear todas las respuestas completadas o aprobadas a "en progreso"
    if (isModifyingForm) {
      const completedResponses = await FormResponse.updateMany(
        { 
          formRequest: formId,
          $or: [
            { completado: true },
            { estado: { $in: ['completado', 'aprobado'] } }
          ]
        },
        { 
          $set: { 
            completado: false,
            estado: 'en_progreso',
            fechaCompletado: null,
            fechaAprobacion: null,
            aprobadoPor: null,
            motivoRechazo: null,
            updatedAt: new Date()
          } 
        }
      );
      
      if (completedResponses.modifiedCount > 0) {
        console.log(`✅ [FORM-REQUESTS] Se resetearon ${completedResponses.modifiedCount} respuestas (completadas/aprobadas) a "en progreso" para el formulario ${formId}`);
      }
    }

    await formRequest.populate('account', 'nombre razonSocial');
    await formRequest.populate('createdBy', 'name email');
    return formRequest;
  } catch (error) {
    throw new Error(`Error al actualizar formulario: ${error.message}`);
  }
}

/**
 * Eliminar un formulario
 * @param {String} formId - ID del formulario
 * @returns {Promise<Boolean>} true si se eliminó correctamente
 */
async function deleteFormRequest(formId) {
  try {
    // Verificar si hay respuestas asociadas
    const responsesCount = await FormResponse.countDocuments({ formRequest: formId });
    if (responsesCount > 0) {
      throw new Error('No se puede eliminar el formulario porque tiene respuestas asociadas');
    }

    // Eliminar asociaciones con divisiones
    await FormDivisionAssociation.deleteMany({ formRequest: formId });

    // Eliminar el formulario
    const result = await FormRequest.findByIdAndDelete(formId);
    return !!result;
  } catch (error) {
    throw new Error(`Error al eliminar formulario: ${error.message}`);
  }
}

/**
 * Obtener formularios de una cuenta
 * @param {String} accountId - ID de la cuenta
 * @param {String} status - Filtrar por estado (opcional)
 * @returns {Promise<Array>} Lista de formularios
 */
async function getFormRequestsByAccount(accountId, status = null) {
  try {
    const query = { account: accountId };
    if (status) {
      query.status = status;
    }

    return await FormRequest.find(query)
      .populate('account', 'nombre razonSocial')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
  } catch (error) {
    throw new Error(`Error al obtener formularios: ${error.message}`);
  }
}

/**
 * Obtener un formulario por ID
 * @param {String} formId - ID del formulario
 * @returns {Promise<Object>} Formulario
 */
async function getFormRequestById(formId) {
  try {
    const formRequest = await FormRequest.findById(formId)
      .populate('account', 'nombre razonSocial')
      .populate('createdBy', 'name email');
    
    if (!formRequest) {
      throw new Error('Formulario no encontrado');
    }

    return formRequest;
  } catch (error) {
    throw new Error(`Error al obtener formulario: ${error.message}`);
  }
}

/**
 * Asociar un formulario a una división
 * @param {String} formId - ID del formulario
 * @param {String} divisionId - ID de la división
 * @param {String} accountId - ID de la cuenta
 * @param {Boolean} requerido - Si el formulario es requerido
 * @param {String} createdBy - ID del usuario que crea la asociación
 * @returns {Promise<Object>} Asociación creada
 */
async function associateFormToDivision(formId, divisionId, accountId, requerido, createdBy) {
  try {
    // Verificar que el formulario existe y está publicado
    const formRequest = await FormRequest.findById(formId);
    if (!formRequest) {
      throw new Error('Formulario no encontrado');
    }

    // Verificar que no existe ya la asociación
    const existing = await FormDivisionAssociation.findOne({
      formRequest: formId,
      division: divisionId
    });

    if (existing) {
      // Actualizar la asociación existente
      existing.requerido = requerido;
      await existing.save();
      await existing.populate('formRequest', 'nombre descripcion');
      await existing.populate('division', 'nombre');
      await existing.populate('account', 'nombre razonSocial');
      return existing;
    }

    const association = new FormDivisionAssociation({
      formRequest: formId,
      division: divisionId,
      account: accountId,
      requerido: requerido || false,
      createdBy
    });

    await association.save();
    await association.populate('formRequest', 'nombre descripcion');
    await association.populate('division', 'nombre');
    await association.populate('account', 'nombre razonSocial');
    return association;
  } catch (error) {
    throw new Error(`Error al asociar formulario a división: ${error.message}`);
  }
}

/**
 * Obtener formularios pendientes para un tutor y estudiante
 * @param {String} tutorId - ID del tutor
 * @param {String} studentId - ID del estudiante
 * @returns {Promise<Array>} Lista de formularios pendientes
 */
async function getPendingFormsForTutor(tutorId, studentId) {
  try {
    console.log('📋 [FORM-SERVICE] getPendingFormsForTutor iniciado:', { tutorId, studentId });
    
    // Obtener el estudiante para conocer su división
    const student = await Student.findById(studentId);
    if (!student) {
      console.log('❌ [FORM-SERVICE] Estudiante no encontrado:', studentId);
      throw new Error('Estudiante no encontrado');
    }

    console.log('📋 [FORM-SERVICE] Estudiante encontrado:', {
      id: student._id,
      nombre: student.nombre,
      division: student.division
    });

    // Obtener formularios asociados a la división del estudiante
    const associations = await FormDivisionAssociation.find({
      division: student.division
    })
      .populate({
        path: 'formRequest',
        match: { status: 'publicado' }
      })
      .populate('division', 'nombre');

    console.log('📋 [FORM-SERVICE] Asociaciones encontradas:', associations.length);
    console.log('📋 [FORM-SERVICE] Asociaciones con formularios:', associations.map(a => ({
      associationId: a._id,
      hasFormRequest: !!a.formRequest,
      formRequestStatus: a.formRequest?.status,
      division: a.division?.nombre
    })));

    // Filtrar asociaciones con formularios publicados
    const validAssociations = associations.filter(a => a.formRequest);
    console.log('📋 [FORM-SERVICE] Asociaciones válidas (con formulario publicado):', validAssociations.length);

    if (validAssociations.length === 0) {
      console.log('📋 [FORM-SERVICE] No hay formularios pendientes');
      return [];
    }

    // Obtener respuestas existentes del tutor para este estudiante
    const formRequestIds = validAssociations.map(a => a.formRequest._id);
    const existingResponses = await FormResponse.find({
      tutor: tutorId,
      student: studentId,
      formRequest: { $in: formRequestIds }
    }).select('formRequest completado');

    const completedFormIds = existingResponses
      .filter(r => r.completado)
      .map(r => r.formRequest.toString());

    // Filtrar formularios que no están completados
    const pendingForms = validAssociations
      .filter(a => !completedFormIds.includes(a.formRequest._id.toString()))
      .map(a => {
        const hasDraft = existingResponses.some(r => 
          r.formRequest.toString() === a.formRequest._id.toString() && !r.completado
        );
        
        return {
          _id: a._id,
          formRequest: {
            _id: a.formRequest._id,
            nombre: a.formRequest.nombre,
            descripcion: a.formRequest.descripcion,
            preguntas: a.formRequest.preguntas
          },
          division: {
            _id: a.division._id || a.division,
            nombre: a.division.nombre || 'Sin división'
          },
          requerido: a.requerido,
          hasDraft: hasDraft
        };
      });

    return pendingForms;
  } catch (error) {
    throw new Error(`Error al obtener formularios pendientes: ${error.message}`);
  }
}

/**
 * Obtener todos los formularios (pendientes y completados) para un tutor y estudiante
 * @param {String} tutorId - ID del tutor
 * @param {String} studentId - ID del estudiante
 * @returns {Promise<Array>} Lista de formularios con su estado
 */
async function getAllFormsForTutor(tutorId, studentId) {
  try {
    console.log('📋 [FORM-SERVICE] getAllFormsForTutor iniciado:', { tutorId, studentId });
    
    // Obtener el estudiante para conocer su división
    const student = await Student.findById(studentId);
    if (!student) {
      console.log('❌ [FORM-SERVICE] Estudiante no encontrado:', studentId);
      throw new Error('Estudiante no encontrado');
    }

    // Obtener formularios asociados a la división del estudiante
    const associations = await FormDivisionAssociation.find({
      division: student.division
    })
      .populate({
        path: 'formRequest',
        match: { status: 'publicado' }
      })
      .populate('division', 'nombre');

    // Filtrar asociaciones con formularios publicados
    const validAssociations = associations.filter(a => a.formRequest);

    if (validAssociations.length === 0) {
      console.log('📋 [FORM-SERVICE] No hay formularios');
      return [];
    }

    // Obtener respuestas existentes del tutor para este estudiante
    const formRequestIds = validAssociations.map(a => a.formRequest._id);
    const existingResponses = await FormResponse.find({
      tutor: tutorId,
      student: studentId,
      formRequest: { $in: formRequestIds }
    }).select('formRequest completado fechaCompletado estado fechaAprobacion motivoRechazo');

    // Crear un mapa de respuestas por formulario
    const responseMap = new Map();
    existingResponses.forEach(r => {
      responseMap.set(r.formRequest.toString(), {
        completado: r.completado,
        fechaCompletado: r.fechaCompletado,
        estado: r.estado,
        fechaAprobacion: r.fechaAprobacion,
        motivoRechazo: r.motivoRechazo
      });
    });

    // Mapear todos los formularios con su estado
    const allForms = validAssociations.map(a => {
      const response = responseMap.get(a.formRequest._id.toString());
      const hasDraft = response && !response.completado && response.estado === 'en_progreso';
      const isCompleted = response && response.completado;
      const estado = response?.estado || 'en_progreso';
      
      return {
        _id: a._id,
        formRequest: {
          _id: a.formRequest._id,
          nombre: a.formRequest.nombre,
          descripcion: a.formRequest.descripcion,
          preguntas: a.formRequest.preguntas
        },
        division: {
          _id: a.division._id || a.division,
          nombre: a.division.nombre || 'Sin división'
        },
        requerido: a.requerido,
        hasDraft: hasDraft,
        completado: isCompleted,
        estado: estado,
        fechaCompletado: response?.fechaCompletado,
        fechaAprobacion: response?.fechaAprobacion,
        motivoRechazo: response?.motivoRechazo
      };
    });

    return allForms;
  } catch (error) {
    throw new Error(`Error al obtener formularios: ${error.message}`);
  }
}

/**
 * Guardar o actualizar una respuesta de formulario
 * @param {String} formId - ID del formulario
 * @param {String} studentId - ID del estudiante
 * @param {String} tutorId - ID del tutor
 * @param {Array} respuestas - Array de respuestas
 * @param {Boolean} completado - Si está completado
 * @returns {Promise<Object>} Respuesta guardada
 */
async function saveFormResponse(formId, studentId, tutorId, respuestas, completado = false) {
  try {
    // Obtener el estudiante para conocer su división
    const student = await Student.findById(studentId);
    if (!student) {
      throw new Error('Estudiante no encontrado');
    }

    // Validar que el formulario existe y está publicado
    const formRequest = await FormRequest.findById(formId);
    if (!formRequest) {
      throw new Error('Formulario no encontrado');
    }

    if (formRequest.status !== 'publicado') {
      throw new Error('El formulario no está publicado');
    }

    // Validar respuestas si está completado
    if (completado) {
      // Verificar que todas las preguntas requeridas tienen respuesta
      const requiredQuestions = formRequest.preguntas.filter(p => p.requerido);
      for (const question of requiredQuestions) {
        const respuesta = respuestas.find(r => r.preguntaId.toString() === question._id.toString());
        if (!respuesta || !respuesta.valor || 
            (Array.isArray(respuesta.valor) && respuesta.valor.length === 0)) {
          throw new Error(`La pregunta "${question.texto}" es requerida`);
        }
      }
    }

    // Buscar respuesta existente
    let formResponse = await FormResponse.findOne({
      formRequest: formId,
      student: studentId,
      tutor: tutorId
    });

    if (formResponse) {
      // Actualizar respuesta existente
      formResponse.respuestas = respuestas;
      formResponse.completado = completado;
      if (completado && !formResponse.fechaCompletado) {
        formResponse.fechaCompletado = new Date();
        // Si se completa, cambiar estado a 'completado' (a menos que ya esté aprobado)
        if (formResponse.estado === 'en_progreso' || formResponse.estado === 'rechazado') {
          formResponse.estado = 'completado';
        }
      } else if (!completado) {
        // Si se desmarca como completado, volver a en_progreso
        formResponse.estado = 'en_progreso';
        formResponse.fechaCompletado = undefined;
      }
      await formResponse.save();
    } else {
      // Crear nueva respuesta
      formResponse = new FormResponse({
        formRequest: formId,
        student: studentId,
        tutor: tutorId,
        division: student.division,
        respuestas,
        completado,
        estado: completado ? 'completado' : 'en_progreso',
        fechaCompletado: completado ? new Date() : undefined
      });
      await formResponse.save();
    }

    await formResponse.populate('formRequest', 'nombre descripcion preguntas');
    await formResponse.populate('student', 'nombre apellido dni');
    await formResponse.populate('tutor', 'name email');
    await formResponse.populate('division', 'nombre');
    return formResponse;
  } catch (error) {
    throw new Error(`Error al guardar respuesta: ${error.message}`);
  }
}

/**
 * Obtener respuesta guardada de un formulario para un estudiante
 * @param {String} formId - ID del formulario
 * @param {String} studentId - ID del estudiante
 * @param {String} tutorId - ID del tutor
 * @returns {Promise<Object|null>} Respuesta o null si no existe
 */
async function getFormResponse(formId, studentId, tutorId) {
  try {
    return await FormResponse.findOne({
      formRequest: formId,
      student: studentId,
      tutor: tutorId
    })
      .populate('formRequest', 'nombre descripcion preguntas')
      .populate('student', 'nombre apellido dni')
      .populate('tutor', 'name email')
      .populate('division', 'nombre');
    
    // Procesar URLs para generar signed URLs
    if (!formResponse) {
      return null;
    }
    return await processFormResponseUrls(formResponse);
  } catch (error) {
    throw new Error(`Error al obtener respuesta: ${error.message}`);
  }
}

/**
 * Obtener respuestas de un formulario para el backoffice
 * @param {String} formId - ID del formulario
 * @param {String} divisionId - ID de la división (opcional)
 * @returns {Promise<Array>} Lista de respuestas
 */
async function getFormResponses(formId, divisionId = null) {
  try {
    const query = { formRequest: formId };
    if (divisionId) {
      query.division = divisionId;
    }

    const responses = await FormResponse.find(query)
      .populate('formRequest', 'nombre descripcion')
      .populate('student', 'nombre apellido dni')
      .populate('tutor', 'name email')
      .populate('division', 'nombre')
      .sort({ createdAt: -1 });
    
    // Procesar URLs para generar signed URLs
    return await processFormResponseUrls(responses);
  } catch (error) {
    throw new Error(`Error al obtener respuestas: ${error.message}`);
  }
}

/**
 * Obtener todas las respuestas de una división
 * @param {String} divisionId - ID de la división
 * @returns {Promise<Array>} Lista de respuestas
 */
async function getFormResponsesByDivision(divisionId) {
  try {
    const responses = await FormResponse.find({ division: divisionId })
      .populate('formRequest', 'nombre descripcion')
      .populate('student', 'nombre apellido dni')
      .populate('tutor', 'name email')
      .populate('division', 'nombre')
      .sort({ createdAt: -1 });
    
    // Procesar URLs para generar signed URLs
    return await processFormResponseUrls(responses);
  } catch (error) {
    throw new Error(`Error al obtener respuestas por división: ${error.message}`);
  }
}

/**
 * Verificar si hay formularios requeridos pendientes
 * @param {String} tutorId - ID del tutor
 * @param {String} studentId - ID del estudiante
 * @returns {Promise<Boolean>} true si hay formularios requeridos pendientes
 */
async function checkRequiredFormsPending(tutorId, studentId) {
  try {
    return await FormResponse.hasRequiredPending(tutorId, studentId);
  } catch (error) {
    throw new Error(`Error al verificar formularios requeridos: ${error.message}`);
  }
}

/**
 * Obtener divisiones asociadas a un formulario
 * @param {String} formId - ID del formulario
 * @returns {Promise<Array>} Lista de asociaciones
 */
async function getDivisionsByFormRequest(formId) {
  try {
    return await FormDivisionAssociation.getByFormRequest(formId);
  } catch (error) {
    throw new Error(`Error al obtener divisiones asociadas: ${error.message}`);
  }
}

/**
 * Aprobar una respuesta de formulario
 * @param {String} responseId - ID de la respuesta
 * @param {String} approvedBy - ID del usuario que aprueba
 * @returns {Promise<Object>} Respuesta actualizada
 */
async function approveFormResponse(responseId, approvedBy) {
  try {
    const formResponse = await FormResponse.findById(responseId);
    if (!formResponse) {
      throw new Error('Respuesta no encontrada');
    }

    // Verificar que esté completado (por estado o por campo completado)
    const isCompleted = formResponse.estado === 'completado' || 
                       (formResponse.completado === true && formResponse.estado !== 'aprobado' && formResponse.estado !== 'rechazado');
    
    if (!isCompleted) {
      throw new Error('Solo se pueden aprobar respuestas completadas');
    }

    // Asegurar que el estado y completado estén correctos
    formResponse.estado = 'aprobado';
    formResponse.completado = true; // Asegurar que esté marcado como completado
    formResponse.fechaAprobacion = new Date();
    formResponse.aprobadoPor = approvedBy;
    formResponse.motivoRechazo = undefined; // Limpiar motivo de rechazo si existía
    if (!formResponse.fechaCompletado) {
      formResponse.fechaCompletado = new Date(); // Si no tiene fecha de completado, usar la actual
    }
    await formResponse.save();

    await formResponse.populate('formRequest', 'nombre descripcion preguntas');
    await formResponse.populate('student', 'nombre apellido dni');
    await formResponse.populate('tutor', 'name email');
    await formResponse.populate('division', 'nombre');
    await formResponse.populate('aprobadoPor', 'name email');
    
    // Procesar URLs para generar signed URLs
    return await processFormResponseUrls(formResponse);
  } catch (error) {
    throw new Error(`Error al aprobar respuesta: ${error.message}`);
  }
}

/**
 * Rechazar una respuesta de formulario
 * @param {String} responseId - ID de la respuesta
 * @param {String} rejectedBy - ID del usuario que rechaza
 * @param {String} motivoRechazo - Motivo del rechazo (opcional)
 * @returns {Promise<Object>} Respuesta actualizada
 */
async function rejectFormResponse(responseId, rejectedBy, motivoRechazo = '') {
  try {
    const formResponse = await FormResponse.findById(responseId);
    if (!formResponse) {
      throw new Error('Respuesta no encontrada');
    }

    // Verificar que esté completado (por estado o por campo completado)
    const isCompleted = formResponse.estado === 'completado' || 
                       (formResponse.completado === true && formResponse.estado !== 'aprobado' && formResponse.estado !== 'rechazado');
    
    if (!isCompleted) {
      throw new Error('Solo se pueden rechazar respuestas completadas');
    }

    formResponse.estado = 'rechazado';
    formResponse.completado = false; // Volver a en_progreso
    formResponse.fechaCompletado = undefined;
    formResponse.motivoRechazo = motivoRechazo;
    formResponse.aprobadoPor = undefined;
    formResponse.fechaAprobacion = undefined;
    await formResponse.save();

    await formResponse.populate('formRequest', 'nombre descripcion preguntas');
    await formResponse.populate('student', 'nombre apellido dni');
    await formResponse.populate('tutor', 'name email');
    await formResponse.populate('division', 'nombre');
    
    // Procesar URLs para generar signed URLs
    return await processFormResponseUrls(formResponse);
  } catch (error) {
    throw new Error(`Error al rechazar respuesta: ${error.message}`);
  }
}

/**
 * Procesar respuestas de formulario para generar signed URLs para archivos e imágenes
 * @param {Object|Array} formResponse - Respuesta única o array de respuestas
 * @returns {Promise<Object|Array>} Respuesta(s) con URLs firmadas
 */
async function processFormResponseUrls(formResponse) {
  const { generateSignedUrl } = require('../config/s3.config');
  
  const processSingleResponse = async (response) => {
    if (!response || !response.respuestas) {
      return response;
    }
    
    // Procesar cada respuesta
    const processedRespuestas = await Promise.all(
      response.respuestas.map(async (respuesta) => {
        if (!respuesta.valor) {
          return respuesta;
        }
        
        // Si el valor es un string y parece ser una key de S3 (no es una URL completa)
        if (typeof respuesta.valor === 'string' && 
            !respuesta.valor.startsWith('http://') && 
            !respuesta.valor.startsWith('https://') &&
            (respuesta.valor.includes('form-requests/') || respuesta.valor.includes('uploads/'))) {
          try {
            const signedUrl = await generateSignedUrl(respuesta.valor, 172800); // 2 días
            return {
              ...respuesta,
              valor: signedUrl || respuesta.valor // Fallback si falla
            };
          } catch (error) {
            console.error('Error generando signed URL para respuesta:', error);
            return respuesta;
          }
        }
        
        // Si es un array (para checkboxes), procesar cada elemento
        if (Array.isArray(respuesta.valor)) {
          const processedArray = await Promise.all(
            respuesta.valor.map(async (valor) => {
              if (typeof valor === 'string' && 
                  !valor.startsWith('http://') && 
                  !valor.startsWith('https://') &&
                  (valor.includes('form-requests/') || valor.includes('uploads/'))) {
                try {
                  return await generateSignedUrl(valor, 172800) || valor;
                } catch (error) {
                  console.error('Error generando signed URL para valor en array:', error);
                  return valor;
                }
              }
              return valor;
            })
          );
          return {
            ...respuesta,
            valor: processedArray
          };
        }
        
        return respuesta;
      })
    );
    
    return {
      ...response.toObject ? response.toObject() : response,
      respuestas: processedRespuestas
    };
  };
  
  if (Array.isArray(formResponse)) {
    return await Promise.all(formResponse.map(processSingleResponse));
  } else {
    return await processSingleResponse(formResponse);
  }
}

module.exports = {
  createFormRequest,
  updateFormRequest,
  deleteFormRequest,
  getFormRequestsByAccount,
  getFormRequestById,
  associateFormToDivision,
  getPendingFormsForTutor,
  getAllFormsForTutor,
  saveFormResponse,
  getFormResponse,
  getFormResponses,
  getFormResponsesByDivision,
  checkRequiredFormsPending,
  getDivisionsByFormRequest,
  approveFormResponse,
  rejectFormResponse
};

