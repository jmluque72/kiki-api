const { spawn } = require('child_process');
const config = require('./config/env.config');

console.log('🚀 Iniciando todos los microservicios...\n');

// Configuración de los servicios
const services = [
  {
    name: 'Gateway',
    command: 'node',
    args: ['gateway/server.js'],
    port: config.GATEWAY_PORT,
    color: '\x1b[36m', // Cyan
  },
  {
    name: 'Users Service',
    command: 'node',
    args: ['services/users/server.js'],
    port: config.USERS_SERVICE_PORT,
    color: '\x1b[32m', // Green
  },
  {
    name: 'Accounts Service',
    command: 'node',
    args: ['services/accounts/server.js'],
    port: config.ACCOUNTS_SERVICE_PORT,
    color: '\x1b[33m', // Yellow
  }
];

const processes = [];

// Función para agregar colores al output
function colorizeOutput(serviceName, color, data) {
  const lines = data.toString().split('\n');
  lines.forEach(line => {
    if (line.trim()) {
      console.log(`${color}[${serviceName}]\x1b[0m ${line}`);
    }
  });
}

// Iniciar todos los servicios
services.forEach(service => {
  console.log(`Iniciando ${service.name} en puerto ${service.port}...`);
  
  const process = spawn(service.command, service.args, {
    stdio: 'pipe',
    shell: true
  });

  // Capturar salida estándar
  process.stdout.on('data', (data) => {
    colorizeOutput(service.name, service.color, data);
  });

  // Capturar errores
  process.stderr.on('data', (data) => {
    colorizeOutput(service.name, '\x1b[31m', data); // Red for errors
  });

  // Manejar cierre del proceso
  process.on('close', (code) => {
    console.log(`${service.color}[${service.name}]\x1b[0m Proceso terminado con código ${code}`);
  });

  processes.push(process);
});

// Manejar cierre graceful
process.on('SIGINT', () => {
  console.log('\n🛑 Cerrando todos los servicios...');
  processes.forEach(proc => {
    proc.kill('SIGINT');
  });
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Cerrando todos los servicios...');
  processes.forEach(proc => {
    proc.kill('SIGTERM');
  });
  process.exit(0);
});

// Mostrar información inicial
setTimeout(() => {
  console.log('\n📋 Servicios disponibles:');
  console.log(`🌐 Gateway: http://localhost:${config.GATEWAY_PORT}`);
  console.log(`👥 Users Service: http://localhost:${config.USERS_SERVICE_PORT}`);
  console.log(`🏢 Accounts Service: http://localhost:${config.ACCOUNTS_SERVICE_PORT}`);
  console.log('\n📖 Documentación: http://localhost:3000/api');
  console.log('🔍 Health checks: http://localhost:3000/health');
  console.log('\n✨ Todos los servicios iniciados correctamente!');
}, 2000); 