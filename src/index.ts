import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import db from './database';
import { rsvpSchema, musicSuggestionSchema, RsvpInput, MusicSuggestionInput } from './schemas';
import { ZodError } from 'zod';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(cors({
  origin: process.env.CORS_ORIGIN || ['http://localhost:8080', 'http://localhost:5173'],
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

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// POST /api/rsvp - Submit RSVP
app.post('/api/rsvp', (req: Request, res: Response, next: NextFunction) => {
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
app.get('/api/rsvp', (req: Request, res: Response) => {
  const stmt = db.prepare('SELECT * FROM rsvp ORDER BY created_at DESC');
  const rsvps = stmt.all();

  // Convert can_attend from integer to boolean
  const formattedRsvps = rsvps.map((rsvp: any) => ({
    ...rsvp,
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
app.post('/api/music-suggestions', (req: Request, res: Response, next: NextFunction) => {
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
app.get('/api/music-suggestions', (req: Request, res: Response) => {
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

// Apply error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Wedding backend server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

export default app;
