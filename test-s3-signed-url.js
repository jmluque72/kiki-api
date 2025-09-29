const { generateSignedUrl } = require('./config/s3.config');

async function testSignedUrl() {
  console.log('🧪 [TEST S3] ===== PROBANDO GENERACIÓN DE URL FIRMADA =====');
  
  const testKey = 'students/68d47694390104381d43c307/1758756255243-C4E68502-F35F-4880-9FDD-54AEFC41DA4E.jpg';
  
  try {
    console.log('🧪 [TEST S3] Probando con key:', testKey);
    const signedUrl = await generateSignedUrl(testKey, 172800); // 2 días
    
    if (signedUrl) {
      console.log('✅ [TEST S3] URL firmada generada exitosamente');
      console.log('🔗 [TEST S3] URL:', signedUrl);
      console.log('🔗 [TEST S3] Longitud:', signedUrl.length);
      console.log('🔗 [TEST S3] Contiene AWS:', signedUrl.includes('amazonaws.com'));
      console.log('🔗 [TEST S3] Contiene X-Amz:', signedUrl.includes('X-Amz'));
    } else {
      console.log('❌ [TEST S3] URL firmada es null');
    }
  } catch (error) {
    console.error('❌ [TEST S3] Error:', error);
    console.error('❌ [TEST S3] Error details:', {
      message: error.message,
      code: error.code,
      name: error.name
    });
  }
}

testSignedUrl();
