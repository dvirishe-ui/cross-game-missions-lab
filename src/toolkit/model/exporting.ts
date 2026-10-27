// Copy and file export. Inside claude.ai the page asks the viewer through the
// `downloads` capability; elsewhere (local dev) it falls back to a normal
// browser download.

type DownloadsNs = { save: (r: { filename: string; data: string | Uint8Array }) => Promise<unknown> };
type ClaudeWin = { claude?: { use?: (name: string) => Promise<unknown> } };

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** 'saved' | 'declined' | 'unavailable' */
export async function saveFile(filename: string, data: string | Uint8Array, mime = 'text/plain;charset=utf-8'): Promise<'saved' | 'declined' | 'unavailable'> {
  const w = window as unknown as ClaudeWin;
  if (w.claude?.use) {
    try {
      const downloads = (await w.claude.use('downloads')) as DownloadsNs | null;
      if (!downloads) return 'unavailable';
      await downloads.save({ filename, data });
      return 'saved';
    } catch (e) {
      return (e as { code?: string })?.code === 'declined' ? 'declined' : 'unavailable';
    }
  }
  try {
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'saved';
  } catch {
    return 'unavailable';
  }
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'promotion';

type McpNs = { callTool: (server: string, tool: string, input: unknown) => Promise<{ payload?: unknown }> };
export type SheetResult = { ok: true; url: string | null } | { ok: false; reason: string };

/**
 * Uploads an .xlsx to the viewer's Google Drive through their Google Drive
 * connector; Drive converts it to a Google Sheet. Runs only on a click.
 */
export async function saveToGoogleSheets(title: string, base64: string): Promise<SheetResult> {
  const w = window as unknown as ClaudeWin;
  const mcp = w.claude?.use ? ((await w.claude.use('mcp').catch(() => null)) as McpNs | null) : null;
  if (!mcp) return { ok: false, reason: 'Google Sheets saving works when this page is open in claude.ai. Use Download Excel and open it in Google Sheets.' };
  try {
    const r = await mcp.callTool('Google Drive', 'create_file', {
      title,
      base64Content: base64,
      contentMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const f = (r.payload ?? {}) as Record<string, unknown>;
    const link = [f.webViewLink, f.alternateLink, f.url, f.link].find((x) => typeof x === 'string') as string | undefined;
    const id = typeof f.id === 'string' ? f.id : null;
    return { ok: true, url: link ?? (id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null) };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    const reasons: Record<string, string> = {
      server_not_connected: 'Google Drive is not connected. Add it in claude.ai Settings → Connectors, then try again.',
      needs_reauth: 'Google Drive needs reconnecting in claude.ai Settings → Connectors.',
      selection_required: 'Choose which Google Drive connector to use when claude.ai asks, then try again.',
      not_in_manifest: 'Google Drive is turned off for this page. Allow it in the page’s permissions to save sheets.',
      approval_required: 'Saving to Google Drive needs your approval. Try again and allow it when claude.ai asks.',
      blocked_by_policy: 'Your organisation blocks saving to Google Drive from this page.',
      tool_error: 'Google Drive refused the file. Use Download Excel instead.',
      not_granted: 'Google Sheets saving is not available in this view. Use Download Excel.',
      capability_disabled: 'Google Sheets saving is not available in this view. Use Download Excel.',
    };
    return { ok: false, reason: reasons[code ?? ''] ?? 'The sheet may or may not have been created. Check your Google Drive before trying again.' };
  }
}
