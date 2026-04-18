#!/usr/bin/env node

/**
 * Script para agregar índices recomendados a MongoDB
 * Uso: node api/scripts/add-recommended-indexes.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config/database');

// Importar modelos
const Shared = require('../shared/models/Shared');
const Student = require('../shared/models/Student');
const User = require('../shared/models/User');
const Event = require('../shared/models/Event');
const Activity = require('../shared/models/Activity');
const Asistencia = require('../shared/models/Asistencia');
const Pickup = require('../shared/models/Pickup');
const Notification = require('../shared/models/Notification');
const StudentActionLog = require('../shared/models/StudentActionLog');

async function addIndexes() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(config.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Conectado a MongoDB');

    const results = {
      created: [],
      skipped: [],
      errors: []
    };

    // ===== SHARED - Índices Críticos =====
    console.log('\n📊 Agregando índices a Shared...');
    try {
      await Shared.collection.createIndex({ user: 1, account: 1, status: 1 }, { background: true });
      results.created.push('Shared: { user: 1, account: 1, status: 1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('Shared: { user: 1, account: 1, status: 1 } (ya existe)');
      else results.errors.push(`Shared: { user: 1, account: 1, status: 1 } - ${e.message}`);
    }

    try {
      await Shared.collection.createIndex({ user: 1, status: 1, createdAt: -1 }, { background: true });
      results.created.push('Shared: { user: 1, status: 1, createdAt: -1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('Shared: { user: 1, status: 1, createdAt: -1 } (ya existe)');
      else results.errors.push(`Shared: { user: 1, status: 1, createdAt: -1 } - ${e.message}`);
    }

    try {
      await Shared.collection.createIndex({ account: 1, status: 1, createdAt: -1 }, { background: true });
      results.created.push('Shared: { account: 1, status: 1, createdAt: -1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('Shared: { account: 1, status: 1, createdAt: -1 } (ya existe)');
      else results.errors.push(`Shared: { account: 1, status: 1, createdAt: -1 } - ${e.message}`);
    }

    // ===== STUDENT - Índices Recomendados =====
    console.log('\n📊 Agregando índices a Student...');
    try {
      await Student.collection.createIndex({ account: 1, division: 1, apellido: 1, nombre: 1 }, { background: true });
      results.created.push('Student: { account: 1, division: 1, apellido: 1, nombre: 1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('Student: { account: 1, division: 1, apellido: 1, nombre: 1 } (ya existe)');
      else results.errors.push(`Student: { account: 1, division: 1, apellido: 1, nombre: 1 } - ${e.message}`);
    }

    try {
      await Student.collection.createIndex({ tutor: 1 }, { background: true });
      results.created.push('Student: { tutor: 1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('Student: { tutor: 1 } (ya existe)');
      else results.errors.push(`Student: { tutor: 1 } - ${e.message}`);
    }

    try {
      await Student.collection.createIndex({ account: 1, activo: 1 }, { background: true });
      results.created.push('Student: { account: 1, activo: 1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('Student: { account: 1, activo: 1 } (ya existe)');
      else results.errors.push(`Student: { account: 1, activo: 1 } - ${e.message}`);
    }

    // ===== USER - Índices Recomendados =====
    console.log('\n📊 Agregando índices a User...');
    try {
      await User.collection.createIndex({ account: 1, status: 1, createdAt: -1 }, { background: true });
      results.created.push('User: { account: 1, status: 1, createdAt: -1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('User: { account: 1, status: 1, createdAt: -1 } (ya existe)');
      else results.errors.push(`User: { account: 1, status: 1, createdAt: -1 } - ${e.message}`);
    }

    try {
      await User.collection.createIndex({ role: 1, status: 1 }, { background: true });
      results.created.push('User: { role: 1, status: 1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('User: { role: 1, status: 1 } (ya existe)');
      else results.errors.push(`User: { role: 1, status: 1 } - ${e.message}`);
    }

    // ===== EVENT - Índices Críticos (no tiene índices actuales) =====
    console.log('\n📊 Agregando índices a Event...');
    try {
      await Event.collection.createIndex({ institucion: 1, division: 1, estado: 1 }, { background: true });
      results.created.push('Event: { institucion: 1, division: 1, estado: 1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('Event: { institucion: 1, division: 1, estado: 1 } (ya existe)');
      else results.errors.push(`Event: { institucion: 1, division: 1, estado: 1 } - ${e.message}`);
    }

    try {
      await Event.collection.createIndex({ fecha: 1, estado: 1 }, { background: true });
      results.created.push('Event: { fecha: 1, estado: 1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('Event: { fecha: 1, estado: 1 } (ya existe)');
      else results.errors.push(`Event: { fecha: 1, estado: 1 } - ${e.message}`);
    }

    try {
      await Event.collection.createIndex({ creador: 1, createdAt: -1 }, { background: true });
      results.created.push('Event: { creador: 1, createdAt: -1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('Event: { creador: 1, createdAt: -1 } (ya existe)');
      else results.errors.push(`Event: { creador: 1, createdAt: -1 } - ${e.message}`);
    }

    try {
      await Event.collection.createIndex({ institucion: 1, estado: 1, fecha: 1 }, { background: true });
      results.created.push('Event: { institucion: 1, estado: 1, fecha: 1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('Event: { institucion: 1, estado: 1, fecha: 1 } (ya existe)');
      else results.errors.push(`Event: { institucion: 1, estado: 1, fecha: 1 } - ${e.message}`);
    }

    // ===== ACTIVITY - Índices Críticos =====
    console.log('\n📊 Agregando índices a Activity...');
    try {
      await Activity.collection.createIndex({ account: 1, division: 1, activo: 1, createdAt: -1 }, { background: true });
      results.created.push('Activity: { account: 1, division: 1, activo: 1, createdAt: -1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('Activity: { account: 1, division: 1, activo: 1, createdAt: -1 } (ya existe)');
      else results.errors.push(`Activity: { account: 1, division: 1, activo: 1, createdAt: -1 } - ${e.message}`);
    }

    try {
      await Activity.collection.createIndex({ account: 1, division: 1, fecha: 1, activo: 1 }, { background: true });
      results.created.push('Activity: { account: 1, division: 1, fecha: 1, activo: 1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('Activity: { account: 1, division: 1, fecha: 1, activo: 1 } (ya existe)');
      else results.errors.push(`Activity: { account: 1, division: 1, fecha: 1, activo: 1 } - ${e.message}`);
    }

    try {
      await Activity.collection.createIndex({ division: 1, activo: 1, createdAt: -1 }, { background: true });
      results.created.push('Activity: { division: 1, activo: 1, createdAt: -1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('Activity: { division: 1, activo: 1, createdAt: -1 } (ya existe)');
      else results.errors.push(`Activity: { division: 1, activo: 1, createdAt: -1 } - ${e.message}`);
    }

    // ===== ASISTENCIA - Índices Recomendados =====
    console.log('\n📊 Agregando índices a Asistencia...');
    try {
      await Asistencia.collection.createIndex({ account: 1, fecha: 1 }, { background: true });
      results.created.push('Asistencia: { account: 1, fecha: 1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('Asistencia: { account: 1, fecha: 1 } (ya existe)');
      else results.errors.push(`Asistencia: { account: 1, fecha: 1 } - ${e.message}`);
    }

    try {
      await Asistencia.collection.createIndex({ division: 1, fecha: 1 }, { background: true });
      results.created.push('Asistencia: { division: 1, fecha: 1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('Asistencia: { division: 1, fecha: 1 } (ya existe)');
      else results.errors.push(`Asistencia: { division: 1, fecha: 1 } - ${e.message}`);
    }

    // ===== PICKUP - Índices Recomendados =====
    console.log('\n📊 Agregando índices a Pickup...');
    try {
      await Pickup.collection.createIndex({ account: 1, status: 1, createdAt: -1 }, { background: true });
      results.created.push('Pickup: { account: 1, status: 1, createdAt: -1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('Pickup: { account: 1, status: 1, createdAt: -1 } (ya existe)');
      else results.errors.push(`Pickup: { account: 1, status: 1, createdAt: -1 } - ${e.message}`);
    }

    try {
      await Pickup.collection.createIndex({ account: 1, division: 1, status: 1, createdAt: -1 }, { background: true });
      results.created.push('Pickup: { account: 1, division: 1, status: 1, createdAt: -1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('Pickup: { account: 1, division: 1, status: 1, createdAt: -1 } (ya existe)');
      else results.errors.push(`Pickup: { account: 1, division: 1, status: 1, createdAt: -1 } - ${e.message}`);
    }

    // ===== NOTIFICATION - Índices Recomendados =====
    console.log('\n📊 Agregando índices a Notification...');
    try {
      await Notification.collection.createIndex({ recipients: 1, status: 1, sentAt: -1 }, { background: true });
      results.created.push('Notification: { recipients: 1, status: 1, sentAt: -1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('Notification: { recipients: 1, status: 1, sentAt: -1 } (ya existe)');
      else results.errors.push(`Notification: { recipients: 1, status: 1, sentAt: -1 } - ${e.message}`);
    }

    try {
      await Notification.collection.createIndex({ account: 1, status: 1, sentAt: -1 }, { background: true });
      results.created.push('Notification: { account: 1, status: 1, sentAt: -1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('Notification: { account: 1, status: 1, sentAt: -1 } (ya existe)');
      else results.errors.push(`Notification: { account: 1, status: 1, sentAt: -1 } - ${e.message}`);
    }

    // ===== STUDENTACTIONLOG - Índices Mejorados =====
    console.log('\n📊 Mejorando índices de StudentActionLog...');
    try {
      await StudentActionLog.collection.createIndex({ division: 1, fechaAccion: -1 }, { background: true });
      results.created.push('StudentActionLog: { division: 1, fechaAccion: -1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('StudentActionLog: { division: 1, fechaAccion: -1 } (ya existe)');
      else results.errors.push(`StudentActionLog: { division: 1, fechaAccion: -1 } - ${e.message}`);
    }

    try {
      await StudentActionLog.collection.createIndex({ account: 1, fechaAccion: -1 }, { background: true });
      results.created.push('StudentActionLog: { account: 1, fechaAccion: -1 }');
    } catch (e) {
      if (e.code === 85) results.skipped.push('StudentActionLog: { account: 1, fechaAccion: -1 } (ya existe)');
      else results.errors.push(`StudentActionLog: { account: 1, fechaAccion: -1 } - ${e.message}`);
    }

    // Resumen
    console.log('\n📊 ===== RESUMEN =====');
    console.log(`✅ Índices creados: ${results.created.length}`);
    results.created.forEach(idx => console.log(`   - ${idx}`));
    
    console.log(`⏭️  Índices omitidos (ya existían): ${results.skipped.length}`);
    results.skipped.forEach(idx => console.log(`   - ${idx}`));
    
    if (results.errors.length > 0) {
      console.log(`❌ Errores: ${results.errors.length}`);
      results.errors.forEach(err => console.log(`   - ${err}`));
    }

    console.log('\n✅ Proceso completado');
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  addIndexes();
}

module.exports = { addIndexes };

