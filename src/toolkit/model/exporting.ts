// Copy and file export. Inside claude.ai the page asks the viewer through the
// `downloads` capability; elsewhere (local dev) it falls back to a normal
// browser download.

type DownloadsNs = { save: (r: { filename: string; data: string }) => Promise<unknown> };
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
export async function saveFile(filename: string, data: string): Promise<'saved' | 'declined' | 'unavailable'> {
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
    const url = URL.createObjectURL(new Blob([data], { type: 'text/plain;charset=utf-8' }));
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
