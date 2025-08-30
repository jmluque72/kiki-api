const mongoose = require('mongoose');
require('dotenv').config();

// Importar todos los modelos necesarios
const Shared = require("./shared/models/Shared");
const User = require('./shared/models/User');
const Account = require('./shared/models/Account');
const Role = require('./shared/models/Role');

async function updateAllAssociationsToPending() {
  try {
    // Conectar a MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ki-api';
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB');

    // Buscar todas las asociaciones
    const associations = await Shared.find({});
    console.log(`📊 Encontradas ${associations.length} asociaciones`);

    if (associations.length === 0) {
      console.log('ℹ️ No hay asociaciones para actualizar');
      return;
    }

    // Mostrar el estado actual antes de la actualización
    const currentPending = await Shared.find({ status: 'pending' });
    const currentActive = await Shared.find({ status: 'active' });
    const currentInactive = await Shared.find({ status: 'inactive' });

    console.log('\n📈 Estado actual de las asociaciones:');
    console.log(`🟡 Pendientes: ${currentPending.length}`);
    console.log(`🟢 Activas: ${currentActive.length}`);
    console.log(`🔴 Inactivas: ${currentInactive.length}`);

    // Actualizar todas las asociaciones a status 'pending'
    const updateResult = await Shared.updateMany(
      {}, // Actualizar todos los documentos
      { 
        $set: { 
          status: 'pending',
          updatedAt: new Date()
        } 
      }
    );

    console.log(`\n✅ Actualizadas ${updateResult.modifiedCount} asociaciones a status 'pending'`);

    // Verificar el resultado final
    const pendingAssociations = await Shared.find({ status: 'pending' });
    const activeAssociations = await Shared.find({ status: 'active' });
    const inactiveAssociations = await Shared.find({ status: 'inactive' });

    console.log('\n📈 Estado final de las asociaciones:');
    console.log(`🟡 Pendientes: ${pendingAssociations.length}`);
    console.log(`🟢 Activas: ${activeAssociations.length}`);
    console.log(`🔴 Inactivas: ${inactiveAssociations.length}`);

    // Mostrar algunas asociaciones como ejemplo
    if (pendingAssociations.length > 0) {
      console.log('\n📋 Ejemplos de asociaciones actualizadas:');
      const examples = await Shared.find({ status: 'pending' })
        .populate('user', 'name email')
        .populate('account', 'nombre razonSocial')
        .populate('role', 'nombre')
        .limit(3);

      examples.forEach((association, index) => {
        console.log(`${index + 1}. ${association.user.name} (${association.user.email})`);
        console.log(`   Institución: ${association.account.nombre}`);
        console.log(`   Rol: ${association.role.nombre}`);
        console.log(`   Status: ${association.status}`);
        console.log('');
      });
    }

    console.log('🎉 ¡Todas las asociaciones han sido actualizadas a status "pending"!');
    console.log('💡 Ahora puedes probar el sistema de aprobaciones desde el backoffice.');

  } catch (error) {
    console.error('❌ Error actualizando asociaciones:', error);
  } finally {
    // Cerrar conexión
    await mongoose.connection.close();
    console.log('🔌 Conexión a MongoDB cerrada');
  }
}

// Ejecutar el script
updateAllAssociationsToPending(); 