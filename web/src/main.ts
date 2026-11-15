import { createApp } from 'vue'
import './style.css'
import { applyChartTheme } from './theme'
import App from './App.vue'

applyChartTheme()
createApp(App).mount('#app')
