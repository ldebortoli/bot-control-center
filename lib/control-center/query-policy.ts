export interface QueryCheck {
  safe: boolean;
  message: string;
}

const allowedStart = /^(select|with|explain)\b/i;
const blockedKeyword = /\b(insert|update|delete|replace|create|alter|drop|attach|detach|vacuum|reindex|analyze|pragma|load_extension)\b/i;

export function validateReadonlyQuery(input: string): QueryCheck {
  const query = input.trim().replace(/;\s*$/, "");

  if (!query) {
    return { safe: false, message: "Escribí una consulta antes de ejecutarla." };
  }

  if (query.includes(";")) {
    return { safe: false, message: "Solo se permite una sentencia por ejecución." };
  }

  if (!allowedStart.test(query)) {
    return { safe: false, message: "Solo se permiten SELECT, WITH y EXPLAIN." };
  }

  if (blockedKeyword.test(query)) {
    return { safe: false, message: "La consulta contiene una operación no permitida." };
  }

  return { safe: true, message: "Consulta validada en modo de solo lectura." };
}
