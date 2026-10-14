// Public build configuration only. Never place service-role keys or SMTP secrets here.
window.GINOMAI_CLOUD_CONFIG = Object.freeze({
  // Enable after database migrations and an SMTP/code-delivery test succeed.
  enabled: false,
  // Personal delivery test on localhost only; hosted releases stay disabled.
  localTesting: true,
  url: 'https://laadvnuelbtjxewxisyq.supabase.co',
  publishableKey: 'sb_publishable_IAqaUro1EQyNO65DPtUaCA_qAyawH3I',
  appVersion: '2.4.5'
});
