const { google } = require('googleapis');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔧 Obtención de Refresh Token para Gmail');
console.log('=====================================\n');

console.log('📋 Pasos para solucionar el error de redirect_uri_mismatch:');
console.log('1. Ve a https://console.cloud.google.com/');
console.log('2. Selecciona tu proyecto');
console.log('3. Ve a APIs & Services > Credentials');
console.log('4. Edita tu OAuth 2.0 Client ID');
console.log('5. En "Authorized redirect URIs" agrega:');
console.log('   https://developers.google.com/oauthplayground');
console.log('6. Guarda los cambios\n');

console.log('🔄 Método alternativo usando Google OAuth2 Playground:');
console.log('1. Ve a https://developers.google.com/oauthplayground/');
console.log('2. Haz clic en el ícono de engranaje (⚙️)');
console.log('3. Marca "Use your own OAuth credentials"');
console.log('4. Ingresa tu Client ID y Client Secret');
console.log('5. En la lista de APIs, busca "Gmail API v1"');
console.log('6. Selecciona "https://mail.google.com/"');
console.log('7. Haz clic en "Authorize APIs"');
console.log('8. Autoriza con tu cuenta de Gmail');
console.log('9. Haz clic en "Exchange authorization code for tokens"');
console.log('10. Copia el Refresh Token\n');

rl.question('¿Ya configuraste correctamente las URLs de redirección en Google Cloud Console? (s/n): ', (answer) => {
  if (answer.toLowerCase() === 's' || answer.toLowerCase() === 'si') {
    rl.question('Ingresa tu Client ID: ', (clientId) => {
      rl.question('Ingresa tu Client Secret: ', (clientSecret) => {
        rl.question('Ingresa tu email de Gmail: ', (email) => {
          console.log('\n🔗 URL de autorización generada:');
          console.log('=====================================');
          
          const oauth2Client = new google.auth.OAuth2(
            clientId,
            clientSecret,
            'https://developers.google.com/oauthplayground'
          );
          
          const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://mail.google.com/'],
            prompt: 'consent'
          });
          
          console.log(authUrl);
          console.log('=====================================\n');
          
          console.log('📝 Instrucciones:');
          console.log('1. Copia y pega la URL anterior en tu navegador');
          console.log('2. Autoriza la aplicación');
          console.log('3. Copia el código de autorización de la URL resultante');
          console.log('4. Pégalo aquí abajo\n');
          
          rl.question('Ingresa el código de autorización: ', async (code) => {
            try {
              const { tokens } = await oauth2Client.getToken(code);
              
              console.log('\n✅ ¡Refresh Token obtenido exitosamente!');
              console.log('\n📝 Agrega estas variables a tu archivo .env:');
              console.log('=====================================');
              console.log(`GMAIL_USER=${email}`);
              console.log(`GMAIL_CLIENT_ID=${clientId}`);
              console.log(`GMAIL_CLIENT_SECRET=${clientSecret}`);
              console.log(`GMAIL_REDIRECT_URI=https://developers.google.com/oauthplayground`);
              console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
              console.log('=====================================\n');
              
              console.log('🚀 Para probar el envío de emails, ejecuta:');
              console.log('node test-email.js');
              
            } catch (error) {
              console.error('❌ Error obteniendo el refresh token:', error.message);
              console.log('\n💡 Posibles soluciones:');
              console.log('1. Verifica que el código de autorización sea correcto');
              console.log('2. Asegúrate de que las URLs de redirección estén bien configuradas');
              console.log('3. Intenta nuevamente con una ventana de incógnito');
            }
            
            rl.close();
          });
        });
      });
    });
  } else {
    console.log('\n❌ Primero debes configurar las URLs de redirección en Google Cloud Console.');
    console.log('Sigue los pasos mencionados arriba y vuelve a ejecutar este script.');
    rl.close();
  }
});
