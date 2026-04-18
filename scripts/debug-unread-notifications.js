require('dotenv').config();
const mongoose = require('mongoose');
// Importar modelos en orden correcto para evitar problemas de dependencias
require('../shared/models/Role');
const User = require('../shared/models/User');
const Student = require('../shared/models/Student');
const Notification = require('../shared/models/Notification');
const Shared = require('../shared/models/Shared');
const ActiveAssociation = require('../shared/models/ActiveAssociation');

async function debugUnreadNotifications() {
  try {
    console.log('🔍 Conectando a MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/microservices_db');
    console.log('✅ Conectado a MongoDB\n');

    const userEmail = 'patricia.torres@yopmail.com';
    const studentName = 'Lucas Muñoz';

    // Buscar usuario
    console.log(`🔍 Buscando usuario: ${userEmail}`);
    const user = await User.findOne({ email: userEmail }).populate('role');
    if (!user) {
      console.log('❌ Usuario no encontrado');
      process.exit(1);
    }
    console.log(`✅ Usuario encontrado: ${user._id}, Rol: ${user.role?.nombre}\n`);

    // Buscar estudiante
    console.log(`🔍 Buscando estudiante: ${studentName}`);
    const student = await Student.findOne({ 
      $or: [
        { nombre: 'Lucas', apellido: 'Muñoz' },
        { nombre: 'Lucas', apellido: 'Muñoz' }
      ]
    });
    if (!student) {
      console.log('❌ Estudiante no encontrado');
      process.exit(1);
    }
    console.log(`✅ Estudiante encontrado: ${student._id}, ${student.nombre} ${student.apellido}\n`);

    // Obtener asociaciones del usuario (sin populate para evitar problemas)
    console.log('🔍 Buscando asociaciones del usuario...');
    const userAssociations = await Shared.find({ 
      user: user._id, 
      status: 'active' 
    });

    console.log(`📊 Asociaciones encontradas: ${userAssociations.length}`);
    userAssociations.forEach(assoc => {
      console.log(`   - Account: ${assoc.account}, Division: ${assoc.division}, Student: ${assoc.student}`);
    });

    // Obtener IDs de estudiantes asociados
    const studentIds = userAssociations
      .map(assoc => assoc.student)
      .filter(id => id);

    console.log(`\n📊 IDs de estudiantes asociados: ${studentIds.length}`);
    studentIds.forEach(id => console.log(`   - ${id}`));

    // Verificar que el estudiante Lucas Muñoz esté en la lista
    const lucasId = student._id.toString();
    const hasLucas = studentIds.some(id => id.toString() === lucasId);
    console.log(`\n🔍 ¿Lucas Muñoz está en las asociaciones? ${hasLucas ? '✅ SÍ' : '❌ NO'}`);
    if (!hasLucas) {
      console.log(`   Agregando manualmente el ID de Lucas: ${lucasId}`);
      studentIds.push(student._id);
    }

    // Obtener IDs de cuentas
    const accountIds = userAssociations.map(assoc => assoc.account);
    console.log(`\n📊 IDs de cuentas: ${accountIds.length}`);
    accountIds.forEach(id => console.log(`   - ${id}`));

    // Buscar todas las notificaciones relacionadas
    console.log('\n🔍 Buscando notificaciones...');
    const allNotifications = await Notification.find({
      account: { $in: accountIds },
      recipients: { $in: studentIds }
    });

    console.log(`📊 Total de notificaciones encontradas: ${allNotifications.length}\n`);

    // Analizar cada notificación
    let unreadCount = 0;
    let readCount = 0;

    allNotifications.forEach((notif, index) => {
      const isRead = notif.readBy && notif.readBy.some(read => 
        read.user && read.user.toString() === user._id.toString()
      );
      
      console.log(`\n📬 Notificación ${index + 1}:`);
      console.log(`   ID: ${notif._id}`);
      console.log(`   Título: ${notif.title}`);
      console.log(`   Recipients: ${notif.recipients.length}`);
      console.log(`   ReadBy: ${notif.readBy?.length || 0} usuarios`);
      if (notif.readBy && notif.readBy.length > 0) {
        console.log(`   Leída por usuarios:`);
        notif.readBy.forEach(read => {
          const userIdStr = read.user?.toString ? read.user.toString() : String(read.user);
          const isThisUser = userIdStr === user._id.toString();
          console.log(`     - ${userIdStr} ${isThisUser ? '✅ (este usuario)' : ''}`);
        });
      }
      console.log(`   Estado: ${isRead ? '✅ LEÍDA' : '❌ NO LEÍDA'}`);

      if (isRead) {
        readCount++;
      } else {
        unreadCount++;
      }
    });

    // Probar la query actual
    console.log('\n🔍 Probando query actual...');
    const query = {
      account: { $in: accountIds },
      recipients: { $in: studentIds },
      $or: [
        { readBy: { $exists: false } },
        { readBy: { $size: 0 } },
        { readBy: { $not: { $elemMatch: { user: user._id } } } }
      ]
    };
    
    const countWithQuery = await Notification.countDocuments(query);
    console.log(`📊 Conteo con query actual: ${countWithQuery}`);

    // Probar query alternativa
    console.log('\n🔍 Probando query alternativa (verificando manualmente)...');
    const notificationsToCheck = await Notification.find({
      account: { $in: accountIds },
      recipients: { $in: studentIds }
    });

    let manualCount = 0;
    notificationsToCheck.forEach(notif => {
      const isRead = notif.readBy && notif.readBy.some(read => {
        const readUserId = read.user?.toString ? read.user.toString() : String(read.user);
        return readUserId === user._id.toString();
      });
      if (!isRead) {
        manualCount++;
      }
    });
    console.log(`📊 Conteo manual (no leídas): ${manualCount}`);

    console.log('\n📊 RESUMEN:');
    console.log(`   Total notificaciones: ${allNotifications.length}`);
    console.log(`   Leídas: ${readCount}`);
    console.log(`   No leídas (manual): ${manualCount}`);
    console.log(`   No leídas (query): ${countWithQuery}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

debugUnreadNotifications();

