importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
// Estos valores son públicos (mismos del config.js).
firebase.initializeApp({
  apiKey: "AIzaSyAyga4ibhG4rQwDn2jN8M5dTn3aSpkhgMs",
  authDomain: "cerrada-samarkanda-2.firebaseapp.com",
  projectId: "cerrada-samarkanda-2",
  messagingSenderId: "882134731853",
  appId: "1:882134731853:web:e6522cdfcc21cdcd6c2004",
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage(p => {
  self.registration.showNotification(p.notification?.title || 'Cerrada Samarkanda', {
    body: p.notification?.body || '', icon: 'icons/icon-s-192.png',
  });
});
