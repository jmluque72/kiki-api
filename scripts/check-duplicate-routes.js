const fs = require('fs');
const path = require('path');

// Rutas a verificar
const routesDir = path.join(__dirname, '../routes');
const microservicesDir = path.join(__dirname, '../microservices');

// Función para extraer rutas de un archivo
function extractRoutes(filePath, prefix = '') {
  const content = fs.readFileSync(filePath, 'utf8');
  const routes = [];
  
  // Buscar router.get, router.post, router.put, router.delete, app.get, app.post, etc.
  const routePattern = /(?:router|app)\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/g;
  let match;
  
  while ((match = routePattern.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const route = prefix + match[2];
    routes.push({ method, route, file: filePath });
  }
  
  return routes;
}

// Obtener todas las rutas de routes/
const routesFiles = [];
function getRoutesFiles(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getRoutesFiles(filePath);
    } else if (file.endsWith('.routes.js') || file.endsWith('.js')) {
      routesFiles.push(filePath);
    }
  });
}

getRoutesFiles(routesDir);

// Obtener todas las rutas de microservices/
const microservicesFiles = [];
function getMicroservicesFiles(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getMicroservicesFiles(filePath);
    } else if (file === 'server.js') {
      microservicesFiles.push(filePath);
    }
  });
}

getMicroservicesFiles(microservicesDir);

console.log('🔍 Buscando rutas duplicadas...\n');

// Extraer todas las rutas
const allRoutes = [];

// Rutas de routes/
routesFiles.forEach(file => {
  const routes = extractRoutes(file);
  allRoutes.push(...routes);
});

// Rutas de microservices/
microservicesFiles.forEach(file => {
  const routes = extractRoutes(file, '/api');
  allRoutes.push(...routes);
});

// Buscar duplicados
const routeMap = new Map();
const duplicates = [];

allRoutes.forEach(({ method, route, file }) => {
  const key = `${method} ${route}`;
  if (routeMap.has(key)) {
    duplicates.push({
      route: key,
      file1: routeMap.get(key),
      file2: file
    });
  } else {
    routeMap.set(key, file);
  }
});

// Mostrar resultados
if (duplicates.length > 0) {
  console.log('❌ RUTAS DUPLICADAS ENCONTRADAS:\n');
  duplicates.forEach(({ route, file1, file2 }) => {
    console.log(`⚠️  ${route}`);
    console.log(`   📄 1: ${path.relative(__dirname, file1)}`);
    console.log(`   📄 2: ${path.relative(__dirname, file2)}`);
    console.log('');
  });
  
  console.log(`\n📊 Total de duplicados: ${duplicates.length}`);
  console.log('\n💡 RECOMENDACIÓN:');
  console.log('   - Si usas simple-server.js, elimina o comenta las rutas en microservices/');
  console.log('   - O asegúrate de que los microservicios NO se estén ejecutando');
} else {
  console.log('✅ No se encontraron rutas duplicadas');
}

// Mostrar resumen
console.log('\n📊 RESUMEN:');
console.log(`   Rutas en routes/: ${routesFiles.length} archivos`);
console.log(`   Servicios en microservices/: ${microservicesFiles.length} archivos`);
console.log(`   Total de rutas únicas: ${routeMap.size}`);

