const { spawn } = require('child_process');
const config = require('../config/env.config');

console.log('🚀 Iniciando microservicios de Kiki...\n');

// Configuración de los servicios
const services = [
  {
    name: 'Gateway',
    command: 'node',
    args: ['microservices/gateway/server.js'],
    port: config.GATEWAY_PORT || 3000,
    color: '\x1b[36m', // Cyan
  },
  {
    name: 'Auth Service',
    command: 'node',
    args: ['microservices/auth-service/server.js'],
    port: config.AUTH_SERVICE_PORT || 3004,
    color: '\x1b[32m', // Green
  },
  {
    name: 'Users Service',
    command: 'node',
    args: ['microservices/users-service/server.js'],
    port: config.USERS_SERVICE_PORT || 3002,
    color: '\x1b[33m', // Yellow
  },
    {
      name: 'Accounts Service',
      command: 'node',
      args: ['microservices/accounts-service/server.js'],
      port: config.ACCOUNTS_SERVICE_PORT || 3003,
      color: '\x1b[34m', // Blue
    },
    {
      name: 'Events Service',
      command: 'node',
      args: ['microservices/events-service/server.js'],
      port: config.EVENTS_SERVICE_PORT || 3005,
      color: '\x1b[35m', // Magenta
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
    shell: true,
    cwd: __dirname + '/..' // Ejecutar desde el directorio api
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
  console.log('\n🛑 Cerrando todos los microservicios...');
  processes.forEach(proc => {
    proc.kill('SIGINT');
  });
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Cerrando todos los microservicios...');
  processes.forEach(proc => {
    proc.kill('SIGTERM');
  });
  process.exit(0);
});

// Mostrar información inicial
setTimeout(() => {
  console.log('\n📋 Microservicios disponibles:');
  console.log(`🌐 Gateway: http://localhost:${config.GATEWAY_PORT || 3000}`);
  console.log(`🔐 Auth Service: http://localhost:${config.AUTH_SERVICE_PORT || 3004}`);
  console.log(`👥 Users Service: http://localhost:${config.USERS_SERVICE_PORT || 3002}`);
  console.log(`🏢 Accounts Service: http://localhost:${config.ACCOUNTS_SERVICE_PORT || 3003}`);
  console.log('\n📖 Documentación: http://localhost:3000/api');
  console.log('🔍 Health checks: http://localhost:3000/health');
  console.log('\n✨ Microservicios iniciados correctamente!');
  console.log('\n💡 Nota: simple-server.js sigue funcionando en paralelo');
}, 2000);
