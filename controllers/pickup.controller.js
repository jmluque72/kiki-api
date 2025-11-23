const Pickup = require('../shared/models/Pickup');
const User = require('../shared/models/User');
const Shared = require('../shared/models/Shared');
const ActiveAssociation = require('../shared/models/ActiveAssociation');
const Grupo = require('../shared/models/Grupo');

/**
 * Obtener pickups por cuenta
 */
exports.getPickupsByAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { page = 1, limit = 20, division, student } = req.query;
    
    let query = { account: accountId, status: 'active' };
    
    if (division) {
      query.division = division;
    }
    
    if (student) {
      query.student = student;
    }
    
    const skip = (page - 1) * limit;
    
    const pickups = await Pickup.find(query)
      .populate('division', 'nombre')
      .populate({
        path: 'student',
        select: 'nombre apellido tutor',
        populate: {
          path: 'tutor',
          select: 'name apellido nombre email'
        }
      })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Pickup.countDocuments(query);
    
    res.json({
      success: true,
      data: pickups,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error al obtener personas autorizadas:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

/**
 * Obtener pickups por estudiante
 */
exports.getPickupsByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const pickups = await Pickup.find({ student: studentId, status: 'active' })
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('student', 'nombre apellido')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: pickups
    });
  } catch (error) {
    console.error('Error al obtener personas autorizadas por estudiante:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

/**
 * Crear pickup
 */
exports.createPickup = async (req, res) => {
  try {
    const { account, division, student, nombre, apellido, dni, createdBy } = req.body;
    
    // Validar que no exista una persona con el mismo DNI para el mismo estudiante
    const existingPickup = await Pickup.findOne({ 
      student, 
      dni, 
      status: 'active' 
    });
    
    if (existingPickup) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una persona autorizada con este DNI para este estudiante'
      });
    }
    
    const pickup = new Pickup({
      account,
      division,
      student,
      nombre,
      apellido,
      dni,
      createdBy
    });
    
    await pickup.save();
    
    const populatedPickup = await Pickup.findById(pickup._id)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('student', 'nombre apellido')
      .populate('createdBy', 'name');
    
    res.status(201).json({
      success: true,
      data: populatedPickup,
      message: 'Persona autorizada creada correctamente'
    });
  } catch (error) {
    console.error('Error al crear persona autorizada:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

/**
 * Actualizar pickup
 */
exports.updatePickup = async (req, res) => {
  try {
    const { pickupId } = req.params;
    const { nombre, apellido, dni } = req.body;
    
    const pickup = await Pickup.findById(pickupId);
    if (!pickup) {
      return res.status(404).json({ success: false, message: 'Persona autorizada no encontrada' });
    }
    
    // Validar que no exista otra persona con el mismo DNI para el mismo estudiante
    if (dni && dni !== pickup.dni) {
      const existingPickup = await Pickup.findOne({ 
        student: pickup.student, 
        dni, 
        status: 'active',
        _id: { $ne: pickupId }
      });
      
      if (existingPickup) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe una persona autorizada con este DNI para este estudiante'
        });
      }
    }
    
    if (nombre) pickup.nombre = nombre;
    if (apellido) pickup.apellido = apellido;
    if (dni) pickup.dni = dni;
    
    await pickup.save();
    
    const updatedPickup = await Pickup.findById(pickupId)
      .populate('account', 'nombre')
      .populate('division', 'nombre')
      .populate('student', 'nombre apellido')
      .populate('createdBy', 'name');
    
    res.json({
      success: true,
      data: updatedPickup,
      message: 'Persona autorizada actualizada correctamente'
    });
  } catch (error) {
    console.error('Error al actualizar persona autorizada:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

/**
 * Eliminar pickup (soft delete)
 */
exports.deletePickup = async (req, res) => {
  try {
    const { pickupId } = req.params;
    
    const pickup = await Pickup.findById(pickupId);
    if (!pickup) {
      return res.status(404).json({ success: false, message: 'Persona autorizada no encontrada' });
    }
    
    pickup.status = 'inactive';
    await pickup.save();
    
    res.json({
      success: true,
      message: 'Persona autorizada eliminada correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar persona autorizada:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

/**
 * Obtener divisiones por cuenta
 */
exports.getDivisionsByAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    
    // Buscar grupos que pertenecen a esta cuenta
    const grupos = await Grupo.find({ cuenta: accountId, activo: true })
      .populate('cuenta', 'nombre')
      .sort({ nombre: 1 });
    
    // Transformar grupos a formato de divisiones
    const divisions = grupos.map(grupo => ({
      _id: grupo._id,
      nombre: grupo.nombre
    }));
    
    res.json({
      success: true,
      data: divisions
    });
  } catch (error) {
    console.error('Error al obtener divisiones por cuenta:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

/**
 * Obtener pickups para familyadmin
 */
exports.getFamilyAdminPickups = async (req, res) => {
  try {
    console.log('🎯 [PICKUP FAMILYADMIN GET] Obteniendo pickups');
    const { userId } = req.user;
    const { division, student, page = 1, limit = 20 } = req.query;
    
    console.log('👤 [PICKUP FAMILYADMIN GET] Usuario:', userId);
    console.log('📋 [PICKUP FAMILYADMIN GET] Query params:', { division, student, page, limit });
    
    // Verificar que el usuario tiene una asociación activa con rol familyadmin
    const activeAssociation = await ActiveAssociation.getActiveAssociation(userId);
    if (!activeAssociation || activeAssociation.role.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores familiares pueden acceder a esta información'
      });
    }
    
    // Obtener todas las asociaciones del usuario
    const userAssociations = await Shared.find({
      user: userId,
      status: 'active'
    }).populate('account division student');
    
    console.log('🔍 [PICKUP FAMILYADMIN GET] Asociaciones encontradas:', userAssociations.length);
    
    if (userAssociations.length === 0) {
      console.log('❌ [PICKUP FAMILYADMIN GET] No hay asociaciones activas');
      return res.json({
        success: true,
        data: {
          pickups: [],
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit)
        }
      });
    }
    
    // Construir query para buscar pickups de los estudiantes asociados al usuario
    const studentIds = userAssociations
      .filter(assoc => assoc.student)
      .map(assoc => assoc.student._id);
    
    console.log('🎓 [PICKUP FAMILYADMIN GET] Student IDs:', studentIds);
    
    let query = {
      status: 'active'
    };
    
    // Filtrar por división si se especifica
    if (division && division !== 'all') {
      query.division = division;
      console.log('🔍 [PICKUP FAMILYADMIN GET] Filtrando por división:', division);
    }
    
    // Filtrar por estudiante si se especifica
    if (student && student !== 'all') {
      query.student = student;
      console.log('🔍 [PICKUP FAMILYADMIN GET] Filtrando por estudiante:', student);
    } else if (studentIds.length > 0) {
      // Solo buscar por student si no se especifica un estudiante específico
      query.student = { $in: studentIds };
      console.log('🔍 [PICKUP FAMILYADMIN GET] Filtrando por studentIds:', studentIds);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    console.log('🔍 [PICKUP FAMILYADMIN GET] Query final:', JSON.stringify(query, null, 2));
    
    const pickups = await Pickup.find(query)
      .populate('account', 'nombre')
      .populate('student', 'nombre apellido')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Pickup.countDocuments(query);
    
    console.log('📦 [PICKUP FAMILYADMIN GET] Pickups encontrados:', pickups.length);
    console.log('📊 [PICKUP FAMILYADMIN GET] Total en BD:', total);
    
    res.json({
      success: true,
      data: {
        pickups,
        total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error al obtener pickups para familyadmin:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

/**
 * Crear pickup para familyadmin
 */
exports.createFamilyAdminPickup = async (req, res) => {
  try {
    console.log('🎯 [PICKUP FAMILYADMIN] Iniciando creación de pickup');
    const { userId } = req.user;
    const { nombre, apellido, dni, divisionId } = req.body;
    
    console.log('👤 [PICKUP FAMILYADMIN] Usuario:', userId);
    console.log('📝 [PICKUP FAMILYADMIN] Datos recibidos:', {
      nombre, apellido, dni, divisionId
    });
    
    // Verificar que el usuario es familyadmin
    const user = await User.findById(userId).populate('role');
    if (user.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores familiares pueden crear personas autorizadas'
      });
    }
    
    // Buscar la asociación del usuario para obtener la institución y estudiante
    const userAssociation = await Shared.findOne({
      user: userId,
      status: 'active'
    }).populate('account student');
    
    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes asociaciones activas'
      });
    }
    
    // Verificar que el usuario tiene un estudiante asociado
    if (!userAssociation.student) {
      return res.status(404).json({
        success: false,
        message: 'No tienes estudiantes asociados'
      });
    }
    
    // Validar que no exista una persona con el mismo DNI para el mismo estudiante
    const existingPickup = await Pickup.findOne({ 
      student: userAssociation.student._id, 
      dni, 
      status: 'active' 
    });
    
    if (existingPickup) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una persona autorizada con este DNI para este estudiante'
      });
    }
    
    const pickup = new Pickup({
      account: userAssociation.account._id,
      division: divisionId,
      student: userAssociation.student._id,
      nombre,
      apellido,
      dni,
      createdBy: userId
    });
    
    await pickup.save();
    
    const populatedPickup = await Pickup.findById(pickup._id)
      .populate('account', 'nombre')
      .populate('student', 'nombre apellido')
      .populate('createdBy', 'name');
    
    res.status(201).json({
      success: true,
      data: {
        pickup: populatedPickup
      },
      message: 'Persona autorizada creada correctamente'
    });
  } catch (error) {
    console.error('Error al crear pickup para familyadmin:', error);
    
    // Manejar errores de validación de Mongoose
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false, 
        message: 'Error de validación',
        errors: validationErrors
      });
    }
    
    // Manejar otros errores
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

/**
 * Eliminar pickup (con autenticación)
 */
exports.deletePickupWithAuth = async (req, res) => {
  try {
    console.log('🗑️ [PICKUP DELETE] Eliminando pickup:', req.params.id);
    const { userId } = req.user;
    const { id } = req.params;
    
    // Verificar que el usuario es familyadmin
    const user = await User.findById(userId).populate('role');
    if (user.role?.nombre !== 'familyadmin') {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores familiares pueden eliminar personas autorizadas'
      });
    }
    
    // Buscar el pickup
    const pickup = await Pickup.findById(id);
    if (!pickup) {
      return res.status(404).json({
        success: false,
        message: 'Persona autorizada no encontrada'
      });
    }
    
    // Verificar que el usuario tiene permisos para eliminar este pickup
    const userAssociation = await Shared.findOne({
      user: userId,
      student: pickup.student,
      status: 'active'
    });
    
    if (!userAssociation) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para eliminar esta persona autorizada'
      });
    }
    
    // Eliminar el pickup (soft delete)
    pickup.status = 'inactive';
    await pickup.save();
    
    console.log('✅ [PICKUP DELETE] Pickup eliminado correctamente');
    
    res.json({
      success: true,
      message: 'Persona autorizada eliminada correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar pickup:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

