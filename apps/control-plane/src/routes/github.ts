/**
 * GitHub routes — proxy GitHub API requests using PAT from vault.
 *
 * All routes protected by requireAuth (applied in index.ts).
 * GitHub PAT is decrypted from vault server-side — never sent to browser.
 */

import { Router, type Request, type Response } from 'express';
import type { Vault } from '../lib/vault';

export function createGitHubRouter(vault: Vault): Router {
  const router = Router();

  /** Get GitHub PAT from vault. */
  function getToken(): string | null {
    const cred = vault.getCredential('github-pat');
    return cred?.pat ?? null;
  }

  /** Make an authenticated GitHub API request. */
  async function ghFetch(path: string, token: string): Promise<Response> {
    return fetch(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(10_000),
    });
  }

  /**
   * GET /github/repos
   * Returns list of repos accessible to the PAT.
   */
  router.get('/repos', async (_req: Request, res: Response) => {
    const token = getToken();
    if (!token) {
      res.status(400).json({ error: 'GitHub PAT not configured. Save it in Settings > General.' });
      return;
    }

    try {
      const ghRes = await ghFetch('/user/repos?sort=updated&per_page=30', token);
      if (!ghRes.ok) throw new Error(`GitHub API: ${ghRes.status}`);
      const repos = await ghRes.json() as Array<{ full_name: string; description: string | null; private: boolean; updated_at: string }>;
      res.json({
        repos: repos.map(r => ({
          fullName: r.full_name,
          description: r.description,
          private: r.private,
          updatedAt: r.updated_at,
        })),
      });
    } catch (err) {
      console.error('[GitHub] Error fetching repos:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch repos' });
    }
  });

  /**
   * GET /github/pulls?owner=x&repo=y
   */
  router.get('/pulls', async (req: Request, res: Response) => {
    const { owner, repo } = req.query as { owner?: string; repo?: string };
    if (!owner || !repo) {
      res.status(400).json({ error: 'Missing owner or repo query param' });
      return;
    }

    const token = getToken();
    if (!token) {
      res.status(400).json({ error: 'GitHub PAT not configured' });
      return;
    }

    try {
      const ghRes = await ghFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&per_page=30`, token);
      if (!ghRes.ok) throw new Error(`GitHub API: ${ghRes.status}`);
      const pulls = await ghRes.json() as Array<{
        number: number; title: string; user: { login: string };
        head: { ref: string; sha: string }; base: { ref: string };
        created_at: string; updated_at: string;
      }>;
      res.json({
        pulls: pulls.map(pr => ({
          number: pr.number,
          title: pr.title,
          author: pr.user.login,
          branch: pr.head.ref,
          base: pr.base.ref,
          sha: pr.head.sha,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
        })),
      });
    } catch (err) {
      console.error('[GitHub] Error fetching pulls:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch pulls' });
    }
  });

  /**
   * GET /github/pull?owner=x&repo=y&number=n
   * Returns PR details including diff stats.
   */
  router.get('/pull', async (req: Request, res: Response) => {
    const { owner, repo, number } = req.query as { owner?: string; repo?: string; number?: string };
    if (!owner || !repo || !number) {
      res.status(400).json({ error: 'Missing owner, repo, or number query param' });
      return;
    }

    const token = getToken();
    if (!token) {
      res.status(400).json({ error: 'GitHub PAT not configured' });
      return;
    }

    try {
      const prPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(number)}`;

      // Fetch PR details and files in parallel
      const [prRes, filesRes] = await Promise.all([
        ghFetch(prPath, token),
        ghFetch(`${prPath}/files?per_page=100`, token),
      ]);

      if (!prRes.ok) throw new Error(`GitHub API (PR): ${prRes.status}`);
      if (!filesRes.ok) throw new Error(`GitHub API (files): ${filesRes.status}`);

      const pr = await prRes.json() as {
        number: number; title: string; body: string | null;
        user: { login: string }; head: { ref: string; sha: string };
        base: { ref: string }; additions: number; deletions: number;
        changed_files: number; created_at: string;
      };
      const files = await filesRes.json() as Array<{
        filename: string; additions: number; deletions: number; status: string;
      }>;

      res.json({
        number: pr.number,
        title: pr.title,
        body: pr.body,
        author: pr.user.login,
        branch: pr.head.ref,
        base: pr.base.ref,
        sha: pr.head.sha,
        additions: pr.additions,
        deletions: pr.deletions,
        filesChanged: pr.changed_files,
        createdAt: pr.created_at,
        files: files.map(f => ({
          path: f.filename,
          additions: f.additions,
          deletions: f.deletions,
          status: f.status,
        })),
      });
    } catch (err) {
      console.error('[GitHub] Error fetching PR:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch PR' });
    }
  });

  return router;
}
