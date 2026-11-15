import { createApp } from 'vue'
// Fuentes locales: la app funciona sin internet (apagones)
import '@fontsource/geist/400.css'
import '@fontsource/geist/500.css'
import '@fontsource/geist/600.css'
import '@fontsource/geist-mono/400.css'
import '@fontsource/geist-mono/500.css'
import './style.css'
import { applyChartTheme } from './theme'
import App from './App.vue'

applyChartTheme()
createApp(App).mount('#app')
