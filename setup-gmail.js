const { google } = require('googleapis');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔧 Configuración de Gmail para Kiki App');
console.log('=====================================\n');

console.log('📋 Pasos para configurar Gmail:');
console.log('1. Ve a https://console.cloud.google.com/');
console.log('2. Crea un nuevo proyecto o selecciona uno existente');
console.log('3. Habilita la Gmail API');
console.log('4. Crea credenciales OAuth 2.0');
console.log('5. Configura las URLs de redirección autorizadas');
console.log('6. Descarga el archivo JSON de credenciales\n');

rl.question('¿Tienes el Client ID de Gmail? (s/n): ', (answer) => {
  if (answer.toLowerCase() === 's' || answer.toLowerCase() === 'si') {
    rl.question('Ingresa el Client ID: ', (clientId) => {
      rl.question('Ingresa el Client Secret: ', (clientSecret) => {
        rl.question('Ingresa el email de Gmail: ', (email) => {
          console.log('\n📧 Ahora necesitamos obtener el Refresh Token');
          console.log('1. Ve a https://developers.google.com/oauthplayground/');
          console.log('2. En la configuración (ícono de engranaje), marca "Use your own OAuth credentials"');
          console.log('3. Ingresa tu Client ID y Client Secret');
          console.log('4. En la lista de APIs, busca "Gmail API v1" y selecciona "https://mail.google.com/"');
          console.log('5. Haz clic en "Authorize APIs"');
          console.log('6. Autoriza con tu cuenta de Gmail');
          console.log('7. Haz clic en "Exchange authorization code for tokens"');
          console.log('8. Copia el Refresh Token\n');
          
          rl.question('Ingresa el Refresh Token: ', (refreshToken) => {
            console.log('\n✅ Configuración completada!');
            console.log('\n📝 Agrega estas variables a tu archivo .env:');
            console.log('=====================================');
            console.log(`GMAIL_USER=${email}`);
            console.log(`GMAIL_CLIENT_ID=${clientId}`);
            console.log(`GMAIL_CLIENT_SECRET=${clientSecret}`);
            console.log(`GMAIL_REDIRECT_URI=https://developers.google.com/oauthplayground`);
            console.log(`GMAIL_REFRESH_TOKEN=${refreshToken}`);
            console.log('=====================================\n');
            
            console.log('🚀 Para probar el envío de emails, ejecuta:');
            console.log('node test-email.js');
            
            rl.close();
          });
        });
      });
    });
  } else {
    console.log('\n❌ Necesitas configurar las credenciales de Gmail primero.');
    console.log('Sigue los pasos mencionados arriba y vuelve a ejecutar este script.');
    rl.close();
  }
});
