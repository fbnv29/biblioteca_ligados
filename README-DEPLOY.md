# Guía de Despliegue: Biblioteca Academia Ligados

Sigue estos pasos para activar tu sistema de archivos en Cloudflare.

## 1. Cloudflare Workers y R2

### A. Crear el Bucket R2
1. Entra a tu Dashboard de Cloudflare -> **R2**.
2. Haz clic en **Create bucket**.
3. Nombre del bucket: `biblioteca-ligados-r2`.
4. Una vez creado, ve a la pestaña **Settings** y en **Public Access**, activa un subdominio de `r2.dev` o conecta uno propio (ej: `archivos.ligados.cl`). **Copia esta URL**.

### B. Crear el Namespace KV
1. Ve a **Workers & Pages** -> **KV**.
2. Haz clic en **Create namespace**.
3. Nombre: `LIBRARY_KV`. **Copia el ID generado**.

### C. Desplegar el Worker
1. Abre tu terminal en la carpeta `/worker` del proyecto.
2. Abre el archivo `wrangler.toml`.
3. Pega el **ID de KV** y la **URL de R2** en sus respectivos lugares.
4. Cambia `ADMIN_TOKEN` por una clave secreta (ej: `ligados2024!`).
5. Ejecuta: `npx wrangler deploy`.
6. Esto te dará una URL (ej: `https://biblioteca-ligados-api.usuario.workers.dev`). **Cárgala en tu web**.

## 2. Conectar la Web (Frontend)

En los archivos `index.html`, `admin.html` y `lecciones.html`, busca esta línea al final del archivo:

```javascript
const API_BASE = "PEGAR_AQUI_URL_DE_WORKER";
```

## 3. Subir a Producción (Netlify/Vercel/GitHub)
Una vez que la web tiene la URL del Worker cargada, puedes subir el proyecto a GitHub y conectar Netlify.

---
**¡Importante!** El Token que pongas en `wrangler.toml` es el mismo que deberás usar para entrar al panel `/admin.html`.
