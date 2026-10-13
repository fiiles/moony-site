import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Snapshots of repository documents, written by scripts/sync-content.mjs at a release tag.
const repo = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/repo' }),
  schema: z.object({ title: z.string(), sourceUrl: z.string().url(), tag: z.string(), fetchedAt: z.string() }),
});

export const collections = { repo };
