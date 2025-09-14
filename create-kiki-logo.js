const fs = require('fs');
const path = require('path');

function createKikiLogo() {
  try {
    console.log('🎨 Creando logo de KIKI...\n');

    // Crear carpeta assets si no existe
    const assetsDir = path.join(__dirname, 'assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    // SVG simple para el logo de KIKI
    const svgContent = `
<svg width="200" height="80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#0E5FCE;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#4A90E2;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Fondo redondeado -->
  <rect x="10" y="10" width="180" height="60" rx="30" ry="30" fill="url(#grad1)" stroke="#0E5FCE" stroke-width="2"/>
  
  <!-- Texto KIKI -->
  <text x="100" y="45" font-family="Arial, sans-serif" font-size="28" font-weight="bold" text-anchor="middle" fill="white">KIKI</text>
  
  <!-- Subtítulo -->
  <text x="100" y="65" font-family="Arial, sans-serif" font-size="12" text-anchor="middle" fill="white" opacity="0.8">APP</text>
</svg>`;

    // Guardar como SVG
    const svgPath = path.join(assetsDir, 'logo-kiki.svg');
    fs.writeFileSync(svgPath, svgContent);
    console.log('✅ Logo SVG creado:', svgPath);

    // Crear también una versión PNG simple (texto plano)
    const pngContent = `
<svg width="200" height="80" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="80" fill="#0E5FCE"/>
  <text x="100" y="45" font-family="Arial, sans-serif" font-size="28" font-weight="bold" text-anchor="middle" fill="white">KIKI</text>
  <text x="100" y="65" font-family="Arial, sans-serif" font-size="12" text-anchor="middle" fill="white" opacity="0.8">APP</text>
</svg>`;

    const pngPath = path.join(assetsDir, 'logo-kiki.png');
    fs.writeFileSync(pngPath, pngContent);
    console.log('✅ Logo PNG creado:', pngPath);

    console.log('\n📁 Archivos creados en:', assetsDir);
    console.log('   - logo-kiki.svg (versión vectorial)');
    console.log('   - logo-kiki.png (versión para emails)');

    console.log('\n💡 Para usar el logo en emails:');
    console.log('   1. Reemplaza el archivo logo-kiki.png con tu logo real');
    console.log('   2. Ejecuta: node upload-kiki-logo.js');
    console.log('   3. Prueba los emails: node test-ses-simple.js');

  } catch (error) {
    console.error('❌ Error creando logo:', error);
  }
}

createKikiLogo();
