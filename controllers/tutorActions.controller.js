const TutorAction = require('../shared/models/TutorAction');
const Notification = require('../shared/models/Notification');
const Student = require('../shared/models/Student');
const Grupo = require('../shared/models/Grupo');
const Account = require('../shared/models/Account');
const User = require('../shared/models/User');
const Role = require('../shared/models/Role');
const Shared = require('../shared/models/Shared');

/**
 * Crear una acción del tutor y generar notificaciones a coordinadores
 */
exports.createTutorAction = async (req, res) => {
  try {
    console.log('👨‍👩‍👧 [TUTOR ACTION] Creando acción del tutor...');
    const { actionType, actionTitle, comment, studentId, divisionId } = req.body;
    const userId = req.user._id;

    // Validar campos requeridos
    if (!actionType || !actionTitle || !comment || !studentId || !divisionId) {
      console.log('❌ [TUTOR ACTION] Campos faltantes');
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: actionType, actionTitle, comment, studentId, divisionId'
      });
    }

    // Verificar que el usuario es un tutor (familyadmin)
    const user = await User.findById(userId).populate('role');
    if (!user) {
      console.log('❌ [TUTOR ACTION] Usuario no encontrado');
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    if (user.role?.nombre !== 'familyadmin') {
      console.log('❌ [TUTOR ACTION] Usuario no es tutor:', user.role?.nombre);
      return res.status(403).json({
        success: false,
        message: 'Solo los tutores pueden crear acciones'
      });
    }

    // Verificar que el estudiante existe
    const student = await Student.findById(studentId);
    if (!student) {
      console.log('❌ [TUTOR ACTION] Estudiante no encontrado');
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado'
      });
    }

    // Verificar que la división existe y obtener la cuenta
    const division = await Grupo.findById(divisionId);
    if (!division) {
      console.log('❌ [TUTOR ACTION] División no encontrada');
      return res.status(404).json({
        success: false,
        message: 'División no encontrada'
      });
    }

    // Obtener la cuenta de la división
    let accountId = division.account;
    if (!accountId) {
      // Si no tiene account directamente, intentar obtenerlo desde el tutorAssociation
      console.log('⚠️ [TUTOR ACTION] División no tiene account directo, buscando desde asociación del tutor...');
      const tutorAssociationForAccount = await Shared.findOne({
        user: userId,
        student: studentId,
        status: 'active'
      }).populate('account');
      
      if (tutorAssociationForAccount?.account) {
        accountId = tutorAssociationForAccount.account._id || tutorAssociationForAccount.account;
        console.log('✅ [TUTOR ACTION] Account obtenido desde asociación:', accountId);
      }
    } else {
      accountId = accountId._id || accountId;
    }

    if (!accountId) {
      console.log('❌ [TUTOR ACTION] No se pudo obtener la cuenta de la división');
      return res.status(400).json({
        success: false,
        message: 'No se pudo obtener la cuenta de la división'
      });
    }

    console.log('✅ [TUTOR ACTION] Account ID:', accountId.toString());

    // Verificar que el tutor tiene acceso al estudiante
    const tutorAssociation = await Shared.findOne({
      user: userId,
      student: studentId,
      status: 'active'
    });

    if (!tutorAssociation) {
      console.log('❌ [TUTOR ACTION] El tutor no tiene acceso a este estudiante');
      return res.status(403).json({
        success: false,
        message: 'No tienes acceso a este estudiante'
      });
    }

    console.log('✅ [TUTOR ACTION] Validaciones pasadas, creando acción...');

    // Crear la acción del tutor
    const tutorAction = new TutorAction({
      actionType,
      actionTitle,
      comment,
      student: studentId,
      division: divisionId,
      account: accountId,
      tutor: userId
    });

    await tutorAction.save();
    console.log('✅ [TUTOR ACTION] Acción guardada:', tutorAction._id);

    // Obtener todos los coordinadores de la división
    console.log('🔍 [TUTOR ACTION] Obteniendo coordinadores de la división:', divisionId);
    const coordinadorRole = await Role.findOne({ nombre: 'coordinador' });
    if (!coordinadorRole) {
      console.log('⚠️ [TUTOR ACTION] Rol de coordinador no encontrado, continuando sin notificaciones');
    } else {
      const coordinatorAssociations = await Shared.find({
        division: divisionId,
        role: coordinadorRole._id,
        status: 'active'
      }).populate('user', 'name email');

      const coordinatorUsers = coordinatorAssociations
        .filter(assoc => assoc.user)
        .map(assoc => assoc.user._id);

      console.log('👥 [TUTOR ACTION] Coordinadores encontrados:', coordinatorUsers.length);

      if (coordinatorUsers.length > 0) {
        // Crear UNA sola notificación con el tutor como sender y todos los coordinadores como recipients
        const notification = new Notification({
          title: actionTitle,
          message: comment,
          type: 'tutor', // Tipo "tutor" para notificaciones de acciones rápidas
          sender: userId, // El tutor que genera la acción
          account: accountId,
          division: divisionId,
          recipients: coordinatorUsers, // Todos los coordinadores de la división
          associatedStudent: studentId, // Estudiante activo del tutor en el momento de crear la acción
          status: 'sent',
          priority: 'normal',
          readBy: [],
          sentAt: new Date()
        });

        await notification.save();
        console.log('✅ [TUTOR ACTION] Notificación única creada:', notification._id);
        console.log('   - Emisor (tutor):', userId.toString());
        console.log('   - Recipients (coordinadores):', coordinatorUsers.length, 'coordinadores');
        console.log('   - Coordinadores IDs:', coordinatorUsers.map(id => id.toString()));

        // TODO: Aquí se podría agregar el envío de push notifications a coordinadores
      } else {
        console.log('⚠️ [TUTOR ACTION] No se encontraron coordinadores para la división');
      }
    }

    // Populate para la respuesta
    await tutorAction.populate('student', 'nombre apellido');
    await tutorAction.populate('division', 'nombre');
    await tutorAction.populate('account', 'nombre');
    await tutorAction.populate('tutor', 'name email');

    res.status(201).json({
      success: true,
      message: 'Acción del tutor creada exitosamente',
      data: tutorAction
    });

  } catch (error) {
    console.error('❌ [TUTOR ACTION] Error completo:', error);
    console.error('❌ [TUTOR ACTION] Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor al crear la acción del tutor'
    });
  }
};

/**
 * Obtener acciones del tutor (opcional, para historial)
 */
exports.getTutorActions = async (req, res) => {
  try {
    const userId = req.user._id;
    const { studentId, limit = 50 } = req.query;

    let query = { tutor: userId };
    if (studentId) {
      query.student = studentId;
    }

    const actions = await TutorAction.find(query)
      .populate('student', 'nombre apellido')
      .populate('division', 'nombre')
      .populate('account', 'nombre')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: actions
    });

  } catch (error) {
    console.error('Error obteniendo acciones del tutor:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

