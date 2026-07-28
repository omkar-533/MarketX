import { apiFetch } from '../config/api';
import { loadAppSession } from './appInviteAuth';

export type KnowledgeDoc = {
  id: string;
  title: string;
  filename: string | null;
  sourceType: 'pdf' | 'text' | string;
  charCount: number;
  uploadedBy: string | null;
  createdAt: string;
};

function authHeaders(adminEmail?: string | null, adminPassword?: string | null): HeadersInit {
  const session = loadAppSession();
  if (session?.token && session.user.role === 'admin') {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`,
    };
  }
  if (adminEmail && adminPassword) {
    return {
      'Content-Type': 'application/json',
      'X-Admin-Email': adminEmail,
      'X-Admin-Password': adminPassword,
    };
  }
  return { 'Content-Type': 'application/json' };
}

export async function adminListKnowledge(
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<KnowledgeDoc[]> {
  const res = await apiFetch('/api/app-auth/admin/knowledge', {
    headers: authHeaders(adminEmail, adminPassword),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not load teachings');
  return (data.documents || []) as KnowledgeDoc[];
}

export async function adminUploadKnowledgePdf(
  input: { title: string; filename: string; pdfDataUrl: string },
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<KnowledgeDoc> {
  const res = await apiFetch('/api/app-auth/admin/knowledge', {
    method: 'POST',
    headers: authHeaders(adminEmail, adminPassword),
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not upload PDF');
  return data.document as KnowledgeDoc;
}

export async function adminUploadKnowledgeText(
  input: { title: string; text: string },
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<KnowledgeDoc> {
  const res = await apiFetch('/api/app-auth/admin/knowledge', {
    method: 'POST',
    headers: authHeaders(adminEmail, adminPassword),
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not save notes');
  return data.document as KnowledgeDoc;
}

export async function adminDeleteKnowledge(
  id: string,
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<void> {
  const res = await apiFetch(`/api/app-auth/admin/knowledge/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(adminEmail, adminPassword),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not delete teaching');
}

/** Read a PDF file as a data URL for upload. */
export function readPdfAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file || file.type !== 'application/pdf') {
      reject(new Error('Sirf PDF file choose karo'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('PDF max 8 MB'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result.startsWith('data:application/pdf')) {
        reject(new Error('Could not read PDF'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error('Could not read PDF'));
    reader.readAsDataURL(file);
  });
}
