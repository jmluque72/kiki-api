require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config/database');
const Shared = require('../shared/models/Shared');
const Role = require('../shared/models/Role');
const Device = require('../shared/models/Device');
const Account = require('../shared/models/Account');
const Grupo = require('../shared/models/Grupo');

async function debugDivisionPush() {
  try {
    await mongoose.connect(config.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Conectado a MongoDB\n');

    // Buscar la cuenta BAMBINO
    const account = await Account.findOne({ nombre: 'BAMBINO' });
    if (!account) {
      console.log('❌ Cuenta BAMBINO no encontrada');
      process.exit(1);
    }
    console.log(`✅ Cuenta encontrada: ${account.nombre} (${account._id})\n`);

    // Buscar la división "SALA ROJA" o similar
    const division = await Grupo.findOne({ 
      cuenta: account._id,
      nombre: { $regex: /roja/i }
    });
    if (!division) {
      console.log('❌ División con "roja" no encontrada');
      // Listar todas las divisiones de la cuenta
      const allDivisions = await Grupo.find({ cuenta: account._id });
      console.log('\n📋 Divisiones disponibles en BAMBINO:');
      allDivisions.forEach((div, i) => {
        console.log(`   ${i + 1}. ${div.nombre} (${div._id})`);
      });
      process.exit(1);
    }
    console.log(`✅ División encontrada: ${division.nombre} (${division._id})\n`);

    // Obtener roles
    const roleMap = {};
    const roleNames = ['coordinador', 'familyadmin', 'familyviewer'];
    for (const roleName of roleNames) {
      const role = await Role.findOne({ nombre: roleName });
      if (role) {
        roleMap[roleName] = role._id;
        console.log(`✅ Rol ${roleName}: ${role._id}`);
      }
    }
    console.log('');

    const roleIds = Object.values(roleMap);
    console.log(`📋 IDs de roles: ${roleIds.join(', ')}\n`);

    // Buscar asociaciones en Shared
    const associations = await Shared.find({
      account: account._id,
      division: division._id,
      role: { $in: roleIds },
      status: 'active'
    })
    .populate('user', 'name email status')
    .populate('role', 'nombre descripcion')
    .populate('student', 'nombre apellido');

    console.log(`📋 Asociaciones encontradas: ${associations.length}\n`);

    if (associations.length === 0) {
      console.log('⚠️  No se encontraron asociaciones. Verificando sin filtros...\n');
      
      // Buscar sin filtro de rol
      const allAssociations = await Shared.find({
        account: account._id,
        division: division._id,
        status: 'active'
      })
      .populate('user', 'name email status')
      .populate('role', 'nombre descripcion');

      console.log(`📋 Asociaciones sin filtro de rol: ${allAssociations.length}`);
      allAssociations.forEach((assoc, i) => {
        console.log(`   ${i + 1}. Usuario: ${assoc.user?.name || 'N/A'} (${assoc.user?.email || 'N/A'})`);
        console.log(`      Rol: ${assoc.role?.nombre || 'N/A'}`);
        console.log(`      Estado usuario: ${assoc.user?.status || 'N/A'}`);
      });
    } else {
      // Agrupar por usuario
      const usersMap = new Map();
      associations.forEach(assoc => {
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

      console.log(`👥 Usuarios únicos: ${usersMap.size}\n`);
      usersMap.forEach((userData, userId) => {
        console.log(`   - ${userData.user.name} (${userData.user.email})`);
        console.log(`     Roles: ${userData.roles.join(', ')}`);
        console.log(`     Estado: ${userData.user.status}`);

        // Buscar dispositivos
        Device.find({ userId: userData.userId, isActive: true })
          .then(devices => {
            console.log(`     Dispositivos: ${devices.length}`);
            devices.forEach(device => {
              console.log(`       - ${device.platform} - Token: ${device.pushToken?.substring(0, 30)}...`);
            });
          });
      });
    }

    await mongoose.connection.close();
    console.log('\n✅ Diagnóstico completado');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

debugDivisionPush();

