const mongoose = require('mongoose');

const activeAssociationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El usuario es obligatorio'],
    unique: true // Solo una asociación activa por usuario
  },
  activeShared: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shared',
    required: [true, 'La asociación activa es obligatoria']
  },
  // Campos desnormalizados para acceso rápido
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: true
  },
  division: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grupo',
    required: false
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: false
  },
  // Timestamp de cuando se activó esta asociación
  activatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Índices para optimizar consultas
// user ya tiene índice único vía unique: true
activeAssociationSchema.index({ account: 1 });
activeAssociationSchema.index({ role: 1 });

// Método estático para establecer una asociación como activa
activeAssociationSchema.statics.setActiveAssociation = async function(userId, sharedId) {
  try {
    // Verificar que la asociación existe y está activa
    const Shared = require('./Shared');
    const shared = await Shared.findById(sharedId)
      .populate('account')
      .populate('role')
      .populate('division')
      .populate('student');

    if (!shared) {
      throw new Error('Asociación no encontrada');
    }

    if (shared.status !== 'active') {
      throw new Error('La asociación no está activa');
    }

    if (shared.user.toString() !== userId.toString()) {
      throw new Error('La asociación no pertenece al usuario');
    }

    // LOG CRÍTICO: Verificar qué estudiante tiene la Shared antes de actualizar
    console.log('🔍 [ACTIVE ASSOCIATION SET] Shared que se va a activar:', {
      sharedId: shared._id.toString(),
      studentId: shared.student?._id?.toString(),
      studentNombre: shared.student?.nombre,
      studentApellido: shared.student?.apellido,
      account: shared.account?.nombre,
      role: shared.role?.nombre
    });

    // Crear o actualizar la asociación activa
    const activeAssociation = await this.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        activeShared: sharedId,
        account: shared.account._id,
        role: shared.role._id,
        division: shared.division?._id,
        student: shared.student?._id,
        activatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    // LOG CRÍTICO: Verificar qué se guardó en la base de datos
    const savedAssociation = await this.findById(activeAssociation._id)
      .populate('student', 'nombre apellido');
    
    console.log(`✅ [ACTIVE ASSOCIATION SET] Asociación activa establecida para usuario ${userId}:`, {
      account: shared.account.nombre,
      role: shared.role.nombre,
      division: shared.division?.nombre,
      student: shared.student?.nombre,
      studentId: shared.student?._id?.toString()
    });
    
    console.log(`🔍 [ACTIVE ASSOCIATION SET] Verificación post-guardado:`, {
      savedStudentId: savedAssociation.student?._id?.toString(),
      savedStudentNombre: savedAssociation.student?.nombre,
      savedStudentApellido: savedAssociation.student?.apellido,
      activeSharedId: savedAssociation.activeShared?.toString()
    });

    return activeAssociation;
  } catch (error) {
    console.error('❌ [ACTIVE ASSOCIATION] Error estableciendo asociación activa:', error);
    throw error;
  }
};

// Método estático para obtener la asociación activa de un usuario
activeAssociationSchema.statics.getActiveAssociation = async function(userId) {
  try {
    const activeAssociation = await this.findOne({ user: userId })
      .populate('activeShared')
      .populate('account')
      .populate('role')
      .populate('division');
      // NO poblar 'student' aquí - lo obtendremos desde activeShared

    if (!activeAssociation) {
      console.log(`⚠️ [ACTIVE ASSOCIATION] No hay asociación activa para usuario ${userId}`);
      return null;
    }

    // Verificar que la asociación activa sigue siendo válida
    // Y obtener el estudiante desde activeShared (fuente de verdad)
    const Shared = require('./Shared');
    const shared = await Shared.findById(activeAssociation.activeShared)
      .populate('student', 'nombre apellido avatar');
    
    if (!shared || shared.status !== 'active') {
      console.log(`⚠️ [ACTIVE ASSOCIATION] La asociación activa ya no es válida para usuario ${userId}`);
      // Eliminar la asociación activa inválida
      await this.deleteOne({ user: userId });
      return null;
    }

    // CRÍTICO: Usar el estudiante de activeShared (Shared), no el campo desnormalizado
    // Actualizar el campo student en activeAssociation con el de Shared para mantener consistencia
    if (shared.student) {
      activeAssociation.student = shared.student;
      console.log('✅ [ACTIVE ASSOCIATION] Estudiante obtenido desde activeShared:', {
        studentId: shared.student._id.toString(),
        studentNombre: shared.student.nombre,
        studentApellido: shared.student.apellido
      });
    } else {
      activeAssociation.student = null;
      console.log('⚠️ [ACTIVE ASSOCIATION] activeShared no tiene estudiante');
    }

    return activeAssociation;
  } catch (error) {
    console.error('❌ [ACTIVE ASSOCIATION] Error obteniendo asociación activa:', error);
    throw error;
  }
};

// Método estático para obtener todas las asociaciones disponibles de un usuario
activeAssociationSchema.statics.getUserAvailableAssociations = async function(userId) {
  try {
    const Shared = require('./Shared');
    const associations = await Shared.find({
      user: userId,
      status: 'active'
    })
    .populate('account')
    .populate('role')
    .populate('division')
    .populate('student')
    .sort({ createdAt: -1 });

    return associations;
  } catch (error) {
    console.error('❌ [ACTIVE ASSOCIATION] Error obteniendo asociaciones disponibles:', error);
    throw error;
  }
};

// Método estático para limpiar asociaciones activas inválidas
activeAssociationSchema.statics.cleanupInvalidAssociations = async function() {
  try {
    const Shared = require('./Shared');
    const activeAssociations = await this.find({});
    
    for (const activeAssoc of activeAssociations) {
      const shared = await Shared.findById(activeAssoc.activeShared);
      
      if (!shared || shared.status !== 'active') {
        console.log(`🧹 [ACTIVE ASSOCIATION] Limpiando asociación activa inválida para usuario ${activeAssoc.user}`);
        await this.deleteOne({ _id: activeAssoc._id });
      }
    }
    
    console.log('✅ [ACTIVE ASSOCIATION] Limpieza de asociaciones activas completada');
  } catch (error) {
    console.error('❌ [ACTIVE ASSOCIATION] Error en limpieza de asociaciones activas:', error);
    throw error;
  }
};

module.exports = mongoose.model('ActiveAssociation', activeAssociationSchema);
