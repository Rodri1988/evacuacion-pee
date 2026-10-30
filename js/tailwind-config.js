// Configuración de Tailwind (debe cargarse DESPUÉS del script CDN de Tailwind)
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#002874',
          navyDark: '#00194a',
          orange: '#FF5000',
          orangeHover: '#d94400',
          danger: '#dc2626',
          success: '#16a34a',
          warning: '#ca8a04'
        }
      }
    }
  }
};
