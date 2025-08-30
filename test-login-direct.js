const mongoose = require('mongoose');
const User = require('./shared/models/User');
const Role = require('./shared/models/Role');
const Shared = require("./shared/models/Shared");
const Account = require('./shared/models/Account');
const Grupo = require('./shared/models/Grupo');

// Conectar a MongoDB
mongoose.connect('mongodb://localhost:27017/kiki', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testLoginDirect() {
  try {
    console.log('🔍 Probando login directamente...\n');

    const email = 'coordinador@test.com';
    const password = 'password123';

    console.log('📧 Email:', email);
    console.log('🔑 Password:', password);

    // Buscar usuario
    const user = await User.findOne({ email }).populate('role');
    
    if (!user) {
      console.log('❌ Usuario no encontrado');
      return;
    }

    console.log('✅ Usuario encontrado:');
    console.log('   - Email:', user.email);
    console.log('   - Name:', user.name);
    console.log('   - Status:', user.status);
    console.log('   - Role:', user.role?.nombre);

    // Verificar status
    if (user.status !== 'approved') {
      console.log('❌ Usuario no aprobado');
      return;
    }

    // Verificar contraseña
    console.log('🔑 Verificando contraseña...');
    const isPasswordValid = await user.comparePassword(password);
    console.log('   - Contraseña válida:', isPasswordValid);
    
    if (!isPasswordValid) {
      console.log('❌ Contraseña inválida');
      return;
    }

    // Verificar asociaciones
    console.log('🔗 Verificando asociaciones...');
    const userAssociations = await Shared.find({ 
      user: user._id 
    }).populate('account', 'nombre razonSocial activo');

    console.log('   - Total asociaciones:', userAssociations.length);
    
    const hasActiveAssociation = userAssociations.some(assoc => assoc.status === 'active');
    console.log('   - Tiene asociación activa:', hasActiveAssociation);

    if (!hasActiveAssociation) {
      console.log('❌ No tiene asociaciones activas');
      return;
    }

    console.log('✅ Login exitoso - Usuario válido para crear eventos');

  } catch (error) {
    console.error('❌ Error en test:', error);
  } finally {
    mongoose.connection.close();
  }
}

testLoginDirect();
