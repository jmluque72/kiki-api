const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

// Importar modelos
const User = require('./shared/models/User');
const Account = require('./shared/models/Account');
const Role = require('./shared/models/Role');
const Shared = require("./shared/models/Shared");

const API_BASE_URL = 'http://localhost:3000/api';

async function createTestUser() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ki-api');
    
    // Buscar o crear rol
    let role = await Role.findOne({ nombre: 'familyviewer' });
    if (!role) {
      role = await Role.create({
        nombre: 'familyviewer',
        descripcion: 'Visualizador de familia',
        nivel: 5
      });
    }

    // Buscar o crear usuario
    let user = await User.findOne({ email: 'test-activities@kiki.ar' });
    if (!user) {
      user = await User.create({
        email: 'test-activities@kiki.ar',
        password: 'password123',
        name: 'Test User Activities',
        role: role._id,
        status: 'approved'
      });
    }

    // Buscar o crear cuenta
    let account = await Account.findOne({ nombre: 'Test Account' });
    if (!account) {
      account = await Account.create({
        nombre: 'Test Account',
        razonSocial: 'Test Account S.A.',
        activo: true,
        usuarioAdministrador: user._id,
        address: 'Test Address 123',
        phone: '1234567890',
        email: 'test@account.com'
      });
    }

    // Crear asociación
    let association = await Shared.findOne({ 
      user: user._id, 
      account: account._id 
    });
    
    if (!association) {
      association = await Shared.create({
        user: user._id,
        account: account._id,
        status: 'active',
        createdBy: user._id,
        role: role._id,
        permissions: []
      });
    }

    console.log('✅ Usuario de prueba creado/verificado');
    return {
      email: 'test-activities@kiki.ar',
      password: 'password123'
    };
  } catch (error) {
    console.error('Error creando usuario de prueba:', error);
    throw error;
  }
}

async function testActivitiesMobile() {
  try {
    console.log('🧪 Probando funcionalidad de actividades para mobile...\n');

    // Crear usuario de prueba
    const testCredentials = await createTestUser();

    // 1. Login para obtener token
    console.log('1️⃣ Haciendo login...');
    const loginResponse = await axios.post(`${API_BASE_URL}/users/login`, {
      email: testCredentials.email,
      password: testCredentials.password
    });

    if (!loginResponse.data.success) {
      throw new Error(`Login falló: ${loginResponse.data.message}`);
    }

    const token = loginResponse.data.data.token;
    const associations = loginResponse.data.data.associations;
    
    console.log('✅ Login exitoso');
    console.log(`📋 Asociaciones encontradas: ${associations.length}`);
    
    associations.forEach((assoc, index) => {
      console.log(`   ${index + 1}. ${assoc.account.nombre} - ${assoc.status}`);
      if (assoc.division) {
        console.log(`      División: ${assoc.division.nombre}`);
      }
    });

    // 2. Probar endpoint de actividades con diferentes filtros
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // Probar sin filtro de división
    console.log('\n2️⃣ Probando actividades sin filtro de división...');
    const activitiesResponse1 = await axios.get(`${API_BASE_URL}/activities/mobile?accountId=${associations[0].account._id}`, { headers });
    
    if (activitiesResponse1.data.success) {
      console.log(`✅ Actividades obtenidas: ${activitiesResponse1.data.data.activities.length}`);
      activitiesResponse1.data.data.activities.forEach((activity, index) => {
        console.log(`   ${index + 1}. ${activity.tipo} - ${activity.descripcion}`);
        if (activity.division) {
          console.log(`      División: ${activity.division.nombre}`);
        }
      });
    } else {
      console.log(`❌ Error: ${activitiesResponse1.data.message}`);
    }

    // Probar con filtro de división si existe
    const associationWithDivision = associations.find(assoc => assoc.division);
    if (associationWithDivision) {
      console.log('\n3️⃣ Probando actividades con filtro de división...');
      const activitiesResponse2 = await axios.get(
        `${API_BASE_URL}/activities/mobile?accountId=${associationWithDivision.account._id}&divisionId=${associationWithDivision.division._id}`, 
        { headers }
      );
      
      if (activitiesResponse2.data.success) {
        console.log(`✅ Actividades filtradas obtenidas: ${activitiesResponse2.data.data.activities.length}`);
        activitiesResponse2.data.data.activities.forEach((activity, index) => {
          console.log(`   ${index + 1}. ${activity.tipo} - ${activity.descripcion}`);
        });
      } else {
        console.log(`❌ Error: ${activitiesResponse2.data.message}`);
      }
    } else {
      console.log('\n3️⃣ No hay asociaciones con división para probar filtro');
    }

    // 3. Probar acceso denegado
    console.log('\n4️⃣ Probando acceso denegado...');
    try {
      await axios.get(`${API_BASE_URL}/activities/mobile?accountId=invalid_account_id`, { headers });
      console.log('❌ Debería haber fallado');
    } catch (error) {
      if (error.response?.status === 403) {
        console.log('✅ Acceso denegado correctamente');
      } else {
        console.log(`❌ Error inesperado: ${error.response?.data?.message}`);
      }
    }

    console.log('\n🎉 Pruebas completadas exitosamente!');

  } catch (error) {
    console.error('❌ Error en las pruebas:', error.response?.data || error.message);
  } finally {
    await mongoose.disconnect();
  }
}

testActivitiesMobile(); 