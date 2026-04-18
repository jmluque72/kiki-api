const Shared = require('../shared/models/Shared');
const Role = require('../shared/models/Role');
const Device = require('../shared/models/Device');
const User = require('../shared/models/User');
const logger = require('../utils/logger');

/**
 * Genera la lista de destinatarios según los filtros especificados
 * @param {Object} filters - Filtros de destinatarios
 * @param {String} targetType - Tipo de destino: 'institution', 'division', 'users', 'coordinators'
 * @param {String} accountId - ID de la cuenta
 * @returns {Promise<Array>} Array de objetos con userId y dispositivos
 */
async function generateRecipients(filters, targetType, accountId) {
  try {
    let recipients = [];

    // Obtener roles necesarios
    const roleMap = {};
    const roleNames = ['coordinador', 'familyadmin', 'familyviewer'];
    for (const roleName of roleNames) {
      const role = await Role.findOne({ nombre: roleName });
      if (role) {
        roleMap[roleName] = role._id;
      }
    }

    switch (targetType) {
      case 'institution':
        // Toda la institución: tutores (familyadmin, familyviewer) y coordinadores
        logger.info(`📱 [PUSH SERVICE] Buscando usuarios de toda la institución`);
        logger.info(`📱 [PUSH SERVICE] AccountId: ${accountId}`);

        const institutionRoles = ['coordinador', 'familyadmin', 'familyviewer'];
        const institutionRoleIds = institutionRoles
          .filter(r => roleMap[r])
          .map(r => roleMap[r]);

        logger.info(`📱 [PUSH SERVICE] Roles buscados: ${institutionRoles.join(', ')}`);
        logger.info(`📱 [PUSH SERVICE] Role IDs: ${institutionRoleIds.join(', ')}`);

        const institutionAssociations = await Shared.find({
          account: accountId,
          role: { $in: institutionRoleIds },
          status: 'active'
        }).populate('user', 'name email status')
          .populate('role', 'nombre descripcion');

        logger.info(`📱 [PUSH SERVICE] Asociaciones encontradas en Shared: ${institutionAssociations.length}`);

        // Agrupar por usuario (sin filtrar por estado del usuario)
        const institutionUsersMap = new Map();
        institutionAssociations.forEach(assoc => {
          if (assoc.user) {
            // No filtrar por estado del usuario, solo verificar que existe
            const userId = assoc.user._id.toString();
            if (!institutionUsersMap.has(userId)) {
              institutionUsersMap.set(userId, {
                userId: assoc.user._id,
                user: assoc.user,
                roles: []
              });
            }
            const userData = institutionUsersMap.get(userId);
            if (assoc.role && !userData.roles.includes(assoc.role.nombre)) {
              userData.roles.push(assoc.role.nombre);
            }
          }
        });

        recipients = Array.from(institutionUsersMap.values());

        logger.info(`📱 [PUSH SERVICE] Usuarios únicos encontrados: ${recipients.length}`);
        recipients.forEach(recipient => {
          logger.info(`   - ${recipient.user.name} (${recipient.user.email}) - Roles: ${recipient.roles.join(', ')}`);
        });
        break;

      case 'division':
        // Tutores, familyview y coordinadores de una división específica
        if (!filters.divisionId) {
          throw new Error('divisionId es requerido para targetType: division');
        }

        logger.info(`📱 [PUSH SERVICE] Buscando usuarios de división: ${filters.divisionId}`);
        logger.info(`📱 [PUSH SERVICE] AccountId: ${accountId}`);

        // Por defecto incluir todos los roles: tutores, familyview y coordinadores
        const divisionRoles = filters.roles || ['familyadmin', 'familyviewer', 'coordinador'];
        const divisionRoleIds = divisionRoles
          .filter(r => roleMap[r])
          .map(r => roleMap[r]);

        logger.info(`📱 [PUSH SERVICE] Roles buscados: ${divisionRoles.join(', ')}`);
        logger.info(`📱 [PUSH SERVICE] Role IDs: ${divisionRoleIds.join(', ')}`);

        const divisionAssociations = await Shared.find({
          account: accountId,
          division: filters.divisionId,
          role: { $in: divisionRoleIds },
          status: 'active'
        }).populate('user', 'name email status')
          .populate('role', 'nombre descripcion');

        logger.info(`📱 [PUSH SERVICE] Asociaciones encontradas en Shared: ${divisionAssociations.length}`);

        // Agrupar por usuario (sin filtrar por estado del usuario)
        const divisionUsersMap = new Map();
        divisionAssociations.forEach(assoc => {
          if (assoc.user) {
            // No filtrar por estado del usuario, solo verificar que existe
            const userId = assoc.user._id.toString();
            if (!divisionUsersMap.has(userId)) {
              divisionUsersMap.set(userId, {
                userId: assoc.user._id,
                user: assoc.user,
                roles: []
              });
            }
            const userData = divisionUsersMap.get(userId);
            if (assoc.role && !userData.roles.includes(assoc.role.nombre)) {
              userData.roles.push(assoc.role.nombre);
            }
          }
        });

        recipients = Array.from(divisionUsersMap.values());

        logger.info(`📱 [PUSH SERVICE] Usuarios únicos encontrados: ${recipients.length}`);
        recipients.forEach(recipient => {
          logger.info(`   - ${recipient.user.name} (${recipient.user.email}) - Roles: ${recipient.roles.join(', ')}`);
        });
        break;

      case 'users':
        // Usuarios específicos de una división
        // Buscar en Shared las asociaciones de los usuarios seleccionados con la división
        if (!filters.userIds || filters.userIds.length === 0) {
          logger.warn('⚠️ [PUSH SERVICE] userIds vacío o no proporcionado para targetType: users');
          logger.warn('⚠️ [PUSH SERVICE] filters recibidos:', JSON.stringify(filters, null, 2));
          throw new Error('userIds es requerido para targetType: users');
        }

        logger.info(`📱 [PUSH SERVICE] Buscando usuarios específicos: ${filters.userIds.length} IDs`);
        logger.info(`📱 [PUSH SERVICE] IDs recibidos:`, filters.userIds);

        // Convertir strings a ObjectIds si es necesario
        const mongoose = require('mongoose');
        const userIds = filters.userIds.map(id => {
          if (typeof id === 'string') {
            return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
          }
          return id;
        });

        // Buscar en Shared las asociaciones de estos usuarios con la división/cuenta
        const sharedQuery = {
          user: { $in: userIds },
          status: 'active'
        };

        // Si hay divisionId, filtrar por división
        if (filters.divisionId) {
          sharedQuery.division = filters.divisionId;
        }

        // Si hay accountId, filtrar por cuenta
        if (accountId) {
          sharedQuery.account = accountId;
        }

        // Buscar roles permitidos (tutores y coordinadores)
        const allowedRoles = ['coordinador', 'familyadmin', 'familyviewer'];
        const allowedRoleIds = allowedRoles
          .filter(r => roleMap[r])
          .map(r => roleMap[r]);
        
        if (allowedRoleIds.length > 0) {
          sharedQuery.role = { $in: allowedRoleIds };
        }

        logger.info(`📱 [PUSH SERVICE] Buscando en Shared con query:`, JSON.stringify(sharedQuery, null, 2));

        const sharedAssociations = await Shared.find(sharedQuery)
          .populate('user', 'name email status')
          .populate('role', 'nombre descripcion');

        logger.info(`📱 [PUSH SERVICE] Asociaciones encontradas en Shared: ${sharedAssociations.length}`);

        // Agrupar por usuario (un usuario puede tener múltiples asociaciones)
        const usersMap = new Map();
        sharedAssociations.forEach(assoc => {
          if (assoc.user) {
            const userId = assoc.user._id.toString();
            if (!usersMap.has(userId)) {
              usersMap.set(userId, {
                userId: assoc.user._id,
                user: assoc.user,
                roles: []
              });
            }
            const userData = usersMap.get(userId);
            if (assoc.role && !userData.roles.includes(assoc.role.nombre)) {
              userData.roles.push(assoc.role.nombre);
            }
          }
        });

        recipients = Array.from(usersMap.values());

        logger.info(`📱 [PUSH SERVICE] Usuarios encontrados en Shared: ${recipients.length}`);
        recipients.forEach(recipient => {
          logger.info(`   - ${recipient.user.name} (${recipient.user.email}) - Roles: ${recipient.roles.join(', ')}`);
        });
        break;

      case 'coordinators':
        // Solo coordinadores con los mismos filtros
        const coordinatorRoleId = roleMap['coordinador'];
        if (!coordinatorRoleId) {
          throw new Error('Rol coordinador no encontrado');
        }

        const coordinatorQuery = {
          account: accountId,
          role: coordinatorRoleId,
          status: 'active'
        };

        if (filters.divisionId) {
          coordinatorQuery.division = filters.divisionId;
        }

        const coordinatorAssociations = await Shared.find(coordinatorQuery)
          .populate('user', 'name email status');

        const coordinatorUsersMap = new Map();
        coordinatorAssociations.forEach(assoc => {
          if (assoc.user && assoc.user.status === 'active') {
            if (!coordinatorUsersMap.has(assoc.user._id.toString())) {
              coordinatorUsersMap.set(assoc.user._id.toString(), {
                userId: assoc.user._id,
                user: assoc.user,
                roles: []
              });
            }
          }
        });

        recipients = Array.from(coordinatorUsersMap.values());
        break;

      default:
        throw new Error(`Tipo de destino no válido: ${targetType}`);
    }

    // Obtener dispositivos activos para cada destinatario
    const recipientsWithDevices = [];
    for (const recipient of recipients) {
      const devices = await Device.find({
        userId: recipient.userId,
        isActive: true,
        pushToken: { $exists: true, $ne: null }
      });

      if (devices.length > 0) {
        recipientsWithDevices.push({
          ...recipient,
          devices: devices
        });
      }
    }

    logger.info(`📱 [PUSH SERVICE] Generados ${recipientsWithDevices.length} destinatarios con dispositivos de ${recipients.length} usuarios totales`);

    return recipientsWithDevices;
  } catch (error) {
    logger.error('❌ [PUSH SERVICE] Error generando destinatarios:', error);
    throw error;
  }
}

module.exports = {
  generateRecipients
};

