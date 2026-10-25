# Política de seguridad

Si encuentras una vulnerabilidad, no abras un issue público. Escríbeme a través de un
[aviso privado de seguridad](../../security/advisories/new) en este repositorio y responderé lo
antes posible.

## Medidas aplicadas

- Las claves y credenciales solo viven en variables de entorno del servidor; `.env` no se versiona
  y `gitleaks` bloquea commits con secretos.
- La API responde con cabeceras de seguridad, CORS limitado a los orígenes configurados y sin
  documentación interactiva en producción.
- Cada cambio pasa por análisis estático (CodeQL), escaneo de la imagen Docker (Trivy) y
  actualización automática de dependencias (Dependabot).
- El contenedor de la API se ejecuta con un usuario sin privilegios.
