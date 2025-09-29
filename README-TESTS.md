# 🧪 Tests Automatizados del API

Este documento explica cómo ejecutar y mantener los tests automatizados del API.

## 📋 Configuración

### Dependencias de Testing

```bash
npm install --save-dev jest supertest @types/jest @types/supertest
```

### Variables de Entorno

Crea un archivo `.env.test` con:

```env
NODE_ENV=test
MONGODB_URI=mongodb://localhost:27017/kiki-test
JWT_SECRET=test-jwt-secret
AWS_ACCESS_KEY_ID=test-access-key
AWS_SECRET_ACCESS_KEY=test-secret-key
AWS_REGION=us-east-1
S3_BUCKET=test-bucket
```

## 🚀 Ejecutar Tests

### Comandos Básicos

```bash
# Ejecutar todos los tests
npm test

# Ejecutar tests en modo watch
npm run test:watch

# Ejecutar tests con coverage
npm run test:coverage

# Ejecutar tests para CI
npm run test:ci
```

### Script Personalizado

```bash
# Usar el script personalizado
./run-tests.sh

# Opciones disponibles
./run-tests.sh --help
./run-tests.sh --watch
./run-tests.sh --coverage
./run-tests.sh --ci
```

## 📁 Estructura de Tests

```
tests/
├── setup.js                 # Configuración global de tests
├── helpers/
│   └── testHelpers.js       # Funciones auxiliares
├── auth.test.js            # Tests de autenticación
├── users.test.js           # Tests de usuarios
├── institutions.test.js    # Tests de instituciones
└── activities.test.js      # Tests de actividades
```

## 🔧 Configuración de Jest

El archivo `jest.config.js` incluye:

- **Test Environment**: Node.js
- **Coverage**: HTML, LCOV, texto
- **Timeout**: 10 segundos
- **Setup**: Archivo de configuración global

## 📊 Coverage

Los tests generan reportes de coverage en:

- **HTML**: `./coverage/index.html`
- **LCOV**: `./coverage/lcov.info`
- **Texto**: En la consola

### Objetivos de Coverage

- **Statements**: > 80%
- **Branches**: > 70%
- **Functions**: > 80%
- **Lines**: > 80%

## 🧪 Tipos de Tests

### 1. Tests de Autenticación (`auth.test.js`)

- ✅ Login con credenciales válidas
- ✅ Login con credenciales inválidas
- ✅ Registro de nuevos usuarios
- ✅ Recuperación de contraseña
- ✅ Reset de contraseña
- ✅ Validación de tokens

### 2. Tests de Usuarios (`users.test.js`)

- ✅ Obtener lista de usuarios
- ✅ Obtener usuario por ID
- ✅ Actualizar usuario
- ✅ Eliminar usuario
- ✅ Perfil de usuario
- ✅ Permisos de administrador

### 3. Tests de Instituciones (`institutions.test.js`)

- ✅ CRUD completo de instituciones
- ✅ Validación de datos
- ✅ Asociación con estudiantes
- ✅ Filtros y búsquedas

### 4. Tests de Actividades (`activities.test.js`)

- ✅ CRUD completo de actividades
- ✅ Filtros por institución
- ✅ Upload de imágenes
- ✅ Validación de fechas

## 🔄 CI/CD

### GitHub Actions

El workflow `.github/workflows/test.yml` ejecuta:

1. **Setup**: Node.js 18, MongoDB
2. **Install**: Dependencias
3. **Test**: Tests con coverage
4. **Upload**: Reportes de coverage

### Configuración Local

```bash
# Instalar dependencias
npm install

# Ejecutar tests
npm test

# Ver coverage
npm run test:coverage
```

## 🛠️ Helpers de Testing

### `testHelpers.js`

Funciones auxiliares incluyen:

- `connectTestDB()`: Conectar a base de datos de test
- `disconnectTestDB()`: Desconectar de base de datos
- `cleanDatabase()`: Limpiar datos de test
- `createTestUser()`: Crear usuario de prueba
- `generateTestToken()`: Generar token JWT
- `mockAWS()`: Mock de servicios AWS

## 📝 Escribir Nuevos Tests

### Estructura Básica

```javascript
const request = require('supertest');
const { connectTestDB, disconnectTestDB, cleanDatabase } = require('./helpers/testHelpers');

describe('Mi Endpoint', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  it('should do something', async () => {
    const response = await request(app)
      .get('/api/endpoint')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
  });
});
```

### Mejores Prácticas

1. **Aislamiento**: Cada test debe ser independiente
2. **Limpieza**: Limpiar datos entre tests
3. **Mocking**: Mockear servicios externos
4. **Assertions**: Verificar tanto éxito como error
5. **Coverage**: Mantener alta cobertura de código

## 🐛 Debugging Tests

### Modo Verbose

```bash
npm test -- --verbose
```

### Tests Específicos

```bash
npm test -- --testNamePattern="should login"
```

### Debug Individual

```bash
npm test -- --testPathPattern="auth.test.js"
```

## 📈 Métricas

### Coverage Reports

- **Statements**: Porcentaje de declaraciones ejecutadas
- **Branches**: Porcentaje de ramas de código ejecutadas
- **Functions**: Porcentaje de funciones ejecutadas
- **Lines**: Porcentaje de líneas ejecutadas

### Performance

- **Test Duration**: Tiempo total de ejecución
- **Memory Usage**: Uso de memoria durante tests
- **Database Operations**: Operaciones de base de datos

## 🔧 Troubleshooting

### Problemas Comunes

1. **MongoDB Connection**: Verificar que MongoDB esté corriendo
2. **Environment Variables**: Verificar variables de entorno
3. **Port Conflicts**: Verificar que no haya conflictos de puertos
4. **Memory Issues**: Aumentar timeout si es necesario

### Soluciones

```bash
# Limpiar cache de Jest
npm test -- --clearCache

# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install

# Verificar configuración
npm test -- --showConfig
```

## 📚 Recursos Adicionales

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [MongoDB Testing](https://docs.mongodb.com/manual/core/testing/)
- [Node.js Testing Best Practices](https://nodejs.org/en/docs/guides/testing/)

---

**¡Happy Testing! 🎉**
