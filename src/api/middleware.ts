// SPDX-FileCopyrightText: 2026 The Linux Foundation
//
// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import { Request, Response, NextFunction } from "express";
import { RetryOctokit } from "./octokit.js";

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
}

export interface AuthRequest extends Request {
  user?: GitHubUser;
  /** The raw Bearer token supplied by the caller. */
  token?: string;
}

// Simple in-memory token → user cache to avoid hitting the GitHub API on
// every authenticated request.  Entries expire after 2 minutes.
// Keys are SHA-256 hashes of the raw token so plaintext tokens are never
// held in long-lived memory.
interface CacheEntry {
  user: GitHubUser;
  expiresAt: number;
}
const tokenCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1_000;

/** Hash a token with SHA-256 for use as a cache key. */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Verify the GitHub Bearer token in the Authorization header.
 * On success, attaches `req.user` and `req.token`.
 */
export async function authenticateUser(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authorization header required (Bearer <github_token>)" });
    return;
  }

  const token = authHeader.slice(7);
  const tokenKey = hashToken(token);

  // Serve from cache first.
  const cached = tokenCache.get(tokenKey);
  if (cached && cached.expiresAt > Date.now()) {
    req.user = cached.user;
    req.token = token;
    next();
    return;
  }

  // Validate against GitHub API.
  try {
    const octokit = new RetryOctokit({ auth: token });
    const { data } = await octokit.users.getAuthenticated();

    const user: GitHubUser = {
      id: data.id,
      login: data.login,
      name: data.name ?? null,
      email: data.email ?? null,
    };

    tokenCache.set(tokenKey, { user, expiresAt: Date.now() + CACHE_TTL_MS });

    // Prune stale entries once the cache gets large.
    if (tokenCache.size > 500) {
      const now = Date.now();
      for (const [k, v] of tokenCache) {
        if (v.expiresAt < now) tokenCache.delete(k);
      }
    }

    req.user = user;
    req.token = token;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired GitHub token" });
  }
}
