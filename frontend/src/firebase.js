import { getAnalytics, isSupported } from 'firebase/analytics'
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyBRTYBHS37rK5U-KAZn83T4C9JPGwwEyFA',
  authDomain: 'leadsphere-v2-0-1.firebaseapp.com',
  projectId: 'leadsphere-v2-0-1',
  storageBucket: 'leadsphere-v2-0-1.firebasestorage.app',
  messagingSenderId: '352218727347',
  appId: '1:352218727347:web:22cbd0161ca5e0e02d41c6',
  measurementId: 'G-7SYYD8WBVZ',
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)

const analyticsPromise = isSupported().then((supported) =>
  supported ? getAnalytics(app) : null,
)

export { analyticsPromise, app, auth }
