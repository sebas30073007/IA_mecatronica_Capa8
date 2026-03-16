// src/config.js
// Detecta si el frontend corre en local (Express) o en GitHub Pages
// y devuelve la URL base del backend correcta.

const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";

export const API_BASE = isLocal
  ? ""                                          // relativo → usa el Express local
  : "https://ia-mecatronica-capa8.onrender.com"; // backend en Render
