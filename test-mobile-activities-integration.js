const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

// Importar modelos
const User = require('./shared/models/User');
const Account = require('./shared/models/Account');
const Role = require('./shared/models/Role');
const Shared = require("./shared/models/Shared");
const Activity = require('./shared/models/Activity');
const Grupo = require('./shared/models/Grupo');

const API_BASE_URL = 'http://localhost:3000/api';

async function createTestData() {
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
    let user = await User.findOne({ email: 'test-mobile-activities@kiki.ar' });
    if (!user) {
      user = await User.create({
        email: 'test-mobile-activities@kiki.ar',
        password: 'password123',
        name: 'Test Mobile Activities User',
        role: role._id,
        status: 'approved'
      });
    }

    // Buscar o crear cuenta
    let account = await Account.findOne({ nombre: 'Test Mobile Account' });
    if (!account) {
      account = await Account.create({
        nombre: 'Test Mobile Account',
        razonSocial: 'Test Mobile Account S.A.',
        activo: true,
        usuarioAdministrador: user._id,
        address: 'Test Address 123',
        phone: '1234567890',
        email: 'test@mobileaccount.com'
      });
    }

    // Buscar o crear división
    let division = await Grupo.findOne({ nombre: 'Test Division' });
    if (!division) {
      division = await Grupo.create({
        nombre: 'Test Division',
        descripcion: 'División de prueba para mobile',
        cuenta: account._id,
        creadoPor: user._id,
        activo: true
      });
    }

    // Crear asociación con división
    let association = await Shared.findOne({ 
      user: user._id, 
      account: account._id 
    });
    
    if (!association) {
      association = await Shared.create({
        user: user._id,
        account: account._id,
        division: division._id,
        status: 'active',
        createdBy: user._id,
        role: role._id,
        permissions: []
      });
    }

    // Crear algunas actividades de prueba
    const activities = await Activity.find({ account: account._id });
    if (activities.length === 0) {
      console.log('📝 Creando actividades de prueba...');
      
      await Activity.create([
        {
          usuario: user._id,
          account: account._id,
          division: division._id,
          tipo: 'login',
          entidad: 'user',
          entidadId: user._id,
          descripcion: 'Usuario inició sesión en la aplicación móvil',
          datos: { platform: 'mobile', appVersion: '1.0.0' },
          ip: '192.168.1.100',
          userAgent: 'KikiApp/1.0.0',
          activo: true
        },
        {
          usuario: user._id,
          account: account._id,
          division: division._id,
          tipo: 'create',
          entidad: 'account',
          entidadId: account._id,
          descripcion: 'Usuario visualizó la pantalla de actividades',
          datos: { screen: 'ActividadScreen', institution: account.nombre },
          ip: '192.168.1.100',
          userAgent: 'KikiApp/1.0.0',
          activo: true
        },
        {
          usuario: user._id,
          account: account._id,
          tipo: 'update',
          entidad: 'account',
          entidadId: account._id,
          descripcion: 'Usuario seleccionó institución',
          datos: { institutionName: account.nombre, hasDivision: true },
          ip: '192.168.1.100',
          userAgent: 'KikiApp/1.0.0',
          activo: true
        }
      ]);
      
      console.log('✅ Actividades de prueba creadas');
    }

    console.log('✅ Datos de prueba creados/verificados');
    return {
      email: 'test-mobile-activities@kiki.ar',
      password: 'password123',
      accountId: account._id,
      divisionId: division._id
    };
  } catch (error) {
    console.error('Error creando datos de prueba:', error);
    throw error;
  }
}

async function testMobileActivitiesIntegration() {
  try {
    console.log('🧪 Probando integración completa de actividades para mobile...\n');

    // Crear datos de prueba
    const testData = await createTestData();

    // 1. Login para obtener token
    console.log('1️⃣ Haciendo login...');
    const loginResponse = await axios.post(`${API_BASE_URL}/users/login`, {
      email: testData.email,
      password: testData.password
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

    // 2. Probar endpoint de actividades sin filtro de división
    console.log('\n2️⃣ Probando actividades sin filtro de división...');
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    const activitiesResponse1 = await axios.get(`${API_BASE_URL}/activities/mobile?accountId=${testData.accountId}`, { headers });
    
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

    // 3. Probar endpoint de actividades con filtro de división
    console.log('\n3️⃣ Probando actividades con filtro de división...');
    const activitiesResponse2 = await axios.get(
      `${API_BASE_URL}/activities/mobile?accountId=${testData.accountId}&divisionId=${testData.divisionId}`, 
      { headers }
    );
    
    if (activitiesResponse2.data.success) {
      console.log(`✅ Actividades filtradas obtenidas: ${activitiesResponse2.data.data.activities.length}`);
      activitiesResponse2.data.data.activities.forEach((activity, index) => {
        console.log(`   ${index + 1}. ${activity.tipo} - ${activity.descripcion}`);
        if (activity.division) {
          console.log(`      División: ${activity.division.nombre}`);
        }
      });
    } else {
      console.log(`❌ Error: ${activitiesResponse2.data.message}`);
    }

    // 4. Simular petición desde mobile app
    console.log('\n4️⃣ Simulando petición desde mobile app...');
    console.log('📱 Headers que enviaría la app:');
    console.log(`   Authorization: Bearer ${token.substring(0, 20)}...`);
    console.log(`   Content-Type: application/json`);
    console.log('📱 URL que llamaría la app:');
    console.log(`   GET ${API_BASE_URL}/activities/mobile?accountId=${testData.accountId}&divisionId=${testData.divisionId}`);

    console.log('\n🎉 Integración completa probada exitosamente!');
    console.log('\n📋 Resumen para testing en mobile:');
    console.log(`   Email: ${testData.email}`);
    console.log(`   Password: ${testData.password}`);
    console.log(`   Account ID: ${testData.accountId}`);
    console.log(`   Division ID: ${testData.divisionId}`);

  } catch (error) {
    console.error('❌ Error en las pruebas:', error.response?.data || error.message);
  } finally {
    await mongoose.disconnect();
  }
}

testMobileActivitiesIntegration(); 