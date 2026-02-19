// IMPORTANT: Load environment variables BEFORE importing tracing
import dotenv from 'dotenv';
dotenv.config();

// Initialize OpenTelemetry instrumentation BEFORE importing any other modules
// This ensures all HTTP, Express, and database calls are automatically traced
import './tracing';

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import db from './database';
import { rsvpSchema, musicSuggestionSchema, madridRsvpSchema, RsvpInput, MusicSuggestionInput, MadridRsvpInput } from './schemas';
import { ZodError } from 'zod';
import { requireApiKey } from './middleware/auth';
import { postRateLimiter } from './middleware/rateLimit';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:8080', 'http://localhost:5173'],
  methods: ['GET', 'POST'],
  credentials: true,
}));

// Error handling middleware
const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: 'Validation error',
      details: err.issues,
    });
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
};

// OTLP proxy for frontend traces (browsers can't send directly due to CORS)
app.post('/api/otlp/v1/traces', async (req: Request, res: Response) => {
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const otlpHeaders = process.env.OTLP_HEADERS;

  if (!otlpEndpoint) {
    return res.status(503).json({ error: 'OTLP endpoint not configured' });
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(otlpHeaders ? JSON.parse(otlpHeaders) : {}),
    };

    const response = await fetch(`${otlpEndpoint}/v1/traces`, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body),
    });

    res.status(response.status).send(await response.text());
  } catch (err) {
    console.error('OTLP proxy error:', err);
    res.status(502).json({ error: 'Failed to forward traces' });
  }
});

// Health check endpoint
app.get('/api/health', requireApiKey, (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// POST /api/rsvp - Submit RSVP
app.post('/api/rsvp', postRateLimiter, (req: Request, res: Response, next: NextFunction) => {
  try {
    const data: RsvpInput = rsvpSchema.parse(req.body);

    const stmt = db.prepare(`
      INSERT INTO rsvp (name, can_attend, dietary_restrictions, where_staying)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.name,
      data.canAttend ? 1 : 0,
      data.dietaryRestrictions || null,
      data.whereStaying || null
    );

    console.log(`RSVP received: ${data.name} - ${data.canAttend ? 'Attending' : 'Not attending'}`);

    res.status(201).json({
      success: true,
      message: 'RSVP submitted successfully',
      id: result.lastInsertRowid,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/rsvp - Get all RSVPs (for admin purposes)
app.get('/api/rsvp', requireApiKey, (req: Request, res: Response) => {
  const stmt = db.prepare('SELECT * FROM rsvp ORDER BY created_at DESC');
  const rsvps = stmt.all();

  // Convert can_attend from integer to boolean
  const formattedRsvps = rsvps.map((rsvp: any) => ({
    id: rsvp.id,
    name: rsvp.name,
    canAttend: rsvp.can_attend === 1,
    dietaryRestrictions: rsvp.dietary_restrictions,
    whereStaying: rsvp.where_staying,
    createdAt: rsvp.created_at,
  }));

  res.json({
    success: true,
    data: formattedRsvps,
    total: formattedRsvps.length,
    attending: formattedRsvps.filter((r: any) => r.canAttend).length,
    notAttending: formattedRsvps.filter((r: any) => !r.canAttend).length,
  });
});

// POST /api/music-suggestions - Submit a music suggestion
app.post('/api/music-suggestions', postRateLimiter, (req: Request, res: Response, next: NextFunction) => {
  try {
    const data: MusicSuggestionInput = musicSuggestionSchema.parse(req.body);

    const stmt = db.prepare(`
      INSERT INTO music_suggestions (song_name, artist, link)
      VALUES (?, ?, ?)
    `);

    const result = stmt.run(
      data.songName,
      data.artist,
      data.link || null
    );

    console.log(`Music suggestion received: "${data.songName}" by ${data.artist}`);

    res.status(201).json({
      success: true,
      message: 'Music suggestion submitted successfully',
      id: result.lastInsertRowid,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/music-suggestions - Get all music suggestions
app.get('/api/music-suggestions', requireApiKey, (req: Request, res: Response) => {
  const stmt = db.prepare('SELECT * FROM music_suggestions ORDER BY created_at DESC');
  const suggestions = stmt.all();

  const formattedSuggestions = suggestions.map((s: any) => ({
    id: s.id,
    songName: s.song_name,
    artist: s.artist,
    link: s.link,
    createdAt: s.created_at,
  }));

  res.json({
    success: true,
    data: formattedSuggestions,
    total: formattedSuggestions.length,
  });
});

// POST /api/madrid/rsvp - Submit Madrid event RSVP
app.post('/api/madrid/rsvp', postRateLimiter, (req: Request, res: Response, next: NextFunction) => {
  try {
    const data: MadridRsvpInput = madridRsvpSchema.parse(req.body);

    const stmt = db.prepare(`
      INSERT INTO madrid_rsvp (name, can_attend, dietary_restrictions, companions)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.name,
      data.canAttend ? 1 : 0,
      data.dietaryRestrictions || null,
      data.companions || null
    );

    console.log(`Madrid RSVP received: ${data.name} - ${data.canAttend ? 'Attending' : 'Not attending'}`);

    res.status(201).json({
      success: true,
      message: 'RSVP submitted successfully',
      id: result.lastInsertRowid,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/madrid/rsvp - Get all Madrid event RSVPs (for admin purposes)
app.get('/api/madrid/rsvp', requireApiKey, (req: Request, res: Response) => {
  const stmt = db.prepare('SELECT * FROM madrid_rsvp ORDER BY created_at DESC');
  const rsvps = stmt.all();

  const formattedRsvps = rsvps.map((rsvp: any) => ({
    id: rsvp.id,
    name: rsvp.name,
    canAttend: rsvp.can_attend === 1,
    dietaryRestrictions: rsvp.dietary_restrictions,
    companions: rsvp.companions,
    createdAt: rsvp.created_at,
  }));

  res.json({
    success: true,
    data: formattedRsvps,
    total: formattedRsvps.length,
    attending: formattedRsvps.filter((r: any) => r.canAttend).length,
    notAttending: formattedRsvps.filter((r: any) => !r.canAttend).length,
  });
});

// POST /api/madrid/music-suggestions - Submit a Madrid event music suggestion
app.post('/api/madrid/music-suggestions', postRateLimiter, (req: Request, res: Response, next: NextFunction) => {
  try {
    const data: MusicSuggestionInput = musicSuggestionSchema.parse(req.body);

    const stmt = db.prepare(`
      INSERT INTO madrid_music_suggestions (song_name, artist, link)
      VALUES (?, ?, ?)
    `);

    const result = stmt.run(
      data.songName,
      data.artist,
      data.link || null
    );

    console.log(`Madrid music suggestion received: "${data.songName}" by ${data.artist}`);

    res.status(201).json({
      success: true,
      message: 'Music suggestion submitted successfully',
      id: result.lastInsertRowid,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/madrid/music-suggestions - Get all Madrid event music suggestions
app.get('/api/madrid/music-suggestions', requireApiKey, (req: Request, res: Response) => {
  const stmt = db.prepare('SELECT * FROM madrid_music_suggestions ORDER BY created_at DESC');
  const suggestions = stmt.all();

  const formattedSuggestions = suggestions.map((s: any) => ({
    id: s.id,
    songName: s.song_name,
    artist: s.artist,
    link: s.link,
    createdAt: s.created_at,
  }));

  res.json({
    success: true,
    data: formattedSuggestions,
    total: formattedSuggestions.length,
  });
});

// Apply error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Wedding backend server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

export default app;
