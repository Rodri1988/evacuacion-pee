# Sistema de Evacuación y Conteo Rápido (PEE)

Aplicación web móvil para contar personas evacuadas en los Puntos de Encuentro (PEE), consolidar los datos en un puesto de mando y generar una ficha imprimible (PDF) para Bomberos.

## Funcionalidades

- **Conteo PEE:** botones grandes (+1, +5, +10, -1) con vibración en celulares.
- **Puesto de Mando:** total de evacuados, dotación esperada y faltantes en planta.
- **Nómina / RUT:** registro nominativo post-emergencia.
- **Ficha para Bomberos:** impresión / exportación a PDF.
- **Persistencia local:** los datos se guardan en el navegador (`localStorage`).

## Estructura del proyecto

```
.
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── tailwind-config.js
│   └── app.js
├── .gitignore
└── README.md
```

## Cómo ejecutarlo

Abre `index.html` en el navegador, o usa un servidor local:

```bash
python -m http.server 8000
# luego visita http://localhost:8000
```

## Tecnologías

HTML5, JavaScript (vanilla), Tailwind CSS (CDN) y Lucide Icons.
