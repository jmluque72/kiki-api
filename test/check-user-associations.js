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

async function checkUserAssociations() {
  try {
    console.log('🔍 [CHECK ASSOCIATIONS] Verificando asociaciones del usuario coordinador...');
    
    // Esperar a que se conecte
    await new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    
    console.log('✅ [CHECK ASSOCIATIONS] Conectado a MongoDB');
    
    // Buscar usuario coordinador
    console.log('👤 [CHECK ASSOCIATIONS] Buscando usuario coordinador@test.com...');
    const user = await User.findOne({ email: 'coordinador@test.com' }).populate('role');
    
    if (!user) {
      console.log('❌ [CHECK ASSOCIATIONS] Usuario coordinador@test.com no encontrado');
      return;
    }
    
    console.log('✅ [CHECK ASSOCIATIONS] Usuario encontrado:');
    console.log('   - ID:', user._id);
    console.log('   - Email:', user.email);
    console.log('   - Rol:', user.role?.nombre);
    console.log('   - Status:', user.status);
    
    // Buscar asociaciones del usuario
    console.log('🔗 [CHECK ASSOCIATIONS] Buscando asociaciones...');
    const associations = await Shared.find({ user: user._id })
      .populate('account', 'nombre razonSocial activo')
      .populate('division', '_id nombre descripcion');
    
    console.log('📊 [CHECK ASSOCIATIONS] Total asociaciones encontradas:', associations.length);
    
    if (associations.length === 0) {
      console.log('❌ [CHECK ASSOCIATIONS] No hay asociaciones para el usuario');
      
      // Crear una asociación si no existe
      console.log('🔧 [CHECK ASSOCIATIONS] Creando asociación...');
      
      // Buscar cuenta
      const account = await Account.findOne({ nombre: 'Colegio Alemán' });
      if (!account) {
        console.log('❌ [CHECK ASSOCIATIONS] Cuenta no encontrada');
        return;
      }
      
      // Buscar división
      const division = await Grupo.findOne({ nombre: 'Primer Año' });
      if (!division) {
        console.log('❌ [CHECK ASSOCIATIONS] División no encontrada');
        return;
      }
      
      // Crear asociación
      const newAssociation = new Shared({
        user: user._id,
        account: account._id,
        division: division._id,
        status: 'active'
      });
      
      await newAssociation.save();
      console.log('✅ [CHECK ASSOCIATIONS] Asociación creada exitosamente');
      
    } else {
      console.log('✅ [CHECK ASSOCIATIONS] Asociaciones encontradas:');
      associations.forEach((assoc, index) => {
        console.log(`   ${index + 1}. Cuenta: ${assoc.account?.nombre || 'N/A'}`);
        console.log(`      División: ${assoc.division?.nombre || 'N/A'}`);
        console.log(`      Status: ${assoc.status}`);
        console.log(`      Activa: ${assoc.status === 'active'}`);
      });
      
      // Verificar si hay alguna asociación activa
      const hasActiveAssociation = associations.some(assoc => assoc.status === 'active');
      console.log('✅ [CHECK ASSOCIATIONS] Tiene asociación activa:', hasActiveAssociation);
    }
    
  } catch (error) {
    console.error('❌ [CHECK ASSOCIATIONS] Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

checkUserAssociations();
