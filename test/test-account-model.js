const mongoose = require('mongoose');
const Account = require('./shared/models/Account');

// Conectar a MongoDB
mongoose.connect('mongodb://localhost:27017/kiki', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testAccountModel() {
  try {
    console.log('🔍 Probando modelo Account...');
    
    // Buscar todas las cuentas
    const accounts = await Account.find();
    console.log('📊 Total de cuentas:', accounts.length);
    
    // Buscar una cuenta específica
    const accountId = '688f69a53cd6202257920b07';
    console.log('🔍 Buscando cuenta con ID:', accountId);
    
    const account = await Account.findById(accountId);
    console.log('🔍 Resultado de Account.findById:', account);
    
    if (account) {
      console.log('✅ Cuenta encontrada:', account.nombre);
    } else {
      console.log('❌ Cuenta no encontrada');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

testAccountModel(); 