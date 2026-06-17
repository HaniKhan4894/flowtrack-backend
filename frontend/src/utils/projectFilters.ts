import type { Client } from '../api/clientService';
import type { Project } from '../api/projectService';

export function filterProjectsForClient(
  projects: Project[],
  clients: Client[],
  clientId: string,
): Project[] {
  if (!clientId) {
    return projects;
  }

  const client = clients.find((c) => String(c.id) === clientId);
  const byClientId = projects.filter((p) => String(p.client_id ?? '') === clientId);
  if (byClientId.length > 0) {
    return byClientId;
  }

  if (client?.name) {
    const normalized = client.name.trim().toLowerCase();
    const byName = projects.filter(
      (p) => (p.client_name ?? '').trim().toLowerCase() === normalized,
    );
    if (byName.length > 0) {
      return byName;
    }
  }

  // Projects often only have client_name, not client_id — show all rather than an empty list.
  return projects;
}
