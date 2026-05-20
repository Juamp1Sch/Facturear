/**
 * ApiSigma auth (Manual Desarrollador SIG):
 * 1) Header X-Auth-Token con el token.
 * 2) Alternativa: login con usuario "Token" y clave = token (no usado en server-to-server).
 */
export function buildIntegrationAuthHeaders(userToken: string): Record<string, string> {
  return {
    "X-Auth-Token": userToken.trim(),
  };
}
