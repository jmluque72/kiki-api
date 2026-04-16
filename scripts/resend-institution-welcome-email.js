require('dotenv').config();

const mongoose = require('mongoose');
const dbConfig = require('../config/database');
require('../shared/models/Account');
const User = require('../shared/models/User');
const emailConfig = require('../config/email.config');

function parseArgs(argv) {
  const args = {};

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = value;
    i += 1;
  }

  return args;
}

function printUsage() {
  console.log('Uso:');
  console.log('  node scripts/resend-institution-welcome-email.js --email <email>');
  console.log('');
  console.log('Ejemplo:');
  console.log('  node scripts/resend-institution-welcome-email.js --email admin@colegio.com');
}

async function main() {
  let mongoConnected = false;

  try {
    const args = parseArgs(process.argv);

    if (args.help || args.h) {
      printUsage();
      process.exit(0);
    }

    const email = String(args.email || '').toLowerCase().trim();

    if (!email) {
      console.error('❌ Falta el parámetro obligatorio --email.');
      printUsage();
      process.exit(1);
    }

    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(dbConfig.MONGODB_URI);
    mongoConnected = true;
    console.log('✅ Conectado a MongoDB');

    const user = await User.findOne({ email }).populate('account', 'nombre');
    if (!user) {
      throw new Error(`No se encontró usuario con email: ${email}`);
    }

    const newPassword = emailConfig.generateRandomPassword(12);
    const userName = typeof user.name === 'string' ? user.name : 'Administrador';
    const institutionName = user.account?.nombre || 'Kiki App';

    user.password = newPassword;
    user.isFirstLogin = true;
    await user.save();

    console.log('🔐 Contraseña regenerada y actualizada en usuario.');
    console.log('📧 Enviando email de alta de institución...');
    console.log(`   Destino: ${email}`);
    console.log(`   Usuario: ${userName}`);
    console.log(`   Institución: ${institutionName}`);

    await emailConfig.sendInstitutionWelcomeEmail(
      email,
      userName,
      institutionName,
      newPassword
    );

    console.log('✅ Email enviado correctamente con nueva contraseña.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error reenviando email de alta de institución:', error.message);
    process.exit(1);
  } finally {
    if (mongoConnected) {
      await mongoose.connection.close();
    }
  }
}

main();
