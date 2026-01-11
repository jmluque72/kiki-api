const mongoose = require('mongoose');
require('dotenv').config();
const config = require('../config/database');
const Device = require('../shared/models/Device');
const Shared = require('../shared/models/Shared');
const Student = require('../shared/models/Student');
const Notification = require('../shared/models/Notification');

async function debugPushNotifications() {
  try {
    console.log('🔍 [DEBUG PUSH] Conectando a MongoDB...');
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ [DEBUG PUSH] Conectado a MongoDB\n');

    // 1. Verificar dispositivos registrados
    console.log('📱 [DEBUG PUSH] ========== DISPOSITIVOS REGISTRADOS ==========');
    const devices = await Device.find({ isActive: true }).populate('userId', 'name email');
    console.log(`Total dispositivos activos: ${devices.length}`);
    devices.forEach((device, index) => {
      console.log(`\n${index + 1}. Dispositivo ID: ${device._id}`);
      console.log(`   Usuario: ${device.userId?.name || device.userId?.email || 'N/A'}`);
      console.log(`   Plataforma: ${device.platform}`);
      console.log(`   Token: ${device.pushToken.substring(0, 30)}...`);
      console.log(`   Último uso: ${device.lastUsed}`);
    });

    // 2. Verificar notificaciones recientes
    console.log('\n\n🔔 [DEBUG PUSH] ========== NOTIFICACIONES RECIENTES ==========');
    const recentNotifications = await Notification.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('sender', 'name email')
      .populate('account', 'nombre');
    
    console.log(`Total notificaciones recientes: ${recentNotifications.length}`);
    recentNotifications.forEach((notif, index) => {
      console.log(`\n${index + 1}. Notificación ID: ${notif._id}`);
      console.log(`   Título: ${notif.title}`);
      console.log(`   Estado: ${notif.status}`);
      console.log(`   Tipo: ${notif.type}`);
      console.log(`   Recipients: ${notif.recipients?.length || 0}`);
      console.log(`   Creada: ${notif.createdAt}`);
    });

    // 3. Verificar asociaciones de estudiantes con familiares
    console.log('\n\n👨‍👩‍👧 [DEBUG PUSH] ========== ASOCIACIONES ESTUDIANTES-FAMILIA ==========');
    const students = await Student.find({ activo: true }).limit(5);
    console.log(`Verificando ${students.length} estudiantes...`);
    
    for (const student of students) {
      const associations = await Shared.find({
        student: student._id,
        status: 'active',
        'role.nombre': { $in: ['familyadmin', 'familyviewer'] }
      }).populate('user', 'name email').populate('role', 'nombre');
      
      if (associations.length > 0) {
        console.log(`\n📚 Estudiante: ${student.nombre} ${student.apellido}`);
        associations.forEach(assoc => {
          console.log(`   - Familiar: ${assoc.user?.name || assoc.user?.email}`);
          console.log(`     Rol: ${assoc.role?.nombre}`);
          
          // Verificar dispositivos del familiar
          const devices = await Device.find({ userId: assoc.user._id, isActive: true });
          console.log(`     Dispositivos: ${devices.length}`);
          devices.forEach(dev => {
            console.log(`       - ${dev.platform}: ${dev.pushToken.substring(0, 30)}...`);
          });
        });
      }
    }

    // 4. Verificar configuración SQS
    console.log('\n\n⚙️  [DEBUG PUSH] ========== CONFIGURACIÓN SQS ==========');
    const { PUSH_QUEUE_URL } = require('../config/sqs.config');
    console.log(`PUSH_QUEUE_URL: ${PUSH_QUEUE_URL || 'NO CONFIGURADA'}`);

    // 5. Verificar servicio de push
    console.log('\n\n🔧 [DEBUG PUSH] ========== SERVICIO DE PUSH ==========');
    try {
      const pushService = require('../pushNotificationService');
      console.log('✅ Servicio de push disponible');
      console.log(`APNs configurado: ${pushService.apnProvider ? 'Sí' : 'No'}`);
      console.log(`FCM configurado: ${pushService.fcmInitialized ? 'Sí' : 'No'}`);
    } catch (error) {
      console.log('❌ Error cargando servicio de push:', error.message);
    }

    console.log('\n✅ [DEBUG PUSH] Diagnóstico completado');
    process.exit(0);
  } catch (error) {
    console.error('❌ [DEBUG PUSH] Error:', error);
    process.exit(1);
  }
}

debugPushNotifications();
