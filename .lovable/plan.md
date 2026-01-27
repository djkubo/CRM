

# Plan: Forzar Recarga de Caché PostgREST

## Diagnóstico

| Verificación | Resultado |
|--------------|-----------|
| Función existe en PostgreSQL | ✅ Sí (`unify_identity_v2`) |
| Tiene SECURITY DEFINER | ✅ Sí |
| Permisos EXECUTE | ✅ PUBLIC (todos pueden ejecutar) |
| API REST la encuentra | ❌ No - Error 404 |
| Ejecución directa SQL | ✅ Funciona |

**Causa**: PostgREST tiene un caché del schema que no se ha actualizado después de crear la función.

---

## Solución

Ejecutar un comando que notifica a PostgREST para recargar su caché inmediatamente:

```sql
-- Forzar recarga del schema de PostgREST
NOTIFY pgrst, 'reload schema';
```

Este comando envía una señal al servicio PostgREST para que recargue su caché de funciones y tablas.

---

## Pasos

### Paso 1: Ejecutar NOTIFY
Crear una migración mínima que envíe la señal de recarga.

### Paso 2: Esperar 10 segundos
Dar tiempo al servicio para procesar.

### Paso 3: Verificar
Probar la llamada RPC nuevamente.

---

## Alternativa si no funciona

Si el NOTIFY no resuelve (algunos hostings lo ignoran), puedo:
1. Hacer un cambio trivial a la función (agregar un comentario)
2. Esto fuerza a PostgreSQL a invalidar el caché

---

## Resultado Esperado

Después de ejecutar, tu script Python podrá llamar:
```python
supabase.rpc("unify_identity_v2", payload).execute()
```

Sin error 404.

