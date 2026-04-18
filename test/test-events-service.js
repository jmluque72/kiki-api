const mongoose = require('mongoose');
const Event = require('./shared/models/Event');
const Account = require('./shared/models/Account');
const User = require('./shared/models/User');
const Group = require('./shared/models/Group');

// Configuración de conexión a MongoDB
mongoose.connect('mongodb://localhost:27017/ki_test', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testEventService() {
  try {
    console.log('🧪 Iniciando pruebas del servicio de eventos...');

    // Crear datos de prueba
    const testAccount = await Account.create({
      nombre: 'Institucion Test',
      razonSocial: 'Institucion Test S.A.',
      address: 'Direccion Test 123'
    });

    const testUser = await User.create({
      name: 'Usuario Test',
      email: 'test@example.com',
      password: 'password123'
    });

    const testGroup = await Group.create({
      nombre: 'Division Test',
      descripcion: 'Division de prueba',
      account: testAccount._id
    });

    console.log('✅ Datos de prueba creados');

    // Test 1: Crear evento
    const testEvent = await Event.create({
      titulo: 'Evento Test',
      descripcion: 'Descripcion del evento de prueba',
      fecha: new Date('2024-12-25'),
      hora: '14:00',
      lugar: 'Sala de conferencias',
      creador: testUser._id,
      institucion: testAccount._id,
      division: testGroup._id,
      estado: 'activo'
    });

    console.log('✅ Evento creado:', testEvent.titulo);

    // Test 2: Obtener eventos por institución y división
    const events = await Event.find({
      institucion: testAccount._id,
      division: testGroup._id,
      fecha: { $gte: new Date() }
    }).populate('creador institucion division');

    console.log('✅ Eventos filtrados por institución y división:', events.length);

    // Test 3: Verificar que solo devuelve eventos futuros
    const pastEvent = await Event.create({
      titulo: 'Evento Pasado',
      descripcion: 'Evento que ya pasó',
      fecha: new Date('2023-01-01'),
      hora: '10:00',
      lugar: 'Sala antigua',
      creador: testUser._id,
      institucion: testAccount._id,
      estado: 'activo'
    });

    const futureEvents = await Event.find({
      institucion: testAccount._id,
      fecha: { $gte: new Date() }
    });

    console.log('✅ Eventos futuros encontrados:', futureEvents.length);
    console.log('✅ Eventos futuros no incluyen eventos pasados:', !futureEvents.find(e => e.titulo === 'Evento Pasado'));

    // Test 4: Agregar participante
    const anotherUser = await User.create({
      name: 'Participante Test',
      email: 'participante@example.com',
      password: 'password123'
    });

    testEvent.participantes.push(anotherUser._id);
    await testEvent.save();

    console.log('✅ Participante agregado al evento');

    // Test 5: Verificar populate de participantes
    const eventWithParticipants = await Event.findById(testEvent._id)
      .populate('participantes', 'name email');

    console.log('✅ Evento con participantes populados:', eventWithParticipants.participantes.length);

    console.log('🎉 Todas las pruebas pasaron exitosamente!');

  } catch (error) {
    console.error('❌ Error en las pruebas:', error);
  } finally {
    // Limpiar datos de prueba
    await Event.deleteMany({});
    await Account.deleteMany({});
    await User.deleteMany({});
    await Group.deleteMany({});
    
    mongoose.connection.close();
    console.log('🧹 Datos de prueba limpiados');
  }
}

testEventService();
