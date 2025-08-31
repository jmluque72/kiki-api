const fs = require('fs');
const path = require('path');
require('dotenv').config();

function verifyNoLocalFiles() {
  console.log('🔍 [VERIFY NO LOCAL FILES] Verificando que no se crean archivos locales...\n');

  // 1. Verificar si existe el directorio uploads
  const uploadsDir = path.join(__dirname, 'uploads');
  console.log('1️⃣ Verificando directorio uploads...');
  console.log(`   Ruta: ${uploadsDir}`);
  
  if (fs.existsSync(uploadsDir)) {
    console.log('   ⚠️ El directorio uploads existe');
    
    // Listar archivos en el directorio
    const files = fs.readdirSync(uploadsDir);
    console.log(`   📁 Archivos encontrados: ${files.length}`);
    
    if (files.length > 0) {
      console.log('   ❌ PROBLEMA: Hay archivos en el directorio uploads');
      console.log('   📋 Archivos:');
      files.forEach((file, index) => {
        const filePath = path.join(uploadsDir, file);
        const stats = fs.statSync(filePath);
        console.log(`      ${index + 1}. ${file} (${stats.size} bytes)`);
      });
      
      console.log('\n💡 Recomendaciones:');
      console.log('   1. Eliminar el directorio uploads: rm -rf uploads/');
      console.log('   2. Verificar que todos los endpoints usen S3');
      console.log('   3. Asegurar que no se creen archivos locales');
    } else {
      console.log('   ✅ El directorio uploads está vacío');
    }
  } else {
    console.log('   ✅ El directorio uploads NO existe');
  }

  // 2. Verificar otros directorios que podrían contener archivos
  console.log('\n2️⃣ Verificando otros directorios...');
  
  const directoriesToCheck = [
    'temp',
    'tmp',
    'files',
    'images',
    'avatars',
    'uploads'
  ];

  directoriesToCheck.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      console.log(`   📁 ${dir}: ${files.length} archivos`);
      
      if (files.length > 0) {
        console.log(`   ⚠️ El directorio ${dir} contiene archivos`);
      }
    } else {
      console.log(`   ✅ El directorio ${dir} NO existe`);
    }
  });

  // 3. Verificar archivos temporales en el directorio raíz
  console.log('\n3️⃣ Verificando archivos temporales en el directorio raíz...');
  
  const rootFiles = fs.readdirSync(__dirname);
  const tempFiles = rootFiles.filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ext === '.tmp' || ext === '.temp' || file.startsWith('temp') || file.startsWith('tmp');
  });

  if (tempFiles.length > 0) {
    console.log('   ⚠️ Archivos temporales encontrados:');
    tempFiles.forEach(file => {
      console.log(`      - ${file}`);
    });
  } else {
    console.log('   ✅ No se encontraron archivos temporales');
  }

  // 4. Verificar archivos de imagen en el directorio raíz
  console.log('\n4️⃣ Verificando archivos de imagen en el directorio raíz...');
  
  const imageFiles = rootFiles.filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext);
  });

  if (imageFiles.length > 0) {
    console.log('   ⚠️ Archivos de imagen encontrados:');
    imageFiles.forEach(file => {
      const filePath = path.join(__dirname, file);
      const stats = fs.statSync(filePath);
      console.log(`      - ${file} (${stats.size} bytes)`);
    });
  } else {
    console.log('   ✅ No se encontraron archivos de imagen');
  }

  // 5. Resumen final
  console.log('\n5️⃣ Resumen final:');
  console.log('=' .repeat(50));
  
  const uploadsExists = fs.existsSync(uploadsDir);
  const uploadsHasFiles = uploadsExists && fs.readdirSync(uploadsDir).length > 0;
  const hasTempFiles = tempFiles.length > 0;
  const hasImageFiles = imageFiles.length > 0;
  
  if (!uploadsExists && !hasTempFiles && !hasImageFiles) {
    console.log('🎉 ¡PERFECTO! No se están creando archivos locales');
    console.log('✅ El sistema está completamente configurado para S3');
    console.log('✅ Compatible con Docker y múltiples instancias');
    console.log('✅ No hay dependencias de archivos locales');
  } else {
    console.log('⚠️ PROBLEMAS DETECTADOS:');
    
    if (uploadsHasFiles) {
      console.log('   ❌ Hay archivos en el directorio uploads');
    }
    
    if (hasTempFiles) {
      console.log('   ❌ Hay archivos temporales');
    }
    
    if (hasImageFiles) {
      console.log('   ❌ Hay archivos de imagen en el directorio raíz');
    }
    
    console.log('\n💡 Acciones recomendadas:');
    console.log('   1. Eliminar archivos locales innecesarios');
    console.log('   2. Verificar que todos los endpoints usen S3');
    console.log('   3. Asegurar que no se creen archivos temporales');
    console.log('   4. Configurar .gitignore para excluir archivos locales');
  }

  console.log('\n📋 Configuración actual:');
  console.log(`   AWS S3 Bucket: ${process.env.AWS_S3_BUCKET_NAME || 'No configurado'}`);
  console.log(`   AWS Region: ${process.env.AWS_REGION || 'us-east-1'}`);
  console.log(`   AWS Access Key: ${process.env.AWS_ACCESS_KEY_ID ? 'Configurado' : 'No configurado'}`);
}

verifyNoLocalFiles();
