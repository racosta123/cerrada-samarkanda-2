/* Copia este archivo como config.js y rellena con tus valores reales.
   config.js NO debe contener secretos del Worker ni de la Shelly. */
const CONFIG = {
  firebase: {
    apiKey: "AIzaSyAyga4ibhG4rQwDn2jN8M5dTn3aSpkhgMs",       // RESTRINGIDA a racosta123.github.io + APIs de Auth/Firestore/FCM en Google Cloud Console
    authDomain: "cerrada-samarkanda-2.firebaseapp.com",
    projectId: "cerrada-samarkanda-2",
    storageBucket: "cerrada-samarkanda-2.firebasestorage.app",
    messagingSenderId: "882134731853",
    appId: "1:882134731853:web:e6522cdfcc21cdcd6c2004",
  },
  workerUrl: "https://samarkanda2-proxy.acosta4770.workers.dev",
  appCheckSiteKey: "",  // App Check — pendiente: pega aquí tu reCAPTCHA v3 site key real
  vapidKey: "",         // FCM Web Push — pendiente: pega aquí tu clave pública VAPID real
};
