/**
 * Envía un correo de prueba con logo + badges (mismas URLs que la app).
 * Uso: node scripts/send-test-email-images.js tu@email.com
 *      o TEST_EMAIL_TO=tu@email.com node scripts/send-test-email-images.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const {
  sendEmail,
  getKikiLogoHTML,
  getAppStoreBadgesHTML,
} = require('../config/email.config');
const { getEmailAssetsBaseUrl, getKikiLogoSrc } = require('../config/emailAssets');

async function main() {
  const to = process.argv[2] || process.env.TEST_EMAIL_TO;
  if (!to) {
    console.error('Uso: node scripts/send-test-email-images.js <email>');
    console.error('O: TEST_EMAIL_TO=correo@... node scripts/send-test-email-images.js');
    process.exit(1);
  }

  console.log('Base assets:', getEmailAssetsBaseUrl() || '(cid / CDN fallback)');
  console.log('Logo src:', getKikiLogoSrc());

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff;">
      ${getKikiLogoHTML()}
      <h1 style="color: #0E5FCE; font-size: 22px;">Prueba de imágenes</h1>
      <p style="color: #333333; line-height: 1.5;">Si ves el logo arriba y las tiendas abajo, las URLs en el mail están bien.</p>
      ${getAppStoreBadgesHTML()}
      <p style="color: #999999; font-size: 12px; margin-top: 24px;">Mensaje de prueba — Kiki App</p>
    </div>
  `;

  await sendEmail(to, '[Kiki] Prueba imágenes en email', html);
  console.log('Enviado a', to);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
