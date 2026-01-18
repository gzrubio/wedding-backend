import { z } from 'zod';

export const rsvpSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  canAttend: z.boolean(),
  dietaryRestrictions: z.string().max(1000).nullable().optional(),
  whereStaying: z.string().max(500).nullable().optional(),
});

export const musicSuggestionSchema = z.object({
  songName: z.string().min(1, 'Song name is required').max(300),
  artist: z.string().min(1, 'Artist is required').max(300),
  link: z.string().url().max(500).nullable().optional().or(z.literal('')),
});

export type RsvpInput = z.infer<typeof rsvpSchema>;
export type MusicSuggestionInput = z.infer<typeof musicSuggestionSchema>;
