#!/usr/bin/env node

const mongoose = require('mongoose');
const config = require('../config/env.config');
const User = require('../shared/models/User');
const Role = require('../shared/models/Role');

// Conectar a la base de datos
const connectDB = async () => {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('📦 Conectado a MongoDB');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error);
    process.exit(1);
  }
};

// Desconectar de la base de datos
const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
  } catch (error) {
    console.error('❌ Error desconectando de MongoDB:', error);
  }
};

// Crear usuario de prueba
const createTestUser = async () => {
  try {
    // Buscar rol de adminaccount
    let adminaccountRole = await Role.findOne({ nombre: 'adminaccount' });
    
    if (!adminaccountRole) {
      console.log('❌ No se encontró el rol adminaccount. Ejecutando seeder de roles...');
      const { seedRoles } = require('../database/seeders/roleSeeder');
      await seedRoles();
      
      // Buscar el rol nuevamente
      adminaccountRole = await Role.findOne({ nombre: 'adminaccount' });
      if (!adminaccountRole) {
        throw new Error('No se pudo crear el rol adminaccount');
      }
    }

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ email: 'test@kiki.ar' });
    
    if (existingUser) {
      console.log('✅ Usuario de prueba ya existe');
      console.log('📧 Email: test@kiki.ar');
      console.log('🔑 Password: test123');
      console.log('👤 Nombre: Test User');
      console.log('🔐 Rol: Adminaccount');
      return;
    }

    // Crear usuario de prueba
    const testUser = new User({
      name: 'Test User',
      email: 'test@kiki.ar',
      password: 'test123',
      role: adminaccountRole._id,
      status: 'approved'
    });

    await testUser.save();
    
    console.log('✅ Usuario de prueba creado exitosamente');
    console.log('📧 Email: test@kiki.ar');
    console.log('🔑 Password: test123');
    console.log('👤 Nombre: Test User');
    console.log('🔐 Rol: Adminaccount');
    
  } catch (error) {
    console.error('❌ Error creando usuario de prueba:', error);
  }
};

// Función principal
const main = async () => {
  await connectDB();
  
  try {
    await createTestUser();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
};

// Ejecutar script
main().catch(console.error); 