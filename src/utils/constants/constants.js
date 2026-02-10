export const BACKEND_URL = "http://localhost:8001";

export const GEO_IP_URL = `${BACKEND_URL}/api/geo`;

export const API_ENDPOINTS = {
  PROVIDER_URL: (providerId) => `${BACKEND_URL}/api/providers/${providerId}`,
  SUBMIT_PROOF: (sessionId) => `${BACKEND_URL}/session/${sessionId}/proof`,
  UPDATE_SESSION_STATUS: () => `${BACKEND_URL}/api/sdk/update/session/`,
  STATUS_URL: (sessionId) => `${BACKEND_URL}/api/sdk/session/${sessionId}`,
};
