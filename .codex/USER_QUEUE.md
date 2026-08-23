# Pendientes

- [2026-08-22] Auditar todas las pantallas de carga o `splash` bloqueantes de este proyecto. Desde su primer render, cada una debe ofrecer una `X` visible y funcional independiente de la UI principal, y `Esc` cuando corresponda. Al cerrarla debe cancelar o limpiar de forma segura el arranque o la espera administrados, sin dejar procesos huerfanos ni esperas indefinidas. Agregar validacion visual o automatizada; si una pantalla ya cumple, verificarla y documentarla sin duplicar controles.

- [2026-08-20] Aplicar la politica global de proteccion y privacidad GitHub sin interrumpir el trabajo actual: para cada remoto GitHub de este proyecto, auditar secretos y habilitar/verificar Secret Scanning y Push Protection cuando GitHub lo admita; configurar `user.email` local con el correo `noreply` de la cuenta autenticada sin cambiar `user.name`; evitar en archivos versionados rutas absolutas del perfil de Windows y correos personales, usando rutas relativas, variables o placeholders; no reescribir historial ni crear/reemplazar remotos solo por esta tarea. Registrar y validar el resultado o el bloqueo exacto.

- [2026-08-20] Adoptar la política global de CI: ejecutar validaciones locales y hacer push cuando corresponda, pero no esperar, mirar, sondear ni monitorear GitHub Actions u otra CI remota después del push salvo que el usuario lo pida explícitamente en la solicitud actual. Registrar esta convención estable en la memoria del proyecto; si el resultado de CI ya está disponible puede informarse, sin gastar tiempo ni tokens esperándolo.

# Procesadas

No hay pedidos procesados registrados.
